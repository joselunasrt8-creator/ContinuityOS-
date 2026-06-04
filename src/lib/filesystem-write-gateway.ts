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
//
// Scoped to: filesystem write (single mutation-capable action)
// Non-goals: multi-tool orchestration, multi-agent routing, authority creation,
//   distributed convergence, cognition governance, LLM output as authority

import { canonicalize, sha256Hex } from '../canonical.js'
import type { FilesystemAEO } from './filesystem-aeo.js'
import { computeFilesystemAEOHash } from './filesystem-aeo.js'

function isNonBlankString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

// ── ATAO: Agent Tool Action Object ────────────────────────────────────────────
// Captures the proposed filesystem write before any legitimacy exists.
// Non-operative: creates no authority, no execution eligibility.

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
// Compilation does not validate, execute, or authorize anything.

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

  // Derive operation from pre_write_hash: empty = create, non-empty = modify
  const operation = isNonBlankString(binding.pre_write_hash) ? 'modify' : 'create'

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
      pre_write_hash: binding.pre_write_hash,
      proposed_diff_hash: binding.proposed_diff_hash,
      aeo_hash_required: true,
      replay_nonce: binding.replay_nonce,
      requires_unused_nonce: true,
      requires_scope_match: true,
      requires_path_policy_match: true,
      requires_pre_write_hash_match: true,
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
// Invariant enforced here:
//   validated_object_hash == executed_object_hash
//
// Steps:
//   1. Fail closed on null/blank inputs (no ATAO, no AEO, no hash, no executor)
//   2. Recompute AEO hash immediately before execution
//   3. Compare recomputed hash to validated_object_hash
//   4. Mismatch → NULL proof (OBJECT_HASH_MISMATCH), executor never called
//   5. Match    → executor called with exact validated path and content
//   6. Emit immutable proof linking ATAO, AEO hash, validated hash, executed hash,
//      target surface, and execution result
//
// Non-goals:
//   no authority creation
//   no replay state mutation
//   no proof persistence
//   no runtime route

export type FilesystemWriteExecutor = (input: {
  readonly path: string
  readonly content: string
}) => { readonly bytes_written: number }

export type FilesystemWriteExecutionProof = {
  readonly proof_id: string
  readonly atao_id: string
  readonly aeo_hash: string
  readonly validated_object_hash: string
  readonly executed_object_hash: string
  readonly target_surface: "filesystem"
  readonly target_path: string
  readonly target_action: string
  readonly execution_result: "EXECUTED" | "NULL"
  readonly null_reason: string | null
  readonly creates_authority: false
  readonly emitted_at: string
}

export type FilesystemWriteExecuteInput = {
  readonly aeo: FilesystemAEO | null | undefined
  readonly validated_object_hash: string
  readonly atao: FilesystemWriteATAO | null | undefined
  readonly executor: FilesystemWriteExecutor
  readonly emitted_at: string
}

export function executeFilesystemWrite(
  input: FilesystemWriteExecuteInput | null | undefined,
): FilesystemWriteExecutionProof | null {
  if (!input) return null
  if (!input.aeo) return null
  if (!input.atao) return null
  if (!isNonBlankString(input.validated_object_hash)) return null
  if (!isNonBlankString(input.emitted_at)) return null
  if (typeof input.executor !== 'function') return null

  const aeo = input.aeo
  const atao = input.atao

  const targetPath = typeof (aeo.target as Record<string, unknown>).path === 'string'
    ? (aeo.target as Record<string, unknown>).path as string
    : ''
  const targetAction = typeof (aeo.target as Record<string, unknown>).operation === 'string'
    ? (aeo.target as Record<string, unknown>).operation as string
    : ''

  // Recompute AEO hash immediately before execution.
  // Any mutation since validation will produce a different hash → NULL.
  const recomputedAEOHash = computeFilesystemAEOHash(aeo)
  const hashMatch = recomputedAEOHash === input.validated_object_hash

  let executionResult: "EXECUTED" | "NULL"
  let nullReason: string | null
  let executedObjectHash: string

  if (!hashMatch) {
    // Object mutated between validation and execution boundary — block unconditionally
    executionResult = "NULL"
    nullReason = "OBJECT_HASH_MISMATCH"
    executedObjectHash = recomputedAEOHash
  } else {
    // Execute exactly the object that passed validation — path and content from validated ATAO
    input.executor({
      path: targetPath,
      content: atao.proposed_action.parameters.content,
    })
    executionResult = "EXECUTED"
    nullReason = null
    executedObjectHash = recomputedAEOHash  // equals validated_object_hash — invariant holds
  }

  const proofBody = {
    atao_id: atao.atao_id,
    aeo_hash: recomputedAEOHash,
    validated_object_hash: input.validated_object_hash,
    executed_object_hash: executedObjectHash,
    target_surface: "filesystem" as const,
    target_path: targetPath,
    target_action: targetAction,
    execution_result: executionResult,
    null_reason: nullReason,
    creates_authority: false as const,
    emitted_at: input.emitted_at,
  }

  const proof_id = "sha256:" + sha256Hex(canonicalize(proofBody))

  return Object.freeze({ proof_id, ...proofBody })
}

// ── Surface adapter ───────────────────────────────────────────────────────────
// Wraps the three gateway functions in the GovernedActionSurface interface.
// This is what gets registered in surface-registry.ts.

import type { GovernedActionSurface, GovernedSurfaceType } from './governed-action-template.js'
import { createGovernedAction } from './governed-action-template.js'

export const FilesystemWriteSurface = createGovernedAction<
  FilesystemWriteATAO,
  FilesystemWriteATAOInput,
  FilesystemWriteATAOBinding,
  FilesystemAEO,
  FilesystemWriteExecuteInput,
  FilesystemWriteExecutionProof
>({
  surfaceType: "filesystem" as GovernedSurfaceType,
  captureATAO: captureFilesystemWriteATAO,
  compileAEO: compileFilesystemWriteAEO,
  computeAEOHash: computeFilesystemAEOHash,
  execute: executeFilesystemWrite,
})
