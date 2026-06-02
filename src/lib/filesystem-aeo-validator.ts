import type { FilesystemAEO } from './filesystem-aeo.js'
import { FILESYSTEM_AEO_REQUIRED_KEYS } from './filesystem-aeo.js'
import { canonicalize, sha256Hex } from '../canonical.js'

export type ObservationError =
  | "NOT_FOUND"
  | "READ_DENIED"
  | "AMBIGUOUS_PATH"
  | "SYMLINK_BLOCKED"
  | "IO_ERROR"
  | "UNSUPPORTED_ENCODING"
  | "OUTSIDE_SCOPE"
  | "TIMEOUT"
  | "REGISTRY_MISS"
  | "LINEAGE_MISMATCH"
  | "POLICY_MISS"
  | "REPLAY_STATE_UNKNOWN"

export type ObservationResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false
      readonly observation_error: ObservationError
      readonly topology_visible: boolean
      readonly safe_to_disclose: boolean
    }

export type DecisionRecord = {
  readonly decision_id: string
  readonly status: string
  readonly authority_lineage_hash: string
  readonly scope: string
  readonly expires_at: string | null
}

export type AuthorityLineageRecord = {
  readonly lineage_hash: string
  readonly status: string
}

export type PolicyRecord = {
  readonly policy_id: string
  readonly policy_hash: string
  readonly allowed_paths: readonly string[]
  readonly denied_paths: readonly string[]
  readonly allowed_operations: readonly string[]
  readonly denied_operations: readonly string[]
  readonly max_files: number
  readonly max_diff_lines: number
}

export type ReplayState = "UNUSED" | "RESERVED" | "CONSUMED" | "INVALIDATED"

export type AeoReplayState = "UNUSED" | "CONSUMED" | "INVALIDATED"

export type NormalizedPath = string & { readonly __brand: "NormalizedPath" }

export type FileHash = string & { readonly __brand: "FileHash" }

export type FileMetadata = {
  readonly exists: boolean
  readonly is_symlink: boolean
}

export type CanonicalDiff = {
  readonly content: string
}

export type DiffHash = string & { readonly __brand: "DiffHash" }

export type DiffInspectionResult = {
  readonly applicable: boolean
  readonly post_write_hash: string
}

export interface ReadonlyAuthorityRegistry {
  readDecision(decisionId: string): Promise<ObservationResult<DecisionRecord>>
  readAuthorityLineage(decisionId: string): Promise<ObservationResult<AuthorityLineageRecord>>
}

export interface ReadonlyPolicyRegistry {
  readPolicy(policyId: string): Promise<ObservationResult<PolicyRecord>>
  readPolicyHash(policyId: string): Promise<ObservationResult<string>>
}

export interface ReadonlyReplayRegistry {
  readNonceState(replayNonce: string): Promise<ObservationResult<ReplayState>>
  readAeoState(aeoHash: string): Promise<ObservationResult<AeoReplayState>>
}

export interface ReadonlyFilesystemAdapter {
  normalizePath(path: string): ObservationResult<NormalizedPath>
  readHash(path: NormalizedPath): Promise<ObservationResult<FileHash>>
  readMetadata(path: NormalizedPath): Promise<ObservationResult<FileMetadata>>
}

export interface ReadonlyDiffInspector {
  hashDiff(diff: CanonicalDiff): ObservationResult<DiffHash>
  inspectApplicability(input: {
    preWriteHash: string
    targetPath: string
    diff: CanonicalDiff
  }): Promise<ObservationResult<DiffInspectionResult>>
}

export interface ReadonlyClock {
  now(): ObservationResult<string>
}

export interface FilesystemValidatorContext {
  readonly authorityRegistry: ReadonlyAuthorityRegistry
  readonly policyRegistry: ReadonlyPolicyRegistry
  readonly replayRegistry: ReadonlyReplayRegistry
  readonly filesystem: ReadonlyFilesystemAdapter
  readonly diffInspector: ReadonlyDiffInspector
  readonly clock: ReadonlyClock
}

export type DenialResult = {
  readonly denial_reason: string
  readonly failure_class: string
  readonly mutation_performed: false
  readonly retry_same_aeo_allowed: boolean
  readonly required_agent_action?: string
  readonly aeo_hash?: string
  readonly decision_id?: string
  readonly adapter_observation?: {
    readonly adapter: string
    readonly observation_error: string
    readonly safe_to_disclose: boolean
  }
}

export type ValidatorResult =
  | { readonly result: "VALID"; readonly denial_result: null; readonly aeo_hash: string }
  | { readonly result: "NULL"; readonly denial_result: DenialResult }

function nullResult(denial: DenialResult): ValidatorResult {
  return { result: "NULL", denial_result: denial }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function matchesGlob(path: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3)
    return path === prefix || path.startsWith(prefix + "/")
  }
  if (pattern.startsWith("*.")) {
    return path.endsWith(pattern.slice(1))
  }
  if (pattern.includes("*")) {
    const re = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$")
    return re.test(path)
  }
  return path === pattern
}

function pathMatchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => matchesGlob(path, p))
}

function pathIsInsideRoot(normalizedPath: string): boolean {
  return !normalizedPath.startsWith("../") && normalizedPath !== ".."
}

export async function validateFilesystemAEO(
  input: unknown,
  context: FilesystemValidatorContext,
  aeoHashOverride?: string
): Promise<ValidatorResult> {
  // Step 1: Structural shape
  if (!isPlainObject(input)) {
    return nullResult({
      denial_reason: "INVALID_AEO_SHAPE",
      failure_class: "INVALID_AEO_SHAPE",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
    })
  }

  const keys = Object.keys(input).sort()
  if (keys.length !== FILESYSTEM_AEO_REQUIRED_KEYS.length) {
    return nullResult({
      denial_reason: keys.length > FILESYSTEM_AEO_REQUIRED_KEYS.length ? "EXTRA_FIELD_PRESENT" : "MISSING_REQUIRED_FIELD",
      failure_class: "INVALID_AEO_SHAPE",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
    })
  }
  for (let i = 0; i < FILESYSTEM_AEO_REQUIRED_KEYS.length; i++) {
    if (keys[i] !== FILESYSTEM_AEO_REQUIRED_KEYS[i]) {
      return nullResult({
        denial_reason: "INVALID_AEO_SHAPE",
        failure_class: "INVALID_AEO_SHAPE",
        mutation_performed: false,
        retry_same_aeo_allowed: false,
      })
    }
  }

  const aeo = input as FilesystemAEO

  // Step 2: Canonicalization + AEO hash binding
  const aeo_hash = "sha256:" + sha256Hex(canonicalize(aeo))
  if (aeoHashOverride !== undefined && aeoHashOverride !== aeo_hash) {
    return nullResult({
      denial_reason: "AEO_HASH_MISMATCH",
      failure_class: "AEO_HASH_MISMATCH",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      aeo_hash,
    })
  }

  if (!isPlainObject(aeo.validation)) {
    return nullResult({
      denial_reason: "AUTHORITY_INVALID",
      failure_class: "AUTHORITY_INVALID",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
    })
  }
  const validation = aeo.validation as Record<string, unknown>
  const decision_id = typeof validation.decision_id === "string" ? validation.decision_id : null
  const policy_id = typeof validation.policy_id === "string" ? validation.policy_id : null
  const policy_hash = typeof validation.policy_hash === "string" ? validation.policy_hash : null
  const authority_lineage_hash = typeof validation.authority_lineage_hash === "string" ? validation.authority_lineage_hash : null
  const replay_nonce = typeof validation.replay_nonce === "string" ? validation.replay_nonce : null
  const pre_write_hash = typeof validation.pre_write_hash === "string" ? validation.pre_write_hash : null
  const proposed_diff_hash = typeof validation.proposed_diff_hash === "string" ? validation.proposed_diff_hash : null

  if (!decision_id || !authority_lineage_hash) {
    return nullResult({
      denial_reason: "AUTHORITY_INVALID",
      failure_class: "AUTHORITY_INVALID",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
    })
  }

  // Step 3: Authority lineage
  const decisionObs = await context.authorityRegistry.readDecision(decision_id)
  if (!decisionObs.ok) {
    return nullResult({
      denial_reason: "AUTHORITY_INVALID",
      failure_class: "AUTHORITY_INVALID",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
      adapter_observation: {
        adapter: "authorityRegistry",
        observation_error: decisionObs.observation_error,
        safe_to_disclose: decisionObs.safe_to_disclose,
      },
    })
  }

  const decision = decisionObs.value
  if (decision.status !== "ACTIVE") {
    return nullResult({
      denial_reason: "AUTHORITY_INVALID",
      failure_class: "AUTHORITY_INVALID",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  if (decision.authority_lineage_hash !== authority_lineage_hash) {
    return nullResult({
      denial_reason: "AUTHORITY_INVALID",
      failure_class: "AUTHORITY_LINEAGE_MISMATCH",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  // Step 4: Policy binding
  if (!policy_id || !policy_hash) {
    return nullResult({
      denial_reason: "POLICY_HASH_MISMATCH",
      failure_class: "POLICY_INVALID",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  const policyObs = await context.policyRegistry.readPolicy(policy_id)
  if (!policyObs.ok) {
    return nullResult({
      denial_reason: "POLICY_HASH_MISMATCH",
      failure_class: "POLICY_INVALID",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
      adapter_observation: {
        adapter: "policyRegistry",
        observation_error: policyObs.observation_error,
        safe_to_disclose: policyObs.safe_to_disclose,
      },
    })
  }

  const policy = policyObs.value
  if (policy.policy_hash !== policy_hash) {
    return nullResult({
      denial_reason: "POLICY_HASH_MISMATCH",
      failure_class: "POLICY_HASH_MISMATCH",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  // Step 5: Scope/path/operation policy
  if (!isPlainObject(aeo.target)) {
    return nullResult({
      denial_reason: "PATH_OR_OPERATION_NOT_ALLOWED",
      failure_class: "INVALID_TARGET",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }
  const target = aeo.target as Record<string, unknown>
  const targetPath = typeof target.path === "string" ? target.path : null
  const targetOperation = typeof target.operation === "string" ? target.operation : null

  if (!targetPath || !targetOperation) {
    return nullResult({
      denial_reason: "PATH_OR_OPERATION_NOT_ALLOWED",
      failure_class: "INVALID_TARGET",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  const normalizeResult = context.filesystem.normalizePath(targetPath)
  if (!normalizeResult.ok) {
    return nullResult({
      denial_reason: normalizeResult.observation_error === "AMBIGUOUS_PATH" ? "PATH_AMBIGUOUS" : "PATH_OR_OPERATION_NOT_ALLOWED",
      failure_class: "PATH_AMBIGUOUS",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
      adapter_observation: {
        adapter: "filesystem",
        observation_error: normalizeResult.observation_error,
        safe_to_disclose: normalizeResult.safe_to_disclose,
      },
    })
  }

  const normalizedPath = normalizeResult.value
  if (!pathIsInsideRoot(normalizedPath)) {
    return nullResult({
      denial_reason: "PATH_OR_OPERATION_NOT_ALLOWED",
      failure_class: "PATH_OUTSIDE_ROOT",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  if (!pathMatchesAny(normalizedPath, policy.allowed_paths)) {
    return nullResult({
      denial_reason: "PATH_OR_OPERATION_NOT_ALLOWED",
      failure_class: "PATH_NOT_ALLOWED",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  if (pathMatchesAny(normalizedPath, policy.denied_paths)) {
    return nullResult({
      denial_reason: "PATH_OR_OPERATION_NOT_ALLOWED",
      failure_class: "PATH_DENIED",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  if (!policy.allowed_operations.includes(targetOperation)) {
    return nullResult({
      denial_reason: "PATH_OR_OPERATION_NOT_ALLOWED",
      failure_class: "OPERATION_NOT_ALLOWED",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  if (policy.denied_operations.includes(targetOperation)) {
    return nullResult({
      denial_reason: "PATH_OR_OPERATION_NOT_ALLOWED",
      failure_class: "OPERATION_DENIED",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  // Step 6: Replay eligibility
  if (!replay_nonce) {
    return nullResult({
      denial_reason: "REPLAY_NOT_ALLOWED",
      failure_class: "REPLAY_NONCE_MISSING",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  const nonceObs = await context.replayRegistry.readNonceState(replay_nonce)
  if (!nonceObs.ok) {
    if (nonceObs.observation_error === "REPLAY_STATE_UNKNOWN") {
      return nullResult({
        denial_reason: "REPLAY_NOT_DETERMINABLE",
        failure_class: "REPLAY_STATE_UNKNOWN",
        mutation_performed: false,
        retry_same_aeo_allowed: false,
        decision_id,
        adapter_observation: {
          adapter: "replayRegistry",
          observation_error: nonceObs.observation_error,
          safe_to_disclose: nonceObs.safe_to_disclose,
        },
      })
    }
    return nullResult({
      denial_reason: "REPLAY_NOT_ALLOWED",
      failure_class: "REPLAY_STATE_UNKNOWN",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
      adapter_observation: {
        adapter: "replayRegistry",
        observation_error: nonceObs.observation_error,
        safe_to_disclose: nonceObs.safe_to_disclose,
      },
    })
  }

  if (nonceObs.value !== "UNUSED") {
    return nullResult({
      denial_reason: "REPLAY_NOT_ALLOWED",
      failure_class: "REPLAY_NONCE_CONSUMED_OR_RESERVED",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  const aeoStateObs = await context.replayRegistry.readAeoState(aeo_hash)
  if (aeoStateObs.ok && aeoStateObs.value !== "UNUSED") {
    return nullResult({
      denial_reason: "REPLAY_NOT_ALLOWED",
      failure_class: "AEO_ALREADY_CONSUMED",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
      aeo_hash,
    })
  }

  // Step 7: Runtime pre-state integrity
  if (!pre_write_hash) {
    return nullResult({
      denial_reason: "PRE_WRITE_HASH_MISSING",
      failure_class: "INVALID_VALIDATION",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  const fileHashObs = await context.filesystem.readHash(normalizedPath)
  if (!fileHashObs.ok) {
    if (fileHashObs.observation_error === "NOT_FOUND" && targetOperation === "create") {
      // create on non-existent file is valid — continue with absent pre-state semantics
    } else if (fileHashObs.observation_error === "NOT_FOUND") {
      return nullResult({
        denial_reason: "TARGET_PRESTATE_UNOBSERVABLE",
        failure_class: "TARGET_PRESTATE_UNOBSERVABLE",
        mutation_performed: false,
        retry_same_aeo_allowed: false,
        required_agent_action: "RE_MATERIALIZE_AEO_FROM_CURRENT_STATE",
        decision_id,
        adapter_observation: {
          adapter: "filesystem",
          observation_error: fileHashObs.observation_error,
          safe_to_disclose: fileHashObs.safe_to_disclose,
        },
      })
    } else if (fileHashObs.observation_error === "READ_DENIED") {
      return nullResult({
        denial_reason: "OBSERVATION_DENIED",
        failure_class: "OBSERVATION_DENIED",
        mutation_performed: false,
        retry_same_aeo_allowed: false,
        decision_id,
        adapter_observation: {
          adapter: "filesystem",
          observation_error: fileHashObs.observation_error,
          safe_to_disclose: fileHashObs.safe_to_disclose,
        },
      })
    } else if (fileHashObs.observation_error === "TIMEOUT") {
      return nullResult({
        denial_reason: "OBSERVATION_TIMEOUT",
        failure_class: "OBSERVATION_TIMEOUT",
        mutation_performed: false,
        retry_same_aeo_allowed: false,
        decision_id,
        adapter_observation: {
          adapter: "filesystem",
          observation_error: fileHashObs.observation_error,
          safe_to_disclose: fileHashObs.safe_to_disclose,
        },
      })
    } else {
      return nullResult({
        denial_reason: "OBSERVATION_UNAVAILABLE",
        failure_class: "OBSERVATION_UNAVAILABLE",
        mutation_performed: false,
        retry_same_aeo_allowed: false,
        decision_id,
        adapter_observation: {
          adapter: "filesystem",
          observation_error: fileHashObs.observation_error,
          safe_to_disclose: fileHashObs.safe_to_disclose,
        },
      })
    }
  } else {
    if (fileHashObs.value !== pre_write_hash) {
      return nullResult({
        denial_reason: "PRE_WRITE_HASH_MISMATCH",
        failure_class: "STALE_PRESTATE",
        mutation_performed: false,
        retry_same_aeo_allowed: false,
        required_agent_action: "RE_MATERIALIZE_AEO_FROM_CURRENT_STATE",
        decision_id,
        aeo_hash,
      })
    }
  }

  // Step 8: Diff integrity
  if (proposed_diff_hash) {
    // Diff inspection is only performed when a diff is declared
    const diffApplicabilityObs = await context.diffInspector.inspectApplicability({
      preWriteHash: pre_write_hash,
      targetPath: normalizedPath,
      diff: { content: proposed_diff_hash },
    })

    if (!diffApplicabilityObs.ok) {
      return nullResult({
        denial_reason: "DIFF_HASH_MISMATCH",
        failure_class: "DIFF_INSPECTION_FAILED",
        mutation_performed: false,
        retry_same_aeo_allowed: false,
        decision_id,
        adapter_observation: {
          adapter: "diffInspector",
          observation_error: diffApplicabilityObs.observation_error,
          safe_to_disclose: diffApplicabilityObs.safe_to_disclose,
        },
      })
    }

    if (!diffApplicabilityObs.value.applicable) {
      return nullResult({
        denial_reason: "DIFF_HASH_MISMATCH",
        failure_class: "DIFF_NOT_APPLICABLE",
        mutation_performed: false,
        retry_same_aeo_allowed: false,
        required_agent_action: "RE_MATERIALIZE_AEO_FROM_CURRENT_STATE",
        decision_id,
        aeo_hash,
      })
    }
  }

  // Step 9: Finality / proof requirement
  if (!isPlainObject(aeo.finality)) {
    return nullResult({
      denial_reason: "FINALITY_REQUIREMENT_INVALID",
      failure_class: "FINALITY_INVALID",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  const finality = aeo.finality as Record<string, unknown>
  if (finality.proof_required !== true) {
    return nullResult({
      denial_reason: "FINALITY_REQUIREMENT_INVALID",
      failure_class: "PROOF_NOT_REQUIRED",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  if (finality.registry_required !== true) {
    return nullResult({
      denial_reason: "FINALITY_REQUIREMENT_INVALID",
      failure_class: "REGISTRY_NOT_REQUIRED",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  if (finality.replay_state_after_success !== "CONSUMED") {
    return nullResult({
      denial_reason: "FINALITY_REQUIREMENT_INVALID",
      failure_class: "REPLAY_CONSUMED_NOT_DECLARED",
      mutation_performed: false,
      retry_same_aeo_allowed: false,
      decision_id,
    })
  }

  // Step 10: Eligibility decision
  return { result: "VALID", denial_result: null, aeo_hash }
}
