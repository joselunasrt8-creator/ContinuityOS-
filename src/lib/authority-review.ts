// Authority Review surface — the only path to ATAO formation from gateway proposals.
// Canonical flow: GovernanceProposal (PENDING_AUTHORITY_REVIEW) → AuthorityReviewArtifact → AgentToolATAO
//
// Module boundary: this module owns authority review decision recording and ATAO formation only.
// Gateway owns Observation → CIP → GovernanceProposal.
// This module owns what happens after: Authority Review → ATAO (if APPROVED).
//
// Invariants:
//   Authority Review is the only permitted source of AgentToolATAO on the gateway path
//   Rejected proposals do not produce ATAOs — no ATAO → NULL
//   Gateway ≠ Authority (gateway never creates review records or ATAOs)
//   Observation ≠ Authority (observation is non-operative)
//   CIP ≠ Authority (CIP transforms observation into proposal, not permission)
//   Proposal ≠ Authority (proposal_status PENDING_AUTHORITY_REVIEW ≠ approved)
//   formAgentToolATAO() is type-enforced to require review_decision: "APPROVED"
//
// Single ATAO primitive: AgentToolATAO matches the canonical shape from issue #1627.
// One ATAO type only — the ATAO is the same primitive regardless of path.

// Inline the tool surface and risk class types to avoid importing from the gateway module.
// These must remain in sync with the canonical definitions in agent-tool-gateway.ts.
type AuthorityToolSystem = "filesystem" | "github" | "shell" | "ci_cd" | "http_api" | "database" | "deploy" | "read_only"
type AuthorityRiskClass = "P0" | "P1" | "P2" | "P3"

// Proposal lineage reference — minimum fields required to form a review or ATAO.
// Inlines tool system types to avoid any import from the gateway module.
export type GatewayProposalLineage = {
  readonly proposal_id: string
  readonly cip_id: string
  readonly observation_id: string
  readonly observation_hash: string
  readonly agent_id: string
  readonly session_id: string
  readonly framework: "langchain"
  readonly tool_name: string
  readonly tool_system: AuthorityToolSystem
  readonly risk_class: AuthorityRiskClass
  readonly intent: string
  readonly scope: Record<string, unknown>
  readonly constraints: Record<string, unknown>
  readonly requires_authority_binding: boolean
}

// AuthorityReviewArtifact — the output of the authority review process.
// Discriminated union: APPROVED and REJECTED are structurally distinct.
// Only the APPROVED variant may be passed to formAgentToolATAO().
export type ApprovedAuthorityReviewArtifact = {
  readonly review_id: string
  readonly review_decision: "APPROVED"
  readonly proposal_id: string
  readonly observation_id: string
  readonly observation_hash: string
  readonly reviewer_id: string
  readonly review_rationale: string
  readonly creates_atao: true
  readonly created_at: string
}

export type RejectedAuthorityReviewArtifact = {
  readonly review_id: string
  readonly review_decision: "REJECTED"
  readonly proposal_id: string
  readonly observation_id: string
  readonly observation_hash: string
  readonly reviewer_id: string
  readonly review_rationale: string
  readonly creates_atao: false
  readonly created_at: string
}

export type AuthorityReviewArtifact = ApprovedAuthorityReviewArtifact | RejectedAuthorityReviewArtifact

// AgentToolATAO — the canonical ATAO type (single primitive, issue #1627 spec).
// Formed only after authority approval. Carries review_id as a required lineage
// field: no approved review → no ATAO.
export type AgentToolATAO = {
  readonly atao_id: string
  readonly agent_id: string
  readonly session_id: string
  readonly framework: "langchain"
  readonly tool_name: string
  readonly tool_system: AuthorityToolSystem
  readonly risk_class: AuthorityRiskClass
  readonly intent: string
  readonly scope: Record<string, unknown>
  readonly constraints: Record<string, unknown>
  readonly atao_status: "FORMED"
  readonly created_at: string
  // Required authority lineage: every ATAO must trace to an approved review
  readonly review_id: string
  readonly proposal_id: string
  readonly observation_id: string
  readonly observation_hash: string
}

// AuthorityReviewOutcome — result of conducting an authority review.
export type AuthorityReviewOutcome =
  | {
      readonly status: "APPROVED"
      readonly review: ApprovedAuthorityReviewArtifact
      readonly atao: AgentToolATAO
    }
  | {
      readonly status: "REJECTED"
      readonly review: RejectedAuthorityReviewArtifact
      readonly atao: null
    }
  | {
      readonly status: "NULL"
      readonly reason: string
    }

export type AuthorityReviewDecision = "APPROVED" | "REJECTED"

// Authorized Agent Tool Reviewer Registry (issue #1833) — must remain in sync
// with governance/merge-legitimacy/MERGE_ACTOR_REGISTRY.json
// authorized_agent_tool_reviewers.permitted_reviewers.
// reviewer_id is an identity claim, not a permission grant: any caller that
// knows the field name can supply an arbitrary string. Binding reviewer_id to
// this registry closes that silent authority-escalation path. Unrecognized
// reviewer_id values are rejected fail-closed — no review artifact, no ATAO.
const AUTHORIZED_AGENT_TOOL_REVIEWERS: ReadonlySet<string> = new Set([
  "joselunasrt8-creator",
])

export function isAuthorizedAgentToolReviewer(reviewer_id: string): boolean {
  return AUTHORIZED_AGENT_TOOL_REVIEWERS.has(reviewer_id)
}

export function formAuthorityReviewArtifact(input: {
  readonly proposal: GatewayProposalLineage
  readonly reviewer_id: string
  readonly review_decision: AuthorityReviewDecision
  readonly review_rationale: string
  readonly created_at: string
}): AuthorityReviewArtifact {
  const review_id = `authority-review:${input.proposal.proposal_id}:${input.reviewer_id}:${input.created_at}`
  if (input.review_decision === "APPROVED") {
    return Object.freeze({
      review_id,
      review_decision: "APPROVED" as const,
      proposal_id: input.proposal.proposal_id,
      observation_id: input.proposal.observation_id,
      observation_hash: input.proposal.observation_hash,
      reviewer_id: input.reviewer_id,
      review_rationale: input.review_rationale,
      creates_atao: true as const,
      created_at: input.created_at,
    })
  }
  return Object.freeze({
    review_id,
    review_decision: "REJECTED" as const,
    proposal_id: input.proposal.proposal_id,
    observation_id: input.proposal.observation_id,
    observation_hash: input.proposal.observation_hash,
    reviewer_id: input.reviewer_id,
    review_rationale: input.review_rationale,
    creates_atao: false as const,
    created_at: input.created_at,
  })
}

// formAgentToolATAO — type-enforced to require an APPROVED review.
// TypeScript rejects calling this with a RejectedAuthorityReviewArtifact.
// The only permitted path to ATAO: Proposal → APPROVED Review → ATAO.
export function formAgentToolATAO(
  review: ApprovedAuthorityReviewArtifact,
  proposal: GatewayProposalLineage,
): AgentToolATAO {
  const atao_id = `atao:${review.review_id}:${proposal.proposal_id}`
  return Object.freeze({
    atao_id,
    agent_id: proposal.agent_id,
    session_id: proposal.session_id,
    framework: "langchain" as const,
    tool_name: proposal.tool_name,
    tool_system: proposal.tool_system,
    risk_class: proposal.risk_class,
    intent: proposal.intent,
    scope: Object.freeze({ ...proposal.scope }),
    constraints: Object.freeze({ ...proposal.constraints }),
    atao_status: "FORMED" as const,
    created_at: review.created_at,
    review_id: review.review_id,
    proposal_id: proposal.proposal_id,
    observation_id: proposal.observation_id,
    observation_hash: proposal.observation_hash,
  })
}

// conductAuthorityReview — the top-level entry point for the authority review surface.
// Validates inputs, forms review artifact, and conditionally forms ATAO.
// This is the only function on this path that produces an AgentToolATAO.
export function conductAuthorityReview(input: {
  readonly proposal: GatewayProposalLineage
  readonly reviewer_id: string
  readonly review_decision: string
  readonly review_rationale: string
  readonly timestamp: string
}): AuthorityReviewOutcome {
  if (!input.reviewer_id) {
    return Object.freeze({ status: "NULL" as const, reason: "missing_reviewer_id" })
  }
  if (!input.review_rationale) {
    return Object.freeze({ status: "NULL" as const, reason: "missing_review_rationale" })
  }
  if (input.review_decision !== "APPROVED" && input.review_decision !== "REJECTED") {
    return Object.freeze({ status: "NULL" as const, reason: "invalid_review_decision" })
  }
  if (!input.proposal.proposal_id || !input.proposal.observation_id || !input.proposal.observation_hash) {
    return Object.freeze({ status: "NULL" as const, reason: "invalid_proposal_lineage" })
  }
  if (!isAuthorizedAgentToolReviewer(input.reviewer_id)) {
    return Object.freeze({ status: "NULL" as const, reason: "unauthorized_reviewer_id" })
  }

  const review = formAuthorityReviewArtifact({
    proposal: input.proposal,
    reviewer_id: input.reviewer_id,
    review_decision: input.review_decision as AuthorityReviewDecision,
    review_rationale: input.review_rationale,
    created_at: input.timestamp,
  })

  if (review.review_decision === "APPROVED") {
    const atao = formAgentToolATAO(review, input.proposal)
    return Object.freeze({ status: "APPROVED" as const, review, atao })
  }

  return Object.freeze({ status: "REJECTED" as const, review: review as RejectedAuthorityReviewArtifact, atao: null })
}
