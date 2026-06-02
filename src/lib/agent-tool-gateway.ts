// Issue #1627: Agent Tool Gateway — execution-legitimacy boundary for LangChain tool calls.
// Canonical flow: Observation → CIP → Governance Proposal → Authority → ATAO → AEO → Ω Validation → Execution Boundary → Proof
//
// Module boundary: gateway owns observation artifact formation and CIP proposal formation only.
// Authority layer owns ATAO formation. AEO compiler owns ATAO→AEO. Ω Validator owns VALID|NULL.
//
// Invariants:
//   Understanding ≠ Permission
//   Capability ≠ Permission
//   Tool selection ≠ execution permission
//   Proposal ≠ Permission
//   No ATAO → No AEO → NULL

import { hashCanonical } from '../canonical.js'

export type GatewayToolSystem =
  | "filesystem"
  | "github"
  | "shell"
  | "ci_cd"
  | "http_api"
  | "database"
  | "deploy"
  | "read_only"

export type GatewayRiskClass = "P0" | "P1" | "P2" | "P3"

// Observation Artifact — surface-visible record of a tool call before any legitimacy exists.
// Non-operative: creates no authority, no execution eligibility, no validity.
export type AgentToolObservationArtifact = {
  readonly observation_id: string
  readonly agent_id: string
  readonly session_id: string
  readonly framework: "langchain"
  readonly tool_name: string
  readonly tool_input: Record<string, unknown>
  readonly tool_system: GatewayToolSystem
  readonly risk_class: GatewayRiskClass
  readonly observed_at: string
  readonly non_operative: true
  readonly creates_authority: false
  readonly creates_execution_eligibility: false
}

// CIP = Cognitive Interface Protocol — transforms Observation output into Governance Proposal.
// CIP is the transformation membrane between Observation and Authority.
// Populates proposal_space only; never authority_space or execution_space.
export type GatewayClassifiedInterceptionProposal = {
  readonly cip_id: string
  readonly observation_id: string
  readonly observation_hash: string
  readonly agent_id: string
  readonly session_id: string
  readonly framework: "langchain"
  readonly tool_name: string
  readonly tool_system: GatewayToolSystem
  readonly risk_class: GatewayRiskClass
  readonly intent: string
  readonly scope: Record<string, unknown>
  readonly constraints: Record<string, unknown>
  readonly proposal_space: "populated"
  readonly authority_space: "not_populated"
  readonly execution_space: "not_populated"
  readonly requires_authority_binding: boolean
  readonly proposed_at: string
  readonly non_operative: true
}

// GovernanceProposal — the gateway's output artifact, eligible for authority review only.
// Does NOT become ATAO until authority approves.
export type AgentToolGovernanceProposal = {
  readonly proposal_id: string
  readonly proposal_class: "GOVERNANCE_PROPOSAL"
  readonly cip_id: string
  readonly observation_id: string
  readonly observation_hash: string
  readonly agent_id: string
  readonly session_id: string
  readonly framework: "langchain"
  readonly tool_name: string
  readonly tool_system: GatewayToolSystem
  readonly risk_class: GatewayRiskClass
  readonly intent: string
  readonly scope: Record<string, unknown>
  readonly constraints: Record<string, unknown>
  readonly requires_authority_binding: boolean
  readonly proposal_status: "PENDING_AUTHORITY_REVIEW"
  readonly created_at: string
  readonly non_operative: true
  readonly creates_atao: false
  readonly creates_aeo: false
}

// Ω Validator boundary — all seven conditions required for execution eligibility
export type OmegaValidatorConditions = {
  readonly valid: boolean
  readonly authorized: boolean
  readonly unused: boolean
  readonly policy_valid: boolean
  readonly replay_safe: boolean
  readonly topology_visible: boolean
  readonly reconcilable: boolean
}

export type OmegaValidatorResult = "VALID" | "NULL"

export type GatewayInterceptOutcome =
  | {
      readonly status: "INTERCEPTED"
      readonly observation: AgentToolObservationArtifact
      readonly observation_hash: string
      readonly cip: GatewayClassifiedInterceptionProposal
      readonly proposal: AgentToolGovernanceProposal
      readonly non_operative: true
    }
  | { readonly status: "NULL"; readonly reason: string; readonly non_operative: true }

// Deterministic risk table — tool_name → (system, risk_class)
const GATEWAY_TOOL_RISK_TABLE: ReadonlyMap<string, { readonly system: GatewayToolSystem; readonly risk_class: GatewayRiskClass }> = new Map([
  ["read_file",           { system: "filesystem", risk_class: "P0" }],
  ["list_directory",      { system: "filesystem", risk_class: "P0" }],
  ["search_files",        { system: "filesystem", risk_class: "P0" }],
  ["get_file_contents",   { system: "github",     risk_class: "P0" }],
  ["list_issues",         { system: "github",     risk_class: "P0" }],
  ["list_pull_requests",  { system: "github",     risk_class: "P0" }],
  ["search_code",         { system: "github",     risk_class: "P0" }],
  ["http_get",            { system: "http_api",   risk_class: "P0" }],
  ["db_read",             { system: "database",   risk_class: "P0" }],
  ["http_post",           { system: "http_api",   risk_class: "P1" }],
  ["http_put",            { system: "http_api",   risk_class: "P1" }],
  ["http_patch",          { system: "http_api",   risk_class: "P1" }],
  ["http_delete",         { system: "http_api",   risk_class: "P1" }],
  ["create_issue",        { system: "github",     risk_class: "P2" }],
  ["create_pull_request", { system: "github",     risk_class: "P2" }],
  ["merge_pull_request",  { system: "github",     risk_class: "P2" }],
  ["push_files",          { system: "github",     risk_class: "P2" }],
  ["write_file",          { system: "filesystem", risk_class: "P2" }],
  ["delete_file",         { system: "filesystem", risk_class: "P2" }],
  ["create_directory",    { system: "filesystem", risk_class: "P2" }],
  ["db_write",            { system: "database",   risk_class: "P3" }],
  ["db_delete",           { system: "database",   risk_class: "P3" }],
  ["db_mutate",           { system: "database",   risk_class: "P3" }],
  ["terminal_command",    { system: "shell",      risk_class: "P3" }],
  ["shell_exec",          { system: "shell",      risk_class: "P3" }],
  ["run_command",         { system: "shell",      risk_class: "P3" }],
  ["workflow_dispatch",   { system: "ci_cd",      risk_class: "P3" }],
  ["trigger_build",       { system: "ci_cd",      risk_class: "P3" }],
  ["deploy_action",       { system: "deploy",     risk_class: "P3" }],
  ["deploy_workflow",     { system: "deploy",     risk_class: "P3" }],
])

export function classifyGatewayToolSurface(toolName: string): { readonly system: GatewayToolSystem; readonly risk_class: GatewayRiskClass } {
  const normalized = toolName.toLowerCase().replace(/[-\s]/g, "_")
  const tableEntry = GATEWAY_TOOL_RISK_TABLE.get(normalized)
  if (tableEntry) return tableEntry
  if (/\bread\b|^get_|^list_|^search_|^fetch_|^query_|^describe_|^inspect_|^view_|^show_/.test(normalized)) return { system: "read_only", risk_class: "P0" }
  if (/deploy|release|publish|ship/.test(normalized)) return { system: "deploy", risk_class: "P3" }
  if (/shell|exec|run_|command|terminal/.test(normalized)) return { system: "shell", risk_class: "P3" }
  if (/workflow|dispatch|pipeline|ci_|cd_/.test(normalized)) return { system: "ci_cd", risk_class: "P3" }
  if (/db_|database|sql|_table|_row/.test(normalized)) return { system: "database", risk_class: "P2" }
  if (/github|_pr_|_merge_|_branch|_commit|_issue/.test(normalized)) return { system: "github", risk_class: "P2" }
  if (/write_|delete_|create_|update_|patch_|put_/.test(normalized)) return { system: "filesystem", risk_class: "P2" }
  return { system: "http_api", risk_class: "P1" }
}

export function formObservationArtifact(input: {
  readonly agent_id: string
  readonly session_id: string
  readonly tool_name: string
  readonly tool_input: Record<string, unknown>
  readonly observed_at: string
}): AgentToolObservationArtifact {
  const { system, risk_class } = classifyGatewayToolSurface(input.tool_name)
  const observation_id = `obs:gateway:${input.tool_name}:${input.agent_id}:${input.observed_at}`
  return Object.freeze({
    observation_id,
    agent_id: input.agent_id,
    session_id: input.session_id,
    framework: "langchain" as const,
    tool_name: input.tool_name,
    tool_input: Object.freeze({ ...input.tool_input }),
    tool_system: system,
    risk_class,
    observed_at: input.observed_at,
    non_operative: true as const,
    creates_authority: false as const,
    creates_execution_eligibility: false as const,
  })
}

// CIP transforms the observation artifact into a governance proposal candidate.
// CIP is the membrane: understanding → proposal. Not proposal → permission.
export function formCIPProposal(
  observation: AgentToolObservationArtifact,
  observation_hash: string,
  intent: string,
  scope: Record<string, unknown>,
  constraints: Record<string, unknown>,
): GatewayClassifiedInterceptionProposal {
  const requires_authority_binding = observation.risk_class !== "P0"
  const cip_id = `cip:${observation.observation_id}:${observation_hash}`
  return Object.freeze({
    cip_id,
    observation_id: observation.observation_id,
    observation_hash,
    agent_id: observation.agent_id,
    session_id: observation.session_id,
    framework: "langchain" as const,
    tool_name: observation.tool_name,
    tool_system: observation.tool_system,
    risk_class: observation.risk_class,
    intent,
    scope: Object.freeze({ ...scope }),
    constraints: Object.freeze({ ...constraints }),
    proposal_space: "populated" as const,
    authority_space: "not_populated" as const,
    execution_space: "not_populated" as const,
    requires_authority_binding,
    proposed_at: observation.observed_at,
    non_operative: true as const,
  })
}

export function formGovernanceProposal(cip: GatewayClassifiedInterceptionProposal): AgentToolGovernanceProposal {
  const proposal_id = `proposal:${cip.cip_id}`
  return Object.freeze({
    proposal_id,
    proposal_class: "GOVERNANCE_PROPOSAL" as const,
    cip_id: cip.cip_id,
    observation_id: cip.observation_id,
    observation_hash: cip.observation_hash,
    agent_id: cip.agent_id,
    session_id: cip.session_id,
    framework: "langchain" as const,
    tool_name: cip.tool_name,
    tool_system: cip.tool_system,
    risk_class: cip.risk_class,
    intent: cip.intent,
    scope: cip.scope,
    constraints: cip.constraints,
    requires_authority_binding: cip.requires_authority_binding,
    proposal_status: "PENDING_AUTHORITY_REVIEW" as const,
    created_at: cip.proposed_at,
    non_operative: true as const,
    creates_atao: false as const,
    creates_aeo: false as const,
  })
}

// Ω Validator boundary: VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE → VALID | NULL
export function checkOmegaValidatorBoundary(conditions: OmegaValidatorConditions): OmegaValidatorResult {
  if (
    conditions.valid &&
    conditions.authorized &&
    conditions.unused &&
    conditions.policy_valid &&
    conditions.replay_safe &&
    conditions.topology_visible &&
    conditions.reconcilable
  ) {
    return "VALID"
  }
  return "NULL"
}

// interceptToolCall — gateway entry point.
// Produces: Observation Artifact → CIP → GovernanceProposal
// Does NOT produce: ATAO, AEO, authority, execution eligibility
export function interceptToolCall(input: {
  readonly agent_id: string
  readonly session_id: string
  readonly tool_name: string
  readonly tool_input: Record<string, unknown>
  readonly intent: string
  readonly scope: Record<string, unknown>
  readonly constraints: Record<string, unknown>
  readonly timestamp: string
}): GatewayInterceptOutcome {
  if (!input.tool_name || typeof input.tool_name !== "string") {
    return Object.freeze({ status: "NULL" as const, reason: "missing_tool_name", non_operative: true as const })
  }
  if (!input.agent_id || !input.session_id) {
    return Object.freeze({ status: "NULL" as const, reason: "missing_agent_context", non_operative: true as const })
  }
  if (!input.intent) {
    return Object.freeze({ status: "NULL" as const, reason: "missing_intent", non_operative: true as const })
  }
  const observation = formObservationArtifact({
    agent_id: input.agent_id,
    session_id: input.session_id,
    tool_name: input.tool_name,
    tool_input: input.tool_input,
    observed_at: input.timestamp,
  })
  const observation_hash = hashCanonical(observation)
  const cip = formCIPProposal(observation, observation_hash, input.intent, input.scope, input.constraints)
  const proposal = formGovernanceProposal(cip)
  return Object.freeze({
    status: "INTERCEPTED" as const,
    observation,
    observation_hash,
    cip,
    proposal,
    non_operative: true as const,
  })
}
