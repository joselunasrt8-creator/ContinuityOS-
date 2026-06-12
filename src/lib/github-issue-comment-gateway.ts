// Bounded Agent Tool Gateway action: GitHub issue comment.
//
// Canonical flow slice:
//   captureGitHubIssueCommentATAO (proposed action, non-operative)
//   → compileGitHubIssueCommentAEO (authority binding → exact AEO candidate)
//   → validateGitHubIssueCommentAEO (Ω validator: VALID | NULL)
//   → executeGitHubIssueComment (exact-object boundary → proof only after evidence)
//
// Scope: one GitHub action only: comment_issue.
// Invariants:
//   validated_object_hash == executed_object_hash
//   proof is emitted only after comment execution evidence exists
//   AEO top-level fields are exactly intent, scope, validation, target, finality
//   validator returns only VALID or NULL
//   invalid, replayed, mutated, missing-authority, or extra-field objects fail closed

import { canonicalize, sha256Hex } from '../canonical.js'

export const GITHUB_ISSUE_COMMENT_AEO_REQUIRED_KEYS = [
  'finality',
  'intent',
  'scope',
  'target',
  'validation',
] as const

export const GITHUB_ISSUE_COMMENT_PROOF_FIELDS = [
  'validated_object_hash',
  'executed_object_hash',
  'aeo_hash',
  'target_issue',
  'comment_id',
  'comment_url',
  'action_hash',
  'timestamp',
  'result',
  'execution_evidence_hash',
  'emitted_at',
] as const

export type GitHubIssueCommentValidatorResult = 'VALID' | 'NULL'

export type GitHubIssueCommentATAO = {
  readonly atao_id: string
  readonly agent_id: string
  readonly session_id: string
  readonly intent: string
  readonly proposed_action: {
    readonly system: 'github'
    readonly action: 'comment_issue'
    readonly parameters: {
      readonly owner: string
      readonly repo: string
      readonly issue_number: number
      readonly body: string
    }
  }
  readonly scope: {
    readonly owner: string
    readonly repo: string
    readonly issue_number: number
  }
  readonly risk_class: 'P2'
  readonly timestamp: string
  readonly creates_authority: false
  readonly creates_execution_eligibility: false
}

export type GitHubIssueCommentATAOInput = {
  readonly agent_id: string
  readonly session_id: string
  readonly intent: string
  readonly owner: string
  readonly repo: string
  readonly issue_number: number
  readonly body: string
  readonly timestamp: string
}

export type GitHubIssueCommentAuthorityBinding = {
  readonly decision_id: string
  readonly authority_lineage_hash: string
  readonly policy_id: string
  readonly policy_hash: string
  readonly replay_nonce: string
  readonly allowed_owner: string
  readonly allowed_repo: string
  readonly allowed_issue_numbers: readonly number[]
  readonly max_body_length: number
}

export type GitHubIssueCommentAEO = {
  readonly intent: {
    readonly action: 'comment_issue'
    readonly purpose: string
  }
  readonly scope: {
    readonly owner: string
    readonly repo: string
    readonly allowed_issue_numbers: readonly number[]
    readonly max_body_length: number
  }
  readonly validation: {
    readonly decision_id: string
    readonly authority_lineage_hash: string
    readonly policy_id: string
    readonly policy_hash: string
    readonly canonicalization: 'json-canonical-v1'
    readonly aeo_hash_required: true
    readonly replay_nonce: string
    readonly requires_unused_nonce: true
    readonly requires_scope_match: true
    readonly requires_issue_policy_match: true
  }
  readonly target: {
    readonly system: 'github'
    readonly action: 'comment_issue'
    readonly owner: string
    readonly repo: string
    readonly issue_number: number
    readonly body: string
  }
  readonly finality: {
    readonly proof_required: true
    readonly proof_type: 'github_issue_comment_execution'
    readonly expected_result: 'single_bounded_issue_comment'
    readonly proof_fields: readonly string[]
    readonly registry_required: true
    readonly reconciliation_required: true
    readonly replay_state_after_success: 'CONSUMED'
  }
}

export type GitHubIssueCommentValidationContext = {
  readonly authority: {
    readonly decision_id: string
    readonly authority_lineage_hash: string
    readonly policy_id: string
    readonly policy_hash: string
    readonly status: 'ACTIVE' | 'INACTIVE' | 'REVOKED'
  }
  readonly consumed_replay_nonces: ReadonlySet<string>
}

export type GitHubIssueCommentExecutionEvidence = {
  readonly comment_id?: string
  readonly comment_url: string
  readonly executed_at: string
}

export type GitHubIssueCommentExecutor = (input: {
  readonly owner: string
  readonly repo: string
  readonly issue_number: number
  readonly body: string
}) => GitHubIssueCommentExecutionEvidence | null | undefined

export type GitHubIssueCommentExecutionProof = {
  readonly proof_id: string
  readonly atao_id: string
  readonly validated_object_hash: string
  readonly executed_object_hash: string
  readonly aeo_hash: string
  readonly target_surface: 'github'
  readonly target_action: 'comment_issue'
  readonly owner: string
  readonly repo: string
  readonly issue_number: number
  readonly target_issue: {
    readonly owner: string
    readonly repo: string
    readonly issue_number: number
  }
  readonly comment_id?: string
  readonly comment_url: string
  readonly action_hash: string
  readonly timestamp: string
  readonly result: 'EXECUTED'
  readonly execution_evidence_hash: string
  readonly execution_result: 'EXECUTED'
  readonly creates_authority: false
  readonly emitted_at: string
}

export type GitHubIssueCommentExecuteInput = {
  readonly aeo: GitHubIssueCommentAEO | null | undefined
  readonly validated_object_hash: string
  readonly validation_result: GitHubIssueCommentValidatorResult
  readonly atao: GitHubIssueCommentATAO | null | undefined
  readonly executor: GitHubIssueCommentExecutor
  readonly emitted_at: string
  readonly consumed_action_hashes?: ReadonlySet<string>
  readonly persistProof?: (proof: GitHubIssueCommentExecutionProof) => void
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function hasExactKeys(value: unknown, expectedKeys: readonly string[]): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false
  const keys = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  if (keys.length !== expected.length) return false
  return keys.every((key, index) => key === expected[index])
}

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every(isPositiveInteger)
}

function equalsStringArray(value: unknown, expected: readonly string[]): value is readonly string[] {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
}

export function computeGitHubIssueCommentAEOHash(aeo: GitHubIssueCommentAEO): string {
  return `sha256:${sha256Hex(canonicalize(aeo))}`
}

export function computeGitHubIssueCommentActionHash(aeo: GitHubIssueCommentAEO): string {
  return `sha256:${sha256Hex(canonicalize({
    system: aeo.target.system,
    action: aeo.target.action,
    owner: aeo.target.owner,
    repo: aeo.target.repo,
    issue_number: aeo.target.issue_number,
    body: aeo.target.body,
  }))}`
}

export function captureGitHubIssueCommentATAO(
  input: GitHubIssueCommentATAOInput | null | undefined,
): GitHubIssueCommentATAO | null {
  if (!input) return null
  if (!isNonBlankString(input.agent_id)) return null
  if (!isNonBlankString(input.session_id)) return null
  if (!isNonBlankString(input.intent)) return null
  if (!isNonBlankString(input.owner)) return null
  if (!isNonBlankString(input.repo)) return null
  if (!isPositiveInteger(input.issue_number)) return null
  if (!isNonBlankString(input.body)) return null
  if (!isNonBlankString(input.timestamp)) return null

  const body = Object.freeze({
    agent_id: input.agent_id,
    session_id: input.session_id,
    intent: input.intent,
    proposed_action: Object.freeze({
      system: 'github' as const,
      action: 'comment_issue' as const,
      parameters: Object.freeze({
        owner: input.owner,
        repo: input.repo,
        issue_number: input.issue_number,
        body: input.body,
      }),
    }),
    scope: Object.freeze({
      owner: input.owner,
      repo: input.repo,
      issue_number: input.issue_number,
    }),
    risk_class: 'P2' as const,
    timestamp: input.timestamp,
    creates_authority: false as const,
    creates_execution_eligibility: false as const,
  })
  const atao_id = `sha256:${sha256Hex(canonicalize(body))}`
  return Object.freeze({ atao_id, ...body })
}

export function compileGitHubIssueCommentAEO(
  atao: GitHubIssueCommentATAO | null | undefined,
  binding: GitHubIssueCommentAuthorityBinding | null | undefined,
): GitHubIssueCommentAEO | null {
  if (!atao) return null
  if (!binding) return null
  if (!isNonBlankString(binding.decision_id)) return null
  if (!isNonBlankString(binding.authority_lineage_hash)) return null
  if (!isNonBlankString(binding.policy_id)) return null
  if (!isNonBlankString(binding.policy_hash)) return null
  if (!isNonBlankString(binding.replay_nonce)) return null
  if (!isNonBlankString(binding.allowed_owner)) return null
  if (!isNonBlankString(binding.allowed_repo)) return null
  if (!isNumberArray(binding.allowed_issue_numbers) || binding.allowed_issue_numbers.length === 0) return null
  if (!isPositiveInteger(binding.max_body_length)) return null

  return Object.freeze({
    intent: Object.freeze({
      action: 'comment_issue' as const,
      purpose: atao.intent,
    }),
    scope: Object.freeze({
      owner: binding.allowed_owner,
      repo: binding.allowed_repo,
      allowed_issue_numbers: Object.freeze([...binding.allowed_issue_numbers]) as readonly number[],
      max_body_length: binding.max_body_length,
    }),
    validation: Object.freeze({
      decision_id: binding.decision_id,
      authority_lineage_hash: binding.authority_lineage_hash,
      policy_id: binding.policy_id,
      policy_hash: binding.policy_hash,
      canonicalization: 'json-canonical-v1' as const,
      aeo_hash_required: true as const,
      replay_nonce: binding.replay_nonce,
      requires_unused_nonce: true as const,
      requires_scope_match: true as const,
      requires_issue_policy_match: true as const,
    }),
    target: Object.freeze({
      system: 'github' as const,
      action: 'comment_issue' as const,
      owner: atao.proposed_action.parameters.owner,
      repo: atao.proposed_action.parameters.repo,
      issue_number: atao.proposed_action.parameters.issue_number,
      body: atao.proposed_action.parameters.body,
    }),
    finality: Object.freeze({
      proof_required: true as const,
      proof_type: 'github_issue_comment_execution' as const,
      expected_result: 'single_bounded_issue_comment' as const,
      proof_fields: Object.freeze([...GITHUB_ISSUE_COMMENT_PROOF_FIELDS]) as readonly string[],
      registry_required: true as const,
      reconciliation_required: true as const,
      replay_state_after_success: 'CONSUMED' as const,
    }),
  })
}

export function validateGitHubIssueCommentAEO(
  aeo: unknown,
  context: GitHubIssueCommentValidationContext | null | undefined,
  expectedAEOHash?: string,
): GitHubIssueCommentValidatorResult {
  if (!hasExactKeys(aeo, GITHUB_ISSUE_COMMENT_AEO_REQUIRED_KEYS)) return 'NULL'
  if (!hasExactKeys(aeo.intent, ['action', 'purpose'])) return 'NULL'
  if (!hasExactKeys(aeo.scope, ['allowed_issue_numbers', 'max_body_length', 'owner', 'repo'])) return 'NULL'
  if (!hasExactKeys(aeo.validation, [
    'aeo_hash_required',
    'authority_lineage_hash',
    'canonicalization',
    'decision_id',
    'policy_hash',
    'policy_id',
    'replay_nonce',
    'requires_issue_policy_match',
    'requires_scope_match',
    'requires_unused_nonce',
  ])) return 'NULL'
  if (!hasExactKeys(aeo.target, ['action', 'body', 'issue_number', 'owner', 'repo', 'system'])) return 'NULL'
  if (!hasExactKeys(aeo.finality, [
    'expected_result',
    'proof_fields',
    'proof_required',
    'proof_type',
    'reconciliation_required',
    'registry_required',
    'replay_state_after_success',
  ])) return 'NULL'

  const candidate = aeo as GitHubIssueCommentAEO
  if (candidate.intent.action !== 'comment_issue') return 'NULL'
  if (!isNonBlankString(candidate.intent.purpose)) return 'NULL'
  if (!isNonBlankString(candidate.scope.owner)) return 'NULL'
  if (!isNonBlankString(candidate.scope.repo)) return 'NULL'
  if (!isNumberArray(candidate.scope.allowed_issue_numbers) || candidate.scope.allowed_issue_numbers.length === 0) return 'NULL'
  if (!isPositiveInteger(candidate.scope.max_body_length)) return 'NULL'
  if (!isNonBlankString(candidate.validation.decision_id)) return 'NULL'
  if (!isNonBlankString(candidate.validation.authority_lineage_hash)) return 'NULL'
  if (!isNonBlankString(candidate.validation.policy_id)) return 'NULL'
  if (!isNonBlankString(candidate.validation.policy_hash)) return 'NULL'
  if (candidate.validation.canonicalization !== 'json-canonical-v1') return 'NULL'
  if (candidate.validation.aeo_hash_required !== true) return 'NULL'
  if (!isNonBlankString(candidate.validation.replay_nonce)) return 'NULL'
  if (candidate.validation.requires_unused_nonce !== true) return 'NULL'
  if (candidate.validation.requires_scope_match !== true) return 'NULL'
  if (candidate.validation.requires_issue_policy_match !== true) return 'NULL'
  if (candidate.target.system !== 'github') return 'NULL'
  if (candidate.target.action !== 'comment_issue') return 'NULL'
  if (!isNonBlankString(candidate.target.owner)) return 'NULL'
  if (!isNonBlankString(candidate.target.repo)) return 'NULL'
  if (!isPositiveInteger(candidate.target.issue_number)) return 'NULL'
  if (!isNonBlankString(candidate.target.body)) return 'NULL'
  if (candidate.target.body.length > candidate.scope.max_body_length) return 'NULL'
  if (candidate.finality.proof_required !== true) return 'NULL'
  if (candidate.finality.proof_type !== 'github_issue_comment_execution') return 'NULL'
  if (candidate.finality.expected_result !== 'single_bounded_issue_comment') return 'NULL'
  if (!equalsStringArray(candidate.finality.proof_fields, GITHUB_ISSUE_COMMENT_PROOF_FIELDS)) return 'NULL'
  if (candidate.finality.registry_required !== true) return 'NULL'
  if (candidate.finality.reconciliation_required !== true) return 'NULL'
  if (candidate.finality.replay_state_after_success !== 'CONSUMED') return 'NULL'

  const computedHash = computeGitHubIssueCommentAEOHash(candidate)
  if (expectedAEOHash !== undefined && expectedAEOHash !== computedHash) return 'NULL'

  if (!context || !context.authority || !context.consumed_replay_nonces) return 'NULL'
  const authority = context.authority
  if (authority.status !== 'ACTIVE') return 'NULL'
  if (authority.decision_id !== candidate.validation.decision_id) return 'NULL'
  if (authority.authority_lineage_hash !== candidate.validation.authority_lineage_hash) return 'NULL'
  if (authority.policy_id !== candidate.validation.policy_id) return 'NULL'
  if (authority.policy_hash !== candidate.validation.policy_hash) return 'NULL'
  if (context.consumed_replay_nonces.has(candidate.validation.replay_nonce)) return 'NULL'
  if (candidate.scope.owner !== candidate.target.owner) return 'NULL'
  if (candidate.scope.repo !== candidate.target.repo) return 'NULL'
  if (!candidate.scope.allowed_issue_numbers.includes(candidate.target.issue_number)) return 'NULL'

  return 'VALID'
}

export function executeGitHubIssueComment(
  input: GitHubIssueCommentExecuteInput | null | undefined,
): GitHubIssueCommentExecutionProof | null {
  if (!input) return null
  if (!input.aeo) return null
  if (!input.atao) return null
  if (!isNonBlankString(input.validated_object_hash)) return null
  if (input.validation_result !== 'VALID') return null
  if (!isNonBlankString(input.emitted_at)) return null
  if (typeof input.executor !== 'function') return null

  const executedObjectHash = computeGitHubIssueCommentAEOHash(input.aeo)
  if (executedObjectHash !== input.validated_object_hash) return null

  const actionHash = computeGitHubIssueCommentActionHash(input.aeo)
  if (input.consumed_action_hashes?.has(actionHash)) return null

  const evidence = input.executor({
    owner: input.aeo.target.owner,
    repo: input.aeo.target.repo,
    issue_number: input.aeo.target.issue_number,
    body: input.aeo.target.body,
  })
  if (!evidence) return null
  if (evidence.comment_id !== undefined && !isNonBlankString(evidence.comment_id)) return null
  if (!isNonBlankString(evidence.comment_url)) return null
  if (!isNonBlankString(evidence.executed_at)) return null

  const evidenceHash = `sha256:${sha256Hex(canonicalize(evidence))}`
  const proofBody = Object.freeze({
    atao_id: input.atao.atao_id,
    validated_object_hash: input.validated_object_hash,
    executed_object_hash: executedObjectHash,
    aeo_hash: executedObjectHash,
    target_surface: 'github' as const,
    target_action: 'comment_issue' as const,
    owner: input.aeo.target.owner,
    repo: input.aeo.target.repo,
    issue_number: input.aeo.target.issue_number,
    target_issue: Object.freeze({
      owner: input.aeo.target.owner,
      repo: input.aeo.target.repo,
      issue_number: input.aeo.target.issue_number,
    }),
    ...(evidence.comment_id === undefined ? {} : { comment_id: evidence.comment_id }),
    comment_url: evidence.comment_url,
    action_hash: actionHash,
    timestamp: input.emitted_at,
    result: 'EXECUTED' as const,
    execution_evidence_hash: evidenceHash,
    execution_result: 'EXECUTED' as const,
    creates_authority: false as const,
    emitted_at: input.emitted_at,
  })
  const proof_id = `sha256:${sha256Hex(canonicalize(proofBody))}`
  const proof = Object.freeze({ proof_id, ...proofBody })
  input.persistProof?.(proof)
  return proof
}
