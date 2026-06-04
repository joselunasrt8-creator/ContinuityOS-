// GitHub Comment Governed Surface — issue #1857 scaling template.
//
// Canonical flow:
//   agent proposes tool action
//   → captureGitHubCommentATAO    (non-operative capture)
//   → compileGitHubCommentAEO     (authority binding → AEO candidate)
//   → computeGitHubCommentAEOHash (deterministic identity)
//   → executeGitHubComment        (exact-object boundary: execute or NULL)
//   → GitHubCommentExecutionProof (immutable proof artifact)
//
// Core invariants:
//   If no valid object exists → nothing happens
//   validated_object_hash == executed_object_hash
//
// Scoped to: single bounded GitHub comment post (issue comment, PR review comment, PR review)
// Non-goals: multi-comment orchestration, multi-repo routing, authority creation,
//   distributed convergence, cognition governance, LLM output as authority

import { canonicalize, sha256Hex } from '../../canonical.js'
import type { GovernedActionSurface, GovernedSurfaceType } from '../governed-action-template.js'
import { createGovernedAction } from '../governed-action-template.js'

function isNonBlankString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

// ── ATAO: Agent Tool Action Object ────────────────────────────────────────────
// Captures the proposed GitHub comment before any legitimacy exists.
// Non-operative: creates no authority, no execution eligibility.

export type GitHubCommentATAO = {
  readonly atao_id: string
  readonly agent_id: string
  readonly session_id: string
  readonly intent: string
  readonly proposed_action: {
    readonly system: "github"
    readonly action: "post_comment"
    readonly parameters: {
      readonly repo: string
      readonly issue_number: number
      readonly comment_body: string
      readonly comment_type: "issue_comment" | "pr_review_comment" | "pr_review"
    }
  }
  readonly scope: {
    readonly repo: string
    readonly issue_number: number
    readonly allowed_comment_types: readonly string[]
    readonly max_comment_length: number
  }
  readonly risk_class: "P2"
  readonly timestamp: string
  readonly creates_authority: false
  readonly creates_execution_eligibility: false
}

export type GitHubCommentATAOInput = {
  readonly agent_id: string
  readonly session_id: string
  readonly intent: string
  readonly repo: string
  readonly issue_number: number
  readonly comment_body: string
  readonly comment_type: "issue_comment" | "pr_review_comment" | "pr_review"
  readonly allowed_comment_types: readonly string[]
  readonly max_comment_length: number
  readonly timestamp: string
}

// captureGitHubCommentATAO: forms an immutable, frozen ATAO from a proposed comment post.
// atao_id is the canonical sha256 of the ATAO body (excluding atao_id itself).
// Fails closed on null/missing/blank required fields.
// Does not create authority or execution eligibility.
export function captureGitHubCommentATAO(
  input: GitHubCommentATAOInput | null | undefined,
): GitHubCommentATAO | null {
  if (!input) return null
  if (!isNonBlankString(input.agent_id)) return null
  if (!isNonBlankString(input.session_id)) return null
  if (!isNonBlankString(input.intent)) return null
  if (!isNonBlankString(input.repo)) return null
  if (typeof input.issue_number !== 'number' || input.issue_number < 1) return null
  if (typeof input.comment_body !== 'string') return null
  if (!isNonBlankString(input.comment_type)) return null
  if (!Array.isArray(input.allowed_comment_types) || input.allowed_comment_types.length === 0) return null
  if (typeof input.max_comment_length !== 'number' || input.max_comment_length < 1) return null
  if (!isNonBlankString(input.timestamp)) return null

  const validCommentTypes: ReadonlyArray<string> = ["issue_comment", "pr_review_comment", "pr_review"]
  if (!validCommentTypes.includes(input.comment_type)) return null

  const ataoBody = {
    agent_id: input.agent_id,
    session_id: input.session_id,
    intent: input.intent,
    proposed_action: Object.freeze({
      system: "github" as const,
      action: "post_comment" as const,
      parameters: Object.freeze({
        repo: input.repo,
        issue_number: input.issue_number,
        comment_body: input.comment_body,
        comment_type: input.comment_type,
      }),
    }),
    scope: Object.freeze({
      repo: input.repo,
      issue_number: input.issue_number,
      allowed_comment_types: Object.freeze([...input.allowed_comment_types]) as readonly string[],
      max_comment_length: input.max_comment_length,
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
  }) as GitHubCommentATAO
}

// ── AEO Compilation: ATAO + Authority Binding → AEO Candidate ─────────────────
// Authority binding carries governance constraints from the authority layer.
// The compiled AEO is the exact candidate submitted to the Ω validator.
// Compilation does not validate, execute, or authorize anything.

export type GitHubCommentATAOBinding = {
  readonly decision_id: string
  readonly authority_lineage_hash: string
  readonly policy_id: string
  readonly policy_hash: string
  readonly replay_nonce: string
  readonly allowed_comment_types: readonly string[]
  readonly denied_actions: readonly string[]
  readonly max_comment_length: number
  readonly proposed_comment_hash: string
}

export type GitHubCommentAEO = {
  readonly intent: {
    readonly action: "post_comment"
    readonly purpose: string
  }
  readonly scope: {
    readonly repo: string
    readonly issue_number: number
    readonly allowed_comment_types: readonly string[]
    readonly max_comment_length: number
    readonly denied_actions: readonly string[]
  }
  readonly validation: {
    readonly decision_id: string
    readonly authority_lineage_hash: string
    readonly policy_id: string
    readonly policy_hash: string
    readonly canonicalization: "json-canonical-v1"
    readonly replay_nonce: string
    readonly requires_unused_nonce: boolean
    readonly requires_scope_match: boolean
    readonly aeo_hash_required: boolean
    readonly proposed_comment_hash: string
  }
  readonly target: {
    readonly system: "github"
    readonly operation: "post_comment"
    readonly repo: string
    readonly issue_number: number
    readonly comment_type: string
    readonly comment_body: string
  }
  readonly finality: {
    readonly proof_required: boolean
    readonly proof_type: "github_comment_execution"
    readonly expected_result: "single_bounded_github_comment"
    readonly proof_fields: readonly string[]
    readonly registry_required: boolean
    readonly reconciliation_required: boolean
    readonly replay_state_after_success: "CONSUMED"
  }
}

// compileGitHubCommentAEO: compiles an ATAO + authority binding into a GitHubCommentAEO.
// The compiled AEO carries the exact fields required by the Ω validator.
// Fails closed on null/missing inputs, blank required binding fields,
// or empty allowed_comment_types arrays.
// Does not validate, execute, or produce proof.
export function compileGitHubCommentAEO(
  atao: GitHubCommentATAO | null | undefined,
  binding: GitHubCommentATAOBinding | null | undefined,
): GitHubCommentAEO | null {
  if (!atao) return null
  if (!binding) return null
  if (!isNonBlankString(binding.decision_id)) return null
  if (!isNonBlankString(binding.authority_lineage_hash)) return null
  if (!isNonBlankString(binding.policy_id)) return null
  if (!isNonBlankString(binding.policy_hash)) return null
  if (!isNonBlankString(binding.replay_nonce)) return null
  if (!Array.isArray(binding.allowed_comment_types) || binding.allowed_comment_types.length === 0) return null
  if (!Array.isArray(binding.denied_actions)) return null
  if (typeof binding.max_comment_length !== 'number' || binding.max_comment_length < 1) return null
  if (typeof binding.proposed_comment_hash !== 'string') return null

  return Object.freeze({
    intent: Object.freeze({
      action: "post_comment" as const,
      purpose: atao.intent,
    }),
    scope: Object.freeze({
      repo: atao.scope.repo,
      issue_number: atao.scope.issue_number,
      allowed_comment_types: Object.freeze([...binding.allowed_comment_types]) as readonly string[],
      max_comment_length: binding.max_comment_length,
      denied_actions: Object.freeze([...binding.denied_actions]) as readonly string[],
    }),
    validation: Object.freeze({
      decision_id: binding.decision_id,
      authority_lineage_hash: binding.authority_lineage_hash,
      policy_id: binding.policy_id,
      policy_hash: binding.policy_hash,
      canonicalization: "json-canonical-v1" as const,
      replay_nonce: binding.replay_nonce,
      requires_unused_nonce: true,
      requires_scope_match: true,
      aeo_hash_required: true,
      proposed_comment_hash: binding.proposed_comment_hash,
    }),
    target: Object.freeze({
      system: "github" as const,
      operation: "post_comment" as const,
      repo: atao.proposed_action.parameters.repo,
      issue_number: atao.proposed_action.parameters.issue_number,
      comment_type: atao.proposed_action.parameters.comment_type,
      comment_body: atao.proposed_action.parameters.comment_body,
    }),
    finality: Object.freeze({
      proof_required: true,
      proof_type: "github_comment_execution" as const,
      expected_result: "single_bounded_github_comment" as const,
      proof_fields: Object.freeze([
        "atao_id",
        "aeo_hash",
        "target_repo",
        "target_issue_number",
        "target_operation",
        "comment_type",
        "posted_comment_id",
        "emitted_at",
      ]) as readonly string[],
      registry_required: true,
      reconciliation_required: true,
      replay_state_after_success: "CONSUMED" as const,
    }),
  }) as GitHubCommentAEO
}

// computeGitHubCommentAEOHash: deterministic SHA-256 over the canonical AEO.
// Identical hash function pattern as computeFilesystemAEOHash — same canonical.js utilities.
export function computeGitHubCommentAEOHash(aeo: GitHubCommentAEO): string {
  return "sha256:" + sha256Hex(canonicalize(aeo))
}

// ── Execution Boundary ─────────────────────────────────────────────────────────
// executeGitHubComment: exact-object boundary gate.
//
// Invariant enforced here:
//   validated_object_hash == executed_object_hash
//
// Steps:
//   1. Fail closed on null/blank inputs (no ATAO, no AEO, no hash, no executor)
//   2. Recompute AEO hash immediately before execution
//   3. Compare recomputed hash to validated_object_hash
//   4. Mismatch → NULL proof (OBJECT_HASH_MISMATCH), executor never called
//   5. Match    → executor called with exact validated repo, issue_number, comment_body
//   6. Emit immutable proof linking ATAO, AEO hash, validated hash, executed hash,
//      target surface, and execution result
//
// Non-goals:
//   no authority creation
//   no replay state mutation
//   no proof persistence
//   no runtime route

export type GitHubCommentExecutor = (input: {
  readonly repo: string
  readonly issue_number: number
  readonly comment_type: string
  readonly comment_body: string
}) => { readonly comment_id: string }

export type GitHubCommentExecutionProof = {
  readonly proof_id: string
  readonly atao_id: string
  readonly aeo_hash: string
  readonly validated_object_hash: string
  readonly executed_object_hash: string
  readonly target_surface: "github_comment"
  readonly target_repo: string
  readonly target_issue_number: number
  readonly target_operation: "post_comment"
  readonly comment_type: string
  readonly posted_comment_id: string | null
  readonly execution_result: "EXECUTED" | "NULL"
  readonly null_reason: string | null
  readonly creates_authority: false
  readonly emitted_at: string
}

export type GitHubCommentExecuteInput = {
  readonly aeo: GitHubCommentAEO | null | undefined
  readonly validated_object_hash: string
  readonly atao: GitHubCommentATAO | null | undefined
  readonly executor: GitHubCommentExecutor
  readonly emitted_at: string
}

export function executeGitHubComment(
  input: GitHubCommentExecuteInput | null | undefined,
): GitHubCommentExecutionProof | null {
  if (!input) return null
  if (!input.aeo) return null
  if (!input.atao) return null
  if (!isNonBlankString(input.validated_object_hash)) return null
  if (!isNonBlankString(input.emitted_at)) return null
  if (typeof input.executor !== 'function') return null

  const aeo = input.aeo
  const atao = input.atao

  const targetRepo = typeof (aeo.target as Record<string, unknown>).repo === 'string'
    ? (aeo.target as Record<string, unknown>).repo as string
    : ''
  const targetIssueNumber = typeof (aeo.target as Record<string, unknown>).issue_number === 'number'
    ? (aeo.target as Record<string, unknown>).issue_number as number
    : 0
  const targetCommentType = typeof (aeo.target as Record<string, unknown>).comment_type === 'string'
    ? (aeo.target as Record<string, unknown>).comment_type as string
    : ''

  // Recompute AEO hash immediately before execution.
  // Any mutation since validation will produce a different hash → NULL.
  const recomputedAEOHash = computeGitHubCommentAEOHash(aeo)
  const hashMatch = recomputedAEOHash === input.validated_object_hash

  let executionResult: "EXECUTED" | "NULL"
  let nullReason: string | null
  let executedObjectHash: string
  let postedCommentId: string | null

  if (!hashMatch) {
    // Object mutated between validation and execution boundary — block unconditionally
    executionResult = "NULL"
    nullReason = "OBJECT_HASH_MISMATCH"
    executedObjectHash = recomputedAEOHash
    postedCommentId = null
  } else {
    // Execute exactly the object that passed validation — repo, issue_number, comment_body from validated ATAO
    const result = input.executor({
      repo: atao.proposed_action.parameters.repo,
      issue_number: atao.proposed_action.parameters.issue_number,
      comment_type: atao.proposed_action.parameters.comment_type,
      comment_body: atao.proposed_action.parameters.comment_body,
    })
    executionResult = "EXECUTED"
    nullReason = null
    executedObjectHash = recomputedAEOHash  // equals validated_object_hash — invariant holds
    postedCommentId = result.comment_id
  }

  const proofBody = {
    atao_id: atao.atao_id,
    aeo_hash: recomputedAEOHash,
    validated_object_hash: input.validated_object_hash,
    executed_object_hash: executedObjectHash,
    target_surface: "github_comment" as const,
    target_repo: targetRepo,
    target_issue_number: targetIssueNumber,
    target_operation: "post_comment" as const,
    comment_type: targetCommentType,
    posted_comment_id: postedCommentId,
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

export const GitHubCommentSurface = createGovernedAction<
  GitHubCommentATAO,
  GitHubCommentATAOInput,
  GitHubCommentATAOBinding,
  GitHubCommentAEO,
  GitHubCommentExecuteInput,
  GitHubCommentExecutionProof
>({
  surfaceType: "github_comment" as GovernedSurfaceType,
  captureATAO: captureGitHubCommentATAO,
  compileAEO: compileGitHubCommentAEO,
  computeAEOHash: computeGitHubCommentAEOHash,
  execute: executeGitHubComment,
})
