type Env = { DB: D1Database, API_KEY?: string, PROVENANCE_HMAC_SECRET?: string, CANONICAL_RUNTIME_SURFACE_HASH?: string }

type BootstrapDiagnosticEvent =
  | "BOOTSTRAP_SCHEMA_INITIALIZED"
  | "BOOTSTRAP_MIGRATIONS_VALIDATED"
  | "BOOTSTRAP_DUPLICATE_PROOF_DETECTED"
  | "BOOTSTRAP_DUPLICATE_PROOF_QUARANTINED"
  | "BOOTSTRAP_PROOF_LINEAGE_RECONCILED"
  | "BOOTSTRAP_REGISTRY_STABILIZED"
  | "BOOTSTRAP_UNIQUENESS_ENFORCED"
  | "BOOTSTRAP_RECURSIVE_GOVERNANCE_VERIFIED"
  | "BOOTSTRAP_RUNTIME_EVOLUTION_CONSENSUS_REGISTRY_VALIDATED"
  | "BOOTSTRAP_RUNTIME_SOVEREIGNTY_FROZEN"
  | "BOOTSTRAP_SOVEREIGNTY_CHECKPOINT_GENERATED"
  | "BOOTSTRAP_APPEND_ONLY_TRIGGERS_ACTIVATED"
  | "BOOTSTRAP_RUNTIME_READY"

type CanonicalAEO = {
  intent: string
  scope: Record<string, unknown>
  validation: Record<string, unknown>
  target: Record<string, unknown>
  finality: Record<string, unknown>
}

const REQUIRED_AEO_KEYS = ["intent", "scope", "validation", "target", "finality"] as const
const GOVERNED_WORKFLOW = "governed-deploy.yml"
const RUNTIME_ID = "mindshift-worker-runtime" as const
const RUNTIME_VERSION = "runtime-sovereignty-v1" as const
const RUNTIME_SOVEREIGNTY_ROUTE = "/runtime/sovereignty" as const
const EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE = "/runtime/sovereignty/external-authority" as const
const BOOTSTRAP_READY_DATABASES = new WeakSet<D1Database>()
const RUNTIME_SOVEREIGNTY_FREEZES = new WeakMap<D1Database, RuntimeSovereigntyManifest>()
const PROVENANCE_PAYLOAD_TYPE = "application/vnd.mindshift.cryptographic-provenance.v1+json"
const SESSION_TTL_MS = 3600_000
const SYSTEM_MAX_CONTINUITY_DEPTH = 32
const CANONICAL_RUNTIME_ROUTES = ["/session", "/continuity", "/authority", "/compile", "/validate", "/execute", "/proof"] as const
const GOVERNANCE_EVIDENCE_ROUTES = ["/preo"] as const
const RECURSIVE_GOVERNANCE_ROUTE = "/governance/recursive/verify" as const
const RECURSIVE_GOVERNANCE_ADMISSION_ROUTE = "/governance/recursive/admit" as const
const RECURSIVE_GOVERNANCE_SELF_INTEGRITY_ROUTE = "/governance/recursive/self-integrity" as const
const RUNTIME_EVOLUTION_CONSENSUS_ROUTE = "/governance/evolution/consensus" as const
const RUNTIME_EVOLUTION_CONSENSUS_REGISTRY = "runtime_evolution_consensus_registry" as const
const NON_EXECUTABLE_OBSERVABILITY_ROUTES = [RUNTIME_SOVEREIGNTY_ROUTE, RUNTIME_EVOLUTION_CONSENSUS_ROUTE, "/governance/recursive/verify", "/governance/recursive/self-integrity", "/reconcile", "/reconcile/schedule", "/reconcile/report", "/reconcile/drift", "/federation/reconcile", "/federation/reconcile/report", "/federation/reconcile/drift", "/federation/reconcile/checkpoint", "/federation/reconcile/revocation", "/federation/reconcile/topology", "/federation/reconcile/distributed", "/federation/reconcile/compression", "/federation/interoperability/checkpoint", "/federation/conformance", "/federation/sovereignty/checkpoint", EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE] as const
const REQUIRE_PREO_LINEAGE = "explicit_governed_deploy_policy" as const
const CANONICAL_RECONCILIATION_REGISTRY_ORDER = [
  "session_registry",
  "continuity_registry",
  "authority_registry",
  "aeo_registry",
  "validation_registry",
  "execution_registry",
  "proof_registry",
  "invocation_registry",
  "preo_registry"
] as const
const RECONCILIATION_MAX_RECURSION_DEPTH = SYSTEM_MAX_CONTINUITY_DEPTH
const RECONCILIATION_ROW_LIMIT = 2
const RECONCILIATION_SCHEDULER_BATCH_LIMIT = 25
const FEDERATED_RECONCILIATION_PAYLOAD_TYPE = "application/vnd.mindshift.federated-reconciliation.v1+json"
const LOCAL_FEDERATION_RUNTIME_ID = "mindshift-local-runtime"
const FEDERATED_REVOCATION_OBSERVABILITY_REGISTRY = "federated_revocation_observability_registry" as const
const FEDERATED_TRUST_REGISTRY = "federated_trust_registry" as const
const REVOCATION_TOPOLOGY_REGISTRY = "revocation_topology_registry" as const
const DISTRIBUTED_LEGITIMACY_REGISTRY = "distributed_legitimacy_registry" as const
const FEDERATED_CHECKPOINT_REGISTRY = "federated_checkpoint_registry" as const
const FEDERATION_CONFORMANCE_REGISTRY = "federation_conformance_registry" as const
const FEDERATED_SOVEREIGNTY_REGISTRY = "federated_sovereignty_registry" as const


const REQUIRED_SCHEMA_COLUMNS: Record<string, string[]> = {
  session_registry: ["session_id", "identity_id", "owner", "trust_tier", "continuity_status", "created_at", "expires_at"],
  continuity_registry: ["continuity_id", "identity_id", "session_id", "parent_continuity_id", "continuity_hash", "canonical_continuity", "status", "issued_at", "expires_at", "revoked_at"],
  authority_registry: ["authority_id", "decision_id", "session_id", "owner", "intent", "scope", "constraints", "expiry", "status", "created_at", "continuity_id", "identity_id"],
  aeo_registry: ["aeo_id", "authority_id", "decision_id", "canonical_aeo", "validated_object_hash", "status", "created_at", "continuity_id"],
  preo_registry: ["preo_id", "decision_id", "authority_id", "continuity_id", "reviewed_hash", "reviewed_tree_hash", "merge_commit_sha", "canonical_preo", "status", "created_at"],
  validation_registry: ["validation_id", "session_id", "decision_id", "validated_object_hash", "invocation_nonce", "environment", "result", "reason", "status", "created_at", "continuity_id"],
  execution_registry: ["execution_id", "session_id", "decision_id", "validated_object_hash", "invocation_nonce", "status", "created_at", "continuity_id", "repository", "branch", "pull_request_id", "merge_commit_sha", "source_tree_hash", "workflow_run_id", "workflow_sha"],
  proof_registry: ["proof_id", "session_id", "execution_id", "decision_id", "validated_object_hash", "surface", "run_id", "commit_sha", "workflow", "environment", "created_at", "continuity_id", "continuity_hash", "identity_id", "authority_lineage", "execution_lineage", "repository", "branch", "pull_request_id", "merge_commit_sha", "source_tree_hash", "workflow_run_id", "workflow_sha"],
  proof_registry_duplicate_archive: ["archive_id", "proof_id", "session_id", "execution_id", "decision_id", "validated_object_hash", "surface", "run_id", "commit_sha", "workflow", "environment", "created_at", "archived_at", "archive_reason", "canonical_proof_id"],
  proof_quarantine_registry: ["quarantine_id", "proof_id", "lineage_hash", "quarantine_reason", "canonical_proof_selected", "duplicate_proof_archived", "quarantine_generated_at", "replay_neutral", "evidence_only"],
  invocation_registry: ["decision_id", "validated_object_hash", "invocation_nonce", "status", "created_at", "continuity_id"],
  attestation_registry: ["attestation_id", "envelope_hash", "payload_hash", "payload_type", "signer_identity", "decision_id", "validated_object_hash", "workflow_run_id", "workflow_sha", "canonical_aeo_hash", "transparency_log_id", "transparency_integrated_time", "status", "created_at"],
  observability_registry: ["event_id", "event_type", "decision_id", "authority_id", "execution_id", "proof_id", "severity", "payload", "created_at"],
  drift_registry: ["drift_id", "drift_class", "severity", "decision_id", "execution_id", "payload", "detected_by", "resolution_status", "created_at"],
  federated_reconciliation_registry: ["reconciliation_id", "checkpoint_hash", "canonical_hash", "lineage_root", "continuity_root", "federation_classification", "drift_summary", "replay_indicators", "topology_hash", "generated_at"],
  federated_revocation_observability_registry: ["revocation_evidence_id", "runtime_id", "remote_runtime_id", "continuity_id", "decision_id", "validated_object_hash", "revocation_class", "revocation_reason", "lineage_hash", "reconciliation_merkle_root", "attestation_hash", "observed_at", "evidence_hash", "verification_status", "drift_class", "created_at"],
  governance_compression_registry: ["compression_id", "reconciliation_root", "checkpoint_set_hash", "topology_root", "lineage_root", "federation_classification", "compressed_drift_summary", "compressed_replay_summary", "participating_runtimes", "canonical_hash", "generated_at", "created_at"],
  federated_trust_registry: ["trust_envelope_id", "federation_origin", "federation_tier", "verification_status", "evidence_only", "remote_authority_denied", "continuity_reference", "lineage_root", "observed_at", "canonical_hash", "created_at"],
  revocation_topology_registry: ["topology_id", "authority_id", "continuity_id", "lineage_root", "topology_hash", "drift_summary", "observed_at", "created_at"],
  distributed_legitimacy_registry: ["envelope_id", "canonical_hash", "lineage_root", "continuity_id", "reconciliation_id", "federation_classification", "replay_indicators", "drift_indicators", "evidence_only", "remote_authority_denied", "read_only", "mutation_capable", "replay_neutral", "generated_at", "created_at"],
  federated_checkpoint_registry: ["checkpoint_envelope_id", "checkpoint_id", "canonical_hash", "lineage_root", "continuity_id", "reconciliation_id", "reconciliation_merkle_root", "federation_classification", "replay_indicators", "drift_indicators", "evidence_only", "remote_authority_denied", "read_only", "mutation_capable", "replay_neutral", "generated_at", "created_at"],
  federation_conformance_registry: ["conformance_id", "envelope_id", "runtime_id", "remote_runtime_id", "fingerprint_hash", "checkpoint_hash", "compatibility_hash", "conformance_status", "drift_classes", "evidence_only", "remote_authority_denied", "read_only", "mutation_capable", "replay_neutral", "generated_at", "created_at"],
  federated_sovereignty_registry: ["federation_id", "local_runtime_id", "remote_runtime_id", "sovereignty_hash", "equivalence_hash", "drift_summary", "replay_indicators", "verification_status", "evidence_only", "remote_authority_denied", "generated_at"],
  recursive_governance_registry: ["governance_id", "mutation_class", "mutation_scope", "target_surface", "mutation_hash", "sco_hash", "preo_hash", "governance_decision", "drift_classes", "exact_object_verified", "replay_neutral", "mutation_authorized", "proof_required", "canonical_path_preserved", "generated_at", "created_at"],
  runtime_sovereignty_registry: ["sovereignty_id", "sovereignty_hash", "runtime_surface_hash", "governance_surface_hash", "replay_surface_hash", "proof_surface_hash", "validator_surface_hash", "schema_hash", "migration_chain_hash", "generated_at"],
  external_authority_registry: ["sovereignty_dependency_id", "external_authority_surface", "authority_origin", "infrastructure_scope", "bootstrap_trust_hash", "sovereignty_classification", "containment_state", "observability_only", "replay_neutral", "evidence_hash", "drift_classes", "created_at"],
  runtime_governance_lock_registry: ["lock_id", "mutation_hash", "governance_id", "lock_state", "activation_allowed", "canonical_hash", "created_at"],
  recursive_governance_replay_registry: ["replay_id", "mutation_hash", "sco_hash", "preo_hash", "governance_id", "activation_lock_id", "consumed_at"],
  runtime_evolution_consensus_registry: ["consensus_id", "mutation_hash", "canonical_hash", "governance_scope", "quorum_threshold", "approval_count", "approval_hash", "consensus_status", "replay_neutral", "evidence_only", "generated_at", "created_at"]
}

type SchemaDiagnosticReason = "missing_required_table" | "missing_required_column" | "migration_required" | "database_unavailable" | "schema_initialization_failed"

class SchemaInitializationError extends Error {
  reason: SchemaDiagnosticReason

  constructor(reason: SchemaDiagnosticReason, cause?: unknown) {
    super(reason)
    this.reason = reason
    this.cause = cause
  }
}

class BootstrapRegistryUnstableError extends Error {
  reason: "bootstrap_registry_unstable"

  constructor(cause?: unknown) {
    super("bootstrap_registry_unstable")
    this.reason = "bootstrap_registry_unstable"
    this.cause = cause
  }
}

function schemaDiagnosticReason(error: unknown): SchemaDiagnosticReason {
  if (error instanceof SchemaInitializationError) return error.reason
  const message = String((error as any)?.message || error || "")
  if (/no such table/i.test(message)) return "missing_required_table"
  if (/no such column|has no column named/i.test(message)) return "missing_required_column"
  if (/duplicate column name|UNIQUE constraint failed|constraint failed|index.*already exists/i.test(message)) return "migration_required"
  if (/database|D1_|SQLITE_BUSY|SQLITE_IOERR/i.test(message)) return "database_unavailable"
  return "schema_initialization_failed"
}

type TelemetryEventType = "SESSION_CREATED" | "CONTINUITY_CREATED" | "AUTHORITY_CREATED" | "AEO_COMPILED" | "VALIDATION_GRANTED" | "VALIDATION_REJECTED" | "EXECUTION_STARTED" | "EXECUTION_COMPLETED" | "PROOF_PERSISTED" | "REPLAY_BLOCKED" | "HASH_MISMATCH" | "AUTHORITY_CONSUMED"


type RecursiveMutationClass = "runtime_route_mutation" | "validator_mutation" | "schema_mutation" | "authority_semantics_mutation" | "proof_semantics_mutation" | "replay_semantics_mutation" | "policy_mutation" | "observability_mutation" | "federation_semantics_mutation" | "governance_surface_expansion"
type RecursiveGovernanceState = "GOVERNANCE_OBSERVED" | "GOVERNANCE_VALIDATED" | "GOVERNANCE_QUARANTINED" | "GOVERNANCE_REJECTED" | "NULL"
type RecursiveMutationDriftClass = "executable_surface_expansion" | "bypass_path_introduction" | "runtime_mutation_after_validation" | "canonical_route_mutation" | "validator_weakening" | "schema_weakening" | "policy_semantics_mutation" | "proof_weakening" | "replay_weakening" | "authority_inheritance_expansion" | "mutation_capable_observability_route" | "exact_object_violation" | "missing_sco" | "missing_preo" | "canonical_path_violation"

type RuntimeMutationEnvelope = {
  mutation_class: RecursiveMutationClass
  mutation_scope: string
  target_surface: string
  mutation_hash: string
  sco_hash: string
  preo_hash: string
  proposed_object_hash: string
  validated_object_hash: string
  executable: boolean
  method: string
  validation_state: string
}

type GovernanceMutationEnvelope = RuntimeMutationEnvelope & {
  recursive_governance_invariant: "system_mutation_requires_legitimacy"
  canonical_execution_path: readonly string[]
}

type RecursiveGovernanceDecision = {
  governance_decision: RecursiveGovernanceState
  drift_classes: RecursiveMutationDriftClass[]
  exact_object_verified: boolean
  replay_neutral: true
  mutation_authorized: boolean
  proof_required: boolean
  canonical_path_preserved: boolean
}

type RecursiveGovernanceProof = {
  governance_id: string
  mutation_hash: string
  sco_hash: string
  preo_hash: string
  proof_hash: string
  evidence_only: true
  replay_consumed: false
}

type RecursiveGovernanceCheckpoint = {
  checkpoint_id: string
  governance_id: string
  envelope_hash: string
  decision_hash: string
  generated_at: string
}




type RuntimeSovereigntyManifest = {
  runtime_id: string
  runtime_version: string
  canonical_routes: readonly string[]
  observability_routes: readonly string[]
  governance_routes: readonly string[]
  validator_surface_hash: string
  schema_hash: string
  migration_chain_hash: string
  replay_topology_hash: string
  proof_topology_hash: string
  governance_registry_hash: string
  runtime_surface_hash: string
  sovereignty_hash: string
  generated_at: string
}

type RuntimeSovereigntyDriftClass =
  | "external_authority_drift"
  | "sovereignty_boundary_fragmentation"
  | "deploy_authority_escape"
  | "bootstrap_trust_divergence"
  | "undeclared_execution_surface"
  | "infrastructure_authority_expansion"
  | "hidden_mutation_surface"
  | "route_mutation"
  | "validator_mutation"
  | "schema_mutation"
  | "replay_topology_mutation"
  | "governance_topology_mutation"
  | "proof_topology_mutation"
  | "hidden_executable_surface_introduction"
  | "observability_route_mutation"
  | "authority_inheritance_expansion"
  | "runtime_surface_instability"

type ExternalAuthoritySovereigntyDependency = {
  sovereignty_dependency_id: string
  external_authority_surface: string
  authority_origin: string
  infrastructure_scope: string
  bootstrap_trust_hash: string
  sovereignty_classification: "BOUNDED_HOST" | "BOUNDED_TRANSPORT" | "BOUNDED_OBSERVER" | "BOUNDED_SCHEDULER" | "CONTAINED_DEPLOY_ENVELOPE" | "NULL"
  containment_state: "CLASSIFIED_BOUNDED_OBSERVABLE_REPLAY_NEUTRAL" | "DRIFT_BLOCKED" | "NULL"
  observability_only: true
  replay_neutral: true
  allowed_infrastructure_functions: readonly ("host" | "transport" | "observe" | "schedule")[]
  prohibited_authority_functions: readonly ("create_authority" | "bypass_validation" | "mutate_legitimacy" | "consume_replay_state" | "inherit_execution_legitimacy")[]
  deploy_authority_containment_envelope: {
    canonical_runtime_path: readonly string[]
    governed_workflow: string
    local_validation_supremacy: true
    exact_object_required: true
    remote_authority_inherited: false
    direct_deploy_allowed: false
  }
  bootstrap_trust_evidence: {
    evidence_type: "bootstrap_trust_evidence"
    authority_origin: string
    infrastructure_scope: string
    trust_material_hash: string
    replay_neutral: true
    observability_only: true
  }
}

type RuntimeSovereigntyDrift = {
  status: "CANONICAL" | "RUNTIME_SOVEREIGNTY_VIOLATION"
  drift_classes: RuntimeSovereigntyDriftClass[]
  expected_sovereignty_hash?: string
  actual_sovereignty_hash: string
}

type RuntimeSurfaceFingerprint = {
  routes: readonly string[]
  validators: readonly string[]
  schemas: readonly string[]
  governance_policies: readonly string[]
  observability_boundaries: readonly string[]
}

type RuntimeGovernanceLock = {
  lock_id: string
  mutation_hash: string
  governance_id: string
  lock_state: "LOCKED" | "NULL"
  activation_allowed: boolean
  canonical_hash: string
  created_at: string
}

type RecursiveGovernanceAdmission = {
  status: RecursiveGovernanceState
  envelope: GovernanceMutationEnvelope
  decision: RecursiveGovernanceDecision
  proof: RecursiveGovernanceProof
  lock: RuntimeGovernanceLock | null
  replay_blocked: boolean
}

type RuntimeSelfIntegrityCheckpoint = {
  runtime_surface_hash: string
  governance_checkpoint_hash: string
  recursive_integrity_hash: string
  runtime_ready: boolean
}

type RuntimeEvolutionConsensusDriftClass = "quorum_divergence" | "maintainer_set_drift" | "governance_replay_attempt" | "approval_hash_mismatch" | "reviewed_commit_drift" | "mutation_scope_expansion" | "runtime_evolution_bypass" | "consensus_instability" | "non_deterministic_approval_order" | "federation_authority_inheritance_attempt"

type RuntimeEvolutionApproval = {
  maintainer_id: string
  approval_hash: string
  reviewed_commit_hash: string
  mutation_hash: string
  canonical_hash: string
  lineage_hash: string
}

type RuntimeEvolutionConsensusObject = {
  consensus_id: string
  sco_hash: string
  preo_hash: string
  mutation_hash: string
  canonical_hash: string
  reviewed_commit_hash: string
  runtime_scope: string
  governance_scope: string
  quorum_threshold: number
  maintainer_set_hash: string
  approval_lineage: RuntimeEvolutionApproval[]
  replay_neutral: true
  evidence_only: true
  generated_at: string
}

type RuntimeEvolutionConsensusEnvelope = {
  envelope_type: "RuntimeEvolutionConsensusEnvelope"
  consensus_object: RuntimeEvolutionConsensusObject
  maintainer_set: string[]
  approval_hash: string
  consensus_result: "VALID_CONSENSUS" | "NULL"
  drift_classes: RuntimeEvolutionConsensusDriftClass[]
  replay_neutral: true
  evidence_only: true
  read_only: true
  mutation_capable: false
  execution_authority: false
  remote_authority_inherited: false
}

type DriftClass = "authority_drift" | "hash_drift" | "execution_drift" | "proof_drift" | "replay_drift" | "registry_drift" | "provenance_drift" | "branch_lineage_drift" | "workflow_source_drift" | "reconciliation_failure_drift" | "recursive_ancestry_drift" | "replay_chain_drift" | "proof_lineage_drift" | "preo_ancestry_drift" | "revocation_propagation_drift" | "duplicate_lineage_hash_drift" | "orphan_legitimacy_object_drift" | "federated_lineage_drift" | "foreign_ancestry_mismatch_drift" | "scheduler_ordering_instability_drift" | "reconciliation_report_drift" | "portable_serialization_mismatch_drift" | "federated_replay_discontinuity_drift" | "deterministic_traversal_instability_drift" | "reconciliation_payload_corruption_drift" | "traversal_instability_drift" | "telemetry_payload_drift" | "attestation_drift" | "signature_drift" | "signer_identity_drift" | "payload_drift" | "transparency_drift" | "federated_checkpoint_drift" | "federated_merkle_drift" | "federated_bundle_drift" | "federated_attestation_drift" | "federated_reconciliation_drift" | "federated_runtime_divergence_drift" | "federated_replay_drift" | "federated_preo_drift" | "federated_continuity_drift" | "federated_exact_object_drift" | "federated_identifier_resolution_drift" | "federated_revocation_projection_drift" | "federated_revocation_divergence_drift" | "federated_revocation_exact_object_drift" | "federated_revocation_replay_drift" | "federated_revocation_anchor_drift" | "federated_checkpoint_revocation_drift" | "federated_expiration_visibility_drift" | "orphaned_execution" | "revoked_authority_execution" | "federated_lineage_divergence" | "replay_resurrection_attempt" | "distributed_lineage_divergence" | "checkpoint_hash_instability" | "federated_projection_corruption" | "remote_authority_claim" | "interoperability_replay_attempt" | "checkpoint_divergence" | "federated_replay_collision" | "authority_conflict" | "lineage_instability" | "topology_divergence" | "projection_corruption" | "cross_runtime_hash_mismatch" | "compression_divergence" | "reconciliation_instability" | "federated_summary_mismatch" | "topology_compression_corruption" | "replay_summary_divergence" | "semantic_conformance_drift" | "checkpoint_semantic_mismatch" | "federation_policy_divergence" | "compression_semantic_instability" | "runtime_fingerprint_mismatch" | "quorum_divergence" | "maintainer_set_drift" | "governance_replay_attempt" | "approval_hash_mismatch" | "reviewed_commit_drift" | "mutation_scope_expansion" | "runtime_evolution_bypass" | "consensus_instability" | "non_deterministic_approval_order" | "federation_authority_inheritance_attempt" | "external_authority_drift" | "sovereignty_boundary_fragmentation" | "deploy_authority_escape" | "bootstrap_trust_divergence" | "undeclared_execution_surface" | "infrastructure_authority_expansion" | "hidden_mutation_surface"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json" } })
}

async function body(req: Request): Promise<any> { try { return await req.json() } catch { return {} } }
function authorized(req: Request, env: Env): boolean { return typeof env.API_KEY === "string" && env.API_KEY.length > 0 && req.headers.get("X-API-Key") === env.API_KEY }
function hasDb(env: unknown): env is Env { return Boolean((env as any)?.DB && typeof (env as any).DB.prepare === "function") }
function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function normalizeCanonicalValue(v: unknown): unknown {
  if (v === undefined) return null
  if (v === null || typeof v === "string" || typeof v === "boolean") return v
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (Array.isArray(v)) return v.map(normalizeCanonicalValue)
  if (isPlainRecord(v)) {
    return Object.freeze(Object.keys(v).sort().reduce<Record<string, unknown>>((normalized, key) => {
      normalized[key] = normalizeCanonicalValue(v[key])
      return normalized
    }, {}))
  }
  return null
}

function canonicalRecord(v: unknown): Record<string, unknown> {
  const normalized = normalizeCanonicalValue(v)
  return isPlainRecord(normalized) ? normalized : {}
}

function canonicalize(v: unknown): string {
  const normalized = normalizeCanonicalValue(v)
  if (Array.isArray(normalized)) return `[${normalized.map(canonicalize).join(",")}]`
  if (isPlainRecord(normalized)) return `{${Object.keys(normalized).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(normalized[key])}`).join(",")}}`
  return JSON.stringify(normalized)
}
async function sha256Hex(input: string): Promise<string> { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)); return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("") }

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}


function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function dsseLengthPrefixed(value: Uint8Array): Uint8Array {
  return concatBytes(utf8Bytes(String(value.length)), utf8Bytes(" "), value)
}

function dssePreAuthenticationEncoding(payloadType: string, payload: Uint8Array): Uint8Array {
  return concatBytes(utf8Bytes("DSSEv1 "), dsseLengthPrefixed(utf8Bytes(payloadType)), dsseLengthPrefixed(payload))
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) diff |= (a[i] || 0) ^ (b[i] || 0)
  return diff === 0
}

async function hmacSha256(secret: string, bytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", utf8Bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes))
}

function canonicalProvenancePayload(input: {
  decision_id: string
  validated_object_hash: string
  workflow_run_id: string
  workflow_sha: string
  canonical_aeo_hash: string
  signer_identity: string
  transparency_log_id: string
  transparency_integrated_time: string
  federation?: unknown
}): Record<string, unknown> {
  return canonicalRecord({
    canonical_aeo_hash: input.canonical_aeo_hash,
    decision_id: input.decision_id,
    federation: isPlainRecord(input.federation) ? canonicalRecord(input.federation) : null,
    signer_identity: input.signer_identity,
    transparency_integrated_time: input.transparency_integrated_time,
    transparency_log_id: input.transparency_log_id,
    validated_object_hash: input.validated_object_hash,
    workflow_run_id: input.workflow_run_id,
    workflow_sha: input.workflow_sha
  })
}

type DsseProvenanceValidationContext = {
  decision_id: string
  validated_object_hash: string
  workflow_run_id: string
  workflow_sha: string
  canonical_aeo_hash: string
  expected_signer_identity: string
  hmac_secret: string
}

type ValidatedDsseProvenance = {
  envelope_hash: string
  payload_hash: string
  payload_type: string
  signer_identity: string
  decision_id: string
  validated_object_hash: string
  workflow_run_id: string
  workflow_sha: string
  canonical_aeo_hash: string
  transparency_log_id: string
  transparency_integrated_time: string
}

function envelopeFromInput(input: any): any | null {
  if (!input) return null
  if (isPlainRecord(input.dsse_envelope)) return input.dsse_envelope
  if (isPlainRecord(input.envelope)) return input.envelope
  if (isPlainRecord(input.attestation)) return input.attestation
  if (isPlainRecord(input.provenance_attestation)) return input.provenance_attestation
  return null
}

async function validateDsseProvenanceEnvelope(envelope: any, context: DsseProvenanceValidationContext): Promise<ValidatedDsseProvenance | null> {
  if (!context.hmac_secret) return null
  if (!isPlainRecord(envelope)) return null
  const payloadType = String(envelope.payloadType || envelope.payload_type || "")
  if (payloadType !== PROVENANCE_PAYLOAD_TYPE) return null
  const payloadBytes = base64ToBytes(String(envelope.payload || ""))
  if (!payloadBytes) return null
  const payloadJson = new TextDecoder().decode(payloadBytes)
  let payload: any
  try { payload = JSON.parse(payloadJson) } catch { return null }
  if (!isPlainRecord(payload)) return null

  const transparency = isPlainRecord(envelope.transparency) ? envelope.transparency : {}
  const transparency_log_id = String(payload.transparency_log_id || transparency.log_id || envelope.transparency_log_id || "")
  const transparency_integrated_time = String(payload.transparency_integrated_time || transparency.integrated_time || envelope.transparency_integrated_time || "")
  if (!transparency_log_id || !transparency_integrated_time) return null

  if (String(payload.signer_identity || "") !== context.expected_signer_identity) return null
  if (String(payload.decision_id || "") !== context.decision_id) return null
  if (String(payload.validated_object_hash || "") !== context.validated_object_hash) return null
  if (String(payload.workflow_run_id || "") !== context.workflow_run_id) return null
  if (String(payload.workflow_sha || "") !== context.workflow_sha) return null
  if (String(payload.canonical_aeo_hash || "") !== context.canonical_aeo_hash) return null

  const federation = isPlainRecord(payload.federation) ? payload.federation : null
  if (federation && (String(federation.ambiguous_lineage || "") === "true" || (federation as any).ambiguous_lineage === true || String(federation.remote_legitimacy || "") === "true" || (federation as any).remote_legitimacy === true || String(federation.local_authority || "") === "true" || (federation as any).local_authority === true)) return null

  const canonicalPayload = canonicalProvenancePayload({
    decision_id: context.decision_id,
    validated_object_hash: context.validated_object_hash,
    workflow_run_id: context.workflow_run_id,
    workflow_sha: context.workflow_sha,
    canonical_aeo_hash: context.canonical_aeo_hash,
    signer_identity: context.expected_signer_identity,
    transparency_log_id,
    transparency_integrated_time,
    federation: federation || null
  })
  const canonicalPayloadString = canonicalize(canonicalPayload)
  if (payloadJson !== canonicalPayloadString) return null

  const signatures = Array.isArray((envelope as any).signatures) ? (envelope as any).signatures : []
  const matching = signatures.find((signature: any) => isPlainRecord(signature) && String(signature.keyid || signature.signer_identity || "") === context.expected_signer_identity)
  if (!matching) return null
  const providedSignature = base64ToBytes(String(matching.sig || matching.signature || ""))
  if (!providedSignature) return null
  const pae = dssePreAuthenticationEncoding(PROVENANCE_PAYLOAD_TYPE, payloadBytes)
  const expectedSignature = await hmacSha256(context.hmac_secret, pae)
  if (!constantTimeEqual(providedSignature, expectedSignature)) return null

  return {
    envelope_hash: await sha256Hex(canonicalize(envelope)),
    payload_hash: await sha256Hex(canonicalPayloadString),
    payload_type: PROVENANCE_PAYLOAD_TYPE,
    signer_identity: context.expected_signer_identity,
    decision_id: context.decision_id,
    validated_object_hash: context.validated_object_hash,
    workflow_run_id: context.workflow_run_id,
    workflow_sha: context.workflow_sha,
    canonical_aeo_hash: context.canonical_aeo_hash,
    transparency_log_id,
    transparency_integrated_time
  }
}

async function validateRequestProvenanceAttestation(env: Env, input: any, context: DsseProvenanceValidationContext): Promise<{ ok: true, attestation: ValidatedDsseProvenance | null } | { ok: false, reason: string, drift_class: DriftClass, payload: Record<string, unknown> }> {
  const envelope = envelopeFromInput(input)
  if (!envelope) return { ok: true, attestation: null }
  const attestation = await validateDsseProvenanceEnvelope(envelope, context)
  if (!attestation) return { ok: false, reason: "invalid_provenance_attestation", drift_class: "attestation_drift", payload: { indicator: "cryptographic_provenance_invalid" } }
  const replay = await env.DB.prepare(`SELECT attestation_id,envelope_hash,workflow_run_id,decision_id,validated_object_hash,signer_identity,status FROM attestation_registry WHERE envelope_hash=?1 OR workflow_run_id=?2 OR (decision_id=?3 AND validated_object_hash=?4) LIMIT 1`).bind(attestation.envelope_hash, attestation.workflow_run_id, attestation.decision_id, attestation.validated_object_hash).first<any>()
  if (replay) return { ok: false, reason: "replayed_attestation", drift_class: "replay_drift", payload: { indicator: "attestation_replay", envelope_hash: attestation.envelope_hash, workflow_run_id: attestation.workflow_run_id } }
  return { ok: true, attestation }
}

function canonicalDeployTarget(input: any): { repo: string, branch: string, workflow: string } {
  return {
    repo: String(input?.repo || input?.repository || ""),
    branch: String(input?.branch || ""),
    workflow: String(input?.workflow || GOVERNED_WORKFLOW)
  }
}

type DeploymentProvenance = {
  repository: string
  branch: string
  pull_request_id: string
  merge_commit_sha: string
  source_tree_hash: string
  workflow_run_id: string
  workflow_sha: string
}

function deploymentProvenanceFrom(input: any): DeploymentProvenance {
  return {
    repository: String(input?.repository || input?.repo || ""),
    branch: String(input?.branch || ""),
    pull_request_id: String(input?.pull_request_id || input?.pull_request_number || ""),
    merge_commit_sha: String(input?.merge_commit_sha || input?.commit_sha || ""),
    source_tree_hash: String(input?.source_tree_hash || ""),
    workflow_run_id: String(input?.workflow_run_id || input?.run_id || ""),
    workflow_sha: String(input?.workflow_sha || input?.commit_sha || "")
  }
}

function missingDeploymentProvenance(provenance: DeploymentProvenance): string[] {
  return Object.entries(provenance).filter(([, value]) => !value).map(([key]) => key)
}

function toCanonicalAeo(input: any): CanonicalAEO | null {
  const keys = Object.keys(input || {}).sort()
  if (keys.length !== REQUIRED_AEO_KEYS.length) return null
  if (keys.join("|") !== [...REQUIRED_AEO_KEYS].sort().join("|")) return null
  return Object.freeze({
    intent: String(input.intent || ""),
    scope: canonicalRecord(input.scope),
    validation: canonicalRecord(input.validation),
    target: canonicalRecord(input.target),
    finality: canonicalRecord(input.finality)
  })
}

async function ensureSchema(env: Env, options: { stabilizeProofRegistry?: boolean } = {}) {
  if (options.stabilizeProofRegistry !== false && BOOTSTRAP_READY_DATABASES.has(env.DB)) return
  try {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS session_registry (session_id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, owner TEXT NOT NULL, trust_tier TEXT NOT NULL, continuity_status TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_session_registry_status_expiry ON session_registry(continuity_status, expires_at)`,
      `CREATE TABLE IF NOT EXISTS continuity_registry (continuity_id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, session_id TEXT NOT NULL, parent_continuity_id TEXT, continuity_hash TEXT NOT NULL, canonical_continuity TEXT NOT NULL, status TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, UNIQUE(continuity_hash))`,
      `CREATE INDEX IF NOT EXISTS idx_continuity_registry_session_identity ON continuity_registry(session_id, identity_id, status, expires_at)`,
      `CREATE TABLE IF NOT EXISTS authority_registry (authority_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL UNIQUE, session_id TEXT NOT NULL, owner TEXT NOT NULL, intent TEXT NOT NULL, scope TEXT NOT NULL, constraints TEXT NOT NULL, expiry TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT, identity_id TEXT)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_authority_registry_decision_unique ON authority_registry(decision_id)`,
      `CREATE TABLE IF NOT EXISTS aeo_registry (aeo_id TEXT PRIMARY KEY, authority_id TEXT NOT NULL, decision_id TEXT NOT NULL, canonical_aeo TEXT NOT NULL, validated_object_hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_aeo_registry_decision_hash ON aeo_registry(decision_id, validated_object_hash)`,
      `CREATE TABLE IF NOT EXISTS preo_registry (preo_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL, authority_id TEXT NOT NULL, continuity_id TEXT NOT NULL, reviewed_hash TEXT NOT NULL, reviewed_tree_hash TEXT, merge_commit_sha TEXT, canonical_preo TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(decision_id, reviewed_hash))`,
      `CREATE INDEX IF NOT EXISTS idx_preo_registry_decision_hash ON preo_registry(decision_id, reviewed_hash)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_preo_registry_lineage_unique ON preo_registry(decision_id, reviewed_hash, reviewed_tree_hash, merge_commit_sha)`,
      `CREATE TABLE IF NOT EXISTS validation_registry (validation_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, environment TEXT, result TEXT NOT NULL, reason TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_validation_registry_decision_hash_nonce ON validation_registry(decision_id, validated_object_hash, invocation_nonce)`,
      `CREATE TABLE IF NOT EXISTS execution_registry (execution_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT, repository TEXT, branch TEXT, pull_request_id TEXT, merge_commit_sha TEXT, source_tree_hash TEXT, workflow_run_id TEXT, workflow_sha TEXT, UNIQUE(decision_id, validated_object_hash), UNIQUE(continuity_id, decision_id, validated_object_hash), UNIQUE(workflow_run_id))`,
      `CREATE INDEX IF NOT EXISTS idx_execution_registry_decision_hash ON execution_registry(decision_id, validated_object_hash)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_registry_workflow_run_unique ON execution_registry(workflow_run_id)`,
      `CREATE TABLE IF NOT EXISTS proof_registry (proof_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, execution_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, surface TEXT, run_id TEXT, commit_sha TEXT, workflow TEXT, environment TEXT, created_at TEXT NOT NULL, continuity_id TEXT, continuity_hash TEXT, identity_id TEXT, authority_lineage TEXT, execution_lineage TEXT, repository TEXT, branch TEXT, pull_request_id TEXT, merge_commit_sha TEXT, source_tree_hash TEXT, workflow_run_id TEXT, workflow_sha TEXT, UNIQUE(decision_id, validated_object_hash), UNIQUE(workflow_run_id))`,
      `CREATE INDEX IF NOT EXISTS idx_proof_registry_execution_decision_hash ON proof_registry(execution_id, decision_id, validated_object_hash)`,
      `CREATE TABLE IF NOT EXISTS proof_registry_duplicate_archive (archive_id TEXT PRIMARY KEY, proof_id TEXT NOT NULL, session_id TEXT NOT NULL, execution_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, surface TEXT, run_id TEXT, commit_sha TEXT, workflow TEXT, environment TEXT, created_at TEXT NOT NULL, archived_at TEXT NOT NULL, archive_reason TEXT NOT NULL, canonical_proof_id TEXT NOT NULL, UNIQUE(proof_id))`,
      `CREATE TABLE IF NOT EXISTS proof_quarantine_registry (quarantine_id TEXT PRIMARY KEY, proof_id TEXT NOT NULL, lineage_hash TEXT NOT NULL, quarantine_reason TEXT NOT NULL, canonical_proof_selected TEXT NOT NULL, duplicate_proof_archived TEXT NOT NULL, quarantine_generated_at TEXT NOT NULL, replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), evidence_only TEXT NOT NULL CHECK (evidence_only='true'))`,
      `CREATE TABLE IF NOT EXISTS invocation_registry (decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT, PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_invocation_registry_nonce_once ON invocation_registry(decision_id, validated_object_hash, invocation_nonce)`,
      `CREATE TABLE IF NOT EXISTS attestation_registry (attestation_id TEXT PRIMARY KEY, envelope_hash TEXT NOT NULL, payload_hash TEXT NOT NULL, payload_type TEXT NOT NULL, signer_identity TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, workflow_run_id TEXT NOT NULL, workflow_sha TEXT NOT NULL, canonical_aeo_hash TEXT NOT NULL, transparency_log_id TEXT NOT NULL, transparency_integrated_time TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(envelope_hash), UNIQUE(workflow_run_id), UNIQUE(decision_id, validated_object_hash))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_envelope_hash_unique ON attestation_registry(envelope_hash)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_workflow_run_unique ON attestation_registry(workflow_run_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_decision_object_unique ON attestation_registry(decision_id, validated_object_hash)`,
      `CREATE TABLE IF NOT EXISTS observability_registry (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, decision_id TEXT, authority_id TEXT, execution_id TEXT, proof_id TEXT, severity TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_observability_decision ON observability_registry(decision_id)`,
      `CREATE INDEX IF NOT EXISTS idx_observability_execution ON observability_registry(execution_id)`,
      `CREATE INDEX IF NOT EXISTS idx_observability_type ON observability_registry(event_type)`,
      `CREATE TABLE IF NOT EXISTS drift_registry (drift_id TEXT PRIMARY KEY, drift_class TEXT NOT NULL, severity TEXT NOT NULL, decision_id TEXT, execution_id TEXT, payload TEXT NOT NULL, detected_by TEXT NOT NULL, resolution_status TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS federated_reconciliation_registry (reconciliation_id TEXT PRIMARY KEY, checkpoint_hash TEXT NOT NULL, canonical_hash TEXT NOT NULL, lineage_root TEXT NOT NULL, continuity_root TEXT NOT NULL, federation_classification TEXT NOT NULL, drift_summary TEXT NOT NULL, replay_indicators TEXT NOT NULL, topology_hash TEXT NOT NULL, generated_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_federated_reconciliation_checkpoint_hash ON federated_reconciliation_registry(checkpoint_hash, canonical_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_federated_reconciliation_lineage_topology ON federated_reconciliation_registry(lineage_root, continuity_root, topology_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_federated_reconciliation_runtime_hash ON federated_reconciliation_registry(checkpoint_hash, canonical_hash, topology_hash)`,
      `CREATE TABLE IF NOT EXISTS governance_compression_registry (compression_id TEXT PRIMARY KEY, reconciliation_root TEXT NOT NULL, checkpoint_set_hash TEXT NOT NULL, topology_root TEXT NOT NULL, lineage_root TEXT NOT NULL, federation_classification TEXT NOT NULL, compressed_drift_summary TEXT NOT NULL, compressed_replay_summary TEXT NOT NULL, participating_runtimes TEXT NOT NULL, canonical_hash TEXT NOT NULL, generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_governance_compression_registry_hash_unique ON governance_compression_registry(canonical_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_governance_compression_registry_reconciliation ON governance_compression_registry(reconciliation_root, checkpoint_set_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_governance_compression_registry_topology_lineage ON governance_compression_registry(topology_root, lineage_root)`,
      `CREATE TABLE IF NOT EXISTS federated_revocation_observability_registry (revocation_evidence_id TEXT PRIMARY KEY, runtime_id TEXT NOT NULL, remote_runtime_id TEXT NOT NULL, continuity_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, revocation_class TEXT NOT NULL, revocation_reason TEXT NOT NULL, lineage_hash TEXT NOT NULL, reconciliation_merkle_root TEXT NOT NULL, attestation_hash TEXT NOT NULL, observed_at TEXT NOT NULL, evidence_hash TEXT NOT NULL, verification_status TEXT NOT NULL, drift_class TEXT, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_federated_revocation_observability_lineage ON federated_revocation_observability_registry(runtime_id, remote_runtime_id, decision_id, validated_object_hash)`,
      `CREATE TABLE IF NOT EXISTS federated_trust_registry (trust_envelope_id TEXT PRIMARY KEY, federation_origin TEXT NOT NULL, federation_tier TEXT NOT NULL, verification_status TEXT NOT NULL, evidence_only TEXT NOT NULL, remote_authority_denied TEXT NOT NULL, continuity_reference TEXT NOT NULL, lineage_root TEXT NOT NULL, observed_at TEXT NOT NULL, canonical_hash TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_federated_trust_registry_hash ON federated_trust_registry(canonical_hash)`,
      `CREATE TABLE IF NOT EXISTS revocation_topology_registry (topology_id TEXT PRIMARY KEY, authority_id TEXT, continuity_id TEXT, lineage_root TEXT NOT NULL, topology_hash TEXT NOT NULL, drift_summary TEXT NOT NULL, observed_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_revocation_topology_registry_hash ON revocation_topology_registry(topology_hash)`,
      `CREATE TABLE IF NOT EXISTS distributed_legitimacy_registry (envelope_id TEXT PRIMARY KEY, canonical_hash TEXT NOT NULL, lineage_root TEXT NOT NULL, continuity_id TEXT NOT NULL, reconciliation_id TEXT NOT NULL, federation_classification TEXT NOT NULL, replay_indicators TEXT NOT NULL, drift_indicators TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), read_only TEXT NOT NULL CHECK (read_only='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_distributed_legitimacy_registry_hash_unique ON distributed_legitimacy_registry(canonical_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_distributed_legitimacy_registry_lineage ON distributed_legitimacy_registry(lineage_root, continuity_id, reconciliation_id)`,
      `CREATE TABLE IF NOT EXISTS federated_checkpoint_registry (checkpoint_envelope_id TEXT PRIMARY KEY, checkpoint_id TEXT NOT NULL, canonical_hash TEXT NOT NULL, lineage_root TEXT NOT NULL, continuity_id TEXT NOT NULL, reconciliation_id TEXT NOT NULL, reconciliation_merkle_root TEXT NOT NULL, federation_classification TEXT NOT NULL, replay_indicators TEXT NOT NULL, drift_indicators TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), read_only TEXT NOT NULL CHECK (read_only='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_federated_checkpoint_registry_hash_unique ON federated_checkpoint_registry(canonical_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_federated_checkpoint_registry_lineage ON federated_checkpoint_registry(lineage_root, continuity_id, reconciliation_id)`,
      `CREATE TABLE IF NOT EXISTS federation_conformance_registry (conformance_id TEXT PRIMARY KEY, envelope_id TEXT NOT NULL, runtime_id TEXT NOT NULL, remote_runtime_id TEXT NOT NULL, fingerprint_hash TEXT NOT NULL, checkpoint_hash TEXT NOT NULL, compatibility_hash TEXT NOT NULL, conformance_status TEXT NOT NULL, drift_classes TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), read_only TEXT NOT NULL CHECK (read_only='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_federation_conformance_registry_envelope_unique ON federation_conformance_registry(envelope_id)`,
      `CREATE INDEX IF NOT EXISTS idx_federation_conformance_registry_runtime ON federation_conformance_registry(runtime_id, remote_runtime_id, conformance_status)`,
      `CREATE INDEX IF NOT EXISTS idx_federation_conformance_registry_semantics ON federation_conformance_registry(fingerprint_hash, checkpoint_hash, compatibility_hash)`,
      `CREATE TABLE IF NOT EXISTS federated_sovereignty_registry (federation_id TEXT PRIMARY KEY, local_runtime_id TEXT NOT NULL, remote_runtime_id TEXT NOT NULL, sovereignty_hash TEXT NOT NULL, equivalence_hash TEXT NOT NULL, drift_summary TEXT NOT NULL, replay_indicators TEXT NOT NULL, verification_status TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), generated_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_federated_sovereignty_registry_runtime ON federated_sovereignty_registry(local_runtime_id, remote_runtime_id, verification_status)`,
      `CREATE INDEX IF NOT EXISTS idx_federated_sovereignty_registry_hash ON federated_sovereignty_registry(sovereignty_hash, equivalence_hash)`,
      `CREATE TABLE IF NOT EXISTS recursive_governance_registry (governance_id TEXT PRIMARY KEY, mutation_class TEXT NOT NULL CHECK (mutation_class IN ('runtime_route_mutation','validator_mutation','schema_mutation','authority_semantics_mutation','proof_semantics_mutation','replay_semantics_mutation','policy_mutation','observability_mutation','federation_semantics_mutation','governance_surface_expansion')), mutation_scope TEXT NOT NULL, target_surface TEXT NOT NULL, mutation_hash TEXT NOT NULL, sco_hash TEXT NOT NULL, preo_hash TEXT NOT NULL, governance_decision TEXT NOT NULL CHECK (governance_decision IN ('GOVERNANCE_OBSERVED','GOVERNANCE_VALIDATED','GOVERNANCE_QUARANTINED','GOVERNANCE_REJECTED','NULL')), drift_classes TEXT NOT NULL, exact_object_verified TEXT NOT NULL CHECK (exact_object_verified IN ('true','false')), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_authorized TEXT NOT NULL CHECK (mutation_authorized IN ('true','false')), proof_required TEXT NOT NULL CHECK (proof_required='true'), canonical_path_preserved TEXT NOT NULL CHECK (canonical_path_preserved IN ('true','false')), generated_at TEXT NOT NULL, created_at TEXT NOT NULL, CHECK (governance_decision != 'GOVERNANCE_VALIDATED' OR (sco_hash != '' AND exact_object_verified='true' AND replay_neutral='true' AND mutation_authorized='true' AND proof_required='true' AND canonical_path_preserved='true')), CHECK (governance_decision = 'GOVERNANCE_VALIDATED' OR mutation_authorized='false'))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_recursive_governance_registry_governance_unique ON recursive_governance_registry(governance_id)`,
      `CREATE INDEX IF NOT EXISTS idx_recursive_governance_registry_mutation ON recursive_governance_registry(mutation_class, mutation_scope, target_surface)`,
      `CREATE INDEX IF NOT EXISTS idx_recursive_governance_registry_legitimacy ON recursive_governance_registry(mutation_hash, sco_hash, preo_hash, governance_decision)`,
      `CREATE TABLE IF NOT EXISTS runtime_governance_lock_registry (lock_id TEXT PRIMARY KEY, mutation_hash TEXT NOT NULL, governance_id TEXT NOT NULL, lock_state TEXT NOT NULL CHECK (lock_state IN ('LOCKED','NULL')), activation_allowed TEXT NOT NULL CHECK (activation_allowed IN ('true','false')), canonical_hash TEXT NOT NULL, created_at TEXT NOT NULL, CHECK (activation_allowed='true' AND lock_state='LOCKED'))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_governance_lock_activation ON runtime_governance_lock_registry(mutation_hash, governance_id)`,
      `CREATE INDEX IF NOT EXISTS idx_runtime_governance_lock_canonical_hash ON runtime_governance_lock_registry(canonical_hash)`,
      `CREATE TABLE IF NOT EXISTS runtime_sovereignty_registry (sovereignty_id TEXT PRIMARY KEY, sovereignty_hash TEXT NOT NULL, runtime_surface_hash TEXT NOT NULL, governance_surface_hash TEXT NOT NULL, replay_surface_hash TEXT NOT NULL, proof_surface_hash TEXT NOT NULL, validator_surface_hash TEXT NOT NULL, schema_hash TEXT NOT NULL, migration_chain_hash TEXT NOT NULL, generated_at TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_sovereignty_registry_hash_unique ON runtime_sovereignty_registry(sovereignty_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_runtime_sovereignty_registry_surfaces ON runtime_sovereignty_registry(runtime_surface_hash, governance_surface_hash, replay_surface_hash, proof_surface_hash)`,
      `CREATE TABLE IF NOT EXISTS recursive_governance_replay_registry (replay_id TEXT PRIMARY KEY, mutation_hash TEXT NOT NULL, sco_hash TEXT NOT NULL, preo_hash TEXT NOT NULL, governance_id TEXT NOT NULL, activation_lock_id TEXT NOT NULL, consumed_at TEXT NOT NULL, UNIQUE(mutation_hash, sco_hash, preo_hash), UNIQUE(governance_id))`,
      `CREATE INDEX IF NOT EXISTS idx_recursive_governance_replay_lock ON recursive_governance_replay_registry(activation_lock_id)`,
      `CREATE TABLE IF NOT EXISTS runtime_evolution_consensus_registry (consensus_id TEXT PRIMARY KEY, mutation_hash TEXT NOT NULL, canonical_hash TEXT NOT NULL, governance_scope TEXT NOT NULL, quorum_threshold TEXT NOT NULL, approval_count TEXT NOT NULL, approval_hash TEXT NOT NULL, consensus_status TEXT NOT NULL CHECK (consensus_status IN ('VALID_CONSENSUS','NULL')), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), evidence_only TEXT NOT NULL CHECK (evidence_only='true'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS external_authority_registry (sovereignty_dependency_id TEXT PRIMARY KEY, external_authority_surface TEXT NOT NULL, authority_origin TEXT NOT NULL, infrastructure_scope TEXT NOT NULL, bootstrap_trust_hash TEXT NOT NULL, sovereignty_classification TEXT NOT NULL, containment_state TEXT NOT NULL, observability_only TEXT NOT NULL CHECK (observability_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), evidence_hash TEXT NOT NULL UNIQUE, drift_classes TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_external_authority_registry_surface ON external_authority_registry(external_authority_surface, authority_origin, containment_state)`,
      `CREATE INDEX IF NOT EXISTS idx_external_authority_registry_bootstrap ON external_authority_registry(bootstrap_trust_hash, sovereignty_classification)`,
      `CREATE INDEX IF NOT EXISTS idx_runtime_evolution_consensus_registry_mutation ON runtime_evolution_consensus_registry(mutation_hash, canonical_hash, governance_scope)`,
      `CREATE INDEX IF NOT EXISTS idx_runtime_evolution_consensus_registry_approval ON runtime_evolution_consensus_registry(approval_hash, consensus_status)`,
      `CREATE TRIGGER IF NOT EXISTS trg_distributed_legitimacy_registry_no_update BEFORE UPDATE ON distributed_legitimacy_registry BEGIN SELECT RAISE(ABORT, 'distributed_legitimacy_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_distributed_legitimacy_registry_no_delete BEFORE DELETE ON distributed_legitimacy_registry BEGIN SELECT RAISE(ABORT, 'distributed_legitimacy_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_federated_checkpoint_registry_no_update BEFORE UPDATE ON federated_checkpoint_registry BEGIN SELECT RAISE(ABORT, 'federated_checkpoint_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_federated_checkpoint_registry_no_delete BEFORE DELETE ON federated_checkpoint_registry BEGIN SELECT RAISE(ABORT, 'federated_checkpoint_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_federation_conformance_registry_no_update BEFORE UPDATE ON federation_conformance_registry BEGIN SELECT RAISE(ABORT, 'federation_conformance_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_federation_conformance_registry_no_delete BEFORE DELETE ON federation_conformance_registry BEGIN SELECT RAISE(ABORT, 'federation_conformance_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_registry_no_update BEFORE UPDATE ON recursive_governance_registry BEGIN SELECT RAISE(ABORT, 'recursive_governance_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_registry_no_delete BEFORE DELETE ON recursive_governance_registry BEGIN SELECT RAISE(ABORT, 'recursive_governance_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_runtime_governance_lock_registry_no_update BEFORE UPDATE ON runtime_governance_lock_registry BEGIN SELECT RAISE(ABORT, 'runtime_governance_lock_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_runtime_governance_lock_registry_no_delete BEFORE DELETE ON runtime_governance_lock_registry BEGIN SELECT RAISE(ABORT, 'runtime_governance_lock_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_runtime_sovereignty_registry_no_update BEFORE UPDATE ON runtime_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'runtime_sovereignty_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_runtime_sovereignty_registry_no_delete BEFORE DELETE ON runtime_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'runtime_sovereignty_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_replay_registry_no_update BEFORE UPDATE ON recursive_governance_replay_registry BEGIN SELECT RAISE(ABORT, 'recursive_governance_replay_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_replay_registry_no_delete BEFORE DELETE ON recursive_governance_replay_registry BEGIN SELECT RAISE(ABORT, 'recursive_governance_replay_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_runtime_evolution_consensus_registry_no_update BEFORE UPDATE ON runtime_evolution_consensus_registry BEGIN SELECT RAISE(ABORT, 'runtime_evolution_consensus_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_runtime_evolution_consensus_registry_no_delete BEFORE DELETE ON runtime_evolution_consensus_registry BEGIN SELECT RAISE(ABORT, 'runtime_evolution_consensus_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_external_authority_registry_no_update BEFORE UPDATE ON external_authority_registry BEGIN SELECT RAISE(ABORT, 'external_authority_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_external_authority_registry_no_delete BEFORE DELETE ON external_authority_registry BEGIN SELECT RAISE(ABORT, 'external_authority_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_federated_reconciliation_registry_no_update BEFORE UPDATE ON federated_reconciliation_registry BEGIN SELECT RAISE(ABORT, 'federated_reconciliation_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_federated_reconciliation_registry_no_delete BEFORE DELETE ON federated_reconciliation_registry BEGIN SELECT RAISE(ABORT, 'federated_reconciliation_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_governance_compression_registry_no_update BEFORE UPDATE ON governance_compression_registry BEGIN SELECT RAISE(ABORT, 'governance_compression_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_governance_compression_registry_no_delete BEFORE DELETE ON governance_compression_registry BEGIN SELECT RAISE(ABORT, 'governance_compression_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_federated_sovereignty_registry_no_update BEFORE UPDATE ON federated_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'federated_sovereignty_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_federated_sovereignty_registry_no_delete BEFORE DELETE ON federated_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'federated_sovereignty_registry is append-only'); END`,
      `CREATE INDEX IF NOT EXISTS idx_federation_conformance_registry_semantics ON federation_conformance_registry(fingerprint_hash, checkpoint_hash, compatibility_hash)`
    ]
    for (const s of stmts) await env.DB.prepare(s).run()
    await ensureRequiredSchemaColumns(env)
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_SCHEMA_INITIALIZED")
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_MIGRATIONS_VALIDATED")
    if (options.stabilizeProofRegistry === false) return
    await validateProofArchiveCompatibility(env)
    const quarantine = await quarantineHistoricalProofDuplicates(env)
    if (quarantine.detected) await emitBootstrapDiagnostic(env, "BOOTSTRAP_DUPLICATE_PROOF_DETECTED")
    if (quarantine.quarantined > 0) await emitBootstrapDiagnostic(env, "BOOTSTRAP_DUPLICATE_PROOF_QUARANTINED")
    if (!await proofRegistryStabilized(env)) throw new BootstrapRegistryUnstableError()
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_PROOF_LINEAGE_RECONCILED")
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_REGISTRY_STABILIZED")
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique ON proof_registry(decision_id, validated_object_hash)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_workflow_run_unique ON proof_registry(workflow_run_id)`).run()
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_UNIQUENESS_ENFORCED")
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_proof_registry_provenance ON proof_registry(repository, branch, pull_request_id, merge_commit_sha, workflow_run_id)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_registry_workflow_run_unique ON execution_registry(workflow_run_id)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_envelope_hash_unique ON attestation_registry(envelope_hash)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_workflow_run_unique ON attestation_registry(workflow_run_id)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_decision_object_unique ON attestation_registry(decision_id, validated_object_hash)`).run()
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_RECURSIVE_GOVERNANCE_VERIFIED")
    await validateRuntimeEvolutionConsensusRegistry(env)
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_RUNTIME_EVOLUTION_CONSENSUS_REGISTRY_VALIDATED")
    const sovereigntyManifest = await freezeRuntimeSovereignty(env)
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_RUNTIME_SOVEREIGNTY_FROZEN")
    await appendRuntimeSovereigntyCheckpoint(env, sovereigntyManifest)
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_SOVEREIGNTY_CHECKPOINT_GENERATED")
    await activateAppendOnlyRegistryEnforcement(env)
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_APPEND_ONLY_TRIGGERS_ACTIVATED")
    BOOTSTRAP_READY_DATABASES.add(env.DB)
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_RUNTIME_READY")
  } catch (error) {
    if (error instanceof BootstrapRegistryUnstableError) throw error
    if (error instanceof RuntimeSovereigntyViolationError) throw error
    throw new SchemaInitializationError(schemaDiagnosticReason(error), error)
  }
}

async function activateAppendOnlyRegistryEnforcement(env: Env) {
  const triggers = [
    `CREATE TRIGGER IF NOT EXISTS trg_distributed_legitimacy_registry_no_update BEFORE UPDATE ON distributed_legitimacy_registry BEGIN SELECT RAISE(ABORT, 'distributed_legitimacy_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_distributed_legitimacy_registry_no_delete BEFORE DELETE ON distributed_legitimacy_registry BEGIN SELECT RAISE(ABORT, 'distributed_legitimacy_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_federated_checkpoint_registry_no_update BEFORE UPDATE ON federated_checkpoint_registry BEGIN SELECT RAISE(ABORT, 'federated_checkpoint_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_federated_checkpoint_registry_no_delete BEFORE DELETE ON federated_checkpoint_registry BEGIN SELECT RAISE(ABORT, 'federated_checkpoint_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_federation_conformance_registry_no_update BEFORE UPDATE ON federation_conformance_registry BEGIN SELECT RAISE(ABORT, 'federation_conformance_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_federation_conformance_registry_no_delete BEFORE DELETE ON federation_conformance_registry BEGIN SELECT RAISE(ABORT, 'federation_conformance_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_federated_sovereignty_registry_no_update BEFORE UPDATE ON federated_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'federated_sovereignty_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_federated_sovereignty_registry_no_delete BEFORE DELETE ON federated_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'federated_sovereignty_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_federated_reconciliation_registry_no_update BEFORE UPDATE ON federated_reconciliation_registry BEGIN SELECT RAISE(ABORT, 'federated_reconciliation_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_federated_reconciliation_registry_no_delete BEFORE DELETE ON federated_reconciliation_registry BEGIN SELECT RAISE(ABORT, 'federated_reconciliation_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_governance_compression_registry_no_update BEFORE UPDATE ON governance_compression_registry BEGIN SELECT RAISE(ABORT, 'governance_compression_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_governance_compression_registry_no_delete BEFORE DELETE ON governance_compression_registry BEGIN SELECT RAISE(ABORT, 'governance_compression_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_runtime_sovereignty_registry_no_update BEFORE UPDATE ON runtime_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'runtime_sovereignty_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_runtime_sovereignty_registry_no_delete BEFORE DELETE ON runtime_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'runtime_sovereignty_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_runtime_evolution_consensus_registry_no_update BEFORE UPDATE ON runtime_evolution_consensus_registry BEGIN SELECT RAISE(ABORT, 'runtime_evolution_consensus_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_runtime_evolution_consensus_registry_no_delete BEFORE DELETE ON runtime_evolution_consensus_registry BEGIN SELECT RAISE(ABORT, 'runtime_evolution_consensus_registry is append-only'); END`
  ]
  for (const trigger of triggers) await env.DB.prepare(trigger).run()
}

async function ensureRequiredSchemaColumns(env: Env) {
  const tableColumnSets: Array<[string, string[], Set<string>]> = []
  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA_COLUMNS)) {
    tableColumnSets.push([table, columns, await tableColumns(env, table)])
  }

  if (tableColumnSets.every(([, , existing]) => existing.size === 0)) return

  for (const [table, columns, existing] of tableColumnSets) {
    if (existing.size === 0) throw new SchemaInitializationError("missing_required_table")
    for (const column of columns) {
      if (!existing.has(column)) {
        await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${columnType(column)}`).run()
        existing.add(column)
      }
    }
  }
}

function columnType(column: string): string {
  if (column === "upstream_status") return "INTEGER"
  return "TEXT"
}

async function tableColumns(env: Env, table: string): Promise<Set<string>> {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all<any>()
  const rows = Array.isArray(info?.results) ? info.results : []
  return new Set(rows.map((row: any) => String(row?.name || "")).filter(Boolean))
}

async function ensureRuntimeEvolutionConsensusRegistry(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_evolution_consensus_registry (consensus_id TEXT PRIMARY KEY, mutation_hash TEXT NOT NULL, canonical_hash TEXT NOT NULL, governance_scope TEXT NOT NULL, quorum_threshold TEXT NOT NULL, approval_count TEXT NOT NULL, approval_hash TEXT NOT NULL, consensus_status TEXT NOT NULL CHECK (consensus_status IN ('VALID_CONSENSUS','NULL')), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), evidence_only TEXT NOT NULL CHECK (evidence_only='true'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_runtime_evolution_consensus_registry_mutation ON runtime_evolution_consensus_registry(mutation_hash, canonical_hash, governance_scope)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_runtime_evolution_consensus_registry_approval ON runtime_evolution_consensus_registry(approval_hash, consensus_status)`).run()
  await validateRuntimeEvolutionConsensusRegistry(env)
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_runtime_evolution_consensus_registry_no_update BEFORE UPDATE ON runtime_evolution_consensus_registry BEGIN SELECT RAISE(ABORT, 'runtime_evolution_consensus_registry is append-only'); END`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_runtime_evolution_consensus_registry_no_delete BEFORE DELETE ON runtime_evolution_consensus_registry BEGIN SELECT RAISE(ABORT, 'runtime_evolution_consensus_registry is append-only'); END`).run()
}

async function validateRuntimeEvolutionConsensusRegistry(env: Env) {
  const columns = await tableColumns(env, RUNTIME_EVOLUTION_CONSENSUS_REGISTRY)
  if (columns.size === 0) return
  for (const column of REQUIRED_SCHEMA_COLUMNS.runtime_evolution_consensus_registry) {
    if (!columns.has(column)) throw new SchemaInitializationError("missing_required_column")
  }
}

function runtimeEvolutionConsensusHashMaterial(object: RuntimeEvolutionConsensusObject): Record<string, unknown> {
  return {
    approval_lineage: object.approval_lineage.map((approval) => ({
      maintainer_id: String(approval.maintainer_id || ""),
      mutation_hash: String(approval.mutation_hash || ""),
      reviewed_commit_hash: String(approval.reviewed_commit_hash || "")
    })),
    evidence_only: true,
    governance_scope: String(object.governance_scope || ""),
    maintainer_set_hash: String(object.maintainer_set_hash || ""),
    mutation_hash: String(object.mutation_hash || ""),
    preo_hash: String(object.preo_hash || ""),
    quorum_threshold: Number(object.quorum_threshold || 0),
    replay_neutral: true,
    reviewed_commit_hash: String(object.reviewed_commit_hash || ""),
    runtime_scope: String(object.runtime_scope || ""),
    sco_hash: String(object.sco_hash || "")
  }
}

async function deriveRuntimeEvolutionConsensusHash(object: RuntimeEvolutionConsensusObject): Promise<string> {
  return sha256Hex(canonicalize(runtimeEvolutionConsensusHashMaterial(object)))
}

async function runtimeEvolutionApprovalHash(input: { maintainer_id: string, sco_hash: string, preo_hash: string, mutation_hash: string, canonical_hash: string, reviewed_commit_hash: string, runtime_scope: string, governance_scope: string }): Promise<string> {
  return sha256Hex(canonicalize({
    approval_type: "runtime_evolution_exact_object_approval",
    canonical_hash: input.canonical_hash,
    governance_scope: input.governance_scope,
    maintainer_id: input.maintainer_id,
    mutation_hash: input.mutation_hash,
    preo_hash: input.preo_hash,
    reviewed_commit_hash: input.reviewed_commit_hash,
    runtime_scope: input.runtime_scope,
    sco_hash: input.sco_hash
  }))
}

async function runtimeEvolutionApprovalLineageHash(approval: RuntimeEvolutionApproval): Promise<string> {
  return sha256Hex(canonicalize({
    approval_hash: approval.approval_hash,
    canonical_hash: approval.canonical_hash,
    maintainer_id: approval.maintainer_id,
    mutation_hash: approval.mutation_hash,
    reviewed_commit_hash: approval.reviewed_commit_hash
  }))
}

function orderedMaintainerSet(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value || "").split(",")
  return Array.from(new Set(raw.map((entry) => String(entry || "").trim()).filter(Boolean))).sort()
}

function approvalsFromInput(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter(isPlainRecord)
  const encoded = String(value || "")
  if (!encoded) return []
  try {
    const bytes = base64ToBytes(encoded)
    const decoded = bytes ? new TextDecoder().decode(bytes) : encoded
    const parsed = JSON.parse(decoded)
    return Array.isArray(parsed) ? parsed.filter(isPlainRecord) : []
  } catch {
    return []
  }
}

async function buildRuntimeEvolutionConsensusEnvelope(input: Record<string, unknown> = {}): Promise<RuntimeEvolutionConsensusEnvelope> {
  const maintainer_set = orderedMaintainerSet(input.maintainer_set || input.maintainers)
  const quorum_threshold = Math.max(0, Math.trunc(Number(input.quorum_threshold || 0)))
  const sco_hash = String(input.sco_hash || "")
  const preo_hash = String(input.preo_hash || "")
  const mutation_hash = String(input.mutation_hash || "")
  const reviewed_commit_hash = String(input.reviewed_commit_hash || "")
  const runtime_scope = String(input.runtime_scope || "")
  const governance_scope = String(input.governance_scope || "")
  const maintainer_set_hash = await sha256Hex(canonicalize({ maintainer_set }))
  const draftCanonical = await sha256Hex(canonicalize({ governance_scope, maintainer_set_hash, mutation_hash, preo_hash, quorum_threshold, reviewed_commit_hash, runtime_scope, sco_hash }))
  const rawApprovals = approvalsFromInput(input.approvals || input.approval_lineage)
  const approval_lineage = await Promise.all(rawApprovals.map(async (approval): Promise<RuntimeEvolutionApproval> => {
    const maintainer_id = String(approval.maintainer_id || approval.signer || approval.signer_id || "")
    const approvalCanonical = String(approval.canonical_hash || draftCanonical)
    const expectedApprovalHash = await runtimeEvolutionApprovalHash({ maintainer_id, sco_hash, preo_hash, mutation_hash: String(approval.mutation_hash || mutation_hash), canonical_hash: approvalCanonical, reviewed_commit_hash: String(approval.reviewed_commit_hash || reviewed_commit_hash), runtime_scope, governance_scope })
    const normalized: RuntimeEvolutionApproval = {
      maintainer_id,
      approval_hash: String(approval.approval_hash || expectedApprovalHash),
      reviewed_commit_hash: String(approval.reviewed_commit_hash || reviewed_commit_hash),
      mutation_hash: String(approval.mutation_hash || mutation_hash),
      canonical_hash: approvalCanonical,
      lineage_hash: String(approval.lineage_hash || "")
    }
    normalized.lineage_hash = normalized.lineage_hash || await runtimeEvolutionApprovalLineageHash(normalized)
    return normalized
  }))
  const orderedApprovals = [...approval_lineage].sort((a, b) => a.maintainer_id.localeCompare(b.maintainer_id) || a.approval_hash.localeCompare(b.approval_hash))
  let consensus_object: RuntimeEvolutionConsensusObject = {
    consensus_id: "",
    sco_hash,
    preo_hash,
    mutation_hash,
    canonical_hash: draftCanonical,
    reviewed_commit_hash,
    runtime_scope,
    governance_scope,
    quorum_threshold,
    maintainer_set_hash,
    approval_lineage: orderedApprovals,
    replay_neutral: true,
    evidence_only: true,
    generated_at: ""
  }
  const canonical_hash = await deriveRuntimeEvolutionConsensusHash(consensus_object)
  consensus_object = { ...consensus_object, consensus_id: `runtime-evolution-consensus:${canonical_hash}`, canonical_hash, generated_at: `deterministic:${canonical_hash.slice(0, 16)}` }
  consensus_object.approval_lineage = await Promise.all(consensus_object.approval_lineage.map(async (approval) => {
    const approval_hash = await runtimeEvolutionApprovalHash({ maintainer_id: approval.maintainer_id, sco_hash, preo_hash, mutation_hash: approval.mutation_hash, canonical_hash, reviewed_commit_hash: approval.reviewed_commit_hash, runtime_scope, governance_scope })
    const normalized = { ...approval, approval_hash, canonical_hash }
    return { ...normalized, lineage_hash: await runtimeEvolutionApprovalLineageHash(normalized) }
  }))
  const final_hash = await deriveRuntimeEvolutionConsensusHash(consensus_object)
  consensus_object = { ...consensus_object, consensus_id: `runtime-evolution-consensus:${final_hash}`, canonical_hash: final_hash, generated_at: `deterministic:${final_hash.slice(0, 16)}` }
  const approval_hash = await sha256Hex(canonicalize(consensus_object.approval_lineage.map((approval) => approval.approval_hash)))
  const verification = await verifyRuntimeEvolutionConsensus(consensus_object, maintainer_set)
  return { envelope_type: "RuntimeEvolutionConsensusEnvelope", consensus_object, maintainer_set, approval_hash, consensus_result: verification.consensus_result, drift_classes: verification.drift_classes, replay_neutral: true, evidence_only: true, read_only: true, mutation_capable: false, execution_authority: false, remote_authority_inherited: false }
}

async function classifyRuntimeEvolutionDrift(object: RuntimeEvolutionConsensusObject, maintainer_set: string[], approval_hash?: string): Promise<RuntimeEvolutionConsensusDriftClass[]> {
  const drift = new Set<RuntimeEvolutionConsensusDriftClass>()
  const sortedMaintainers = orderedMaintainerSet(maintainer_set)
  if (!object.sco_hash || !object.preo_hash || !object.mutation_hash || !object.canonical_hash || !object.reviewed_commit_hash) drift.add("runtime_evolution_bypass")
  if (object.evidence_only !== true || object.replay_neutral !== true) drift.add("runtime_evolution_bypass")
  if (object.runtime_scope.includes("federation_authority") || object.governance_scope.includes("remote_authority") || object.runtime_scope.includes("execute")) drift.add("federation_authority_inheritance_attempt")
  if (object.governance_scope.includes("global") || object.runtime_scope.includes("*")) drift.add("mutation_scope_expansion")
  const maintainerSetHash = await sha256Hex(canonicalize({ maintainer_set: sortedMaintainers }))
  if (maintainerSetHash !== object.maintainer_set_hash) drift.add("maintainer_set_drift")
  if (object.quorum_threshold <= 1 || object.quorum_threshold > sortedMaintainers.length) drift.add("quorum_divergence")
  const signerSet = new Set<string>()
  const lineageSet = new Set<string>()
  const inputOrder = object.approval_lineage.map((approval) => approval.maintainer_id).join("\u0000")
  const deterministicOrder = [...object.approval_lineage].sort((a, b) => a.maintainer_id.localeCompare(b.maintainer_id) || a.approval_hash.localeCompare(b.approval_hash)).map((approval) => approval.maintainer_id).join("\u0000")
  if (inputOrder !== deterministicOrder) drift.add("non_deterministic_approval_order")
  for (const approval of object.approval_lineage) {
    if (!sortedMaintainers.includes(approval.maintainer_id)) drift.add("maintainer_set_drift")
    if (signerSet.has(approval.maintainer_id)) drift.add("quorum_divergence")
    signerSet.add(approval.maintainer_id)
    if (lineageSet.has(approval.lineage_hash) || lineageSet.has(approval.approval_hash)) drift.add("governance_replay_attempt")
    lineageSet.add(approval.lineage_hash)
    lineageSet.add(approval.approval_hash)
    if (approval.mutation_hash !== object.mutation_hash) drift.add("consensus_instability")
    if (approval.reviewed_commit_hash !== object.reviewed_commit_hash) drift.add("reviewed_commit_drift")
    if (approval.canonical_hash !== object.canonical_hash) drift.add("consensus_instability")
    const expectedApprovalHash = await runtimeEvolutionApprovalHash({ maintainer_id: approval.maintainer_id, sco_hash: object.sco_hash, preo_hash: object.preo_hash, mutation_hash: object.mutation_hash, canonical_hash: object.canonical_hash, reviewed_commit_hash: object.reviewed_commit_hash, runtime_scope: object.runtime_scope, governance_scope: object.governance_scope })
    if (approval.approval_hash !== expectedApprovalHash) drift.add("approval_hash_mismatch")
    const expectedLineageHash = await runtimeEvolutionApprovalLineageHash(approval)
    if (approval.lineage_hash !== expectedLineageHash) drift.add("governance_replay_attempt")
  }
  if (signerSet.size < object.quorum_threshold) drift.add("quorum_divergence")
  if (approval_hash) {
    const actualApprovalHash = await sha256Hex(canonicalize(object.approval_lineage.map((approval) => approval.approval_hash)))
    if (actualApprovalHash !== approval_hash) drift.add("approval_hash_mismatch")
  }
  const derived = await deriveRuntimeEvolutionConsensusHash(object)
  if (derived !== object.canonical_hash || object.consensus_id !== `runtime-evolution-consensus:${object.canonical_hash}` || object.generated_at !== `deterministic:${object.canonical_hash.slice(0, 16)}`) drift.add("consensus_instability")
  return Array.from(drift).sort()
}

async function verifyRuntimeEvolutionConsensus(object: RuntimeEvolutionConsensusObject | null, maintainer_set: string[] = [], approval_hash?: string): Promise<{ consensus_result: "VALID_CONSENSUS" | "NULL", drift_classes: RuntimeEvolutionConsensusDriftClass[] }> {
  if (!object) return { consensus_result: "NULL", drift_classes: ["runtime_evolution_bypass"] }
  const drift_classes = await classifyRuntimeEvolutionDrift(object, maintainer_set, approval_hash)
  return { consensus_result: drift_classes.length === 0 ? "VALID_CONSENSUS" : "NULL", drift_classes }
}

async function appendRuntimeEvolutionConsensusObservation(env: Env, envelope: RuntimeEvolutionConsensusEnvelope) {
  await env.DB.prepare(`INSERT OR IGNORE INTO runtime_evolution_consensus_registry (consensus_id, mutation_hash, canonical_hash, governance_scope, quorum_threshold, approval_count, approval_hash, consensus_status, replay_neutral, evidence_only, generated_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'true', 'true', ?9, ?10)`).bind(
    envelope.consensus_object.consensus_id,
    envelope.consensus_object.mutation_hash,
    envelope.consensus_object.canonical_hash,
    envelope.consensus_object.governance_scope,
    String(envelope.consensus_object.quorum_threshold),
    String(envelope.consensus_object.approval_lineage.length),
    envelope.approval_hash,
    envelope.consensus_result,
    envelope.consensus_object.generated_at,
    envelope.consensus_object.generated_at
  ).run()
}

function runtimeEvolutionConsensusInputFromUrl(url: URL): Record<string, unknown> {
  return {
    sco_hash: url.searchParams.get("sco_hash") || "",
    preo_hash: url.searchParams.get("preo_hash") || "",
    mutation_hash: url.searchParams.get("mutation_hash") || "",
    reviewed_commit_hash: url.searchParams.get("reviewed_commit_hash") || "",
    runtime_scope: url.searchParams.get("runtime_scope") || "",
    governance_scope: url.searchParams.get("governance_scope") || "",
    quorum_threshold: url.searchParams.get("quorum_threshold") || "0",
    maintainer_set: url.searchParams.get("maintainer_set") || "",
    approvals: url.searchParams.get("approvals") || ""
  }
}

function continuityHashMaterial(input: any): Record<string, unknown> {
  const revocation = isPlainRecord(input?.revocation) ? input.revocation : {}
  return {
    actor_chain: Array.isArray(input?.actor_chain) ? input.actor_chain.map(String) : [],
    authority_chain: Array.isArray(input?.authority_chain) ? input.authority_chain.map(String) : [],
    constraints: canonicalRecord(input?.constraints),
    continuity_id: String(input?.continuity_id || ""),
    expires_at: String(input?.expires_at || ""),
    identity_id: String(input?.identity_id || ""),
    issued_at: String(input?.issued_at || ""),
    parent_continuity_id: input?.parent_continuity_id ? String(input.parent_continuity_id) : null,
    revocation: { revoked_at: revocation.revoked_at ?? null, status: String(revocation.status || "ACTIVE") },
    scope: canonicalRecord(input?.scope),
    session_id: String(input?.session_id || "")
  }
}

async function continuityHash(input: any): Promise<string> {
  return sha256Hex(canonicalize(continuityHashMaterial(input)))
}

async function collectContinuityDescendants(env: Env, root_continuity_id: string): Promise<string[]> {
  if (!root_continuity_id) return []
  const discovered = new Set<string>([root_continuity_id])
  const frontier = [root_continuity_id]
  while (frontier.length > 0) {
    const parent_id = frontier.shift() || ""
    const children = await env.DB.prepare(`SELECT continuity_id FROM continuity_registry WHERE parent_continuity_id=?1`).bind(parent_id).all<any>()
    for (const row of Array.isArray(children?.results) ? children.results : []) {
      const child_id = String(row?.continuity_id || "")
      if (!child_id || discovered.has(child_id)) continue
      discovered.add(child_id)
      frontier.push(child_id)
    }
  }
  return Array.from(discovered)
}

async function invalidateContinuityLineage(env: Env, continuity_id: string, status: "REVOKED" | "EXPIRED", reason: string, invalidated_at = new Date().toISOString()) {
  const ids = await collectContinuityDescendants(env, continuity_id)
  if (ids.length === 0) return
  const placeholders = ids.map((_, index) => `?${index + 1}`).join(",")
  await env.DB.prepare(`UPDATE continuity_registry SET status=?${ids.length + 1}, revoked_at=COALESCE(revoked_at, ?${ids.length + 2}) WHERE continuity_id IN (${placeholders}) AND status IN ('ACTIVE','RESERVED','EXECUTED','CONSUMED')`).bind(...ids, status, invalidated_at).run()
  await env.DB.prepare(`UPDATE authority_registry SET status='REVOKED' WHERE continuity_id IN (${placeholders}) AND status IN ('ACTIVE','VALIDATED','RESERVED','EXECUTED')`).bind(...ids).run()
  await env.DB.prepare(`UPDATE validation_registry SET status='REVOKED', result='INVALID', reason=?${ids.length + 1} WHERE continuity_id IN (${placeholders}) AND status='VALID'`).bind(...ids, reason).run()
  await env.DB.prepare(`UPDATE invocation_registry SET status='REVOKED' WHERE continuity_id IN (${placeholders}) AND status='RESERVED'`).bind(...ids).run()
}

async function cascadeRevocation(env: Env, continuity_id: string, revoked_at = new Date().toISOString()) {
  await invalidateContinuityLineage(env, continuity_id, "REVOKED", "continuity_revoked", revoked_at)
}

async function cascadeExpiration(env: Env, continuity_id: string, expired_at = new Date().toISOString()) {
  await invalidateContinuityLineage(env, continuity_id, "EXPIRED", "continuity_expired", expired_at)
}

async function cascadeSessionRevocation(env: Env, session_id: string) {
  await env.DB.prepare(`UPDATE continuity_registry SET status='REVOKED', revoked_at=COALESCE(revoked_at, ?2) WHERE session_id=?1 AND status='ACTIVE'`).bind(session_id, new Date().toISOString()).run()
  await env.DB.prepare(`UPDATE authority_registry SET status='REVOKED' WHERE session_id=?1 AND status IN ('ACTIVE','VALIDATED','RESERVED')`).bind(session_id).run()
  await env.DB.prepare(`UPDATE validation_registry SET status='REVOKED', result='INVALID', reason='session_revoked' WHERE session_id=?1 AND status='VALID'`).bind(session_id).run()
  await env.DB.prepare(`UPDATE invocation_registry SET status='REVOKED' WHERE continuity_id IN (SELECT continuity_id FROM continuity_registry WHERE session_id=?1) AND status='RESERVED'`).bind(session_id).run()
}

async function activeContinuity(env: Env, continuity_id: string, session: any, decision_id?: string): Promise<any | null> {
  if (!continuity_id || !session) return null
  const now = new Date().toISOString()
  const visited = new Set<string>()
  const ancestry: any[] = []
  let requestedContinuity: any = null
  let requestedCanonical: any = null
  let current_id = continuity_id

  while (current_id) {
    if (visited.has(current_id)) {
      await cascadeRevocation(env, continuity_id)
      return null
    }
    visited.add(current_id)

    const continuity = await env.DB.prepare(`SELECT * FROM continuity_registry WHERE continuity_id=?1`).bind(current_id).first<any>()
    if (!continuity) {
      await cascadeRevocation(env, continuity_id)
      return null
    }
    if (String(continuity.status || "") !== "ACTIVE") {
      await cascadeRevocation(env, current_id)
      return null
    }
    if (isExpired(String(continuity.expires_at || ""))) {
      await cascadeExpiration(env, current_id, now)
      return null
    }
    if (String(continuity.session_id || "") !== String(session.session_id || "")) return null
    if (String(continuity.identity_id || "") !== String(session.identity_id || "")) return null

    let canonical: any
    try { canonical = JSON.parse(String(continuity.canonical_continuity || "{}")) } catch { return null }
    const actualHash = await continuityHash(canonical)
    if (actualHash !== String(continuity.continuity_hash || "") || actualHash !== String(canonical.continuity_hash || "")) return null
    if (String(canonical.continuity_id || "") !== String(continuity.continuity_id || "")) return null
    const canonicalParent = canonical.parent_continuity_id ? String(canonical.parent_continuity_id) : ""
    const storedParent = continuity.parent_continuity_id ? String(continuity.parent_continuity_id) : ""
    if (canonicalParent !== storedParent) return null
    if (canonicalParent === current_id) {
      await cascadeRevocation(env, continuity_id)
      return null
    }
    if (current_id === continuity_id) {
      requestedContinuity = continuity
      requestedCanonical = canonical
      if (decision_id && !Array.isArray(canonical.authority_chain)) return null
      if (decision_id && !canonical.authority_chain.map(String).includes(String(decision_id))) return null
    }

    const ancestor = continuity
    const ancestorCanonical = canonical
    ancestry.push({ ...ancestor, canonical: ancestorCanonical })
    if (ancestry.length > SYSTEM_MAX_CONTINUITY_DEPTH) {
      await cascadeRevocation(env, continuity_id)
      return null
    }

    const configuredMaxDepth = Number(requestedCanonical?.constraints?.max_depth)
    if (
      Number.isFinite(configuredMaxDepth)
      && configuredMaxDepth >= 0
      && ancestry.length > configuredMaxDepth
    ) {
      await cascadeRevocation(env, continuity_id)
      return null
    }
    current_id = canonicalParent
  }

  const root = ancestry[ancestry.length - 1]
  if (!root || root.parent_continuity_id || !requestedContinuity || !requestedCanonical) return null
  return { ...requestedContinuity, canonical: requestedCanonical, ancestry }
}

type ReconciliationRegistry = typeof CANONICAL_RECONCILIATION_REGISTRY_ORDER[number]
type ReconciliationStatus = "VALID_RECONCILIATION" | "INVALID_RECONCILIATION" | "NULL"
type ReconciliationAnchor = {
  session_id?: string
  continuity_id?: string
  decision_id?: string
  execution_id?: string
  proof_id?: string
  validated_object_hash?: string
  invocation_nonce?: string
}
type CanonicalReconciliationIdentifiers = {
  session_id?: string
  continuity_id?: string
  authority_id?: string
  decision_id?: string
  aeo_id?: string
  validation_id?: string
  validated_object_hash?: string
  execution_id?: string
  proof_id?: string
  invocation_nonce?: string
  preo_id?: string
  reviewed_hash?: string
}
type ReconciliationTraceEntry = {
  registry: ReconciliationRegistry
  canonical_traversal_position: number
  reconciliation_depth: number
  lookup_key: string
  row_count: number
  lineage_hash?: string
  canonical_identifiers?: CanonicalReconciliationIdentifiers
}
type ReconciliationDrift = {
  drift_id: string
  drift_class: DriftClass
  lineage_anchor: string
  registry_origin: ReconciliationRegistry
  detected_at: string
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  deterministic_trace: ReconciliationTraceEntry[]
}
type ReconciliationResult = {
  status: ReconciliationStatus
  result: ReconciliationStatus
  lineage_anchor: string
  canonical_registry_ordering: readonly ReconciliationRegistry[]
  recursion_depth: number
  deterministic_traversal_trace: ReconciliationTraceEntry[]
  drift_classifications: ReconciliationDrift[]
}

function reconciliationAnchorKey(anchor: ReconciliationAnchor): string {
  return canonicalize({
    continuity_id: String(anchor.continuity_id || ""),
    decision_id: String(anchor.decision_id || ""),
    execution_id: String(anchor.execution_id || ""),
    invocation_nonce: String(anchor.invocation_nonce || ""),
    proof_id: String(anchor.proof_id || ""),
    session_id: String(anchor.session_id || ""),
    validated_object_hash: String(anchor.validated_object_hash || "")
  })
}

async function reconciliationDriftId(drift_class: DriftClass, registry: ReconciliationRegistry, lineage_anchor: string, trace: ReconciliationTraceEntry[]): Promise<string> {
  return sha256Hex(canonicalize({ drift_class, registry, lineage_anchor, trace }))
}

async function reconciliationInvalid(
  drift_class: DriftClass,
  registry: ReconciliationRegistry,
  anchor: ReconciliationAnchor,
  trace: ReconciliationTraceEntry[],
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "HIGH"
): Promise<ReconciliationResult> {
  const lineage_anchor = reconciliationAnchorKey(anchor)
  const drift: ReconciliationDrift = {
    drift_id: await reconciliationDriftId(drift_class, registry, lineage_anchor, trace),
    drift_class,
    lineage_anchor,
    registry_origin: registry,
    detected_at: "DETERMINISTIC_RECONCILIATION_TRAVERSAL",
    severity,
    deterministic_trace: trace.map((entry) => ({ ...entry }))
  }
  return {
    status: "INVALID_RECONCILIATION",
    result: "NULL",
    lineage_anchor,
    canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER,
    recursion_depth: trace.length,
    deterministic_traversal_trace: trace.map((entry) => ({ ...entry })),
    drift_classifications: [drift]
  }
}

function reconciliationValid(anchor: ReconciliationAnchor, trace: ReconciliationTraceEntry[]): ReconciliationResult {
  return {
    status: "VALID_RECONCILIATION",
    result: "VALID_RECONCILIATION",
    lineage_anchor: reconciliationAnchorKey(anchor),
    canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER,
    recursion_depth: trace.length,
    deterministic_traversal_trace: trace.map((entry) => ({ ...entry })),
    drift_classifications: []
  }
}

function reconciliationNull(anchor: ReconciliationAnchor, trace: ReconciliationTraceEntry[] = []): ReconciliationResult {
  return {
    status: "NULL",
    result: "NULL",
    lineage_anchor: reconciliationAnchorKey(anchor),
    canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER,
    recursion_depth: trace.length,
    deterministic_traversal_trace: trace.map((entry) => ({ ...entry })),
    drift_classifications: []
  }
}

function reconciliationLookup(anchor: ReconciliationAnchor, context: Record<string, any>, registry: ReconciliationRegistry): { sql: string, bind: string[], lookup_key: string } {
  const session_id = String(context.session?.session_id || anchor.session_id || "")
  const continuity_id = String(context.continuity?.continuity_id || anchor.continuity_id || "")
  const decision_id = String(context.authority?.decision_id || anchor.decision_id || "")
  const validated_object_hash = String(context.aeo?.validated_object_hash || anchor.validated_object_hash || "")
  const execution_id = String(context.execution?.execution_id || anchor.execution_id || "")
  const invocation_nonce = String(context.validation?.invocation_nonce || context.execution?.invocation_nonce || anchor.invocation_nonce || "")
  const proof_id = String(anchor.proof_id || "")
  switch (registry) {
    case "session_registry":
      return session_id
        ? { sql: `SELECT * FROM session_registry WHERE session_id=?1 ORDER BY created_at ASC, session_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [session_id], lookup_key: session_id }
        : { sql: `SELECT * FROM session_registry WHERE continuity_status='ACTIVE' ORDER BY created_at ASC, session_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [], lookup_key: "ACTIVE" }
    case "continuity_registry":
      return continuity_id
        ? { sql: `SELECT * FROM continuity_registry WHERE continuity_id=?1 ORDER BY issued_at ASC, continuity_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [continuity_id], lookup_key: continuity_id }
        : { sql: `SELECT * FROM continuity_registry WHERE session_id=?1 ORDER BY issued_at ASC, continuity_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [session_id], lookup_key: session_id }
    case "authority_registry":
      return decision_id
        ? { sql: `SELECT * FROM authority_registry WHERE decision_id=?1 ORDER BY created_at ASC, authority_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [decision_id], lookup_key: decision_id }
        : { sql: `SELECT * FROM authority_registry WHERE session_id=?1 AND continuity_id=?2 ORDER BY created_at ASC, authority_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [session_id, continuity_id], lookup_key: `${session_id}:${continuity_id}` }
    case "aeo_registry":
      return { sql: `SELECT * FROM aeo_registry WHERE decision_id=?1 ORDER BY created_at ASC, aeo_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [decision_id], lookup_key: decision_id }
    case "validation_registry":
      return { sql: `SELECT * FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 ORDER BY created_at ASC, validation_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [decision_id, validated_object_hash], lookup_key: `${decision_id}:${validated_object_hash}` }
    case "execution_registry":
      return execution_id
        ? { sql: `SELECT * FROM execution_registry WHERE execution_id=?1 ORDER BY created_at ASC, execution_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [execution_id], lookup_key: execution_id }
        : { sql: `SELECT * FROM execution_registry WHERE decision_id=?1 AND validated_object_hash=?2 ORDER BY created_at ASC, execution_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [decision_id, validated_object_hash], lookup_key: `${decision_id}:${validated_object_hash}` }
    case "proof_registry":
      return proof_id
        ? { sql: `SELECT * FROM proof_registry WHERE proof_id=?1 ORDER BY created_at ASC, proof_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [proof_id], lookup_key: proof_id }
        : { sql: `SELECT * FROM proof_registry WHERE execution_id=?1 AND decision_id=?2 AND validated_object_hash=?3 ORDER BY created_at ASC, proof_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [execution_id, decision_id, validated_object_hash], lookup_key: `${execution_id}:${decision_id}:${validated_object_hash}` }
    case "invocation_registry":
      return { sql: `SELECT * FROM invocation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3 ORDER BY created_at ASC, invocation_nonce ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [decision_id, validated_object_hash, invocation_nonce], lookup_key: `${decision_id}:${validated_object_hash}:${invocation_nonce}` }
    case "preo_registry":
      return { sql: `SELECT * FROM preo_registry WHERE decision_id=?1 AND reviewed_hash=?2 ORDER BY created_at ASC, preo_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [decision_id, validated_object_hash], lookup_key: `${decision_id}:${validated_object_hash}` }
  }
}

async function readReconciliationRows(env: Env, anchor: ReconciliationAnchor, context: Record<string, any>, registry: ReconciliationRegistry): Promise<{ rows: any[], lookup_key: string }> {
  const lookup = reconciliationLookup(anchor, context, registry)
  const stmt = env.DB.prepare(lookup.sql).bind(...lookup.bind)
  const result = await stmt.all<any>()
  return { rows: Array.isArray(result?.results) ? result.results : [], lookup_key: lookup.lookup_key }
}

async function verifyContinuityAncestryReadOnly(env: Env, continuity: any, session: any): Promise<"VALID" | DriftClass> {
  const visited = new Set<string>()
  let current: any = continuity
  let depth = 0
  while (current) {
    const current_id = String(current.continuity_id || "")
    if (!current_id || visited.has(current_id)) return "recursive_ancestry_drift"
    visited.add(current_id)
    depth += 1
    if (depth > RECONCILIATION_MAX_RECURSION_DEPTH) return "traversal_instability_drift"
    if (String(current.session_id || "") !== String(session.session_id || "")) return "recursive_ancestry_drift"
    if (String(current.identity_id || "") !== String(session.identity_id || "")) return "recursive_ancestry_drift"
    if (String(current.status || "") !== "ACTIVE" || current.revoked_at) return "revocation_propagation_drift"
    if (isExpired(String(current.expires_at || ""))) return "revocation_propagation_drift"
    let canonical: any
    try { canonical = JSON.parse(String(current.canonical_continuity || "{}")) } catch { return "recursive_ancestry_drift" }
    const actualHash = await continuityHash(canonical)
    if (actualHash !== String(current.continuity_hash || "") || actualHash !== String(canonical.continuity_hash || "")) return "recursive_ancestry_drift"
    const duplicateHash = await env.DB.prepare(`SELECT continuity_id FROM continuity_registry WHERE continuity_hash=?1 ORDER BY continuity_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`).bind(String(current.continuity_hash || "")).all<any>()
    if ((duplicateHash?.results || []).length > 1) return "duplicate_lineage_hash_drift"
    const canonicalParent = canonical.parent_continuity_id ? String(canonical.parent_continuity_id) : ""
    const storedParent = current.parent_continuity_id ? String(current.parent_continuity_id) : ""
    if (canonicalParent !== storedParent) return "recursive_ancestry_drift"
    if (!canonicalParent) return "VALID"
    current = await env.DB.prepare(`SELECT * FROM continuity_registry WHERE continuity_id=?1`).bind(canonicalParent).first<any>()
    if (!current) return "orphan_legitimacy_object_drift"
  }
  return "orphan_legitimacy_object_drift"
}

async function verifyReconciliationRegistryRow(env: Env, registry: ReconciliationRegistry, row: any, context: Record<string, any>): Promise<"VALID" | DriftClass> {
  switch (registry) {
    case "session_registry":
      if (String(row.continuity_status || "") !== "ACTIVE" || isExpired(String(row.expires_at || ""))) return "revocation_propagation_drift"
      context.session = row
      return "VALID"
    case "continuity_registry": {
      if (!context.session) return "orphan_legitimacy_object_drift"
      const ancestry = await verifyContinuityAncestryReadOnly(env, row, context.session)
      if (ancestry !== "VALID") return ancestry
      context.continuity = row
      return "VALID"
    }
    case "authority_registry":
      if (!context.session || !context.continuity) return "orphan_legitimacy_object_drift"
      if (String(row.session_id || "") !== String(context.session.session_id || "")) return "recursive_ancestry_drift"
      if (String(row.continuity_id || "") !== String(context.continuity.continuity_id || "")) return "recursive_ancestry_drift"
      if (String(row.identity_id || "") !== String(context.session.identity_id || "")) return "recursive_ancestry_drift"
      if (["REVOKED", "EXPIRED"].includes(String(row.status || ""))) return "revocation_propagation_drift"
      context.authority = row
      return "VALID"
    case "aeo_registry": {
      if (!context.authority) return "orphan_legitimacy_object_drift"
      if (String(row.authority_id || "") !== String(context.authority.authority_id || "")) return "recursive_ancestry_drift"
      if (String(row.continuity_id || "") !== String(context.authority.continuity_id || "")) return "recursive_ancestry_drift"
      let parsed: any
      try { parsed = JSON.parse(String(row.canonical_aeo || "{}")) } catch { return "recursive_ancestry_drift" }
      const canonicalAeo = toCanonicalAeo(parsed)
      const actualHash = canonicalAeo ? await sha256Hex(canonicalize(canonicalAeo)) : ""
      if (!canonicalAeo || actualHash !== String(row.validated_object_hash || "")) return "recursive_ancestry_drift"
      context.aeo = row
      return "VALID"
    }
    case "validation_registry":
      if (!context.session || !context.continuity || !context.aeo) return "orphan_legitimacy_object_drift"
      if (String(row.session_id || "") !== String(context.session.session_id || "")) return "recursive_ancestry_drift"
      if (String(row.continuity_id || "") !== String(context.continuity.continuity_id || "")) return "recursive_ancestry_drift"
      if (String(row.validated_object_hash || "") !== String(context.aeo.validated_object_hash || "")) return "recursive_ancestry_drift"
      if (String(row.status || "") !== "VALID" || String(row.result || "") !== "VALID") return "replay_chain_drift"
      context.validation = row
      return "VALID"
    case "execution_registry":
      if (!context.validation) return "orphan_legitimacy_object_drift"
      if (String(row.session_id || "") !== String(context.validation.session_id || "")) return "recursive_ancestry_drift"
      if (String(row.continuity_id || "") !== String(context.validation.continuity_id || "")) return "recursive_ancestry_drift"
      if (String(row.decision_id || "") !== String(context.validation.decision_id || "")) return "recursive_ancestry_drift"
      if (String(row.validated_object_hash || "") !== String(context.validation.validated_object_hash || "")) return "recursive_ancestry_drift"
      if (String(row.invocation_nonce || "") !== String(context.validation.invocation_nonce || "")) return "replay_chain_drift"
      if (String(row.status || "") !== "EXECUTED") return "proof_lineage_drift"
      context.execution = row
      return "VALID"
    case "proof_registry": {
      if (!context.execution || !context.continuity || !context.authority) return "orphan_legitimacy_object_drift"
      if (String(row.execution_id || "") !== String(context.execution.execution_id || "")) return "proof_lineage_drift"
      if (String(row.decision_id || "") !== String(context.execution.decision_id || "")) return "proof_lineage_drift"
      if (String(row.validated_object_hash || "") !== String(context.execution.validated_object_hash || "")) return "proof_lineage_drift"
      if (String(row.continuity_id || "") !== String(context.continuity.continuity_id || "")) return "proof_lineage_drift"
      if (String(row.continuity_hash || "") !== String(context.continuity.continuity_hash || "")) return "proof_lineage_drift"
      let authorityLineage: any = null
      let executionLineage: any = null
      try { authorityLineage = JSON.parse(String(row.authority_lineage || "{}")); executionLineage = JSON.parse(String(row.execution_lineage || "{}")) } catch { return "proof_lineage_drift" }
      if (String(authorityLineage.authority_id || "") !== String(context.authority.authority_id || "")) return "proof_lineage_drift"
      if (String(executionLineage.execution_id || "") !== String(context.execution.execution_id || "")) return "proof_lineage_drift"
      context.proof = row
      return "VALID"
    }
    case "invocation_registry":
      if (!context.validation || !context.execution) return "orphan_legitimacy_object_drift"
      if (String(row.decision_id || "") !== String(context.validation.decision_id || "")) return "replay_chain_drift"
      if (String(row.validated_object_hash || "") !== String(context.validation.validated_object_hash || "")) return "replay_chain_drift"
      if (String(row.invocation_nonce || "") !== String(context.validation.invocation_nonce || "")) return "replay_chain_drift"
      if (String(row.continuity_id || "") !== String(context.validation.continuity_id || "")) return "replay_chain_drift"
      if (String(row.status || "") !== "EXECUTED") return "replay_chain_drift"
      context.invocation = row
      return "VALID"
    case "preo_registry":
      if (!context.authority || !context.aeo) return "orphan_legitimacy_object_drift"
      if (String(row.decision_id || "") !== String(context.authority.decision_id || "")) return "preo_ancestry_drift"
      if (String(row.authority_id || "") !== String(context.authority.authority_id || "")) return "preo_ancestry_drift"
      if (String(row.continuity_id || "") !== String(context.authority.continuity_id || "")) return "preo_ancestry_drift"
      if (String(row.reviewed_hash || "") !== String(context.aeo.validated_object_hash || "")) return "preo_ancestry_drift"
      if (String(row.status || "") !== "PREO_VALID") return "preo_ancestry_drift"
      context.preo = row
      return "VALID"
  }
}

function populatedCanonicalIdentifiers(input: CanonicalReconciliationIdentifiers): CanonicalReconciliationIdentifiers {
  return canonicalRecord(Object.fromEntries(Object.entries(input).filter(([, value]) => typeof value === "string" && value.length > 0))) as CanonicalReconciliationIdentifiers
}

function canonicalIdentifiersFromReconciliationRow(registry: ReconciliationRegistry, row: any): CanonicalReconciliationIdentifiers {
  switch (registry) {
    case "session_registry":
      return populatedCanonicalIdentifiers({ session_id: String(row?.session_id || "") })
    case "continuity_registry":
      return populatedCanonicalIdentifiers({ continuity_id: String(row?.continuity_id || ""), session_id: String(row?.session_id || "") })
    case "authority_registry":
      return populatedCanonicalIdentifiers({ authority_id: String(row?.authority_id || ""), continuity_id: String(row?.continuity_id || ""), decision_id: String(row?.decision_id || ""), session_id: String(row?.session_id || "") })
    case "aeo_registry":
      return populatedCanonicalIdentifiers({ aeo_id: String(row?.aeo_id || ""), authority_id: String(row?.authority_id || ""), continuity_id: String(row?.continuity_id || ""), decision_id: String(row?.decision_id || ""), validated_object_hash: String(row?.validated_object_hash || "") })
    case "validation_registry":
      return populatedCanonicalIdentifiers({ validation_id: String(row?.validation_id || ""), continuity_id: String(row?.continuity_id || ""), decision_id: String(row?.decision_id || ""), invocation_nonce: String(row?.invocation_nonce || ""), session_id: String(row?.session_id || ""), validated_object_hash: String(row?.validated_object_hash || "") })
    case "execution_registry":
      return populatedCanonicalIdentifiers({ continuity_id: String(row?.continuity_id || ""), decision_id: String(row?.decision_id || ""), execution_id: String(row?.execution_id || ""), invocation_nonce: String(row?.invocation_nonce || ""), session_id: String(row?.session_id || ""), validated_object_hash: String(row?.validated_object_hash || "") })
    case "proof_registry":
      return populatedCanonicalIdentifiers({ continuity_id: String(row?.continuity_id || ""), decision_id: String(row?.decision_id || ""), execution_id: String(row?.execution_id || ""), proof_id: String(row?.proof_id || ""), session_id: String(row?.session_id || ""), validated_object_hash: String(row?.validated_object_hash || "") })
    case "invocation_registry":
      return populatedCanonicalIdentifiers({ continuity_id: String(row?.continuity_id || ""), decision_id: String(row?.decision_id || ""), invocation_nonce: String(row?.invocation_nonce || ""), validated_object_hash: String(row?.validated_object_hash || "") })
    case "preo_registry":
      return populatedCanonicalIdentifiers({ preo_id: String(row?.preo_id || ""), authority_id: String(row?.authority_id || ""), continuity_id: String(row?.continuity_id || ""), decision_id: String(row?.decision_id || ""), reviewed_hash: String(row?.reviewed_hash || "") })
  }
}

function canonicalPersistedIdentifierMap(result: ReconciliationResult): Map<ReconciliationRegistry, CanonicalReconciliationIdentifiers> {
  const canonical_persisted_identifiers = new Map<ReconciliationRegistry, CanonicalReconciliationIdentifiers>()
  for (const entry of result.deterministic_traversal_trace) {
    if (entry.canonical_identifiers && Object.keys(entry.canonical_identifiers).length > 0) canonical_persisted_identifiers.set(entry.registry, entry.canonical_identifiers)
  }
  return canonical_persisted_identifiers
}

function resolveCanonicalPortableIdentifiers(result: ReconciliationResult): ReconciliationAnchor | null {
  const canonical_persisted_identifiers = canonicalPersistedIdentifierMap(result)
  const authority = canonical_persisted_identifiers.get("authority_registry") || {}
  const aeo = canonical_persisted_identifiers.get("aeo_registry") || {}
  const validation = canonical_persisted_identifiers.get("validation_registry") || {}
  const execution = canonical_persisted_identifiers.get("execution_registry") || {}
  const proof = canonical_persisted_identifiers.get("proof_registry") || {}
  const invocation = canonical_persisted_identifiers.get("invocation_registry") || {}
  const continuity = canonical_persisted_identifiers.get("continuity_registry") || {}
  const decision_id = authority.decision_id || validation.decision_id || execution.decision_id || proof.decision_id || aeo.decision_id
  const validated_object_hash = proof.validated_object_hash || validation.validated_object_hash || aeo.validated_object_hash || execution.validated_object_hash
  const continuity_id = continuity.continuity_id || authority.continuity_id || validation.continuity_id || execution.continuity_id || proof.continuity_id
  if (!decision_id || !validated_object_hash || !continuity_id) return null
  return {
    decision_id,
    validated_object_hash,
    continuity_id,
    execution_id: execution.execution_id || proof.execution_id,
    proof_id: proof.proof_id,
    invocation_nonce: invocation.invocation_nonce || validation.invocation_nonce || execution.invocation_nonce,
    session_id: authority.session_id || validation.session_id || execution.session_id || proof.session_id || continuity.session_id
  }
}

async function deterministicRecursiveReconciliationTraversal(env: Env, anchor: ReconciliationAnchor): Promise<ReconciliationResult> {
  if (!hasDb(env)) return reconciliationNull(anchor)
  const context: Record<string, any> = {}
  const trace: ReconciliationTraceEntry[] = []
  for (const registry of CANONICAL_RECONCILIATION_REGISTRY_ORDER) {
    if (trace.length >= RECONCILIATION_MAX_RECURSION_DEPTH) return reconciliationInvalid("traversal_instability_drift", registry, anchor, trace, "CRITICAL")
    const { rows, lookup_key } = await readReconciliationRows(env, anchor, context, registry)
    const row = rows.length === 1 ? rows[0] : null
    const traceEntry: ReconciliationTraceEntry = {
      registry,
      canonical_traversal_position: CANONICAL_RECONCILIATION_REGISTRY_ORDER.indexOf(registry),
      reconciliation_depth: trace.length + 1,
      lookup_key,
      row_count: rows.length,
      lineage_hash: String(row?.continuity_hash || row?.validated_object_hash || row?.reviewed_hash || ""),
      canonical_identifiers: row ? canonicalIdentifiersFromReconciliationRow(registry, row) : undefined
    }
    trace.push(traceEntry)
    if (rows.length === 0) return reconciliationInvalid("orphan_legitimacy_object_drift", registry, anchor, trace)
    if (rows.length > 1) return reconciliationInvalid("traversal_instability_drift", registry, anchor, trace)
    const rowDrift = await verifyReconciliationRegistryRow(env, registry, row, context)
    if (rowDrift !== "VALID") return reconciliationInvalid(rowDrift, registry, anchor, trace)
  }
  return reconciliationValid(anchor, trace)
}


type ReconciliationScheduleAnchor = ReconciliationAnchor & {
  canonical_schedule_position: number
  scheduled_registry: "proof_registry"
}
type ReconciliationScheduleWindow = {
  status: "SCHEDULED_RECONCILIATION" | "NULL"
  scheduler_mode: "deterministic_read_only_traversal"
  window_id: string
  batch_limit: number
  ordered_by: readonly string[]
  read_only: true
  replay_neutral: true
  canonical_registry_ordering: readonly ReconciliationRegistry[]
  anchors: ReconciliationScheduleAnchor[]
}
type ReconciliationSummaryObject = {
  reconciliation_id: string
  reconciliation_timestamp: string
  status: ReconciliationStatus
  lineage_anchor: string
  traversal_trace: ReconciliationTraceEntry[]
  drift_classifications: ReconciliationDrift[]
  registry_lineage_anchors: string[]
  registry_integrity_summary: {
    registries_checked: number
    drift_count: number
    bounded_recursion_depth: number
    canonical_registry_ordering: readonly ReconciliationRegistry[]
  }
}
type FederatedLineageEvidence = {
  runtime_id: string
  trust_domain: "local_runtime" | "foreign_runtime" | "portable_proof_bundle"
  lineage_hash: string
  decision_id: string
  validated_object_hash: string
  invocation_nonce: string
  proof_id: string
  revocation_state: "ACTIVE" | "REVOKED" | "EXPIRED" | "UNKNOWN"
  parent_lineage_hash?: string
}
type FederatedLineageVerification = {
  status: "FEDERATED_LINEAGE_OBSERVED" | "NULL"
  drift_class?: DriftClass
  local_runtime_id: string
  remote_runtime_id: string
  trust_domain_boundary: "foreign_lineage_is_evidence_not_authority"
  bounded_federation_depth: number
  replay_isolation: "remote_replay_state_not_consumed"
  lineage_continuity_hash?: string
}
type FederatedRevocationEvidence = {
  runtime_id: string
  remote_runtime_id: string
  continuity_id: string
  decision_id: string
  validated_object_hash: string
  revocation_class: string
  revocation_reason: string
  lineage_hash: string
  reconciliation_merkle_root: string
  attestation_hash: string
  observed_at: string
}
type FederatedRevocationEvidenceEnvelope = {
  evidence_type: "FederatedRevocationEvidence"
  evidence_hash: string
  envelope_hash: string
  evidence: FederatedRevocationEvidence
  replay_neutral: true
  read_only: true
  mutation_capable: false
  federation_boundary: "portable_evidence_not_portable_authority"
  deterministic_serialization: true
  exact_object_bound: true
  canonical_hash_locked: true
  remote_authority_inherited: false
  remote_execution_legitimacy: false
  replay_state_consumed: false
}
type FederatedRevocationVerification = {
  status: "FEDERATED_REVOCATION_OBSERVED" | "NULL"
  result: "FEDERATED_REVOCATION_OBSERVED" | "NULL"
  drift_class?: DriftClass
  fate?: "federated_revocation_identity_mismatch" | "federated_revocation_replay_collision" | "federated_revocation_without_lineage" | "federated_remote_revocation_authority_inference" | "federated_checkpoint_revocation_divergence" | "federated_expired_lineage_visibility_corruption" | "federated_revocation_envelope_hash_mismatch" | "federated_revocation_exact_object_flag_drift" | "federated_revocation_anchor_mismatch" | "federated_revocation_reconciliation_hash_as_validated_hash" | "federated_revocation_stale_envelope_replay"
  evidence_hash?: string
  envelope_hash?: string
  envelope?: FederatedRevocationEvidenceEnvelope
  observability_only: true
  local_validation_required: true
  remote_authority_inherited: false
  remote_execution_legitimacy: false
  replay_state_consumed: false
  replay_neutral: true
}


type FederationTier = "TRUSTED_INTERNAL" | "TRUSTED_EXTERNAL" | "UNTRUSTED_EXTERNAL" | "QUARANTINED" | "UNKNOWN"
type FederationVerificationStatus = "VERIFIED" | "UNVERIFIED" | "CORRUPTED" | "LINEAGE_MISMATCH" | "REPLAY_DETECTED" | "NULL_STATE"
type FederationClassification = {
  federation_origin: string
  federation_tier: FederationTier
  verification_status: FederationVerificationStatus
  evidence_only: true
  remote_authority_denied: true
}
type FederatedTrustEnvelope = FederationClassification & {
  continuity_reference: string
  lineage_root: string
  observed_at: string
}
type FederationVerificationResult = {
  status: "FEDERATED_EVIDENCE_OBSERVED" | "NULL"
  envelope: FederatedTrustEnvelope
  canonical_hash: string
  drift_class?: DriftClass
  remote_authority_denied: true
  evidence_only: true
}
type RevocationTopologyNode = {
  topology_layer: "authority" | "delegated_authority" | "execution_lineage" | "proof_lineage" | "federated_projection_lineage"
  object_id: string
  parent_object_id: string
  lineage_hash: string
  status: string
}
type RevocationTopology = {
  topology_id: string
  authority_id: string
  continuity_id: string
  lineage_root: string
  nodes: RevocationTopologyNode[]
  drift_classifications: DriftClass[]
  read_only: true
  replay_neutral: true
  mutation_capable: false
}
type ObservabilityEnvelope = {
  envelope_id: string
  canonical_hash: string
  lineage_root: string
  continuity_id: string
  federation_classification: FederationClassification
  drift_summary: DriftClass[]
  proof_summary: Record<string, unknown>
  replay_indicators: string[]
  generated_at: string
}

type PortableReconciliationEnvelope = {
  media_type: "application/vnd.mindshift.reconciliation+jcs"
  dsse_payload_type: "application/vnd.mindshift.reconciliation.v1+json"
  canonicalization: "JCS"
  content_addressed_lineage_hash: string
  exact_object_hash: string
  payload: Record<string, unknown>
}

function reconciliationAnchorFromRequest(url: URL): ReconciliationAnchor {
  return {
    session_id: url.searchParams.get("session_id") || undefined,
    continuity_id: url.searchParams.get("continuity_id") || undefined,
    decision_id: url.searchParams.get("decision_id") || undefined,
    execution_id: url.searchParams.get("execution_id") || undefined,
    proof_id: url.searchParams.get("proof_id") || undefined,
    validated_object_hash: url.searchParams.get("validated_object_hash") || undefined,
    invocation_nonce: url.searchParams.get("invocation_nonce") || undefined
  }
}

async function deterministicReconciliationId(kind: string, payload: unknown): Promise<string> {
  return sha256Hex(canonicalize({ kind, payload }))
}

async function deterministicReconciliationSchedule(env: Env): Promise<ReconciliationScheduleWindow> {
  const ordered_by = [
    "proof_registry.created_at ASC",
    "proof_registry.decision_id ASC",
    "proof_registry.execution_id ASC",
    "proof_registry.proof_id ASC"
  ] as const
  if (!hasDb(env)) {
    return {
      status: "NULL",
      scheduler_mode: "deterministic_read_only_traversal",
      window_id: await deterministicReconciliationId("schedule", { anchors: [], ordered_by }),
      batch_limit: RECONCILIATION_SCHEDULER_BATCH_LIMIT,
      ordered_by,
      read_only: true,
      replay_neutral: true,
      canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER,
      anchors: []
    }
  }
  const result = await env.DB.prepare(`SELECT session_id,continuity_id,decision_id,execution_id,proof_id,validated_object_hash FROM proof_registry ORDER BY created_at ASC, decision_id ASC, execution_id ASC, proof_id ASC LIMIT ${RECONCILIATION_SCHEDULER_BATCH_LIMIT}`).all<any>()
  const anchors = (Array.isArray(result?.results) ? result.results : []).map((row, index): ReconciliationScheduleAnchor => ({
    canonical_schedule_position: index + 1,
    scheduled_registry: "proof_registry",
    session_id: String(row.session_id || ""),
    continuity_id: String(row.continuity_id || ""),
    decision_id: String(row.decision_id || ""),
    execution_id: String(row.execution_id || ""),
    proof_id: String(row.proof_id || ""),
    validated_object_hash: String(row.validated_object_hash || "")
  }))
  const windowCore = { anchors, batch_limit: RECONCILIATION_SCHEDULER_BATCH_LIMIT, ordered_by }
  return {
    status: anchors.length ? "SCHEDULED_RECONCILIATION" : "NULL",
    scheduler_mode: "deterministic_read_only_traversal",
    window_id: await deterministicReconciliationId("schedule", windowCore),
    batch_limit: RECONCILIATION_SCHEDULER_BATCH_LIMIT,
    ordered_by,
    read_only: true,
    replay_neutral: true,
    canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER,
    anchors
  }
}

async function reconciliationSummaryObject(result: ReconciliationResult, reconciliation_timestamp: string): Promise<ReconciliationSummaryObject> {
  const registry_lineage_anchors = result.deterministic_traversal_trace.map((entry) => canonicalize({ registry: entry.registry, lookup_key: entry.lookup_key, lineage_hash: entry.lineage_hash || "" }))
  const stable = {
    status: result.status,
    lineage_anchor: result.lineage_anchor,
    traversal_trace: result.deterministic_traversal_trace,
    drift_classifications: result.drift_classifications.map((drift) => drift.drift_class),
    registry_lineage_anchors
  }
  return {
    reconciliation_id: await deterministicReconciliationId("report", stable),
    reconciliation_timestamp,
    status: result.status,
    lineage_anchor: result.lineage_anchor,
    traversal_trace: result.deterministic_traversal_trace.map((entry) => ({ ...entry })),
    drift_classifications: result.drift_classifications.map((drift) => ({ ...drift, deterministic_trace: drift.deterministic_trace.map((entry) => ({ ...entry })) })),
    registry_lineage_anchors,
    registry_integrity_summary: {
      registries_checked: result.deterministic_traversal_trace.length,
      drift_count: result.drift_classifications.length,
      bounded_recursion_depth: result.recursion_depth,
      canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER
    }
  }
}

async function portableReconciliationEnvelope(payload: Record<string, unknown>): Promise<PortableReconciliationEnvelope> {
  const exact_object_hash = await sha256Hex(canonicalize(payload))
  return {
    media_type: "application/vnd.mindshift.reconciliation+jcs",
    dsse_payload_type: "application/vnd.mindshift.reconciliation.v1+json",
    canonicalization: "JCS",
    content_addressed_lineage_hash: await sha256Hex(canonicalize({ exact_object_hash, lineage_anchor: String(payload.lineage_anchor || "") })),
    exact_object_hash,
    payload: canonicalRecord(payload)
  }
}


function canonicalFederatedRevocationEvidence(input: any): FederatedRevocationEvidence | null {
  const evidence = {
    runtime_id: String(input?.runtime_id || ""),
    remote_runtime_id: String(input?.remote_runtime_id || ""),
    continuity_id: String(input?.continuity_id || ""),
    decision_id: String(input?.decision_id || ""),
    validated_object_hash: String(input?.validated_object_hash || ""),
    revocation_class: String(input?.revocation_class || ""),
    revocation_reason: String(input?.revocation_reason || ""),
    lineage_hash: String(input?.lineage_hash || ""),
    reconciliation_merkle_root: String(input?.reconciliation_merkle_root || ""),
    attestation_hash: String(input?.attestation_hash || ""),
    observed_at: String(input?.observed_at || "")
  }
  if (Object.values(evidence).some((value) => !value)) return null
  if (evidence.runtime_id === evidence.remote_runtime_id) return null
  if (![evidence.validated_object_hash, evidence.lineage_hash, evidence.reconciliation_merkle_root, evidence.attestation_hash].every((value) => /^[a-f0-9]{64}$/.test(value))) return null
  return Object.freeze(evidence)
}

async function deterministicFederatedRevocationEvidenceHash(evidence: FederatedRevocationEvidence): Promise<string> {
  return sha256Hex(canonicalize({ evidence_type: "FederatedRevocationEvidence", deterministic_serialization: true, exact_object_bound: true, canonical_hash_locked: true, evidence }))
}

function federatedRevocationEnvelopeCore(evidence: FederatedRevocationEvidence, evidence_hash: string): Omit<FederatedRevocationEvidenceEnvelope, "envelope_hash"> {
  return {
    evidence_type: "FederatedRevocationEvidence",
    evidence_hash,
    evidence,
    replay_neutral: true,
    read_only: true,
    mutation_capable: false,
    federation_boundary: "portable_evidence_not_portable_authority",
    deterministic_serialization: true,
    exact_object_bound: true,
    canonical_hash_locked: true,
    remote_authority_inherited: false,
    remote_execution_legitimacy: false,
    replay_state_consumed: false
  }
}

async function deterministicFederatedRevocationEnvelopeHash(evidence: FederatedRevocationEvidence, evidence_hash: string): Promise<string> {
  return sha256Hex(canonicalize(federatedRevocationEnvelopeCore(evidence, evidence_hash)))
}

async function replayNeutralFederatedRevocationEvidenceEnvelope(evidence: FederatedRevocationEvidence): Promise<FederatedRevocationEvidenceEnvelope> {
  const evidence_hash = await deterministicFederatedRevocationEvidenceHash(evidence)
  const envelope_hash = await deterministicFederatedRevocationEnvelopeHash(evidence, evidence_hash)
  return Object.freeze({ ...federatedRevocationEnvelopeCore(evidence, evidence_hash), envelope_hash })
}

async function classifyFederatedRevocationEvidence(input: any, expected: ReconciliationAnchor, checkpoint?: ReconciliationCheckpoint | null, local_runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<FederatedRevocationVerification> {
  const payload = isPlainRecord(input?.evidence) ? input.evidence : input
  const evidence = canonicalFederatedRevocationEvidence(payload)
  const nullResult = (drift_class: DriftClass, fate: NonNullable<FederatedRevocationVerification["fate"]>): FederatedRevocationVerification => ({ status: "NULL", result: "NULL", drift_class, fate, observability_only: true, local_validation_required: true, remote_authority_inherited: false, remote_execution_legitimacy: false, replay_state_consumed: false, replay_neutral: true })
  if (isPlainRecord(input) && ((input as any).remote_authority_inherited === true || (input as any).remote_execution_legitimacy === true || (input as any).local_revocation_authority === true || (input as any).mutation_capable === true)) return nullResult("federated_revocation_projection_drift", "federated_remote_revocation_authority_inference")
  if (!evidence) return nullResult("federated_revocation_divergence_drift", "federated_revocation_identity_mismatch")
  const recomputed_evidence_hash = await deterministicFederatedRevocationEvidenceHash(evidence)
  const supplied_evidence_hash = isPlainRecord(input) ? String(input.evidence_hash || "") : ""
  if (isPlainRecord(input) && input.evidence) {
    if ((input as any).exact_object_bound !== true || (input as any).canonical_hash_locked !== true) return nullResult("federated_revocation_exact_object_drift", "federated_revocation_exact_object_flag_drift")
    if (supplied_evidence_hash !== recomputed_evidence_hash) return nullResult("federated_revocation_exact_object_drift", "federated_revocation_envelope_hash_mismatch")
    const deterministic_envelope_hash = await deterministicFederatedRevocationEnvelopeHash(evidence, recomputed_evidence_hash)
    const canonical_envelope_hash = String(input.envelope_hash || "")
    if (canonical_envelope_hash !== deterministic_envelope_hash) return nullResult("federated_revocation_exact_object_drift", "federated_revocation_stale_envelope_replay")
  }
  if (evidence.runtime_id !== local_runtime_id) return nullResult("federated_revocation_divergence_drift", "federated_revocation_identity_mismatch")
  if (!evidence.lineage_hash) return nullResult("federated_revocation_divergence_drift", "federated_revocation_without_lineage")
  if (expected.decision_id && evidence.decision_id !== expected.decision_id) return nullResult("federated_revocation_replay_drift", "federated_revocation_replay_collision")
  if (expected.validated_object_hash && evidence.validated_object_hash !== expected.validated_object_hash) return nullResult("federated_revocation_anchor_drift", "federated_revocation_anchor_mismatch")
  if (checkpoint && evidence.validated_object_hash === checkpoint.reconciliation_merkle_root) return nullResult("federated_revocation_anchor_drift", "federated_revocation_reconciliation_hash_as_validated_hash")
  if (expected.continuity_id && evidence.continuity_id !== expected.continuity_id) return nullResult("federated_revocation_divergence_drift", "federated_revocation_identity_mismatch")
  if (checkpoint && evidence.reconciliation_merkle_root !== checkpoint.reconciliation_merkle_root) return nullResult("federated_checkpoint_revocation_drift", "federated_checkpoint_revocation_divergence")
  if (evidence.revocation_class === "EXPIRED" && !/^\d{4}-\d{2}-\d{2}T/.test(evidence.observed_at)) return nullResult("federated_expiration_visibility_drift", "federated_expired_lineage_visibility_corruption")
  const envelope = await replayNeutralFederatedRevocationEvidenceEnvelope(evidence)
  return { status: "FEDERATED_REVOCATION_OBSERVED", result: "FEDERATED_REVOCATION_OBSERVED", evidence_hash: envelope.evidence_hash, envelope_hash: envelope.envelope_hash, envelope, observability_only: true, local_validation_required: true, remote_authority_inherited: false, remote_execution_legitimacy: false, replay_state_consumed: false, replay_neutral: true }
}

async function federatedRevocationEvidenceFromResult(result: ReconciliationResult, state: ReconciliationCheckpoint, observed_at: string, remote_runtime_id = "mindshift-federated://observed-runtime"): Promise<FederatedRevocationEvidenceEnvelope | null> {
  const canonical = resolveCanonicalPortableIdentifiers(result)
  if (!canonical) return null
  const state_id = state.checkpoint_id
  const object_hash = canonical.validated_object_hash
  const drift_reason = result.drift_classifications.find((drift) => String(drift.drift_class).includes("revocation"))?.drift_class || "observed_remote_revocation_state"
  const evidence = canonicalFederatedRevocationEvidence({
    runtime_id: LOCAL_FEDERATION_RUNTIME_ID,
    remote_runtime_id,
    continuity_id: canonical.continuity_id,
    decision_id: canonical.decision_id,
    revocation_class: result.drift_classifications.some((drift) => drift.drift_class === "revocation_propagation_drift") ? "REVOKED" : "OBSERVED",
    revocation_reason: String(drift_reason),
    lineage_hash: await sha256Hex(canonicalize({ canonical_registry_ordering: result.canonical_registry_ordering, deterministic_traversal_trace: result.deterministic_traversal_trace })),
    reconciliation_merkle_root: state.reconciliation_merkle_root,
    validated_object_hash: object_hash,
    attestation_hash: await sha256Hex(canonicalize({ attestation: "federated_revocation_observability", state_id })),
    observed_at
  })
  return evidence ? replayNeutralFederatedRevocationEvidenceEnvelope(evidence) : null
}

async function verifyFederatedLineageContinuity(evidence: FederatedLineageEvidence[], local_runtime_id: string): Promise<FederatedLineageVerification> {
  const bounded_federation_depth = evidence.length
  if (!local_runtime_id || bounded_federation_depth === 0 || bounded_federation_depth > RECONCILIATION_MAX_RECURSION_DEPTH) {
    return { status: "NULL", drift_class: "federated_lineage_drift", local_runtime_id, remote_runtime_id: "", trust_domain_boundary: "foreign_lineage_is_evidence_not_authority", bounded_federation_depth, replay_isolation: "remote_replay_state_not_consumed" }
  }
  const [head, ...rest] = evidence
  if (head.trust_domain !== "local_runtime" || head.runtime_id !== local_runtime_id) {
    return { status: "NULL", drift_class: "foreign_ancestry_mismatch_drift", local_runtime_id, remote_runtime_id: String(head.runtime_id || ""), trust_domain_boundary: "foreign_lineage_is_evidence_not_authority", bounded_federation_depth, replay_isolation: "remote_replay_state_not_consumed" }
  }
  let previous = head
  for (const item of rest) {
    if (item.trust_domain === "local_runtime" || String(item.parent_lineage_hash || "") !== String(previous.lineage_hash || "")) {
      return { status: "NULL", drift_class: "federated_lineage_drift", local_runtime_id, remote_runtime_id: String(item.runtime_id || ""), trust_domain_boundary: "foreign_lineage_is_evidence_not_authority", bounded_federation_depth, replay_isolation: "remote_replay_state_not_consumed" }
    }
    if (item.decision_id !== previous.decision_id || item.validated_object_hash !== previous.validated_object_hash || item.invocation_nonce !== previous.invocation_nonce) {
      return { status: "NULL", drift_class: "federated_replay_discontinuity_drift", local_runtime_id, remote_runtime_id: String(item.runtime_id || ""), trust_domain_boundary: "foreign_lineage_is_evidence_not_authority", bounded_federation_depth, replay_isolation: "remote_replay_state_not_consumed" }
    }
    previous = item
  }
  return {
    status: "FEDERATED_LINEAGE_OBSERVED",
    local_runtime_id,
    remote_runtime_id: String(previous.runtime_id || ""),
    trust_domain_boundary: "foreign_lineage_is_evidence_not_authority",
    bounded_federation_depth,
    replay_isolation: "remote_replay_state_not_consumed",
    lineage_continuity_hash: await sha256Hex(canonicalize(evidence))
  }
}


type RemoteRuntimeClassification = "LOCAL_RUNTIME" | "FEDERATED_RUNTIME" | "EXTERNAL_REFERENCE" | "UNTRUSTED_RUNTIME" | "PORTABLE_EVIDENCE_ONLY"
type PortableLegitimacyBundle = {
  runtime_id: string
  reconciliation_id: string
  decision_id: string
  validated_object_hash: string
  proof_id: string
  execution_id: string
  invocation_nonce: string
  continuity_id: string
  authority_lineage_hash: string
  proof_lineage_hash: string
  replay_lineage_hash: string
  preo_lineage_hash: string
  attestation_hash: string
  reconciliation_merkle_root: string
  federation_boundary: string
  emitted_at: string
}
type ReconciliationMerkleNode = {
  position: number
  layer: "session" | "continuity" | "authority" | "AEO" | "validation" | "execution" | "proof" | "attestation" | "PREO"
  registry: string
  object_hash: string
  parent_hash: string
  node_hash: string
}
type ReconciliationCheckpoint = {
  checkpoint_id: string
  runtime_id: string
  reconciliation_merkle_root: string
  traversal_position: number
  deterministic_hash: string
  lineage_count: number
  replay_snapshot_hash: string
  drift_snapshot_hash: string
  revocation_snapshot_hash: string
  created_at: string
}
type ReconciliationWitnessEnvelope = {
  witness_id: string
  runtime_classification: RemoteRuntimeClassification
  authority_boundary: "portable_evidence_not_portable_authority"
  local_validation_required: true
  replay_neutral: true
  mutation_capable: false
  bundle_hash: string
  checkpoint_hash: string
}
type FederatedBundleVerification = {
  status: "FEDERATED_RECONCILIATION_OBSERVED" | "NULL"
  result: "FEDERATED_RECONCILIATION_OBSERVED" | "NULL"
  drift_class?: DriftClass
  runtime_classification: RemoteRuntimeClassification
  trust_semantics: "remote_evidence_can_narrow_acceptance_only"
  local_validation_required: true
  remote_authority_inherited: false
  remote_execution_legitimacy: false
  replay_state_consumed: false
  merkle_root?: string
  bundle_hash?: string
}

type InteroperabilityDriftClassification = "distributed_lineage_divergence" | "checkpoint_hash_instability" | "federated_projection_corruption" | "remote_authority_claim" | "interoperability_replay_attempt"
type InteroperabilityStatus = "INTEROPERABILITY_EVIDENCE_OBSERVED" | "INTEROPERABILITY_QUARANTINED" | "NULL"
type PortableLegitimacyProjection = {
  projection_type: "PortableLegitimacyProjection"
  canonical_hash: string
  lineage_root: string
  continuity_id: string
  reconciliation_id: string
  generated_at: string
  replay_indicators: string[]
  federation_classification: FederationClassification
  evidence_only: true
  remote_authority_denied: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
  exact_object_hash: string
  local_execution_authority: false
  remote_execution_legitimacy: false
}
type DistributedLegitimacyEnvelope = {
  envelope_type: "DistributedLegitimacyEnvelope"
  canonical_hash: string
  envelope_id: string
  lineage_root: string
  continuity_id: string
  reconciliation_id: string
  generated_at: string
  replay_indicators: string[]
  federation_classification: FederationClassification
  evidence_only: true
  remote_authority_denied: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
  projection: PortableLegitimacyProjection | null
}
type FederatedCheckpointEnvelope = {
  envelope_type: "FederatedCheckpointEnvelope"
  canonical_hash: string
  checkpoint_envelope_id: string
  lineage_root: string
  continuity_id: string
  reconciliation_id: string
  generated_at: string
  replay_indicators: string[]
  federation_classification: FederationClassification
  evidence_only: true
  remote_authority_denied: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
  checkpoint: ReconciliationCheckpoint
}


type FederatedObservabilityDriftClass = "checkpoint_divergence" | "federated_replay_collision" | "authority_conflict" | "lineage_instability" | "topology_divergence" | "projection_corruption" | "cross_runtime_hash_mismatch" | "compression_divergence" | "reconciliation_instability" | "federated_summary_mismatch" | "topology_compression_corruption" | "replay_summary_divergence" | "semantic_conformance_drift" | "checkpoint_semantic_mismatch" | "federation_policy_divergence" | "compression_semantic_instability" | "runtime_fingerprint_mismatch" | "quorum_divergence" | "maintainer_set_drift" | "governance_replay_attempt" | "approval_hash_mismatch" | "reviewed_commit_drift" | "mutation_scope_expansion" | "runtime_evolution_bypass" | "consensus_instability" | "non_deterministic_approval_order" | "federation_authority_inheritance_attempt" | "runtime_divergence" | "governance_divergence" | "replay_discontinuity" | "proof_topology_mismatch" | "validator_instability" | "schema_mismatch" | "sovereignty_corruption" | "hidden_execution_expansion" | "authority_inheritance_attempt"
type DistributedCheckpointComparison = {
  comparison_id: string
  local_checkpoint_hash: string
  remote_checkpoint_hashes: string[]
  matching_checkpoint_hashes: string[]
  divergent_checkpoint_hashes: string[]
  drift_summary: FederatedObservabilityDriftClass[]
  replay_indicators: string[]
  remote_authority_denied: true
  evidence_only: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
}
type FederatedConsensusResult = {
  consensus_id: string
  consensus_status: "CONSENSUS_OBSERVED" | "OBSERVABILITY_DRIFT_ONLY"
  accepted_authority: false
  drift_summary: FederatedObservabilityDriftClass[]
  replay_indicators: string[]
  remote_authority_denied: true
  evidence_only: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
}
type FederatedTopologyDrift = {
  topology_hash: string
  lineage_root: string
  continuity_root: string
  drift_summary: FederatedObservabilityDriftClass[]
  remote_authority_denied: true
  evidence_only: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
}
type FederatedReconciliationEnvelope = {
  reconciliation_id: string
  checkpoint_hash: string
  lineage_root: string
  continuity_root: string
  federation_classification: FederationClassification
  participating_runtimes: string[]
  drift_summary: FederatedObservabilityDriftClass[]
  replay_indicators: string[]
  topology_hash: string
  generated_at: string
  canonical_hash: string
  remote_authority_denied: true
  evidence_only: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
}



type FederationConformanceDriftClass = "semantic_conformance_drift" | "checkpoint_semantic_mismatch" | "federation_policy_divergence" | "compression_semantic_instability" | "runtime_fingerprint_mismatch" | "quorum_divergence" | "maintainer_set_drift" | "governance_replay_attempt" | "approval_hash_mismatch" | "reviewed_commit_drift" | "mutation_scope_expansion" | "runtime_evolution_bypass" | "consensus_instability" | "non_deterministic_approval_order" | "federation_authority_inheritance_attempt"
type RuntimeSemanticFingerprint = {
  fingerprint_type: "RuntimeSemanticFingerprint"
  runtime_id: string
  canonical_runtime_path_hash: string
  observability_route_hash: string
  registry_order_hash: string
  policy_hash: string
  drift_taxonomy_hash: string
  semantic_version: "federation_conformance_v1"
  fingerprint_hash: string
  evidence_only: true
  remote_authority_denied: true
  replay_neutral: true
  read_only: true
  mutation_capable: false
}
type FederationSemanticMismatch = {
  mismatch_id: string
  drift_class: FederationConformanceDriftClass
  field: string
  local_hash: string
  remote_hash: string
  remote_authority_denied: true
  evidence_only: true
  replay_neutral: true
  read_only: true
  mutation_capable: false
}
type ConformanceCheckpoint = {
  checkpoint_type: "ConformanceCheckpoint"
  checkpoint_id: string
  runtime_id: string
  reconciliation_id: string
  lineage_root: string
  runtime_fingerprint_hash: string
  semantic_policy_hash: string
  replay_neutrality_hash: string
  checkpoint_hash: string
  generated_at: string
  evidence_only: true
  remote_authority_denied: true
  replay_neutral: true
  read_only: true
  mutation_capable: false
}
type FederationConformanceResult = {
  result_type: "FederationConformanceResult"
  conformance_status: "CONFORMANT_EVIDENCE_OBSERVED" | "CONFORMANCE_QUARANTINED" | "NULL"
  local_runtime_id: string
  remote_runtime_id: string
  semantic_mismatches: FederationSemanticMismatch[]
  drift_classes: FederationConformanceDriftClass[]
  compatible: boolean
  remote_authority_inherited: false
  remote_execution_legitimacy: false
  local_validation_required: true
  replay_consumed: false
  evidence_only: true
  remote_authority_denied: true
  replay_neutral: true
  read_only: true
  mutation_capable: false
}
type FederationCompatibilityEnvelope = {
  envelope_type: "FederationCompatibilityEnvelope"
  envelope_id: string
  runtime_id: string
  remote_runtime_id: string
  runtime_semantic_fingerprint: RuntimeSemanticFingerprint
  conformance_checkpoint: ConformanceCheckpoint
  conformance_result: FederationConformanceResult
  compatibility_hash: string
  generated_at: string
  evidence_only: true
  remote_authority_denied: true
  replay_neutral: true
  read_only: true
  mutation_capable: false
}

type GovernanceCompressionDriftClass = "compression_divergence" | "reconciliation_instability" | "federated_summary_mismatch" | "topology_compression_corruption" | "replay_summary_divergence"
type DriftCompressionSummary = {
  summary_type: "DriftCompressionSummary"
  drift_classes: GovernanceCompressionDriftClass[]
  drift_counts: Record<string, number>
  compressed_count: number
  canonical_hash: string
  remote_authority_denied: true
  evidence_only: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
}
type ReplayCompressionSummary = {
  summary_type: "ReplayCompressionSummary"
  replay_indicators: string[]
  replay_counts: Record<string, number>
  compressed_count: number
  canonical_hash: string
  replay_consumed: false
  remote_authority_denied: true
  evidence_only: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
}
type TopologyCompressionSummary = {
  summary_type: "TopologyCompressionSummary"
  topology_root: string
  lineage_root: string
  participating_runtimes: string[]
  runtime_count: number
  topology_hashes: string[]
  canonical_hash: string
  remote_authority_denied: true
  evidence_only: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
}
type FederatedGovernanceSummary = {
  summary_type: "FederatedGovernanceSummary"
  compression_id: string
  reconciliation_root: string
  checkpoint_set_hash: string
  topology_root: string
  lineage_root: string
  federation_classification: FederationClassification
  compressed_drift_summary: DriftCompressionSummary
  compressed_replay_summary: ReplayCompressionSummary
  compressed_topology_summary: TopologyCompressionSummary
  participating_runtimes: string[]
  canonical_hash: string
  generated_at: string
  remote_authority_denied: true
  evidence_only: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
}
type GovernanceCompressionEnvelope = {
  envelope_type: "GovernanceCompressionEnvelope"
  compression_id: string
  reconciliation_root: string
  checkpoint_set_hash: string
  topology_root: string
  lineage_root: string
  federation_classification: FederationClassification
  compressed_drift_summary: DriftCompressionSummary
  compressed_replay_summary: ReplayCompressionSummary
  compressed_topology_summary: TopologyCompressionSummary
  participating_runtimes: string[]
  canonical_hash: string
  generated_at: string
  summary: FederatedGovernanceSummary
  remote_authority_denied: true
  evidence_only: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
}

type FederatedLineageEnvelope = {
  envelope_type: "FederatedLineageEnvelope"
  canonical_hash: string
  lineage_root: string
  continuity_id: string
  reconciliation_id: string
  generated_at: string
  replay_indicators: string[]
  federation_classification: FederationClassification
  evidence_only: true
  remote_authority_denied: true
  read_only: true
  mutation_capable: false
  replay_neutral: true
  lineage_summary: Record<string, unknown>
}

const RECONCILIATION_MERKLE_LAYERS: readonly ReconciliationMerkleNode["layer"][] = ["session", "continuity", "authority", "AEO", "validation", "execution", "proof", "attestation", "PREO"] as const

function classifyRemoteRuntime(runtime_id: string, local_runtime_id = LOCAL_FEDERATION_RUNTIME_ID): RemoteRuntimeClassification {
  const id = String(runtime_id || "")
  if (!id) return "UNTRUSTED_RUNTIME"
  if (id === local_runtime_id) return "LOCAL_RUNTIME"
  if (id.startsWith("spiffe://") || id.startsWith("mindshift-federated://")) return "FEDERATED_RUNTIME"
  if (id.startsWith("https://") || id.startsWith("urn:")) return "EXTERNAL_REFERENCE"
  return "PORTABLE_EVIDENCE_ONLY"
}

function canonicalPortableLegitimacyBundle(input: any): PortableLegitimacyBundle | null {
  const bundle = {
    runtime_id: String(input?.runtime_id || ""),
    reconciliation_id: String(input?.reconciliation_id || ""),
    decision_id: String(input?.decision_id || ""),
    validated_object_hash: String(input?.validated_object_hash || ""),
    proof_id: String(input?.proof_id || ""),
    execution_id: String(input?.execution_id || ""),
    invocation_nonce: String(input?.invocation_nonce || ""),
    continuity_id: String(input?.continuity_id || ""),
    authority_lineage_hash: String(input?.authority_lineage_hash || ""),
    proof_lineage_hash: String(input?.proof_lineage_hash || ""),
    replay_lineage_hash: String(input?.replay_lineage_hash || ""),
    preo_lineage_hash: String(input?.preo_lineage_hash || ""),
    attestation_hash: String(input?.attestation_hash || ""),
    reconciliation_merkle_root: String(input?.reconciliation_merkle_root || ""),
    federation_boundary: String(input?.federation_boundary || ""),
    emitted_at: String(input?.emitted_at || "")
  }
  if (Object.values(bundle).some((value) => !value)) return null
  if (bundle.federation_boundary !== "portable_evidence_not_portable_authority") return null
  return Object.freeze(bundle)
}

async function reconciliationMerkleEvidence(result: ReconciliationResult): Promise<{ root: string, nodes: ReconciliationMerkleNode[] }> {
  const nodes: ReconciliationMerkleNode[] = []
  let parent_hash = await sha256Hex(canonicalize({ genesis: "federated_reconciliation", lineage_anchor: result.lineage_anchor }))
  for (let index = 0; index < RECONCILIATION_MERKLE_LAYERS.length; index++) {
    const layer = RECONCILIATION_MERKLE_LAYERS[index]
    const trace = result.deterministic_traversal_trace[index]
    const object_hash = await sha256Hex(canonicalize({ layer, trace: trace || null }))
    const node_hash = await sha256Hex(canonicalize({ layer, object_hash, parent_hash, position: index }))
    nodes.push({ position: index, layer, registry: String(trace?.registry || ""), object_hash, parent_hash, node_hash })
    parent_hash = node_hash
  }
  return { root: parent_hash, nodes }
}

async function deterministicReconciliationSnapshot(result: ReconciliationResult): Promise<Record<string, unknown>> {
  const merkle = await reconciliationMerkleEvidence(result)
  return canonicalRecord({
    authority_boundary: "portable_evidence_not_portable_authority",
    canonical_runtime_path: CANONICAL_RUNTIME_ROUTES,
    drift_classifications: result.drift_classifications.map((drift) => drift.drift_class).sort(),
    local_validation_required: true,
    merkle_nodes: merkle.nodes,
    reconciliation_merkle_root: merkle.root,
    replay_neutral: true,
    status: result.result,
    traversal_trace: result.deterministic_traversal_trace
  })
}

async function deterministicReconciliationCheckpoint(result: ReconciliationResult, created_at: string, runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<ReconciliationCheckpoint> {
  const snapshot = await deterministicReconciliationSnapshot(result)
  const replay_snapshot_hash = await sha256Hex(canonicalize({ replay_neutral: true, trace: result.deterministic_traversal_trace.filter((entry) => entry.registry === "invocation_registry") }))
  const drift_snapshot_hash = await sha256Hex(canonicalize(result.drift_classifications.map((drift) => drift.drift_class).sort()))
  const revocation_snapshot_hash = await sha256Hex(canonicalize({ replay_neutral: true, revocation_classes: result.drift_classifications.filter((drift) => String(drift.drift_class).includes("revocation") || String(drift.drift_class).includes("expiration")).map((drift) => drift.drift_class).sort() }))
  const deterministic_hash = await sha256Hex(canonicalize({ runtime_id, snapshot, replay_snapshot_hash, drift_snapshot_hash, revocation_snapshot_hash }))
  const reconciliation_merkle_root = String(snapshot.reconciliation_merkle_root || "")
  const traversal_position = result.deterministic_traversal_trace.length
  const lineage_count = result.deterministic_traversal_trace.length
  // Checkpoint identity is deterministic reconciliation state only: same lineage state yields the same checkpoint_id.
  // created_at is observational metadata and MUST NEVER participate in checkpoint identity hashing.
  const checkpoint_identity = { runtime_id, reconciliation_merkle_root, deterministic_hash, traversal_position, lineage_count, replay_snapshot_hash, drift_snapshot_hash }
  return {
    checkpoint_id: await sha256Hex(canonicalize(checkpoint_identity)),
    runtime_id,
    reconciliation_merkle_root,
    traversal_position,
    deterministic_hash,
    lineage_count,
    replay_snapshot_hash,
    drift_snapshot_hash,
    revocation_snapshot_hash,
    created_at
  }
}

function deterministicInteroperabilityGeneratedAt(result: ReconciliationResult): string {
  // Interoperability checkpoint material is replay-neutral and timestamp-independent.
  return `DETERMINISTIC_INTEROPERABILITY_CHECKPOINT:${result.lineage_anchor}`
}

function federationClassificationForInteroperability(result: ReconciliationResult, federation_origin = LOCAL_FEDERATION_RUNTIME_ID): FederationClassification {
  const driftClasses = result.drift_classifications.map((drift) => drift.drift_class)
  const verification_status: FederationVerificationStatus = driftClasses.includes("interoperability_replay_attempt") || driftClasses.includes("replay_resurrection_attempt") || driftClasses.includes("federated_replay_drift")
    ? "REPLAY_DETECTED"
    : driftClasses.includes("distributed_lineage_divergence") || driftClasses.includes("federated_lineage_divergence") || driftClasses.includes("checkpoint_hash_instability")
      ? "LINEAGE_MISMATCH"
      : driftClasses.includes("federated_projection_corruption") || driftClasses.includes("remote_authority_claim")
        ? "CORRUPTED"
        : result.result === "VALID_RECONCILIATION"
          ? "VERIFIED"
          : "NULL_STATE"
  return canonicalFederatedTrustEnvelope({ federation_origin, verification_status, continuity_reference: resolveCanonicalPortableIdentifiers(result)?.continuity_id || "", lineage_root: result.lineage_anchor, observed_at: deterministicInteroperabilityGeneratedAt(result) })
}

function replayIndicatorsForInteroperability(result: ReconciliationResult): string[] {
  const indicators = new Set<string>()
  for (const drift of result.drift_classifications) {
    if (String(drift.drift_class).includes("replay")) indicators.add(String(drift.drift_class))
  }
  for (const entry of result.deterministic_traversal_trace) {
    if (entry.registry === "invocation_registry" && entry.row_count !== 1) indicators.add("replay_neutral_invocation_unresolved")
  }
  return Array.from(indicators).sort()
}

function interoperabilityDriftIndicators(result: ReconciliationResult, projection: PortableLegitimacyProjection | null): InteroperabilityDriftClassification[] {
  const indicators = new Set<InteroperabilityDriftClassification>()
  for (const drift of result.drift_classifications) {
    if (drift.drift_class === "federated_lineage_divergence" || drift.drift_class === "foreign_ancestry_mismatch_drift" || drift.drift_class === "recursive_ancestry_drift") indicators.add("distributed_lineage_divergence")
    if (drift.drift_class === "replay_resurrection_attempt" || drift.drift_class === "federated_replay_drift" || drift.drift_class === "federated_replay_discontinuity_drift") indicators.add("interoperability_replay_attempt")
    if (drift.drift_class === "federated_bundle_drift" || drift.drift_class === "reconciliation_payload_corruption_drift") indicators.add("federated_projection_corruption")
    if (drift.drift_class === "federated_checkpoint_drift") indicators.add("checkpoint_hash_instability")
  }
  if (!projection) indicators.add("federated_projection_corruption")
  return Array.from(indicators).sort()
}

async function deriveDistributedLegitimacyProjection(result: ReconciliationResult, generated_at = deterministicInteroperabilityGeneratedAt(result), runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<PortableLegitimacyProjection | null> {
  if (result.result !== "VALID_RECONCILIATION") return null
  const bundle = await portableLegitimacyBundleFromResult(result, generated_at, runtime_id)
  if (!bundle) return null
  if (bundle.federation_boundary !== "portable_evidence_not_portable_authority") return null
  const classification = federationClassificationForInteroperability(result, runtime_id)
  if (classification.remote_authority_denied !== true || classification.evidence_only !== true) return null
  const core = canonicalRecord({
    exact_object_hash: await sha256Hex(canonicalize(bundle)),
    federation_classification: classification,
    generated_at,
    lineage_root: bundle.reconciliation_merkle_root,
    local_execution_authority: false,
    remote_execution_legitimacy: false,
    reconciliation_id: bundle.reconciliation_id,
    replay_indicators: replayIndicatorsForInteroperability(result),
    continuity_id: bundle.continuity_id
  })
  const canonical_hash = await sha256Hex(canonicalize({ projection_type: "PortableLegitimacyProjection", ...core, evidence_only: true, mutation_capable: false, read_only: true, remote_authority_denied: true, replay_neutral: true }))
  return Object.freeze({ projection_type: "PortableLegitimacyProjection", canonical_hash, ...core, evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true } as PortableLegitimacyProjection)
}

async function buildDistributedLegitimacyEnvelope(result: ReconciliationResult, projection: PortableLegitimacyProjection | null, generated_at = deterministicInteroperabilityGeneratedAt(result), runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<DistributedLegitimacyEnvelope> {
  const classification = projection?.federation_classification || federationClassificationForInteroperability(result, runtime_id)
  const continuity_id = projection?.continuity_id || resolveCanonicalPortableIdentifiers(result)?.continuity_id || ""
  const lineage_root = projection?.lineage_root || result.lineage_anchor
  const reconciliation_id = projection?.reconciliation_id || await deterministicReconciliationId("distributed_legitimacy_quarantine", { lineage_root: result.lineage_anchor })
  const replay_indicators = replayIndicatorsForInteroperability(result)
  const core = { envelope_type: "DistributedLegitimacyEnvelope", lineage_root, continuity_id, reconciliation_id, generated_at, replay_indicators, federation_classification: classification, evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true, projection }
  const canonical_hash = await sha256Hex(canonicalize(core))
  return Object.freeze({ ...core, canonical_hash, envelope_id: await sha256Hex(canonicalize({ envelope_type: "DistributedLegitimacyEnvelope", canonical_hash })) } as DistributedLegitimacyEnvelope)
}

async function buildFederatedCheckpoint(result: ReconciliationResult, generated_at = deterministicInteroperabilityGeneratedAt(result), runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<FederatedCheckpointEnvelope> {
  const checkpoint = await deterministicReconciliationCheckpoint(result, generated_at, runtime_id)
  const projection = await deriveDistributedLegitimacyProjection(result, generated_at, runtime_id)
  const classification = projection?.federation_classification || federationClassificationForInteroperability(result, runtime_id)
  const continuity_id = projection?.continuity_id || resolveCanonicalPortableIdentifiers(result)?.continuity_id || ""
  const lineage_root = projection?.lineage_root || checkpoint.reconciliation_merkle_root || result.lineage_anchor
  const reconciliation_id = projection?.reconciliation_id || await deterministicReconciliationId("federated_checkpoint_quarantine", { checkpoint_id: checkpoint.checkpoint_id, lineage_root })
  const replay_indicators = replayIndicatorsForInteroperability(result)
  const core = { envelope_type: "FederatedCheckpointEnvelope", lineage_root, continuity_id, reconciliation_id, generated_at, replay_indicators, federation_classification: classification, evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true, checkpoint }
  const canonical_hash = await sha256Hex(canonicalize(core))
  return Object.freeze({ ...core, canonical_hash, checkpoint_envelope_id: await sha256Hex(canonicalize({ envelope_type: "FederatedCheckpointEnvelope", canonical_hash })) } as FederatedCheckpointEnvelope)
}

async function buildFederatedLineageEnvelope(result: ReconciliationResult, generated_at = deterministicInteroperabilityGeneratedAt(result), runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<FederatedLineageEnvelope> {
  const classification = federationClassificationForInteroperability(result, runtime_id)
  const canonical = resolveCanonicalPortableIdentifiers(result)
  const lineage_summary = canonicalRecord({ canonical_identifiers: canonical || null, traversal_trace: result.deterministic_traversal_trace, drift_classifications: result.drift_classifications.map((drift) => drift.drift_class).sort(), authority_boundary: "portable_evidence_not_portable_authority", remote_execution_legitimacy: false })
  const core = { envelope_type: "FederatedLineageEnvelope", lineage_root: await sha256Hex(canonicalize(lineage_summary)), continuity_id: canonical?.continuity_id || "", reconciliation_id: await deterministicReconciliationId("federated_lineage", lineage_summary), generated_at, replay_indicators: replayIndicatorsForInteroperability(result), federation_classification: classification, evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true, lineage_summary }
  const canonical_hash = await sha256Hex(canonicalize(core))
  return Object.freeze({ ...core, canonical_hash } as FederatedLineageEnvelope)
}

function verifyDistributedLineageCompatibility(local: DistributedLegitimacyEnvelope | FederatedCheckpointEnvelope | FederatedLineageEnvelope | null, remote: any): { compatible: boolean, drift_class?: InteroperabilityDriftClassification, quarantined: boolean, remote_authority_denied: true, evidence_only: true } {
  const denied = { remote_authority_denied: true as const, evidence_only: true as const }
  if (!local || !isPlainRecord(remote)) return { compatible: false, drift_class: "federated_projection_corruption", quarantined: true, ...denied }
  if ((remote as any).evidence_only !== true || (remote as any).remote_authority_denied !== true || (remote as any).mutation_capable === true || (remote as any).remote_execution_legitimacy === true || (remote as any).remote_authority_inherited === true) return { compatible: false, drift_class: "remote_authority_claim", quarantined: true, ...denied }
  if (Array.isArray((remote as any).replay_indicators) && (remote as any).replay_indicators.length > 0) return { compatible: false, drift_class: "interoperability_replay_attempt", quarantined: true, ...denied }
  if (String((remote as any).lineage_root || "") !== String(local.lineage_root || "")) return { compatible: false, drift_class: "distributed_lineage_divergence", quarantined: true, ...denied }
  return { compatible: true, quarantined: false, ...denied }
}


async function deriveRuntimeSemanticFingerprint(result: ReconciliationResult, runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<RuntimeSemanticFingerprint> {
  const policy = canonicalRecord({
    canonical_invariant: "remote_legitimacy_evidence_never_becomes_local_execution_authority",
    canonical_runtime_routes: CANONICAL_RUNTIME_ROUTES,
    evidence_only: true,
    local_validation_required: true,
    mutation_capable: false,
    read_only: true,
    remote_authority_denied: true,
    replay_neutral: true,
    replay_consumed: false
  })
  const driftTaxonomy: FederationConformanceDriftClass[] = ["semantic_conformance_drift", "checkpoint_semantic_mismatch", "federation_policy_divergence", "compression_semantic_instability", "runtime_fingerprint_mismatch"]
  const core = {
    fingerprint_type: "RuntimeSemanticFingerprint",
    runtime_id,
    canonical_runtime_path_hash: await sha256Hex(canonicalize(CANONICAL_RUNTIME_ROUTES)),
    observability_route_hash: await sha256Hex(canonicalize(NON_EXECUTABLE_OBSERVABILITY_ROUTES)),
    registry_order_hash: await sha256Hex(canonicalize(result.canonical_registry_ordering)),
    policy_hash: await sha256Hex(canonicalize(policy)),
    drift_taxonomy_hash: await sha256Hex(canonicalize(driftTaxonomy)),
    semantic_version: "federation_conformance_v1" as const,
    evidence_only: true as const,
    remote_authority_denied: true as const,
    replay_neutral: true as const,
    read_only: true as const,
    mutation_capable: false as const
  }
  return Object.freeze({ ...core, fingerprint_hash: await sha256Hex(canonicalize(core)) } as RuntimeSemanticFingerprint)
}

async function federationSemanticMismatch(drift_class: FederationConformanceDriftClass, field: string, localValue: unknown, remoteValue: unknown): Promise<FederationSemanticMismatch> {
  const local_hash = await sha256Hex(canonicalize(localValue))
  const remote_hash = await sha256Hex(canonicalize(remoteValue))
  const core = { drift_class, field, local_hash, remote_hash }
  return Object.freeze({ mismatch_id: await sha256Hex(canonicalize(core)), ...core, remote_authority_denied: true, evidence_only: true, replay_neutral: true, read_only: true, mutation_capable: false } as FederationSemanticMismatch)
}

async function compareFederationSemantics(local: RuntimeSemanticFingerprint, remote: any): Promise<FederationSemanticMismatch[]> {
  const mismatches: FederationSemanticMismatch[] = []
  if (!isPlainRecord(remote)) return [await federationSemanticMismatch("semantic_conformance_drift", "remote_envelope", local.fingerprint_hash, null)]
  const remoteFingerprint = isPlainRecord(remote.runtime_semantic_fingerprint) ? remote.runtime_semantic_fingerprint : remote
  if ((remote as any).evidence_only !== true || (remote as any).remote_authority_denied !== true || (remote as any).read_only !== true || (remote as any).mutation_capable !== false || (remote as any).replay_neutral !== true) mismatches.push(await federationSemanticMismatch("federation_policy_divergence", "required_conformance_flags", true, canonicalRecord(remote)))
  if ((remote as any).remote_authority_inherited === true || (remote as any).remote_execution_legitimacy === true || (remote as any).local_execution_authority === true || (remote as any).accepted_authority === true) mismatches.push(await federationSemanticMismatch("federation_policy_divergence", "remote_authority_claim", false, true))
  if ((remote as any).replay_consumed === true || (remote as any).replay_state_consumed === true) mismatches.push(await federationSemanticMismatch("semantic_conformance_drift", "replay_neutrality", false, true))
  if (isPlainRecord(remoteFingerprint)) {
    for (const field of ["canonical_runtime_path_hash", "registry_order_hash", "policy_hash", "drift_taxonomy_hash", "semantic_version"] as const) {
      if (String((remoteFingerprint as any)[field] || "") !== String((local as any)[field] || "")) mismatches.push(await federationSemanticMismatch(field === "policy_hash" ? "federation_policy_divergence" : "runtime_fingerprint_mismatch", field, (local as any)[field] || "", (remoteFingerprint as any)[field] || ""))
    }
  } else {
    mismatches.push(await federationSemanticMismatch("runtime_fingerprint_mismatch", "runtime_semantic_fingerprint", local.fingerprint_hash, null))
  }
  if (isPlainRecord(remote.conformance_checkpoint)) {
    const remoteCheckpoint = remote.conformance_checkpoint
    if (String(remoteCheckpoint.runtime_fingerprint_hash || "") && String(remoteCheckpoint.runtime_fingerprint_hash || "") !== String((remoteFingerprint as any).fingerprint_hash || "")) mismatches.push(await federationSemanticMismatch("checkpoint_semantic_mismatch", "checkpoint_runtime_fingerprint_hash", (remoteFingerprint as any).fingerprint_hash || "", remoteCheckpoint.runtime_fingerprint_hash || ""))
    if ((remoteCheckpoint as any).replay_neutral !== true || (remoteCheckpoint as any).mutation_capable !== false) mismatches.push(await federationSemanticMismatch("checkpoint_semantic_mismatch", "checkpoint_required_flags", true, canonicalRecord(remoteCheckpoint)))
  }
  if (isPlainRecord(remote.governance_compression_envelope) && ((remote.governance_compression_envelope as any).replay_neutral !== true || (remote.governance_compression_envelope as any).mutation_capable !== false)) mismatches.push(await federationSemanticMismatch("compression_semantic_instability", "governance_compression_envelope", true, remote.governance_compression_envelope))
  return mismatches.sort((a, b) => a.mismatch_id.localeCompare(b.mismatch_id))
}

async function deriveConformanceCheckpoint(result: ReconciliationResult, fingerprint: RuntimeSemanticFingerprint, generated_at = deterministicInteroperabilityGeneratedAt(result), runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<ConformanceCheckpoint> {
  const canonical = resolveCanonicalPortableIdentifiers(result)
  const replay_neutrality_hash = await sha256Hex(canonicalize({ replay_neutral: true, replay_indicators: replayIndicatorsForInteroperability(result), invocation_trace: result.deterministic_traversal_trace.filter((entry) => entry.registry === "invocation_registry") }))
  const core = { checkpoint_type: "ConformanceCheckpoint", runtime_id, reconciliation_id: canonical?.decision_id || await deterministicReconciliationId("federation_conformance", { lineage_anchor: result.lineage_anchor }), lineage_root: result.lineage_anchor, runtime_fingerprint_hash: fingerprint.fingerprint_hash, semantic_policy_hash: fingerprint.policy_hash, replay_neutrality_hash, generated_at, evidence_only: true, remote_authority_denied: true, replay_neutral: true, read_only: true, mutation_capable: false }
  const checkpoint_hash = await sha256Hex(canonicalize(core))
  return Object.freeze({ ...core, checkpoint_hash, checkpoint_id: await sha256Hex(canonicalize({ checkpoint_type: "ConformanceCheckpoint", checkpoint_hash })) } as ConformanceCheckpoint)
}

function detectSemanticConformanceDrift(mismatches: FederationSemanticMismatch[], result: ReconciliationResult): FederationConformanceDriftClass[] {
  const drift = new Set<FederationConformanceDriftClass>(mismatches.map((mismatch) => mismatch.drift_class))
  for (const item of result.drift_classifications) {
    if (item.drift_class === "compression_divergence" || item.drift_class === "replay_summary_divergence" || item.drift_class === "topology_compression_corruption") drift.add("compression_semantic_instability")
    if (item.drift_class === "checkpoint_hash_instability" || item.drift_class === "checkpoint_divergence") drift.add("checkpoint_semantic_mismatch")
    if (item.drift_class === "cross_runtime_hash_mismatch" || item.drift_class === "federated_runtime_divergence_drift") drift.add("runtime_fingerprint_mismatch")
    if (item.drift_class === "remote_authority_claim" || item.drift_class === "authority_conflict") drift.add("federation_policy_divergence")
  }
  return Array.from(drift).sort()
}

async function buildFederationCompatibilityEnvelope(result: ReconciliationResult, remote: any = null, generated_at = deterministicInteroperabilityGeneratedAt(result), runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<FederationCompatibilityEnvelope> {
  const fingerprint = await deriveRuntimeSemanticFingerprint(result, runtime_id)
  const checkpoint = await deriveConformanceCheckpoint(result, fingerprint, generated_at, runtime_id)
  const semantic_mismatches = await compareFederationSemantics(fingerprint, remote || { ...fingerprint, evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true })
  const drift_classes = detectSemanticConformanceDrift(semantic_mismatches, result)
  const remote_runtime_id = String(remote?.runtime_id || remote?.remote_runtime_id || remote?.runtime_semantic_fingerprint?.runtime_id || runtime_id)
  const conformance_result: FederationConformanceResult = Object.freeze({ result_type: "FederationConformanceResult", conformance_status: drift_classes.length > 0 ? "CONFORMANCE_QUARANTINED" : "CONFORMANT_EVIDENCE_OBSERVED", local_runtime_id: runtime_id, remote_runtime_id, semantic_mismatches, drift_classes, compatible: drift_classes.length === 0, remote_authority_inherited: false, remote_execution_legitimacy: false, local_validation_required: true, replay_consumed: false, evidence_only: true, remote_authority_denied: true, replay_neutral: true, read_only: true, mutation_capable: false })
  const core = { envelope_type: "FederationCompatibilityEnvelope", runtime_id, remote_runtime_id, runtime_semantic_fingerprint: fingerprint, conformance_checkpoint: checkpoint, conformance_result, generated_at, evidence_only: true, remote_authority_denied: true, replay_neutral: true, read_only: true, mutation_capable: false }
  const compatibility_hash = await sha256Hex(canonicalize(core))
  return Object.freeze({ ...core, compatibility_hash, envelope_id: await sha256Hex(canonicalize({ envelope_type: "FederationCompatibilityEnvelope", compatibility_hash })) } as FederationCompatibilityEnvelope)
}


type FederatedSovereigntyDriftClass = "runtime_divergence" | "governance_divergence" | "replay_discontinuity" | "proof_topology_mismatch" | "validator_instability" | "schema_mismatch" | "sovereignty_corruption" | "hidden_execution_expansion" | "authority_inheritance_attempt"
type FederatedSovereigntyEnvelope = {
  envelope_type: "FederatedSovereigntyEnvelope"
  runtime_id: string
  sovereignty_hash: string
  runtime_surface_hash: string
  governance_surface_hash: string
  replay_surface_hash: string
  validator_surface_hash: string
  schema_hash: string
  migration_chain_hash: string
  checkpoint_hash: string
  federation_tier: "bounded_evidence"
  replay_neutral: true
  evidence_only: true
  remote_authority_denied: true
  generated_at: string
}
type SovereigntyEquivalenceVerification = {
  verification_status: "SOVEREIGNTY_EQUIVALENT" | "SOVEREIGNTY_DIVERGENT" | "NULL"
  local_runtime_id: string
  remote_runtime_id: string
  equivalence_hash: string
  drift_summary: FederatedSovereigntyDriftClass[]
  replay_indicators: string[]
  evidence_only: true
  remote_authority_denied: true
  replay_neutral: true
  read_only: true
  mutation_capable: false
  remote_authority_inherited: false
  remote_execution_legitimacy: false
  local_governance_mutated: false
}

function sovereigntySchemaSurface(): Record<string, unknown> {
  return Object.freeze(Object.keys(REQUIRED_SCHEMA_COLUMNS).sort().reduce<Record<string, unknown>>((schema, table) => {
    schema[table] = [...REQUIRED_SCHEMA_COLUMNS[table]].sort()
    return schema
  }, {}))
}

async function deriveFederatedSovereigntySurfaces(result: ReconciliationResult, runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<Record<string, string>> {
  const proofTopology = canonicalRecord({ registries: CANONICAL_RECONCILIATION_REGISTRY_ORDER, proof_columns: REQUIRED_SCHEMA_COLUMNS.proof_registry, attestation_columns: REQUIRED_SCHEMA_COLUMNS.attestation_registry, exact_object_required: true })
  const governanceSurface = canonicalRecord({ recursive_governance_route: RECURSIVE_GOVERNANCE_ROUTE, recursive_governance_admission_route: RECURSIVE_GOVERNANCE_ADMISSION_ROUTE, preo_routes: GOVERNANCE_EVIDENCE_ROUTES, evidence_only_routes: NON_EXECUTABLE_OBSERVABILITY_ROUTES, remote_authority_denied: true })
  const replaySurface = canonicalRecord({ replay_neutral: true, invocation_registry: REQUIRED_SCHEMA_COLUMNS.invocation_registry, replay_indicators: replayIndicatorsForInteroperability(result), replay_consumed: false })
  const validatorSurface = canonicalRecord({ required_aeo_keys: REQUIRED_AEO_KEYS, drift_taxonomy: ["runtime_divergence", "governance_divergence", "replay_discontinuity", "proof_topology_mismatch", "validator_instability", "schema_mismatch", "sovereignty_corruption", "hidden_execution_expansion", "authority_inheritance_attempt"], validation_results: ["VALID", "NULL"], exact_object_discipline: true })
  const runtimeSurface = canonicalRecord({ canonical_runtime_routes: CANONICAL_RUNTIME_ROUTES, non_executable_observability_routes: NON_EXECUTABLE_OBSERVABILITY_ROUTES, governed_workflow: GOVERNED_WORKFLOW, remote_execution_allowed: false })
  return Object.freeze({
    runtime_surface_hash: await sha256Hex(canonicalize(runtimeSurface)),
    governance_surface_hash: await sha256Hex(canonicalize(governanceSurface)),
    replay_surface_hash: await sha256Hex(canonicalize(replaySurface)),
    validator_surface_hash: await sha256Hex(canonicalize(validatorSurface)),
    schema_hash: await sha256Hex(canonicalize(sovereigntySchemaSurface())),
    migration_chain_hash: await sha256Hex(canonicalize({ schema: sovereigntySchemaSurface(), proof_topology: proofTopology, append_only_registries: [FEDERATED_SOVEREIGNTY_REGISTRY, FEDERATION_CONFORMANCE_REGISTRY, FEDERATED_CHECKPOINT_REGISTRY, DISTRIBUTED_LEGITIMACY_REGISTRY] }))
  })
}

async function buildFederatedSovereigntyEnvelope(result: ReconciliationResult, generated_at = deterministicInteroperabilityGeneratedAt(result), runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<FederatedSovereigntyEnvelope> {
  const surfaces = await deriveFederatedSovereigntySurfaces(result, runtime_id)
  const checkpoint = await deterministicReconciliationCheckpoint(result, generated_at, runtime_id)
  const identity = { envelope_type: "FederatedSovereigntyEnvelope", runtime_id, ...surfaces, checkpoint_hash: checkpoint.checkpoint_id, federation_tier: "bounded_evidence", replay_neutral: true, evidence_only: true, remote_authority_denied: true }
  const sovereignty_hash = await sha256Hex(canonicalize(identity))
  return Object.freeze({ ...identity, sovereignty_hash, generated_at } as FederatedSovereigntyEnvelope)
}

async function sovereigntyEquivalenceHash(envelope: FederatedSovereigntyEnvelope): Promise<string> {
  return sha256Hex(canonicalize({ runtime_surface_hash: envelope.runtime_surface_hash, governance_surface_hash: envelope.governance_surface_hash, replay_surface_hash: envelope.replay_surface_hash, validator_surface_hash: envelope.validator_surface_hash, schema_hash: envelope.schema_hash, migration_chain_hash: envelope.migration_chain_hash, checkpoint_hash: envelope.checkpoint_hash, federation_tier: envelope.federation_tier, replay_neutral: envelope.replay_neutral, evidence_only: envelope.evidence_only, remote_authority_denied: envelope.remote_authority_denied }))
}

async function recomputeSovereigntyHash(envelope: any): Promise<string> {
  return sha256Hex(canonicalize({ envelope_type: "FederatedSovereigntyEnvelope", runtime_id: String(envelope.runtime_id || ""), runtime_surface_hash: String(envelope.runtime_surface_hash || ""), governance_surface_hash: String(envelope.governance_surface_hash || ""), replay_surface_hash: String(envelope.replay_surface_hash || ""), validator_surface_hash: String(envelope.validator_surface_hash || ""), schema_hash: String(envelope.schema_hash || ""), migration_chain_hash: String(envelope.migration_chain_hash || ""), checkpoint_hash: String(envelope.checkpoint_hash || ""), federation_tier: String(envelope.federation_tier || ""), replay_neutral: envelope.replay_neutral === true, evidence_only: envelope.evidence_only === true, remote_authority_denied: envelope.remote_authority_denied === true }))
}

async function verifyFederatedSovereigntyEquivalence(local: FederatedSovereigntyEnvelope, remote: any): Promise<SovereigntyEquivalenceVerification> {
  const drift = new Set<FederatedSovereigntyDriftClass>()
  const replay = new Set<string>()
  if (!isPlainRecord(remote)) remote = local
  const remote_runtime_id = String(remote.runtime_id || "UNKNOWN_REMOTE_RUNTIME")
  if (remote.evidence_only !== true || remote.remote_authority_denied !== true || remote.replay_neutral !== true || remote.remote_authority_inherited === true || remote.remote_execution_legitimacy === true || remote.accepted_authority === true || remote.local_execution_authority === true || remote.mutation_capable === true) drift.add("authority_inheritance_attempt")
  if (String(remote.sovereignty_hash || "") !== await recomputeSovereigntyHash(remote)) drift.add("sovereignty_corruption")
  if (String(remote.runtime_surface_hash || "") !== local.runtime_surface_hash) drift.add("runtime_divergence")
  if (String(remote.governance_surface_hash || "") !== local.governance_surface_hash) drift.add("governance_divergence")
  if (String(remote.replay_surface_hash || "") !== local.replay_surface_hash || Array.isArray(remote.replay_indicators) && remote.replay_indicators.length > 0) { drift.add("replay_discontinuity"); for (const item of Array.isArray(remote.replay_indicators) ? remote.replay_indicators : []) replay.add(String(item)) }
  if (String(remote.validator_surface_hash || "") !== local.validator_surface_hash) drift.add("validator_instability")
  if (String(remote.schema_hash || "") !== local.schema_hash) drift.add("schema_mismatch")
  if (String(remote.migration_chain_hash || "") !== local.migration_chain_hash || String(remote.checkpoint_hash || "") !== local.checkpoint_hash) drift.add("proof_topology_mismatch")
  const remoteRoutes = Array.isArray(remote.executable_routes) ? remote.executable_routes.map(String) : Array.isArray(remote.runtime_routes) ? remote.runtime_routes.map(String) : []
  if (remoteRoutes.some((route: string) => !CANONICAL_RUNTIME_ROUTES.includes(route as any))) drift.add("hidden_execution_expansion")
  const equivalence_hash = drift.size === 0 ? await sovereigntyEquivalenceHash(local) : await sha256Hex(canonicalize({ local: await sovereigntyEquivalenceHash(local), remote: isPlainRecord(remote) ? await sovereigntyEquivalenceHash(remote as FederatedSovereigntyEnvelope) : "NULL", drift: Array.from(drift).sort() }))
  return Object.freeze({ verification_status: drift.size === 0 ? "SOVEREIGNTY_EQUIVALENT" : "SOVEREIGNTY_DIVERGENT", local_runtime_id: local.runtime_id, remote_runtime_id, equivalence_hash, drift_summary: Array.from(drift).sort(), replay_indicators: Array.from(replay).sort(), evidence_only: true, remote_authority_denied: true, replay_neutral: true, read_only: true, mutation_capable: false, remote_authority_inherited: false, remote_execution_legitimacy: false, local_governance_mutated: false } as SovereigntyEquivalenceVerification)
}

async function detectFederatedCheckpointDrift(envelope: FederatedCheckpointEnvelope, remote?: any): Promise<InteroperabilityDriftClassification[]> {
  const drift = new Set<InteroperabilityDriftClassification>()
  const recomputed = await buildFederatedCheckpoint({ status: "NULL", result: "NULL", lineage_anchor: envelope.checkpoint.reconciliation_merkle_root, canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER, recursion_depth: 0, deterministic_traversal_trace: [], drift_classifications: [] }, envelope.generated_at, envelope.checkpoint.runtime_id)
  if (!/^[a-f0-9]{64}$/.test(envelope.canonical_hash) || !/^[a-f0-9]{64}$/.test(envelope.checkpoint.checkpoint_id)) drift.add("checkpoint_hash_instability")
  if (remote) {
    const compatibility = verifyDistributedLineageCompatibility(envelope, remote)
    if (!compatibility.compatible && compatibility.drift_class) drift.add(compatibility.drift_class)
  }
  if (recomputed.evidence_only !== true || recomputed.remote_authority_denied !== true) drift.add("remote_authority_claim")
  return Array.from(drift).sort()
}

function remoteCheckpointHash(remote: any): string {
  if (!isPlainRecord(remote)) return ""
  return String((remote as any).checkpoint_hash || (remote as any).canonical_hash || (remote as any).checkpoint?.checkpoint_id || (remote as any).checkpoint?.deterministic_hash || "")
}

function remoteRuntimeId(remote: any): string {
  if (!isPlainRecord(remote)) return "UNKNOWN_REMOTE_RUNTIME"
  return String((remote as any).runtime_id || (remote as any).checkpoint?.runtime_id || (remote as any).federation_classification?.federation_origin || "UNKNOWN_REMOTE_RUNTIME")
}

function remoteReplayIndicators(remote: any): string[] {
  if (!isPlainRecord(remote) || !Array.isArray((remote as any).replay_indicators)) return []
  return (remote as any).replay_indicators.map(String).filter(Boolean).sort()
}

async function detectCheckpointInstability(local: FederatedCheckpointEnvelope, remotes: any[] = []): Promise<FederatedObservabilityDriftClass[]> {
  const drift = new Set<FederatedObservabilityDriftClass>()
  const localHash = String(local.checkpoint.checkpoint_id || local.canonical_hash || "")
  if (!/^[a-f0-9]{64}$/.test(localHash) || !/^[a-f0-9]{64}$/.test(String(local.canonical_hash || ""))) drift.add("checkpoint_divergence")
  for (const remote of remotes) {
    const checkpointHash = remoteCheckpointHash(remote)
    if (!checkpointHash || !/^[a-f0-9]{64}$/.test(checkpointHash)) drift.add("cross_runtime_hash_mismatch")
    if (checkpointHash && checkpointHash !== localHash && checkpointHash !== local.canonical_hash) drift.add("checkpoint_divergence")
    if (!isPlainRecord(remote) || (remote as any).remote_authority_denied !== true || (remote as any).evidence_only !== true || (remote as any).read_only !== true || (remote as any).mutation_capable !== false || (remote as any).replay_neutral !== true || (remote as any).remote_execution_legitimacy === true || (remote as any).remote_authority_inherited === true) drift.add("authority_conflict")
    if (remoteReplayIndicators(remote).length > 0) drift.add("federated_replay_collision")
    if (isPlainRecord(remote) && String((remote as any).lineage_root || "") && String((remote as any).lineage_root || "") !== String(local.lineage_root || "")) drift.add("lineage_instability")
  }
  return Array.from(drift).sort()
}

async function compareFederatedCheckpoints(local: FederatedCheckpointEnvelope, remotes: any[] = []): Promise<DistributedCheckpointComparison> {
  const local_checkpoint_hash = String(local.checkpoint.checkpoint_id || local.canonical_hash || "")
  const remote_checkpoint_hashes = remotes.map(remoteCheckpointHash).filter(Boolean).sort()
  const matching_checkpoint_hashes = remote_checkpoint_hashes.filter((hash) => hash === local_checkpoint_hash || hash === local.canonical_hash).sort()
  const divergent_checkpoint_hashes = remote_checkpoint_hashes.filter((hash) => hash !== local_checkpoint_hash && hash !== local.canonical_hash).sort()
  const drift_summary = await detectCheckpointInstability(local, remotes)
  const replay_indicators = Array.from(new Set([...local.replay_indicators.map(String), ...remotes.flatMap(remoteReplayIndicators)])).sort()
  const comparisonCore = { local_checkpoint_hash, remote_checkpoint_hashes, matching_checkpoint_hashes, divergent_checkpoint_hashes, drift_summary, replay_indicators }
  return Object.freeze({ comparison_id: await deterministicReconciliationId("distributed_checkpoint_comparison", comparisonCore), ...comparisonCore, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
}

async function deriveCheckpointConsensus(comparison: DistributedCheckpointComparison): Promise<FederatedConsensusResult> {
  const drift_summary = comparison.drift_summary.slice().sort()
  const replay_indicators = comparison.replay_indicators.slice().sort()
  const core = { comparison_id: comparison.comparison_id, drift_summary, replay_indicators, consensus_status: drift_summary.length === 0 ? "CONSENSUS_OBSERVED" : "OBSERVABILITY_DRIFT_ONLY" }
  return Object.freeze({ consensus_id: await deterministicReconciliationId("federated_checkpoint_consensus", core), consensus_status: core.consensus_status as FederatedConsensusResult["consensus_status"], accepted_authority: false, drift_summary, replay_indicators, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
}

async function classifyTopologyDrift(local: FederatedCheckpointEnvelope, remotes: any[] = []): Promise<FederatedTopologyDrift> {
  const lineage_root = String(local.lineage_root || local.checkpoint.reconciliation_merkle_root || "")
  const continuity_root = String(local.continuity_id || "")
  const runtime_hashes = [local.checkpoint.runtime_id, ...remotes.map(remoteRuntimeId)].sort()
  const remote_lineage_roots = remotes.map((remote) => isPlainRecord(remote) ? String((remote as any).lineage_root || (remote as any).checkpoint?.reconciliation_merkle_root || "") : "").filter(Boolean).sort()
  const topology_hash = await sha256Hex(canonicalize({ lineage_root, continuity_root, runtime_hashes, remote_lineage_roots, authority_boundary: "remote_authority_denied" }))
  const drift = new Set<FederatedObservabilityDriftClass>()
  for (const root of remote_lineage_roots) if (root !== lineage_root) drift.add("topology_divergence")
  for (const remote of remotes) if (!isPlainRecord(remote) || (remote as any).projection === null || (remote as any).canonical_hash === "") drift.add("projection_corruption")
  return Object.freeze({ topology_hash, lineage_root, continuity_root, drift_summary: Array.from(drift).sort(), remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
}

async function deterministicReconciliationEnvelopeHash(envelope: Omit<FederatedReconciliationEnvelope, "canonical_hash"> | FederatedReconciliationEnvelope): Promise<string> {
  const { canonical_hash: _ignored_canonical_hash, ...canonical_material } = envelope as any
  return sha256Hex(canonicalize({ envelope_type: "FederatedReconciliationEnvelope", ...canonical_material, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true }))
}

function normalizeCompressionDriftClass(drift: string): GovernanceCompressionDriftClass {
  if (drift === "topology_divergence" || drift === "topology_compression_corruption") return "topology_compression_corruption"
  if (drift === "federated_replay_collision" || drift === "replay_summary_divergence") return "replay_summary_divergence"
  if (drift === "checkpoint_divergence" || drift === "lineage_instability" || drift === "reconciliation_instability") return "reconciliation_instability"
  if (drift === "authority_conflict" || drift === "projection_corruption" || drift === "cross_runtime_hash_mismatch" || drift === "federated_summary_mismatch") return "federated_summary_mismatch"
  return "compression_divergence"
}

async function compressFederatedDrift(...sources: Array<Array<string> | undefined>): Promise<DriftCompressionSummary> {
  const drift_counts: Record<string, number> = {}
  for (const drift of sources.flatMap((source) => source || []).map(String).filter(Boolean).sort()) {
    const drift_class = normalizeCompressionDriftClass(drift)
    drift_counts[drift_class] = (drift_counts[drift_class] || 0) + 1
  }
  const drift_classes = Object.keys(drift_counts).sort() as GovernanceCompressionDriftClass[]
  const core = { summary_type: "DriftCompressionSummary", drift_classes, drift_counts: canonicalRecord(drift_counts), compressed_count: drift_classes.length }
  const canonical_hash = await sha256Hex(canonicalize({ ...core, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true }))
  return Object.freeze({ ...core, canonical_hash, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true } as DriftCompressionSummary)
}

async function compressReplayIndicators(...sources: Array<Array<string> | undefined>): Promise<ReplayCompressionSummary> {
  const replay_counts: Record<string, number> = {}
  for (const indicator of sources.flatMap((source) => source || []).map(String).filter(Boolean).sort()) {
    replay_counts[indicator] = (replay_counts[indicator] || 0) + 1
  }
  const replay_indicators = Object.keys(replay_counts).sort()
  const core = { summary_type: "ReplayCompressionSummary", replay_indicators, replay_counts: canonicalRecord(replay_counts), compressed_count: replay_indicators.length, replay_consumed: false }
  const canonical_hash = await sha256Hex(canonicalize({ ...core, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true }))
  return Object.freeze({ ...core, canonical_hash, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true } as ReplayCompressionSummary)
}

async function compressTopologyState(local: FederatedCheckpointEnvelope, topology: FederatedTopologyDrift, remotes: any[] = []): Promise<TopologyCompressionSummary> {
  const participating_runtimes = Array.from(new Set([local.checkpoint.runtime_id, ...remotes.map(remoteRuntimeId)])).sort()
  const topology_hashes = Array.from(new Set([topology.topology_hash, ...remotes.map((remote) => isPlainRecord(remote) ? String((remote as any).topology_hash || "") : "").filter(Boolean)])).sort()
  const topology_root = await sha256Hex(canonicalize({ topology_hashes, participating_runtimes, local_topology_hash: topology.topology_hash }))
  const lineage_root = String(topology.lineage_root || local.lineage_root || local.checkpoint.reconciliation_merkle_root || "")
  const core = { summary_type: "TopologyCompressionSummary", topology_root, lineage_root, participating_runtimes, runtime_count: participating_runtimes.length, topology_hashes }
  const canonical_hash = await sha256Hex(canonicalize({ ...core, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true }))
  return Object.freeze({ ...core, canonical_hash, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true } as TopologyCompressionSummary)
}

async function deterministicCompressionHash(envelope: Omit<GovernanceCompressionEnvelope, "canonical_hash" | "summary"> | Omit<FederatedGovernanceSummary, "canonical_hash"> | GovernanceCompressionEnvelope | FederatedGovernanceSummary): Promise<string> {
  const { canonical_hash: _ignored_canonical_hash, summary: _ignored_summary, ...canonical_material } = envelope as any
  return sha256Hex(canonicalize({ compression_type: "GovernanceCompressionEnvelope", ...canonical_material, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true }))
}

async function deriveGovernanceCompression(reconciliation_envelope: FederatedReconciliationEnvelope, checkpoint_comparison_summary: DistributedCheckpointComparison, topology_drift_summary: FederatedTopologyDrift, local: FederatedCheckpointEnvelope, remotes: any[] = [], generated_at = reconciliation_envelope.generated_at): Promise<GovernanceCompressionEnvelope> {
  const compressed_drift_summary = await compressFederatedDrift(reconciliation_envelope.drift_summary, checkpoint_comparison_summary.drift_summary, topology_drift_summary.drift_summary)
  const compressed_replay_summary = await compressReplayIndicators(reconciliation_envelope.replay_indicators, checkpoint_comparison_summary.replay_indicators, local.replay_indicators, remotes.flatMap(remoteReplayIndicators))
  const compressed_topology_summary = await compressTopologyState(local, topology_drift_summary, remotes)
  const participating_runtimes = compressed_topology_summary.participating_runtimes.slice().sort()
  const checkpoint_set_hash = await sha256Hex(canonicalize({ local_checkpoint_hash: checkpoint_comparison_summary.local_checkpoint_hash, remote_checkpoint_hashes: checkpoint_comparison_summary.remote_checkpoint_hashes }))
  const reconciliation_root = await sha256Hex(canonicalize({ reconciliation_id: reconciliation_envelope.reconciliation_id, canonical_hash: reconciliation_envelope.canonical_hash, checkpoint_set_hash }))
  const topology_root = compressed_topology_summary.topology_root
  const lineage_root = String(reconciliation_envelope.lineage_root || compressed_topology_summary.lineage_root || "")
  const compression_id = await deterministicReconciliationId("governance_compression", { reconciliation_root, checkpoint_set_hash, topology_root, lineage_root, participating_runtimes })
  const core = { envelope_type: "GovernanceCompressionEnvelope" as const, compression_id, reconciliation_root, checkpoint_set_hash, topology_root, lineage_root, federation_classification: reconciliation_envelope.federation_classification, compressed_drift_summary, compressed_replay_summary, compressed_topology_summary, participating_runtimes, generated_at, remote_authority_denied: true as const, evidence_only: true as const, read_only: true as const, mutation_capable: false as const, replay_neutral: true as const }
  const canonical_hash = await deterministicCompressionHash(core)
  const summaryCore = { summary_type: "FederatedGovernanceSummary" as const, compression_id, reconciliation_root, checkpoint_set_hash, topology_root, lineage_root, federation_classification: reconciliation_envelope.federation_classification, compressed_drift_summary, compressed_replay_summary, compressed_topology_summary, participating_runtimes, generated_at, remote_authority_denied: true as const, evidence_only: true as const, read_only: true as const, mutation_capable: false as const, replay_neutral: true as const }
  const summary = Object.freeze({ ...summaryCore, canonical_hash: await deterministicCompressionHash(summaryCore) } as FederatedGovernanceSummary)
  return Object.freeze({ ...core, canonical_hash, summary } as GovernanceCompressionEnvelope)
}

async function buildFederatedReconciliationEnvelope(local: FederatedCheckpointEnvelope, comparison: DistributedCheckpointComparison, consensus: FederatedConsensusResult, topology: FederatedTopologyDrift, remotes: any[] = [], generated_at = local.generated_at): Promise<FederatedReconciliationEnvelope> {
  const participating_runtimes = Array.from(new Set([local.checkpoint.runtime_id, ...remotes.map(remoteRuntimeId)])).sort()
  const drift_summary = Array.from(new Set([...comparison.drift_summary, ...consensus.drift_summary, ...topology.drift_summary])).sort()
  const replay_indicators = Array.from(new Set([...comparison.replay_indicators, ...consensus.replay_indicators, ...local.replay_indicators])).sort()
  const base = { reconciliation_id: "", checkpoint_hash: String(local.checkpoint.checkpoint_id || local.canonical_hash || ""), lineage_root: topology.lineage_root || local.lineage_root, continuity_root: topology.continuity_root || local.continuity_id, federation_classification: local.federation_classification, participating_runtimes, drift_summary, replay_indicators, topology_hash: topology.topology_hash, generated_at, remote_authority_denied: true as const, evidence_only: true as const, read_only: true as const, mutation_capable: false as const, replay_neutral: true as const }
  const reconciliation_id = await deterministicReconciliationId("federated_distributed_reconciliation", { checkpoint_hash: base.checkpoint_hash, lineage_root: base.lineage_root, continuity_root: base.continuity_root, participating_runtimes, topology_hash: topology.topology_hash, drift_summary, replay_indicators })
  const withoutHash = { ...base, reconciliation_id }
  const canonical_hash = await deterministicReconciliationEnvelopeHash(withoutHash)
  return Object.freeze({ ...withoutHash, canonical_hash })
}

function canonicalIdentifiersForRegistry(byRegistry: Map<ReconciliationRegistry, ReconciliationTraceEntry>, registry: ReconciliationRegistry): CanonicalReconciliationIdentifiers | null {
  const identifiers = byRegistry.get(registry)?.canonical_identifiers
  return identifiers && Object.keys(identifiers).length > 0 ? identifiers : null
}

function requiredCanonicalIdentifier(identifiers: CanonicalReconciliationIdentifiers | null, field: keyof CanonicalReconciliationIdentifiers): string | null {
  const value = String(identifiers?.[field] || "")
  return value ? value : null
}

function resolvedPortableIdentifiersFromCanonicalRows(byRegistry: Map<ReconciliationRegistry, ReconciliationTraceEntry>): Pick<PortableLegitimacyBundle, "decision_id" | "validated_object_hash" | "proof_id" | "execution_id" | "invocation_nonce" | "continuity_id"> | null {
  // lookup_key is traversal-only evidence and MUST NEVER be emitted as canonical portable identity.
  // Portable bundle identifiers resolve exclusively from persisted registry row fields observed in the deterministic traversal.
  const authority = canonicalIdentifiersForRegistry(byRegistry, "authority_registry")
  const aeo = canonicalIdentifiersForRegistry(byRegistry, "aeo_registry")
  const validation = canonicalIdentifiersForRegistry(byRegistry, "validation_registry")
  const execution = canonicalIdentifiersForRegistry(byRegistry, "execution_registry")
  const proof = canonicalIdentifiersForRegistry(byRegistry, "proof_registry")
  const invocation = canonicalIdentifiersForRegistry(byRegistry, "invocation_registry")
  const continuity = canonicalIdentifiersForRegistry(byRegistry, "continuity_registry")
  const decision_id = requiredCanonicalIdentifier(authority, "decision_id")
  const validated_object_hash = requiredCanonicalIdentifier(aeo, "validated_object_hash") || requiredCanonicalIdentifier(validation, "validated_object_hash")
  const proof_id = requiredCanonicalIdentifier(proof, "proof_id")
  const execution_id = requiredCanonicalIdentifier(execution, "execution_id")
  const invocation_nonce = requiredCanonicalIdentifier(invocation, "invocation_nonce")
  const continuity_id = requiredCanonicalIdentifier(continuity, "continuity_id")
  if (!decision_id || !validated_object_hash || !proof_id || !execution_id || !invocation_nonce || !continuity_id) return null
  return { decision_id, validated_object_hash, proof_id, execution_id, invocation_nonce, continuity_id }
}

async function portableLegitimacyBundleFromResult(result: ReconciliationResult, emitted_at: string, runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<PortableLegitimacyBundle | null> {
  const merkle = await reconciliationMerkleEvidence(result)
  const canonical = resolveCanonicalPortableIdentifiers(result)
  if (!canonical) return null
  const byRegistry = new Map(result.deterministic_traversal_trace.map((entry) => [entry.registry, entry]))
  const identifiers = resolvedPortableIdentifiersFromCanonicalRows(byRegistry)
  if (!identifiers) return null
  const bundle = canonicalPortableLegitimacyBundle({
    runtime_id,
    reconciliation_id: await deterministicReconciliationId("federated_bundle", { runtime_id, root: merkle.root, anchor: result.lineage_anchor }),
    ...identifiers,
    authority_lineage_hash: await sha256Hex(canonicalize(byRegistry.get("authority_registry") || null)),
    proof_lineage_hash: await sha256Hex(canonicalize(byRegistry.get("proof_registry") || null)),
    replay_lineage_hash: await sha256Hex(canonicalize(byRegistry.get("invocation_registry") || null)),
    preo_lineage_hash: await sha256Hex(canonicalize(byRegistry.get("preo_registry") || null)),
    attestation_hash: await sha256Hex(canonicalize({ attestation: "observed", root: merkle.root })),
    reconciliation_merkle_root: merkle.root,
    federation_boundary: "portable_evidence_not_portable_authority",
    emitted_at
  })
  return bundle
}

async function federatedIdentifierResolutionDrift(result: ReconciliationResult): Promise<ReconciliationDrift> {
  const deterministic_trace = result.deterministic_traversal_trace.map((entry) => ({ ...entry }))
  return {
    drift_id: await reconciliationDriftId("federated_identifier_resolution_drift", "proof_registry", result.lineage_anchor, deterministic_trace),
    drift_class: "federated_identifier_resolution_drift",
    lineage_anchor: result.lineage_anchor,
    registry_origin: "proof_registry",
    detected_at: "DETERMINISTIC_RECONCILIATION_TRAVERSAL",
    severity: "HIGH",
    deterministic_trace
  }
}

async function federatedDriftClassificationsAfterPortableBundleResolution(result: ReconciliationResult, bundle: PortableLegitimacyBundle | null): Promise<ReconciliationDrift[]> {
  const drift = result.drift_classifications.map((entry) => ({ ...entry, deterministic_trace: entry.deterministic_trace.map((trace) => ({ ...trace })) }))
  if (bundle) return drift
  return [...drift, await federatedIdentifierResolutionDrift(result)]
}

function reconciliationStatusAfterPortableBundleResolution(result: ReconciliationResult, bundle: PortableLegitimacyBundle | null): ReconciliationStatus {
  return bundle ? result.result : "NULL"
}

async function verifyFederatedProofEnvelope(envelope: any, bundle: PortableLegitimacyBundle, hmac_secret?: string): Promise<boolean> {
  if (!isPlainRecord(envelope)) return false
  const payloadType = String(envelope.payloadType || envelope.payload_type || "")
  if (payloadType !== FEDERATED_RECONCILIATION_PAYLOAD_TYPE) return false
  const payloadBytes = base64ToBytes(String(envelope.payload || ""))
  if (!payloadBytes) return false
  const payloadJson = new TextDecoder().decode(payloadBytes)
  if (payloadJson !== canonicalize(bundle)) return false
  if (!hmac_secret) return true
  const signatures = Array.isArray((envelope as any).signatures) ? (envelope as any).signatures : []
  const provided = signatures.find((signature: any) => isPlainRecord(signature) && String(signature.keyid || "") === bundle.runtime_id)
  const signatureBytes = base64ToBytes(String(provided?.sig || provided?.signature || ""))
  if (!signatureBytes) return false
  const expected = await hmacSha256(hmac_secret, dssePreAuthenticationEncoding(FEDERATED_RECONCILIATION_PAYLOAD_TYPE, payloadBytes))
  return constantTimeEqual(signatureBytes, expected)
}

async function verifyFederatedLegitimacyBundle(input: any, expected: ReconciliationAnchor, local_runtime_id = LOCAL_FEDERATION_RUNTIME_ID, hmac_secret?: string): Promise<FederatedBundleVerification> {
  const payload = isPlainRecord(input?.payload) ? input.payload : input
  const bundle = canonicalPortableLegitimacyBundle(payload)
  const classification = classifyRemoteRuntime(String(bundle?.runtime_id || ""), local_runtime_id)
  const nullResult = (drift_class: DriftClass): FederatedBundleVerification => ({ status: "NULL", result: "NULL", drift_class, runtime_classification: classification, trust_semantics: "remote_evidence_can_narrow_acceptance_only", local_validation_required: true, remote_authority_inherited: false, remote_execution_legitimacy: false, replay_state_consumed: false })
  if (!bundle) return nullResult("federated_bundle_drift")
  if (classification === "UNTRUSTED_RUNTIME") return nullResult("federated_runtime_divergence_drift")
  if (canonicalize(payload) !== canonicalize(bundle)) return nullResult("federated_bundle_drift")
  if (expected.decision_id && bundle.decision_id !== expected.decision_id) return nullResult("federated_reconciliation_drift")
  if (expected.validated_object_hash && bundle.validated_object_hash !== expected.validated_object_hash) return nullResult("federated_exact_object_drift")
  if (expected.invocation_nonce && bundle.invocation_nonce !== expected.invocation_nonce) return nullResult("federated_replay_drift")
  if (expected.continuity_id && bundle.continuity_id !== expected.continuity_id) return nullResult("federated_continuity_drift")
  if (expected.execution_id && bundle.execution_id !== expected.execution_id) return nullResult("federated_reconciliation_drift")
  if (expected.proof_id && bundle.proof_id !== expected.proof_id) return nullResult("federated_attestation_drift")
  if (!/^[a-f0-9]{64}$/.test(bundle.reconciliation_merkle_root)) return nullResult("federated_merkle_drift")
  if (!/^[a-f0-9]{64}$/.test(bundle.attestation_hash)) return nullResult("federated_attestation_drift")
  if (!/^[a-f0-9]{64}$/.test(bundle.preo_lineage_hash)) return nullResult("federated_preo_drift")
  if (isPlainRecord(input?.dsse_envelope) && !(await verifyFederatedProofEnvelope(input.dsse_envelope, bundle, hmac_secret))) return nullResult("federated_attestation_drift")
  const bundle_hash = await sha256Hex(canonicalize(bundle))
  return { status: "FEDERATED_RECONCILIATION_OBSERVED", result: "FEDERATED_RECONCILIATION_OBSERVED", runtime_classification: classification, trust_semantics: "remote_evidence_can_narrow_acceptance_only", local_validation_required: true, remote_authority_inherited: false, remote_execution_legitimacy: false, replay_state_consumed: false, merkle_root: bundle.reconciliation_merkle_root, bundle_hash }
}

async function reconciliationWitnessEnvelope(bundle: PortableLegitimacyBundle | null, checkpoint: ReconciliationCheckpoint, classification: RemoteRuntimeClassification): Promise<ReconciliationWitnessEnvelope> {
  const bundle_hash = await sha256Hex(canonicalize(bundle || {}))
  const checkpoint_hash = await sha256Hex(canonicalize(checkpoint))
  return {
    witness_id: await sha256Hex(canonicalize({ bundle_hash, checkpoint_hash, classification })),
    runtime_classification: classification,
    authority_boundary: "portable_evidence_not_portable_authority",
    local_validation_required: true,
    replay_neutral: true,
    mutation_capable: false,
    bundle_hash,
    checkpoint_hash
  }
}


function classifyFederationTier(origin: string, local_runtime_id = LOCAL_FEDERATION_RUNTIME_ID): FederationTier {
  if (!origin) return "UNKNOWN"
  if (origin === local_runtime_id) return "TRUSTED_INTERNAL"
  if (origin.startsWith("mindshift-federated://trusted/")) return "TRUSTED_EXTERNAL"
  if (origin.startsWith("mindshift-federated://quarantine/") || origin.includes("quarantine")) return "QUARANTINED"
  if (origin.startsWith("mindshift-federated://") || origin.startsWith("https://")) return "UNTRUSTED_EXTERNAL"
  return "UNKNOWN"
}

function canonicalFederatedTrustEnvelope(input: {
  federation_origin?: string
  federation_tier?: FederationTier
  verification_status?: FederationVerificationStatus
  continuity_reference?: string
  lineage_root?: string
  observed_at?: string
}): FederatedTrustEnvelope {
  const verification_status = input.verification_status || "UNVERIFIED"
  const coerced_tier = verification_status === "CORRUPTED" || verification_status === "LINEAGE_MISMATCH" || verification_status === "REPLAY_DETECTED"
    ? "QUARANTINED"
    : (input.federation_tier || classifyFederationTier(String(input.federation_origin || "")))
  return Object.freeze({
    federation_origin: String(input.federation_origin || ""),
    federation_tier: coerced_tier,
    verification_status,
    evidence_only: true,
    remote_authority_denied: true,
    continuity_reference: String(input.continuity_reference || ""),
    lineage_root: String(input.lineage_root || ""),
    observed_at: String(input.observed_at || "")
  })
}

async function deterministicFederatedTrustEnvelopeHash(envelope: FederatedTrustEnvelope): Promise<string> {
  return sha256Hex(canonicalize({ envelope_type: "FederatedTrustEnvelope", deterministic_serialization: true, remote_authority_denied: true, evidence_only: true, envelope }))
}

async function classifyFederatedTrust(input: any, observed_at: string, local_runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<FederationVerificationResult> {
  const origin = String(input?.federation_origin || input?.runtime_id || input?.remote_runtime_id || "")
  const lineage_root = String(input?.lineage_root || input?.reconciliation_merkle_root || input?.lineage_hash || "")
  const continuity_reference = String(input?.continuity_reference || input?.continuity_id || "")
  const corrupt = isPlainRecord(input) && ((input as any).remote_authority_denied === false || (input as any).evidence_only === false || (input as any).remote_authority_inherited === true || (input as any).remote_execution_legitimacy === true || (input as any).mutation_capable === true)
  const replay = String(input?.verification_status || "") === "REPLAY_DETECTED" || String(input?.drift_class || "") === "replay_resurrection_attempt" || String(input?.drift_class || "") === "federated_revocation_replay_drift"
  const mismatch = String(input?.verification_status || "") === "LINEAGE_MISMATCH" || String(input?.drift_class || "") === "federated_lineage_divergence"
  const verification_status: FederationVerificationStatus = corrupt ? "CORRUPTED" : replay ? "REPLAY_DETECTED" : mismatch ? "LINEAGE_MISMATCH" : (!origin || !lineage_root) ? "NULL_STATE" : String(input?.verification_status || "") === "VERIFIED" ? "VERIFIED" : "UNVERIFIED"
  const envelope = canonicalFederatedTrustEnvelope({ federation_origin: origin || local_runtime_id, verification_status, continuity_reference, lineage_root, observed_at })
  const drift_class: DriftClass | undefined = verification_status === "REPLAY_DETECTED" ? "replay_resurrection_attempt" : verification_status === "LINEAGE_MISMATCH" ? "federated_lineage_divergence" : verification_status === "CORRUPTED" ? "federated_lineage_divergence" : undefined
  return { status: verification_status === "NULL_STATE" ? "NULL" : "FEDERATED_EVIDENCE_OBSERVED", envelope, canonical_hash: await deterministicFederatedTrustEnvelopeHash(envelope), drift_class, remote_authority_denied: true, evidence_only: true }
}

async function topologyNode(layer: RevocationTopologyNode["topology_layer"], object_id: string, parent_object_id: string, payload: unknown, status: string): Promise<RevocationTopologyNode> {
  return { topology_layer: layer, object_id, parent_object_id, lineage_hash: await sha256Hex(canonicalize({ layer, object_id, parent_object_id, payload, status })), status }
}

async function collectRevokedLineage(env: Env, continuity_id: string): Promise<string[]> {
  if (!continuity_id || !hasDb(env)) return []
  const rows = await env.DB.prepare(`SELECT continuity_id FROM continuity_registry WHERE (continuity_id=?1 OR parent_continuity_id=?1) AND (status IN ('REVOKED','EXPIRED') OR revoked_at IS NOT NULL) ORDER BY continuity_id ASC`).bind(continuity_id).all<any>()
  return (Array.isArray(rows?.results) ? rows.results : []).map((row) => String(row.continuity_id || "")).filter(Boolean)
}

async function detectOrphanedExecutions(env: Env, continuity_id = ""): Promise<RevocationTopologyNode[]> {
  if (!hasDb(env)) return []
  const scoped = continuity_id ? `AND e.continuity_id=?1` : ``
  const query = `SELECT e.* FROM execution_registry e LEFT JOIN validation_registry v ON v.decision_id=e.decision_id AND v.validated_object_hash=e.validated_object_hash AND v.invocation_nonce=e.invocation_nonce AND v.status='VALID' LEFT JOIN authority_registry a ON a.decision_id=e.decision_id WHERE e.status='EXECUTED' AND (v.validation_id IS NULL OR a.authority_id IS NULL) ${scoped} ORDER BY e.created_at ASC, e.execution_id ASC LIMIT ${RECONCILIATION_SCHEDULER_BATCH_LIMIT}`
  const rows = continuity_id ? await env.DB.prepare(query).bind(continuity_id).all<any>() : await env.DB.prepare(query).all<any>()
  const nodes: RevocationTopologyNode[] = []
  for (const row of Array.isArray(rows?.results) ? rows.results : []) nodes.push(await topologyNode("execution_lineage", String(row.execution_id || ""), String(row.decision_id || ""), row, "ORPHANED"))
  return nodes
}

async function deriveRevocationTopology(env: Env, anchor: ReconciliationAnchor): Promise<RevocationTopology> {
  const continuity_id = String(anchor.continuity_id || "")
  const decision_id = String(anchor.decision_id || "")
  const nodes: RevocationTopologyNode[] = []
  const drift = new Set<DriftClass>()
  if (!hasDb(env)) {
    const lineage_root = await sha256Hex(canonicalize({ continuity_id, decision_id, nodes }))
    return { topology_id: await deterministicReconciliationId("revocation_topology", { lineage_root }), authority_id: "", continuity_id, lineage_root, nodes, drift_classifications: [], read_only: true, replay_neutral: true, mutation_capable: false }
  }
  const authority = decision_id ? await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1 ORDER BY created_at ASC, authority_id ASC LIMIT 1`).bind(decision_id).first<any>() : null
  const authority_id = String(authority?.authority_id || "")
  if (authority) {
    nodes.push(await topologyNode("authority", authority_id, String(authority.continuity_id || ""), authority, String(authority.status || "UNKNOWN")))
    if (["REVOKED", "EXPIRED"].includes(String(authority.status || ""))) drift.add("revoked_authority_execution")
  }
  const delegated = continuity_id ? await env.DB.prepare(`SELECT * FROM authority_registry WHERE continuity_id=?1 AND decision_id<>?2 ORDER BY created_at ASC, authority_id ASC LIMIT ${RECONCILIATION_SCHEDULER_BATCH_LIMIT}`).bind(continuity_id, decision_id).all<any>() : { results: [] }
  for (const row of Array.isArray(delegated?.results) ? delegated.results : []) nodes.push(await topologyNode("delegated_authority", String(row.authority_id || ""), authority_id, row, String(row.status || "UNKNOWN")))
  const executions = decision_id ? await env.DB.prepare(`SELECT * FROM execution_registry WHERE decision_id=?1 ORDER BY created_at ASC, execution_id ASC LIMIT ${RECONCILIATION_SCHEDULER_BATCH_LIMIT}`).bind(decision_id).all<any>() : { results: [] }
  for (const row of Array.isArray(executions?.results) ? executions.results : []) {
    nodes.push(await topologyNode("execution_lineage", String(row.execution_id || ""), authority_id, row, String(row.status || "UNKNOWN")))
    if (drift.has("revoked_authority_execution") && String(row.status || "") === "EXECUTED") drift.add("revoked_authority_execution")
  }
  const proofs = decision_id ? await env.DB.prepare(`SELECT * FROM proof_registry WHERE decision_id=?1 ORDER BY created_at ASC, proof_id ASC LIMIT ${RECONCILIATION_SCHEDULER_BATCH_LIMIT}`).bind(decision_id).all<any>() : { results: [] }
  for (const row of Array.isArray(proofs?.results) ? proofs.results : []) nodes.push(await topologyNode("proof_lineage", String(row.proof_id || ""), String(row.execution_id || ""), row, String(row.status || "PROVEN")))
  const federated = decision_id ? await env.DB.prepare(`SELECT * FROM federated_revocation_observability_registry WHERE decision_id=?1 ORDER BY observed_at ASC, revocation_evidence_id ASC LIMIT ${RECONCILIATION_SCHEDULER_BATCH_LIMIT}`).bind(decision_id).all<any>() : { results: [] }
  for (const row of Array.isArray(federated?.results) ? federated.results : []) {
    nodes.push(await topologyNode("federated_projection_lineage", String(row.revocation_evidence_id || ""), String(row.lineage_hash || ""), row, String(row.verification_status || "OBSERVED")))
    if (String(row.drift_class || "") === "federated_lineage_divergence") drift.add("federated_lineage_divergence")
    if (String(row.drift_class || "") === "replay_resurrection_attempt" || String(row.verification_status || "") === "REPLAY_DETECTED") drift.add("replay_resurrection_attempt")
  }
  const orphaned = await detectOrphanedExecutions(env, continuity_id)
  if (orphaned.length > 0) drift.add("orphaned_execution")
  nodes.push(...orphaned)
  const lineage_root = await sha256Hex(canonicalize({ continuity_id, decision_id, authority_id, nodes }))
  return { topology_id: await deterministicReconciliationId("revocation_topology", { lineage_root, continuity_id, decision_id }), authority_id, continuity_id, lineage_root, nodes, drift_classifications: Array.from(drift).sort() as DriftClass[], read_only: true, replay_neutral: true, mutation_capable: false }
}

function traceRevocationImpact(topology: RevocationTopology): Record<string, unknown> {
  return canonicalRecord({ authority_id: topology.authority_id, continuity_id: topology.continuity_id, lineage_root: topology.lineage_root, impacted_nodes: topology.nodes.length, drift_classifications: topology.drift_classifications, read_only: true, replay_neutral: true, mutation_capable: false })
}

async function createObservabilityEnvelope(topology: RevocationTopology, federation_classification: FederationClassification, proof_summary: Record<string, unknown>, replay_indicators: string[], generated_at: string): Promise<ObservabilityEnvelope> {
  const core = { lineage_root: topology.lineage_root, continuity_id: topology.continuity_id, federation_classification, drift_summary: topology.drift_classifications, proof_summary: canonicalRecord(proof_summary), replay_indicators: replay_indicators.map(String).sort(), generated_at }
  const canonical_hash = await sha256Hex(canonicalize(core))
  return Object.freeze({ envelope_id: await sha256Hex(canonicalize({ envelope_type: "ObservabilityEnvelope", canonical_hash })), canonical_hash, ...core })
}

type ProofDuplicateQuarantineSummary = { detected: boolean, quarantined: number }

function proofLineageMaterial(row: any): Record<string, unknown> {
  return canonicalRecord({
    proof_id: String(row.proof_id || ""),
    session_id: String(row.session_id || ""),
    execution_id: String(row.execution_id || ""),
    decision_id: String(row.decision_id || ""),
    validated_object_hash: String(row.validated_object_hash || ""),
    surface: row.surface ?? null,
    run_id: row.run_id ?? null,
    commit_sha: row.commit_sha ?? null,
    workflow: row.workflow ?? null,
    environment: row.environment ?? null,
    created_at: String(row.created_at || ""),
    continuity_id: row.continuity_id ?? null,
    continuity_hash: row.continuity_hash ?? null,
    identity_id: row.identity_id ?? null,
    authority_lineage: row.authority_lineage ?? null,
    execution_lineage: row.execution_lineage ?? null,
    repository: row.repository ?? null,
    branch: row.branch ?? null,
    pull_request_id: row.pull_request_id ?? null,
    merge_commit_sha: row.merge_commit_sha ?? null,
    source_tree_hash: row.source_tree_hash ?? null,
    workflow_run_id: row.workflow_run_id ?? null,
    workflow_sha: row.workflow_sha ?? null
  })
}

async function canonicalProofLineageHash(row: any, canonical_proof_id: string): Promise<string> {
  return sha256Hex(canonicalize({ canonical_proof_selected: canonical_proof_id, proof: proofLineageMaterial(row) }))
}

async function deterministicProofQuarantineId(row: any, lineage_hash: string): Promise<string> {
  return sha256Hex(canonicalize({ quarantine_reason: "duplicate_proof_lineage", proof_id: String(row.proof_id || ""), lineage_hash }))
}

function sortProofLineageRows(rows: any[]): any[] {
  return [...rows].sort((a, b) => {
    const created = String(a.created_at || "").localeCompare(String(b.created_at || ""))
    if (created !== 0) return created
    const canonical = canonicalize(proofLineageMaterial(a)).localeCompare(canonicalize(proofLineageMaterial(b)))
    if (canonical !== 0) return canonical
    return String(a.proof_id || "").localeCompare(String(b.proof_id || ""))
  })
}


async function quarantineHistoricalProofDuplicates(env: Env): Promise<ProofDuplicateQuarantineSummary> {
  const duplicateRows = await env.DB.prepare(`SELECT rowid AS __rowid,* FROM proof_registry
    WHERE decision_id || char(31) || validated_object_hash IN (
      SELECT decision_id || char(31) || validated_object_hash FROM proof_registry GROUP BY decision_id, validated_object_hash HAVING COUNT(*) > 1
    )
    ORDER BY decision_id ASC, validated_object_hash ASC, created_at ASC, proof_id ASC`).all<any>()
  const rows = Array.isArray(duplicateRows?.results) ? duplicateRows.results : []
  if (rows.length === 0) return { detected: false, quarantined: 0 }

  const groups = new Map<string, any[]>()
  for (const row of rows) {
    const key = `${String(row.decision_id || "")}\u001f${String(row.validated_object_hash || "")}`
    const group = groups.get(key) || []
    group.push(row)
    groups.set(key, group)
  }

  let quarantined = 0
  const duplicateRowids: string[] = []
  for (const group of groups.values()) {
    const ordered = sortProofLineageRows(group)
    const canonical = ordered[0]
    const canonical_proof_id = String(canonical.proof_id || "")
    for (const duplicate of ordered.slice(1)) {
      const proof_id = String(duplicate.proof_id || "")
      const lineage_hash = await canonicalProofLineageHash(duplicate, canonical_proof_id)
      const quarantine_id = await deterministicProofQuarantineId(duplicate, lineage_hash)
      const quarantine_generated_at = String(duplicate.created_at || canonical.created_at || "")
      await env.DB.prepare(`INSERT OR IGNORE INTO proof_registry_duplicate_archive (archive_id,proof_id,session_id,execution_id,decision_id,validated_object_hash,surface,run_id,commit_sha,workflow,environment,created_at,archived_at,archive_reason,canonical_proof_id)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'duplicate_proof_lineage',?14)`).bind(
          `archive:${proof_id}:duplicate_proof_lineage`,
          proof_id,
          String(duplicate.session_id || ""),
          String(duplicate.execution_id || ""),
          String(duplicate.decision_id || ""),
          String(duplicate.validated_object_hash || ""),
          duplicate.surface ?? null,
          duplicate.run_id ?? null,
          duplicate.commit_sha ?? null,
          duplicate.workflow ?? null,
          duplicate.environment ?? null,
          String(duplicate.created_at || ""),
          quarantine_generated_at,
          canonical_proof_id
        ).run()
      await env.DB.prepare(`INSERT OR IGNORE INTO proof_quarantine_registry (quarantine_id,proof_id,lineage_hash,quarantine_reason,canonical_proof_selected,duplicate_proof_archived,quarantine_generated_at,replay_neutral,evidence_only)
        VALUES (?1,?2,?3,'duplicate_proof_lineage',?4,?5,?6,'true','true')`).bind(
          quarantine_id,
          proof_id,
          lineage_hash,
          canonical_proof_id,
          `archive:${proof_id}:duplicate_proof_lineage`,
          quarantine_generated_at
        ).run()
      duplicateRowids.push(String(duplicate.__rowid || ""))
      quarantined += 1
    }
  }

  for (const rowid of duplicateRowids.filter(Boolean)) {
    await env.DB.prepare(`DELETE FROM proof_registry WHERE rowid=?1`).bind(rowid).run()
  }
  return { detected: true, quarantined }
}

async function validateProofArchiveCompatibility(env: Env) {
  await env.DB.prepare(`INSERT OR IGNORE INTO proof_registry_duplicate_archive (archive_id,proof_id,session_id,execution_id,decision_id,validated_object_hash,surface,run_id,commit_sha,workflow,environment,created_at,archived_at,archive_reason,canonical_proof_id)
    SELECT 'bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe',NULL,NULL,NULL,NULL,NULL,'bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','archive_compatibility_probe','bootstrap_archive_compatibility_probe'
    WHERE 0`).run()
}

async function proofRegistryStabilized(env: Env): Promise<boolean> {
  const duplicates = await env.DB.prepare(`SELECT COUNT(*) AS count FROM (
    SELECT decision_id, validated_object_hash FROM proof_registry GROUP BY decision_id, validated_object_hash HAVING COUNT(*) > 1
  )`).first<any>()
  return Number(duplicates?.count || 0) === 0
}

async function emitBootstrapDiagnostic(env: Env, event_type: BootstrapDiagnosticEvent) {
  try {
    await env.DB.prepare(`INSERT OR IGNORE INTO observability_registry (event_id,event_type,severity,payload,created_at)
      VALUES (?1,?2,'INFO',?3,?4)`).bind(
        `bootstrap:${event_type}`,
        event_type,
        canonicalize({ event_type, replay_neutral: true, append_only: true, evidence_only: true, authoritative: false }),
        event_type
      ).run()
  } catch {}
}

async function emitTelemetry(env: Env, event: {
  event_type: TelemetryEventType
  decision_id?: string
  authority_id?: string
  execution_id?: string
  proof_id?: string
  severity?: string
  payload?: Record<string, unknown>
}) {
  const created_at = new Date().toISOString()
  const payload = JSON.stringify({ ...(event.payload || {}), timestamp: created_at })
  await env.DB.prepare(`INSERT INTO observability_registry (event_id,event_type,decision_id,authority_id,execution_id,proof_id,severity,payload,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`)
    .bind(crypto.randomUUID(), event.event_type, event.decision_id || null, event.authority_id || null, event.execution_id || null, event.proof_id || null, event.severity || "INFO", payload, created_at)
    .run()
}

async function recordDrift(env: Env, drift: {
  drift_class: DriftClass
  severity?: string
  decision_id?: string
  execution_id?: string
  payload?: Record<string, unknown>
  detected_by?: string
}) {
  const created_at = new Date().toISOString()
  const payload = JSON.stringify({ ...(drift.payload || {}), timestamp: created_at })
  await env.DB.prepare(`INSERT INTO drift_registry (drift_id,drift_class,severity,decision_id,execution_id,payload,detected_by,resolution_status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'OPEN',?8)`)
    .bind(crypto.randomUUID(), drift.drift_class, drift.severity || "HIGH", drift.decision_id || null, drift.execution_id || null, payload, drift.detected_by || "runtime_observability_agent", created_at)
    .run()
}


function recursiveMutationRequiresSCO(mutation_class: RecursiveMutationClass): boolean {
  return (["runtime_route_mutation", "validator_mutation", "schema_mutation", "authority_semantics_mutation", "proof_semantics_mutation", "replay_semantics_mutation", "policy_mutation", "observability_mutation", "federation_semantics_mutation", "governance_surface_expansion"] as readonly RecursiveMutationClass[]).includes(mutation_class)
}

async function deriveRecursiveGovernanceHash(value: unknown): Promise<string> {
  return sha256Hex(canonicalize(value))
}

function isRecursiveMutationClass(value: string): value is RecursiveMutationClass {
  return (["runtime_route_mutation", "validator_mutation", "schema_mutation", "authority_semantics_mutation", "proof_semantics_mutation", "replay_semantics_mutation", "policy_mutation", "observability_mutation", "federation_semantics_mutation", "governance_surface_expansion"] as readonly string[]).includes(value)
}

function buildRecursiveGovernanceEnvelope(url: URL): GovernanceMutationEnvelope {
  const mutationClassInput = String(url.searchParams.get("mutation_class") || "runtime_route_mutation")
  const mutation_class: RecursiveMutationClass = isRecursiveMutationClass(mutationClassInput) ? mutationClassInput : "runtime_route_mutation"
  const target_surface = String(url.searchParams.get("target_surface") || "")
  const proposed_object_hash = String(url.searchParams.get("proposed_object_hash") || url.searchParams.get("object_hash") || url.searchParams.get("mutation_hash") || "")
  const validated_object_hash = String(url.searchParams.get("validated_object_hash") || url.searchParams.get("object_hash") || "")
  return Object.freeze({
    mutation_class,
    mutation_scope: String(url.searchParams.get("mutation_scope") || "runtime"),
    target_surface,
    mutation_hash: String(url.searchParams.get("mutation_hash") || proposed_object_hash || target_surface),
    sco_hash: String(url.searchParams.get("sco_hash") || ""),
    preo_hash: String(url.searchParams.get("preo_hash") || ""),
    proposed_object_hash,
    validated_object_hash,
    executable: String(url.searchParams.get("executable") || "false") === "true",
    method: String(url.searchParams.get("method") || "GET").toUpperCase(),
    validation_state: String(url.searchParams.get("validation_state") || "OBSERVED").toUpperCase(),
    recursive_governance_invariant: "system_mutation_requires_legitimacy",
    canonical_execution_path: CANONICAL_RUNTIME_ROUTES
  })
}

function classifyRecursiveMutation(envelope: GovernanceMutationEnvelope): RecursiveMutationDriftClass[] {
  const drift = new Set<RecursiveMutationDriftClass>()
  const canonicalRoute = (CANONICAL_RUNTIME_ROUTES as readonly string[]).includes(envelope.target_surface)
  const observabilityRoute = (NON_EXECUTABLE_OBSERVABILITY_ROUTES as readonly string[]).includes(envelope.target_surface)
  const knownRoute = canonicalRoute || observabilityRoute || (GOVERNANCE_EVIDENCE_ROUTES as readonly string[]).includes(envelope.target_surface)

  if (recursiveMutationRequiresSCO(envelope.mutation_class) && !envelope.sco_hash) drift.add("missing_sco")
  if (recursiveMutationRequiresSCO(envelope.mutation_class) && !envelope.preo_hash) drift.add("missing_preo")
  if (envelope.mutation_class === "governance_surface_expansion" || (envelope.executable && !knownRoute)) drift.add("executable_surface_expansion")
  if (envelope.target_surface && !knownRoute && envelope.executable) drift.add("bypass_path_introduction")
  if (envelope.validation_state === "VALIDATED" && envelope.mutation_hash && envelope.validated_object_hash && envelope.mutation_hash !== envelope.validated_object_hash) drift.add("runtime_mutation_after_validation")
  if (canonicalRoute && envelope.mutation_class === "runtime_route_mutation") drift.add("canonical_route_mutation")
  if (envelope.mutation_class === "validator_mutation") drift.add("validator_weakening")
  if (envelope.mutation_class === "schema_mutation") drift.add("schema_weakening")
  if (envelope.mutation_class === "policy_mutation") drift.add("policy_semantics_mutation")
  if (envelope.mutation_class === "proof_semantics_mutation") drift.add("proof_weakening")
  if (envelope.mutation_class === "replay_semantics_mutation") drift.add("replay_weakening")
  if (envelope.mutation_class === "authority_semantics_mutation") drift.add("authority_inheritance_expansion")
  if (observabilityRoute && (envelope.executable || envelope.method !== "GET")) drift.add("mutation_capable_observability_route")
  if (!envelope.proposed_object_hash || !envelope.validated_object_hash || envelope.proposed_object_hash !== envelope.validated_object_hash) drift.add("exact_object_violation")
  if (!CANONICAL_RUNTIME_ROUTES.every((route) => ["/authority", "/compile", "/validate", "/execute", "/proof"].includes(route) || route === "/session" || route === "/continuity")) drift.add("canonical_path_violation")
  return Array.from(drift).sort()
}

function verifyRecursiveGovernanceIntegrity(envelope: GovernanceMutationEnvelope, drift_classes = classifyRecursiveMutation(envelope)): RecursiveGovernanceDecision {
  const exact_object_verified = Boolean(envelope.proposed_object_hash && envelope.validated_object_hash && envelope.proposed_object_hash === envelope.validated_object_hash)
  const canonical_path_preserved = !drift_classes.includes("canonical_path_violation") && !drift_classes.includes("bypass_path_introduction") && !drift_classes.includes("canonical_route_mutation")
  const mutation_authorized = Boolean(envelope.sco_hash && envelope.preo_hash && exact_object_verified && canonical_path_preserved && drift_classes.length === 0)
  const onlyMissingPreo = drift_classes.length === 1 && drift_classes[0] === "missing_preo"
  const governance_decision: RecursiveGovernanceState = mutation_authorized ? "GOVERNANCE_VALIDATED" : drift_classes.includes("missing_sco") || onlyMissingPreo ? "NULL" : drift_classes.length > 0 ? "GOVERNANCE_REJECTED" : "NULL"
  return Object.freeze({ governance_decision, drift_classes, exact_object_verified, replay_neutral: true, mutation_authorized, proof_required: true, canonical_path_preserved })
}

function detectRecursiveGovernanceDrift(envelope: GovernanceMutationEnvelope): RecursiveMutationDriftClass[] {
  return classifyRecursiveMutation(envelope)
}

async function buildRecursiveGovernanceProof(envelope: GovernanceMutationEnvelope, decision: RecursiveGovernanceDecision): Promise<RecursiveGovernanceProof> {
  const proof_hash = await deriveRecursiveGovernanceHash({ envelope, decision, evidence_only: true, replay_consumed: false })
  return Object.freeze({ governance_id: await deriveRecursiveGovernanceHash({ proof_hash, mutation_hash: envelope.mutation_hash }), mutation_hash: envelope.mutation_hash, sco_hash: envelope.sco_hash, preo_hash: envelope.preo_hash, proof_hash, evidence_only: true, replay_consumed: false })
}

async function buildRecursiveGovernanceCheckpoint(envelope: GovernanceMutationEnvelope, decision: RecursiveGovernanceDecision, generated_at: string): Promise<RecursiveGovernanceCheckpoint> {
  const envelope_hash = await deriveRecursiveGovernanceHash(envelope)
  const decision_hash = await deriveRecursiveGovernanceHash(decision)
  return Object.freeze({ checkpoint_id: await deriveRecursiveGovernanceHash({ envelope_hash, decision_hash, generated_at }), governance_id: await deriveRecursiveGovernanceHash({ envelope_hash, decision_hash }), envelope_hash, decision_hash, generated_at })
}

async function appendRecursiveGovernanceEvidence(env: Env, proof: RecursiveGovernanceProof, envelope: GovernanceMutationEnvelope, decision: RecursiveGovernanceDecision, generated_at: string) {
  await env.DB.prepare(`INSERT INTO recursive_governance_registry (governance_id,mutation_class,mutation_scope,target_surface,mutation_hash,sco_hash,preo_hash,governance_decision,drift_classes,exact_object_verified,replay_neutral,mutation_authorized,proof_required,canonical_path_preserved,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'true',?11,'true',?12,?13,?14)`)
    .bind(proof.governance_id, envelope.mutation_class, envelope.mutation_scope, envelope.target_surface, envelope.mutation_hash, envelope.sco_hash, envelope.preo_hash, decision.governance_decision, canonicalize(decision.drift_classes), String(decision.exact_object_verified), String(decision.mutation_authorized), String(decision.canonical_path_preserved), generated_at, generated_at)
    .run()
}


function canonicalRuntimeSurface(): RuntimeSurfaceFingerprint {
  return Object.freeze({
    routes: Object.freeze([...CANONICAL_RUNTIME_ROUTES, ...GOVERNANCE_EVIDENCE_ROUTES, RECURSIVE_GOVERNANCE_ROUTE, RECURSIVE_GOVERNANCE_ADMISSION_ROUTE, RECURSIVE_GOVERNANCE_SELF_INTEGRITY_ROUTE].sort()),
    validators: Object.freeze(["authorized", "validateCanonicalAEO", "verifyRecursiveGovernanceIntegrity", "enforceRecursiveGovernanceBoundary", "validateRequestProvenanceAttestation"].sort()),
    schemas: Object.freeze(Object.keys(REQUIRED_SCHEMA_COLUMNS).sort()),
    governance_policies: Object.freeze(["sco_required", "preo_required", "exact_object_required", "canonical_path_preserved", "replay_neutral", "append_only_proof_required"].sort()),
    observability_boundaries: Object.freeze([...NON_EXECUTABLE_OBSERVABILITY_ROUTES].sort())
  })
}

async function deriveRuntimeSurfaceHash(surface: RuntimeSurfaceFingerprint = canonicalRuntimeSurface()): Promise<string> {
  return sha256Hex(canonicalize(surface))
}

async function runtimeSelfIntegrityCheckpoint(expectedRuntimeSurfaceHash = ""): Promise<RuntimeSelfIntegrityCheckpoint> {
  const runtime_surface_hash = await deriveRuntimeSurfaceHash()
  const governance_checkpoint_hash = await deriveRecursiveGovernanceHash({
    canonical_path: CANONICAL_RUNTIME_ROUTES,
    recursive_admission_route: RECURSIVE_GOVERNANCE_ADMISSION_ROUTE,
    required_policies: canonicalRuntimeSurface().governance_policies
  })
  const recursive_integrity_hash = await deriveRecursiveGovernanceHash({ runtime_surface_hash, governance_checkpoint_hash })
  const runtime_ready = !expectedRuntimeSurfaceHash || expectedRuntimeSurfaceHash === runtime_surface_hash
  return Object.freeze({ runtime_surface_hash, governance_checkpoint_hash, recursive_integrity_hash, runtime_ready })
}


const RUNTIME_VALIDATOR_SURFACE = Object.freeze(["activeContinuity", "activeSession", "authorized", "deploymentPreoLineage", "enforceRecursiveGovernanceBoundary", "validateDsseProvenanceEnvelope", "validateExecutionProvenance", "verifyRecursiveGovernanceIntegrity"].sort())
const RUNTIME_REPLAY_TOPOLOGY = Object.freeze(["authority_registry.status", "execution_registry.unique_decision_object", "external_authority_registry.replay_neutral", "invocation_registry.nonce", "proof_registry.unique_decision_object", "proof_registry.unique_workflow_run", "recursive_governance_replay_registry"].sort())
const RUNTIME_PROOF_TOPOLOGY = Object.freeze(["attestation_registry", "proof_quarantine_registry", "proof_registry", "proof_registry_duplicate_archive"].sort())
const RUNTIME_GOVERNANCE_TOPOLOGY = Object.freeze(["external_authority_registry", "recursive_governance_registry", "runtime_governance_lock_registry", "runtime_sovereignty_registry", REQUIRE_PREO_LINEAGE, RECURSIVE_GOVERNANCE_ADMISSION_ROUTE, RECURSIVE_GOVERNANCE_ROUTE].sort())
const CANONICAL_EXECUTION_AUTHORITY_SURFACE = Object.freeze(["authority:create", "compile:aeo", "validate:exact-object", "execute:governed-deploy", "proof:persist-consume"].sort())
const CANONICAL_MIGRATION_CHAIN = Object.freeze([
  "0001_init.sql", "0002_governed_deploy_schema.sql", "0003_authority_registry_schema_fix.sql", "0004_enforcement_lock.sql", "0004_execution_replay_protection.sql", "0005_invocation_registry.sql", "0006_enforcement_reboot_v1.sql", "0007_canonical_aeo_registry_rebuild.sql", "0008_canonical_runtime_registry_rebuild.sql", "0009_runtime_observability_and_drift_registry.sql", "0010_identity_session_continuity.sql", "0011_proof_atomicity_unique_guard.sql", "0012_continuity_registry.sql", "0013_preo_registry.sql", "0014_deployment_provenance_lineage.sql", "0015_cryptographic_provenance_attestations.sql", "0016_federated_revocation_observability.sql", "0017_federated_trust_topology_observability.sql", "0018_distributed_legitimacy_interoperability.sql", "0019_distributed_reconciliation_governance.sql", "0020_governance_compression.sql", "0021_federation_conformance.sql", "0022_proof_quarantine_registry.sql", "0022_recursive_governance_registry.sql", "0023_recursive_governance_enforcement_boundary.sql", "0024_runtime_sovereignty_registry.sql", "0026_external_authority_registry.sql"
].sort())

function canonicalSovereigntyRoutes(): { canonical_routes: readonly string[], observability_routes: readonly string[], governance_routes: readonly string[] } {
  return Object.freeze({
    canonical_routes: Object.freeze([...CANONICAL_RUNTIME_ROUTES].sort()),
    observability_routes: Object.freeze([...NON_EXECUTABLE_OBSERVABILITY_ROUTES].sort()),
    governance_routes: Object.freeze([...GOVERNANCE_EVIDENCE_ROUTES, RECURSIVE_GOVERNANCE_ROUTE, RECURSIVE_GOVERNANCE_ADMISSION_ROUTE, RECURSIVE_GOVERNANCE_SELF_INTEGRITY_ROUTE].sort())
  })
}

function runtimeSovereigntyIdentityMaterial(manifest: Omit<RuntimeSovereigntyManifest, "sovereignty_hash" | "generated_at">): Record<string, unknown> {
  return canonicalRecord(manifest)
}

async function generateRuntimeSovereigntyManifest(generated_at = new Date().toISOString()): Promise<RuntimeSovereigntyManifest> {
  const routes = canonicalSovereigntyRoutes()
  const validator_surface_hash = await sha256Hex(canonicalize(RUNTIME_VALIDATOR_SURFACE))
  const schema_hash = await sha256Hex(canonicalize(REQUIRED_SCHEMA_COLUMNS))
  const migration_chain_hash = await sha256Hex(canonicalize(CANONICAL_MIGRATION_CHAIN))
  const replay_topology_hash = await sha256Hex(canonicalize(RUNTIME_REPLAY_TOPOLOGY))
  const proof_topology_hash = await sha256Hex(canonicalize(RUNTIME_PROOF_TOPOLOGY))
  const governance_registry_hash = await sha256Hex(canonicalize(RUNTIME_GOVERNANCE_TOPOLOGY))
  const runtime_surface_hash = await sha256Hex(canonicalize({ routes, execution_authority_surface: CANONICAL_EXECUTION_AUTHORITY_SURFACE }))
  const identity = {
    runtime_id: RUNTIME_ID,
    runtime_version: RUNTIME_VERSION,
    canonical_routes: routes.canonical_routes,
    observability_routes: routes.observability_routes,
    governance_routes: routes.governance_routes,
    validator_surface_hash,
    schema_hash,
    migration_chain_hash,
    replay_topology_hash,
    proof_topology_hash,
    governance_registry_hash,
    runtime_surface_hash
  }
  const sovereignty_hash = await sha256Hex(canonicalize(runtimeSovereigntyIdentityMaterial(identity)))
  return Object.freeze({ ...identity, sovereignty_hash, generated_at })
}

function runtimeSovereigntyRegistryRow(manifest: RuntimeSovereigntyManifest) {
  return Object.freeze({
    sovereignty_id: manifest.sovereignty_hash,
    sovereignty_hash: manifest.sovereignty_hash,
    runtime_surface_hash: manifest.runtime_surface_hash,
    governance_surface_hash: manifest.governance_registry_hash,
    replay_surface_hash: manifest.replay_topology_hash,
    proof_surface_hash: manifest.proof_topology_hash,
    validator_surface_hash: manifest.validator_surface_hash,
    schema_hash: manifest.schema_hash,
    migration_chain_hash: manifest.migration_chain_hash,
    generated_at: manifest.generated_at
  })
}

async function appendRuntimeSovereigntyCheckpoint(env: Env, manifest: RuntimeSovereigntyManifest) {
  const row = runtimeSovereigntyRegistryRow(manifest)
  await env.DB.prepare(`INSERT OR IGNORE INTO runtime_sovereignty_registry (sovereignty_id,sovereignty_hash,runtime_surface_hash,governance_surface_hash,replay_surface_hash,proof_surface_hash,validator_surface_hash,schema_hash,migration_chain_hash,generated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`)
    .bind(row.sovereignty_id, row.sovereignty_hash, row.runtime_surface_hash, row.governance_surface_hash, row.replay_surface_hash, row.proof_surface_hash, row.validator_surface_hash, row.schema_hash, row.migration_chain_hash, row.generated_at)
    .run()
}

function classifyRuntimeSovereigntyDrift(expected: RuntimeSovereigntyManifest, actual: RuntimeSovereigntyManifest): RuntimeSovereigntyDriftClass[] {
  const drift = new Set<RuntimeSovereigntyDriftClass>()
  if (canonicalize(expected.canonical_routes) !== canonicalize(actual.canonical_routes)) drift.add("route_mutation")
  if (canonicalize(expected.observability_routes) !== canonicalize(actual.observability_routes)) drift.add("observability_route_mutation")
  if (canonicalize(expected.governance_routes) !== canonicalize(actual.governance_routes)) drift.add("governance_topology_mutation")
  if (expected.validator_surface_hash !== actual.validator_surface_hash) drift.add("validator_mutation")
  if (expected.schema_hash !== actual.schema_hash || expected.migration_chain_hash !== actual.migration_chain_hash) drift.add("schema_mutation")
  if (expected.replay_topology_hash !== actual.replay_topology_hash) drift.add("replay_topology_mutation")
  if (expected.proof_topology_hash !== actual.proof_topology_hash) drift.add("proof_topology_mutation")
  if (expected.governance_registry_hash !== actual.governance_registry_hash) drift.add("governance_topology_mutation")
  if (expected.runtime_surface_hash !== actual.runtime_surface_hash) drift.add("runtime_surface_instability")
  const routeUniverse = new Set([...actual.canonical_routes, ...actual.observability_routes, ...actual.governance_routes])
  for (const route of actual.canonical_routes) if (!routeUniverse.has(route)) drift.add("hidden_executable_surface_introduction")
  if (!CANONICAL_EXECUTION_AUTHORITY_SURFACE.every((surface) => ["authority:create", "compile:aeo", "validate:exact-object", "execute:governed-deploy", "proof:persist-consume"].includes(surface))) drift.add("authority_inheritance_expansion")
  return Array.from(drift).sort()
}

async function freezeRuntimeSovereignty(env: Env, generated_at = new Date().toISOString()): Promise<RuntimeSovereigntyManifest> {
  const manifest = await generateRuntimeSovereigntyManifest(generated_at)
  const frozen = RUNTIME_SOVEREIGNTY_FREEZES.get(env.DB)
  if (frozen) {
    const drift = classifyRuntimeSovereigntyDrift(frozen, manifest)
    if (drift.length > 0) throw new RuntimeSovereigntyViolationError(drift, frozen.sovereignty_hash, manifest.sovereignty_hash)
    return frozen
  }
  RUNTIME_SOVEREIGNTY_FREEZES.set(env.DB, manifest)
  await appendRuntimeSovereigntyCheckpoint(env, manifest)
  return manifest
}

async function assertRuntimeSovereigntyCanonical(env: Env): Promise<RuntimeSovereigntyDrift> {
  const expected = RUNTIME_SOVEREIGNTY_FREEZES.get(env.DB) || await freezeRuntimeSovereignty(env)
  const actual = await generateRuntimeSovereigntyManifest(expected.generated_at)
  const drift_classes = classifyRuntimeSovereigntyDrift(expected, actual)
  if (drift_classes.length > 0) return Object.freeze({ status: "RUNTIME_SOVEREIGNTY_VIOLATION", drift_classes, expected_sovereignty_hash: expected.sovereignty_hash, actual_sovereignty_hash: actual.sovereignty_hash })
  return Object.freeze({ status: "CANONICAL", drift_classes, expected_sovereignty_hash: expected.sovereignty_hash, actual_sovereignty_hash: actual.sovereignty_hash })
}

class RuntimeSovereigntyViolationError extends Error {
  constructor(readonly drift_classes: RuntimeSovereigntyDriftClass[], readonly expected_sovereignty_hash: string, readonly actual_sovereignty_hash: string) {
    super("RUNTIME_SOVEREIGNTY_VIOLATION")
  }
}

const ALLOWED_EXTERNAL_INFRASTRUCTURE_FUNCTIONS = Object.freeze(["host", "observe", "schedule", "transport"].sort()) as readonly ("host" | "transport" | "observe" | "schedule")[]
const PROHIBITED_EXTERNAL_AUTHORITY_FUNCTIONS = Object.freeze(["bypass_validation", "consume_replay_state", "create_authority", "inherit_execution_legitimacy", "mutate_legitimacy"].sort()) as readonly ("create_authority" | "bypass_validation" | "mutate_legitimacy" | "consume_replay_state" | "inherit_execution_legitimacy")[]

const EXTERNAL_AUTHORITY_BASELINES = Object.freeze([
  Object.freeze({ external_authority_surface: "cloudflare_worker_runtime", authority_origin: "cloudflare_workers", infrastructure_scope: "host:runtime_http;observe:request_boundary", sovereignty_classification: "BOUNDED_HOST" as const, allowed: ["host", "observe"] as const }),
  Object.freeze({ external_authority_surface: "cloudflare_d1_registry", authority_origin: "cloudflare_d1", infrastructure_scope: "host:append_only_registries;observe:proof_persistence", sovereignty_classification: "BOUNDED_HOST" as const, allowed: ["host", "observe"] as const }),
  Object.freeze({ external_authority_surface: "github_actions_governed_deploy", authority_origin: "github_actions", infrastructure_scope: "schedule:governed-deploy.yml;transport:runtime_execute_and_proof_calls;observe:workflow_run", sovereignty_classification: "CONTAINED_DEPLOY_ENVELOPE" as const, allowed: ["schedule", "transport", "observe"] as const }),
  Object.freeze({ external_authority_surface: "github_hosted_runner", authority_origin: "github_actions", infrastructure_scope: "host:ephemeral_runner;schedule:workflow_jobs;observe:logs", sovereignty_classification: "BOUNDED_SCHEDULER" as const, allowed: ["host", "schedule", "observe"] as const }),
  Object.freeze({ external_authority_surface: "github_secrets_transport", authority_origin: "github_actions", infrastructure_scope: "transport:api_key_and_provenance_secret;observe:masked_logs", sovereignty_classification: "BOUNDED_TRANSPORT" as const, allowed: ["transport", "observe"] as const }),
  Object.freeze({ external_authority_surface: "wrangler_deploy_cli", authority_origin: "cloudflare_wrangler", infrastructure_scope: "transport:deployment_artifact_only;contained_by:governed-deploy.yml", sovereignty_classification: "CONTAINED_DEPLOY_ENVELOPE" as const, allowed: ["transport", "observe"] as const }),
  Object.freeze({ external_authority_surface: "npm_dependency_graph", authority_origin: "npm_registry", infrastructure_scope: "host:package_install_inputs;observe:lockfile_resolution", sovereignty_classification: "BOUNDED_HOST" as const, allowed: ["host", "observe"] as const }),
  Object.freeze({ external_authority_surface: "docker_base_image", authority_origin: "container_registry", infrastructure_scope: "host:build_base_layers;observe:image_digest", sovereignty_classification: "BOUNDED_HOST" as const, allowed: ["host", "observe"] as const })
].sort((a, b) => a.external_authority_surface.localeCompare(b.external_authority_surface)))

async function bootstrapTrustHash(authority_origin: string, infrastructure_scope: string, external_authority_surface: string): Promise<string> {
  return sha256Hex(canonicalize({ authority_origin, external_authority_surface, infrastructure_scope, local_validation_supremacy: true, replay_neutral: true }))
}

async function buildExternalAuthorityDependency(base: typeof EXTERNAL_AUTHORITY_BASELINES[number]): Promise<ExternalAuthoritySovereigntyDependency> {
  const bootstrap_trust_hash = await bootstrapTrustHash(base.authority_origin, base.infrastructure_scope, base.external_authority_surface)
  const sovereignty_dependency_id = `sovereignty-dependency:${await sha256Hex(canonicalize({ external_authority_surface: base.external_authority_surface, bootstrap_trust_hash }))}`
  const trust_material_hash = await sha256Hex(canonicalize({ allowed: [...base.allowed].sort(), prohibited: PROHIBITED_EXTERNAL_AUTHORITY_FUNCTIONS, canonical_runtime_path: CANONICAL_RUNTIME_ROUTES }))
  return Object.freeze({
    sovereignty_dependency_id,
    external_authority_surface: base.external_authority_surface,
    authority_origin: base.authority_origin,
    infrastructure_scope: base.infrastructure_scope,
    bootstrap_trust_hash,
    sovereignty_classification: base.sovereignty_classification,
    containment_state: "CLASSIFIED_BOUNDED_OBSERVABLE_REPLAY_NEUTRAL",
    observability_only: true,
    replay_neutral: true,
    allowed_infrastructure_functions: Object.freeze([...base.allowed].sort()) as ExternalAuthoritySovereigntyDependency["allowed_infrastructure_functions"],
    prohibited_authority_functions: PROHIBITED_EXTERNAL_AUTHORITY_FUNCTIONS,
    deploy_authority_containment_envelope: Object.freeze({ canonical_runtime_path: CANONICAL_RUNTIME_ROUTES, governed_workflow: GOVERNED_WORKFLOW, local_validation_supremacy: true, exact_object_required: true, remote_authority_inherited: false, direct_deploy_allowed: false }),
    bootstrap_trust_evidence: Object.freeze({ evidence_type: "bootstrap_trust_evidence", authority_origin: base.authority_origin, infrastructure_scope: base.infrastructure_scope, trust_material_hash, replay_neutral: true, observability_only: true })
  })
}

async function canonicalExternalAuthorityRegistry(): Promise<ExternalAuthoritySovereigntyDependency[]> {
  return Promise.all(EXTERNAL_AUTHORITY_BASELINES.map(buildExternalAuthorityDependency))
}

async function classifyExternalAuthorityDrift(dependency: any, expected?: ExternalAuthoritySovereigntyDependency): Promise<RuntimeSovereigntyDriftClass[]> {
  const drift = new Set<RuntimeSovereigntyDriftClass>()
  const observedSurface = String(dependency?.external_authority_surface || "")
  const observedOrigin = String(dependency?.authority_origin || "")
  const observedScope = String(dependency?.infrastructure_scope || "")
  if (!expected) drift.add("undeclared_execution_surface")
  if (!observedSurface || !observedOrigin || !observedScope) drift.add("external_authority_drift")
  if (dependency?.observability_only !== true || dependency?.replay_neutral !== true || dependency?.sovereignty_classification === "NULL" || dependency?.containment_state === "DRIFT_BLOCKED") drift.add("external_authority_drift")
  if (dependency?.replay_neutral === false || dependency?.consume_replay_state === true || dependency?.replay_consumed === true || dependency?.replay_state_consumed === true) drift.add("external_authority_drift")
  if (dependency?.creates_authority === true || dependency?.create_authority === true || dependency?.bypass_validation === true || dependency?.mutate_legitimacy === true || dependency?.inherit_execution_legitimacy === true || dependency?.remote_execution_legitimacy === true || dependency?.remote_authority_inherited === true) drift.add("infrastructure_authority_expansion")
  if (dependency?.direct_deploy_allowed === true || dependency?.deploy_capable === true || String(dependency?.route || dependency?.command || "").includes("wrangler deploy")) drift.add("deploy_authority_escape")
  if (dependency?.mutation_capable === true || dependency?.hidden_mutation === true || String(dependency?.infrastructure_scope || "").includes("mutate:")) drift.add("hidden_mutation_surface")
  if (observedScope.includes("*") || observedScope.includes("global") || observedScope.includes("federation_authority") || observedScope.includes("remote_authority")) drift.add("sovereignty_boundary_fragmentation")
  if (expected) {
    if (observedOrigin !== expected.authority_origin || observedScope !== expected.infrastructure_scope) drift.add("bootstrap_trust_divergence")
    const expectedHash = await bootstrapTrustHash(expected.authority_origin, expected.infrastructure_scope, expected.external_authority_surface)
    if (String(dependency?.bootstrap_trust_hash || "") !== expectedHash) drift.add("bootstrap_trust_divergence")
  }
  return Array.from(drift).sort()
}

async function externalAuthorityObservationFromUrl(url: URL): Promise<ExternalAuthoritySovereigntyDependency> {
  const registry = await canonicalExternalAuthorityRegistry()
  const surface = url.searchParams.get("surface") || "github_actions_governed_deploy"
  const expected = registry.find((item) => item.external_authority_surface === surface) || registry.find((item) => item.external_authority_surface === "github_actions_governed_deploy")!
  const observed = {
    ...expected,
    external_authority_surface: surface,
    authority_origin: url.searchParams.get("authority_origin") || expected.authority_origin,
    infrastructure_scope: url.searchParams.get("infrastructure_scope") || expected.infrastructure_scope,
    bootstrap_trust_hash: url.searchParams.get("bootstrap_trust_hash") || expected.bootstrap_trust_hash,
    observability_only: url.searchParams.get("observability_only") === "false" ? false : true,
    replay_neutral: url.searchParams.get("replay_neutral") === "false" ? false : true,
    creates_authority: url.searchParams.get("creates_authority") === "true",
    bypass_validation: url.searchParams.get("bypass_validation") === "true",
    mutate_legitimacy: url.searchParams.get("mutate_legitimacy") === "true",
    consume_replay_state: url.searchParams.get("consume_replay_state") === "true",
    inherit_execution_legitimacy: url.searchParams.get("inherit_execution_legitimacy") === "true",
    direct_deploy_allowed: url.searchParams.get("direct_deploy_allowed") === "true",
    deploy_capable: url.searchParams.get("deploy_capable") === "true",
    mutation_capable: url.searchParams.get("mutation_capable") === "true",
    hidden_mutation: url.searchParams.get("hidden_mutation") === "true",
    command: url.searchParams.get("command") || ""
  }
  const drift = await classifyExternalAuthorityDrift(observed, registry.find((item) => item.external_authority_surface === surface))
  if (drift.length === 0) return expected
  const driftHash = await sha256Hex(canonicalize({ surface, authority_origin: observed.authority_origin, infrastructure_scope: observed.infrastructure_scope, bootstrap_trust_hash: observed.bootstrap_trust_hash, drift }))
  return Object.freeze({ ...expected, sovereignty_dependency_id: `sovereignty-dependency:${driftHash}`, external_authority_surface: surface, authority_origin: observed.authority_origin, infrastructure_scope: observed.infrastructure_scope, bootstrap_trust_hash: String(observed.bootstrap_trust_hash), sovereignty_classification: "NULL", containment_state: "DRIFT_BLOCKED", observability_only: true, replay_neutral: true })
}

async function appendExternalAuthorityObservation(env: Env, dependency: ExternalAuthoritySovereigntyDependency, drift_classes: RuntimeSovereigntyDriftClass[], created_at = new Date().toISOString()) {
  const evidence_hash = await sha256Hex(canonicalize({ dependency, drift_classes }))
  await env.DB.prepare(`INSERT OR IGNORE INTO external_authority_registry (sovereignty_dependency_id,external_authority_surface,authority_origin,infrastructure_scope,bootstrap_trust_hash,sovereignty_classification,containment_state,observability_only,replay_neutral,evidence_hash,drift_classes,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'true','true',?8,?9,?10)`)
    .bind(dependency.sovereignty_dependency_id, dependency.external_authority_surface, dependency.authority_origin, dependency.infrastructure_scope, dependency.bootstrap_trust_hash, dependency.sovereignty_classification, dependency.containment_state, evidence_hash, canonicalize(drift_classes), created_at)
    .run()
  return evidence_hash
}

async function issueRuntimeGovernanceLock(env: Env, proof: RecursiveGovernanceProof, envelope: GovernanceMutationEnvelope, created_at: string): Promise<RuntimeGovernanceLock> {
  const canonical_hash = await deriveRecursiveGovernanceHash({ mutation_hash: envelope.mutation_hash, governance_id: proof.governance_id, target_surface: envelope.target_surface, canonical_path: envelope.canonical_execution_path })
  const lock_id = await deriveRecursiveGovernanceHash({ lock: "runtime_governance_lock", canonical_hash })
  const lock = Object.freeze({ lock_id, mutation_hash: envelope.mutation_hash, governance_id: proof.governance_id, lock_state: "LOCKED" as const, activation_allowed: true, canonical_hash, created_at })
  await env.DB.prepare(`INSERT INTO runtime_governance_lock_registry (lock_id,mutation_hash,governance_id,lock_state,activation_allowed,canonical_hash,created_at) VALUES (?1,?2,?3,'LOCKED','true',?4,?5)`)
    .bind(lock.lock_id, lock.mutation_hash, lock.governance_id, lock.canonical_hash, created_at)
    .run()
  return lock
}

async function consumeRecursiveGovernanceReplay(env: Env, proof: RecursiveGovernanceProof, lock: RuntimeGovernanceLock, created_at: string) {
  const replay_id = await deriveRecursiveGovernanceHash({ replay: "recursive_governance", mutation_hash: proof.mutation_hash, sco_hash: proof.sco_hash, preo_hash: proof.preo_hash })
  await env.DB.prepare(`INSERT INTO recursive_governance_replay_registry (replay_id,mutation_hash,sco_hash,preo_hash,governance_id,activation_lock_id,consumed_at) VALUES (?1,?2,?3,?4,?5,?6,?7)`)
    .bind(replay_id, proof.mutation_hash, proof.sco_hash, proof.preo_hash, proof.governance_id, lock.lock_id, created_at)
    .run()
}

async function enforceRecursiveGovernanceBoundary(env: Env, envelope: GovernanceMutationEnvelope, created_at: string): Promise<RecursiveGovernanceAdmission> {
  const drift_classes = detectRecursiveGovernanceDrift(envelope)
  const decision = verifyRecursiveGovernanceIntegrity(envelope, drift_classes)
  const proof = await buildRecursiveGovernanceProof(envelope, decision)
  await appendRecursiveGovernanceEvidence(env, proof, envelope, decision, created_at)
  if (decision.governance_decision !== "GOVERNANCE_VALIDATED" || !decision.mutation_authorized) {
    return Object.freeze({ status: "NULL" as const, envelope, decision, proof, lock: null, replay_blocked: false })
  }
  try {
    const lock = await issueRuntimeGovernanceLock(env, proof, envelope, created_at)
    await consumeRecursiveGovernanceReplay(env, proof, lock, created_at)
    return Object.freeze({ status: "GOVERNANCE_VALIDATED" as const, envelope, decision, proof, lock, replay_blocked: false })
  } catch {
    return Object.freeze({ status: "NULL" as const, envelope, decision: Object.freeze({ ...decision, governance_decision: "NULL" as const, mutation_authorized: false }), proof, lock: null, replay_blocked: true })
  }
}

function buildRecursiveGovernanceEnvelopeFromRecord(input: Record<string, unknown>): GovernanceMutationEnvelope {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }
  return buildRecursiveGovernanceEnvelope(new URL(`https://runtime.local${RECURSIVE_GOVERNANCE_ROUTE}?${params.toString()}`))
}

async function appendFederatedTrustObservation(env: Env, result: FederationVerificationResult, created_at: string) {
  await env.DB.prepare(`INSERT INTO federated_trust_registry (trust_envelope_id,federation_origin,federation_tier,verification_status,evidence_only,remote_authority_denied,continuity_reference,lineage_root,observed_at,canonical_hash,created_at) VALUES (?1,?2,?3,?4,'true','true',?5,?6,?7,?8,?9)`)
    .bind(await deterministicReconciliationId("federated_trust_observation", { canonical_hash: result.canonical_hash, created_at }), result.envelope.federation_origin, result.envelope.federation_tier, result.envelope.verification_status, result.envelope.continuity_reference, result.envelope.lineage_root, result.envelope.observed_at, result.canonical_hash, created_at)
    .run()
}

async function appendRevocationTopologyObservation(env: Env, topology: RevocationTopology, created_at: string) {
  const topology_hash = await sha256Hex(canonicalize(topology))
  await env.DB.prepare(`INSERT INTO revocation_topology_registry (topology_id,authority_id,continuity_id,lineage_root,topology_hash,drift_summary,observed_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`)
    .bind(await deterministicReconciliationId("revocation_topology_observation", { topology_id: topology.topology_id, topology_hash, created_at }), topology.authority_id || null, topology.continuity_id || null, topology.lineage_root, topology_hash, canonicalize(topology.drift_classifications), created_at, created_at)
    .run()
}

async function appendFederatedReconciliationObservation(env: Env, envelope: FederatedReconciliationEnvelope) {
  await env.DB.prepare(`INSERT INTO federated_reconciliation_registry (reconciliation_id,checkpoint_hash,canonical_hash,lineage_root,continuity_root,federation_classification,drift_summary,replay_indicators,topology_hash,generated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`)
    .bind(envelope.reconciliation_id, envelope.checkpoint_hash, envelope.canonical_hash, envelope.lineage_root, envelope.continuity_root, canonicalize(envelope.federation_classification), canonicalize(envelope.drift_summary), canonicalize(envelope.replay_indicators), envelope.topology_hash, envelope.generated_at)
    .run()
}



async function appendFederatedSovereigntyConsensusObservation(env: Env, envelope: FederatedSovereigntyEnvelope, verification: SovereigntyEquivalenceVerification) {
  await env.DB.prepare(`INSERT INTO federated_sovereignty_registry (federation_id,local_runtime_id,remote_runtime_id,sovereignty_hash,equivalence_hash,drift_summary,replay_indicators,verification_status,evidence_only,remote_authority_denied,generated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'true','true',?9)`)
    .bind(await deterministicReconciliationId("federated_sovereignty_consensus", { sovereignty_hash: envelope.sovereignty_hash, equivalence_hash: verification.equivalence_hash, remote_runtime_id: verification.remote_runtime_id, generated_at: envelope.generated_at }), verification.local_runtime_id, verification.remote_runtime_id, envelope.sovereignty_hash, verification.equivalence_hash, canonicalize(verification.drift_summary), canonicalize(verification.replay_indicators), verification.verification_status, envelope.generated_at)
    .run()
}

async function appendFederationConformanceObservation(env: Env, envelope: FederationCompatibilityEnvelope) {
  await env.DB.prepare(`INSERT OR IGNORE INTO federation_conformance_registry (conformance_id,envelope_id,runtime_id,remote_runtime_id,fingerprint_hash,checkpoint_hash,compatibility_hash,conformance_status,drift_classes,evidence_only,remote_authority_denied,read_only,mutation_capable,replay_neutral,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'true','true','true','false','true',?10,?11)`)
    .bind(await deterministicReconciliationId("federation_conformance_observation", { envelope_id: envelope.envelope_id, compatibility_hash: envelope.compatibility_hash }), envelope.envelope_id, envelope.runtime_id, envelope.remote_runtime_id, envelope.runtime_semantic_fingerprint.fingerprint_hash, envelope.conformance_checkpoint.checkpoint_hash, envelope.compatibility_hash, envelope.conformance_result.conformance_status, canonicalize(envelope.conformance_result.drift_classes), envelope.generated_at, envelope.generated_at)
    .run()
}

async function appendGovernanceCompressionObservation(env: Env, envelope: GovernanceCompressionEnvelope) {
  await env.DB.prepare(`INSERT INTO governance_compression_registry (compression_id,reconciliation_root,checkpoint_set_hash,topology_root,lineage_root,federation_classification,compressed_drift_summary,compressed_replay_summary,participating_runtimes,canonical_hash,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`)
    .bind(envelope.compression_id, envelope.reconciliation_root, envelope.checkpoint_set_hash, envelope.topology_root, envelope.lineage_root, canonicalize(envelope.federation_classification), canonicalize(envelope.compressed_drift_summary), canonicalize(envelope.compressed_replay_summary), canonicalize(envelope.participating_runtimes), envelope.canonical_hash, envelope.generated_at, envelope.generated_at)
    .run()
}

async function rejectWithTelemetry(env: Env, response: Record<string, unknown>, telemetry: {
  event_type?: TelemetryEventType
  decision_id?: string
  authority_id?: string
  execution_id?: string
  proof_id?: string
  severity?: string
  payload?: Record<string, unknown>
  drift_class?: DriftClass
  detected_by?: string
}) {
  const payload = { reason: response.reason, result: response.result, status: response.status, ...(telemetry.payload || {}) }
  if (telemetry.event_type) {
    await emitTelemetry(env, { ...telemetry, event_type: telemetry.event_type, payload })
  }
  if (telemetry.drift_class) {
    await recordDrift(env, { drift_class: telemetry.drift_class, severity: telemetry.severity, decision_id: telemetry.decision_id, execution_id: telemetry.execution_id, payload, detected_by: telemetry.detected_by })
  }
  return json(response)
}

async function hasColumn(env: Env, table: string, column: string): Promise<boolean> {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all<any>()
  const rows = Array.isArray(info?.results) ? info.results : []
  return rows.some((row: any) => String(row?.name) === column)
}

function isExpired(expires_at: string, nowMs = Date.now()): boolean {
  const expiresMs = Date.parse(expires_at)
  return !Number.isFinite(expiresMs) || expiresMs <= nowMs
}

async function activeSession(env: Env, session_id: string): Promise<any | null> {
  if (!session_id) return null
  const session = await env.DB.prepare(`SELECT * FROM session_registry WHERE session_id=?1`).bind(session_id).first<any>()
  if (!session) return null
  if (String(session.continuity_status || "") !== "ACTIVE") return null
  if (isExpired(String(session.expires_at || ""))) {
    await env.DB.prepare(`UPDATE session_registry SET continuity_status='EXPIRED' WHERE session_id=?1 AND continuity_status='ACTIVE'`).bind(session_id).run()
    await cascadeSessionRevocation(env, session_id)
    return null
  }
  return session
}

function preoGovernanceEnabled(constraints: Record<string, unknown>, target: Record<string, unknown>): boolean {
  if (String(target.workflow || "") !== GOVERNED_WORKFLOW) return false
  const governance = isPlainRecord(constraints.governance) ? constraints.governance : {}
  const preo = isPlainRecord(constraints.preo) ? constraints.preo : {}
  return constraints.require_preo_lineage === true || governance.require_preo_lineage === true || preo.required === true || preo.require_lineage === true
}

async function ensurePreoSchema(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS preo_registry (
    preo_id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL,
    authority_id TEXT NOT NULL,
    continuity_id TEXT NOT NULL,
    reviewed_hash TEXT NOT NULL,
    reviewed_tree_hash TEXT,
    merge_commit_sha TEXT,
    canonical_preo TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(decision_id, reviewed_hash)
  )`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_preo_registry_decision_hash ON preo_registry (decision_id, reviewed_hash)`).run()
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_preo_registry_lineage_unique ON preo_registry(decision_id, reviewed_hash, reviewed_tree_hash, merge_commit_sha)`).run()
}

async function preoTableExists(env: Env): Promise<boolean> {
  const table = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='preo_registry'`).first<any>()
  return Boolean(table)
}

async function validatePreoLineage(env: Env, params: { decision_id: string, validated_object_hash: string, authority: any, required: boolean }): Promise<"OK" | "missing_preo" | "preo_hash_mismatch"> {
  const result = await deploymentPreoLineage(env, params.decision_id, params.validated_object_hash, params.authority, params.required)
  return result.status
}

async function deploymentPreoLineage(env: Env, decision_id: string, validated_object_hash: string, authority: any, required = true): Promise<{ status: "OK" | "missing_preo" | "preo_hash_mismatch", preo?: any, canonical_preo?: any }> {
  if (!(await preoTableExists(env))) {
    if (required) {
      await ensurePreoSchema(env)
      return { status: "missing_preo" }
    }
    return { status: "OK" }
  }

  const rows = await env.DB.prepare(`SELECT * FROM preo_registry WHERE decision_id=?1 AND status='PREO_VALID' ORDER BY created_at ASC, preo_id ASC`).bind(decision_id).all<any>()
  const preos = Array.isArray(rows?.results) ? rows.results : []
  if (preos.length === 0) return { status: required ? "missing_preo" : "OK" }

  const matching = preos.find((preo: any) => String(preo.reviewed_hash || "") === validated_object_hash)
  if (!matching) return { status: "preo_hash_mismatch" }
  if (String(matching.authority_id || "") !== String(authority.authority_id || "")) return { status: "preo_hash_mismatch" }
  if (String(matching.continuity_id || "") !== String(authority.continuity_id || "")) return { status: "preo_hash_mismatch" }

  let canonicalPreo: unknown
  try { canonicalPreo = JSON.parse(String(matching.canonical_preo || "{}")) } catch { canonicalPreo = null }
  if (!isPlainRecord(canonicalPreo) || String((canonicalPreo as any).reviewed_hash || "") !== validated_object_hash) return { status: "preo_hash_mismatch" }
  if (String((canonicalPreo as any).reviewed_tree_hash || "") !== String(matching.reviewed_tree_hash || "")) return { status: "preo_hash_mismatch" }
  if (String((canonicalPreo as any).merge_commit_sha || "") !== String(matching.merge_commit_sha || "")) return { status: "preo_hash_mismatch" }
  return { status: "OK", preo: matching, canonical_preo: canonicalPreo }
}

async function validateDeploymentProvenance(env: Env, params: {
  route: string
  decision_id: string
  validated_object_hash: string
  authority: any
  compiledCanonicalAeo: CanonicalAEO
  provenance: DeploymentProvenance
  execution?: any
}): Promise<{ ok: true, preo: any | null, canonical_preo: any | null } | { ok: false, reason: string, drift_class: DriftClass, payload: Record<string, unknown> }> {
  const missing = missingDeploymentProvenance(params.provenance)
  if (missing.length > 0) return { ok: false, reason: "workflow_provenance_missing", drift_class: "provenance_drift", payload: { route: params.route, missing_provenance: missing, indicator: "workflow_provenance_missing" } }

  const target = canonicalDeployTarget(params.compiledCanonicalAeo.target)
  if (params.provenance.repository !== target.repo || params.provenance.branch !== target.branch) {
    return { ok: false, reason: "branch_lineage_mismatch", drift_class: "branch_lineage_drift", payload: { route: params.route, expected_repository: target.repo, provided_repository: params.provenance.repository, expected_branch: target.branch, provided_branch: params.provenance.branch, indicator: "branch_lineage_mismatch" } }
  }

  let authorityConstraints: Record<string, unknown> = {}
  try { authorityConstraints = canonicalRecord(JSON.parse(String(params.authority.constraints || "{}"))) } catch { authorityConstraints = {} }
  const requirePreoLineage = preoGovernanceEnabled(authorityConstraints, target)
  const preoLineage = await deploymentPreoLineage(env, params.decision_id, params.validated_object_hash, params.authority, requirePreoLineage)
  if (preoLineage.status !== "OK") {
    return { ok: false, reason: preoLineage.status, drift_class: "provenance_drift", payload: { route: params.route, policy: REQUIRE_PREO_LINEAGE, required: requirePreoLineage, indicator: preoLineage.status } }
  }
  if (!requirePreoLineage) {
    if (params.execution) {
      for (const key of Object.keys(params.provenance) as Array<keyof DeploymentProvenance>) {
        if (String(params.execution[key] || "") !== params.provenance[key]) {
          return { ok: false, reason: "provenance_drift", drift_class: "provenance_drift", payload: { route: params.route, field: key, expected: String(params.execution[key] || ""), provided: params.provenance[key], indicator: "execution_proof_provenance_mismatch" } }
        }
      }
    }
    return { ok: true, preo: null, canonical_preo: null }
  }
  if (!preoLineage.preo || !preoLineage.canonical_preo) {
    return { ok: false, reason: "missing_preo", drift_class: "provenance_drift", payload: { route: params.route, policy: REQUIRE_PREO_LINEAGE, required: true, indicator: "missing_preo" } }
  }

  const canonicalPreo = preoLineage.canonical_preo as any
  const reviewedTreeHash = String(preoLineage.preo.reviewed_tree_hash || "")
  const mergeCommitSha = String(preoLineage.preo.merge_commit_sha || "")
  if (!reviewedTreeHash || !mergeCommitSha) return { ok: false, reason: "reviewed_provenance_missing", drift_class: "provenance_drift", payload: { route: params.route, indicator: "reviewed_provenance_missing" } }
  if (params.provenance.source_tree_hash !== reviewedTreeHash || String(canonicalPreo.reviewed_tree_hash || "") !== reviewedTreeHash) {
    return { ok: false, reason: "reviewed_tree_mismatch", drift_class: "workflow_source_drift", payload: { route: params.route, expected_source_tree_hash: reviewedTreeHash, provided_source_tree_hash: params.provenance.source_tree_hash, indicator: "reviewed_tree_mismatch" } }
  }
  if (params.provenance.merge_commit_sha !== mergeCommitSha) {
    return { ok: false, reason: "merge_sha_mismatch", drift_class: "provenance_drift", payload: { route: params.route, expected_merge_commit_sha: mergeCommitSha, provided_merge_commit_sha: params.provenance.merge_commit_sha, indicator: "merge_sha_mismatch" } }
  }
  if (params.provenance.workflow_sha !== mergeCommitSha) {
    return { ok: false, reason: "workflow_sha_mismatch", drift_class: "workflow_source_drift", payload: { route: params.route, expected_workflow_sha: mergeCommitSha, provided_workflow_sha: params.provenance.workflow_sha, indicator: "workflow_source_mismatch" } }
  }
  if (String(canonicalPreo.pull_request_id || "") && params.provenance.pull_request_id !== String(canonicalPreo.pull_request_id || "")) {
    return { ok: false, reason: "pull_request_lineage_mismatch", drift_class: "branch_lineage_drift", payload: { route: params.route, expected_pull_request_id: String(canonicalPreo.pull_request_id || ""), provided_pull_request_id: params.provenance.pull_request_id, indicator: "pull_request_lineage_mismatch" } }
  }
  if (params.execution) {
    for (const key of Object.keys(params.provenance) as Array<keyof DeploymentProvenance>) {
      if (String(params.execution[key] || "") !== params.provenance[key]) {
        return { ok: false, reason: "provenance_drift", drift_class: "provenance_drift", payload: { route: params.route, field: key, expected: String(params.execution[key] || ""), provided: params.provenance[key], indicator: "execution_proof_provenance_mismatch" } }
      }
    }
  }
  return { ok: true, preo: preoLineage.preo, canonical_preo: preoLineage.canonical_preo }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const startupIntegrity = await runtimeSelfIntegrityCheckpoint(env.CANONICAL_RUNTIME_SURFACE_HASH || "")
    if (!startupIntegrity.runtime_ready) return json({ status: "NULL", reason: "runtime_self_integrity_mismatch", runtime_ready: false, checkpoint: startupIntegrity }, 503)
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true })
    if (url.pathname === RECURSIVE_GOVERNANCE_SELF_INTEGRITY_ROUTE && request.method === "GET") return json({ status: "GOVERNANCE_VALIDATED", route: RECURSIVE_GOVERNANCE_SELF_INTEGRITY_ROUTE, runtime_ready: true, checkpoint: startupIntegrity, read_only: true, mutation_capable: false, replay_neutral: true })
    if (url.pathname === RECURSIVE_GOVERNANCE_ROUTE && request.method !== "GET") return json({ status: "NULL", route: RECURSIVE_GOVERNANCE_ROUTE, reason: "get_only", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true }, 405)
    if (url.pathname === RECURSIVE_GOVERNANCE_ADMISSION_ROUTE && request.method !== "POST") return json({ status: "NULL", route: RECURSIVE_GOVERNANCE_ADMISSION_ROUTE, reason: "post_only", activation_allowed: false }, 405)
    if (url.pathname === RECURSIVE_GOVERNANCE_ADMISSION_ROUTE && request.method === "POST") {
      if (!authorized(request, env)) return json({ status: "NULL", route: RECURSIVE_GOVERNANCE_ADMISSION_ROUTE, reason: "unauthorized", activation_allowed: false }, 403)
      if (!hasDb(env)) return json({ status: "NULL", route: RECURSIVE_GOVERNANCE_ADMISSION_ROUTE, reason: "database_unavailable", activation_allowed: false }, 500)
      try {
        await ensureSchema(env, { stabilizeProofRegistry: false })
        const generated_at = new Date().toISOString()
        const envelope = buildRecursiveGovernanceEnvelopeFromRecord(canonicalRecord(await body(request)))
        const admission = await enforceRecursiveGovernanceBoundary(env, envelope, generated_at)
        if (admission.status !== "GOVERNANCE_VALIDATED" || !admission.lock?.activation_allowed) {
          return json({ status: "NULL", route: RECURSIVE_GOVERNANCE_ADMISSION_ROUTE, reason: admission.replay_blocked ? "recursive_governance_replay" : "recursive_governance_boundary_denied", activation_allowed: false, admission, runtime_ready: false })
        }
        return json({ status: admission.status, route: RECURSIVE_GOVERNANCE_ADMISSION_ROUTE, reason: "recursive_governance_boundary_enforced", activation_allowed: true, admission, lock: admission.lock, runtime_ready: true })
      } catch {
        return json({ status: "NULL", route: RECURSIVE_GOVERNANCE_ADMISSION_ROUTE, reason: "recursive_governance_admission_unavailable", activation_allowed: false, runtime_ready: false })
      }
    }
    if (url.pathname === RECURSIVE_GOVERNANCE_ROUTE && request.method === "GET") {
      try {
        const generated_at = new Date().toISOString()
        const envelope = buildRecursiveGovernanceEnvelope(url)
        const drift_classes = detectRecursiveGovernanceDrift(envelope)
        const decision = verifyRecursiveGovernanceIntegrity(envelope, drift_classes)
        const proof = await buildRecursiveGovernanceProof(envelope, decision)
        const checkpoint = await buildRecursiveGovernanceCheckpoint(envelope, decision, generated_at)
        if (!hasDb(env)) return json({ status: "NULL", route: RECURSIVE_GOVERNANCE_ROUTE, reason: "database_unavailable", envelope, decision, proof, checkpoint, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, replay_consumed: false, authority_created: false, execution_started: false })
        await appendRecursiveGovernanceEvidence(env, proof, envelope, decision, generated_at)
        return json({ status: decision.governance_decision, route: RECURSIVE_GOVERNANCE_ROUTE, reason: "observability_only", envelope, decision, proof, checkpoint, drift_classes, recursive_governance_invariant: "system_mutation_requires_legitimacy", exact_object_verified: decision.exact_object_verified, canonical_path_preserved: decision.canonical_path_preserved, mutation_authorized: decision.mutation_authorized, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, replay_consumed: false, authority_created: false, execution_started: false, append_only: true })
      } catch {
        return json({ status: "NULL", route: RECURSIVE_GOVERNANCE_ROUTE, reason: "recursive_governance_unavailable", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, replay_consumed: false, authority_created: false, execution_started: false })
      }
    }
    if (url.pathname === "/reconcile" && request.method === "GET") return json({ status: "NULL", route: "/reconcile", reason: "observability_only" })
    if (url.pathname === "/reconcile/schedule" && request.method === "GET") {
      try {
        const schedule = await deterministicReconciliationSchedule(env)
        return json({ ...schedule, route: "/reconcile/schedule", reason: "observability_only" })
      } catch {
        return json({ status: "NULL", route: "/reconcile/schedule", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/reconcile/report" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const summary = await reconciliationSummaryObject(result, new Date().toISOString())
        const portable = await portableReconciliationEnvelope(summary as unknown as Record<string, unknown>)
        return json({ status: result.result, route: "/reconcile/report", reason: "observability_only", report: summary, portable })
      } catch {
        return json({ status: "NULL", route: "/reconcile/report", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/reconcile/drift" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const summary = await reconciliationSummaryObject(result, new Date().toISOString())
        return json({ status: result.result, route: "/reconcile/drift", reason: "observability_only", reconciliation_id: summary.reconciliation_id, drift: result.drift_classifications })
      } catch {
        return json({ status: "NULL", route: "/reconcile/drift", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/federation/reconcile" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const emitted_at = new Date().toISOString()
        const checkpoint = await deterministicReconciliationCheckpoint(result, emitted_at)
        const bundle = await portableLegitimacyBundleFromResult(result, emitted_at)
        const verification = url.searchParams.get("bundle")
          ? await verifyFederatedLegitimacyBundle(JSON.parse(new TextDecoder().decode(base64ToBytes(String(url.searchParams.get("bundle"))) || utf8Bytes("{}"))), anchor, LOCAL_FEDERATION_RUNTIME_ID, env.PROVENANCE_HMAC_SECRET)
          : null
        const witness = await reconciliationWitnessEnvelope(bundle, checkpoint, classifyRemoteRuntime(String(bundle?.runtime_id || LOCAL_FEDERATION_RUNTIME_ID)))
        const drift = await federatedDriftClassificationsAfterPortableBundleResolution(result, bundle)
        return json({ status: reconciliationStatusAfterPortableBundleResolution(result, bundle), route: "/federation/reconcile", reason: "observability_only", authority_boundary: "portable_evidence_not_portable_authority", local_validation_required: true, remote_execution_legitimacy: false, replay_neutral: true, bundle, checkpoint, witness, verification, drift })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/federation/reconcile/report" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const emitted_at = new Date().toISOString()
        const summary = await reconciliationSummaryObject(result, emitted_at)
        const snapshot = await deterministicReconciliationSnapshot(result)
        const bundle = await portableLegitimacyBundleFromResult(result, emitted_at)
        const drift = await federatedDriftClassificationsAfterPortableBundleResolution(result, bundle)
        return json({ status: reconciliationStatusAfterPortableBundleResolution(result, bundle), route: "/federation/reconcile/report", reason: "observability_only", report: summary, deterministic_snapshot: snapshot, portable_legitimacy_bundle: bundle, drift, federation_boundary: "portable_evidence_not_portable_authority" })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile/report", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/federation/reconcile/drift" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const federated_drift_taxonomy: DriftClass[] = ["federated_checkpoint_drift", "federated_merkle_drift", "federated_bundle_drift", "federated_attestation_drift", "federated_reconciliation_drift", "federated_runtime_divergence_drift", "federated_replay_drift", "federated_preo_drift", "federated_continuity_drift", "federated_exact_object_drift", "federated_identifier_resolution_drift"]
        return json({ status: result.result, route: "/federation/reconcile/drift", reason: "observability_only", drift: result.drift_classifications, federated_drift_taxonomy, repairs: false, legitimacy_inference: false })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile/drift", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/federation/reconcile/revocation" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const observed_at = new Date().toISOString()
        const checkpoint = await deterministicReconciliationCheckpoint(result, observed_at)
        const supplied = url.searchParams.get("evidence")
        const evidenceInput = supplied ? JSON.parse(new TextDecoder().decode(base64ToBytes(String(supplied)) || utf8Bytes("{}"))) : null
        const generated = await federatedRevocationEvidenceFromResult(result, checkpoint, observed_at)
        if (!generated) return json({ status: "NULL", route: "/federation/reconcile/revocation", reason: "observability_only", drift_class: "federated_revocation_projection_drift", federation_boundary: "portable_evidence_not_portable_authority", remote_authority_inherited: false, remote_execution_legitimacy: false, replay_state_consumed: false, replay_neutral: true, read_only: true, mutation_capable: false, normalized_federation_response: true })
        const verification = evidenceInput ? await classifyFederatedRevocationEvidence(evidenceInput, resolveCanonicalPortableIdentifiers(result) || anchor, checkpoint) : null
        const drift = verification?.drift_class ? [...result.drift_classifications.map((entry) => entry.drift_class), verification.drift_class] : result.drift_classifications.map((entry) => entry.drift_class)
        const trust = await classifyFederatedTrust({ ...(generated.evidence || {}), verification_status: verification?.result === "NULL" ? (verification.drift_class === "federated_revocation_replay_drift" ? "REPLAY_DETECTED" : "LINEAGE_MISMATCH") : "VERIFIED", drift_class: verification?.drift_class || "" }, observed_at)
        return json({ status: verification?.result === "NULL" ? "NULL" : result.result, route: "/federation/reconcile/revocation", reason: "observability_only", federation_boundary: "portable_evidence_not_portable_authority", remote_authority_inherited: false, remote_execution_legitimacy: false, remote_authority_denied: trust.remote_authority_denied, evidence_only: trust.evidence_only, replay_state_consumed: false, replay_neutral: true, read_only: true, mutation_capable: false, federated_trust_envelope: trust.envelope, revocation_evidence: generated, verification, drift, normalized_federation_response: true })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile/revocation", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/federation/reconcile/topology" && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: "/federation/reconcile/topology", reason: "database_unavailable", remote_authority_denied: true, evidence_only: true })
        await ensureSchema(env, { stabilizeProofRegistry: false })
        const anchor = reconciliationAnchorFromRequest(url)
        const generated_at = new Date().toISOString()
        const topology = await deriveRevocationTopology(env, anchor)
        const trust = await classifyFederatedTrust({ federation_origin: url.searchParams.get("federation_origin") || LOCAL_FEDERATION_RUNTIME_ID, continuity_reference: topology.continuity_id, lineage_root: topology.lineage_root, verification_status: topology.drift_classifications.includes("replay_resurrection_attempt") ? "REPLAY_DETECTED" : topology.drift_classifications.includes("federated_lineage_divergence") ? "LINEAGE_MISMATCH" : "VERIFIED" }, generated_at)
        const observability_envelope = await createObservabilityEnvelope(topology, trust.envelope, traceRevocationImpact(topology), topology.drift_classifications.filter((drift) => drift === "replay_resurrection_attempt" || drift === "federated_revocation_replay_drift"), generated_at)
        await appendFederatedTrustObservation(env, trust, generated_at)
        await appendRevocationTopologyObservation(env, topology, generated_at)
        for (const drift_class of topology.drift_classifications.filter((drift) => drift === "federated_lineage_divergence" || drift === "replay_resurrection_attempt" || drift === "orphaned_execution")) {
          await recordDrift(env, { drift_class, severity: drift_class === "replay_resurrection_attempt" ? "CRITICAL" : "HIGH", decision_id: anchor.decision_id, payload: { route: "/federation/reconcile/topology", lineage_root: topology.lineage_root, remote_authority_denied: true, evidence_only: true }, detected_by: "revocation_topology_observability" })
        }
        return json({ status: "REVOCATION_TOPOLOGY_OBSERVED", route: "/federation/reconcile/topology", reason: "observability_only", topology, federated_trust_envelope: trust.envelope, observability_envelope, append_only: true, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile/topology", reason: "reconciliation_unavailable", remote_authority_denied: true, evidence_only: true })
      }
    }
    if (url.pathname === "/federation/reconcile/checkpoint" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const checkpoint = await deterministicReconciliationCheckpoint(result, new Date().toISOString())
        return json({ status: result.result, route: "/federation/reconcile/checkpoint", reason: "observability_only", append_only: true, rollback_overwrite: false, replay_neutral: true, checkpoint })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile/checkpoint", reason: "reconciliation_unavailable" })
      }
    }

    if (url.pathname === "/federation/reconcile/compression" && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: "/federation/reconcile/compression", reason: "database_unavailable", remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const generated_at = deterministicInteroperabilityGeneratedAt(result)
        const checkpoint = await buildFederatedCheckpoint(result, generated_at)
        const remoteSupplied = url.searchParams.get("remote_envelope")
        const remoteEnvelope = remoteSupplied ? JSON.parse(new TextDecoder().decode(base64ToBytes(String(remoteSupplied)) || utf8Bytes("{}"))) : null
        const remote_envelopes = Array.isArray(remoteEnvelope) ? remoteEnvelope : remoteEnvelope ? [remoteEnvelope] : []
        const checkpoint_comparison_summary = await compareFederatedCheckpoints(checkpoint, remote_envelopes)
        const consensus = await deriveCheckpointConsensus(checkpoint_comparison_summary)
        const topology_drift_summary = await classifyTopologyDrift(checkpoint, remote_envelopes)
        const reconciliation_envelope = await buildFederatedReconciliationEnvelope(checkpoint, checkpoint_comparison_summary, consensus, topology_drift_summary, remote_envelopes, generated_at)
        const governance_compression_envelope = await deriveGovernanceCompression(reconciliation_envelope, checkpoint_comparison_summary, topology_drift_summary, checkpoint, remote_envelopes, generated_at)
        await appendGovernanceCompressionObservation(env, governance_compression_envelope)
        return json({ status: "GOVERNANCE_COMPRESSION_OBSERVED", route: "/federation/reconcile/compression", reason: "observability_only", governance_compression_envelope, federated_governance_summary: governance_compression_envelope.summary, compressed_drift_summary: governance_compression_envelope.compressed_drift_summary, compressed_replay_summary: governance_compression_envelope.compressed_replay_summary, compressed_topology_summary: governance_compression_envelope.compressed_topology_summary, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, remote_execution_legitimacy: false, remote_authority_inherited: false, local_validation_required: true, append_only: true })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile/compression", reason: "reconciliation_unavailable", remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
      }
    }

    if (url.pathname === "/federation/reconcile/distributed" && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: "/federation/reconcile/distributed", reason: "database_unavailable", remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const generated_at = deterministicInteroperabilityGeneratedAt(result)
        const checkpoint = await buildFederatedCheckpoint(result, generated_at)
        const remoteSupplied = url.searchParams.get("remote_envelope")
        const remoteEnvelope = remoteSupplied ? JSON.parse(new TextDecoder().decode(base64ToBytes(String(remoteSupplied)) || utf8Bytes("{}"))) : null
        const remote_envelopes = Array.isArray(remoteEnvelope) ? remoteEnvelope : remoteEnvelope ? [remoteEnvelope] : []
        const checkpoint_comparison_summary = await compareFederatedCheckpoints(checkpoint, remote_envelopes)
        const consensus = await deriveCheckpointConsensus(checkpoint_comparison_summary)
        const topology_drift_summary = await classifyTopologyDrift(checkpoint, remote_envelopes)
        const reconciliation_envelope = await buildFederatedReconciliationEnvelope(checkpoint, checkpoint_comparison_summary, consensus, topology_drift_summary, remote_envelopes, generated_at)
        await appendFederatedReconciliationObservation(env, reconciliation_envelope)
        return json({ status: consensus.consensus_status, route: "/federation/reconcile/distributed", reason: "observability_only", reconciliation_envelope, checkpoint_comparison_summary, topology_drift_summary, replay_indicators: reconciliation_envelope.replay_indicators, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, remote_execution_legitimacy: false, remote_authority_inherited: false, local_validation_required: true, append_only: true })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile/distributed", reason: "reconciliation_unavailable", remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
      }
    }


    if (url.pathname === "/federation/sovereignty/checkpoint" && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: "/federation/sovereignty/checkpoint", reason: "database_unavailable", evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true })
        await ensureSchema(env, { stabilizeProofRegistry: false })
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const generated_at = deterministicInteroperabilityGeneratedAt(result)
        const sovereignty_envelope = await buildFederatedSovereigntyEnvelope(result, generated_at)
        const remoteSupplied = url.searchParams.get("remote_envelope")
        const remoteEnvelope = remoteSupplied ? JSON.parse(new TextDecoder().decode(base64ToBytes(String(remoteSupplied)) || utf8Bytes("{}"))) : null
        const equivalence = await verifyFederatedSovereigntyEquivalence(sovereignty_envelope, remoteEnvelope || sovereignty_envelope)
        await appendFederatedSovereigntyConsensusObservation(env, sovereignty_envelope, equivalence)
        return json({ status: equivalence.verification_status, route: "/federation/sovereignty/checkpoint", reason: "observability_only", sovereignty_envelope, equivalence, sovereignty_hash: sovereignty_envelope.sovereignty_hash, equivalence_hash: equivalence.equivalence_hash, drift_summary: equivalence.drift_summary, replay_indicators: equivalence.replay_indicators, evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true, remote_authority_inherited: false, remote_execution_legitimacy: false, local_governance_mutated: false, local_validation_required: true, append_only: true })
      } catch {
        return json({ status: "NULL", route: "/federation/sovereignty/checkpoint", reason: "sovereignty_checkpoint_unavailable", evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true })
      }
    }

    if (url.pathname === "/federation/conformance" && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: "/federation/conformance", reason: "database_unavailable", evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true })
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const generated_at = deterministicInteroperabilityGeneratedAt(result)
        const remoteSupplied = url.searchParams.get("remote_envelope")
        const remoteEnvelope = remoteSupplied ? JSON.parse(new TextDecoder().decode(base64ToBytes(String(remoteSupplied)) || utf8Bytes("{}"))) : null
        const federation_compatibility_envelope = await buildFederationCompatibilityEnvelope(result, remoteEnvelope, generated_at)
        await appendFederationConformanceObservation(env, federation_compatibility_envelope)
        return json({ status: federation_compatibility_envelope.conformance_result.conformance_status, route: "/federation/conformance", reason: "observability_only", federation_compatibility_envelope, runtime_semantic_fingerprint: federation_compatibility_envelope.runtime_semantic_fingerprint, conformance_checkpoint: federation_compatibility_envelope.conformance_checkpoint, conformance_result: federation_compatibility_envelope.conformance_result, drift_classes: federation_compatibility_envelope.conformance_result.drift_classes, semantic_mismatches: federation_compatibility_envelope.conformance_result.semantic_mismatches, evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true, remote_execution_legitimacy: false, remote_authority_inherited: false, local_validation_required: true, replay_consumed: false, append_only: true })
      } catch {
        return json({ status: "NULL", route: "/federation/conformance", reason: "conformance_unavailable", evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true })
      }
    }

    if (url.pathname === "/federation/interoperability/checkpoint" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const generated_at = deterministicInteroperabilityGeneratedAt(result)
        const projection = await deriveDistributedLegitimacyProjection(result, generated_at)
        const distributed_legitimacy_envelope = await buildDistributedLegitimacyEnvelope(result, projection, generated_at)
        const checkpoint_envelope = await buildFederatedCheckpoint(result, generated_at)
        const lineage_envelope = await buildFederatedLineageEnvelope(result, generated_at)
        const remoteSupplied = url.searchParams.get("remote_envelope")
        const remoteEnvelope = remoteSupplied ? JSON.parse(new TextDecoder().decode(base64ToBytes(String(remoteSupplied)) || utf8Bytes("{}"))) : null
        const compatibility = verifyDistributedLineageCompatibility(distributed_legitimacy_envelope, remoteEnvelope || distributed_legitimacy_envelope)
        const checkpointDrift = await detectFederatedCheckpointDrift(checkpoint_envelope, remoteEnvelope)
        const projectionDrift = interoperabilityDriftIndicators(result, projection)
        const drift_indicators = Array.from(new Set([...projectionDrift, ...checkpointDrift, ...(compatibility.drift_class ? [compatibility.drift_class] : [])])).sort()
        const replay_indicators = Array.from(new Set([...distributed_legitimacy_envelope.replay_indicators, ...checkpoint_envelope.replay_indicators])).sort()
        const interoperability_status: InteroperabilityStatus = drift_indicators.length > 0 || !projection || !compatibility.compatible ? "INTEROPERABILITY_QUARANTINED" : "INTEROPERABILITY_EVIDENCE_OBSERVED"
        return json({ status: interoperability_status, route: "/federation/interoperability/checkpoint", reason: "observability_only", interoperability_status, distributed_legitimacy_envelope, checkpoint_envelope, lineage_envelope, drift_indicators, replay_indicators, evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true, local_validation_required: true, remote_execution_legitimacy: false, remote_authority_inherited: false, append_only: false })
      } catch {
        return json({ status: "NULL", route: "/federation/interoperability/checkpoint", reason: "reconciliation_unavailable", evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true })
      }
    }
    if (url.pathname === RUNTIME_EVOLUTION_CONSENSUS_ROUTE && request.method !== "GET") return json({ status: "NULL", route: RUNTIME_EVOLUTION_CONSENSUS_ROUTE, reason: "get_only", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true }, 405)

    if (url.pathname === RUNTIME_EVOLUTION_CONSENSUS_ROUTE && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: RUNTIME_EVOLUTION_CONSENSUS_ROUTE, reason: "database_unavailable", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
        await ensureRuntimeEvolutionConsensusRegistry(env)
        const envelope = await buildRuntimeEvolutionConsensusEnvelope(runtimeEvolutionConsensusInputFromUrl(url))
        await appendRuntimeEvolutionConsensusObservation(env, envelope)
        return json({ status: envelope.consensus_result, route: RUNTIME_EVOLUTION_CONSENSUS_ROUTE, reason: "observability_only", envelope, drift_classes: envelope.drift_classes, consensus_result: envelope.consensus_result, canonical_hash: envelope.consensus_object.canonical_hash, replay_neutral: true, evidence_only: true, read_only: true, mutation_capable: false, execution_authority: false, remote_authority_inherited: false, runtime_mutated: false, governance_state_altered: false, append_only: true })
      } catch {
        return json({ status: "NULL", route: RUNTIME_EVOLUTION_CONSENSUS_ROUTE, reason: "consensus_unavailable", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
      }
    }
    if (url.pathname === EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE && request.method !== "GET") return json({ status: "NULL", route: EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE, reason: "get_only", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, authoritative: false }, 405)

    if (NON_EXECUTABLE_OBSERVABILITY_ROUTES.includes(url.pathname as any) && url.pathname !== RUNTIME_SOVEREIGNTY_ROUTE && url.pathname !== EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE) return json({ status: "NULL", route: url.pathname, reason: "observability_only" }, request.method === "GET" ? 200 : 405)

    const canonicalRuntimeRoute = CANONICAL_RUNTIME_ROUTES.includes(url.pathname as any)
    const governanceEvidenceRoute = GOVERNANCE_EVIDENCE_ROUTES.includes(url.pathname as any)
    const governedMutationRoute = canonicalRuntimeRoute || governanceEvidenceRoute
    const mutationEndpoint = governedMutationRoute && request.method === "POST"
    if (mutationEndpoint && !authorized(request, env)) return json({ status: "NULL", reason: "unauthorized" }, 403)

    if (!hasDb(env)) return json({ status: "NULL", reason: "database_unavailable" }, 500)

    try {
      await ensureSchema(env, { stabilizeProofRegistry: url.pathname !== "/session" })
    } catch (error) {
      if (error instanceof RuntimeSovereigntyViolationError) return json({ status: "RUNTIME_SOVEREIGNTY_VIOLATION", reason: "runtime_sovereignty_drift", drift_classes: error.drift_classes, expected_sovereignty_hash: error.expected_sovereignty_hash, actual_sovereignty_hash: error.actual_sovereignty_hash, runtime_ready: false }, 503)
      if (error instanceof BootstrapRegistryUnstableError) return json({ status: "NULL", reason: "bootstrap_registry_unstable" }, 500)
      return json({ status: "NULL", reason: schemaDiagnosticReason(error) }, 500)
    }

    const sovereigntyState = await assertRuntimeSovereigntyCanonical(env)
    if (sovereigntyState.status !== "CANONICAL") return json({ status: "RUNTIME_SOVEREIGNTY_VIOLATION", reason: "runtime_sovereignty_drift", drift_classes: sovereigntyState.drift_classes, expected_sovereignty_hash: sovereigntyState.expected_sovereignty_hash, actual_sovereignty_hash: sovereigntyState.actual_sovereignty_hash, runtime_ready: false }, 503)

    if (url.pathname === RUNTIME_SOVEREIGNTY_ROUTE && request.method !== "GET") return json({ status: "NULL", route: RUNTIME_SOVEREIGNTY_ROUTE, reason: "get_only", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, authoritative: false }, 405)
    if (url.pathname === RUNTIME_SOVEREIGNTY_ROUTE && request.method === "GET") {
      const manifest = RUNTIME_SOVEREIGNTY_FREEZES.get(env.DB) || await freezeRuntimeSovereignty(env)
      await appendRuntimeSovereigntyCheckpoint(env, manifest)
      return json({ status: "RUNTIME_SOVEREIGNTY_CANONICAL", route: RUNTIME_SOVEREIGNTY_ROUTE, manifest, sovereignty: sovereigntyState, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, authoritative: false, creates_authority: false, bypass_governance: false, append_only: true })
    }

    if (url.pathname === EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE && request.method === "GET") {
      const registry = await canonicalExternalAuthorityRegistry()
      const dependency = await externalAuthorityObservationFromUrl(url)
      const expected = registry.find((item) => item.external_authority_surface === dependency.external_authority_surface)
      const driftProbe = { ...dependency, creates_authority: url.searchParams.get("creates_authority") === "true", bypass_validation: url.searchParams.get("bypass_validation") === "true", mutate_legitimacy: url.searchParams.get("mutate_legitimacy") === "true", consume_replay_state: url.searchParams.get("consume_replay_state") === "true", inherit_execution_legitimacy: url.searchParams.get("inherit_execution_legitimacy") === "true", direct_deploy_allowed: url.searchParams.get("direct_deploy_allowed") === "true", deploy_capable: url.searchParams.get("deploy_capable") === "true", mutation_capable: url.searchParams.get("mutation_capable") === "true", hidden_mutation: url.searchParams.get("hidden_mutation") === "true", command: url.searchParams.get("command") || "" }
      const drift_classes = await classifyExternalAuthorityDrift(driftProbe, expected)
      const evidence_hash = await appendExternalAuthorityObservation(env, dependency, drift_classes)
      const status = drift_classes.length > 0 ? "EXTERNAL_AUTHORITY_DRIFT" : "EXTERNAL_AUTHORITY_CONTAINED"
      return json({ status, route: EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE, external_authority_registry: registry, dependency, drift_classes, evidence_hash, fail_closed: drift_classes.length > 0, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, authoritative: false, creates_authority: false, bypass_governance: false, append_only: true })
    }

    try {
    if (governanceEvidenceRoute && request.method === "POST") {
      const b = await body(request)
      const decision_id = String(b.decision_id || "")
      const reviewed_hash = String(b.reviewed_hash || b.validated_object_hash || "")
      const reviewed_tree_hash = String(b.reviewed_tree_hash || b.source_tree_hash || "")
      const merge_commit_sha = String(b.merge_commit_sha || "")
      const pull_request_id = String(b.pull_request_id || b.pull_request_number || "")
      if (!decision_id) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "missing_decision_id" }, { event_type: "VALIDATION_REJECTED", severity: "WARN", payload: { route: "/preo", indicator: "missing_decision_id" }, drift_class: "registry_drift" })
      if (!reviewed_hash) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "missing_reviewed_hash" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/preo", indicator: "missing_reviewed_hash" }, drift_class: "hash_drift" })
      if (!reviewed_tree_hash) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "missing_reviewed_tree_hash" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/preo", indicator: "missing_reviewed_tree_hash" }, drift_class: "provenance_drift" })
      if (!merge_commit_sha) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "missing_merge_commit_sha" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/preo", indicator: "missing_merge_commit_sha" }, drift_class: "provenance_drift" })
      if (!pull_request_id) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "missing_pull_request_id" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/preo", indicator: "missing_pull_request_id" }, drift_class: "branch_lineage_drift" })
      if (b.validated_object_hash && String(b.validated_object_hash) !== reviewed_hash) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "preo_hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/preo", reviewed_hash, validated_object_hash: String(b.validated_object_hash), indicator: "preo_hash_mismatch" }, drift_class: "hash_drift" })

      const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
      if (!authority) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "authority_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/preo" }, drift_class: "authority_drift" })
      if (!["ACTIVE", "VALIDATED", "RESERVED"].includes(String(authority.status || ""))) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "authority_unusable" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/preo", authority_status: authority.status }, drift_class: "authority_drift" })
      const session = await activeSession(env, String(authority.session_id || ""))
      if (!session) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/preo" }, drift_class: "authority_drift" })
      const continuity = await activeContinuity(env, String(authority.continuity_id || ""), session, decision_id)
      if (!continuity) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/preo", continuity_id: authority.continuity_id || null }, drift_class: "authority_drift" })

      await ensurePreoSchema(env)
      const created_at = new Date().toISOString()
      const canonical_preo = canonicalize({
        decision_id,
        authority_id: String(authority.authority_id || ""),
        continuity_id: String(authority.continuity_id || ""),
        reviewed_hash,
        reviewed_tree_hash,
        merge_commit_sha,
        pull_request_id,
        evidence: canonicalRecord(b.evidence),
        status: "PREO_VALID"
      })
      const preo_id = String(b.preo_id || crypto.randomUUID())
      const insert = await env.DB.prepare(`INSERT OR IGNORE INTO preo_registry (preo_id,decision_id,authority_id,continuity_id,reviewed_hash,reviewed_tree_hash,merge_commit_sha,canonical_preo,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'PREO_VALID',?9)`).bind(preo_id, decision_id, String(authority.authority_id || ""), String(authority.continuity_id || ""), reviewed_hash, reviewed_tree_hash, merge_commit_sha, canonical_preo, created_at).run()
      if ((insert.meta?.changes || 0) === 0) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "preo_replay" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/preo", reviewed_hash, indicator: "duplicate_preo" }, drift_class: "replay_drift" })
      await emitTelemetry(env, { event_type: "VALIDATION_GRANTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "INFO", payload: { route: "/preo", reviewed_hash, policy: REQUIRE_PREO_LINEAGE } })
      return json({ status: "PREO_VALID", decision_id, preo_id, reviewed_hash, reviewed_tree_hash, merge_commit_sha, pull_request_id })
    }

    if (request.method === "POST" && !canonicalRuntimeRoute) {
      if (!governanceEvidenceRoute) {
        await recordDrift(env, { drift_class: "registry_drift", severity: "HIGH", payload: { route: url.pathname, indicator: "invalid_route_invocation" } })
        return json({ status: "NULL", reason: "not_found" }, 404)
      }
    }

    if (url.pathname === "/session" && request.method === "POST") {
      const b = await body(request)
      const identity_id = String(b.identity_id || "")
      if (!identity_id) return json({ status: "NULL", reason: "missing_identity_id" }, 400)
      const expires_at = String(b.expires_at || new Date(Date.now()+SESSION_TTL_MS).toISOString())
      if (isExpired(expires_at)) return json({ status: "NULL", reason: "invalid_session_expiry" }, 400)
      const session = { session_id: crypto.randomUUID(), identity_id, owner: "human-origin", trust_tier: "T0", continuity_status: "ACTIVE", created_at: new Date().toISOString(), expires_at }
      await env.DB.prepare(`INSERT INTO session_registry (session_id,identity_id,owner,trust_tier,continuity_status,created_at,expires_at) VALUES (?1,?2,?3,?4,?5,?6,?7)`).bind(session.session_id,session.identity_id,session.owner,session.trust_tier,session.continuity_status,session.created_at,session.expires_at).run()
      try { await emitTelemetry(env, { event_type: "SESSION_CREATED", severity: "INFO", payload: { route: "/session", session_id: session.session_id, identity_id: session.identity_id, continuity_status: "ACTIVE" } }) } catch {}
      return json({ status: "SESSION_ACTIVE", session_id: session.session_id, identity_id: session.identity_id, created_at: session.created_at, expires_at: session.expires_at })
    }

    if (url.pathname === "/continuity" && request.method === "POST") {
      const b = await body(request)
      const session_id = String(b.session_id || "")
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status: "NULL", reason: "invalid_session" }, { event_type: "VALIDATION_REJECTED", severity: "HIGH", payload: { route: "/continuity", session_id }, drift_class: "authority_drift" })
      const continuity_id = String(b.continuity_id || crypto.randomUUID())
      const issued_at = String(b.issued_at || new Date().toISOString())
      const expires_at = String(b.expires_at || session.expires_at)
      if (isExpired(expires_at)) return rejectWithTelemetry(env, { status: "NULL", reason: "expired_continuity" }, { event_type: "VALIDATION_REJECTED", severity: "HIGH", payload: { route: "/continuity", session_id, continuity_id }, drift_class: "authority_drift" })
      const parent_continuity_id = b.parent_continuity_id ? String(b.parent_continuity_id) : ""
      const requestedScope =
        isPlainRecord(b.scope)
          ? canonicalRecord(b.scope)
          : { environment: "production" }
      if (parent_continuity_id === continuity_id) return rejectWithTelemetry(env, { status: "NULL", reason: "continuity_cycle_detected" }, { event_type: "VALIDATION_REJECTED", severity: "HIGH", payload: { route: "/continuity", session_id, continuity_id, parent_continuity_id }, drift_class: "authority_drift" })

      if (parent_continuity_id) {
        const parent = await activeContinuity(env, parent_continuity_id, session)
        if (!parent) {
          return rejectWithTelemetry(
            env,
            { status: "NULL", reason: "invalid_parent_continuity" },
            {
              event_type: "VALIDATION_REJECTED",
              severity: "HIGH",
              payload: {
                route: "/continuity",
                session_id,
                continuity_id,
                parent_continuity_id,
                indicator: "orphaned_continuity_prevented"
              },
              drift_class: "authority_drift"
            }
          )
        }

        const prospectiveDepth = parent.ancestry.length + 1
        if (prospectiveDepth > SYSTEM_MAX_CONTINUITY_DEPTH) {
          return rejectWithTelemetry(
            env,
            { status: "NULL", reason: "continuity_depth_exceeded" },
            {
              event_type: "VALIDATION_REJECTED",
              severity: "HIGH",
              payload: {
                route: "/continuity",
                continuity_id,
                parent_continuity_id,
                prospective_depth: prospectiveDepth,
                system_max_depth: SYSTEM_MAX_CONTINUITY_DEPTH
              },
              drift_class: "authority_drift"
            }
          )
        }

        const configuredMaxDepth = Number(parent?.canonical?.constraints?.max_depth)
        if (
          Number.isFinite(configuredMaxDepth)
          && configuredMaxDepth >= 0
          && prospectiveDepth > configuredMaxDepth
        ) {
          return rejectWithTelemetry(
            env,
            { status: "NULL", reason: "continuity_depth_exceeded" },
            {
              event_type: "VALIDATION_REJECTED",
              severity: "HIGH",
              payload: {
                route: "/continuity",
                continuity_id,
                parent_continuity_id,
                prospective_depth: prospectiveDepth,
                configured_max_depth: configuredMaxDepth
              },
              drift_class: "authority_drift"
            }
          )
        }

        const parentScope =
          isPlainRecord(parent?.canonical?.scope)
            ? canonicalRecord(parent.canonical.scope)
            : {}
        const childScope = canonicalRecord(requestedScope)

        for (const [key, value] of Object.entries(childScope)) {
          if (!Object.prototype.hasOwnProperty.call(parentScope, key)) {
            return rejectWithTelemetry(
              env,
              { status: "NULL", reason: "scope_expansion_detected" },
              {
                event_type: "VALIDATION_REJECTED",
                severity: "HIGH",
                payload: {
                  route: "/continuity",
                  continuity_id,
                  parent_continuity_id,
                  indicator: "recursive_scope_expansion_detected"
                },
                drift_class: "authority_drift"
              }
            )
          }
          if (canonicalize(parentScope[key]) !== canonicalize(value)) {
            return rejectWithTelemetry(
              env,
              { status: "NULL", reason: "scope_expansion_detected" },
              {
                event_type: "VALIDATION_REJECTED",
                severity: "HIGH",
                payload: {
                  route: "/continuity",
                  continuity_id,
                  parent_continuity_id,
                  indicator: "recursive_scope_expansion_detected"
                },
                drift_class: "authority_drift"
              }
            )
          }
        }
      }

      const material: any = continuityHashMaterial({
        continuity_id,
        identity_id: String(session.identity_id || ""),
        session_id,
        parent_continuity_id: parent_continuity_id || null,
        authority_chain: Array.isArray(b.authority_chain) ? b.authority_chain : [],
        actor_chain: Array.isArray(b.actor_chain) ? b.actor_chain : ["human", "agent"],
        scope: requestedScope,
        constraints: b.constraints || { max_depth: 3, delegation_allowed: false },
        revocation: b.revocation || { status: "ACTIVE", revoked_at: null },
        issued_at,
        expires_at
      })
      const hash = await continuityHash(material)
      const continuity = { ...material, continuity_hash: hash }
      if (String(continuity.revocation.status) !== "ACTIVE") return rejectWithTelemetry(env, { status: "NULL", reason: "revoked_continuity" }, { event_type: "VALIDATION_REJECTED", severity: "HIGH", payload: { route: "/continuity", continuity_id }, drift_class: "authority_drift" })
      await env.DB.prepare(`INSERT INTO continuity_registry (continuity_id,identity_id,session_id,parent_continuity_id,continuity_hash,canonical_continuity,status,issued_at,expires_at,revoked_at) VALUES (?1,?2,?3,?4,?5,?6,'ACTIVE',?7,?8,NULL)`).bind(continuity_id, continuity.identity_id, session_id, continuity.parent_continuity_id, hash, canonicalize(continuity), issued_at, expires_at).run()
      await emitTelemetry(env, { event_type: "CONTINUITY_CREATED", severity: "INFO", payload: { route: "/continuity", session_id, continuity_id, continuity_hash: hash } })
      return json({ status: "CONTINUITY_ACTIVE", continuity_id, continuity_hash: hash, continuity })
    }

    if (url.pathname === "/authority" && request.method === "POST") {
      const b = await body(request)
      const session_id = String(b.session_id || "")
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status: "NULL", reason: "invalid_session" }, { event_type: "VALIDATION_REJECTED", severity: "HIGH", payload: { route: "/authority", session_id }, drift_class: "authority_drift" })
      const decision_id = String(b.decision_id || crypto.randomUUID())
      const continuity_id = String(b.continuity_id || "")
      if (!continuity_id) return rejectWithTelemetry(env, { status: "NULL", reason: "missing_continuity_id" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/authority", session_id }, drift_class: "authority_drift" })
      const continuity = await activeContinuity(env, continuity_id, session, decision_id)
      if (!continuity) return rejectWithTelemetry(env, { status: "NULL", reason: "invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/authority", session_id, continuity_id }, drift_class: "authority_drift" })
      const rec = { authority_id: crypto.randomUUID(), decision_id, identity_id: String(session.identity_id || ""), session_id, continuity_id, owner: String(b.owner || "unknown"), intent: String(b.intent || "deploy_production"), scope: JSON.stringify(b.scope || {}), constraints: JSON.stringify(b.constraints || {}), expiry: String(b.expiry || new Date(Date.now()+3600_000).toISOString()), status: "ACTIVE", created_at: new Date().toISOString() }
      await env.DB.prepare(`INSERT INTO authority_registry (authority_id,decision_id,identity_id,session_id,continuity_id,owner,intent,scope,constraints,expiry,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`).bind(rec.authority_id,rec.decision_id,rec.identity_id,rec.session_id,rec.continuity_id,rec.owner,rec.intent,rec.scope,rec.constraints,rec.expiry,rec.status,rec.created_at).run()
      await emitTelemetry(env, { event_type: "AUTHORITY_CREATED", decision_id: rec.decision_id, authority_id: rec.authority_id, severity: "INFO", payload: { route: "/authority", session_id, continuity_id, authority_status: "ACTIVE" } })
      return json(rec)
    }

    if (url.pathname === "/compile" && request.method === "POST") {
      try {
        const b = await body(request)
        const decision_id = String(b.decision_id || "")
        if (!decision_id) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "missing_decision_id" }, { event_type: "VALIDATION_REJECTED", severity: "WARN", payload: { route: "/compile", indicator: "missing_decision_id" }, drift_class: "registry_drift" })

        const authorityHasStatus = await hasColumn(env, "authority_registry", "status")
        const authorityHasDecision = await hasColumn(env, "authority_registry", "decision_id")
        if (!authorityHasStatus || !authorityHasDecision) {
          return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "schema_incompatible_authority_registry" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "CRITICAL", payload: { route: "/compile" }, drift_class: "registry_drift" })
        }
        const aeoHasHash = await hasColumn(env, "aeo_registry", "validated_object_hash")
        if (!aeoHasHash) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "schema_incompatible_aeo_registry" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "CRITICAL", payload: { route: "/compile" }, drift_class: "registry_drift" })

        const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
        if (!authority) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "authority_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/compile" }, drift_class: "authority_drift" })
        if (!["ACTIVE", "VALIDATED", "RESERVED"].includes(String(authority.status || ""))) {
          return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "authority_unusable" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", authority_status: authority.status, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
        }
        const session = await activeSession(env, String(authority.session_id || ""))
        if (!session) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile" }, drift_class: "authority_drift" })
        const continuity = await activeContinuity(env, String(authority.continuity_id || ""), session, decision_id)
        if (!continuity) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", continuity_id: authority.continuity_id || null }, drift_class: "authority_drift" })

        const constraints = JSON.parse(String(authority.constraints || "{}"))
        const target = canonicalDeployTarget(constraints)
        if (target.workflow !== GOVERNED_WORKFLOW) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "workflow_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", workflow: target.workflow, indicator: "unmanaged_deploy_surface" }, drift_class: "registry_drift" })
        const requirePreoLineage = preoGovernanceEnabled(constraints, target)

        const existingAeos = await env.DB.prepare(`SELECT * FROM aeo_registry WHERE decision_id=?1 ORDER BY created_at ASC, aeo_id ASC`).bind(decision_id).all<any>()
        const existingRows = Array.isArray(existingAeos?.results) ? existingAeos.results : []
        if (existingRows.length > 0) {
          const first = existingRows[0]
          let canonicalAeo: unknown
          try { canonicalAeo = JSON.parse(String(first.canonical_aeo || "{}")) } catch { canonicalAeo = null }
          const storedHash = String(first.validated_object_hash || "")
          const recomputedHash = await sha256Hex(canonicalize(canonicalAeo))
          const hasConflictingAeo = existingRows.some((row: any) => String(row.validated_object_hash || "") !== storedHash || String(row.canonical_aeo || "") !== String(first.canonical_aeo || ""))
          if (!canonicalAeo || !storedHash || recomputedHash !== storedHash || hasConflictingAeo) {
            return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "compiled_aeo_hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/compile", stored_hash: storedHash, actual_hash: recomputedHash, indicator: "stored_aeo_hash_mismatch" }, drift_class: "hash_drift" })
          }
          const preoLineage = await validatePreoLineage(env, { decision_id, validated_object_hash: storedHash, authority, required: requirePreoLineage })
          if (preoLineage !== "OK") return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: preoLineage }, { event_type: preoLineage === "preo_hash_mismatch" ? "HASH_MISMATCH" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", validated_object_hash: storedHash, policy: REQUIRE_PREO_LINEAGE, required: requirePreoLineage, indicator: preoLineage }, drift_class: preoLineage === "preo_hash_mismatch" ? "hash_drift" : "registry_drift" })
          await emitTelemetry(env, { event_type: "AEO_COMPILED", decision_id, authority_id: String(first.authority_id || ""), severity: "INFO", payload: { route: "/compile", validated_object_hash: storedHash, indicator: "existing_canonical_aeo_reused" } })
          return json({ status: "COMPILED", decision_id, validated_object_hash: storedHash, canonical_aeo: canonicalAeo })
        }

        const canonical_aeo = toCanonicalAeo({ intent: authority.intent, scope: JSON.parse(String(authority.scope || "{}")), validation: { workflow: GOVERNED_WORKFLOW }, target, finality: { proof_required: true } })
        if (!canonical_aeo) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "invalid_canonical_aeo" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile" }, drift_class: "registry_drift" })
        const canonical_aeo_json = canonicalize(canonical_aeo)
        const validated_object_hash = await sha256Hex(canonical_aeo_json)
        const preoLineage = await validatePreoLineage(env, { decision_id, validated_object_hash, authority, required: requirePreoLineage })
        if (preoLineage !== "OK") return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: preoLineage }, { event_type: preoLineage === "preo_hash_mismatch" ? "HASH_MISMATCH" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", validated_object_hash, policy: REQUIRE_PREO_LINEAGE, required: requirePreoLineage, indicator: preoLineage }, drift_class: preoLineage === "preo_hash_mismatch" ? "hash_drift" : "registry_drift" })
        await env.DB.prepare(`INSERT INTO aeo_registry (aeo_id,authority_id,decision_id,continuity_id,canonical_aeo,validated_object_hash,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,'COMPILED',?7)`).bind(crypto.randomUUID(), authority.authority_id, decision_id, String(authority.continuity_id || ""), canonical_aeo_json, validated_object_hash, new Date().toISOString()).run()
        await emitTelemetry(env, { event_type: "AEO_COMPILED", decision_id, authority_id: String(authority.authority_id || ""), severity: "INFO", payload: { route: "/compile", validated_object_hash } })
        return json({ status: "COMPILED", decision_id, validated_object_hash, canonical_aeo: JSON.parse(canonical_aeo_json) })
      } catch (error: any) {
        await recordDrift(env, { drift_class: "registry_drift", severity: "CRITICAL", payload: { route: "/compile", error: String(error?.message || error || "unknown_error") } })
        return json({
          status: "FAILED",
          route: "/compile",
          error: String(error?.message || error || "unknown_error"),
          reason: "compile_exception"
        })
      }
    }

    if (url.pathname === "/validate" && request.method === "POST") {
      const b = await body(request); const decision_id = String(b.decision_id || ""); const validated_object_hash = String(b.validated_object_hash || ""); const invocation_nonce = String(b.invocation_nonce || ""); const environment = b.environment; const session_id = String(b.session_id || "")
      if (!decision_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_decision_id" }, { event_type: "VALIDATION_REJECTED", severity: "WARN", payload: { route: "/validate" }, drift_class: "hash_drift" })
      if (!validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_validated_object_hash" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/validate", indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (!invocation_nonce) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_invocation_nonce" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "WARN", payload: { route: "/validate", validated_object_hash }, drift_class: "replay_drift" })
      const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
      if (!authority) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/validate" }, drift_class: "authority_drift" })
      if (!["ACTIVE","VALIDATED","RESERVED"].includes(String(authority.status))) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_unusable" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", authority_status: authority.status, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", session_id }, drift_class: "authority_drift" })
      if (String(authority.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_session_id: authority.session_id, provided_session_id: session_id }, drift_class: "authority_drift" })
      const continuity = await activeContinuity(env, String(authority.continuity_id || ""), session, String(decision_id || ""))
      if (!continuity) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", continuity_id: authority.continuity_id || null }, drift_class: "authority_drift" })
      if (String(authority.identity_id || "") !== String(session.identity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"identity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_identity_id: session.identity_id, provided_identity_id: authority.identity_id }, drift_class: "authority_drift" })
      const compiled = await env.DB.prepare(`SELECT * FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND status='COMPILED'`).bind(decision_id, validated_object_hash).first<any>()
      if (!compiled) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", validated_object_hash, indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      let compiledAeo: any
      try { compiledAeo = JSON.parse(String(compiled.canonical_aeo || "{}")) } catch { compiledAeo = null }
      const compiledCanonicalAeo = toCanonicalAeo(compiledAeo)
      const compiledHash = compiledCanonicalAeo ? await sha256Hex(canonicalize(compiledCanonicalAeo)) : ""
      if (!compiledCanonicalAeo || compiledHash !== validated_object_hash || compiledHash !== String(compiled.validated_object_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_hash: validated_object_hash, actual_hash: compiledHash, indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (String(compiled.continuity_id || "") !== String(authority.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_continuity_id: authority.continuity_id, provided_continuity_id: compiled.continuity_id, indicator: "non_canonical_validation_lineage" }, drift_class: "hash_drift" })
      const target = compiledCanonicalAeo.target
      const constraints = canonicalDeployTarget(JSON.parse(String(authority.constraints)))
      if (String(target.repo)!==constraints.repo || String(target.branch)!==constraints.branch || String(target.workflow)!==constraints.workflow) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"scope_constraints_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", indicator: "non_canonical_workflow" }, drift_class: "registry_drift" })
      if (target.workflow !== GOVERNED_WORKFLOW) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"workflow_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", workflow: target.workflow, indicator: "unmanaged_deploy_surface" }, drift_class: "registry_drift" })
      const insert = await env.DB.prepare(`INSERT OR IGNORE INTO invocation_registry (decision_id,validated_object_hash,invocation_nonce,continuity_id,status,created_at) VALUES (?1,?2,?3,?4,'RESERVED',?5)`).bind(decision_id,validated_object_hash,invocation_nonce,String(authority.continuity_id || ""),new Date().toISOString()).run()
      if ((insert.meta?.changes||0)===0) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"nonce_used" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", validated_object_hash, invocation_nonce, indicator: "reused_nonce" }, drift_class: "replay_drift" })
      await env.DB.prepare(`INSERT INTO validation_registry (validation_id,session_id,continuity_id,decision_id,validated_object_hash,invocation_nonce,environment,result,reason,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'VALID',NULL,'VALID',?8)`).bind(crypto.randomUUID(),session_id,String(authority.continuity_id || ""),decision_id,validated_object_hash,invocation_nonce,String(environment||""),new Date().toISOString()).run()
      await env.DB.prepare(`UPDATE authority_registry SET status='RESERVED' WHERE decision_id=?1 AND status IN ('ACTIVE','VALIDATED','RESERVED')`).bind(decision_id).run()
      await emitTelemetry(env, { event_type: "VALIDATION_GRANTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "INFO", payload: { route: "/validate", validated_object_hash, invocation_nonce, authority_status: "RESERVED" } })
      return json({ status:"VALID", result:"VALID", session_id, validated_object_hash, invocation_nonce })
    }

    if (url.pathname === "/execute" && request.method === "POST") {
      const b = await body(request); const decision_id = String(b.decision_id || ""); const validated_object_hash = String(b.validated_object_hash || ""); const invocation_nonce = String(b.invocation_nonce || ""); const session_id = String(b.session_id || ""); const provenance = deploymentProvenanceFrom(b)
      await emitTelemetry(env, { event_type: "EXECUTION_STARTED", decision_id, severity: "INFO", payload: { route: "/execute", validated_object_hash, invocation_nonce } })
      if (!decision_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_decision_id" }, { event_type: "VALIDATION_REJECTED", severity: "WARN", payload: { route: "/execute" }, drift_class: "execution_drift" })
      if (!validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_validated_object_hash" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/execute", indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (!invocation_nonce) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_invocation_nonce" }, { event_type: "REPLAY_BLOCKED", decision_id, severity: "HIGH", payload: { route: "/execute", validated_object_hash, indicator: "missing_nonce" }, drift_class: "replay_drift" })
      const validation = await env.DB.prepare(`SELECT * FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3 AND result='VALID' AND status='VALID'`).bind(decision_id,validated_object_hash,invocation_nonce).first<any>()
      if (!validation) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/execute", validated_object_hash, invocation_nonce, indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", session_id, validated_object_hash, invocation_nonce }, drift_class: "execution_drift" })
      if (String(validation.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", expected_session_id: validation.session_id, provided_session_id: session_id, validated_object_hash, invocation_nonce }, drift_class: "execution_drift" })
      const inv = await env.DB.prepare(`SELECT * FROM invocation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3`).bind(decision_id,validated_object_hash,invocation_nonce).first<any>()
      if (!inv || inv.status!=="RESERVED") return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"nonce_not_reserved" }, { event_type: "REPLAY_BLOCKED", decision_id, severity: "HIGH", payload: { route: "/execute", validated_object_hash, invocation_nonce, invocation_status: inv?.status || null, indicator: "reused_nonce" }, drift_class: "replay_drift" })
      const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
      if (!authority || !["RESERVED","VALIDATED"].includes(String(authority.status))) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_not_reserved" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority?.authority_id || ""), severity: "HIGH", payload: { route: "/execute", authority_status: authority?.status || null, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      if (String(authority.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_session_id: authority.session_id, provided_session_id: session_id }, drift_class: "authority_drift" })
      const continuity = await activeContinuity(env, String(authority.continuity_id || ""), session, String(decision_id || ""))
      if (!continuity) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", continuity_id: authority.continuity_id || null, indicator: "orphaned_execution_prevented" }, drift_class: "execution_drift" })
      if (String(validation.continuity_id || "") !== String(authority.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_continuity_id: authority.continuity_id, provided_continuity_id: validation.continuity_id }, drift_class: "execution_drift" })
      const replay = await env.DB.prepare(`SELECT execution_id FROM execution_registry WHERE decision_id=?1 AND validated_object_hash=?2`).bind(decision_id,validated_object_hash).first<any>()
      if (replay) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"replay_detected" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), execution_id: String(replay.execution_id || ""), severity: "HIGH", payload: { route: "/execute", validated_object_hash, invocation_nonce, indicator: "duplicate_execution" }, drift_class: "replay_drift" })
      const compiled = await env.DB.prepare(`SELECT canonical_aeo,validated_object_hash,continuity_id,status FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND status='COMPILED'`).bind(decision_id,validated_object_hash).first<any>()
      let executionAeo: any
      try { executionAeo = JSON.parse(String(compiled?.canonical_aeo || "{}")) } catch { executionAeo = null }
      const executionCanonicalAeo = toCanonicalAeo(executionAeo)
      const execHash = executionCanonicalAeo ? await sha256Hex(canonicalize(executionCanonicalAeo)) : ""
      if (!compiled || !executionCanonicalAeo || execHash !== validated_object_hash || execHash !== String(compiled.validated_object_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_hash: validated_object_hash, actual_hash: execHash, indicator: "execution_hash_mismatch" }, drift_class: "hash_drift" })
      if (String(compiled.continuity_id || "") !== String(authority.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_continuity_id: authority.continuity_id, provided_continuity_id: compiled.continuity_id, indicator: "non_canonical_validation_lineage" }, drift_class: "execution_drift" })
      const provenanceValidation = await validateDeploymentProvenance(env, { route: "/execute", decision_id, validated_object_hash, authority, compiledCanonicalAeo: executionCanonicalAeo, provenance })
      if (!provenanceValidation.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: provenanceValidation.reason }, { event_type: provenanceValidation.drift_class === "workflow_source_drift" ? "HASH_MISMATCH" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { ...provenanceValidation.payload, validated_object_hash }, drift_class: provenanceValidation.drift_class })
      const attestationValidation = await validateRequestProvenanceAttestation(env, b, {
        decision_id,
        validated_object_hash,
        workflow_run_id: provenance.workflow_run_id,
        workflow_sha: provenance.workflow_sha,
        canonical_aeo_hash: execHash,
        expected_signer_identity: String(authority.identity_id || ""),
        hmac_secret: String(env.PROVENANCE_HMAC_SECRET || env.API_KEY || "")
      })
      if (!attestationValidation.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: attestationValidation.reason }, { event_type: attestationValidation.drift_class === "replay_drift" ? "REPLAY_BLOCKED" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", ...attestationValidation.payload, validated_object_hash }, drift_class: attestationValidation.drift_class })
      const execution_id = crypto.randomUUID()
      try {
        await env.DB.prepare(`INSERT INTO execution_registry (execution_id,session_id,decision_id,validated_object_hash,invocation_nonce,status,created_at,continuity_id,repository,branch,pull_request_id,merge_commit_sha,source_tree_hash,workflow_run_id,workflow_sha) VALUES (?1,?2,?3,?4,?5,'EXECUTED',?6,?7,?8,?9,?10,?11,?12,?13,?14)`).bind(execution_id, authority.session_id, decision_id, validated_object_hash, invocation_nonce, new Date().toISOString(), String(authority.continuity_id || ""), provenance.repository, provenance.branch, provenance.pull_request_id, provenance.merge_commit_sha, provenance.source_tree_hash, provenance.workflow_run_id, provenance.workflow_sha).run()
      } catch {
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"replayed_provenance" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, severity: "HIGH", payload: { route: "/execute", workflow_run_id: provenance.workflow_run_id, indicator: "duplicate_workflow_run" }, drift_class: "replay_drift" })
      }
      await env.DB.prepare(`UPDATE invocation_registry SET status='EXECUTED' WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3`).bind(decision_id,validated_object_hash,invocation_nonce).run()
      await env.DB.prepare(`UPDATE authority_registry SET status='EXECUTED' WHERE decision_id=?1`).bind(decision_id).run()
      await emitTelemetry(env, { event_type: "EXECUTION_COMPLETED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, severity: "INFO", payload: { route: "/execute", validated_object_hash, invocation_nonce, authority_status: "EXECUTED" } })
      return json({ status:"EXECUTED", session_id, execution_id })
    }

    if (url.pathname === "/proof" && request.method === "POST") {
      const b = await body(request)
      const provenance = deploymentProvenanceFrom(b)
      const execution_id = String(b.execution_id || "")
      const decision_id = String(b.decision_id || "")
      const validated_object_hash = String(b.validated_object_hash || "")
      const session_id = String(b.session_id || "")
      if (!execution_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_execution_id" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "WARN", payload: { route: "/proof" }, drift_class: "proof_drift" })
      if (!decision_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_decision_id" }, { event_type: "VALIDATION_REJECTED", execution_id, severity: "WARN", payload: { route: "/proof" }, drift_class: "proof_drift" })
      if (!validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_validated_object_hash" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "WARN", payload: { route: "/proof" }, drift_class: "proof_drift" })
      const proof_id = crypto.randomUUID()
      const created_at = new Date().toISOString()
      let execution: any = null
      let session: any = null
      let authority: any = null
      let validation: any = null
      let proofInserted = 0
      let authorityConsumed = 0
      try {
        const proofReads = await env.DB.batch<any>([
          env.DB.prepare(`SELECT * FROM execution_registry WHERE execution_id=?1 AND decision_id=?2 AND validated_object_hash=?3 AND status='EXECUTED'`).bind(execution_id,decision_id,validated_object_hash),
          env.DB.prepare(`SELECT * FROM session_registry WHERE session_id=?1 AND continuity_status='ACTIVE' AND expires_at>?2`).bind(session_id,created_at),
          env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id),
          env.DB.prepare(`SELECT * FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND session_id=?3 AND status='VALID' AND result='VALID' ORDER BY created_at DESC LIMIT 1`).bind(decision_id,validated_object_hash,session_id)
        ])
        execution = proofReads[0]?.results?.[0] || null
        session = proofReads[1]?.results?.[0] || null
        authority = proofReads[2]?.results?.[0] || null
        validation = proofReads[3]?.results?.[0] || null
      } catch {
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"proof_read_failed" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, proof_id, severity: "HIGH", payload: { route: "/proof", validated_object_hash }, drift_class: "proof_drift" })
      }
      if (!execution) {
        const executionById = await env.DB.prepare(`SELECT * FROM execution_registry WHERE execution_id=?1`).bind(execution_id).first<any>()
        if (executionById) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", expected_decision_id: executionById.decision_id, provided_decision_id: decision_id, expected_hash: executionById.validated_object_hash, provided_hash: validated_object_hash, indicator: "proof_hash_mismatch" }, drift_class: "proof_drift" })
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"execution_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", validated_object_hash, indicator: "proof_without_execute" }, drift_class: "proof_drift" })
      }
      if (!session) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", session_id }, drift_class: "proof_drift" })
      if (String(execution.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", expected_session_id: execution.session_id, provided_session_id: session_id }, drift_class: "proof_drift" })
      if (!authority || String(authority.status) !== "EXECUTED") return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_not_executed" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, authority_id: String(authority?.authority_id || ""), severity: "HIGH", payload: { route: "/proof", authority_status: authority?.status || null, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      if (String(authority.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_session_id: authority.session_id, provided_session_id: session_id }, drift_class: "authority_drift" })
      if (String(authority.continuity_id || "") !== String(execution.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_continuity_id: authority.continuity_id, provided_continuity_id: execution.continuity_id }, drift_class: "proof_drift" })
      if (!validation || String(validation.continuity_id || "") !== String(execution.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_continuity_id: execution.continuity_id, provided_continuity_id: validation?.continuity_id || null }, drift_class: "proof_drift" })
      const continuity = await activeContinuity(env, String(execution.continuity_id || ""), session, decision_id)
      if (!continuity) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", continuity_id: execution.continuity_id || null, indicator: "proof_lineage_invalid" }, drift_class: "proof_drift" })
      const compiled = await env.DB.prepare(`SELECT canonical_aeo,validated_object_hash,continuity_id,status FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND status='COMPILED'`).bind(decision_id,validated_object_hash).first<any>()
      let proofAeo: any
      try { proofAeo = JSON.parse(String(compiled?.canonical_aeo || "{}")) } catch { proofAeo = null }
      const proofCanonicalAeo = toCanonicalAeo(proofAeo)
      const proofHash = proofCanonicalAeo ? await sha256Hex(canonicalize(proofCanonicalAeo)) : ""
      if (!compiled || !proofCanonicalAeo || proofHash !== validated_object_hash || proofHash !== String(compiled.validated_object_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_hash: validated_object_hash, actual_hash: proofHash, indicator: "proof_hash_mismatch" }, drift_class: "hash_drift" })
      const provenanceValidation = await validateDeploymentProvenance(env, { route: "/proof", decision_id, validated_object_hash, authority, compiledCanonicalAeo: proofCanonicalAeo, provenance, execution })
      if (!provenanceValidation.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: provenanceValidation.reason }, { event_type: provenanceValidation.drift_class === "workflow_source_drift" ? "HASH_MISMATCH" : "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { ...provenanceValidation.payload, validated_object_hash }, drift_class: provenanceValidation.drift_class })
      const attestationValidation = await validateRequestProvenanceAttestation(env, b, {
        decision_id,
        validated_object_hash,
        workflow_run_id: provenance.workflow_run_id,
        workflow_sha: provenance.workflow_sha,
        canonical_aeo_hash: proofHash,
        expected_signer_identity: String(authority.identity_id || ""),
        hmac_secret: String(env.PROVENANCE_HMAC_SECRET || env.API_KEY || "")
      })
      if (!attestationValidation.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: attestationValidation.reason }, { event_type: attestationValidation.drift_class === "replay_drift" ? "REPLAY_BLOCKED" : "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", ...attestationValidation.payload, validated_object_hash }, drift_class: attestationValidation.drift_class })
      const validatedAttestation = attestationValidation.attestation
      const authorityLineage = canonicalize({
        identity_id: String(authority.identity_id || ""),
        session_id,
        continuity_id: String(execution.continuity_id || ""),
        continuity_ancestry: continuity.ancestry || [],
        authority_id: String(authority.authority_id || ""),
        decision_id,
        validated_object_hash,
        repository: provenance.repository,
        branch: provenance.branch,
        pull_request_id: provenance.pull_request_id,
        merge_commit_sha: provenance.merge_commit_sha,
        source_tree_hash: provenance.source_tree_hash,
        workflow_run_id: provenance.workflow_run_id,
        workflow_sha: provenance.workflow_sha,
        validation_id: String(validation.validation_id || ""),
        validation_status: String(validation.status || "")
      })
      const executionLineage = canonicalize({
        identity_id: String(authority.identity_id || ""),
        session_id,
        continuity_id: String(execution.continuity_id || ""),
        continuity_ancestry: continuity.ancestry || [],
        authority_id: String(authority.authority_id || ""),
        decision_id,
        execution_id,
        validated_object_hash,
        repository: provenance.repository,
        branch: provenance.branch,
        pull_request_id: provenance.pull_request_id,
        merge_commit_sha: provenance.merge_commit_sha,
        source_tree_hash: provenance.source_tree_hash,
        workflow_run_id: provenance.workflow_run_id,
        workflow_sha: provenance.workflow_sha,
        invocation_nonce: String(execution.invocation_nonce || ""),
        execution_status: String(execution.status || "")
      })
      try {
        const proofStatements = [
          env.DB.prepare(`INSERT INTO proof_registry (proof_id,identity_id,session_id,continuity_id,continuity_hash,execution_id,decision_id,validated_object_hash,authority_lineage,execution_lineage,surface,run_id,commit_sha,workflow,environment,created_at,repository,branch,pull_request_id,merge_commit_sha,source_tree_hash,workflow_run_id,workflow_sha)
            SELECT ?1, s.identity_id, ?2, a.continuity_id, c.continuity_hash, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?15, ?16, ?17, ?18, ?19, ?20, ?21
            FROM authority_registry a JOIN session_registry s ON s.session_id=a.session_id JOIN continuity_registry c ON c.continuity_id=a.continuity_id
            WHERE a.decision_id=?4 AND a.session_id=?2 AND a.status='EXECUTED' AND c.status='ACTIVE' AND c.expires_at>?13
              AND a.continuity_id=?14
              AND EXISTS (SELECT 1 FROM execution_registry WHERE execution_id=?3 AND decision_id=?4 AND validated_object_hash=?5 AND session_id=?2 AND continuity_id=a.continuity_id AND status='EXECUTED')
              AND EXISTS (SELECT 1 FROM validation_registry WHERE decision_id=?4 AND validated_object_hash=?5 AND session_id=?2 AND continuity_id=a.continuity_id AND status='VALID' AND result='VALID')
              AND s.continuity_status='ACTIVE' AND s.expires_at>?13`).bind(proof_id,session_id,execution_id,decision_id,validated_object_hash,authorityLineage,executionLineage,String(b.surface||""),provenance.workflow_run_id,provenance.workflow_sha,String(b.workflow||GOVERNED_WORKFLOW),String(b.environment||""),created_at,String(execution.continuity_id || ""),provenance.repository,provenance.branch,provenance.pull_request_id,provenance.merge_commit_sha,provenance.source_tree_hash,provenance.workflow_run_id,provenance.workflow_sha),
          env.DB.prepare(`UPDATE authority_registry SET status='CONSUMED' WHERE decision_id=?1 AND session_id=?2 AND status='EXECUTED' AND continuity_id=?5 AND EXISTS (SELECT 1 FROM proof_registry WHERE proof_id=?3 AND decision_id=?1 AND validated_object_hash=?4)`).bind(decision_id,session_id,proof_id,validated_object_hash,String(execution.continuity_id || ""))
        ]
        if (validatedAttestation) {
          proofStatements.push(env.DB.prepare(`INSERT INTO attestation_registry (attestation_id,envelope_hash,payload_hash,payload_type,signer_identity,decision_id,validated_object_hash,workflow_run_id,workflow_sha,canonical_aeo_hash,transparency_log_id,transparency_integrated_time,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'VALIDATED',?13)`).bind(crypto.randomUUID(), validatedAttestation.envelope_hash, validatedAttestation.payload_hash, validatedAttestation.payload_type, validatedAttestation.signer_identity, validatedAttestation.decision_id, validatedAttestation.validated_object_hash, validatedAttestation.workflow_run_id, validatedAttestation.workflow_sha, validatedAttestation.canonical_aeo_hash, validatedAttestation.transparency_log_id, validatedAttestation.transparency_integrated_time, created_at))
        }
        const proofBoundary = await env.DB.batch<any>(proofStatements)
        proofInserted = proofBoundary[0]?.meta?.changes || 0
        authorityConsumed = proofBoundary[1]?.meta?.changes || 0
      } catch {
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"proof_replay" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, proof_id, severity: "HIGH", payload: { route: "/proof", validated_object_hash, indicator: "duplicate_proof_or_transaction_conflict" }, drift_class: "replay_drift" })
      }
      if (proofInserted !== 1 || authorityConsumed !== 1) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_consumption_failed" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, proof_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/proof", proof_inserted: proofInserted, authority_consumed: authorityConsumed }, drift_class: "authority_drift" })
      await emitTelemetry(env, { event_type: "PROOF_PERSISTED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, proof_id, severity: "INFO", payload: { route: "/proof", session_id, validated_object_hash, repository: provenance.repository, branch: provenance.branch, workflow_run_id: provenance.workflow_run_id } })
      await emitTelemetry(env, { event_type: "AUTHORITY_CONSUMED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, proof_id, severity: "INFO", payload: { route: "/proof", authority_status: "CONSUMED" } })
      return json({ status:"PROVEN", result:"OK", proof_id, proof: { proof_id, identity_id: String(authority.identity_id || ""), session_id, continuity_id: String(authority.continuity_id || ""), execution_id, decision_id, validated_object_hash, repository: provenance.repository, branch: provenance.branch, pull_request_id: provenance.pull_request_id, merge_commit_sha: provenance.merge_commit_sha, source_tree_hash: provenance.source_tree_hash, workflow_run_id: provenance.workflow_run_id, workflow_sha: provenance.workflow_sha } })
    }

    return json({ status: "NULL", reason: "not_found" }, 404)
    } catch {
      return json({ status: "NULL", reason: "runtime_exception" }, 500)
    }
  }
}
