// Issue #1848: Bounded Agent Tool Gateway — filesystem write surface.
//
// Canonical flow:
//   agent proposes tool action
//   → captureFilesystemWriteATAO    (non-operative capture)
//   → compileFilesystemWriteAEO     (authority binding → AEO candidate)
//   → validateFilesystemAEO         (Ω validator: VALID | NULL)
//   → executeFilesystemWrite        (exact-object boundary: execute or NULL)
//   → FilesystemWriteExecutionProof (immutable proof artifact)
//
// Core invariants:
//   If no valid object exists → nothing happens
//   validated_object_hash == executed_object_hash
//   validated_content_hash == executed_content_hash
//
// Scoped to: filesystem write (single mutation-capable action)
// Non-goals: multi-tool orchestration, multi-agent routing, authority creation,
//   distributed convergence, cognition governance, LLM output as authority

import { canonicalize, sha256Hex } from '../canonical.js'
import type { FilesystemAEO } from './filesystem-aeo.js'
import { computeFilesystemAEOHash, PRE_WRITE_HASH_ABSENT } from './filesystem-aeo.js'

export { PRE_WRITE_HASH_ABSENT }

function isNonBlankString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

// ── ATAO: Agent Tool Action Object ────────────────────────────────────────────
// Captures the proposed filesystem write before any legitimacy exists.
// Non-operative: creates no authority, no execution eligibility.
// Does not create authority or execution eligibility.

export type FilesystemWriteATAO = {
  readonly atao_id: string
  readonly agent_id: string
  readonly session_id: string
  readonly intent: string
  readonly proposed_action: {
    readonly system: "filesystem"
    readonly action: "write_file"
    readonly parameters: {
      readonly path: string
      readonly content: string
    }
  }
  readonly scope: {
    readonly repo: string
    readonly root: string
  }
  readonly risk_class: "P2"
  readonly timestamp: string
  readonly creates_authority: false
  readonly creates_execution_eligibility: false
}

export type FilesystemWriteATAOInput = {
  readonly agent_id: string
  readonly session_id: string
  readonly intent: string
  readonly path: string
  readonly content: string
  readonly repo: string
  readonly root: string
  readonly timestamp: string
}

// captureFilesystemWriteATAO: forms an immutable, frozen ATAO from a proposed write.
// atao_id is the canonical sha256 of the ATAO body (excluding atao_id itself).
// Fails closed on null/missing/blank required fields.
// Does not create authority or execution eligibility.
export function captureFilesystemWriteATAO(
  input: FilesystemWriteATAOInput | null | undefined,
): FilesystemWriteATAO | null {
  if (!input) return null
  if (!isNonBlankString(input.agent_id)) return null
  if (!isNonBlankString(input.session_id)) return null
  if (!isNonBlankString(input.intent)) return null
  if (!isNonBlankString(input.path)) return null
  if (typeof input.content !== 'string') return null
  if (!isNonBlankString(input.repo)) return null
  if (!isNonBlankString(input.root)) return null
  if (!isNonBlankString(input.timestamp)) return null

  const ataoBody = {
    agent_id: input.agent_id,
    session_id: input.session_id,
    intent: input.intent,
    proposed_action: Object.freeze({
      system: "filesystem" as const,
      action: "write_file" as const,
      parameters: Object.freeze({
        path: input.path,
        content: input.content,
      }),
    }),
    scope: Object.freeze({
      repo: input.repo,
      root: input.root,
    }),
    risk_class: "P2" as const,
    timestamp: input.timestamp,
    creates_authority: false as const,
    creates_execution_eligibility: false as const,
  }

  // atao_id is the canonical hash of the body — identity and integrity in one
  const atao_id = "sha256:" + sha256Hex(canonicalize(ataoBody))

  return Object.freeze({
    atao_id,
    ...ataoBody,
  }) as FilesystemWriteATAO
}

// ── AEO Compilation: ATAO + Authority Binding → AEO Candidate ─────────────────
// Authority binding carries governance constraints from the authority layer.
// The compiled AEO is the exact candidate submitted to the Ω validator.
// Does not validate, execute, or produce proof.
// Compilation does not validate, execute, or produce proof.

export type FilesystemWriteATAOBinding = {
  readonly decision_id: string
  readonly authority_lineage_hash: string
  readonly policy_id: string
  readonly policy_hash: string
  readonly pre_write_hash: string
  readonly proposed_diff_hash: string
  readonly replay_nonce: string
  readonly allowed_paths: readonly string[]
  readonly denied_paths: readonly string[]
  readonly allowed_operations: readonly string[]
  readonly denied_operations: readonly string[]
  readonly max_files: number
  readonly max_diff_lines: number
}

// compileFilesystemWriteAEO: compiles an ATAO + authority binding into a FilesystemAEO.
// The compiled AEO carries the exact fields required by the Ω validator.
// content_hash binds the write payload to the validated object — it is impossible
// to validate one AEO and execute different ATAO content.
// Blank pre_write_hash is normalized to PRE_WRITE_HASH_ABSENT for create semantics.
// Fails closed on null/missing inputs, blank required binding fields,
// or empty allowed_paths / allowed_operations arrays.
// Does not validate, execute, or produce proof.
export function compileFilesystemWriteAEO(
  atao: FilesystemWriteATAO | null | undefined,
  binding: FilesystemWriteATAOBinding | null | undefined,
): FilesystemAEO | null {
  if (!atao) return null
  if (!binding) return null
  if (!isNonBlankString(binding.decision_id)) return null
  if (!isNonBlankString(binding.authority_lineage_hash)) return null
  if (!isNonBlankString(binding.policy_id)) return null
  if (!isNonBlankString(binding.policy_hash)) return null
  if (!isNonBlankString(binding.replay_nonce)) return null
  if (typeof binding.pre_write_hash !== 'string') return null
  if (typeof binding.proposed_diff_hash !== 'string') return null
  if (!Array.isArray(binding.allowed_paths) || binding.allowed_paths.length === 0) return null
  if (!Array.isArray(binding.allowed_operations) || binding.allowed_operations.length === 0) return null
  if (!Array.isArray(binding.denied_paths)) return null
  if (!Array.isArray(binding.denied_operations)) return null
  if (typeof binding.max_files !== 'number' || binding.max_files < 1) return null
  if (typeof binding.max_diff_lines !== 'number' || binding.max_diff_lines < 1) return null

  // Bind write content to the validated object — verifiable at execution boundary.
  const contentHash = 'sha256:' + sha256Hex(atao.proposed_action.parameters.content)

  // Explicit create pre-state: blank pre_write_hash → PRE_WRITE_HASH_ABSENT sentinel.
  // Avoids blank-string semantics that conflict with validator pre-write checks.
  const preWriteHash = isNonBlankString(binding.pre_write_hash) ? binding.pre_write_hash : PRE_WRITE_HASH_ABSENT
  const operation = preWriteHash === PRE_WRITE_HASH_ABSENT ? 'create' : 'modify'

  return Object.freeze({
    intent: Object.freeze({
      action: atao.proposed_action.action,
      purpose: atao.intent,
    }),
    scope: Object.freeze({
      repo: atao.scope.repo,
      root: atao.scope.root,
      allowed_paths: Object.freeze([...binding.allowed_paths]) as readonly string[],
      denied_paths: Object.freeze([...binding.denied_paths]) as readonly string[],
      allowed_operations: Object.freeze([...binding.allowed_operations]) as readonly string[],
      denied_operations: Object.freeze([...binding.denied_operations]) as readonly string[],
      max_files: binding.max_files,
      max_diff_lines: binding.max_diff_lines,
    }),
    validation: Object.freeze({
      decision_id: binding.decision_id,
      authority_lineage_hash: binding.authority_lineage_hash,
      policy_id: binding.policy_id,
      policy_hash: binding.policy_hash,
      canonicalization: "json-canonical-v1",
      pre_write_hash: preWriteHash,
      proposed_diff_hash: binding.proposed_diff_hash,
      aeo_hash_required: true,
      replay_nonce: binding.replay_nonce,
      requires_unused_nonce: true,
      requires_scope_match: true,
      requires_path_policy_match: true,
      requires_pre_write_hash_match: true,
      content_hash: contentHash,
    }),
    target: Object.freeze({
      system: "filesystem" as const,
      operation,
      path: atao.proposed_action.parameters.path,
      normalized_path_required: true,
      symlink_following_allowed: false,
    }),
    finality: Object.freeze({
      proof_required: true,
      proof_type: "filesystem_write_execution",
      expected_result: "single_bounded_file_mutation",
      proof_fields: Object.freeze([
        "decision_id",
        "aeo_hash",
        "atao_id",
        "target_path",
        "operation",
        "pre_write_hash",
        "post_write_hash",
        "diff_hash",
        "execution_id",
        "timestamp",
      ]) as readonly string[],
      registry_required: true,
      reconciliation_required: true,
      replay_state_after_success: "CONSUMED",
    }),
  }) as FilesystemAEO
}

// ── Execution Boundary ─────────────────────────────────────────────────────────
// executeFilesystemWrite: exact-object boundary gate.
//
// Invariants enforced here:
//   validated_object_hash == executed_object_hash
//   validated_content_hash == executed_content_hash
//
// Steps:
//   1. Fail closed on null/blank inputs (no ATAO, no AEO, no evidence, no executor)
//   2. Validate evidence: result must be VALID with matching aeo_hash
//   3. Recompute AEO hash immediately before execution
//   4. Compare recomputed hash to validated_object_hash
//   5. Mismatch → NULL proof (OBJECT_HASH_MISMATCH), executor never called
//   6. Verify content binding: sha256(atao.content) must match aeo.validation.content_hash
//   7. Mismatch → NULL proof (CONTENT_HASH_MISMATCH), executor never called
//   8. Execute exactly the validated object; on throw → NULL proof (EXECUTOR_FAILURE)
//   9. Emit immutable proof with all AEO-declared fields and gateway invariant fields
//
// Non-goals:
//   no authority creation
//   no replay state mutation
//   no proof persistence
//   no runtime route

export type FilesystemWriteValidationEvidence = {
  readonly result: "VALID"
  readonly aeo_hash: string
}

export type FilesystemWriteExecutor = (input: {
  readonly path: string
  readonly content: string
}) => { readonly bytes_written: number }

export type FilesystemWriteExecutionProof = {
  readonly proof_id: string
  readonly execution_id: string
  readonly atao_id: string
  readonly aeo_hash: string
  readonly decision_id: string
  readonly target_surface: "filesystem"
  readonly target_path: string
  readonly operation: string
  readonly pre_write_hash: string
  readonly post_write_hash: string | null
  readonly diff_hash: string
  readonly validated_object_hash: string
  readonly executed_object_hash: string
  readonly execution_result: "EXECUTED" | "NULL"
  readonly null_reason: string | null
  readonly mutation_performed: boolean
  readonly timestamp: string
  readonly creates_authority: false
}

export type FilesystemWriteExecuteInput = {
  readonly aeo: FilesystemAEO | null | undefined
  readonly validation_evidence: FilesystemWriteValidationEvidence | null | undefined
  readonly atao: FilesystemWriteATAO | null | undefined
  readonly executor: FilesystemWriteExecutor
  readonly emitted_at: string
}

export function executeFilesystemWrite(
  input: FilesystemWriteExecuteInput | null | undefined,
): FilesystemWriteExecutionProof | null {
  // Guard checks — return null (no proof) for missing or structurally invalid inputs
  if (!input) return null
  if (!input.aeo) return null
  if (!input.atao) return null
  if (!input.validation_evidence) return null
  if (input.validation_evidence.result !== 'VALID') return null
  if (!isNonBlankString(input.validation_evidence.aeo_hash)) return null
  if (!isNonBlankString(input.emitted_at)) return null
  if (typeof input.executor !== 'function') return null

  const aeo = input.aeo
  const atao = input.atao
  const validatedObjectHash = input.validation_evidence.aeo_hash

  // Extract AEO fields used in proof regardless of execution outcome
  const target = aeo.target as Record<string, unknown>
  const validation = aeo.validation as Record<string, unknown>
  const targetPath = typeof target.path === 'string' ? target.path : ''
  const targetOperation = typeof target.operation === 'string' ? target.operation : ''
  const decisionId = typeof validation.decision_id === 'string' ? validation.decision_id : ''
  const preWriteHash = typeof validation.pre_write_hash === 'string' ? validation.pre_write_hash : ''
  const diffHash = typeof validation.proposed_diff_hash === 'string' ? validation.proposed_diff_hash : ''
  const aeoContentHash = typeof validation.content_hash === 'string' ? validation.content_hash : ''

  // Step 1: Recompute AEO hash immediately before execution.
  // Any mutation since validation produces a different hash → NULL proof, executor never called.
  const recomputedAEOHash = computeFilesystemAEOHash(aeo)
  const hashMatch = recomputedAEOHash === validatedObjectHash

  let executionResult: "EXECUTED" | "NULL"
  let nullReason: string | null
  let executedObjectHash: string
  let postWriteHash: string | null
  let mutationPerformed: boolean

  if (!hashMatch) {
    // Object mutated between validation and execution boundary — block unconditionally
    executionResult = "NULL"
    nullReason = "OBJECT_HASH_MISMATCH"
    executedObjectHash = recomputedAEOHash
    postWriteHash = null
    mutationPerformed = false
  } else {
    // Step 2: Verify content binding.
    // The ATAO content being executed must match what was bound in the validated AEO.
    // Prevents substituting a different ATAO's content after validation.
    const ataoContentHash = 'sha256:' + sha256Hex(atao.proposed_action.parameters.content)
    if (ataoContentHash !== aeoContentHash) {
      executionResult = "NULL"
      nullReason = "CONTENT_HASH_MISMATCH"
      executedObjectHash = recomputedAEOHash
      postWriteHash = null
      mutationPerformed = false
    } else {
      // Step 3: Execute exactly the validated object — path and content from validated ATAO.
      // On executor failure, emit NULL proof with EXECUTOR_FAILURE — never propagate throws.
      try {
        input.executor({
          path: targetPath,
          content: atao.proposed_action.parameters.content,
        })
        executionResult = "EXECUTED"
        nullReason = null
        executedObjectHash = recomputedAEOHash  // invariant: validated_object_hash == executed_object_hash
        postWriteHash = 'sha256:' + sha256Hex(atao.proposed_action.parameters.content)
        mutationPerformed = true
      } catch {
        executionResult = "NULL"
        nullReason = "EXECUTOR_FAILURE"
        executedObjectHash = recomputedAEOHash
        postWriteHash = null
        mutationPerformed = false
      }
    }
  }

  const executionId = 'sha256:' + sha256Hex(canonicalize({
    aeo_hash: recomputedAEOHash,
    atao_id: atao.atao_id,
    timestamp: input.emitted_at,
  }))

  const proofBody = {
    execution_id: executionId,
    atao_id: atao.atao_id,
    aeo_hash: recomputedAEOHash,
    decision_id: decisionId,
    target_surface: "filesystem" as const,
    target_path: targetPath,
    operation: targetOperation,
    pre_write_hash: preWriteHash,
    post_write_hash: postWriteHash,
    diff_hash: diffHash,
    validated_object_hash: validatedObjectHash,
    executed_object_hash: executedObjectHash,
    execution_result: executionResult,
    null_reason: nullReason,
    mutation_performed: mutationPerformed,
    timestamp: input.emitted_at,
    creates_authority: false as const,
  }

  const proof_id = "sha256:" + sha256Hex(canonicalize(proofBody))

  return Object.freeze({ proof_id, ...proofBody })
}
