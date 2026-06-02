import { canonicalize, sha256Hex } from '../canonical.js'

export const FILESYSTEM_AEO_REQUIRED_KEYS = ["finality", "intent", "scope", "target", "validation"] as const

export type FilesystemAEOIntent = {
  readonly action: string
  readonly purpose: string
}

export type FilesystemAEOScope = {
  readonly repo: string
  readonly root: string
  readonly allowed_paths: readonly string[]
  readonly denied_paths: readonly string[]
  readonly allowed_operations: readonly string[]
  readonly denied_operations: readonly string[]
  readonly max_files: number
  readonly max_diff_lines: number
}

export type FilesystemAEOValidation = {
  readonly decision_id: string
  readonly authority_lineage_hash: string
  readonly policy_id: string
  readonly policy_hash: string
  readonly canonicalization: string
  readonly pre_write_hash: string
  readonly proposed_diff_hash: string
  readonly aeo_hash_required: boolean
  readonly replay_nonce: string
  readonly requires_unused_nonce: boolean
  readonly requires_scope_match: boolean
  readonly requires_path_policy_match: boolean
  readonly requires_pre_write_hash_match: boolean
}

export type FilesystemAEOTarget = {
  readonly system: "filesystem"
  readonly operation: string
  readonly path: string
  readonly normalized_path_required: boolean
  readonly symlink_following_allowed: boolean
}

export type FilesystemAEOFinality = {
  readonly proof_required: boolean
  readonly proof_type: string
  readonly expected_result: string
  readonly proof_fields: readonly string[]
  readonly registry_required: boolean
  readonly reconciliation_required: boolean
  readonly replay_state_after_success: string
}

export type FilesystemAEO = {
  readonly intent: FilesystemAEOIntent
  readonly scope: FilesystemAEOScope
  readonly validation: FilesystemAEOValidation
  readonly target: FilesystemAEOTarget
  readonly finality: FilesystemAEOFinality
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string")
}

function validateIntent(v: unknown): FilesystemAEOIntent | null {
  if (!isPlainObject(v)) return null
  if (!isNonEmptyString(v.action)) return null
  if (!isNonEmptyString(v.purpose)) return null
  return { action: v.action, purpose: v.purpose }
}

function validateScope(v: unknown): FilesystemAEOScope | null {
  if (!isPlainObject(v)) return null
  if (!isNonEmptyString(v.repo)) return null
  if (!isNonEmptyString(v.root)) return null
  if (!isStringArray(v.allowed_paths)) return null
  if (!isStringArray(v.denied_paths)) return null
  if (!isStringArray(v.allowed_operations) || v.allowed_operations.length === 0) return null
  if (!isStringArray(v.denied_operations)) return null
  if (typeof v.max_files !== "number" || v.max_files < 1) return null
  if (typeof v.max_diff_lines !== "number" || v.max_diff_lines < 1) return null
  return {
    repo: v.repo,
    root: v.root,
    allowed_paths: v.allowed_paths,
    denied_paths: v.denied_paths,
    allowed_operations: v.allowed_operations,
    denied_operations: v.denied_operations,
    max_files: v.max_files,
    max_diff_lines: v.max_diff_lines,
  }
}

function validateValidation(v: unknown): FilesystemAEOValidation | null {
  if (!isPlainObject(v)) return null
  if (!isNonEmptyString(v.decision_id)) return null
  if (!isNonEmptyString(v.authority_lineage_hash)) return null
  if (!isNonEmptyString(v.policy_id)) return null
  if (!isNonEmptyString(v.policy_hash)) return null
  if (!isNonEmptyString(v.canonicalization)) return null
  if (!isNonEmptyString(v.pre_write_hash)) return null
  if (!isNonEmptyString(v.proposed_diff_hash)) return null
  if (typeof v.aeo_hash_required !== "boolean") return null
  if (!isNonEmptyString(v.replay_nonce)) return null
  if (typeof v.requires_unused_nonce !== "boolean") return null
  if (typeof v.requires_scope_match !== "boolean") return null
  if (typeof v.requires_path_policy_match !== "boolean") return null
  if (typeof v.requires_pre_write_hash_match !== "boolean") return null
  return {
    decision_id: v.decision_id,
    authority_lineage_hash: v.authority_lineage_hash,
    policy_id: v.policy_id,
    policy_hash: v.policy_hash,
    canonicalization: v.canonicalization,
    pre_write_hash: v.pre_write_hash,
    proposed_diff_hash: v.proposed_diff_hash,
    aeo_hash_required: v.aeo_hash_required,
    replay_nonce: v.replay_nonce,
    requires_unused_nonce: v.requires_unused_nonce,
    requires_scope_match: v.requires_scope_match,
    requires_path_policy_match: v.requires_path_policy_match,
    requires_pre_write_hash_match: v.requires_pre_write_hash_match,
  }
}

function validateTarget(v: unknown): FilesystemAEOTarget | null {
  if (!isPlainObject(v)) return null
  if (v.system !== "filesystem") return null
  if (!isNonEmptyString(v.operation)) return null
  if (!isNonEmptyString(v.path)) return null
  if (typeof v.normalized_path_required !== "boolean") return null
  if (typeof v.symlink_following_allowed !== "boolean") return null
  return {
    system: "filesystem",
    operation: v.operation,
    path: v.path,
    normalized_path_required: v.normalized_path_required,
    symlink_following_allowed: v.symlink_following_allowed,
  }
}

function validateFinality(v: unknown): FilesystemAEOFinality | null {
  if (!isPlainObject(v)) return null
  if (typeof v.proof_required !== "boolean" || !v.proof_required) return null
  if (!isNonEmptyString(v.proof_type)) return null
  if (!isNonEmptyString(v.expected_result)) return null
  if (!isStringArray(v.proof_fields) || v.proof_fields.length === 0) return null
  if (typeof v.registry_required !== "boolean") return null
  if (typeof v.reconciliation_required !== "boolean") return null
  if (!isNonEmptyString(v.replay_state_after_success)) return null
  return {
    proof_required: v.proof_required,
    proof_type: v.proof_type,
    expected_result: v.expected_result,
    proof_fields: v.proof_fields,
    registry_required: v.registry_required,
    reconciliation_required: v.reconciliation_required,
    replay_state_after_success: v.replay_state_after_success,
  }
}

export type FilesystemAEOMaterializationFailure =
  | "missing_required_field"
  | "extra_field_present"
  | "authority_binding_missing"
  | "validator_eligibility_missing"
  | "canonical_hash_mismatch"
  | "lineage_reference_missing"
  | "invalid_field_type"

export type FilesystemAEOMaterializationResult =
  | { readonly ok: true; readonly aeo: FilesystemAEO; readonly aeo_hash: string }
  | { readonly ok: false; readonly failure: FilesystemAEOMaterializationFailure }

export function materializeFilesystemAEO(input: unknown): FilesystemAEOMaterializationResult {
  if (!isPlainObject(input)) {
    return { ok: false, failure: "missing_required_field" }
  }

  const keys = Object.keys(input).sort()
  if (keys.length !== FILESYSTEM_AEO_REQUIRED_KEYS.length) {
    const failure = keys.length > FILESYSTEM_AEO_REQUIRED_KEYS.length
      ? "extra_field_present"
      : "missing_required_field"
    return { ok: false, failure }
  }
  for (let i = 0; i < FILESYSTEM_AEO_REQUIRED_KEYS.length; i++) {
    if (keys[i] !== FILESYSTEM_AEO_REQUIRED_KEYS[i]) {
      return { ok: false, failure: keys.length > FILESYSTEM_AEO_REQUIRED_KEYS.length ? "extra_field_present" : "missing_required_field" }
    }
  }

  const intent = validateIntent(input.intent)
  if (!intent) return { ok: false, failure: "invalid_field_type" }

  const scope = validateScope(input.scope)
  if (!scope) return { ok: false, failure: "invalid_field_type" }

  const validation = validateValidation(input.validation)
  if (!validation) return { ok: false, failure: "authority_binding_missing" }

  if (!isNonEmptyString(validation.decision_id) || !isNonEmptyString(validation.authority_lineage_hash)) {
    return { ok: false, failure: "authority_binding_missing" }
  }

  if (!isNonEmptyString(validation.replay_nonce)) {
    return { ok: false, failure: "validator_eligibility_missing" }
  }

  const target = validateTarget(input.target)
  if (!target) return { ok: false, failure: "invalid_field_type" }

  const finality = validateFinality(input.finality)
  if (!finality) return { ok: false, failure: "invalid_field_type" }

  const aeo: FilesystemAEO = Object.freeze({ intent, scope, validation, target, finality })
  const aeo_hash = "sha256:" + sha256Hex(canonicalize(aeo))

  return { ok: true, aeo, aeo_hash }
}

export function computeFilesystemAEOHash(aeo: FilesystemAEO): string {
  return "sha256:" + sha256Hex(canonicalize(aeo))
}

export const CANONICAL_FILESYSTEM_AEO_FIXTURE: FilesystemAEO = Object.freeze({
  intent: Object.freeze({ action: "modify_file", purpose: "bounded repository file mutation" }),
  scope: Object.freeze({
    repo: "mindshift-demo",
    root: "repository",
    allowed_paths: ["src/**", "tests/**", "docs/**"],
    denied_paths: [".github/workflows/**", "wrangler.toml", ".env*", "secrets/**", "package-lock.json"],
    allowed_operations: ["create", "modify"],
    denied_operations: ["delete", "chmod", "rename", "symlink"],
    max_files: 1,
    max_diff_lines: 300,
  }),
  validation: Object.freeze({
    decision_id: "AUTH-fixture-001",
    authority_lineage_hash: "sha256:fixture-authority-lineage-hash",
    policy_id: "filesystem-write-policy-v1",
    policy_hash: "sha256:fixture-policy-hash",
    canonicalization: "json-canonical-v1",
    pre_write_hash: "sha256:fixture-pre-write-hash",
    proposed_diff_hash: "sha256:fixture-diff-hash",
    aeo_hash_required: true,
    replay_nonce: "fixture-nonce-001",
    requires_unused_nonce: true,
    requires_scope_match: true,
    requires_path_policy_match: true,
    requires_pre_write_hash_match: true,
  }),
  target: Object.freeze({
    system: "filesystem" as const,
    operation: "modify",
    path: "src/example.ts",
    normalized_path_required: true,
    symlink_following_allowed: false,
  }),
  finality: Object.freeze({
    proof_required: true,
    proof_type: "filesystem_mutation_receipt",
    expected_result: "single_bounded_file_mutation",
    proof_fields: [
      "decision_id",
      "aeo_hash",
      "target_path",
      "operation",
      "pre_write_hash",
      "post_write_hash",
      "diff_hash",
      "execution_id",
      "timestamp",
    ],
    registry_required: true,
    reconciliation_required: true,
    replay_state_after_success: "CONSUMED",
  }),
})
