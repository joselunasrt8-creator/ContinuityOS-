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
import type { PurePredicateDefinition } from './predicate-registry.js'

// ── AEO Template Registry types ───────────────────────────────────────────────

export type AEORiskClass =
  | "P0_READ_ONLY"
  | "P1_EXECUTION_ADJACENT"
  | "P2_BOUNDED_MUTATION"
  | "P3_EXTERNAL_MUTATION"
  | "P4_PRIVILEGED_EXECUTION"
  | "P5_AUTONOMOUS_RECURSIVE"

export type AEOTemplateStatus = "ACTIVE" | "INACTIVE" | "DRAFT"

export type AEOTemplate = {
  readonly template_id: string
  readonly schema_version: string
  readonly surface_type: string
  readonly status: AEOTemplateStatus
  readonly risk_floor: string
  readonly required_scope_fields: readonly string[]
  readonly required_target_fields: readonly string[]
  readonly required_validation_fields: readonly string[]
  readonly required_finality_fields: readonly string[]
  readonly predicate_set: readonly string[]
  readonly failure_result: string
  readonly created_at: string
}

export type AEOTemplateSelectResult =
  | { readonly result: "VALID_TEMPLATE"; readonly template: AEOTemplate }
  | { readonly result: "NULL"; readonly reason: AEOTemplateNullReason }

export type AEOTemplateNullReason =
  | "TEMPLATE_NOT_FOUND"
  | "SCHEMA_INACTIVE"
  | "TEMPLATE_SURFACE_MISMATCH"
  | "RISK_FLOOR_VIOLATION"

// Minimal DB interface required for template lookup
export interface AEOTemplateDB {
  prepare(sql: string): {
    bind(...params: unknown[]): { first<T>(): Promise<T | null> }
  }
}

// Extracts the numeric risk level from P0_READ_ONLY / P0 / P4_PRIVILEGED_EXECUTION / etc.
function riskLevel(riskClass: string): number {
  const m = riskClass.match(/P(\d+)/)
  return m ? parseInt(m[1], 10) : -1
}

function parseJsonArray(raw: unknown): string[] {
  if (typeof raw !== "string") return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

// selectAEOTemplate: registry-backed template selection.
// surface_type → template_id → predicate_set → VALID_TEMPLATE | NULL
//
// Rules:
//   unknown surface_type    → NULL TEMPLATE_NOT_FOUND
//   INACTIVE template       → NULL SCHEMA_INACTIVE
//   DRAFT template          → NULL SCHEMA_INACTIVE
//   risk_class < risk_floor → NULL RISK_FLOOR_VIOLATION
//   surface mismatch        → NULL TEMPLATE_SURFACE_MISMATCH
//   ACTIVE + matching       → VALID_TEMPLATE (predicate_set loaded)
//
// VALID_TEMPLATE does NOT authorize execution.
// Execution requires authority, validation, replay safety, topology visibility,
// reconciliation, and proof.
export async function selectAEOTemplate(
  surface_type: string,
  risk_class: string,
  db: AEOTemplateDB,
): Promise<AEOTemplateSelectResult> {
  const row = await db
    .prepare(`SELECT * FROM aeo_template_registry WHERE surface_type = ?1 LIMIT 1`)
    .bind(surface_type)
    .first<Record<string, unknown>>()

  if (!row) {
    return Object.freeze({ result: "NULL" as const, reason: "TEMPLATE_NOT_FOUND" as const })
  }

  const status = String(row.status || "")
  if (status !== "ACTIVE") {
    return Object.freeze({ result: "NULL" as const, reason: "SCHEMA_INACTIVE" as const })
  }

  const templateSurface = String(row.surface_type || "")
  if (templateSurface !== surface_type) {
    return Object.freeze({ result: "NULL" as const, reason: "TEMPLATE_SURFACE_MISMATCH" as const })
  }

  const riskFloor = String(row.risk_floor || "")
  if (riskLevel(risk_class) < riskLevel(riskFloor)) {
    return Object.freeze({ result: "NULL" as const, reason: "RISK_FLOOR_VIOLATION" as const })
  }

  const template: AEOTemplate = Object.freeze({
    template_id: String(row.template_id || ""),
    schema_version: String(row.schema_version || ""),
    surface_type: templateSurface,
    status: "ACTIVE" as const,
    risk_floor: riskFloor,
    required_scope_fields: Object.freeze(parseJsonArray(row.required_scope_fields)),
    required_target_fields: Object.freeze(parseJsonArray(row.required_target_fields)),
    required_validation_fields: Object.freeze(parseJsonArray(row.required_validation_fields)),
    required_finality_fields: Object.freeze(parseJsonArray(row.required_finality_fields)),
    predicate_set: Object.freeze(parseJsonArray(row.predicate_set)),
    failure_result: String(row.failure_result || "NULL"),
    created_at: String(row.created_at || ""),
  })

  return Object.freeze({ result: "VALID_TEMPLATE" as const, template })
}


// ── Issue #1773: Agent Tool AEO Template Registry resolution ────────────────
// Pure lookup boundary only. Resolution does not create/reserve authority,
// validate execution, generate proof, execute tools, or mutate replay state.

export type AgentToolAEOTemplateStatus = "ACTIVE" | "INACTIVE" | "DEPRECATED" | "DRAFT"

export type AgentToolAEOTemplateDefinition = {
  readonly template_id: string
  readonly schema_version: string
  readonly surface_type: string
  readonly risk_floor: string
  readonly predicate_set_id: string
  readonly predicate_hash: string
  readonly lineage_version: string
}

export interface AgentToolAEOTemplateDB {
  prepare(sql: string): {
    bind(...params: unknown[]): { all<T>(): Promise<{ results?: T[] } | T[]> }
  }
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// resolveAgentToolTemplate: deterministic Phase 3A template lookup.
//
// Rules:
//   missing / unknown surface_type     → NULL
//   0 ACTIVE matches                  → NULL
//   >1 ACTIVE matches                 → NULL
//   INACTIVE / DEPRECATED / DRAFT     → NULL (not selected by ACTIVE lookup)
//   missing predicate_hash            → NULL
//   missing lineage_version           → NULL
//   exactly 1 ACTIVE complete row     → topology-visible template definition
//
// Non-goals preserved here:
//   no authority creation or reservation
//   no Ω validator execution
//   no tool execution
//   no proof generation
//   no replay mutation or replay enforcement
export async function resolveAgentToolTemplate(
  surface_type: string | null | undefined,
  db: AgentToolAEOTemplateDB,
): Promise<AgentToolAEOTemplateDefinition | null> {
  const requestedSurfaceType = nonEmptyText(surface_type)
  if (!requestedSurfaceType) return null

  const queryResult = await db
    .prepare(
      `SELECT template_id, schema_version, surface_type, status, risk_floor, predicate_set_id, predicate_hash, lineage_version
       FROM agent_tool_aeo_template_registry
       WHERE surface_type = ?1 AND status = 'ACTIVE'
       ORDER BY template_id ASC, schema_version ASC`,
    )
    .bind(requestedSurfaceType)
    .all<Record<string, unknown>>()

  const rows = Array.isArray(queryResult) ? queryResult : (queryResult.results ?? [])
  if (rows.length !== 1) return null

  const row = rows[0]
  const status = nonEmptyText(row.status)
  const templateSurfaceType = nonEmptyText(row.surface_type)
  const templateId = nonEmptyText(row.template_id)
  const schemaVersion = nonEmptyText(row.schema_version)
  const riskFloor = nonEmptyText(row.risk_floor)
  const predicateSetId = nonEmptyText(row.predicate_set_id)
  const predicateHash = nonEmptyText(row.predicate_hash)
  const lineageVersion = nonEmptyText(row.lineage_version)

  if (status !== "ACTIVE") return null
  if (templateSurfaceType !== requestedSurfaceType) return null
  if (!templateId || !schemaVersion || !riskFloor || !predicateSetId || !predicateHash || !lineageVersion) return null

  return Object.freeze({
    template_id: templateId,
    schema_version: schemaVersion,
    surface_type: templateSurfaceType,
    risk_floor: riskFloor,
    predicate_set_id: predicateSetId,
    predicate_hash: predicateHash,
    lineage_version: lineageVersion,
  })
}

export type ValidatorBinding = {
  readonly template_id: string
  readonly schema_version: string
  readonly predicate_set_id: string
  readonly predicate_hash: string
  readonly lineage_version: string
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

// ── Phase 3A: Template-Bound Ω Validator Binding ───────────────────────────
// Binding artifact only: template identity + predicate identity + lineage
// visibility. This establishes deterministic predicate identity visibility
// after template resolution and before any future predicate execution.
//
// Non-goals preserved here:
//   no authority creation
//   no validator execution
//   no predicate execution
//   no proof generation
//   no replay mutation
//   no execution authorization
export function createValidatorBinding(
  template_id: string | null | undefined,
  schema_version: string | null | undefined,
  predicate_set_id: string | null | undefined,
  predicate_hash: string | null | undefined,
  lineage_version: string | null | undefined,
): ValidatorBinding | null {
  if (!isNonBlankString(template_id)) return null
  if (!isNonBlankString(schema_version)) return null
  if (!isNonBlankString(predicate_set_id)) return null
  if (!isNonBlankString(predicate_hash)) return null
  if (!isNonBlankString(lineage_version)) return null

  return Object.freeze({
    template_id,
    schema_version,
    predicate_set_id,
    predicate_hash,
    lineage_version,
  })
}

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

// ── Issue #1789: Phase 3B Predicate Verification Contract ─────────────────────
// Binds template identity to predicate identity without performing validation,
// authority creation, execution authorization, proof generation, replay mutation,
// or Ω Validator evaluation.
//
// Non-goals preserved here:
//   no validator execution
//   no predicate execution
//   no proof generation
//   no authority creation
//   no execution eligibility
//   no database persistence

export type PredicateVerificationContract = {
  readonly contract_id: string
  readonly template_id: string
  readonly schema_version: string
  readonly predicate_set_id: string
  readonly predicate_hash: string
  readonly lineage_version: string
}

// createPredicateVerificationContract: deterministic binding of template identity
// and predicate identity. Fails closed on missing inputs, field mismatches, or
// purity violation.
export function createPredicateVerificationContract(
  binding: ValidatorBinding | null | undefined,
  predicate: PurePredicateDefinition | null | undefined,
): PredicateVerificationContract | null {
  if (!binding || !predicate) return null
  if (predicate.side_effects_allowed !== false) return null
  if (!isNonBlankString(binding.template_id)) return null
  if (!isNonBlankString(binding.schema_version)) return null
  if (!isNonBlankString(binding.predicate_set_id)) return null
  if (!isNonBlankString(binding.predicate_hash)) return null
  if (!isNonBlankString(binding.lineage_version)) return null
  if (binding.predicate_set_id !== predicate.predicate_set_id) return null
  if (binding.predicate_hash !== predicate.predicate_hash) return null
  if (binding.lineage_version !== predicate.lineage_version) return null

  const contract_id = hashCanonical({
    template_id: binding.template_id,
    schema_version: binding.schema_version,
    predicate_set_id: binding.predicate_set_id,
    predicate_hash: binding.predicate_hash,
    lineage_version: binding.lineage_version,
  })

  return Object.freeze({
    contract_id,
    template_id: binding.template_id,
    schema_version: binding.schema_version,
    predicate_set_id: binding.predicate_set_id,
    predicate_hash: binding.predicate_hash,
    lineage_version: binding.lineage_version,
  })
}

// ── Issue #1790: Phase 3C Ω Validator Input Envelope ─────────────────────────
// Binds validator identity, predicate identity, and contract identity into a
// deterministic envelope artifact. Transport / identity structure only.
//
// Non-goals preserved here:
//   no validator execution
//   no predicate execution
//   no validation
//   no authority creation
//   no execution eligibility
//   no proof generation
//   no replay mutation
//   no database persistence
//
// Topology:
//   Predicate Verification Contract
//   → Ω Validator Input Envelope
//   → Future Ω Validator

export type OmegaValidatorInputEnvelope = {
  readonly envelope_id: string
  readonly contract_id: string
  readonly template_id: string
  readonly predicate_set_id: string
  readonly predicate_hash: string
  readonly lineage_version: string
}

// createOmegaValidatorInputEnvelope: forms a deterministic envelope from a
// PredicateVerificationContract. Verifies contract integrity by recomputing the
// contract_id from its constituent fields before forming the envelope.
// Fails closed on missing fields, blank fields, or contract hash mismatch.
export function createOmegaValidatorInputEnvelope(
  contract: PredicateVerificationContract | null | undefined,
): OmegaValidatorInputEnvelope | null {
  if (!contract) return null
  if (!isNonBlankString(contract.contract_id)) return null
  if (!isNonBlankString(contract.template_id)) return null
  if (!isNonBlankString(contract.schema_version)) return null
  if (!isNonBlankString(contract.predicate_set_id)) return null
  if (!isNonBlankString(contract.predicate_hash)) return null
  if (!isNonBlankString(contract.lineage_version)) return null

  const recomputedContractId = hashCanonical({
    template_id: contract.template_id,
    schema_version: contract.schema_version,
    predicate_set_id: contract.predicate_set_id,
    predicate_hash: contract.predicate_hash,
    lineage_version: contract.lineage_version,
  })
  if (recomputedContractId !== contract.contract_id) return null

  const envelope_id = hashCanonical({
    contract_id: contract.contract_id,
    template_id: contract.template_id,
    predicate_set_id: contract.predicate_set_id,
    predicate_hash: contract.predicate_hash,
    lineage_version: contract.lineage_version,
  })

  return Object.freeze({
    envelope_id,
    contract_id: contract.contract_id,
    template_id: contract.template_id,
    predicate_set_id: contract.predicate_set_id,
    predicate_hash: contract.predicate_hash,
    lineage_version: contract.lineage_version,
  })
}

// ── Issue #1791: Phase 3D Ω Validator Evaluation Context and Outcome ─────────
// Bounded outcome formation from an OmegaValidatorInputEnvelope and evaluation
// context. Evaluation terminates at outcome formation only.
//
// Topology:
//   Ω Validator Input Envelope + Evaluation Context
//   → Ω Validator Outcome (VALID | NULL)
//   → Future Execution Boundary Proof (not implemented here)
//
// Non-goals preserved here:
//   no authority creation
//   no execution permission
//   no predicate execution
//   no proof generation
//   no proof capture
//   no persistence
//   no runtime route
//   no execution boundary invocation

export type OmegaValidatorEvaluationContext = {
  readonly conditions: OmegaValidatorConditions
}

export type OmegaValidatorOutcome = {
  readonly outcome_id: string
  readonly envelope_id: string
  readonly contract_id: string
  readonly predicate_hash: string
  readonly lineage_version: string
  readonly result: OmegaValidatorResult
  readonly conditions: OmegaValidatorConditions
}

const OMEGA_CONDITION_KEYS: ReadonlyArray<keyof OmegaValidatorConditions> = [
  'valid', 'authorized', 'unused', 'policy_valid', 'replay_safe', 'topology_visible', 'reconcilable',
]

// evaluateOmegaValidator: bounded outcome formation from envelope and conditions.
// Recomputes envelope_id to verify envelope integrity before evaluating.
// Uses checkOmegaValidatorBoundary to determine result from conditions.
// Fails closed on null/missing inputs, blank fields, tampered envelope_id,
// missing or malformed conditions, or non-boolean condition values.
// Outcome formation does not mutate runtime state.
export function evaluateOmegaValidator(
  envelope: OmegaValidatorInputEnvelope | null | undefined,
  context: OmegaValidatorEvaluationContext | null | undefined,
): OmegaValidatorOutcome | null {
  if (!envelope) return null
  if (!isNonBlankString(envelope.envelope_id)) return null
  if (!isNonBlankString(envelope.contract_id)) return null
  if (!isNonBlankString(envelope.template_id)) return null
  if (!isNonBlankString(envelope.predicate_set_id)) return null
  if (!isNonBlankString(envelope.predicate_hash)) return null
  if (!isNonBlankString(envelope.lineage_version)) return null

  const recomputedEnvelopeId = hashCanonical({
    contract_id: envelope.contract_id,
    template_id: envelope.template_id,
    predicate_set_id: envelope.predicate_set_id,
    predicate_hash: envelope.predicate_hash,
    lineage_version: envelope.lineage_version,
  })
  if (recomputedEnvelopeId !== envelope.envelope_id) return null

  if (!context) return null
  const conditions = context.conditions
  if (!conditions || typeof conditions !== 'object') return null
  for (const key of OMEGA_CONDITION_KEYS) {
    if (typeof conditions[key] !== 'boolean') return null
  }

  const result = checkOmegaValidatorBoundary(conditions)

  const frozenConditions: OmegaValidatorConditions = Object.freeze({
    valid: conditions.valid,
    authorized: conditions.authorized,
    unused: conditions.unused,
    policy_valid: conditions.policy_valid,
    replay_safe: conditions.replay_safe,
    topology_visible: conditions.topology_visible,
    reconcilable: conditions.reconcilable,
  })

  const outcome_id = hashCanonical({
    envelope_id: envelope.envelope_id,
    contract_id: envelope.contract_id,
    predicate_hash: envelope.predicate_hash,
    lineage_version: envelope.lineage_version,
    result,
    conditions: frozenConditions,
  })

  return Object.freeze({
    outcome_id,
    envelope_id: envelope.envelope_id,
    contract_id: envelope.contract_id,
    predicate_hash: envelope.predicate_hash,
    lineage_version: envelope.lineage_version,
    result,
    conditions: frozenConditions,
  })
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
