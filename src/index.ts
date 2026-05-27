type Env = { DB: D1Database, API_KEY?: string, PROVENANCE_HMAC_SECRET?: string, CANONICAL_RUNTIME_SURFACE_HASH?: string }
import type { CanonicalAEO } from "./lib/aeo-governance.ts"
import { classifyFromPredicates } from "./lib/finality-classification.js"

type LineageStage = "compile" | "validate" | "execute" | "proof"

type LineageOriginFailureReason =
  | "invalid_compile_lineage"
  | "invalid_validation_lineage"
  | "invalid_execution_lineage"
  | "orphan_validation_lineage"
  | "orphan_execution_lineage"
  | "orphan_proof_lineage"
  | "lineage_stage_mismatch"
  | "lineage_origin_mismatch"

type LineageOriginVerification = { ok: true } | { ok: false, reason: LineageOriginFailureReason }

function canonicalLineageHash(input: { lineage_stage: LineageStage, decision_id: string, validated_object_hash: string, parent_hash: string }): string {
  return JSON.stringify({
    lineage_stage: input.lineage_stage,
    decision_id: input.decision_id,
    validated_object_hash: input.validated_object_hash,
    parent_hash: input.parent_hash,
  })
}

function verifyLineageOrigin(input: {
  stage: Exclude<LineageStage, "compile">
  decision_id: string
  validated_object_hash: string
  lineage_stage: string
  lineage_origin_hash: string
  parent_compilation_hash?: string
  parent_validation_hash?: string
  parent_execution_hash?: string
  compiled_hash?: string
  validation_hash?: string
  execution_hash?: string
}): LineageOriginVerification {
  if (input.lineage_stage !== input.stage) return { ok: false, reason: "lineage_stage_mismatch" }
  if (input.stage === "validate") {
    if (!input.compiled_hash) return { ok: false, reason: "orphan_validation_lineage" }
    if (!input.parent_compilation_hash || input.parent_compilation_hash !== input.compiled_hash) return { ok: false, reason: "invalid_compile_lineage" }
    const expected = canonicalLineageHash({ lineage_stage: "validate", decision_id: input.decision_id, validated_object_hash: input.validated_object_hash, parent_hash: input.parent_compilation_hash })
    if (input.lineage_origin_hash !== expected) return { ok: false, reason: "lineage_origin_mismatch" }
    return { ok: true }
  }
  if (input.stage === "execute") {
    if (!input.validation_hash) return { ok: false, reason: "orphan_execution_lineage" }
    if (!input.parent_validation_hash || input.parent_validation_hash !== input.validation_hash) return { ok: false, reason: "invalid_validation_lineage" }
    const expected = canonicalLineageHash({ lineage_stage: "execute", decision_id: input.decision_id, validated_object_hash: input.validated_object_hash, parent_hash: input.parent_validation_hash })
    if (input.lineage_origin_hash !== expected) return { ok: false, reason: "lineage_origin_mismatch" }
    return { ok: true }
  }
  if (!input.execution_hash) return { ok: false, reason: "orphan_proof_lineage" }
  if (!input.parent_execution_hash || input.parent_execution_hash !== input.execution_hash) return { ok: false, reason: "invalid_execution_lineage" }
  const expected = canonicalLineageHash({ lineage_stage: "proof", decision_id: input.decision_id, validated_object_hash: input.validated_object_hash, parent_hash: input.parent_execution_hash })
  if (input.lineage_origin_hash !== expected) return { ok: false, reason: "lineage_origin_mismatch" }
  return { ok: true }
}




type GovernCandidate = {
  intent: string
  scope: Record<string, unknown>
  target: Record<string, unknown>
  finality: Record<string, unknown>
}
type GovernedToolEnvelope = {
  candidate_hash: string
  nonce_binding: string
  policy_digest: string
  topology_digest: string
  lineage_pointers: { decision_id: string, continuity_id: string, authority_id?: string }
  timestamp: string
  non_operative: true
  tool_surface_descriptor: { route: string, workflow: string, executable: boolean }
}

type GovernResult = "VALID_CANDIDATE" | "NULL"

type PolicyClass = "TOOL_RUNTIME_MUTATION" | "TOOL_RECONCILIATION_READONLY" | "TOOL_UNKNOWN"

type PolicyRegistryEntry = {
  policy_class: PolicyClass
  tool_classes: readonly string[]
  authority_predicates: readonly string[]
  replay_policy: "nonce_required_single_use" | "evidence_only_no_mutation" | "deny"
  topology_visibility_required: boolean
  proof_requirements: readonly string[]
}

const POLICY_REGISTRY: Record<Exclude<PolicyClass, "TOOL_UNKNOWN">, PolicyRegistryEntry> = Object.freeze({
  TOOL_RUNTIME_MUTATION: Object.freeze({
    policy_class: "TOOL_RUNTIME_MUTATION",
    tool_classes: Object.freeze(["deploy_runtime", "runtime_mutation", "state_mutation"] as const),
    authority_predicates: Object.freeze(["authority_active", "continuity_identity_match", "compiled_hash_match", "delegated_authority_lineage_valid"] as const),
    replay_policy: "nonce_required_single_use",
    topology_visibility_required: true,
    proof_requirements: Object.freeze(["lineage_origin_hash", "proof_required_true", "validated_object_equals_executed_object"] as const)
  }),
  TOOL_RECONCILIATION_READONLY: Object.freeze({
    policy_class: "TOOL_RECONCILIATION_READONLY",
    tool_classes: Object.freeze(["reconciliation_readonly", "observability_readonly"] as const),
    authority_predicates: Object.freeze(["read_only_surface", "remote_authority_denied"] as const),
    replay_policy: "evidence_only_no_mutation",
    topology_visibility_required: false,
    proof_requirements: Object.freeze(["evidence_only_true"] as const)
  })
})

function classifyToolSurface(target: Record<string, unknown>): { tool_surface: string, policy_class: PolicyClass } {
  const surface = String(target.tool_surface || target.execution_surface || target.surface || "deploy_runtime")
  if (POLICY_REGISTRY.TOOL_RUNTIME_MUTATION.tool_classes.includes(surface)) return { tool_surface: surface, policy_class: "TOOL_RUNTIME_MUTATION" }
  if (POLICY_REGISTRY.TOOL_RECONCILIATION_READONLY.tool_classes.includes(surface)) return { tool_surface: surface, policy_class: "TOOL_RECONCILIATION_READONLY" }
  return { tool_surface: surface, policy_class: "TOOL_UNKNOWN" }
}

async function policyClassDigest(policy_class: PolicyClass): Promise<string> {
  if (policy_class === "TOOL_UNKNOWN") return ""
  return sha256Hex(canonicalize(POLICY_REGISTRY[policy_class]))
}

function parseGovernCandidate(input: unknown): { ok: true, candidate: GovernCandidate } | { ok: false, reason: string } {
  if (!isPlainRecord(input)) return { ok: false, reason: "invalid_candidate" }
  const keys = Object.keys(input)
  const allowed = ["intent", "scope", "target", "finality"]
  if (keys.some((key) => !allowed.includes(key))) return { ok: false, reason: "strict_mode_extra_top_level_field" }
  if (typeof input.intent !== "string" || input.intent.length === 0) return { ok: false, reason: "missing_intent" }
  if (!isPlainRecord(input.scope)) return { ok: false, reason: "missing_scope" }
  if (!isPlainRecord(input.target)) return { ok: false, reason: "missing_target" }
  if (!isPlainRecord(input.finality)) return { ok: false, reason: "missing_finality" }
  return { ok: true, candidate: { intent: input.intent, scope: input.scope, target: input.target, finality: input.finality } }
}
async function verifyGovernedToolEnvelopeLinkage(env: Env, decision_id: string, route: string): Promise<{ ok: true, envelope_id: string } | { ok: false, reason: string }> {
  const authority = await env.DB.prepare(`SELECT governed_tool_envelope_id FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
  const envelope_id = String(authority?.governed_tool_envelope_id || "")
  if (!envelope_id) return { ok: false, reason: "governed_tool_envelope_missing" }
  const envelope = await env.DB.prepare(`SELECT * FROM governed_tool_envelope_registry WHERE envelope_id=?1`).bind(envelope_id).first<any>()
  if (!envelope) return { ok: false, reason: "governed_tool_envelope_missing" }
  if (String(envelope.non_operative || "") !== "false" && route !== "/govern") return { ok: false, reason: "governed_tool_envelope_non_operative" }
  return { ok: true, envelope_id }
}
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

const GOVERNED_WORKFLOW = "governed-deploy.yml"
const RUNTIME_ID = "mindshift-worker-runtime" as const
const RUNTIME_VERSION = "runtime-sovereignty-v1" as const
const RUNTIME_SOVEREIGNTY_ROUTE = "/runtime/sovereignty" as const
const EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE = "/runtime/sovereignty/external-authority" as const
const INFRASTRUCTURE_DEPENDENCY_RECONCILIATION_ROUTE = "/runtime/sovereignty/infrastructure-reconciliation" as const
const BOOTSTRAP_VERIFY_ROUTE = "/runtime/bootstrap/verify" as const
const BOOTSTRAP_TOPOLOGY_ROUTE = "/runtime/bootstrap/topology" as const
const BOOTSTRAP_CHECKPOINT_ROUTE = "/runtime/bootstrap/checkpoint" as const
const GRAPH_VERIFY_ROUTE = "/registry/graph/verify" as const
const GRAPH_TOPOLOGY_ROUTE = "/registry/graph/topology" as const
const GRAPH_CHECKPOINT_ROUTE = "/registry/graph/checkpoint" as const
const GRAPH_ORPHANS_ROUTE = "/registry/graph/orphans" as const
const RECONCILIATION_CLOSURE_ROUTE = "/reconcile/closure" as const
const RECONCILIATION_CLOSURE_CHECKPOINT_ROUTE = "/reconcile/closure/checkpoint" as const
const RECONCILIATION_CLOSURE_EQUIVALENCE_ROUTE = "/reconcile/closure/equivalence" as const
const RECONCILIATION_CLOSURE_DRIFT_ROUTE = "/reconcile/closure/drift" as const
const RECONCILIATION_IMPACT_ROUTE = "/reconcile/impact" as const
const RECONCILIATION_VERDICT_ROUTE = "/reconcile/verdict" as const
const RECONCILIATION_PROPAGATION_ROUTE = "/reconcile/propagation" as const
const RECONCILIATION_TOPOLOGY_DELTA_ROUTE = "/reconcile/topology-delta" as const
const RECONCILIATION_QUARANTINE_ROUTE = "/reconcile/quarantine" as const
const RECONCILIATION_CONTAINMENT_ROUTE = "/reconcile/containment" as const
const RECONCILIATION_ISOLATION_ROUTE = "/reconcile/isolation" as const
const RECONCILIATION_FEDERATION_BOUNDARY_ROUTE = "/reconcile/federation-boundary" as const
const DELEGATION_LINEAGE_ROUTE = "/delegation/lineage" as const
const DELEGATION_CHECKPOINT_ROUTE = "/delegation/checkpoint" as const
const DELEGATION_DRIFT_ROUTE = "/delegation/drift" as const
const DELEGATION_REPLAY_ROUTE = "/delegation/replay" as const
const DELEGATION_OBSERVABILITY_ROUTES = [DELEGATION_LINEAGE_ROUTE, DELEGATION_CHECKPOINT_ROUTE, DELEGATION_DRIFT_ROUTE, DELEGATION_REPLAY_ROUTE] as const
const CONTINUOUS_FATE_ROUTES = ["/fate/continuous", "/fate/stress", "/fate/drift", "/fate/checkpoint", "/fate/topology"] as const
const RUNTIME_CONTAINMENT_VERIFY_ROUTE = "/runtime/containment/verify" as const
const RUNTIME_CONTAINMENT_ROUTES_ROUTE = "/runtime/containment/routes" as const
const RUNTIME_CONTAINMENT_DEPLOY_ROUTE = "/runtime/containment/deploy" as const
const RUNTIME_CONTAINMENT_DRIFT_ROUTE = "/runtime/containment/drift" as const
const RUNTIME_CONTAINMENT_CHECKPOINT_ROUTE = "/runtime/containment/checkpoint" as const
const ROOT_AUTHORITY_ROUTE = "/sovereignty/root-authority" as const
const ROOT_AUTHORITY_DRIFT_ROUTE = "/sovereignty/root-authority/drift" as const
const ROOT_AUTHORITY_BOUNDARY_ROUTE = "/sovereignty/root-authority/boundary" as const
const ROOT_AUTHORITY_TOPOLOGY_ROUTE = "/sovereignty/root-authority/topology" as const
const ROOT_AUTHORITY_OBSERVABILITY_ROUTES = [ROOT_AUTHORITY_ROUTE, ROOT_AUTHORITY_DRIFT_ROUTE, ROOT_AUTHORITY_BOUNDARY_ROUTE, ROOT_AUTHORITY_TOPOLOGY_ROUTE] as const
const RUNTIME_CONTAINMENT_ROUTES = [RUNTIME_CONTAINMENT_VERIFY_ROUTE, RUNTIME_CONTAINMENT_ROUTES_ROUTE, RUNTIME_CONTAINMENT_DEPLOY_ROUTE, RUNTIME_CONTAINMENT_DRIFT_ROUTE, RUNTIME_CONTAINMENT_CHECKPOINT_ROUTE] as const
const BOOTSTRAP_READY_DATABASES = new WeakSet<D1Database>()
const RUNTIME_SOVEREIGNTY_FREEZES = new WeakMap<D1Database, RuntimeSovereigntyManifest>()
const PROVENANCE_PAYLOAD_TYPE = "application/vnd.mindshift.cryptographic-provenance.v1+json"
const SESSION_TTL_MS = 3600_000
const VALIDATION_FRESHNESS_WINDOW_MS = 5 * 60_000
const PROOF_FRESHNESS_WINDOW_MS = 10 * 60_000
const SYSTEM_MAX_CONTINUITY_DEPTH = 32
const CANONICAL_RUNTIME_ROUTES = ["/session", "/continuity", "/authority", "/compile", "/validate", "/execute", "/proof"] as const
const EXECUTABLE_RUNTIME_ROUTES = Object.freeze(["/authority", "/compile", "/validate", "/execute", "/proof"] as const)
const NON_EXECUTABLE_RUNTIME_ROUTES = Object.freeze(["/session", "/continuity"] as const)
const GOVERNANCE_EVIDENCE_ROUTES = ["/preo"] as const
const OPENCLAW_GOVERN_ROUTE = "/govern" as const
const RECURSIVE_GOVERNANCE_ROUTE = "/governance/recursive/verify" as const
const RECURSIVE_GOVERNANCE_ADMISSION_ROUTE = "/governance/recursive/admit" as const
const RECURSIVE_GOVERNANCE_SELF_INTEGRITY_ROUTE = "/governance/recursive/self-integrity" as const
const RECURSIVE_GOVERNANCE_CONTAINMENT_ROUTE = "/governance/recursive/containment" as const
const RECURSIVE_GOVERNANCE_CONTAINMENT_DRIFT_ROUTE = "/governance/recursive/containment/drift" as const
const RECURSIVE_GOVERNANCE_CONTAINMENT_TOPOLOGY_ROUTE = "/governance/recursive/containment/topology" as const
const RECURSIVE_GOVERNANCE_CONTAINMENT_EQUIVALENCE_ROUTE = "/governance/recursive/containment/equivalence" as const
const RECURSIVE_GOVERNANCE_CONTAINMENT_ROUTES = [RECURSIVE_GOVERNANCE_CONTAINMENT_ROUTE, RECURSIVE_GOVERNANCE_CONTAINMENT_DRIFT_ROUTE, RECURSIVE_GOVERNANCE_CONTAINMENT_TOPOLOGY_ROUTE, RECURSIVE_GOVERNANCE_CONTAINMENT_EQUIVALENCE_ROUTE] as const
const RUNTIME_EVOLUTION_CONSENSUS_ROUTE = "/governance/evolution/consensus" as const
const TOPOLOGY_RECONCILE_ROUTE = "/topology/reconcile" as const
const TOPOLOGY_DRIFT_ROUTE = "/topology/drift" as const
const TOPOLOGY_FINGERPRINT_ROUTE = "/topology/fingerprint" as const
const TOPOLOGY_EQUIVALENCE_ROUTE = "/topology/equivalence" as const
const TOPOLOGY_OBSERVABILITY_ROUTES = [TOPOLOGY_RECONCILE_ROUTE, TOPOLOGY_DRIFT_ROUTE, TOPOLOGY_FINGERPRINT_ROUTE, TOPOLOGY_EQUIVALENCE_ROUTE] as const
const CROSS_REGISTRY_RECONCILE_ROUTE = "/registry/reconcile" as const
const CROSS_REGISTRY_RECONCILE_DRIFT_ROUTE = "/registry/reconcile/drift" as const
const CROSS_REGISTRY_RECONCILE_LINEAGE_ROUTE = "/registry/reconcile/lineage" as const
const CROSS_REGISTRY_RECONCILE_EQUIVALENCE_ROUTE = "/registry/reconcile/equivalence" as const
const CROSS_REGISTRY_RECONCILE_ORPHANS_ROUTE = "/registry/reconcile/orphans" as const
const CROSS_REGISTRY_RECONCILIATION_ROUTES = [CROSS_REGISTRY_RECONCILE_ROUTE, CROSS_REGISTRY_RECONCILE_DRIFT_ROUTE, CROSS_REGISTRY_RECONCILE_LINEAGE_ROUTE, CROSS_REGISTRY_RECONCILE_EQUIVALENCE_ROUTE, CROSS_REGISTRY_RECONCILE_ORPHANS_ROUTE] as const
const OBSERVER_CONSENSUS_ROUTE = "/observer/consensus" as const
const OBSERVER_CONSENSUS_CHECKPOINT_ROUTE = "/consensus/observer/checkpoint" as const
const OBSERVER_CONSENSUS_EQUIVALENCE_ROUTE = "/consensus/observer/equivalence" as const
const OBSERVER_CONSENSUS_EQUIVALENCE_ALIAS_ROUTE = "/observer/consensus/equivalence" as const
const OBSERVER_CONSENSUS_DRIFT_ROUTE = "/consensus/observer/drift" as const
const OBSERVER_CONSENSUS_ROUTES = [OBSERVER_CONSENSUS_ROUTE, OBSERVER_CONSENSUS_CHECKPOINT_ROUTE, OBSERVER_CONSENSUS_EQUIVALENCE_ROUTE, OBSERVER_CONSENSUS_EQUIVALENCE_ALIAS_ROUTE, OBSERVER_CONSENSUS_DRIFT_ROUTE] as const
const CONFORMANCE_RUNTIME_ROUTE = "/conformance/runtime" as const
const CONFORMANCE_EXTERNAL_ROUTE = "/conformance/external" as const
const CONFORMANCE_EQUIVALENCE_ROUTE = "/conformance/equivalence" as const
const CONFORMANCE_CHECKPOINT_ROUTE = "/conformance/checkpoint" as const

const INSTALL_BASE_METRICS_ROUTE = "/install-base/metrics" as const
const TELEMETRY_ROUTE = "/metrics" as const
const GOVERNANCE_OBSERVABILITY_ROUTE = "/observability/governance" as const
const GOVERNANCE_OBSERVABILITY_TELEMETRY_ROUTE = "/observability/governance/telemetry" as const
const GOVERNANCE_OBSERVABILITY_METRICS_ROUTE = "/observability/governance/metrics" as const
const GOVERNANCE_OBSERVABILITY_REPLAY_ROUTE = "/observability/governance/replay-rejections" as const
const GOVERNANCE_OBSERVABILITY_CONTINUITY_ROUTE = "/observability/governance/continuity-rejections" as const
const GOVERNANCE_OBSERVABILITY_WORKFLOW_DRIFT_ROUTE = "/observability/governance/workflow-integrity-drift" as const
const GOVERNANCE_OBSERVABILITY_RECONCILIATION_FAILURE_ROUTE = "/observability/governance/reconciliation-failures" as const
const GOVERNANCE_OBSERVABILITY_ROUTES = [
  GOVERNANCE_OBSERVABILITY_ROUTE,
  GOVERNANCE_OBSERVABILITY_TELEMETRY_ROUTE,
  GOVERNANCE_OBSERVABILITY_METRICS_ROUTE,
  GOVERNANCE_OBSERVABILITY_REPLAY_ROUTE,
  GOVERNANCE_OBSERVABILITY_CONTINUITY_ROUTE,
  GOVERNANCE_OBSERVABILITY_WORKFLOW_DRIFT_ROUTE,
  GOVERNANCE_OBSERVABILITY_RECONCILIATION_FAILURE_ROUTE,
] as const

const EXTERNAL_CONFORMANCE_ROUTES = [CONFORMANCE_RUNTIME_ROUTE, CONFORMANCE_EXTERNAL_ROUTE, CONFORMANCE_EQUIVALENCE_ROUTE, CONFORMANCE_CHECKPOINT_ROUTE] as const
const RUNTIME_EVOLUTION_CONSENSUS_REGISTRY = "runtime_evolution_consensus_registry" as const
const NON_EXECUTABLE_OBSERVABILITY_ROUTES = [
  ...new Set([
    RUNTIME_SOVEREIGNTY_ROUTE,
    RUNTIME_EVOLUTION_CONSENSUS_ROUTE,
    GRAPH_VERIFY_ROUTE,
    GRAPH_TOPOLOGY_ROUTE,
    GRAPH_CHECKPOINT_ROUTE,
    GRAPH_ORPHANS_ROUTE,
    RECONCILIATION_CLOSURE_ROUTE,
    RECONCILIATION_CLOSURE_CHECKPOINT_ROUTE,
    RECONCILIATION_CLOSURE_EQUIVALENCE_ROUTE,
    RECONCILIATION_CLOSURE_DRIFT_ROUTE,
    RECONCILIATION_IMPACT_ROUTE,
    RECONCILIATION_VERDICT_ROUTE,
    RECONCILIATION_PROPAGATION_ROUTE,
    RECONCILIATION_TOPOLOGY_DELTA_ROUTE,
    RECONCILIATION_QUARANTINE_ROUTE,
    RECONCILIATION_CONTAINMENT_ROUTE,
    RECONCILIATION_ISOLATION_ROUTE,
    RECONCILIATION_FEDERATION_BOUNDARY_ROUTE,
    ...DELEGATION_OBSERVABILITY_ROUTES,
    RECURSIVE_GOVERNANCE_ROUTE,
    RECURSIVE_GOVERNANCE_SELF_INTEGRITY_ROUTE,
    ...RECURSIVE_GOVERNANCE_CONTAINMENT_ROUTES,
    "/reconcile",
    "/reconcile/schedule",
    "/reconcile/report",
    "/reconcile/drift",
    "/federation/reconcile",
    "/federation/reconcile/report",
    "/federation/reconcile/drift",
    "/federation/reconcile/checkpoint",
    "/federation/reconcile/revocation",
    "/federation/reconcile/topology",
    "/federation/reconcile/distributed",
    "/federation/reconcile/compression",
    "/federation/interoperability/checkpoint",
    "/federation/conformance",
    "/federation/sovereignty/checkpoint",
    INSTALL_BASE_METRICS_ROUTE,
    TELEMETRY_ROUTE,
    ...GOVERNANCE_OBSERVABILITY_ROUTES,
    EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE,
    BOOTSTRAP_VERIFY_ROUTE,
    BOOTSTRAP_TOPOLOGY_ROUTE,
    BOOTSTRAP_CHECKPOINT_ROUTE,
    ...CONTINUOUS_FATE_ROUTES,
    ...RUNTIME_CONTAINMENT_ROUTES,
    ...ROOT_AUTHORITY_OBSERVABILITY_ROUTES,
    ...TOPOLOGY_OBSERVABILITY_ROUTES,
    ...CROSS_REGISTRY_RECONCILIATION_ROUTES,
    ...OBSERVER_CONSENSUS_ROUTES,
    ...EXTERNAL_CONFORMANCE_ROUTES,
  ]),
] as const
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
  "preo_registry",
  "runtime_topology_registry",
  "recursive_governance_containment_registry",
  "root_authority_observability_registry",
  "unauthorized_mutation_closure_registry"
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
const BOOTSTRAP_SOVEREIGNTY_REGISTRY = "bootstrap_sovereignty_registry" as const
const RECONCILIATION_CLOSURE_REGISTRY = "reconciliation_closure_registry" as const
const CONTINUOUS_FATE_REGISTRY = "continuous_fate_registry" as const
const CONTINUOUS_FATE_MAX_STRESS_DEPTH = 32
const DELEGATED_AUTHORITY_REGISTRY = "delegated_authority_registry" as const
const RUNTIME_SURFACE_CONTAINMENT_REGISTRY = "runtime_surface_containment_registry" as const
const TOPOLOGY_RECONCILIATION_REGISTRY = "topology_reconciliation_registry" as const
const LEGITIMACY_DRIFT_PROPAGATION_REGISTRY = "legitimacy_drift_propagation_registry" as const
const LEGITIMACY_QUARANTINE_REGISTRY = "legitimacy_quarantine_registry" as const
const ROOT_AUTHORITY_OBSERVABILITY_REGISTRY = "root_authority_observability_registry" as const
const RECURSIVE_GOVERNANCE_CONTAINMENT_REGISTRY = "recursive_governance_containment_registry" as const
const RUNTIME_TOPOLOGY_REGISTRY = "runtime_topology_registry" as const
const CROSS_REGISTRY_RECONCILIATION_REGISTRY = "cross_registry_reconciliation_registry" as const
const OBSERVER_ATTESTATION_REGISTRY = "observer_attestation_registry" as const
const SEMANTIC_EQUIVALENCE_REGISTRY = "semantic_equivalence_registry" as const
const PORTABLE_GOVERNANCE_CHECKPOINT_REGISTRY = "portable_governance_checkpoint_registry" as const
const EXTERNAL_CONFORMANCE_VERIFICATION_REGISTRY = "external_conformance_verification_registry" as const


const REQUIRED_SCHEMA_COLUMNS: Record<string, string[]> = {
  session_registry: ["session_id", "identity_id", "owner", "trust_tier", "continuity_status", "created_at", "expires_at"],
  continuity_registry: ["continuity_id", "identity_id", "session_id", "parent_continuity_id", "continuity_hash", "canonical_continuity", "status", "issued_at", "expires_at", "revoked_at"],
  authority_registry: ["authority_id", "decision_id", "session_id", "owner", "intent", "scope", "constraints", "expiry", "status", "created_at", "continuity_id", "identity_id", "delegated_authority_id", "parent_authority_id", "delegation_depth", "delegation_scope_subset", "delegation_expiry", "delegation_lineage_hash", "delegation_root_hash", "delegated_replay_chain_hash", "governed_tool_envelope_id"],
  aeo_registry: ["aeo_id", "authority_id", "decision_id", "canonical_aeo", "validated_object_hash", "status", "created_at", "continuity_id", "delegated_authority_id", "delegation_lineage_hash", "delegation_root_hash", "delegated_replay_chain_hash", "lineage_stage", "lineage_origin_hash", "governed_tool_envelope_id"],
  governed_tool_envelope_registry: ["envelope_id", "candidate_hash", "nonce_binding", "policy_digest", "topology_digest", "lineage_pointers", "timestamp", "non_operative", "tool_surface_descriptor", "created_at"],
  preo_registry: ["preo_id", "decision_id", "authority_id", "continuity_id", "reviewed_hash", "reviewed_tree_hash", "merge_commit_sha", "canonical_preo", "status", "created_at"],
  validation_registry: ["validation_id", "session_id", "decision_id", "validated_object_hash", "invocation_nonce", "environment", "result", "reason", "status", "created_at", "continuity_id", "delegated_authority_id", "delegated_replay_chain_hash", "parent_compilation_hash", "workflow_integrity_hash", "lineage_stage", "lineage_origin_hash"],
  execution_registry: ["execution_id", "session_id", "decision_id", "validated_object_hash", "invocation_nonce", "status", "created_at", "continuity_id", "repository", "branch", "pull_request_id", "merge_commit_sha", "source_tree_hash", "workflow_run_id", "workflow_sha", "workflow_integrity_hash", "delegated_authority_id", "delegated_replay_chain_hash", "delegation_lineage_hash", "delegation_root_hash", "parent_validation_hash", "lineage_stage", "lineage_origin_hash"],
  proof_registry: ["proof_id", "session_id", "execution_id", "decision_id", "validated_object_hash", "decision_hash", "surface", "run_id", "commit_sha", "workflow", "environment", "created_at", "continuity_id", "continuity_hash", "identity_id", "authority_lineage", "execution_lineage", "repository", "branch", "pull_request_id", "merge_commit_sha", "source_tree_hash", "workflow_run_id", "workflow_sha", "workflow_integrity_hash", "delegated_authority_id", "delegated_replay_chain_hash", "delegation_lineage_hash", "delegation_root_hash", "parent_execution_hash", "lineage_stage", "lineage_origin_hash"],
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
  recursive_governance_containment_registry: ["governance_observation_id", "governance_observation_hash", "governance_equivalence_hash", "governance_semantic_hash", "governance_topology_hash", "governance_lineage_hash", "semantic_divergence_classes", "recursive_containment_status", "governance_mutation_class", "containment_object", "evidence_only", "append_only", "replay_neutral", "non_authoritative", "executable", "deployment_capable", "creates_authority", "generated_at", "created_at"],
  runtime_sovereignty_registry: ["sovereignty_id", "sovereignty_hash", "runtime_surface_hash", "governance_surface_hash", "replay_surface_hash", "proof_surface_hash", "validator_surface_hash", "schema_hash", "migration_chain_hash", "generated_at"],
  external_authority_registry: ["sovereignty_dependency_id", "external_authority_surface", "authority_origin", "infrastructure_scope", "bootstrap_trust_hash", "sovereignty_classification", "containment_state", "observability_only", "replay_neutral", "evidence_hash", "drift_classes", "created_at"],
  bootstrap_sovereignty_registry: ["checkpoint_id", "manifest_hash", "lineage_checkpoint_hash", "deployment_lineage_root", "bootstrap_trust_root_hash", "initialization_order_hash", "startup_dependency_graph_hash", "startup_topology_hash", "replay_neutrality_hash", "conformance_status", "drift_classes", "evidence_only", "replay_neutral", "mutation_capable", "remote_authority_denied", "read_only", "generated_at", "created_at"],
  runtime_governance_lock_registry: ["lock_id", "mutation_hash", "governance_id", "lock_state", "activation_allowed", "canonical_hash", "created_at"],
  recursive_governance_replay_registry: ["replay_id", "mutation_hash", "sco_hash", "preo_hash", "governance_id", "activation_lock_id", "consumed_at"],
  runtime_evolution_consensus_registry: ["consensus_id", "mutation_hash", "canonical_hash", "governance_scope", "quorum_threshold", "approval_count", "approval_hash", "consensus_status", "replay_neutral", "evidence_only", "generated_at", "created_at"],
  legitimacy_graph_registry: ["graph_checkpoint_id", "graph_checkpoint_hash", "graph_coherence_hash", "node_count", "edge_count", "orphan_count", "drift_classes", "checkpoint_object_hash", "cross_registry_replay_continuity", "evidence_only", "replay_neutral", "mutation_capable", "remote_authority_denied", "read_only", "creates_authority", "execution_started", "generated_at", "created_at"],
  delegated_authority_registry: ["registry_id", "object_type", "delegated_authority_id", "parent_authority_id", "authority_id", "decision_id", "continuity_id", "delegation_depth", "delegation_scope_subset", "delegation_expiry", "delegation_lineage_hash", "delegation_root_hash", "delegated_replay_chain_hash", "canonical_delegation_object", "exact_object_hash", "projection_status", "revocation_reason", "evidence_only", "replay_neutral", "mutation_capable", "read_only", "created_at"],
  reconciliation_closure_registry: ["closure_id", "closure_hash", "deterministic_reconciliation_anchor", "recursive_checkpoint_identity", "reconciliation_equivalence_state", "lineage_depth", "bounded_window", "graph_checkpoint_hash", "bootstrap_checkpoint_hash", "runtime_sovereignty_checkpoint_hash", "federation_conformance_checkpoint_hash", "drift_classes", "closure_object_hash", "evidence_only", "replay_neutral", "mutation_capable", "remote_authority_denied", "read_only", "creates_authority", "execution_started", "replay_consumed", "generated_at", "created_at"],
  continuous_fate_registry: ["continuous_fate_id", "stress_window_id", "deterministic_stress_hash", "topology_stability_hash", "drift_survivability_state", "replay_mutation_vector_hash", "governance_replay_checkpoint", "runtime_stress_depth", "scenario_set_hash", "drift_classes", "checkpoint_hash", "evidence_only", "replay_neutral", "mutation_capable", "remote_authority_denied", "read_only", "creates_authority", "execution_started", "replay_consumed", "authoritative", "generated_at", "created_at"],
  runtime_surface_containment_registry: ["containment_id", "containment_hash", "route_surface_hash", "deployment_surface_hash", "package_surface_hash", "runtime_sovereignty_hash", "hidden_surface_count", "drift_classes", "evidence_only", "replay_neutral", "mutation_capable", "remote_authority_denied", "read_only", "creates_authority", "execution_started", "replay_consumed", "authoritative", "generated_at", "created_at"],
  topology_reconciliation_registry: ["reconciliation_id", "topology_hash", "governance_hash", "workflow_hash", "schema_hash", "reconciliation_hash", "traversal_hash", "classification", "drift_summary", "topology_ancestry", "merge_signal", "evidence_only", "remote_authority_denied", "replay_neutral", "mutation_capable", "read_only", "creates_authority", "execution_started", "generated_at", "created_at"],
  runtime_topology_registry: ["snapshot_id", "topology_hash", "topology_semantic_hash", "topology_boundary_hash", "topology_lineage_hash", "topology_equivalence_hash", "drift_classes", "lineage_hash", "boundary_hash", "reconciliation_timestamp", "containment_references", "topology_snapshot", "evidence_only", "replay_neutral", "executable", "deployment_capable", "creates_authority", "append_only", "created_at"],
  unauthorized_mutation_closure_registry: ["closure_id", "inventory_hash", "route_hash", "registry_hash", "evidence_only", "replay_neutral", "non_authoritative", "executable", "deployment_capable", "creates_authority", "proof_generating", "created_at"],
  cross_registry_reconciliation_registry: ["reconciliation_id", "registry_set_hash", "lineage_graph_hash", "continuity_graph_hash", "proof_graph_hash", "replay_graph_hash", "topology_binding_hash", "governance_binding_hash", "reconciliation_equivalence_hash", "drift_classes", "unresolved_edges", "orphaned_records", "containment_status", "legitimacy_status", "evidence_only", "replay_neutral", "non_authoritative", "executable", "deployment_capable", "creates_authority", "proof_generating", "generated_at", "created_at"],
  legitimacy_drift_propagation_registry: ["propagation_id", "propagation_hash", "topology_hash", "impact_hash", "merge_legitimacy_hash", "verdict_hash", "classification", "propagation_object", "impact_graph", "merge_impact", "verdict_object", "evidence_only", "replay_neutral", "mutation_capable", "read_only", "creates_authority", "executable", "deployment_capable", "proof_generating", "fail_closed_on_ambiguity", "generated_at", "created_at"],
  legitimacy_quarantine_registry: ["quarantine_id", "quarantine_hash", "containment_hash", "lineage_hash", "federation_hash", "boundary_hash", "classification", "quarantine_object", "containment_boundary", "isolation_graph", "federated_containment", "propagation_envelope", "verdict_object", "evidence_only", "replay_neutral", "mutation_capable", "read_only", "creates_authority", "executable", "deployment_capable", "proof_generating", "fail_closed_on_ambiguity", "quarantine_authoritative", "generated_at", "created_at"],
  observer_attestation_registry: ["attestation_id", "observer_id", "observed_checkpoint_hash", "semantic_hash", "topology_hash", "reconciliation_hash", "sovereignty_hash", "equivalence_hash", "drift_classes", "legitimacy_status", "attestation_hash", "observer_envelope", "evidence_only", "replay_neutral", "non_authoritative", "read_only", "mutation_capable", "creates_authority", "executable", "deployment_capable", "proof_generating", "merge_authorizing", "generated_at", "created_at"],
  semantic_equivalence_registry: ["semantic_equivalence_id", "semantic_hash", "schema_semantic_hash", "topology_semantic_hash", "governance_semantic_hash", "portability_semantic_hash", "equivalence_hash", "drift_classes", "legitimacy_status", "semantic_envelope", "evidence_only", "replay_neutral", "non_authoritative", "read_only", "mutation_capable", "creates_authority", "executable", "deployment_capable", "proof_generating", "merge_authorizing", "generated_at", "created_at"],
  portable_governance_checkpoint_registry: ["checkpoint_id", "checkpoint_hash", "reconciliation_hash", "topology_hash", "semantic_equivalence_hash", "conformance_hash", "portable_envelope", "dsse_payload_type", "jcs_canonical", "drift_classes", "legitimacy_status", "evidence_only", "replay_neutral", "non_authoritative", "read_only", "mutation_capable", "creates_authority", "executable", "deployment_capable", "proof_generating", "merge_authorizing", "generated_at", "created_at"],
  external_conformance_verification_registry: ["verification_id", "runtime_compatibility_hash", "governance_semantic_hash", "checkpoint_equivalence_hash", "federated_conformance_hash", "conformance_status", "drift_classes", "verification_envelope", "evidence_only", "replay_neutral", "non_authoritative", "read_only", "mutation_capable", "creates_authority", "executable", "deployment_capable", "proof_generating", "merge_authorizing", "remote_authority_denied", "generated_at", "created_at"],
  install_base_telemetry_registry: ["event_id", "event_type", "decision_id", "authority_id", "execution_id", "proof_id", "lineage_origin_hash", "lineage_origin_match", "evidence_only", "non_authoritative", "append_only", "payload", "created_at"]
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

type TelemetryEventType = "SESSION_CREATED" | "CONTINUITY_CREATED" | "AUTHORITY_CREATED" | "AEO_COMPILED" | "VALIDATION_GRANTED" | "VALIDATION_REJECTED" | "EXECUTION_STARTED" | "EXECUTION_COMPLETED" | "PROOF_PERSISTED" | "REPLAY_BLOCKED" | "HASH_MISMATCH" | "AUTHORITY_CONSUMED" | "INSTALL_BASE_TELEMETRY_WRITE_FAILED"
type InstallBaseTelemetryEventType = "governed_execution_attempted" | "governed_execution_completed" | "validated_execution" | "proof_generated" | "execution_surface_observed" | "invalid_execution_blocked" | "replay_rejected" | "hash_mismatch_rejected" | "expired_authority_rejected" | "policy_violation_rejected" | "continuity_rejected" | "orphaned_lineage_observed" | "revocation_propagation_observed" | "continuity_expiry_rejected" | "stale_lineage_rejected" | "reconciliation_failure_detected" | "distributed_disagreement_observed" | "quorum_collapse_observed" | "temporal_divergence_observed" | "proof_lineage_conflict_observed" | "proof_rejected" | "workflow_integrity_drift"


type RecursiveMutationClass = "runtime_route_mutation" | "validator_mutation" | "schema_mutation" | "authority_semantics_mutation" | "proof_semantics_mutation" | "replay_semantics_mutation" | "policy_mutation" | "observability_mutation" | "federation_semantics_mutation" | "governance_surface_expansion"
type RecursiveGovernanceState = "GOVERNANCE_OBSERVED" | "GOVERNANCE_VALIDATED" | "GOVERNANCE_QUARANTINED" | "GOVERNANCE_REJECTED" | "NULL"
type DelegatedAuthorityDriftClass = "delegated_lineage_drift" | "delegated_scope_expansion" | "orphaned_delegated_execution" | "delegated_replay_resurrection" | "delegated_revocation_failure" | "delegated_exact_object_drift" | "delegation_root_divergence" | "delegated_authority_fragmentation" | "recursive_delegation_instability"

type DelegatedAuthorityObject = {
  delegated_authority_id: string
  parent_authority_id: string
  authority_id: string
  decision_id: string
  continuity_id: string
  delegation_depth: number
  delegation_scope_subset: Record<string, unknown>
  delegation_expiry: string
  delegation_lineage_hash: string
  delegation_root_hash: string
  delegated_replay_chain_hash: string
  exact_object_hash: string
}

type DelegationChainEnvelope = { object_type: "DelegationChainEnvelope", chain: DelegatedAuthorityObject[], drift_classes: DelegatedAuthorityDriftClass[], evidence_only: true, replay_neutral: true }
type DelegatedRevocationProjection = { object_type: "DelegatedRevocationProjection", delegated_authority_id: string, delegation_lineage_hash: string, projection_status: "REVOKED" | "EXPIRED", revocation_reason: string, evidence_only: true, replay_neutral: true }
type DelegatedReplayEnvelope = { object_type: "DelegatedReplayEnvelope", delegated_authority_id: string, delegated_replay_chain_hash: string, replay_consumed: false, replay_detected: boolean, evidence_only: true, replay_neutral: true }

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

type BootstrapSovereigntyDriftClass =
  | "bootstrap_order_divergence"
  | "undeclared_bootstrap_dependency"
  | "bootstrap_authority_inheritance"
  | "initialization_surface_expansion"
  | "startup_topology_instability"
  | "deployment_root_divergence"
  | "runtime_bootstrap_corruption"
  | "recursive_bootstrap_instability"
  | "bootstrap_replay_instability"
  | "initialization_lineage_fragmentation"

type BootstrapDependencyNode = {
  dependency_id: string
  dependency_class: "runtime" | "registry" | "governance" | "infrastructure"
  declared_surface: string
  authority_granted: false
  execution_capable: false
  mutation_capable: false
  replay_neutral: true
}

type BootstrapSovereigntyManifest = {
  manifest_type: "deterministic_runtime_initialization_manifest"
  runtime_id: string
  runtime_version: string
  initialization_order: readonly string[]
  startup_dependencies: readonly BootstrapDependencyNode[]
  deployment_lineage_root: string
  bootstrap_trust_root_hash: string
  initialization_order_hash: string
  runtime_initialization_ordering_proof: string
  startup_dependency_graph_hash: string
  startup_topology_hash: string
  replay_neutrality_hash: string
  recursive_bootstrap_hash: string
  manifest_hash: string
  evidence_only: true
  replay_neutral: true
  mutation_capable: false
  remote_authority_denied: true
  read_only: true
}

type BootstrapLineageCheckpoint = {
  checkpoint_id: string
  checkpoint_type: "bootstrap_lineage_checkpoint"
  manifest_hash: string
  lineage_checkpoint_hash: string
  deployment_lineage_root: string
  bootstrap_trust_root_hash: string
  initialization_order_hash: string
  startup_dependency_graph_hash: string
  startup_topology_hash: string
  replay_neutrality_hash: string
  recursive_bootstrap_hash: string
  conformance_status: "BOOTSTRAP_CONFORMANT" | "NULL"
  drift_classes: BootstrapSovereigntyDriftClass[]
  generated_at: string
  evidence_only: true
  replay_neutral: true
  mutation_capable: false
  remote_authority_denied: true
  read_only: true
}

type RuntimeSovereigntyDriftClass =
  | "external_authority_drift"
  | "sovereignty_boundary_fragmentation"
  | "deploy_authority_escape"
  | "bootstrap_trust_divergence"
  | "undeclared_execution_surface"
  | "infrastructure_authority_expansion"
  | "hidden_mutation_surface" | BootstrapSovereigntyDriftClass | LegitimacyGraphDriftClass
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

type DriftClass = "authority_drift" | "hash_drift" | "execution_drift" | "proof_drift" | "replay_drift" | "registry_drift" | "provenance_drift" | "branch_lineage_drift" | "workflow_source_drift" | "reconciliation_failure_drift" | "recursive_ancestry_drift" | "replay_chain_drift" | "proof_lineage_drift" | "preo_ancestry_drift" | "revocation_propagation_drift" | "duplicate_lineage_hash_drift" | "orphan_legitimacy_object_drift" | "federated_lineage_drift" | "foreign_ancestry_mismatch_drift" | "scheduler_ordering_instability_drift" | "reconciliation_report_drift" | "portable_serialization_mismatch_drift" | "federated_replay_discontinuity_drift" | "deterministic_traversal_instability_drift" | "reconciliation_payload_corruption_drift" | "traversal_instability_drift" | "telemetry_payload_drift" | "attestation_drift" | "signature_drift" | "signer_identity_drift" | "payload_drift" | "transparency_drift" | "federated_checkpoint_drift" | "federated_merkle_drift" | "federated_bundle_drift" | "federated_attestation_drift" | "federated_reconciliation_drift" | "federated_runtime_divergence_drift" | "federated_replay_drift" | "federated_preo_drift" | "federated_continuity_drift" | "federated_exact_object_drift" | "federated_identifier_resolution_drift" | "federated_revocation_projection_drift" | "federated_revocation_divergence_drift" | "federated_revocation_exact_object_drift" | "federated_revocation_replay_drift" | "federated_revocation_anchor_drift" | "federated_checkpoint_revocation_drift" | "federated_expiration_visibility_drift" | "orphaned_execution" | "revoked_authority_execution" | "federated_lineage_divergence" | "replay_resurrection_attempt" | "distributed_lineage_divergence" | "checkpoint_hash_instability" | "federated_projection_corruption" | "remote_authority_claim" | "interoperability_replay_attempt" | "checkpoint_divergence" | "federated_replay_collision" | "authority_conflict" | "lineage_instability" | "topology_divergence" | "projection_corruption" | "cross_runtime_hash_mismatch" | "compression_divergence" | "reconciliation_instability" | "federated_summary_mismatch" | "topology_compression_corruption" | "replay_summary_divergence" | "semantic_conformance_drift" | "checkpoint_semantic_mismatch" | "federation_policy_divergence" | "compression_semantic_instability" | "runtime_fingerprint_mismatch" | "quorum_divergence" | "maintainer_set_drift" | "governance_replay_attempt" | "approval_hash_mismatch" | "reviewed_commit_drift" | "mutation_scope_expansion" | "runtime_evolution_bypass" | "consensus_instability" | "non_deterministic_approval_order" | "federation_authority_inheritance_attempt" | "continuous_fate_divergence" | "replay_mutation_survival" | "sovereignty_escape_detected" | "runtime_stress_instability" | "governance_replay_divergence" | "reconciliation_corruption_detected" | "topology_instability_detected" | "deterministic_stress_hash_mismatch" | "continuous_fate_checkpoint_instability" | "recursive_drift_accumulation" | RuntimeSurfaceContainmentDriftClass | DelegatedAuthorityDriftClass | "external_authority_drift" | "sovereignty_boundary_fragmentation" | "deploy_authority_escape" | "bootstrap_trust_divergence" | "undeclared_execution_surface" | "infrastructure_authority_expansion" | "hidden_mutation_surface" | BootstrapSovereigntyDriftClass | LegitimacyGraphDriftClass

type ContinuousFATEDriftClass = "continuous_fate_divergence" | "replay_mutation_survival" | "sovereignty_escape_detected" | "runtime_stress_instability" | "governance_replay_divergence" | "reconciliation_corruption_detected" | "topology_instability_detected" | "deterministic_stress_hash_mismatch" | "continuous_fate_checkpoint_instability" | "recursive_drift_accumulation"

type RuntimeSurfaceContainmentDriftClass = "hidden_execution_surface_detected" | "undeclared_mutation_surface_detected" | "runtime_route_containment_drift" | "deployment_surface_hash_drift" | "workflow_dispatch_escape_detected" | "adapter_authority_escape_detected" | "proofless_execution_surface_detected" | "canonical_route_boundary_drift" | "observability_route_execution_upgrade" | "sovereignty_containment_failure"
type UnauthorizedMutationClosureDriftClass = "UNDECLARED_MUTATION_SURFACE" | "UNCLASSIFIED_EXECUTION_SURFACE" | "UNBOUND_DATABASE_WRITE" | "UNBOUND_DEPLOYMENT_SURFACE" | "OBSERVABILITY_MUTATION_ESCALATION" | "GOVERNANCE_MUTATION_WITHOUT_SCO" | "AGENT_TOOL_MUTATION_UNCLASSIFIED" | "EXTERNAL_API_MUTATION_UNCLASSIFIED" | "RECONCILIATION_MUTATION_ESCAPE" | "PROOFLESS_MUTATION_PATH" | "AUTHORITYLESS_MUTATION_PATH" | "CLOSURE_INCOMPLETE"
type MutationSurfaceClassification = "canonical_runtime" | "governed_evidence" | "observability_only" | "external_adapter" | "webhook" | "package_script" | "workflow" | "hidden" | "NULL"
type ExecutableSurfaceInventory = { declared_canonical_routes: readonly string[], declared_executable_routes: readonly string[], declared_non_executable_runtime_routes: readonly string[], declared_observability_routes: readonly string[], route_handlers: readonly string[], undeclared_route_handlers: readonly string[], non_get_observability_handlers: readonly string[], workflow_surfaces: readonly string[], package_surfaces: readonly string[], adapter_surfaces: readonly string[], webhook_surfaces: readonly string[] }
type HiddenSurfaceProbe = { route?: string, method?: string, workflow?: string, package_command?: string, adapter?: string, webhook?: string, mutation_capable: boolean, deploy_capable: boolean, proof_bound: boolean }
type DeploymentSurfaceHash = { workflow_surface_hash: string, package_surface_hash: string, deployment_surface_hash: string }
type RouteContainmentCheckpoint = { checkpoint_hash: string, route_surface_hash: string, hidden_surface_count: number, drift_classes: RuntimeSurfaceContainmentDriftClass[] }
type RuntimeSurfaceContainmentObject = { object_type: "RuntimeSurfaceContainmentObject", inventory: ExecutableSurfaceInventory, mutation_surface_classification: Record<string, MutationSurfaceClassification>, deployment_surface_hash: DeploymentSurfaceHash, route_surface_hash: string, package_surface_hash: string, hidden_surface_count: number, drift_classes: RuntimeSurfaceContainmentDriftClass[], runtime_sovereignty_hash: string, containment_hash: string, generated_at: string }
type SovereigntyContainmentEnvelope = RuntimeSurfaceContainmentObject & { envelope_type: "SovereigntyContainmentEnvelope", checkpoint: RouteContainmentCheckpoint, evidence_only: true, replay_neutral: true, mutation_capable: false, remote_authority_denied: true, read_only: true, creates_authority: false, execution_started: false, replay_consumed: false, authoritative: false }



type GovernanceMutationClass = "SAFE_OBSERVABILITY_ONLY" | "GOVERNANCE_CONTAINED" | "GOVERNANCE_EXPANSION" | "EXECUTION_BOUNDARY_EXPANSION" | "VALIDATION_SEMANTICS_DRIFT" | "AUTHORITY_SEMANTICS_DRIFT" | "PROOF_SEMANTICS_DRIFT" | "REPLAY_SEMANTICS_DRIFT" | "FEDERATION_SEMANTICS_DRIFT" | "OBSERVABILITY_TO_AUTHORITY_ESCALATION" | "ROOT_GOVERNANCE_BYPASS_RISK" | "RECURSIVE_CONTAINMENT_REQUIRED"
type GovernanceSemanticDivergenceClass = "GOVERNANCE_EQUIVALENCE_MISMATCH" | "GOVERNANCE_TOPOLOGY_DIVERGENCE" | "GOVERNANCE_LINEAGE_ORPHANED" | "GOVERNANCE_PARENT_HASH_MISMATCH" | "VALIDATOR_OUTPUT_DRIFT" | "SCHEMA_SEMANTICS_DRIFT" | "PROOF_SEMANTICS_DRIFT" | "REPLAY_SEMANTICS_DRIFT" | "AUTHORITY_SEMANTICS_DRIFT" | "FEDERATION_SEMANTICS_DRIFT" | "EXECUTION_BOUNDARY_EXPANSION" | "OBSERVABILITY_AUTHORITY_ESCALATION" | "APPEND_ONLY_SEMANTICS_WEAKENED" | "FAIL_CLOSED_SEMANTICS_WEAKENED" | "RECURSIVE_CONTAINMENT_REQUIRED"
type RecursiveContainmentStatus = "GOVERNANCE_CONTAINED" | "RECURSIVE_CONTAINMENT_REQUIRED"

type GovernanceContainmentFlags = { evidence_only: true, append_only: true, replay_neutral: true, non_authoritative: true, executable: false, deployment_capable: false, creates_authority: false }
type GovernanceContinuityBinding = { governance_continuity_id: string, parent_governance_hash: string, governance_lineage_hash: string, recursive_lineage_verification: "VERIFIED" | "NULL" | "RECURSIVE_CONTAINMENT_REQUIRED", orphan_governance_mutation_status: "NONE" | "NULL" }
type GovernanceContainmentObject = GovernanceContainmentFlags & { object_type: "RecursiveGovernanceContainmentObject", validator_semantics: Record<string, unknown>, schema_semantics: Record<string, unknown>, proof_semantics: Record<string, unknown>, replay_semantics: Record<string, unknown>, authority_semantics: Record<string, unknown>, execution_boundary_topology: Record<string, unknown>, federation_semantics: Record<string, unknown>, observability_semantics: Record<string, unknown>, immutable_semantic_freeze: Record<string, unknown>, governance_continuity: GovernanceContinuityBinding, merge_legitimacy: "NULL" | "UNCHANGED", proof_authority: "NULL" | "UNCHANGED", execution_authority: "NULL" | "UNCHANGED" }
type RecursiveGovernanceContainmentObservation = GovernanceContainmentFlags & { governance_observation_id: string, governance_observation_hash: string, governance_equivalence_hash: string, governance_semantic_hash: string, governance_topology_hash: string, governance_lineage_hash: string, semantic_divergence_classes: GovernanceSemanticDivergenceClass[], recursive_containment_status: RecursiveContainmentStatus, governance_mutation_class: GovernanceMutationClass, containment_object: GovernanceContainmentObject, generated_at: string, created_at: string }

const GOVERNANCE_CONTAINMENT_FLAGS: GovernanceContainmentFlags = Object.freeze({ evidence_only: true, append_only: true, replay_neutral: true, non_authoritative: true, executable: false, deployment_capable: false, creates_authority: false })
const GOVERNANCE_DRIFT_TAXONOMY: readonly GovernanceSemanticDivergenceClass[] = Object.freeze(["GOVERNANCE_EQUIVALENCE_MISMATCH", "GOVERNANCE_TOPOLOGY_DIVERGENCE", "GOVERNANCE_LINEAGE_ORPHANED", "GOVERNANCE_PARENT_HASH_MISMATCH", "VALIDATOR_OUTPUT_DRIFT", "SCHEMA_SEMANTICS_DRIFT", "PROOF_SEMANTICS_DRIFT", "REPLAY_SEMANTICS_DRIFT", "AUTHORITY_SEMANTICS_DRIFT", "FEDERATION_SEMANTICS_DRIFT", "EXECUTION_BOUNDARY_EXPANSION", "OBSERVABILITY_AUTHORITY_ESCALATION", "APPEND_ONLY_SEMANTICS_WEAKENED", "FAIL_CLOSED_SEMANTICS_WEAKENED", "RECURSIVE_CONTAINMENT_REQUIRED"])
const GOVERNANCE_MUTATION_CAPABILITY_MATRIX: Record<GovernanceMutationClass, { execution_capable: false, creates_authority: false, merge_legitimacy: "NULL" | "UNCHANGED", proof_authority: "NULL" | "UNCHANGED", execution_authority: "NULL" | "UNCHANGED", fail_closed_on_ambiguity: true }> = Object.freeze(Object.fromEntries((["SAFE_OBSERVABILITY_ONLY", "GOVERNANCE_CONTAINED", "GOVERNANCE_EXPANSION", "EXECUTION_BOUNDARY_EXPANSION", "VALIDATION_SEMANTICS_DRIFT", "AUTHORITY_SEMANTICS_DRIFT", "PROOF_SEMANTICS_DRIFT", "REPLAY_SEMANTICS_DRIFT", "FEDERATION_SEMANTICS_DRIFT", "OBSERVABILITY_TO_AUTHORITY_ESCALATION", "ROOT_GOVERNANCE_BYPASS_RISK", "RECURSIVE_CONTAINMENT_REQUIRED"] as GovernanceMutationClass[]).map((classification) => [classification, { execution_capable: false, creates_authority: false, merge_legitimacy: classification === "SAFE_OBSERVABILITY_ONLY" || classification === "GOVERNANCE_CONTAINED" ? "UNCHANGED" : "NULL", proof_authority: classification === "SAFE_OBSERVABILITY_ONLY" || classification === "GOVERNANCE_CONTAINED" ? "UNCHANGED" : "NULL", execution_authority: classification === "SAFE_OBSERVABILITY_ONLY" || classification === "GOVERNANCE_CONTAINED" ? "UNCHANGED" : "NULL", fail_closed_on_ambiguity: true }])) as Record<GovernanceMutationClass, { execution_capable: false, creates_authority: false, merge_legitimacy: "NULL" | "UNCHANGED", proof_authority: "NULL" | "UNCHANGED", execution_authority: "NULL" | "UNCHANGED", fail_closed_on_ambiguity: true }>)
const IMMUTABLE_GOVERNANCE_SEMANTICS = Object.freeze({ exact_five_field_aeo_invariant: true, validated_object_equals_executed_object: true, authority_before_execution: true, replay_nonce_consumption: true, proof_lineage_binding: true, append_only_registry_guarantees: true, get_only_observability_boundary: true, fail_closed_validation_semantics: true, remote_authority_denial: true, no_secret_inspection: true })

function queryBool(url: URL, key: string, fallback: boolean): boolean {
  if (!url.searchParams.has(key)) return fallback
  const value = String(url.searchParams.get(key) || "").toLowerCase()
  return value === "true" || value === "1" || value === "yes"
}

function recursiveGovernanceContainmentStatusFlags() { return { evidence_only: true, append_only: true, replay_neutral: true, non_authoritative: true, executable: false, deployment_capable: false, creates_authority: false } }

function canonicalGovernanceContinuityBinding(url: URL): GovernanceContinuityBinding {
  const parent_governance_hash = String(url.searchParams.get("parent_governance_hash") || "canonical-root-governance")
  const expected_parent = String(url.searchParams.get("expected_parent_governance_hash") || parent_governance_hash)
  const parent_exists = queryBool(url, "parent_exists", true)
  const orphan = !parent_exists || parent_governance_hash === "" || parent_governance_hash === "NULL"
  const mismatch = !orphan && parent_governance_hash !== expected_parent
  const governance_continuity_id = String(url.searchParams.get("governance_continuity_id") || "recursive-governance-continuity")
  const governance_lineage_hash = canonicalize({ governance_continuity_id, parent_governance_hash: orphan ? "NULL" : parent_governance_hash, expected_parent })
  return { governance_continuity_id, parent_governance_hash: orphan ? "NULL" : parent_governance_hash, governance_lineage_hash, recursive_lineage_verification: orphan ? "NULL" : mismatch ? "RECURSIVE_CONTAINMENT_REQUIRED" : "VERIFIED", orphan_governance_mutation_status: orphan ? "NULL" : "NONE" }
}

function buildGovernanceContainmentObject(url: URL): GovernanceContainmentObject {
  const immutable_semantic_freeze = {
    exact_five_field_aeo_invariant: queryBool(url, "exact_five_field_aeo_invariant", true),
    validated_object_equals_executed_object: queryBool(url, "validated_object_equals_executed_object", true),
    authority_before_execution: queryBool(url, "authority_before_execution", true),
    replay_nonce_consumption: queryBool(url, "replay_nonce_consumption", true),
    proof_lineage_binding: queryBool(url, "proof_lineage_binding", true),
    append_only_registry_guarantees: queryBool(url, "append_only_registry_guarantees", queryBool(url, "append_only", true)),
    get_only_observability_boundary: queryBool(url, "get_only_observability_boundary", queryBool(url, "get_only", true)),
    fail_closed_validation_semantics: queryBool(url, "fail_closed_validation_semantics", queryBool(url, "fail_closed", true)),
    remote_authority_denial: queryBool(url, "remote_authority_denial", true),
    no_secret_inspection: queryBool(url, "no_secret_inspection", !queryBool(url, "secret_inspection", false))
  }
  return Object.freeze({
    object_type: "RecursiveGovernanceContainmentObject",
    validator_semantics: { output_contract: String(url.searchParams.get("validator_semantics") || url.searchParams.get("validator_output") || "VALID_OR_NULL_FAIL_CLOSED"), exact_object_required: immutable_semantic_freeze.validated_object_equals_executed_object },
    schema_semantics: { required_keys: String(url.searchParams.get("schema_semantics") || "EXACT_FIVE_FIELD_AEO"), fail_closed: immutable_semantic_freeze.fail_closed_validation_semantics },
    proof_semantics: { lineage_binding: immutable_semantic_freeze.proof_lineage_binding, proof_contract: String(url.searchParams.get("proof_semantics") || "PERSIST_AFTER_EXECUTION_ONLY") },
    replay_semantics: { nonce_consumption: immutable_semantic_freeze.replay_nonce_consumption, replay_contract: String(url.searchParams.get("replay_semantics") || "CONSUME_ONCE") },
    authority_semantics: { authority_before_execution: immutable_semantic_freeze.authority_before_execution, remote_authority_denial: immutable_semantic_freeze.remote_authority_denial, authority_contract: String(url.searchParams.get("authority_semantics") || "BOUND_BEFORE_EXECUTION") },
    execution_boundary_topology: { canonical_runtime_routes: [...CANONICAL_RUNTIME_ROUTES], observability_routes: [...RECURSIVE_GOVERNANCE_CONTAINMENT_ROUTES], expanded: queryBool(url, "execution_boundary_expansion", false), proposed_route: String(url.searchParams.get("route") || url.searchParams.get("target_surface") || "") },
    federation_semantics: { remote_authority_denied: immutable_semantic_freeze.remote_authority_denial, federation_contract: String(url.searchParams.get("federation_semantics") || "EVIDENCE_ONLY_NO_REMOTE_AUTHORITY") },
    observability_semantics: { evidence_only: true, replay_neutral: true, non_authoritative: !queryBool(url, "observability_authority", false), executable: false, deployment_capable: false, creates_authority: false, requested_authority: queryBool(url, "observability_authority", false) },
    immutable_semantic_freeze,
    governance_continuity: canonicalGovernanceContinuityBinding(url),
    merge_legitimacy: "UNCHANGED",
    proof_authority: "UNCHANGED",
    execution_authority: "UNCHANGED",
    ...GOVERNANCE_CONTAINMENT_FLAGS
  })
}

function governanceSemanticProjection(containment_object: GovernanceContainmentObject) {
  return { validator_semantics: containment_object.validator_semantics, schema_semantics: containment_object.schema_semantics, proof_semantics: containment_object.proof_semantics, replay_semantics: containment_object.replay_semantics, authority_semantics: containment_object.authority_semantics, federation_semantics: containment_object.federation_semantics, observability_semantics: containment_object.observability_semantics, immutable_semantic_freeze: containment_object.immutable_semantic_freeze }
}

function detectGovernanceSemanticDivergence(containment_object: GovernanceContainmentObject): GovernanceSemanticDivergenceClass[] {
  const classes = new Set<GovernanceSemanticDivergenceClass>()
  if (canonicalize(containment_object.validator_semantics) !== canonicalize({ output_contract: "VALID_OR_NULL_FAIL_CLOSED", exact_object_required: true })) classes.add("VALIDATOR_OUTPUT_DRIFT")
  if (canonicalize(containment_object.schema_semantics) !== canonicalize({ required_keys: "EXACT_FIVE_FIELD_AEO", fail_closed: true })) classes.add("SCHEMA_SEMANTICS_DRIFT")
  if (canonicalize(containment_object.proof_semantics) !== canonicalize({ lineage_binding: true, proof_contract: "PERSIST_AFTER_EXECUTION_ONLY" })) classes.add("PROOF_SEMANTICS_DRIFT")
  if (canonicalize(containment_object.replay_semantics) !== canonicalize({ nonce_consumption: true, replay_contract: "CONSUME_ONCE" })) classes.add("REPLAY_SEMANTICS_DRIFT")
  if (canonicalize(containment_object.authority_semantics) !== canonicalize({ authority_before_execution: true, remote_authority_denial: true, authority_contract: "BOUND_BEFORE_EXECUTION" })) classes.add("AUTHORITY_SEMANTICS_DRIFT")
  if (canonicalize(containment_object.federation_semantics) !== canonicalize({ remote_authority_denied: true, federation_contract: "EVIDENCE_ONLY_NO_REMOTE_AUTHORITY" })) classes.add("FEDERATION_SEMANTICS_DRIFT")
  if ((containment_object.execution_boundary_topology as any).expanded) classes.add("EXECUTION_BOUNDARY_EXPANSION")
  if ((containment_object.observability_semantics as any).requested_authority || (containment_object.observability_semantics as any).non_authoritative !== true) classes.add("OBSERVABILITY_AUTHORITY_ESCALATION")
  if (containment_object.governance_continuity.orphan_governance_mutation_status === "NULL") classes.add("GOVERNANCE_LINEAGE_ORPHANED")
  if (containment_object.governance_continuity.recursive_lineage_verification === "RECURSIVE_CONTAINMENT_REQUIRED") classes.add("GOVERNANCE_PARENT_HASH_MISMATCH")
  const freeze = containment_object.immutable_semantic_freeze as Record<string, unknown>
  for (const [key, expected] of Object.entries(IMMUTABLE_GOVERNANCE_SEMANTICS)) {
    if (freeze[key] !== expected) {
      if (key === "append_only_registry_guarantees") classes.add("APPEND_ONLY_SEMANTICS_WEAKENED")
      else if (key === "fail_closed_validation_semantics") classes.add("FAIL_CLOSED_SEMANTICS_WEAKENED")
      else if (key === "replay_nonce_consumption") classes.add("REPLAY_SEMANTICS_DRIFT")
      else if (key === "proof_lineage_binding") classes.add("PROOF_SEMANTICS_DRIFT")
      else if (key === "authority_before_execution" || key === "remote_authority_denial") classes.add("AUTHORITY_SEMANTICS_DRIFT")
      else if (key === "get_only_observability_boundary") classes.add("OBSERVABILITY_AUTHORITY_ESCALATION")
      else if (key === "no_secret_inspection") classes.add("ROOT_GOVERNANCE_BYPASS_RISK" as GovernanceSemanticDivergenceClass)
      else classes.add("SCHEMA_SEMANTICS_DRIFT")
    }
  }
  if (classes.size > 0) classes.add("RECURSIVE_CONTAINMENT_REQUIRED")
  return [...classes].filter((c) => GOVERNANCE_DRIFT_TAXONOMY.includes(c)).sort()
}

function classifyGovernanceMutation(url: URL, divergence_classes: readonly GovernanceSemanticDivergenceClass[]): GovernanceMutationClass {
  if (divergence_classes.includes("OBSERVABILITY_AUTHORITY_ESCALATION")) return "OBSERVABILITY_TO_AUTHORITY_ESCALATION"
  if (divergence_classes.includes("EXECUTION_BOUNDARY_EXPANSION")) return "EXECUTION_BOUNDARY_EXPANSION"
  if (divergence_classes.includes("VALIDATOR_OUTPUT_DRIFT") || divergence_classes.includes("SCHEMA_SEMANTICS_DRIFT") || divergence_classes.includes("FAIL_CLOSED_SEMANTICS_WEAKENED")) return "VALIDATION_SEMANTICS_DRIFT"
  if (divergence_classes.includes("AUTHORITY_SEMANTICS_DRIFT")) return "AUTHORITY_SEMANTICS_DRIFT"
  if (divergence_classes.includes("PROOF_SEMANTICS_DRIFT")) return "PROOF_SEMANTICS_DRIFT"
  if (divergence_classes.includes("REPLAY_SEMANTICS_DRIFT")) return "REPLAY_SEMANTICS_DRIFT"
  if (divergence_classes.includes("FEDERATION_SEMANTICS_DRIFT")) return "FEDERATION_SEMANTICS_DRIFT"
  if (divergence_classes.includes("GOVERNANCE_LINEAGE_ORPHANED") || divergence_classes.includes("GOVERNANCE_PARENT_HASH_MISMATCH")) return "RECURSIVE_CONTAINMENT_REQUIRED"
  const requested = String(url.searchParams.get("governance_mutation_class") || url.searchParams.get("mutation_class") || "SAFE_OBSERVABILITY_ONLY")
  if (requested === "GOVERNANCE_EXPANSION") return "GOVERNANCE_EXPANSION"
  if (requested === "GOVERNANCE_CONTAINED") return "GOVERNANCE_CONTAINED"
  if (requested === "SAFE_OBSERVABILITY_ONLY") return "SAFE_OBSERVABILITY_ONLY"
  if (requested && requested !== "observability_mutation") return "RECURSIVE_CONTAINMENT_REQUIRED"
  return "SAFE_OBSERVABILITY_ONLY"
}

async function buildRecursiveGovernanceContainmentObservation(url: URL, generated_at: string): Promise<RecursiveGovernanceContainmentObservation> {
  let containment_object = buildGovernanceContainmentObject(url)
  const semantic_divergence_classes = detectGovernanceSemanticDivergence(containment_object)
  const recursive_containment_status: RecursiveContainmentStatus = semantic_divergence_classes.length > 0 ? "RECURSIVE_CONTAINMENT_REQUIRED" : "GOVERNANCE_CONTAINED"
  const governance_mutation_class = classifyGovernanceMutation(url, semantic_divergence_classes)
  if (recursive_containment_status === "RECURSIVE_CONTAINMENT_REQUIRED" || governance_mutation_class === "RECURSIVE_CONTAINMENT_REQUIRED") containment_object = Object.freeze({ ...containment_object, merge_legitimacy: "NULL", proof_authority: "NULL", execution_authority: "NULL" })
  const governance_semantic_hash = await sha256Hex(canonicalize(governanceSemanticProjection(containment_object)))
  const governance_topology_hash = await sha256Hex(canonicalize({ execution_boundary_topology: containment_object.execution_boundary_topology, canonical_runtime_routes: [...CANONICAL_RUNTIME_ROUTES], containment_routes: [...RECURSIVE_GOVERNANCE_CONTAINMENT_ROUTES] }))
  const governance_lineage_hash = await sha256Hex(canonicalize(containment_object.governance_continuity))
  const governance_equivalence_hash = await sha256Hex(canonicalize({ governance_semantic_hash, governance_topology_hash, governance_lineage_hash, semantic_divergence_classes, governance_mutation_class }))
  const governance_observation_hash = await sha256Hex(canonicalize({ governance_equivalence_hash, containment_object, semantic_divergence_classes, recursive_containment_status, governance_mutation_class }))
  const governance_observation_id = `recursive-governance-containment:${governance_observation_hash}`
  return Object.freeze({ governance_observation_id, governance_observation_hash, governance_equivalence_hash, governance_semantic_hash, governance_topology_hash, governance_lineage_hash, semantic_divergence_classes, recursive_containment_status, governance_mutation_class, containment_object, generated_at, created_at: generated_at, ...GOVERNANCE_CONTAINMENT_FLAGS })
}

async function ensureRecursiveGovernanceContainmentRegistry(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS recursive_governance_containment_registry (governance_observation_id TEXT PRIMARY KEY, governance_observation_hash TEXT NOT NULL UNIQUE, governance_equivalence_hash TEXT NOT NULL, governance_semantic_hash TEXT NOT NULL, governance_topology_hash TEXT NOT NULL, governance_lineage_hash TEXT NOT NULL, semantic_divergence_classes TEXT NOT NULL, recursive_containment_status TEXT NOT NULL CHECK (recursive_containment_status IN ('GOVERNANCE_CONTAINED','RECURSIVE_CONTAINMENT_REQUIRED')), governance_mutation_class TEXT NOT NULL CHECK (governance_mutation_class IN ('SAFE_OBSERVABILITY_ONLY','GOVERNANCE_CONTAINED','GOVERNANCE_EXPANSION','EXECUTION_BOUNDARY_EXPANSION','VALIDATION_SEMANTICS_DRIFT','AUTHORITY_SEMANTICS_DRIFT','PROOF_SEMANTICS_DRIFT','REPLAY_SEMANTICS_DRIFT','FEDERATION_SEMANTICS_DRIFT','OBSERVABILITY_TO_AUTHORITY_ESCALATION','ROOT_GOVERNANCE_BYPASS_RISK','RECURSIVE_CONTAINMENT_REQUIRED')), containment_object TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), append_only TEXT NOT NULL CHECK (append_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_recursive_governance_containment_registry_equivalence ON recursive_governance_containment_registry(governance_equivalence_hash, governance_semantic_hash, governance_topology_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_recursive_governance_containment_registry_lineage ON recursive_governance_containment_registry(governance_lineage_hash, recursive_containment_status)`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_containment_registry_no_update BEFORE UPDATE ON recursive_governance_containment_registry BEGIN SELECT RAISE(ABORT, 'recursive_governance_containment_registry is append-only'); END`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_containment_registry_no_delete BEFORE DELETE ON recursive_governance_containment_registry BEGIN SELECT RAISE(ABORT, 'recursive_governance_containment_registry is append-only'); END`).run()
}

async function appendRecursiveGovernanceContainmentObservation(env: Env, observation: RecursiveGovernanceContainmentObservation) {
  await ensureRecursiveGovernanceContainmentRegistry(env)
  await env.DB.prepare(`INSERT OR IGNORE INTO recursive_governance_containment_registry (governance_observation_id,governance_observation_hash,governance_equivalence_hash,governance_semantic_hash,governance_topology_hash,governance_lineage_hash,semantic_divergence_classes,recursive_containment_status,governance_mutation_class,containment_object,evidence_only,append_only,replay_neutral,non_authoritative,executable,deployment_capable,creates_authority,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'true','true','true','true','false','false','false',?11,?12)`)
    .bind(observation.governance_observation_id, observation.governance_observation_hash, observation.governance_equivalence_hash, observation.governance_semantic_hash, observation.governance_topology_hash, observation.governance_lineage_hash, canonicalize(observation.semantic_divergence_classes), observation.recursive_containment_status, observation.governance_mutation_class, canonicalize(observation.containment_object), observation.generated_at, observation.created_at)
    .run()
}

type RootAuthorityClassification = "ROOT_DEPLOY_AUTHORITY" | "ROOT_REPOSITORY_AUTHORITY" | "ROOT_ENVIRONMENT_AUTHORITY" | "ROOT_WORKFLOW_AUTHORITY" | "ROOT_BRANCH_POLICY_AUTHORITY" | "ROOT_RUNTIME_CONFIGURATION_AUTHORITY" | "ROOT_FEDERATION_AUTHORITY" | "ROOT_LOCAL_EXECUTION_AUTHORITY" | "ROOT_PACKAGE_EXECUTION_AUTHORITY" | "ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY" | "UNDECLARED_ROOT_SURFACE" | "SOVEREIGNTY_DRIFT_DETECTED" | "ROOT_AUTHORITY_TOPOLOGY_DIVERGENCE" | "ROOT_AUTHORITY_BOUNDARY_OVERFLOW" | "ROOT_AUTHORITY_BYPASS_RISK" | "ROOT_AUTHORITY_CONTAINMENT_REQUIRED"
type RootAuthoritySurface = { surface_id: string, authority_origin: string, declared_boundary: string, classifications: readonly RootAuthorityClassification[], workflow_dispatch_semantics: "TRIGGER_ONLY" | "NOT_APPLICABLE", deployment_token_observability: "OBSERVABILITY_ONLY_NO_SECRET_INSPECTION" | "NOT_APPLICABLE", mutation_capability_observed: boolean, declared: boolean, observed_executable: boolean, observed_deployment_capable: boolean, observed_creates_authority: boolean, observed_secret_values_inspected: boolean, observed_secret_material_persisted: boolean, observed_secret_material: string, normalized_secret_material: "NOT_INSPECTED", normalized_executable: false, normalized_deployment_capable: false, normalized_creates_authority: false, secret_material: "NOT_INSPECTED", executable: false, deployment_capable: false, creates_authority: false }
type RootAuthorityInventory = { inventory_type: "RootAuthorityInventory", surfaces: readonly RootAuthoritySurface[], declared_root_surfaces: readonly string[], undeclared_root_surfaces: readonly string[], evidence_only: true, executable: false, deployment_capable: false, creates_authority: false, secret_values_inspected: false }
type RootAuthorityBoundary = { boundary_type: "RootAuthorityContainmentBoundary", allowed_canonical_path: readonly string[], contained_surfaces: readonly string[], overflow_surfaces: readonly string[], declared_root_surfaces: readonly string[], undeclared_root_surfaces: readonly string[], containment_status: "ROOT_AUTHORITY_CONTAINED" | "ROOT_AUTHORITY_CONTAINMENT_REQUIRED", merge_legitimacy: "NULL" | "UNCHANGED", preo_validity: "NULL" | "UNCHANGED", classification_authorizes: false, evidence_authorizes_merge: false, boundary_hash: string, evidence_only: true, non_authoritative: true, executable: false, deployment_capable: false, creates_authority: false }
type RootAuthorityDrift = { drift_type: "RootAuthorityDrift", drift_classes: RootAuthorityClassification[], containment_status: "ROOT_AUTHORITY_CONTAINED" | "ROOT_AUTHORITY_CONTAINMENT_REQUIRED", declared_root_surfaces: readonly string[], undeclared_root_surfaces: readonly string[], undeclared_surfaces: readonly string[], topology_hash: string, drift_hash: string, merge_legitimacy: "NULL" | "UNCHANGED", fail_closed: boolean, evidence_only: true, replay_neutral: true, non_authoritative: true, secret_material_persisted: false }
type RootAuthorityContainmentEnvelope = { envelope_type: "RootAuthorityContainmentEnvelope", inventory: RootAuthorityInventory, topology_hash: string, boundary: RootAuthorityBoundary, drift: RootAuthorityDrift, containment_status: "ROOT_AUTHORITY_CONTAINED" | "ROOT_AUTHORITY_CONTAINMENT_REQUIRED", declared_root_surfaces: readonly string[], undeclared_root_surfaces: readonly string[], drift_classes: RootAuthorityClassification[], containment_identity: string, containment_hash: string, generated_at: string, evidence_only: true, append_only: true, replay_neutral: true, non_authoritative: true, executable: false, deployment_capable: false, creates_authority: false, secret_values_inspected: false, secret_material_persisted: false, fail_closed_on_ambiguity: true }

type ReplayMutationVector = {
  vector_id: string
  mutation_type: "replay_resurrection_attempt" | "governance_mutation_replay" | "delegated_replay_resurrection"
  target_registry: string
  exact_object_hash: string
  replay_consumed: false
  mutation_allowed: false
  vector_hash: string
}

type SovereigntyEscapeProbe = {
  probe_id: string
  route: string
  method: string
  creates_authority: false
  execution_capable: false
  mutation_capable: false
  remote_authority_denied: true
  contained: boolean
  probe_hash: string
}

type GovernanceDriftReplayObject = {
  replay_object_id: string
  governance_replay_checkpoint: string
  exact_object_hash: string
  mutation_verified: boolean
  checkpoint_hash: string
  replay_consumed: false
}

type RuntimeStressCheckpoint = {
  checkpoint_id: string
  continuous_fate_id: string
  stress_window_id: string
  deterministic_stress_hash: string
  topology_stability_hash: string
  drift_survivability_state: "SURVIVED" | "FAIL_CLOSED" | "NULL"
  replay_mutation_vector_hash: string
  governance_replay_checkpoint: string
  runtime_stress_depth: number
  checkpoint_hash: string
  evidence_only: true
  replay_neutral: true
  mutation_capable: false
}

type FATEStressScenario = {
  scenario_id: string
  stress_class: "replay_resurrection_attempts" | "hidden_route_emergence" | "governance_mutation_replay" | "recursive_lineage_corruption" | "topology_instability" | "reconciliation_corruption" | "delegated_replay_resurrection" | "authority_fragmentation" | "proof_discontinuity" | "federation_drift_accumulation"
  deterministic_order: number
  expected_result: "NULL"
  drift_class: ContinuousFATEDriftClass
  evidence_hash: string
}

type ContinuousFATEEnvelope = {
  object_type: "ContinuousFATEEnvelope"
  continuous_fate_id: string
  stress_window_id: string
  deterministic_stress_hash: string
  topology_stability_hash: string
  drift_survivability_state: RuntimeStressCheckpoint["drift_survivability_state"]
  replay_mutation_vector_hash: string
  governance_replay_checkpoint: string
  runtime_stress_depth: number
  scenarios: FATEStressScenario[]
  replay_mutation_vectors: ReplayMutationVector[]
  sovereignty_escape_probes: SovereigntyEscapeProbe[]
  governance_drift_replay_object: GovernanceDriftReplayObject
  runtime_stress_checkpoint: RuntimeStressCheckpoint
  drift_classes: ContinuousFATEDriftClass[]
  evidence_only: true
  replay_neutral: true
  append_only: true
  authoritative: false
  mutation_capable: false
  creates_authority: false
  execution_started: false
  replay_consumed: false
  generated_at: string
}


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

const REQUIRED_AEO_KEYS = ["intent", "scope", "validation", "target", "finality"] as const

function canonicalize(v: unknown): string {
  const normalized = normalizeCanonicalValue(v)
  if (Array.isArray(normalized)) return `[${normalized.map((item) => canonicalize(item)).join(",")}]`
  if (isPlainRecord(normalized)) return `{${Object.keys(normalized).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(normalized[key])}`).join(",")}}`
  return JSON.stringify(normalized)
}

function toCanonicalAeo(input: unknown): CanonicalAEO | null {
  if (!isPlainRecord(input)) return null
  const keys = Object.keys(input).sort()
  if (keys.length !== REQUIRED_AEO_KEYS.length) return null
  if (keys.join("|") !== [...REQUIRED_AEO_KEYS].sort().join("|")) return null
  if (!String(input.intent || "")) return null
  return Object.freeze({
    intent: String(input.intent || ""),
    scope: canonicalRecord(input.scope),
    validation: canonicalRecord(input.validation),
    target: canonicalRecord(input.target),
    finality: canonicalRecord(input.finality),
  })
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

type ExecutionSnapshotInput = {
  repository_tree_hash: string
  workflow_hash: string
  topology_hash: string
  governance_hash: string
  runtime_surface_hash: string
  schema_set_hash: string
  workflow_identity: string
  replay_epoch: string
}

function executionSnapshotFrom(input: any): ExecutionSnapshotInput {
  const snapshot = input?.execution_snapshot || input || {}
  return {
    repository_tree_hash: String(snapshot.repository_tree_hash || ""),
    workflow_hash: String(snapshot.workflow_hash || ""),
    topology_hash: String(snapshot.topology_hash || ""),
    governance_hash: String(snapshot.governance_hash || ""),
    runtime_surface_hash: String(snapshot.runtime_surface_hash || ""),
    schema_set_hash: String(snapshot.schema_set_hash || ""),
    workflow_identity: String(snapshot.workflow_identity || snapshot.workflow_path || ""),
    replay_epoch: String(snapshot.replay_epoch || "")
  }
}

function missingExecutionSnapshotFields(snapshot: ExecutionSnapshotInput): string[] {
  return Object.entries(snapshot).filter(([, value]) => !value).map(([key]) => key)
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

function proofDecisionHash(decision_id: string, validated_object_hash: string) {
  return `${decision_id}\u001f${validated_object_hash}`
}


async function assertSchemaAvailableReadOnly(env: Env) {
  await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='session_registry'`).first<any>()
}

async function ensureSchema(env: Env, options: { stabilizeProofRegistry?: boolean } = {}) {
  if (options.stabilizeProofRegistry !== false && BOOTSTRAP_READY_DATABASES.has(env.DB)) return
  try {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS session_registry (session_id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, owner TEXT NOT NULL, trust_tier TEXT NOT NULL, continuity_status TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_session_registry_status_expiry ON session_registry(continuity_status, expires_at)`,
      `CREATE TABLE IF NOT EXISTS continuity_registry (continuity_id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, session_id TEXT NOT NULL, parent_continuity_id TEXT, continuity_hash TEXT NOT NULL, canonical_continuity TEXT NOT NULL, status TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, UNIQUE(continuity_hash))`,
      `CREATE INDEX IF NOT EXISTS idx_continuity_registry_session_identity ON continuity_registry(session_id, identity_id, status, expires_at)`,
      `CREATE TABLE IF NOT EXISTS authority_registry (authority_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL UNIQUE, session_id TEXT NOT NULL, owner TEXT NOT NULL, intent TEXT NOT NULL, scope TEXT NOT NULL, constraints TEXT NOT NULL, expiry TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT, identity_id TEXT, delegated_authority_id TEXT, parent_authority_id TEXT, delegation_depth TEXT, delegation_scope_subset TEXT, delegation_expiry TEXT, delegation_lineage_hash TEXT, delegation_root_hash TEXT, delegated_replay_chain_hash TEXT, governed_tool_envelope_id TEXT)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_authority_registry_decision_unique ON authority_registry(decision_id)`,
      `CREATE TABLE IF NOT EXISTS aeo_registry (aeo_id TEXT PRIMARY KEY, authority_id TEXT NOT NULL, decision_id TEXT NOT NULL, canonical_aeo TEXT NOT NULL, validated_object_hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT, workflow_integrity_hash TEXT, delegated_authority_id TEXT, delegation_lineage_hash TEXT, delegation_root_hash TEXT, delegated_replay_chain_hash TEXT, lineage_stage TEXT, lineage_origin_hash TEXT, governed_tool_envelope_id TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_aeo_registry_decision_hash ON aeo_registry(decision_id, validated_object_hash)`,
      `CREATE TABLE IF NOT EXISTS preo_registry (preo_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL, authority_id TEXT NOT NULL, continuity_id TEXT NOT NULL, reviewed_hash TEXT NOT NULL, reviewed_tree_hash TEXT, merge_commit_sha TEXT, canonical_preo TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(decision_id, reviewed_hash))`,
      `CREATE INDEX IF NOT EXISTS idx_preo_registry_decision_hash ON preo_registry(decision_id, reviewed_hash)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_preo_registry_lineage_unique ON preo_registry(decision_id, reviewed_hash, reviewed_tree_hash, merge_commit_sha)`,
      `CREATE TABLE IF NOT EXISTS validation_registry (validation_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, environment TEXT, result TEXT NOT NULL, reason TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT, delegated_authority_id TEXT, delegated_replay_chain_hash TEXT, parent_compilation_hash TEXT, workflow_integrity_hash TEXT, lineage_stage TEXT, lineage_origin_hash TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_validation_registry_decision_hash_nonce ON validation_registry(decision_id, validated_object_hash, invocation_nonce)`,
      `CREATE TABLE IF NOT EXISTS execution_registry (execution_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT, repository TEXT, branch TEXT, pull_request_id TEXT, merge_commit_sha TEXT, source_tree_hash TEXT, workflow_run_id TEXT, workflow_sha TEXT, workflow_integrity_hash TEXT, delegated_authority_id TEXT, delegated_replay_chain_hash TEXT, delegation_lineage_hash TEXT, delegation_root_hash TEXT, parent_validation_hash TEXT, lineage_stage TEXT, lineage_origin_hash TEXT, UNIQUE(decision_id, validated_object_hash), UNIQUE(continuity_id, decision_id, validated_object_hash), UNIQUE(workflow_run_id))`,
      `CREATE INDEX IF NOT EXISTS idx_execution_registry_decision_hash ON execution_registry(decision_id, validated_object_hash)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_registry_workflow_run_unique ON execution_registry(workflow_run_id)`,
      `CREATE TABLE IF NOT EXISTS proof_registry (proof_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, execution_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, decision_hash TEXT, surface TEXT, run_id TEXT, commit_sha TEXT, workflow TEXT, environment TEXT, created_at TEXT NOT NULL, continuity_id TEXT, continuity_hash TEXT, identity_id TEXT, authority_lineage TEXT, execution_lineage TEXT, repository TEXT, branch TEXT, pull_request_id TEXT, merge_commit_sha TEXT, source_tree_hash TEXT, workflow_run_id TEXT, workflow_sha TEXT, workflow_integrity_hash TEXT, delegated_authority_id TEXT, delegated_replay_chain_hash TEXT, delegation_lineage_hash TEXT, delegation_root_hash TEXT, parent_execution_hash TEXT, lineage_stage TEXT, lineage_origin_hash TEXT, UNIQUE(execution_id, decision_id, validated_object_hash), UNIQUE(workflow_run_id))`,
      `CREATE TABLE IF NOT EXISTS proof_propagation_outbox (outbox_id TEXT PRIMARY KEY, proof_id TEXT NOT NULL UNIQUE, decision_id TEXT NOT NULL, execution_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('PENDING','PUBLISHED','NULL')), publish_attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, published_at TEXT, created_at TEXT NOT NULL, replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), fail_closed TEXT NOT NULL CHECK (fail_closed='true'), FOREIGN KEY (proof_id) REFERENCES proof_registry(proof_id))`,
      `CREATE INDEX IF NOT EXISTS idx_proof_registry_execution_decision_hash ON proof_registry(execution_id, decision_id, validated_object_hash)`,
            `CREATE TABLE IF NOT EXISTS proof_registry_duplicate_archive (archive_id TEXT PRIMARY KEY, proof_id TEXT NOT NULL, session_id TEXT NOT NULL, execution_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, surface TEXT, run_id TEXT, commit_sha TEXT, workflow TEXT, environment TEXT, created_at TEXT NOT NULL, archived_at TEXT NOT NULL, archive_reason TEXT NOT NULL, canonical_proof_id TEXT NOT NULL, UNIQUE(proof_id))`,
      `CREATE TABLE IF NOT EXISTS proof_quarantine_registry (quarantine_id TEXT PRIMARY KEY, proof_id TEXT NOT NULL, lineage_hash TEXT NOT NULL, quarantine_reason TEXT NOT NULL, canonical_proof_selected TEXT NOT NULL, duplicate_proof_archived TEXT NOT NULL, quarantine_generated_at TEXT NOT NULL, replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), evidence_only TEXT NOT NULL CHECK (evidence_only='true'))`,
      `CREATE TABLE IF NOT EXISTS governed_tool_envelope_registry (envelope_id TEXT PRIMARY KEY, candidate_hash TEXT NOT NULL, nonce_binding TEXT NOT NULL UNIQUE, policy_digest TEXT NOT NULL, topology_digest TEXT NOT NULL, lineage_pointers TEXT NOT NULL, timestamp TEXT NOT NULL, non_operative TEXT NOT NULL CHECK (non_operative IN ('true','false')), tool_surface_descriptor TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS invocation_registry (decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT, PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_invocation_registry_nonce_once ON invocation_registry(decision_id, validated_object_hash, invocation_nonce)`,
      `CREATE TABLE IF NOT EXISTS execution_snapshot_registry (snapshot_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL, continuity_id TEXT NOT NULL, authority_id TEXT NOT NULL, repository_tree_hash TEXT NOT NULL, workflow_hash TEXT NOT NULL, governance_hash TEXT NOT NULL, topology_hash TEXT NOT NULL, runtime_surface_hash TEXT NOT NULL, schema_set_hash TEXT NOT NULL, workflow_identity TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, replay_epoch TEXT NOT NULL, status TEXT NOT NULL, execution_id TEXT, proof_id TEXT, created_at TEXT NOT NULL, UNIQUE(decision_id, validated_object_hash, invocation_nonce), UNIQUE(execution_id), UNIQUE(proof_id))`,
      `CREATE INDEX IF NOT EXISTS idx_execution_snapshot_registry_lineage ON execution_snapshot_registry(decision_id, continuity_id, authority_id, invocation_nonce, replay_epoch)`,
      `CREATE TABLE IF NOT EXISTS attestation_registry (attestation_id TEXT PRIMARY KEY, envelope_hash TEXT NOT NULL, payload_hash TEXT NOT NULL, payload_type TEXT NOT NULL, signer_identity TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, workflow_run_id TEXT NOT NULL, workflow_sha TEXT NOT NULL, canonical_aeo_hash TEXT NOT NULL, transparency_log_id TEXT NOT NULL, transparency_integrated_time TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(envelope_hash), UNIQUE(workflow_run_id), UNIQUE(decision_id, validated_object_hash))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_envelope_hash_unique ON attestation_registry(envelope_hash)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_workflow_run_unique ON attestation_registry(workflow_run_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_decision_object_unique ON attestation_registry(decision_id, validated_object_hash)`,
      `CREATE TABLE IF NOT EXISTS delegated_authority_registry (registry_id TEXT PRIMARY KEY, object_type TEXT NOT NULL CHECK (object_type IN ('DelegatedAuthorityObject','DelegationChainEnvelope','DelegatedRevocationProjection','DelegatedReplayEnvelope')), delegated_authority_id TEXT NOT NULL, parent_authority_id TEXT NOT NULL, authority_id TEXT, decision_id TEXT, continuity_id TEXT, delegation_depth TEXT NOT NULL, delegation_scope_subset TEXT NOT NULL, delegation_expiry TEXT NOT NULL, delegation_lineage_hash TEXT NOT NULL, delegation_root_hash TEXT NOT NULL, delegated_replay_chain_hash TEXT NOT NULL, canonical_delegation_object TEXT NOT NULL, exact_object_hash TEXT NOT NULL, projection_status TEXT NOT NULL CHECK (projection_status IN ('ACTIVE','REVOKED','EXPIRED','OBSERVED','NULL')), revocation_reason TEXT, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), read_only TEXT NOT NULL CHECK (read_only='true'), created_at TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_delegated_authority_registry_exact_object ON delegated_authority_registry(exact_object_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_delegated_authority_registry_lineage ON delegated_authority_registry(delegated_authority_id, parent_authority_id, delegation_lineage_hash, delegation_root_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_delegated_authority_registry_replay ON delegated_authority_registry(delegated_authority_id, delegated_replay_chain_hash, projection_status)`,
      `CREATE TABLE IF NOT EXISTS observability_registry (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, decision_id TEXT, authority_id TEXT, execution_id TEXT, proof_id TEXT, severity TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS install_base_telemetry_registry (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL CHECK (event_type IN ('governed_execution_attempted','governed_execution_completed','validated_execution','proof_generated','execution_surface_observed','invalid_execution_blocked','replay_rejected','hash_mismatch_rejected','expired_authority_rejected','policy_violation_rejected','continuity_rejected','orphaned_lineage_observed','revocation_propagation_observed','continuity_expiry_rejected','stale_lineage_rejected','reconciliation_failure_detected','distributed_disagreement_observed','quorum_collapse_observed','temporal_divergence_observed','proof_lineage_conflict_observed','proof_rejected','workflow_integrity_drift')), decision_id TEXT, authority_id TEXT, execution_id TEXT, proof_id TEXT, lineage_origin_hash TEXT, lineage_origin_match TEXT NOT NULL CHECK (lineage_origin_match IN ('MATCH','MISMATCH','UNKNOWN')), evidence_only TEXT NOT NULL CHECK (evidence_only='true'), non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'), append_only TEXT NOT NULL CHECK (append_only='true'), payload TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_install_base_telemetry_registry_type_created ON install_base_telemetry_registry(event_type, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_install_base_telemetry_registry_decision ON install_base_telemetry_registry(decision_id)`,
      `CREATE TRIGGER IF NOT EXISTS trg_install_base_telemetry_registry_no_update BEFORE UPDATE ON install_base_telemetry_registry BEGIN SELECT RAISE(ABORT, 'install_base_telemetry_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_install_base_telemetry_registry_no_delete BEFORE DELETE ON install_base_telemetry_registry BEGIN SELECT RAISE(ABORT, 'install_base_telemetry_registry is append-only'); END`,
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
      `CREATE TABLE IF NOT EXISTS recursive_governance_containment_registry (governance_observation_id TEXT PRIMARY KEY, governance_observation_hash TEXT NOT NULL UNIQUE, governance_equivalence_hash TEXT NOT NULL, governance_semantic_hash TEXT NOT NULL, governance_topology_hash TEXT NOT NULL, governance_lineage_hash TEXT NOT NULL, semantic_divergence_classes TEXT NOT NULL, recursive_containment_status TEXT NOT NULL CHECK (recursive_containment_status IN ('GOVERNANCE_CONTAINED','RECURSIVE_CONTAINMENT_REQUIRED')), governance_mutation_class TEXT NOT NULL CHECK (governance_mutation_class IN ('SAFE_OBSERVABILITY_ONLY','GOVERNANCE_CONTAINED','GOVERNANCE_EXPANSION','EXECUTION_BOUNDARY_EXPANSION','VALIDATION_SEMANTICS_DRIFT','AUTHORITY_SEMANTICS_DRIFT','PROOF_SEMANTICS_DRIFT','REPLAY_SEMANTICS_DRIFT','FEDERATION_SEMANTICS_DRIFT','OBSERVABILITY_TO_AUTHORITY_ESCALATION','ROOT_GOVERNANCE_BYPASS_RISK','RECURSIVE_CONTAINMENT_REQUIRED')), containment_object TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), append_only TEXT NOT NULL CHECK (append_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_recursive_governance_containment_registry_equivalence ON recursive_governance_containment_registry(governance_equivalence_hash, governance_semantic_hash, governance_topology_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_recursive_governance_containment_registry_lineage ON recursive_governance_containment_registry(governance_lineage_hash, recursive_containment_status)`,
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
      `CREATE TABLE IF NOT EXISTS bootstrap_sovereignty_registry (checkpoint_id TEXT PRIMARY KEY, manifest_hash TEXT NOT NULL, lineage_checkpoint_hash TEXT NOT NULL, deployment_lineage_root TEXT NOT NULL, bootstrap_trust_root_hash TEXT NOT NULL, initialization_order_hash TEXT NOT NULL, startup_dependency_graph_hash TEXT NOT NULL, startup_topology_hash TEXT NOT NULL, replay_neutrality_hash TEXT NOT NULL, conformance_status TEXT NOT NULL CHECK (conformance_status IN ('BOOTSTRAP_CONFORMANT','NULL')), drift_classes TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), read_only TEXT NOT NULL CHECK (read_only='true'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_bootstrap_sovereignty_registry_manifest ON bootstrap_sovereignty_registry(manifest_hash, lineage_checkpoint_hash, conformance_status)`,
      `CREATE INDEX IF NOT EXISTS idx_bootstrap_sovereignty_registry_topology ON bootstrap_sovereignty_registry(deployment_lineage_root, bootstrap_trust_root_hash, startup_topology_hash)`,
      `CREATE TABLE IF NOT EXISTS legitimacy_graph_registry (graph_checkpoint_id TEXT PRIMARY KEY, graph_checkpoint_hash TEXT NOT NULL, graph_coherence_hash TEXT NOT NULL, node_count TEXT NOT NULL, edge_count TEXT NOT NULL, orphan_count TEXT NOT NULL, drift_classes TEXT NOT NULL, checkpoint_object_hash TEXT NOT NULL, cross_registry_replay_continuity TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), execution_started TEXT NOT NULL CHECK (execution_started='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS reconciliation_closure_registry (closure_id TEXT PRIMARY KEY, closure_hash TEXT NOT NULL, deterministic_reconciliation_anchor TEXT NOT NULL, recursive_checkpoint_identity TEXT NOT NULL, reconciliation_equivalence_state TEXT NOT NULL CHECK (reconciliation_equivalence_state IN ('RECONCILIATION_EQUIVALENT','RECONCILIATION_DRIFT','NULL')), lineage_depth TEXT NOT NULL, bounded_window TEXT NOT NULL, graph_checkpoint_hash TEXT NOT NULL, bootstrap_checkpoint_hash TEXT NOT NULL, runtime_sovereignty_checkpoint_hash TEXT NOT NULL, federation_conformance_checkpoint_hash TEXT NOT NULL, drift_classes TEXT NOT NULL, closure_object_hash TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), execution_started TEXT NOT NULL CHECK (execution_started='false'), replay_consumed TEXT NOT NULL CHECK (replay_consumed='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_reconciliation_closure_registry_hash ON reconciliation_closure_registry(closure_hash, recursive_checkpoint_identity, reconciliation_equivalence_state)`,
      `CREATE INDEX IF NOT EXISTS idx_reconciliation_closure_registry_bindings ON reconciliation_closure_registry(graph_checkpoint_hash, bootstrap_checkpoint_hash, runtime_sovereignty_checkpoint_hash, federation_conformance_checkpoint_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_reconciliation_closure_registry_drift ON reconciliation_closure_registry(reconciliation_equivalence_state, bounded_window)`,
      `CREATE TABLE IF NOT EXISTS continuous_fate_registry (continuous_fate_id TEXT PRIMARY KEY, stress_window_id TEXT NOT NULL, deterministic_stress_hash TEXT NOT NULL, topology_stability_hash TEXT NOT NULL, drift_survivability_state TEXT NOT NULL CHECK (drift_survivability_state IN ('SURVIVED','FAIL_CLOSED','NULL')), replay_mutation_vector_hash TEXT NOT NULL, governance_replay_checkpoint TEXT NOT NULL, runtime_stress_depth TEXT NOT NULL, scenario_set_hash TEXT NOT NULL, drift_classes TEXT NOT NULL, checkpoint_hash TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), execution_started TEXT NOT NULL CHECK (execution_started='false'), replay_consumed TEXT NOT NULL CHECK (replay_consumed='false'), authoritative TEXT NOT NULL CHECK (authoritative='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_continuous_fate_registry_checkpoint_unique ON continuous_fate_registry(checkpoint_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_continuous_fate_registry_deterministic ON continuous_fate_registry(stress_window_id, deterministic_stress_hash, topology_stability_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_continuous_fate_registry_replay_checkpoint ON continuous_fate_registry(replay_mutation_vector_hash, governance_replay_checkpoint)`,
      `CREATE TABLE IF NOT EXISTS runtime_surface_containment_registry (containment_id TEXT PRIMARY KEY, containment_hash TEXT NOT NULL UNIQUE, route_surface_hash TEXT NOT NULL, deployment_surface_hash TEXT NOT NULL, package_surface_hash TEXT NOT NULL, runtime_sovereignty_hash TEXT NOT NULL, hidden_surface_count INTEGER NOT NULL, drift_classes TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), execution_started TEXT NOT NULL CHECK (execution_started='false'), replay_consumed TEXT NOT NULL CHECK (replay_consumed='false'), authoritative TEXT NOT NULL CHECK (authoritative='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_runtime_surface_containment_registry_routes ON runtime_surface_containment_registry(route_surface_hash, hidden_surface_count)`,
      `CREATE INDEX IF NOT EXISTS idx_runtime_surface_containment_registry_deploy ON runtime_surface_containment_registry(deployment_surface_hash, package_surface_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_runtime_surface_containment_registry_sovereignty ON runtime_surface_containment_registry(runtime_sovereignty_hash, containment_hash)`,
      `CREATE TABLE IF NOT EXISTS topology_reconciliation_registry (reconciliation_id TEXT PRIMARY KEY, topology_hash TEXT NOT NULL, governance_hash TEXT NOT NULL, workflow_hash TEXT NOT NULL, schema_hash TEXT NOT NULL, reconciliation_hash TEXT NOT NULL, traversal_hash TEXT NOT NULL, classification TEXT NOT NULL CHECK (classification IN ('TOPOLOGY_VALID','TOPOLOGY_DRIFT','UNDECLARED_SURFACE','SCHEMA_DIVERGENCE','WORKFLOW_EXPANSION','GOVERNANCE_MISMATCH')), drift_summary TEXT NOT NULL, topology_ancestry TEXT NOT NULL, merge_signal TEXT NOT NULL CHECK (merge_signal IN ('SAFE_TO_MERGE','TOPOLOGY_DRIFT','GOVERNANCE_DIVERGENCE','UNDECLARED_EXECUTION_SURFACE')), evidence_only TEXT NOT NULL CHECK (evidence_only='true'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), execution_started TEXT NOT NULL CHECK (execution_started='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_topology_reconciliation_registry_hash_unique ON topology_reconciliation_registry(reconciliation_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_topology_reconciliation_registry_classification ON topology_reconciliation_registry(classification, merge_signal)`,
      `CREATE INDEX IF NOT EXISTS idx_topology_reconciliation_registry_topology ON topology_reconciliation_registry(topology_hash, governance_hash, workflow_hash, schema_hash)`,
      `CREATE TABLE IF NOT EXISTS runtime_topology_registry (snapshot_id TEXT PRIMARY KEY, topology_hash TEXT NOT NULL, topology_semantic_hash TEXT NOT NULL, topology_boundary_hash TEXT NOT NULL, topology_lineage_hash TEXT NOT NULL, topology_equivalence_hash TEXT NOT NULL UNIQUE, drift_classes TEXT NOT NULL, lineage_hash TEXT NOT NULL, boundary_hash TEXT NOT NULL, reconciliation_timestamp TEXT NOT NULL, containment_references TEXT NOT NULL, topology_snapshot TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), append_only TEXT NOT NULL CHECK (append_only='true'), created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_runtime_topology_registry_hashes ON runtime_topology_registry(topology_hash, topology_semantic_hash, topology_boundary_hash, topology_lineage_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_runtime_topology_registry_boundary ON runtime_topology_registry(boundary_hash, lineage_hash)`,
      `CREATE TABLE IF NOT EXISTS unauthorized_mutation_closure_registry (closure_id TEXT PRIMARY KEY, inventory_hash TEXT NOT NULL, route_hash TEXT NOT NULL, registry_hash TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), proof_generating TEXT NOT NULL CHECK (proof_generating='false'), created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS cross_registry_reconciliation_registry (reconciliation_id TEXT PRIMARY KEY, registry_set_hash TEXT NOT NULL, lineage_graph_hash TEXT NOT NULL, continuity_graph_hash TEXT NOT NULL, proof_graph_hash TEXT NOT NULL, replay_graph_hash TEXT NOT NULL, topology_binding_hash TEXT NOT NULL, governance_binding_hash TEXT NOT NULL, reconciliation_equivalence_hash TEXT NOT NULL, drift_classes TEXT NOT NULL, unresolved_edges TEXT NOT NULL, orphaned_records TEXT NOT NULL, containment_status TEXT NOT NULL CHECK (containment_status IN ('RECONCILED','RECONCILIATION_REQUIRED')), legitimacy_status TEXT CHECK (legitimacy_status IS NULL OR legitimacy_status='LEGITIMATE'), evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), proof_generating TEXT NOT NULL CHECK (proof_generating='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_cross_registry_reconciliation_registry_hash_unique ON cross_registry_reconciliation_registry(reconciliation_equivalence_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_cross_registry_reconciliation_registry_status ON cross_registry_reconciliation_registry(containment_status, legitimacy_status)`,
      `CREATE TABLE IF NOT EXISTS observer_attestation_registry (attestation_id TEXT PRIMARY KEY, observer_id TEXT NOT NULL, observed_checkpoint_hash TEXT NOT NULL, semantic_hash TEXT NOT NULL, topology_hash TEXT NOT NULL, reconciliation_hash TEXT NOT NULL, sovereignty_hash TEXT NOT NULL, equivalence_hash TEXT NOT NULL, drift_classes TEXT NOT NULL, legitimacy_status TEXT CHECK (legitimacy_status IS NULL OR legitimacy_status='LEGITIMATE'), attestation_hash TEXT NOT NULL UNIQUE, observer_envelope TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'), read_only TEXT NOT NULL CHECK (read_only='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), proof_generating TEXT NOT NULL CHECK (proof_generating='false'), merge_authorizing TEXT NOT NULL CHECK (merge_authorizing='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_observer_attestation_registry_equivalence ON observer_attestation_registry(equivalence_hash, legitimacy_status)`,
      `CREATE TABLE IF NOT EXISTS semantic_equivalence_registry (semantic_equivalence_id TEXT PRIMARY KEY, semantic_hash TEXT NOT NULL, schema_semantic_hash TEXT NOT NULL, topology_semantic_hash TEXT NOT NULL, governance_semantic_hash TEXT NOT NULL, portability_semantic_hash TEXT NOT NULL, equivalence_hash TEXT NOT NULL UNIQUE, drift_classes TEXT NOT NULL, legitimacy_status TEXT CHECK (legitimacy_status IS NULL OR legitimacy_status='LEGITIMATE'), semantic_envelope TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'), read_only TEXT NOT NULL CHECK (read_only='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), proof_generating TEXT NOT NULL CHECK (proof_generating='false'), merge_authorizing TEXT NOT NULL CHECK (merge_authorizing='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS portable_governance_checkpoint_registry (checkpoint_id TEXT PRIMARY KEY, checkpoint_hash TEXT NOT NULL UNIQUE, reconciliation_hash TEXT NOT NULL, topology_hash TEXT NOT NULL, semantic_equivalence_hash TEXT NOT NULL, conformance_hash TEXT NOT NULL, portable_envelope TEXT NOT NULL, dsse_payload_type TEXT NOT NULL, jcs_canonical TEXT NOT NULL CHECK (jcs_canonical='true'), drift_classes TEXT NOT NULL, legitimacy_status TEXT CHECK (legitimacy_status IS NULL OR legitimacy_status='LEGITIMATE'), evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'), read_only TEXT NOT NULL CHECK (read_only='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), proof_generating TEXT NOT NULL CHECK (proof_generating='false'), merge_authorizing TEXT NOT NULL CHECK (merge_authorizing='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS external_conformance_verification_registry (verification_id TEXT PRIMARY KEY, runtime_compatibility_hash TEXT NOT NULL, governance_semantic_hash TEXT NOT NULL, checkpoint_equivalence_hash TEXT NOT NULL, federated_conformance_hash TEXT NOT NULL UNIQUE, conformance_status TEXT NOT NULL CHECK (conformance_status IN ('CONFORMANT','NULL')), drift_classes TEXT NOT NULL, verification_envelope TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'), read_only TEXT NOT NULL CHECK (read_only='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), proof_generating TEXT NOT NULL CHECK (proof_generating='false'), merge_authorizing TEXT NOT NULL CHECK (merge_authorizing='false'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS legitimacy_drift_propagation_registry (propagation_id TEXT PRIMARY KEY, propagation_hash TEXT NOT NULL, topology_hash TEXT NOT NULL, impact_hash TEXT NOT NULL, merge_legitimacy_hash TEXT NOT NULL, verdict_hash TEXT NOT NULL, classification TEXT NOT NULL CHECK (classification IN ('TOPOLOGY_VALID','TOPOLOGY_DRIFT_PROPAGATED','MERGE_LINEAGE_CONTAMINATED','GOVERNANCE_IMPACT_EXPANDED','SCHEMA_PROPAGATION_FAILURE','WORKFLOW_TRUST_COLLAPSE','PROOF_LINEAGE_CONTAMINATION','RECONCILIATION_EQUIVALENCE_INVALID','DOWNSTREAM_LEGITIMACY_NULL','NULL')), propagation_object TEXT NOT NULL, impact_graph TEXT NOT NULL, merge_impact TEXT NOT NULL, verdict_object TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), proof_generating TEXT NOT NULL CHECK (proof_generating='false'), fail_closed_on_ambiguity TEXT NOT NULL CHECK (fail_closed_on_ambiguity='true'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_hash_unique ON legitimacy_drift_propagation_registry(propagation_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_topology ON legitimacy_drift_propagation_registry(topology_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_impact ON legitimacy_drift_propagation_registry(impact_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_merge ON legitimacy_drift_propagation_registry(merge_legitimacy_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_verdict ON legitimacy_drift_propagation_registry(verdict_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_classification ON legitimacy_drift_propagation_registry(classification)`,
      `CREATE INDEX IF NOT EXISTS idx_legitimacy_graph_registry_checkpoint ON legitimacy_graph_registry(graph_checkpoint_hash, graph_coherence_hash, cross_registry_replay_continuity)`,
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
      `CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_containment_registry_no_update BEFORE UPDATE ON recursive_governance_containment_registry BEGIN SELECT RAISE(ABORT, 'recursive_governance_containment_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_containment_registry_no_delete BEFORE DELETE ON recursive_governance_containment_registry BEGIN SELECT RAISE(ABORT, 'recursive_governance_containment_registry is append-only'); END`,
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
      `CREATE TRIGGER IF NOT EXISTS trg_bootstrap_sovereignty_registry_no_update BEFORE UPDATE ON bootstrap_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'bootstrap_sovereignty_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_bootstrap_sovereignty_registry_no_delete BEFORE DELETE ON bootstrap_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'bootstrap_sovereignty_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_federated_reconciliation_registry_no_update BEFORE UPDATE ON federated_reconciliation_registry BEGIN SELECT RAISE(ABORT, 'federated_reconciliation_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_federated_reconciliation_registry_no_delete BEFORE DELETE ON federated_reconciliation_registry BEGIN SELECT RAISE(ABORT, 'federated_reconciliation_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_governance_compression_registry_no_update BEFORE UPDATE ON governance_compression_registry BEGIN SELECT RAISE(ABORT, 'governance_compression_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_governance_compression_registry_no_delete BEFORE DELETE ON governance_compression_registry BEGIN SELECT RAISE(ABORT, 'governance_compression_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_federated_sovereignty_registry_no_update BEFORE UPDATE ON federated_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'federated_sovereignty_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_federated_sovereignty_registry_no_delete BEFORE DELETE ON federated_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'federated_sovereignty_registry is append-only'); END`,
      `CREATE INDEX IF NOT EXISTS idx_federation_conformance_registry_semantics ON federation_conformance_registry(fingerprint_hash, checkpoint_hash, compatibility_hash)`,
      `CREATE TABLE IF NOT EXISTS legitimacy_quarantine_registry (quarantine_id TEXT PRIMARY KEY, quarantine_hash TEXT NOT NULL, containment_hash TEXT NOT NULL, lineage_hash TEXT NOT NULL, federation_hash TEXT NOT NULL, boundary_hash TEXT NOT NULL, classification TEXT NOT NULL CHECK (classification IN ('RECURSIVE_QUARANTINE_ACTIVE','FEDERATED_CONTAINMENT_REQUIRED','LINEAGE_TRUST_ISOLATED','TOPOLOGY_ANCESTRY_QUARANTINED','DOWNSTREAM_COORDINATION_RESTRICTED','MERGE_TRUST_COLLAPSED','PROOF_TRUST_CONTAINED','GOVERNANCE_CONTAMINATION_EXPANDED','CONTAINMENT_BOUNDARY_OVERFLOW','NULL')), quarantine_object TEXT NOT NULL, containment_boundary TEXT NOT NULL, isolation_graph TEXT NOT NULL, federated_containment TEXT NOT NULL, propagation_envelope TEXT NOT NULL, verdict_object TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), proof_generating TEXT NOT NULL CHECK (proof_generating='false'), fail_closed_on_ambiguity TEXT NOT NULL CHECK (fail_closed_on_ambiguity='true'), quarantine_authoritative TEXT NOT NULL CHECK (quarantine_authoritative='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_quarantine_hash ON legitimacy_quarantine_registry(quarantine_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_containment_hash ON legitimacy_quarantine_registry(containment_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_lineage_hash ON legitimacy_quarantine_registry(lineage_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_federation_hash ON legitimacy_quarantine_registry(federation_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_boundary_hash ON legitimacy_quarantine_registry(boundary_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_classification ON legitimacy_quarantine_registry(classification)`
    ]
    for (const s of stmts) await env.DB.prepare(s).run()
    await ensureRequiredSchemaColumns(env)
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_SCHEMA_INITIALIZED")
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_MIGRATIONS_VALIDATED")
    if (options.stabilizeProofRegistry === false) return
    await validateProofArchiveCompatibility(env)
    await backfillProofDecisionHashes(env)
    const quarantine = await quarantineHistoricalProofDuplicates(env)
    if (quarantine.detected) await emitBootstrapDiagnostic(env, "BOOTSTRAP_DUPLICATE_PROOF_DETECTED")
    if (quarantine.quarantined > 0) await emitBootstrapDiagnostic(env, "BOOTSTRAP_DUPLICATE_PROOF_QUARANTINED")
    if (!await proofRegistryStabilized(env)) throw new BootstrapRegistryUnstableError()
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_PROOF_LINEAGE_RECONCILED")
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_REGISTRY_STABILIZED")
    await env.DB.prepare(`DROP TRIGGER IF EXISTS trg_proof_registry_decision_hash_guard`).run()
    await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_proof_registry_decision_hash_guard BEFORE INSERT ON proof_registry WHEN NEW.decision_hash IS NULL OR NEW.decision_hash = '' OR NEW.decision_hash != NEW.decision_id || char(31) || NEW.validated_object_hash BEGIN SELECT RAISE(ABORT, 'proof_registry decision_hash mismatch'); END`).run()
    await env.DB.prepare(`DROP INDEX IF EXISTS idx_proof_registry_execution_decision_hash_unique`).run()
    await env.DB.prepare(`DROP INDEX IF EXISTS idx_proof_registry_decision_hash_unique`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique ON proof_registry(decision_hash)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_object_hash_unique ON proof_registry(decision_id, validated_object_hash)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_execution_decision_hash_unique ON proof_registry(execution_id, decision_id, validated_object_hash)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_workflow_run_unique ON proof_registry(workflow_run_id)`).run()
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_UNIQUENESS_ENFORCED")
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_proof_registry_provenance ON proof_registry(repository, branch, pull_request_id, merge_commit_sha, workflow_run_id)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_registry_workflow_run_unique ON execution_registry(workflow_run_id)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_envelope_hash_unique ON attestation_registry(envelope_hash)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_workflow_run_unique ON attestation_registry(workflow_run_id)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_decision_object_unique ON attestation_registry(decision_id, validated_object_hash)`).run()
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_RECURSIVE_GOVERNANCE_VERIFIED")
    await validateRuntimeEvolutionConsensusRegistry(env)
    await validateLegitimacyGraphRegistry(env)
    await validateReconciliationClosureRegistry(env)
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_RUNTIME_EVOLUTION_CONSENSUS_REGISTRY_VALIDATED")
    const sovereigntyManifest = await freezeRuntimeSovereignty(env)
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_RUNTIME_SOVEREIGNTY_FROZEN")
    await appendRuntimeSovereigntyCheckpoint(env, sovereigntyManifest)
    await emitBootstrapDiagnostic(env, "BOOTSTRAP_SOVEREIGNTY_CHECKPOINT_GENERATED")
    const bootstrapManifest = await buildBootstrapSovereigntyManifest()
    const bootstrapCheckpoint = await buildBootstrapLineageCheckpoint(bootstrapManifest, [], new Date().toISOString())
    await appendBootstrapSovereigntyCheckpoint(env, bootstrapCheckpoint)
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
    `CREATE TRIGGER IF NOT EXISTS trg_runtime_evolution_consensus_registry_no_delete BEFORE DELETE ON runtime_evolution_consensus_registry BEGIN SELECT RAISE(ABORT, 'runtime_evolution_consensus_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_bootstrap_sovereignty_registry_no_update BEFORE UPDATE ON bootstrap_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'bootstrap_sovereignty_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_bootstrap_sovereignty_registry_no_delete BEFORE DELETE ON bootstrap_sovereignty_registry BEGIN SELECT RAISE(ABORT, 'bootstrap_sovereignty_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_legitimacy_graph_registry_no_update BEFORE UPDATE ON legitimacy_graph_registry BEGIN SELECT RAISE(ABORT, 'legitimacy_graph_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_legitimacy_graph_registry_no_delete BEFORE DELETE ON legitimacy_graph_registry BEGIN SELECT RAISE(ABORT, 'legitimacy_graph_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_reconciliation_closure_registry_no_update BEFORE UPDATE ON reconciliation_closure_registry BEGIN SELECT RAISE(ABORT, 'reconciliation_closure_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_reconciliation_closure_registry_no_delete BEFORE DELETE ON reconciliation_closure_registry BEGIN SELECT RAISE(ABORT, 'reconciliation_closure_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_legitimacy_quarantine_registry_no_update BEFORE UPDATE ON legitimacy_quarantine_registry BEGIN SELECT RAISE(ABORT, 'legitimacy_quarantine_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_legitimacy_quarantine_registry_no_delete BEFORE DELETE ON legitimacy_quarantine_registry BEGIN SELECT RAISE(ABORT, 'legitimacy_quarantine_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_continuous_fate_registry_no_update BEFORE UPDATE ON continuous_fate_registry BEGIN SELECT RAISE(ABORT, 'continuous_fate_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_continuous_fate_registry_no_delete BEFORE DELETE ON continuous_fate_registry BEGIN SELECT RAISE(ABORT, 'continuous_fate_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_runtime_surface_containment_registry_no_update BEFORE UPDATE ON runtime_surface_containment_registry BEGIN SELECT RAISE(ABORT, 'runtime_surface_containment_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_runtime_surface_containment_registry_no_delete BEFORE DELETE ON runtime_surface_containment_registry BEGIN SELECT RAISE(ABORT, 'runtime_surface_containment_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_topology_reconciliation_registry_no_update BEFORE UPDATE ON topology_reconciliation_registry BEGIN SELECT RAISE(ABORT, 'topology_reconciliation_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_topology_reconciliation_registry_no_delete BEFORE DELETE ON topology_reconciliation_registry BEGIN SELECT RAISE(ABORT, 'topology_reconciliation_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_runtime_topology_registry_no_update BEFORE UPDATE ON runtime_topology_registry BEGIN SELECT RAISE(ABORT, 'runtime_topology_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_runtime_topology_registry_no_delete BEFORE DELETE ON runtime_topology_registry BEGIN SELECT RAISE(ABORT, 'runtime_topology_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_cross_registry_reconciliation_registry_no_update BEFORE UPDATE ON cross_registry_reconciliation_registry BEGIN SELECT RAISE(ABORT, 'cross_registry_reconciliation_registry is append-only'); END`,
    `CREATE TRIGGER IF NOT EXISTS trg_cross_registry_reconciliation_registry_no_delete BEFORE DELETE ON cross_registry_reconciliation_registry BEGIN SELECT RAISE(ABORT, 'cross_registry_reconciliation_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_observer_attestation_registry_no_update BEFORE UPDATE ON observer_attestation_registry BEGIN SELECT RAISE(ABORT, 'observer_attestation_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_observer_attestation_registry_no_delete BEFORE DELETE ON observer_attestation_registry BEGIN SELECT RAISE(ABORT, 'observer_attestation_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_semantic_equivalence_registry_no_update BEFORE UPDATE ON semantic_equivalence_registry BEGIN SELECT RAISE(ABORT, 'semantic_equivalence_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_semantic_equivalence_registry_no_delete BEFORE DELETE ON semantic_equivalence_registry BEGIN SELECT RAISE(ABORT, 'semantic_equivalence_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_portable_governance_checkpoint_registry_no_update BEFORE UPDATE ON portable_governance_checkpoint_registry BEGIN SELECT RAISE(ABORT, 'portable_governance_checkpoint_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_portable_governance_checkpoint_registry_no_delete BEFORE DELETE ON portable_governance_checkpoint_registry BEGIN SELECT RAISE(ABORT, 'portable_governance_checkpoint_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_external_conformance_verification_registry_no_update BEFORE UPDATE ON external_conformance_verification_registry BEGIN SELECT RAISE(ABORT, 'external_conformance_verification_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_external_conformance_verification_registry_no_delete BEFORE DELETE ON external_conformance_verification_registry BEGIN SELECT RAISE(ABORT, 'external_conformance_verification_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_delegated_authority_registry_no_update BEFORE UPDATE ON delegated_authority_registry BEGIN SELECT RAISE(ABORT, 'delegated_authority_registry is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS trg_delegated_authority_registry_no_delete BEFORE DELETE ON delegated_authority_registry BEGIN SELECT RAISE(ABORT, 'delegated_authority_registry is append-only'); END`
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
  if (column === "mutation_capable" || column === "read_only" || column === "replay_neutral" || column === "evidence_only") return "TEXT"
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


type LegitimacyGraphDriftClass = "legitimacy_graph_orphan" | "graph_lineage_fragmentation" | "registry_edge_missing" | "registry_parent_missing" | "registry_child_inconsistency" | "graph_checkpoint_instability" | "cross_registry_hash_divergence" | "replay_lineage_fragmentation" | "proof_graph_discontinuity" | "authority_graph_discontinuity" | "governance_graph_discontinuity" | "federation_graph_discontinuity" | "bootstrap_graph_discontinuity" | "external_authority_graph_discontinuity" | "graph_traversal_depth_exceeded"

type LegitimacyGraphNode = {
  registry: string
  node_id: string
  lineage_root: string
  object_hash: string
  exact_object_hash: string
  canonical_object: Record<string, unknown>
}

type LegitimacyGraphEdge = {
  edge_id: string
  from_registry: string
  from_node_id: string
  to_registry: string
  to_node_id: string
  relation: string
  parent_hash: string
  child_hash: string
}

type LegitimacyGraphCheckpoint = {
  checkpoint_id: string
  graph_checkpoint_hash: string
  graph_coherence_hash: string
  nodes: LegitimacyGraphNode[]
  edges: LegitimacyGraphEdge[]
  orphans: LegitimacyGraphNode[]
  drift_classes: LegitimacyGraphDriftClass[]
  cross_registry_replay_continuity: "CONTINUOUS" | "FRAGMENTED"
  traversal_depth_limit: number
  evidence_only: true
  replay_neutral: true
  mutation_capable: false
  remote_authority_denied: true
  read_only: true
  creates_authority: false
  execution_started: false
  generated_at: string
}

const LEGITIMACY_GRAPH_REGISTRY = "legitimacy_graph_registry" as const
const LEGITIMACY_GRAPH_MAX_TRAVERSAL_DEPTH = SYSTEM_MAX_CONTINUITY_DEPTH
const LEGITIMACY_GRAPH_REGISTRIES = [
  "session_registry",
  "continuity_registry",
  "authority_registry",
  "aeo_registry",
  "validation_registry",
  "execution_registry",
  "proof_registry",
  "invocation_registry",
  "proof_quarantine_registry",
  "attestation_registry",
  "preo_registry",
  "recursive_governance_registry",
  "runtime_governance_lock_registry",
  "runtime_sovereignty_registry",
  "bootstrap_sovereignty_registry",
  "external_authority_registry",
  "federation_conformance_registry",
  "federated_sovereignty_registry",
  "federated_checkpoint_registry",
  "federated_reconciliation_registry",
  "governance_compression_registry",
  "distributed_legitimacy_registry",
  "runtime_evolution_consensus_registry",
  "runtime_surface_containment_registry"
] as const

type LegitimacyGraphRegistry = typeof LEGITIMACY_GRAPH_REGISTRIES[number]

const LEGITIMACY_GRAPH_PRIMARY_KEYS: Record<LegitimacyGraphRegistry, string[]> = {
  session_registry: ["session_id"],
  continuity_registry: ["continuity_id"],
  authority_registry: ["authority_id"],
  aeo_registry: ["aeo_id"],
  validation_registry: ["validation_id", "decision_id", "validated_object_hash"],
  execution_registry: ["execution_id"],
  proof_registry: ["proof_id"],
  invocation_registry: ["decision_id", "invocation_nonce"],
  proof_quarantine_registry: ["quarantine_id"],
  attestation_registry: ["attestation_id", "envelope_hash"],
  preo_registry: ["preo_id"],
  recursive_governance_registry: ["governance_id"],
  runtime_governance_lock_registry: ["lock_id"],
  runtime_sovereignty_registry: ["sovereignty_id"],
  bootstrap_sovereignty_registry: ["checkpoint_id"],
  external_authority_registry: ["sovereignty_dependency_id"],
  federation_conformance_registry: ["conformance_id"],
  federated_sovereignty_registry: ["federation_id"],
  federated_checkpoint_registry: ["checkpoint_envelope_id", "checkpoint_id"],
  federated_reconciliation_registry: ["reconciliation_id"],
  governance_compression_registry: ["compression_id"],
  distributed_legitimacy_registry: ["envelope_id"],
  runtime_evolution_consensus_registry: ["consensus_id"],
  runtime_surface_containment_registry: ["containment_id", "containment_hash"]
}

function legitimacyGraphStatusFlags(): { evidence_only: true, replay_neutral: true, mutation_capable: false, remote_authority_denied: true, read_only: true, creates_authority: false, execution_started: false } {
  return { evidence_only: true, replay_neutral: true, mutation_capable: false, remote_authority_denied: true, read_only: true, creates_authority: false, execution_started: false }
}

function registryDiscontinuityDrift(registry: string): LegitimacyGraphDriftClass {
  if (/proof|attestation/.test(registry)) return "proof_graph_discontinuity"
  if (/authority|aeo|validation|execution|invocation|session|continuity/.test(registry)) return "authority_graph_discontinuity"
  if (/governance|consensus|lock/.test(registry)) return "governance_graph_discontinuity"
  if (/federat|distributed|compression/.test(registry)) return "federation_graph_discontinuity"
  if (/bootstrap|runtime_sovereignty/.test(registry)) return "bootstrap_graph_discontinuity"
  if (/external_authority/.test(registry)) return "external_authority_graph_discontinuity"
  return "graph_lineage_fragmentation"
}

function canonicalRegistryNodeModel(registry: LegitimacyGraphRegistry, row: Record<string, unknown>, object_hash: string): LegitimacyGraphNode {
  const keys = LEGITIMACY_GRAPH_PRIMARY_KEYS[registry]
  const values = keys.map((key) => String(row[key] || "")).filter(Boolean)
  const node_id = values.length > 0 ? values.join(":") : object_hash
  const lineage_root = String(row.lineage_root || row.deployment_lineage_root || row.continuity_root || row.continuity_id || row.session_id || node_id || object_hash)
  return Object.freeze({ registry, node_id, lineage_root, object_hash, exact_object_hash: object_hash, canonical_object: canonicalRecord(row) })
}

async function exactObjectCheckpointHash(node: LegitimacyGraphNode): Promise<string> {
  return sha256Hex(canonicalize({ registry: node.registry, node_id: node.node_id, exact_object_hash: node.exact_object_hash, canonical_object: node.canonical_object }))
}

function legitimacyGraphSecondaryIndexes(node: LegitimacyGraphNode): string[] {
  const row = node.canonical_object
  const keys = ["session_id", "continuity_id", "authority_id", "aeo_id", "validation_id", "execution_id", "proof_id", "decision_id", "governance_id", "checkpoint_id", "envelope_id", "canonical_hash", "lineage_root"]
  const indexes = [`${node.registry}:${node.node_id}`]
  for (const key of keys) {
    const value = String(row[key] || "")
    if (value) indexes.push(`${node.registry}:${key}:${value}`)
  }
  const decision = String(row.decision_id || "")
  const objectHash = String(row.validated_object_hash || "")
  if (decision && objectHash) indexes.push(`${node.registry}:decision_object:${decision}:${objectHash}`)
  return indexes
}

function legitimacyParentReferences(node: LegitimacyGraphNode): Array<{ registry: LegitimacyGraphRegistry, key: string, value: string, relation: string, required: boolean }> {
  const row = node.canonical_object
  const refs: Array<{ registry: LegitimacyGraphRegistry, key: string, value: string, relation: string, required: boolean }> = []
  const add = (registry: LegitimacyGraphRegistry, key: string, value: unknown, relation: string, required = true) => { if (String(value || "")) refs.push({ registry, key, value: String(value), relation, required }) }
  if (node.registry === "continuity_registry") { add("session_registry", "session_id", row.session_id, "session_continuity"); add("continuity_registry", "continuity_id", row.parent_continuity_id, "recursive_continuity", false) }
  if (node.registry === "authority_registry") { add("session_registry", "session_id", row.session_id, "authority_session"); add("continuity_registry", "continuity_id", row.continuity_id, "authority_continuity") }
  if (node.registry === "aeo_registry") { add("authority_registry", "authority_id", row.authority_id, "aeo_authority"); add("continuity_registry", "continuity_id", row.continuity_id, "aeo_continuity") }
  if (node.registry === "validation_registry") { add("session_registry", "session_id", row.session_id, "validation_session"); add("continuity_registry", "continuity_id", row.continuity_id, "validation_continuity") }
  if (node.registry === "execution_registry") { add("validation_registry", "decision_object", `${String(row.decision_id || "")}:${String(row.validated_object_hash || "")}`, "execution_validation"); add("continuity_registry", "continuity_id", row.continuity_id, "execution_continuity") }
  if (node.registry === "proof_registry") { add("execution_registry", "execution_id", row.execution_id, "proof_execution"); add("validation_registry", "decision_object", `${String(row.decision_id || "")}:${String(row.validated_object_hash || "")}`, "proof_validation"); add("continuity_registry", "continuity_id", row.continuity_id, "proof_continuity") }
  if (node.registry === "invocation_registry") add("continuity_registry", "continuity_id", row.continuity_id, "invocation_continuity")
  if (node.registry === "proof_quarantine_registry") add("proof_registry", "proof_id", row.proof_id, "quarantine_proof")
  if (node.registry === "attestation_registry") add("validation_registry", "decision_object", `${String(row.decision_id || "")}:${String(row.validated_object_hash || "")}`, "attestation_validation")
  if (node.registry === "preo_registry") { add("authority_registry", "authority_id", row.authority_id, "preo_authority"); add("continuity_registry", "continuity_id", row.continuity_id, "preo_continuity") }
  if (node.registry === "runtime_governance_lock_registry") add("recursive_governance_registry", "governance_id", row.governance_id, "lock_governance")
  if (["federation_conformance_registry", "federated_sovereignty_registry", "federated_checkpoint_registry", "federated_reconciliation_registry", "governance_compression_registry", "distributed_legitimacy_registry"].includes(node.registry)) add("continuity_registry", "continuity_id", row.continuity_id, "federated_continuity", false)
  return refs
}

function lineageRootResolver(node: LegitimacyGraphNode, edgeMap: Map<string, LegitimacyGraphEdge[]>, nodeMap: Map<string, LegitimacyGraphNode>, depthLimit = LEGITIMACY_GRAPH_MAX_TRAVERSAL_DEPTH): { root: string, depth_exceeded: boolean } {
  let root = node.lineage_root || node.node_id
  let depthExceeded = false
  const visit = (current: LegitimacyGraphNode, depth: number, seen: Set<string>) => {
    if (depth > depthLimit) { depthExceeded = true; return }
    const key = `${current.registry}:${current.node_id}`
    if (seen.has(key)) return
    seen.add(key)
    const parents = edgeMap.get(key) || []
    if (parents.length === 0) { root = current.node_id; return }
    for (const edge of parents) {
      const parent = nodeMap.get(`${edge.to_registry}:${edge.to_node_id}`)
      if (parent) visit(parent, depth + 1, seen)
    }
  }
  visit(node, 0, new Set())
  return { root, depth_exceeded: depthExceeded }
}

async function deterministicGraphTraversalEngine(env: Env): Promise<LegitimacyGraphCheckpoint> {
  const nodes: LegitimacyGraphNode[] = []
  for (const registry of LEGITIMACY_GRAPH_REGISTRIES) {
    const columns = await tableColumns(env, registry)
    if (columns.size === 0) continue
    const orderBy = Array.from(columns).sort().map((column) => `${column} ASC`).join(", ")
    const rowsResult = await env.DB.prepare(`SELECT * FROM ${registry} ORDER BY ${orderBy}`).all<any>()
    const rows = Array.isArray(rowsResult?.results) ? rowsResult.results : []
    for (const row of rows) {
      const canonical_object = canonicalRecord(row)
      nodes.push(canonicalRegistryNodeModel(registry, canonical_object, await sha256Hex(canonicalize(canonical_object))))
    }
  }
  nodes.sort((a, b) => `${a.registry}:${a.node_id}:${a.object_hash}`.localeCompare(`${b.registry}:${b.node_id}:${b.object_hash}`))

  const nodeMap = new Map<string, LegitimacyGraphNode>()
  const indexMap = new Map<string, LegitimacyGraphNode>()
  for (const node of nodes) {
    nodeMap.set(`${node.registry}:${node.node_id}`, node)
    for (const index of legitimacyGraphSecondaryIndexes(node)) if (!indexMap.has(index)) indexMap.set(index, node)
  }

  const edges: LegitimacyGraphEdge[] = []
  const orphans: LegitimacyGraphNode[] = []
  const drift = new Set<LegitimacyGraphDriftClass>()
  for (const node of nodes) {
    const refs = legitimacyParentReferences(node)
    let missingRequiredParent = false
    for (const ref of refs) {
      const parent = indexMap.get(`${ref.registry}:${ref.key}:${ref.value}`)
      if (!parent) {
        if (ref.required) {
          missingRequiredParent = true
          drift.add("registry_parent_missing")
          drift.add("registry_edge_missing")
          drift.add(registryDiscontinuityDrift(node.registry))
          if (["execution_registry", "proof_registry", "invocation_registry"].includes(node.registry)) drift.add("replay_lineage_fragmentation")
        }
        continue
      }
      const edgeMaterial = { child: `${node.registry}:${node.node_id}`, parent: `${parent.registry}:${parent.node_id}`, relation: ref.relation, child_hash: node.object_hash, parent_hash: parent.object_hash }
      edges.push(Object.freeze({ edge_id: await sha256Hex(canonicalize(edgeMaterial)), from_registry: node.registry, from_node_id: node.node_id, to_registry: parent.registry, to_node_id: parent.node_id, relation: ref.relation, parent_hash: parent.object_hash, child_hash: node.object_hash }))
    }
    if (missingRequiredParent || (refs.length > 0 && refs.every((ref) => !indexMap.get(`${ref.registry}:${ref.key}:${ref.value}`)))) {
      orphans.push(node)
      drift.add("legitimacy_graph_orphan")
      drift.add("graph_lineage_fragmentation")
    }
  }
  edges.sort((a, b) => `${a.from_registry}:${a.from_node_id}:${a.relation}:${a.to_registry}:${a.to_node_id}:${a.edge_id}`.localeCompare(`${b.from_registry}:${b.from_node_id}:${b.relation}:${b.to_registry}:${b.to_node_id}:${b.edge_id}`))
  orphans.sort((a, b) => `${a.registry}:${a.node_id}:${a.object_hash}`.localeCompare(`${b.registry}:${b.node_id}:${b.object_hash}`))

  const edgeMap = new Map<string, LegitimacyGraphEdge[]>()
  for (const edge of edges) {
    const key = `${edge.from_registry}:${edge.from_node_id}`
    edgeMap.set(key, [...(edgeMap.get(key) || []), edge])
  }
  for (const node of nodes) {
    const resolved = lineageRootResolver(node, edgeMap, nodeMap)
    if (resolved.depth_exceeded) {
      drift.add("graph_traversal_depth_exceeded")
      drift.add("graph_lineage_fragmentation")
    }
  }
  const checkpoint_object_hash = await sha256Hex(canonicalize(await Promise.all(nodes.map(exactObjectCheckpointHash))))
  const graph_coherence_hash = await sha256Hex(canonicalize({ nodes: nodes.map((node) => ({ registry: node.registry, node_id: node.node_id, object_hash: node.object_hash })), edges }))
  const drift_classes = Array.from(drift).sort()
  const graph_checkpoint_hash = await sha256Hex(canonicalize({ graph_coherence_hash, checkpoint_object_hash, drift_classes, orphan_count: orphans.length, node_count: nodes.length, edge_count: edges.length }))
  return Object.freeze({ checkpoint_id: `legitimacy-graph:${graph_checkpoint_hash}`, graph_checkpoint_hash, graph_coherence_hash, nodes, edges, orphans, drift_classes, cross_registry_replay_continuity: drift.has("replay_lineage_fragmentation") ? "FRAGMENTED" : "CONTINUOUS", traversal_depth_limit: LEGITIMACY_GRAPH_MAX_TRAVERSAL_DEPTH, ...legitimacyGraphStatusFlags(), generated_at: new Date().toISOString() })
}

async function appendGraphClosureCheckpoint(env: Env, checkpoint: LegitimacyGraphCheckpoint) {
  await env.DB.prepare(`INSERT OR IGNORE INTO legitimacy_graph_registry (graph_checkpoint_id,graph_checkpoint_hash,graph_coherence_hash,node_count,edge_count,orphan_count,drift_classes,checkpoint_object_hash,cross_registry_replay_continuity,evidence_only,replay_neutral,mutation_capable,remote_authority_denied,read_only,creates_authority,execution_started,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'true','true','false','true','true','false','false',?10,?11)`)
    .bind(checkpoint.checkpoint_id, checkpoint.graph_checkpoint_hash, checkpoint.graph_coherence_hash, String(checkpoint.nodes.length), String(checkpoint.edges.length), String(checkpoint.orphans.length), canonicalize(checkpoint.drift_classes), await sha256Hex(canonicalize(checkpoint.nodes.map((node) => node.exact_object_hash))), checkpoint.cross_registry_replay_continuity, checkpoint.generated_at, checkpoint.generated_at)
    .run()
}

type ReconciliationClosureDriftClass =
  | "recursive_reconciliation_divergence"
  | "reconciliation_equivalence_drift"
  | "recursive_lineage_fragmentation"
  | "recursive_checkpoint_instability"
  | "reconciliation_closure_failure"
  | "reconciliation_anchor_instability"
  | "reconciliation_graph_binding_drift"
  | "reconciliation_bootstrap_binding_drift"
  | "reconciliation_sovereignty_binding_drift"
  | "reconciliation_federation_binding_drift"
  | "reconciliation_replay_resurrection_attempt"
  | "reconciliation_window_overflow"
  | "reconciliation_closure_hash_mismatch"

type ReconciliationEquivalenceState = "RECONCILIATION_EQUIVALENT" | "RECONCILIATION_DRIFT" | "NULL"

type RecursiveReconciliationClosureObject = {
  closure_id: string
  closure_hash: string
  deterministic_reconciliation_anchor: string
  recursive_checkpoint_identity: string
  reconciliation_equivalence_state: ReconciliationEquivalenceState
  lineage_depth: number
  bounded_window: number
  graph_checkpoint_hash: string
  bootstrap_checkpoint_hash: string
  runtime_sovereignty_checkpoint_hash: string
  federation_conformance_checkpoint_hash: string
  graph_checkpoint_binding: string
  bootstrap_checkpoint_binding: string
  runtime_sovereignty_checkpoint_binding: string
  federation_conformance_checkpoint_binding: string
  recursive_lineage_depth_evidence: readonly string[]
  drift_classes: ReconciliationClosureDriftClass[]
  closure_object_hash: string
  evidence_only: true
  replay_neutral: true
  mutation_capable: false
  remote_authority_denied: true
  read_only: true
  creates_authority: false
  execution_started: false
  replay_consumed: false
  generated_at: string
}

const RECONCILIATION_CLOSURE_ROUTES = [RECONCILIATION_CLOSURE_ROUTE, RECONCILIATION_CLOSURE_CHECKPOINT_ROUTE, RECONCILIATION_CLOSURE_EQUIVALENCE_ROUTE, RECONCILIATION_CLOSURE_DRIFT_ROUTE] as const
const RECONCILIATION_CLOSURE_MAX_WINDOW = SYSTEM_MAX_CONTINUITY_DEPTH

function reconciliationClosureFlags(): { evidence_only: true, replay_neutral: true, mutation_capable: false, remote_authority_denied: true, read_only: true, creates_authority: false, execution_started: false, replay_consumed: false } {
  return { evidence_only: true, replay_neutral: true, mutation_capable: false, remote_authority_denied: true, read_only: true, creates_authority: false, execution_started: false, replay_consumed: false }
}

function latestDeterministicRow(rows: Record<string, unknown>[], hashKeys: string[]): Record<string, unknown> | null {
  const candidates = rows.map((row) => canonicalRecord(row)).filter((row) => hashKeys.some((key) => String(row[key] || "")))
  candidates.sort((a, b) => hashKeys.map((key) => String(a[key] || "")).join(":").localeCompare(hashKeys.map((key) => String(b[key] || "")).join(":")))
  return candidates.at(-1) || null
}

async function deterministicRegistryRows(env: Env, registry: string): Promise<Record<string, unknown>[]> {
  const columns = await tableColumns(env, registry)
  if (columns.size === 0) return []
  const orderBy = Array.from(columns).sort().map((column) => `${column} ASC`).join(", ")
  const result = await env.DB.prepare(`SELECT * FROM ${registry} ORDER BY ${orderBy}`).all<any>()
  return Array.isArray(result?.results) ? result.results.map((row: any) => canonicalRecord(row)) : []
}

async function latestCheckpointBinding(env: Env, registry: string, hashKeys: string[]): Promise<string> {
  const row = latestDeterministicRow(await deterministicRegistryRows(env, registry), hashKeys)
  if (!row) return ""
  for (const key of hashKeys) {
    const value = String(row[key] || "")
    if (value) return value
  }
  return ""
}

async function buildRecursiveReconciliationClosureObject(env: Env, url: URL, generated_at = new Date().toISOString()): Promise<RecursiveReconciliationClosureObject> {
  const drift = new Set<ReconciliationClosureDriftClass>()
  const requestedWindow = Number(url.searchParams.get("window") || RECONCILIATION_CLOSURE_MAX_WINDOW)
  const bounded_window = Number.isFinite(requestedWindow) && requestedWindow > 0 ? Math.floor(requestedWindow) : RECONCILIATION_CLOSURE_MAX_WINDOW
  if (bounded_window > RECONCILIATION_CLOSURE_MAX_WINDOW) drift.add("reconciliation_window_overflow")

  const graph = await deterministicGraphTraversalEngine(env)
  if (graph.drift_classes.length > 0 || graph.orphans.length > 0) drift.add("recursive_lineage_fragmentation")
  if (graph.traversal_depth_limit > RECONCILIATION_CLOSURE_MAX_WINDOW) drift.add("recursive_reconciliation_divergence")

  const graph_checkpoint_hash = await latestCheckpointBinding(env, LEGITIMACY_GRAPH_REGISTRY, ["graph_checkpoint_hash", "graph_coherence_hash"])
  const bootstrap_checkpoint_hash = await latestCheckpointBinding(env, BOOTSTRAP_SOVEREIGNTY_REGISTRY, ["lineage_checkpoint_hash", "manifest_hash"])
  const runtime_sovereignty_checkpoint_hash = await latestCheckpointBinding(env, "runtime_sovereignty_registry", ["sovereignty_hash", "runtime_surface_hash"])
  const federation_conformance_checkpoint_hash = await latestCheckpointBinding(env, FEDERATION_CONFORMANCE_REGISTRY, ["compatibility_hash", "checkpoint_hash", "fingerprint_hash"])

  if (graph_checkpoint_hash && graph_checkpoint_hash !== graph.graph_checkpoint_hash) drift.add("reconciliation_graph_binding_drift")
  if (!graph_checkpoint_hash && graph.nodes.length > 0) drift.add("reconciliation_graph_binding_drift")
  if (url.searchParams.get("bootstrap_checkpoint_hash") && url.searchParams.get("bootstrap_checkpoint_hash") !== bootstrap_checkpoint_hash) drift.add("reconciliation_bootstrap_binding_drift")
  if (url.searchParams.get("runtime_sovereignty_checkpoint_hash") && url.searchParams.get("runtime_sovereignty_checkpoint_hash") !== runtime_sovereignty_checkpoint_hash) drift.add("reconciliation_sovereignty_binding_drift")
  if (url.searchParams.get("federation_conformance_checkpoint_hash") && url.searchParams.get("federation_conformance_checkpoint_hash") !== federation_conformance_checkpoint_hash) drift.add("reconciliation_federation_binding_drift")
  if (url.searchParams.get("consume_replay_state") === "true" || url.searchParams.get("replay_resurrection") === "true") drift.add("reconciliation_replay_resurrection_attempt")
  if (url.searchParams.get("anchor") && url.searchParams.get("anchor") !== graph.graph_coherence_hash) drift.add("reconciliation_anchor_instability")
  if (url.searchParams.get("checkpoint_identity") && url.searchParams.get("checkpoint_identity") !== graph.graph_checkpoint_hash) drift.add("recursive_checkpoint_instability")

  const recursive_lineage_depth_evidence = graph.nodes.map((node) => `${node.registry}:${node.node_id}:${node.lineage_root}`).sort().slice(0, bounded_window)
  const lineage_depth = Math.min(graph.nodes.length, bounded_window)
  if (graph.nodes.length > bounded_window) drift.add("reconciliation_window_overflow")

  const deterministic_reconciliation_anchor = await sha256Hex(canonicalize({ graph_coherence_hash: graph.graph_coherence_hash, graph_checkpoint_hash: graph.graph_checkpoint_hash, graph_checkpoint_binding: graph_checkpoint_hash || graph.graph_checkpoint_hash, bootstrap_checkpoint_hash, runtime_sovereignty_checkpoint_hash, federation_conformance_checkpoint_hash }))
  const recursive_checkpoint_identity = await sha256Hex(canonicalize({ deterministic_reconciliation_anchor, lineage_depth, recursive_lineage_depth_evidence }))
  const equivalence_material = { deterministic_reconciliation_anchor, recursive_checkpoint_identity, graph_checkpoint_hash: graph.graph_checkpoint_hash, graph_checkpoint_binding: graph_checkpoint_hash || graph.graph_checkpoint_hash, bootstrap_checkpoint_hash, runtime_sovereignty_checkpoint_hash, federation_conformance_checkpoint_hash, drift_classes: Array.from(drift).sort() }
  const reconciliation_equivalence_state: ReconciliationEquivalenceState = drift.size === 0 ? "RECONCILIATION_EQUIVALENT" : "RECONCILIATION_DRIFT"
  if (reconciliation_equivalence_state !== "RECONCILIATION_EQUIVALENT") drift.add("reconciliation_equivalence_drift")
  const drift_classes = Array.from(drift).sort()
  const closure_object_hash = await sha256Hex(canonicalize({ ...equivalence_material, drift_classes, reconciliation_equivalence_state }))
  const closure_hash = await sha256Hex(canonicalize({ closure_object_hash, deterministic_reconciliation_anchor, recursive_checkpoint_identity, reconciliation_equivalence_state }))
  if (url.searchParams.get("closure_hash") && url.searchParams.get("closure_hash") !== closure_hash) drift_classes.push("reconciliation_closure_hash_mismatch")
  const normalized_drift_classes = Array.from(new Set(drift_classes)).sort()
  const closure_id = `reconciliation-closure:${await sha256Hex(canonicalize({ closure_hash, generated_at }))}`
  return Object.freeze({ closure_id, closure_hash, deterministic_reconciliation_anchor, recursive_checkpoint_identity, reconciliation_equivalence_state: normalized_drift_classes.length === 0 ? "RECONCILIATION_EQUIVALENT" : "RECONCILIATION_DRIFT", lineage_depth, bounded_window, graph_checkpoint_hash: graph.graph_checkpoint_hash, bootstrap_checkpoint_hash, runtime_sovereignty_checkpoint_hash, federation_conformance_checkpoint_hash, graph_checkpoint_binding: graph_checkpoint_hash || graph.graph_checkpoint_hash, bootstrap_checkpoint_binding: bootstrap_checkpoint_hash, runtime_sovereignty_checkpoint_binding: runtime_sovereignty_checkpoint_hash, federation_conformance_checkpoint_binding: federation_conformance_checkpoint_hash, recursive_lineage_depth_evidence, drift_classes: normalized_drift_classes, closure_object_hash, ...reconciliationClosureFlags(), generated_at })
}

async function appendReconciliationClosureObservation(env: Env, closure: RecursiveReconciliationClosureObject) {
  await env.DB.prepare(`INSERT INTO reconciliation_closure_registry (closure_id,closure_hash,deterministic_reconciliation_anchor,recursive_checkpoint_identity,reconciliation_equivalence_state,lineage_depth,bounded_window,graph_checkpoint_hash,bootstrap_checkpoint_hash,runtime_sovereignty_checkpoint_hash,federation_conformance_checkpoint_hash,drift_classes,closure_object_hash,evidence_only,replay_neutral,mutation_capable,remote_authority_denied,read_only,creates_authority,execution_started,replay_consumed,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'true','true','false','true','true','false','false','false',?14,?15)`)
    .bind(closure.closure_id, closure.closure_hash, closure.deterministic_reconciliation_anchor, closure.recursive_checkpoint_identity, closure.reconciliation_equivalence_state, String(closure.lineage_depth), String(closure.bounded_window), closure.graph_checkpoint_hash, closure.bootstrap_checkpoint_hash, closure.runtime_sovereignty_checkpoint_hash, closure.federation_conformance_checkpoint_hash, canonicalize(closure.drift_classes), closure.closure_object_hash, closure.generated_at, closure.generated_at)
    .run()
}

async function ensureReconciliationClosureRegistry(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS reconciliation_closure_registry (closure_id TEXT PRIMARY KEY, closure_hash TEXT NOT NULL, deterministic_reconciliation_anchor TEXT NOT NULL, recursive_checkpoint_identity TEXT NOT NULL, reconciliation_equivalence_state TEXT NOT NULL CHECK (reconciliation_equivalence_state IN ('RECONCILIATION_EQUIVALENT','RECONCILIATION_DRIFT','NULL')), lineage_depth TEXT NOT NULL, bounded_window TEXT NOT NULL, graph_checkpoint_hash TEXT NOT NULL, bootstrap_checkpoint_hash TEXT NOT NULL, runtime_sovereignty_checkpoint_hash TEXT NOT NULL, federation_conformance_checkpoint_hash TEXT NOT NULL, drift_classes TEXT NOT NULL, closure_object_hash TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), execution_started TEXT NOT NULL CHECK (execution_started='false'), replay_consumed TEXT NOT NULL CHECK (replay_consumed='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reconciliation_closure_registry_hash ON reconciliation_closure_registry(closure_hash, recursive_checkpoint_identity, reconciliation_equivalence_state)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reconciliation_closure_registry_bindings ON reconciliation_closure_registry(graph_checkpoint_hash, bootstrap_checkpoint_hash, runtime_sovereignty_checkpoint_hash, federation_conformance_checkpoint_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reconciliation_closure_registry_drift ON reconciliation_closure_registry(reconciliation_equivalence_state, bounded_window)`).run()
  await validateReconciliationClosureRegistry(env)
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_reconciliation_closure_registry_no_update BEFORE UPDATE ON reconciliation_closure_registry BEGIN SELECT RAISE(ABORT, 'reconciliation_closure_registry is append-only'); END`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_reconciliation_closure_registry_no_delete BEFORE DELETE ON reconciliation_closure_registry BEGIN SELECT RAISE(ABORT, 'reconciliation_closure_registry is append-only'); END`).run()
}

async function validateReconciliationClosureRegistry(env: Env) {
  const columns = await tableColumns(env, RECONCILIATION_CLOSURE_REGISTRY)
  if (columns.size === 0) return
  for (const column of REQUIRED_SCHEMA_COLUMNS.reconciliation_closure_registry) {
    if (!columns.has(column)) throw new SchemaInitializationError("missing_required_column")
  }
}


const DRIFT_PROPAGATION_ROUTES = [RECONCILIATION_IMPACT_ROUTE, RECONCILIATION_VERDICT_ROUTE, RECONCILIATION_PROPAGATION_ROUTE, RECONCILIATION_TOPOLOGY_DELTA_ROUTE] as const
const DRIFT_PROPAGATION_CLASSES = ["TOPOLOGY_DRIFT_PROPAGATED", "MERGE_LINEAGE_CONTAMINATED", "GOVERNANCE_IMPACT_EXPANDED", "SCHEMA_PROPAGATION_FAILURE", "WORKFLOW_TRUST_COLLAPSE", "PROOF_LINEAGE_CONTAMINATION", "RECONCILIATION_EQUIVALENCE_INVALID", "DOWNSTREAM_LEGITIMACY_NULL"] as const
const DRIFT_PROPAGATION_FLAGS = { evidence_only: true, executable: false, creates_authority: false, mutation_capable: false, deployment_capable: false, proof_generating: false, fail_closed_on_ambiguity: true, read_only: true, replay_neutral: true, authoritative: false } as const
const DRIFT_PROPAGATION_RULES: Record<string, string[]> = {
  SCHEMA_DIVERGENCE: ["route_binding_invalid", "governance_binding_invalid", "reconciliation_equivalence_invalid", "preo_legitimacy_invalid", "merge_legitimacy_null"],
  UNDECLARED_SURFACE: ["topology_legitimacy_null", "downstream_proof_lineage_contaminated", "merge_legitimacy_null"],
  WORKFLOW_EXPANSION: ["preo_lineage_invalid", "governed_merge_invalid", "reconciliation_verdict_drift_propagated"],
  GOVERNANCE_MISMATCH: ["governance_binding_invalid", "reconciliation_equivalence_invalid", "preo_legitimacy_invalid", "merge_legitimacy_null"],
  TOPOLOGY_DRIFT: ["topology_legitimacy_null", "downstream_legitimacy_null", "merge_legitimacy_null"],
  PROOF_LINEAGE_DISCONTINUITY: ["continuity_invalid", "execution_legitimacy_invalid", "downstream_proof_trust_invalid"],
}
const DRIFT_CONSEQUENCE_CLASSES: Record<string, string> = {
  route_binding_invalid: "SCHEMA_PROPAGATION_FAILURE",
  governance_binding_invalid: "GOVERNANCE_IMPACT_EXPANDED",
  reconciliation_equivalence_invalid: "RECONCILIATION_EQUIVALENCE_INVALID",
  preo_legitimacy_invalid: "DOWNSTREAM_LEGITIMACY_NULL",
  merge_legitimacy_null: "MERGE_LINEAGE_CONTAMINATED",
  topology_legitimacy_null: "TOPOLOGY_DRIFT_PROPAGATED",
  downstream_proof_lineage_contaminated: "PROOF_LINEAGE_CONTAMINATION",
  preo_lineage_invalid: "WORKFLOW_TRUST_COLLAPSE",
  governed_merge_invalid: "MERGE_LINEAGE_CONTAMINATED",
  reconciliation_verdict_drift_propagated: "TOPOLOGY_DRIFT_PROPAGATED",
  continuity_invalid: "PROOF_LINEAGE_CONTAMINATION",
  execution_legitimacy_invalid: "DOWNSTREAM_LEGITIMACY_NULL",
  downstream_proof_trust_invalid: "PROOF_LINEAGE_CONTAMINATION",
  downstream_legitimacy_null: "DOWNSTREAM_LEGITIMACY_NULL",
}

function propagationStableIdentity(value: any): string {
  if (typeof value === "string") return value
  if (!isPlainRecord(value)) return canonicalize(value)
  return String(value.identity || value.id || value.route || value.path || value.surface_id || value.source_id || value.workflow || value.name || canonicalize(value))
}

function propagationSort(records: any[]): any[] {
  return [...records].map(normalizeCanonicalValue).sort((left, right) => {
    const byIdentity = propagationStableIdentity(left).localeCompare(propagationStableIdentity(right))
    if (byIdentity !== 0) return byIdentity
    return canonicalize(left).localeCompare(canonicalize(right))
  })
}

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value
  if (typeof value !== "string") return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseJsonRecord(value: unknown): any {
  if (isPlainRecord(value)) return value
  if (typeof value !== "string") return {}
  try {
    const parsed = JSON.parse(value)
    return isPlainRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function propagationClass(entry: any): string {
  const classification = String(entry?.classification || entry?.drift_class || "").toUpperCase()
  const reason = String(entry?.reason || "").toLowerCase()
  if (classification === "PROOF_LINEAGE_DISCONTINUITY" || reason.includes("proof_lineage") || reason.includes("continuity")) return "PROOF_LINEAGE_DISCONTINUITY"
  if (DRIFT_PROPAGATION_RULES[classification]) return classification
  return classification ? "TOPOLOGY_DRIFT" : "NULL"
}

async function ensureLegitimacyDriftPropagationRegistry(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS legitimacy_drift_propagation_registry (propagation_id TEXT PRIMARY KEY, propagation_hash TEXT NOT NULL, topology_hash TEXT NOT NULL, impact_hash TEXT NOT NULL, merge_legitimacy_hash TEXT NOT NULL, verdict_hash TEXT NOT NULL, classification TEXT NOT NULL CHECK (classification IN ('TOPOLOGY_VALID','TOPOLOGY_DRIFT_PROPAGATED','MERGE_LINEAGE_CONTAMINATED','GOVERNANCE_IMPACT_EXPANDED','SCHEMA_PROPAGATION_FAILURE','WORKFLOW_TRUST_COLLAPSE','PROOF_LINEAGE_CONTAMINATION','RECONCILIATION_EQUIVALENCE_INVALID','DOWNSTREAM_LEGITIMACY_NULL','NULL')), propagation_object TEXT NOT NULL, impact_graph TEXT NOT NULL, merge_impact TEXT NOT NULL, verdict_object TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), proof_generating TEXT NOT NULL CHECK (proof_generating='false'), fail_closed_on_ambiguity TEXT NOT NULL CHECK (fail_closed_on_ambiguity='true'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_hash_unique ON legitimacy_drift_propagation_registry(propagation_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_topology ON legitimacy_drift_propagation_registry(topology_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_impact ON legitimacy_drift_propagation_registry(impact_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_merge ON legitimacy_drift_propagation_registry(merge_legitimacy_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_verdict ON legitimacy_drift_propagation_registry(verdict_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_classification ON legitimacy_drift_propagation_registry(classification)`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_legitimacy_drift_propagation_registry_no_update BEFORE UPDATE ON legitimacy_drift_propagation_registry BEGIN SELECT RAISE(ABORT, 'legitimacy_drift_propagation_registry is append-only'); END`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_legitimacy_drift_propagation_registry_no_delete BEFORE DELETE ON legitimacy_drift_propagation_registry BEGIN SELECT RAISE(ABORT, 'legitimacy_drift_propagation_registry is append-only'); END`).run()
  const columns = await tableColumns(env, LEGITIMACY_DRIFT_PROPAGATION_REGISTRY)
  for (const column of REQUIRED_SCHEMA_COLUMNS.legitimacy_drift_propagation_registry) {
    if (!columns.has(column)) throw new SchemaInitializationError("missing_required_column")
  }
}

async function latestTopologyReconciliationEvidence(env: Env): Promise<Record<string, unknown>> {
  const regenerated = await buildRuntimeTopologyReconciliationEnvelope(new Date(0).toISOString())
  const drift_summary = regenerated.drift.classification === "TOPOLOGY_VALID"
    ? []
    : regenerated.drift.drift_classes.map((classification) => ({ classification, identity: "regenerated_runtime_topology", reason: "regenerated_topology_reconciliation_dominates_stale_registry_evidence" }))
  return {
    classification: regenerated.drift.classification,
    topology_hash: regenerated.fingerprint.topology_hash,
    governance_hash: regenerated.fingerprint.topology_semantic_hash,
    workflow_hash: regenerated.fingerprint.topology_boundary_hash,
    schema_hash: regenerated.fingerprint.topology_lineage_hash,
    reconciliation_hash: regenerated.reconciliation_id,
    traversal_hash: regenerated.fingerprint.topology_equivalence_hash,
    drift_summary,
    topology_ancestry: [{ reconciliation_id: regenerated.reconciliation_id, topology_equivalence_hash: regenerated.fingerprint.topology_equivalence_hash, source: "regenerated_runtime_topology" }],
    selected_reconciliation_hash: regenerated.reconciliation_id,
    regenerated: true,
  }
}

async function buildDriftPropagationEnvelope(evidence: Record<string, unknown>) {
  const entries = propagationSort(parseJsonArray(evidence.drift_summary))
  const nodes: any[] = []
  const edges: any[] = []
  const propagated = new Set<string>()
  let ambiguous = false
  const max_depth = SYSTEM_MAX_CONTINUITY_DEPTH
  const max_nodes = 256
  for (const entry of entries) {
    const sourceClass = propagationClass(entry)
    if (sourceClass === "NULL") ambiguous = true
    const sourceId = `drift:${sourceClass}:${propagationStableIdentity(entry)}`
    if (nodes.length >= max_nodes) { ambiguous = true; break }
    nodes.push({ node_id: sourceId, node_type: "drift_source", classification: sourceClass, identity: propagationStableIdentity(entry), reason: String(entry?.reason || "unspecified") })
    let prior = sourceId
    for (const [depth, consequence] of (DRIFT_PROPAGATION_RULES[sourceClass] || []).entries()) {
      if (depth >= max_depth || nodes.length >= max_nodes) { ambiguous = true; break }
      const classification = DRIFT_CONSEQUENCE_CLASSES[consequence] || "DOWNSTREAM_LEGITIMACY_NULL"
      propagated.add(classification)
      const nodeId = `impact:${consequence}:${propagationStableIdentity(entry)}`
      nodes.push({ node_id: nodeId, node_type: "legitimacy_consequence", consequence, classification, depth: depth + 1, invalidates_legitimacy: true })
      edges.push({ from: prior, to: nodeId, rule: `${sourceClass}->${consequence}`, depth: depth + 1 })
      prior = nodeId
    }
  }
  if (ambiguous) propagated.add("DOWNSTREAM_LEGITIMACY_NULL")
  const drift_classes = [...propagated].sort()
  const topology_hash = String(evidence.topology_hash || await sha256Hex(canonicalize({ topology_null: true })))
  const impactMaterial = { topology_hash, nodes: propagationSort(nodes), edges: propagationSort(edges), drift_classes, bounded: true, max_depth, max_nodes, ambiguous }
  const impact_hash = await sha256Hex(canonicalize(impactMaterial))
  const impact_graph = { object_type: "GovernanceImpactGraph", ...impactMaterial, impact_hash, ...DRIFT_PROPAGATION_FLAGS }
  const topology_delta = { object_type: "TopologyDeltaObject", topology_hash, topology_ancestry: propagationSort(parseJsonArray(evidence.topology_ancestry)), drift_sources: entries, topology_delta_hash: await sha256Hex(canonicalize({ topology_hash, drift_sources: entries })), ...DRIFT_PROPAGATION_FLAGS }
  const propagationMaterial = { topology_delta, impact_hash, propagated_drift_classes: drift_classes, propagation_steps: impactMaterial.edges, fail_closed: ambiguous || drift_classes.length > 0 }
  const propagation_hash = await sha256Hex(canonicalize(propagationMaterial))
  const propagation_object = { object_type: "DriftPropagationObject", ...propagationMaterial, propagation_hash, ...DRIFT_PROPAGATION_FLAGS }
  const collapse_hash = await sha256Hex(canonicalize({ propagation_hash, drift_classes, collapsed: propagation_object.fail_closed }))
  const mergeMaterial = { merge_legitimacy: propagation_object.fail_closed || drift_classes.includes("MERGE_LINEAGE_CONTAMINATED") ? "NULL" : "UNCHANGED", governed_merge_allowed: false, merge_surfaces_fail_closed: propagation_object.fail_closed, collapse_hash, propagation_hash, invalidation_reasons: drift_classes }
  const merge_legitimacy_hash = await sha256Hex(canonicalize(mergeMaterial))
  const merge_impact = { object_type: "MergeLegitimacyImpactObject", ...mergeMaterial, merge_legitimacy_hash, ...DRIFT_PROPAGATION_FLAGS }
  const verdictMaterial = { impact_hash, propagation_hash, merge_legitimacy_hash, verdict: merge_impact.merge_legitimacy === "NULL" ? "DRIFT_PROPAGATED" : "NO_PROPAGATED_DRIFT", classification: drift_classes[0] || "TOPOLOGY_VALID", deterministic: true, replay_neutral: true }
  const verdict_hash = await sha256Hex(canonicalize(verdictMaterial))
  const verdict_object = { object_type: "ReconciliationVerdictObject", ...verdictMaterial, verdict_hash, ...DRIFT_PROPAGATION_FLAGS }
  return { status: merge_impact.merge_legitimacy === "NULL" ? "DRIFT_PROPAGATED" : "NO_PROPAGATED_DRIFT", impact_graph, topology_delta, propagation_object, merge_impact, verdict_object, propagation_hash, topology_hash, impact_hash, merge_legitimacy_hash, verdict_hash, classification: verdict_object.classification, drift_classes, ...DRIFT_PROPAGATION_FLAGS }
}

async function appendDriftPropagationObservation(env: Env, envelope: any) {
  await env.DB.prepare(`INSERT OR IGNORE INTO legitimacy_drift_propagation_registry (propagation_id,propagation_hash,topology_hash,impact_hash,merge_legitimacy_hash,verdict_hash,classification,propagation_object,impact_graph,merge_impact,verdict_object,evidence_only,replay_neutral,mutation_capable,read_only,creates_authority,executable,deployment_capable,proof_generating,fail_closed_on_ambiguity,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'true','true','false','true','false','false','false','false','true',?12,?13)`)
    .bind(envelope.propagation_hash, envelope.propagation_hash, envelope.topology_hash, envelope.impact_hash, envelope.merge_legitimacy_hash, envelope.verdict_hash, envelope.classification, canonicalize(envelope.propagation_object), canonicalize(envelope.impact_graph), canonicalize(envelope.merge_impact), canonicalize(envelope.verdict_object), new Date(0).toISOString(), new Date(0).toISOString())
    .run()
}


const QUARANTINE_CONTAINMENT_ROUTES = [RECONCILIATION_QUARANTINE_ROUTE, RECONCILIATION_CONTAINMENT_ROUTE, RECONCILIATION_ISOLATION_ROUTE, RECONCILIATION_FEDERATION_BOUNDARY_ROUTE] as const
const QUARANTINE_CONTAINMENT_CLASSES = ["RECURSIVE_QUARANTINE_ACTIVE", "FEDERATED_CONTAINMENT_REQUIRED", "LINEAGE_TRUST_ISOLATED", "TOPOLOGY_ANCESTRY_QUARANTINED", "DOWNSTREAM_COORDINATION_RESTRICTED", "MERGE_TRUST_COLLAPSED", "PROOF_TRUST_CONTAINED", "GOVERNANCE_CONTAMINATION_EXPANDED", "CONTAINMENT_BOUNDARY_OVERFLOW"] as const
const QUARANTINE_CONTAINMENT_FLAGS = { evidence_only: true, executable: false, creates_authority: false, mutation_capable: false, deployment_capable: false, proof_generating: false, fail_closed_on_ambiguity: true, quarantine_authoritative: false, read_only: true, replay_neutral: true, authoritative: false } as const
const QUARANTINE_CONTAINMENT_RULES: Record<string, string[]> = {
  PROOF_LINEAGE_CONTAMINATION: ["downstream_proof_trust_quarantined", "containment_boundary_established", "merge_legitimacy_isolated"],
  PROOF_LINEAGE_DISCONTINUITY: ["downstream_proof_trust_quarantined", "containment_boundary_established", "merge_legitimacy_isolated"],
  UNDECLARED_SURFACE: ["topology_contamination", "recursive_ancestry_quarantine", "federated_trust_isolation", "downstream_legitimacy_containment"],
  SCHEMA_DIVERGENCE: ["route_legitimacy_quarantine", "governance_continuity_collapse", "preo_trust_isolation"],
  SCHEMA_PROPAGATION_FAILURE: ["route_legitimacy_quarantine", "governance_continuity_collapse", "preo_trust_isolation"],
  GOVERNANCE_MISMATCH: ["containment_graph_expansion", "downstream_coordination_trust_restricted"],
  GOVERNANCE_IMPACT_EXPANDED: ["containment_graph_expansion", "downstream_coordination_trust_restricted"],
  TOPOLOGY_DRIFT: ["topology_contamination", "recursive_ancestry_quarantine", "downstream_legitimacy_containment"],
  TOPOLOGY_DRIFT_PROPAGATED: ["topology_contamination", "recursive_ancestry_quarantine", "downstream_legitimacy_containment"],
  MERGE_LINEAGE_CONTAMINATED: ["containment_boundary_established", "merge_legitimacy_isolated"],
  DOWNSTREAM_LEGITIMACY_NULL: ["downstream_legitimacy_containment", "downstream_coordination_trust_restricted"],
  WORKFLOW_TRUST_COLLAPSE: ["preo_trust_isolation", "merge_legitimacy_isolated"],
  RECONCILIATION_EQUIVALENCE_INVALID: ["containment_graph_expansion", "governance_continuity_collapse"],
}
const QUARANTINE_CONSEQUENCE_CLASSES: Record<string, string> = {
  downstream_proof_trust_quarantined: "PROOF_TRUST_CONTAINED",
  containment_boundary_established: "RECURSIVE_QUARANTINE_ACTIVE",
  merge_legitimacy_isolated: "MERGE_TRUST_COLLAPSED",
  topology_contamination: "TOPOLOGY_ANCESTRY_QUARANTINED",
  recursive_ancestry_quarantine: "TOPOLOGY_ANCESTRY_QUARANTINED",
  federated_trust_isolation: "FEDERATED_CONTAINMENT_REQUIRED",
  downstream_legitimacy_containment: "LINEAGE_TRUST_ISOLATED",
  route_legitimacy_quarantine: "RECURSIVE_QUARANTINE_ACTIVE",
  governance_continuity_collapse: "GOVERNANCE_CONTAMINATION_EXPANDED",
  preo_trust_isolation: "LINEAGE_TRUST_ISOLATED",
  containment_graph_expansion: "GOVERNANCE_CONTAMINATION_EXPANDED",
  downstream_coordination_trust_restricted: "DOWNSTREAM_COORDINATION_RESTRICTED",
}

function quarantineClass(entry: any): string {
  const classification = String(entry?.classification || entry?.drift_class || entry || "").toUpperCase()
  const reason = String(entry?.reason || "").toLowerCase()
  if (classification === "NULL") return "NULL"
  if (reason.includes("proof_lineage") || reason.includes("continuity") || classification === "PROOF_LINEAGE_DISCONTINUITY") return "PROOF_LINEAGE_CONTAMINATION"
  if (QUARANTINE_CONTAINMENT_RULES[classification]) return classification
  return classification ? "TOPOLOGY_DRIFT" : "NULL"
}

async function ensureLegitimacyQuarantineRegistry(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS legitimacy_quarantine_registry (quarantine_id TEXT PRIMARY KEY, quarantine_hash TEXT NOT NULL, containment_hash TEXT NOT NULL, lineage_hash TEXT NOT NULL, federation_hash TEXT NOT NULL, boundary_hash TEXT NOT NULL, classification TEXT NOT NULL CHECK (classification IN ('RECURSIVE_QUARANTINE_ACTIVE','FEDERATED_CONTAINMENT_REQUIRED','LINEAGE_TRUST_ISOLATED','TOPOLOGY_ANCESTRY_QUARANTINED','DOWNSTREAM_COORDINATION_RESTRICTED','MERGE_TRUST_COLLAPSED','PROOF_TRUST_CONTAINED','GOVERNANCE_CONTAMINATION_EXPANDED','CONTAINMENT_BOUNDARY_OVERFLOW','NULL')), quarantine_object TEXT NOT NULL, containment_boundary TEXT NOT NULL, isolation_graph TEXT NOT NULL, federated_containment TEXT NOT NULL, propagation_envelope TEXT NOT NULL, verdict_object TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), proof_generating TEXT NOT NULL CHECK (proof_generating='false'), fail_closed_on_ambiguity TEXT NOT NULL CHECK (fail_closed_on_ambiguity='true'), quarantine_authoritative TEXT NOT NULL CHECK (quarantine_authoritative='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_quarantine_hash ON legitimacy_quarantine_registry(quarantine_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_containment_hash ON legitimacy_quarantine_registry(containment_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_lineage_hash ON legitimacy_quarantine_registry(lineage_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_federation_hash ON legitimacy_quarantine_registry(federation_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_boundary_hash ON legitimacy_quarantine_registry(boundary_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_legitimacy_quarantine_registry_classification ON legitimacy_quarantine_registry(classification)`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_legitimacy_quarantine_registry_no_update BEFORE UPDATE ON legitimacy_quarantine_registry BEGIN SELECT RAISE(ABORT, 'legitimacy_quarantine_registry is append-only'); END`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_legitimacy_quarantine_registry_no_delete BEFORE DELETE ON legitimacy_quarantine_registry BEGIN SELECT RAISE(ABORT, 'legitimacy_quarantine_registry is append-only'); END`).run()
  const columns = await tableColumns(env, LEGITIMACY_QUARANTINE_REGISTRY)
  for (const column of REQUIRED_SCHEMA_COLUMNS.legitimacy_quarantine_registry) if (!columns.has(column)) throw new SchemaInitializationError("missing_required_column")
}

async function latestContainmentContaminationEvidence(env: Env): Promise<Record<string, unknown>> {
  const propagated = await env.DB.prepare(`SELECT * FROM legitimacy_drift_propagation_registry ORDER BY propagation_hash ASC LIMIT 1`).all<any>()
  const row = Array.isArray(propagated?.results) ? propagated.results[0] : null
  if (row) {
    const propagationObject = parseJsonRecord(row.propagation_object)
    return { classification: String(row.classification || "NULL"), propagated_drift_classes: Array.isArray(propagationObject.propagated_drift_classes) ? propagationObject.propagated_drift_classes : [], lineage_hash: String(row.topology_hash || ""), propagation_hash: String(row.propagation_hash || ""), drift_summary: Array.isArray(propagationObject.topology_delta?.drift_sources) ? propagationObject.topology_delta.drift_sources : [] }
  }
  const evidence = await latestTopologyReconciliationEvidence(env)
  return { ...evidence, lineage_hash: String(evidence.topology_hash || "") }
}

async function buildQuarantineContainmentEnvelope(evidence: Record<string, unknown>) {
  const sourceEntries = propagationSort(parseJsonArray(evidence.drift_summary).length > 0 ? parseJsonArray(evidence.drift_summary) : (Array.isArray(evidence.propagated_drift_classes) ? (evidence.propagated_drift_classes as any[]).map((classification) => ({ classification, identity: classification, reason: "propagated_drift_class" })) : []))
  const nodes: any[] = []
  const edges: any[] = []
  const classes = new Set<string>()
  let ambiguous = false
  const max_depth = SYSTEM_MAX_CONTINUITY_DEPTH
  const max_nodes = 256
  for (const entry of sourceEntries) {
    const sourceClass = quarantineClass(entry)
    if (sourceClass === "NULL") ambiguous = true
    if (nodes.length >= max_nodes) { ambiguous = true; break }
    const sourceId = `contamination:${sourceClass}:${propagationStableIdentity(entry)}`
    nodes.push({ node_id: sourceId, node_type: "contamination_source", classification: sourceClass, identity: propagationStableIdentity(entry), reason: String(entry?.reason || "unspecified") })
    let prior = sourceId
    for (const [depth, consequence] of (QUARANTINE_CONTAINMENT_RULES[sourceClass] || []).entries()) {
      if (depth >= max_depth || nodes.length >= max_nodes) { ambiguous = true; break }
      const classification = QUARANTINE_CONSEQUENCE_CLASSES[consequence] || "DOWNSTREAM_COORDINATION_RESTRICTED"
      classes.add(classification)
      const nodeId = `containment:${consequence}:${propagationStableIdentity(entry)}`
      nodes.push({ node_id: nodeId, node_type: "containment_consequence", consequence, classification, depth: depth + 1, quarantines_legitimacy: true })
      edges.push({ from: prior, to: nodeId, rule: `${sourceClass}->${consequence}`, depth: depth + 1 })
      prior = nodeId
    }
  }
  if (ambiguous) classes.add("CONTAINMENT_BOUNDARY_OVERFLOW")
  const containment_classes = Array.from(classes).sort()
  const lineage_hash = String(evidence.lineage_hash || evidence.topology_hash || await sha256Hex(canonicalize({ quarantine_null_lineage: true })))
  const graphMaterial = { nodes: propagationSort(nodes), edges: propagationSort(edges), containment_classes, bounded: true, max_depth, max_nodes, ambiguous, truncated: ambiguous, lineage_hash }
  const containment_hash = await sha256Hex(canonicalize(graphMaterial))
  const isolation_graph = { object_type: "RecursiveIsolationGraph", ...graphMaterial, containment_hash, ...QUARANTINE_CONTAINMENT_FLAGS }
  const quarantined_objects = propagationSort(nodes.filter((node) => node.node_type === "containment_consequence").map((node) => ({ node_id: node.node_id, classification: node.classification, consequence: node.consequence })))
  const propagationMaterial = { containment_hash, quarantined_objects, containment_classes, fail_closed: ambiguous || containment_classes.length > 0 }
  const quarantine_hash = await sha256Hex(canonicalize(propagationMaterial))
  const propagation_envelope = { object_type: "QuarantinePropagationEnvelope", ...propagationMaterial, quarantine_hash, ...QUARANTINE_CONTAINMENT_FLAGS }
  const boundaryMaterial = { containment_hash, boundary_nodes: propagationSort(nodes.filter((node) => node.node_type === "containment_consequence")), merge_legitimacy: containment_classes.includes("MERGE_TRUST_COLLAPSED") || containment_classes.includes("RECURSIVE_QUARANTINE_ACTIVE") || containment_classes.includes("CONTAINMENT_BOUNDARY_OVERFLOW") ? "NULL" : "UNCHANGED", merge_authorization_allowed: false, containment_blocked: containment_classes.length > 0, governance_surfaces_trust_continuity: containment_classes.includes("GOVERNANCE_CONTAMINATION_EXPANDED") ? "ISOLATED" : "UNCHANGED" }
  const boundary_hash = await sha256Hex(canonicalize(boundaryMaterial))
  const containment_boundary = { object_type: "ContainmentBoundaryObject", ...boundaryMaterial, boundary_hash, ...QUARANTINE_CONTAINMENT_FLAGS }
  const federationMaterial = { containment_hash, federation_state: containment_classes.includes("FEDERATED_CONTAINMENT_REQUIRED") || containment_classes.includes("LINEAGE_TRUST_ISOLATED") || containment_classes.includes("CONTAINMENT_BOUNDARY_OVERFLOW") ? "FEDERATED_TRUST_ISOLATED" : "FEDERATED_TRUST_UNCHANGED", isolated_boundaries: propagationSort(nodes.filter((node) => ["FEDERATED_CONTAINMENT_REQUIRED", "LINEAGE_TRUST_ISOLATED"].includes(node.classification))), remote_authority_denied: true, remote_execution_legitimacy: false }
  const federation_hash = await sha256Hex(canonicalize(federationMaterial))
  const federated_containment = { object_type: "FederatedContainmentObject", ...federationMaterial, federation_hash, ...QUARANTINE_CONTAINMENT_FLAGS }
  const classification = containment_classes[0] || "NULL"
  const verdictMaterial = { containment_hash, boundary_hash, federation_hash, classification, containment_verdict: containment_classes.length > 0 ? "CONTAINMENT_ACTIVE" : "NO_CONTAINMENT_REQUIRED", downstream_legitimacy: containment_classes.length > 0 ? "QUARANTINED" : "UNCHANGED", governed_merge_allowed: false, preo_validity: containment_classes.length > 0 ? "NULL" : "UNCHANGED", classes: containment_classes }
  const verdict_hash = await sha256Hex(canonicalize(verdictMaterial))
  const verdict_object = { object_type: "ContainmentVerdictObject", ...verdictMaterial, verdict_hash, ...QUARANTINE_CONTAINMENT_FLAGS }
  const quarantineMaterial = { quarantine_hash, containment_hash, quarantined_objects, lineage_hash, containment_classes }
  const quarantine_object = { object_type: "LegitimacyQuarantineObject", ...quarantineMaterial, object_hash: await sha256Hex(canonicalize(quarantineMaterial)), ...QUARANTINE_CONTAINMENT_FLAGS }
  return { status: verdict_object.containment_verdict, quarantine_hash, containment_hash, lineage_hash, federation_hash, boundary_hash, classification, quarantine_object, containment_boundary, isolation_graph, federated_containment, propagation_envelope, verdict_object, containment_classes, ...QUARANTINE_CONTAINMENT_FLAGS }
}

async function appendQuarantineContainmentObservation(env: Env, envelope: any) {
  await env.DB.prepare(`INSERT OR IGNORE INTO legitimacy_quarantine_registry (quarantine_id,quarantine_hash,containment_hash,lineage_hash,federation_hash,boundary_hash,classification,quarantine_object,containment_boundary,isolation_graph,federated_containment,propagation_envelope,verdict_object,evidence_only,replay_neutral,mutation_capable,read_only,creates_authority,executable,deployment_capable,proof_generating,fail_closed_on_ambiguity,quarantine_authoritative,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'true','true','false','true','false','false','false','false','true','false',?14,?15)`)
    .bind(envelope.quarantine_hash, envelope.quarantine_hash, envelope.containment_hash, envelope.lineage_hash, envelope.federation_hash, envelope.boundary_hash, envelope.classification, canonicalize(envelope.quarantine_object), canonicalize(envelope.containment_boundary), canonicalize(envelope.isolation_graph), canonicalize(envelope.federated_containment), canonicalize(envelope.propagation_envelope), canonicalize(envelope.verdict_object), new Date(0).toISOString(), new Date(0).toISOString())
    .run()
}

async function ensureLegitimacyGraphRegistry(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS legitimacy_graph_registry (graph_checkpoint_id TEXT PRIMARY KEY, graph_checkpoint_hash TEXT NOT NULL, graph_coherence_hash TEXT NOT NULL, node_count TEXT NOT NULL, edge_count TEXT NOT NULL, orphan_count TEXT NOT NULL, drift_classes TEXT NOT NULL, checkpoint_object_hash TEXT NOT NULL, cross_registry_replay_continuity TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), execution_started TEXT NOT NULL CHECK (execution_started='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
  await validateLegitimacyGraphRegistry(env)
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_legitimacy_graph_registry_no_update BEFORE UPDATE ON legitimacy_graph_registry BEGIN SELECT RAISE(ABORT, 'legitimacy_graph_registry is append-only'); END`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_legitimacy_graph_registry_no_delete BEFORE DELETE ON legitimacy_graph_registry BEGIN SELECT RAISE(ABORT, 'legitimacy_graph_registry is append-only'); END`).run()
}

async function validateLegitimacyGraphRegistry(env: Env) {
  const columns = await tableColumns(env, LEGITIMACY_GRAPH_REGISTRY)
  if (columns.size === 0) return
  for (const column of REQUIRED_SCHEMA_COLUMNS.legitimacy_graph_registry) {
    if (!columns.has(column)) throw new SchemaInitializationError("missing_required_column")
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
  if (!continuity_id) return
  const lineageCte = `WITH RECURSIVE lineage(continuity_id) AS (
    SELECT continuity_id FROM continuity_registry WHERE continuity_id=?1
    UNION ALL
    SELECT c.continuity_id FROM continuity_registry c JOIN lineage l ON c.parent_continuity_id = l.continuity_id
  )`
  await env.DB.prepare(`${lineageCte}
    UPDATE continuity_registry SET status=?2, revoked_at=COALESCE(revoked_at, ?3)
    WHERE continuity_id IN (SELECT continuity_id FROM lineage)
      AND status IN ('ACTIVE','RESERVED','EXECUTED','CONSUMED')`).bind(continuity_id, status, invalidated_at).run()
  await env.DB.prepare(`${lineageCte}
    UPDATE authority_registry SET status='REVOKED'
    WHERE continuity_id IN (SELECT continuity_id FROM lineage)
      AND status IN ('ACTIVE','VALIDATED','RESERVED','EXECUTED')`).bind(continuity_id).run()
  await env.DB.prepare(`${lineageCte}
    UPDATE validation_registry SET status='REVOKED', result='INVALID', reason=?2
    WHERE continuity_id IN (SELECT continuity_id FROM lineage)
      AND status='VALID'`).bind(continuity_id, reason).run()
  await env.DB.prepare(`${lineageCte}
    UPDATE invocation_registry SET status='REVOKED'
    WHERE continuity_id IN (SELECT continuity_id FROM lineage)
      AND status='RESERVED'`).bind(continuity_id).run()
  const delegatedRows = await env.DB.prepare(`${lineageCte}
    SELECT delegated_authority_id, delegation_lineage_hash
    FROM authority_registry
    WHERE continuity_id IN (SELECT continuity_id FROM lineage)
      AND delegated_authority_id IS NOT NULL AND delegated_authority_id != ''`).bind(continuity_id).all<any>()
  for (const row of Array.isArray(delegatedRows?.results) ? delegatedRows.results : []) {
    await appendDelegatedRevocationProjection(env, { object_type: "DelegatedRevocationProjection", delegated_authority_id: String(row.delegated_authority_id || ""), delegation_lineage_hash: String(row.delegation_lineage_hash || ""), projection_status: status, revocation_reason: reason, evidence_only: true, replay_neutral: true }, invalidated_at)
  }
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



async function resolveContinuityLineage(env: Env, continuity_id: string, session: any, decision_id?: string): Promise<{requestedContinuity: any, requestedCanonical: any, ancestry: any[]} | null> {
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
    const continuitySession = await env.DB.prepare(`SELECT session_id, identity_id, expires_at, continuity_status FROM session_registry WHERE session_id=?1 LIMIT 2`).bind(String(continuity.session_id || "")).all<any>()
    const continuitySessionRows = Array.isArray(continuitySession.results) ? continuitySession.results : []
    if (continuitySessionRows.length !== 1) {
      await cascadeRevocation(env, current_id)
      return null
    }
    const ancestorSession = continuitySessionRows[0] || {}
    if (String(ancestorSession.continuity_status || "") !== "ACTIVE" || isExpired(String(ancestorSession.expires_at || ""))) {
      await cascadeExpiration(env, current_id, now)
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
  return { requestedContinuity, requestedCanonical, ancestry }
}

async function continuityIsRevokedOrAmbiguous(env: Env, continuity_id: string): Promise<boolean> {
  if (!continuity_id) return true
  const row = await env.DB.prepare(`SELECT session_id, identity_id FROM continuity_registry WHERE continuity_id=?1 LIMIT 1`).bind(continuity_id).first<any>()
  if (!row) return true
  const session = await env.DB.prepare(`SELECT session_id, identity_id, expires_at, continuity_status FROM session_registry WHERE session_id=?1 LIMIT 1`).bind(String(row.session_id || "")).first<any>()
  if (!session || String(session.identity_id || "") !== String(row.identity_id || "") || String(session.continuity_status || "") !== "ACTIVE" || isExpired(String(session.expires_at || ""))) return true
  const lineage = await resolveContinuityLineage(env, continuity_id, session)
  return !lineage
}

async function activeContinuity(env: Env, continuity_id: string, session: any, decision_id?: string): Promise<any | null> {
  const lineage = await resolveContinuityLineage(env, continuity_id, session, decision_id)
  if (!lineage) return null
  return { ...lineage.requestedContinuity, canonical: lineage.requestedCanonical, ancestry: lineage.ancestry }
}

async function resolveCurrentContinuityIdentity(env: Env, session: any): Promise<{ continuity_id: string, identity_id: string } | null> {
  const session_id = String(session?.session_id || "")
  const identity_id = String(session?.identity_id || "")
  if (!session_id || !identity_id) return null
  const row = await env.DB.prepare(
    `SELECT c.continuity_id, c.identity_id
     FROM continuity_registry c
     WHERE c.session_id=?1
       AND c.identity_id=?2
       AND c.status='ACTIVE'
       AND (c.revoked_at IS NULL OR c.revoked_at='')
       AND c.expires_at>?3
       AND NOT EXISTS (
         SELECT 1 FROM continuity_registry child
         WHERE child.parent_continuity_id=c.continuity_id
           AND child.session_id=c.session_id
           AND child.identity_id=c.identity_id
           AND child.status='ACTIVE'
           AND (child.revoked_at IS NULL OR child.revoked_at='')
           AND child.expires_at>?3
       )
     ORDER BY c.issued_at DESC, c.continuity_id DESC
     LIMIT 1`
  ).bind(session_id, identity_id, new Date().toISOString()).first<any>()
  if (!row) return null
  return { continuity_id: String(row.continuity_id || ""), identity_id: String(row.identity_id || "") }
}

function parseCanonicalRecordJson(value: unknown): Record<string, unknown> {
  try { return canonicalRecord(JSON.parse(String(value || "{}"))) } catch { return {} }
}

function delegationScopeIsSubset(parentScopeInput: unknown, childScopeInput: unknown): boolean {
  const parentScope = canonicalRecord(parentScopeInput)
  const childScope = canonicalRecord(childScopeInput)
  for (const [key, value] of Object.entries(childScope)) {
    if (!Object.prototype.hasOwnProperty.call(parentScope, key)) return false
    if (canonicalize(parentScope[key]) !== canonicalize(value)) return false
  }
  return true
}

function delegationFieldsFromAuthority(authority: any): DelegatedAuthorityObject | null {
  const delegated_authority_id = String(authority?.delegated_authority_id || "")
  if (!delegated_authority_id) return null
  return {
    delegated_authority_id,
    parent_authority_id: String(authority?.parent_authority_id || ""),
    authority_id: String(authority?.authority_id || ""),
    decision_id: String(authority?.decision_id || ""),
    continuity_id: String(authority?.continuity_id || ""),
    delegation_depth: Number(authority?.delegation_depth || 0),
    delegation_scope_subset: parseCanonicalRecordJson(authority?.delegation_scope_subset || authority?.scope || "{}"),
    delegation_expiry: String(authority?.delegation_expiry || authority?.expiry || ""),
    delegation_lineage_hash: String(authority?.delegation_lineage_hash || ""),
    delegation_root_hash: String(authority?.delegation_root_hash || ""),
    delegated_replay_chain_hash: String(authority?.delegated_replay_chain_hash || ""),
    exact_object_hash: ""
  }
}

async function delegatedExactObjectHash(input: Omit<DelegatedAuthorityObject, "exact_object_hash">): Promise<string> {
  return sha256Hex(canonicalize({ object_type: "DelegatedAuthorityObject", ...input }))
}

async function appendDelegatedAuthorityObject(env: Env, object: DelegatedAuthorityObject, created_at = new Date().toISOString()) {
  await env.DB.prepare(`INSERT INTO delegated_authority_registry (registry_id,object_type,delegated_authority_id,parent_authority_id,authority_id,decision_id,continuity_id,delegation_depth,delegation_scope_subset,delegation_expiry,delegation_lineage_hash,delegation_root_hash,delegated_replay_chain_hash,canonical_delegation_object,exact_object_hash,projection_status,revocation_reason,evidence_only,replay_neutral,mutation_capable,read_only,created_at) VALUES (?1,'DelegatedAuthorityObject',?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,'ACTIVE',NULL,'true','true','false','true',?15)`).bind(crypto.randomUUID(), object.delegated_authority_id, object.parent_authority_id, object.authority_id, object.decision_id, object.continuity_id, String(object.delegation_depth), canonicalize(object.delegation_scope_subset), object.delegation_expiry, object.delegation_lineage_hash, object.delegation_root_hash, object.delegated_replay_chain_hash, canonicalize({ object_type: "DelegatedAuthorityObject", delegated_authority_id: object.delegated_authority_id, parent_authority_id: object.parent_authority_id, authority_id: object.authority_id, decision_id: object.decision_id, continuity_id: object.continuity_id, delegation_depth: object.delegation_depth, delegation_scope_subset: object.delegation_scope_subset, delegation_expiry: object.delegation_expiry, delegation_lineage_hash: object.delegation_lineage_hash, delegation_root_hash: object.delegation_root_hash, delegated_replay_chain_hash: object.delegated_replay_chain_hash }), object.exact_object_hash, created_at).run()
}

async function appendDelegatedRevocationProjection(env: Env, projection: DelegatedRevocationProjection, created_at = new Date().toISOString()) {
  const exact_object_hash = await sha256Hex(canonicalize(projection))
  await env.DB.prepare(`INSERT OR IGNORE INTO delegated_authority_registry (registry_id,object_type,delegated_authority_id,parent_authority_id,authority_id,decision_id,continuity_id,delegation_depth,delegation_scope_subset,delegation_expiry,delegation_lineage_hash,delegation_root_hash,delegated_replay_chain_hash,canonical_delegation_object,exact_object_hash,projection_status,revocation_reason,evidence_only,replay_neutral,mutation_capable,read_only,created_at) VALUES (?1,'DelegatedRevocationProjection',?2,'',NULL,NULL,NULL,'0','{}','',?3,'',?4,?5,?6,?7,?8,'true','true','false','true',?9)`).bind(crypto.randomUUID(), projection.delegated_authority_id, projection.delegation_lineage_hash, "", canonicalize(projection), exact_object_hash, projection.projection_status, projection.revocation_reason, created_at).run()
}

async function validateDelegatedAuthorityLineage(env: Env, authority: any, compiledCanonicalAeo?: CanonicalAEO | null): Promise<{ ok: true, delegated: DelegatedAuthorityObject | null } | { ok: false, reason: string, drift_class: DelegatedAuthorityDriftClass }> {
  const delegated = delegationFieldsFromAuthority(authority)
  if (!delegated) return { ok: true, delegated: null }
  if (!delegated.parent_authority_id || !delegated.delegation_lineage_hash || !delegated.delegation_root_hash || !delegated.delegated_replay_chain_hash) return { ok: false, reason: "delegated_lineage_corrupt", drift_class: "delegated_lineage_drift" }
  if (isExpired(delegated.delegation_expiry)) return { ok: false, reason: "delegated_authority_expired", drift_class: "delegated_revocation_failure" }
  const parent = await env.DB.prepare(`SELECT * FROM authority_registry WHERE authority_id=?1`).bind(delegated.parent_authority_id).first<any>()
  if (!parent) return { ok: false, reason: "orphaned_delegation", drift_class: "orphaned_delegated_execution" }
  if (["REVOKED","CONSUMED"].includes(String(parent.status || ""))) return { ok: false, reason: "parent_authority_unusable", drift_class: "delegated_revocation_failure" }
  if (Date.parse(delegated.delegation_expiry) > Date.parse(String(parent.delegation_expiry || parent.expiry || ""))) return { ok: false, reason: "delegation_expiry_exceeds_parent", drift_class: "delegated_lineage_drift" }
  if (!delegationScopeIsSubset(parseCanonicalRecordJson(parent.delegation_scope_subset || parent.scope || "{}"), delegated.delegation_scope_subset)) return { ok: false, reason: "delegated_scope_expansion", drift_class: "delegated_scope_expansion" }
  const parentRoot = String(parent.delegation_root_hash || "") || await sha256Hex(canonicalize({ root_authority_id: parent.authority_id, decision_id: parent.decision_id }))
  if (delegated.delegation_root_hash !== parentRoot) return { ok: false, reason: "delegation_root_divergence", drift_class: "delegation_root_divergence" }
  const expectedLineage = await sha256Hex(canonicalize({ delegated_authority_id: delegated.delegated_authority_id, parent_authority_id: delegated.parent_authority_id, authority_id: delegated.authority_id, decision_id: delegated.decision_id, delegation_depth: delegated.delegation_depth, delegation_scope_subset: delegated.delegation_scope_subset, delegation_expiry: delegated.delegation_expiry, parent_lineage_hash: String(parent.delegation_lineage_hash || parentRoot), delegation_root_hash: delegated.delegation_root_hash }))
  if (expectedLineage !== delegated.delegation_lineage_hash) return { ok: false, reason: "delegation_lineage_corruption", drift_class: "delegated_lineage_drift" }
  const expectedReplay = await sha256Hex(canonicalize({ delegated_authority_id: delegated.delegated_authority_id, delegation_lineage_hash: delegated.delegation_lineage_hash, decision_id: delegated.decision_id, validated_object_hash: "" }))
  if (compiledCanonicalAeo && expectedReplay !== delegated.delegated_replay_chain_hash) return { ok: false, reason: "delegated_replay_chain_corruption", drift_class: "delegated_replay_resurrection" }
  if (compiledCanonicalAeo) {
    const scope = canonicalRecord(compiledCanonicalAeo.scope)
    if (String(scope.delegated_authority_id || "") !== delegated.delegated_authority_id || String(scope.parent_authority_id || "") !== delegated.parent_authority_id || String(scope.delegation_lineage_hash || "") !== delegated.delegation_lineage_hash) return { ok: false, reason: "delegated_exact_object_drift", drift_class: "delegated_exact_object_drift" }
  }
  const registryObject = await env.DB.prepare(`SELECT canonical_delegation_object, exact_object_hash FROM delegated_authority_registry WHERE delegated_authority_id=?1 AND object_type='DelegatedAuthorityObject' ORDER BY created_at ASC LIMIT 1`).bind(delegated.delegated_authority_id).first<any>()
  if (!registryObject) return { ok: false, reason: "orphaned_delegation", drift_class: "orphaned_delegated_execution" }
  const storedExactHash = await sha256Hex(String(registryObject.canonical_delegation_object || ""))
  if (storedExactHash !== String(registryObject.exact_object_hash || "")) return { ok: false, reason: "delegated_exact_object_drift", drift_class: "delegated_exact_object_drift" }
  const revocation = await env.DB.prepare(`SELECT registry_id FROM delegated_authority_registry WHERE delegated_authority_id=?1 AND object_type='DelegatedRevocationProjection' AND projection_status IN ('REVOKED','EXPIRED') LIMIT 1`).bind(delegated.delegated_authority_id).first<any>()
  if (revocation) return { ok: false, reason: "delegated_authority_revoked", drift_class: "delegated_revocation_failure" }
  const replay = await env.DB.prepare(`SELECT execution_id FROM execution_registry WHERE delegated_authority_id=?1 OR delegated_replay_chain_hash=?2 LIMIT 1`).bind(delegated.delegated_authority_id, delegated.delegated_replay_chain_hash).first<any>()
  if (replay) return { ok: false, reason: "replayed_delegated_authority", drift_class: "delegated_replay_resurrection" }
  return { ok: true, delegated }
}

async function buildDelegatedAuthorityForIssuance(env: Env, input: any, authorityBase: any): Promise<{ ok: true, object: DelegatedAuthorityObject | null } | { ok: false, reason: string, drift_class: DelegatedAuthorityDriftClass }> {
  const parent_authority_id = String(input.parent_authority_id || input.delegation?.parent_authority_id || "")
  if (!parent_authority_id) return { ok: true, object: null }
  const parent = await env.DB.prepare(`SELECT * FROM authority_registry WHERE authority_id=?1`).bind(parent_authority_id).first<any>()
  if (!parent) return { ok: false, reason: "orphaned_delegation", drift_class: "orphaned_delegated_execution" }
  if (!["ACTIVE","VALIDATED","RESERVED"].includes(String(parent.status || ""))) return { ok: false, reason: "parent_authority_unusable", drift_class: "delegated_revocation_failure" }
  const delegation_scope_subset = canonicalRecord(input.delegation_scope_subset || input.scope || {})
  if (!delegationScopeIsSubset(parseCanonicalRecordJson(parent.delegation_scope_subset || parent.scope || "{}"), delegation_scope_subset)) return { ok: false, reason: "delegated_scope_expansion", drift_class: "delegated_scope_expansion" }
  const delegation_expiry = String(input.delegation_expiry || input.expiry || authorityBase.expiry || "")
  if (isExpired(delegation_expiry)) return { ok: false, reason: "delegated_authority_expired", drift_class: "delegated_revocation_failure" }
  if (Date.parse(delegation_expiry) > Date.parse(String(parent.delegation_expiry || parent.expiry || ""))) return { ok: false, reason: "delegation_expiry_exceeds_parent", drift_class: "delegated_lineage_drift" }
  const parentDepth = Number(parent.delegation_depth || 0)
  const delegation_depth = parentDepth + 1
  if (delegation_depth > SYSTEM_MAX_CONTINUITY_DEPTH) return { ok: false, reason: "recursive_delegation_instability", drift_class: "recursive_delegation_instability" }
  const delegated_authority_id = String(input.delegated_authority_id || crypto.randomUUID())
  const delegation_root_hash = String(parent.delegation_root_hash || "") || await sha256Hex(canonicalize({ root_authority_id: parent.authority_id, decision_id: parent.decision_id }))
  const delegation_lineage_hash = await sha256Hex(canonicalize({ delegated_authority_id, parent_authority_id, authority_id: authorityBase.authority_id, decision_id: authorityBase.decision_id, delegation_depth, delegation_scope_subset, delegation_expiry, parent_lineage_hash: String(parent.delegation_lineage_hash || delegation_root_hash), delegation_root_hash }))
  const delegated_replay_chain_hash = await sha256Hex(canonicalize({ delegated_authority_id, delegation_lineage_hash, decision_id: authorityBase.decision_id, validated_object_hash: "" }))
  const partial = { delegated_authority_id, parent_authority_id, authority_id: authorityBase.authority_id, decision_id: authorityBase.decision_id, continuity_id: authorityBase.continuity_id, delegation_depth, delegation_scope_subset, delegation_expiry, delegation_lineage_hash, delegation_root_hash, delegated_replay_chain_hash }
  const exact_object_hash = await delegatedExactObjectHash(partial)
  return { ok: true, object: { ...partial, exact_object_hash } }
}

async function delegatedObservabilityEnvelope(env: Env, url: URL): Promise<DelegationChainEnvelope & { checkpoint_hash: string, replay: DelegatedReplayEnvelope | null }> {
  const delegated_authority_id = String(url.searchParams.get("delegated_authority_id") || "")
  const rows = await env.DB.prepare(`SELECT * FROM delegated_authority_registry WHERE (?1='' OR delegated_authority_id=?1) ORDER BY created_at ASC, registry_id ASC LIMIT 100`).bind(delegated_authority_id).all<any>()
  const chain: DelegatedAuthorityObject[] = []
  const drift = new Set<DelegatedAuthorityDriftClass>()
  for (const row of Array.isArray(rows?.results) ? rows.results : []) {
    if (String(row.object_type) !== "DelegatedAuthorityObject") continue
    let parsed: any = null
    try { parsed = JSON.parse(String(row.canonical_delegation_object || "{}")) } catch {}
    const object = parsed && isPlainRecord(parsed) ? parsed as DelegatedAuthorityObject : null
    if (!object) drift.add("delegated_exact_object_drift")
    else chain.push({ ...object, exact_object_hash: String(row.exact_object_hash || "") })
  }
  if (chain.length === 0 && delegated_authority_id) drift.add("orphaned_delegated_execution")
  const checkpoint_hash = await sha256Hex(canonicalize({ object_type: "DelegationChainEnvelope", chain, drift_classes: Array.from(drift).sort(), delegated_authority_id }))
  const replay: DelegatedReplayEnvelope | null = delegated_authority_id ? { object_type: "DelegatedReplayEnvelope", delegated_authority_id, delegated_replay_chain_hash: String(chain[chain.length - 1]?.delegated_replay_chain_hash || ""), replay_consumed: false, replay_detected: false, evidence_only: true, replay_neutral: true } : null
  return { object_type: "DelegationChainEnvelope", chain, drift_classes: Array.from(drift).sort(), checkpoint_hash, replay, evidence_only: true, replay_neutral: true }
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
type ReconciliationReport = {
  report_id: string
  traversal_id: string
  traversal_hash: string
  reconciliation_merkle_root: string
  registry_order: readonly ReconciliationRegistry[]
  checked_registries: ReconciliationRegistry[]
  drift_results: DriftClass[]
  quarantine_candidates: string[]
  evidence_only: true
  replay_neutral: true
  created_at: string
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
    default:
      return { sql: `SELECT * FROM ${registry} LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [], lookup_key: registry }
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
      if (!String(row.parent_compilation_hash || "")) return "orphan_legitimacy_object_drift"
      if (String(row.parent_compilation_hash || "") !== String(context.aeo.validated_object_hash || "")) return "recursive_ancestry_drift"
      if (String(row.lineage_stage || "") !== "validate") return "recursive_ancestry_drift"
      if (!String(row.lineage_origin_hash || "")) return "orphan_legitimacy_object_drift"
      {
        const validationLineageOrigin = verifyLineageOrigin({
          stage: "validate",
          decision_id: String(row.decision_id || ""),
          validated_object_hash: String(row.validated_object_hash || ""),
          lineage_stage: String(row.lineage_stage || ""),
          lineage_origin_hash: String(row.lineage_origin_hash || ""),
          parent_compilation_hash: String(row.parent_compilation_hash || ""),
          compiled_hash: String(context.aeo.validated_object_hash || "")
        })
        if (!validationLineageOrigin.ok) return "recursive_ancestry_drift"
      }
      context.validation = row
      return "VALID"
    case "execution_registry":
      if (!context.validation) return "orphan_legitimacy_object_drift"
      if (String(row.session_id || "") !== String(context.validation.session_id || "")) return "recursive_ancestry_drift"
      if (String(row.continuity_id || "") !== String(context.validation.continuity_id || "")) return "recursive_ancestry_drift"
      if (String(row.decision_id || "") !== String(context.validation.decision_id || "")) return "recursive_ancestry_drift"
      if (String(row.validated_object_hash || "") !== String(context.validation.validated_object_hash || "")) return "recursive_ancestry_drift"
      if (String(row.invocation_nonce || "") !== String(context.validation.invocation_nonce || "")) return "replay_chain_drift"
      if (!String(row.parent_validation_hash || "")) return "orphan_legitimacy_object_drift"
      if (String(row.parent_validation_hash || "") !== String(context.validation.lineage_origin_hash || "")) return "proof_lineage_drift"
      if (String(row.lineage_stage || "") !== "execute") return "proof_lineage_drift"
      if (!String(row.lineage_origin_hash || "")) return "orphan_legitimacy_object_drift"
      {
        const executionLineageOrigin = verifyLineageOrigin({
          stage: "execute",
          decision_id: String(row.decision_id || ""),
          validated_object_hash: String(row.validated_object_hash || ""),
          lineage_stage: String(row.lineage_stage || ""),
          lineage_origin_hash: String(row.lineage_origin_hash || ""),
          parent_validation_hash: String(row.parent_validation_hash || ""),
          validation_hash: String(context.validation.lineage_origin_hash || "")
        })
        if (!executionLineageOrigin.ok) return "proof_lineage_drift"
      }
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
      if (!String(row.parent_execution_hash || "")) return "orphan_legitimacy_object_drift"
      if (String(row.parent_execution_hash || "") !== String(context.execution.lineage_origin_hash || "")) return "proof_lineage_drift"
      if (String(row.lineage_stage || "") !== "proof") return "proof_lineage_drift"
      if (!String(row.lineage_origin_hash || "")) return "orphan_legitimacy_object_drift"
      {
        const proofLineageOrigin = verifyLineageOrigin({
          stage: "proof",
          decision_id: String(row.decision_id || ""),
          validated_object_hash: String(row.validated_object_hash || ""),
          lineage_stage: String(row.lineage_stage || ""),
          lineage_origin_hash: String(row.lineage_origin_hash || ""),
          parent_execution_hash: String(row.parent_execution_hash || ""),
          execution_hash: String(context.execution.lineage_origin_hash || "")
        })
        if (!proofLineageOrigin.ok) return "proof_lineage_drift"
      }
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
    default:
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
    default:
      return populatedCanonicalIdentifiers({})
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

async function deterministicTraversalHash(result: ReconciliationResult, reconciliation_merkle_root: string, traversal_id: string): Promise<string> {
  const canonicalTrace = result.canonical_registry_ordering
    .map((registry) => result.deterministic_traversal_trace.find((entry) => entry.registry === registry) || null)
    .filter((entry): entry is ReconciliationTraceEntry => Boolean(entry))
    .map((entry) => canonicalRecord({
      registry: entry.registry,
      canonical_traversal_position: entry.canonical_traversal_position,
      reconciliation_depth: entry.reconciliation_depth,
      lookup_key: entry.lookup_key,
      row_count: entry.row_count,
      lineage_hash: String(entry.lineage_hash || ""),
      canonical_identifiers: entry.canonical_identifiers || null
    }))
  const drift_classes = result.drift_classifications.map((drift) => drift.drift_class).sort()
  const hashContinuity = canonicalTrace.map((entry) => ({
    proof_hash: String((entry.canonical_identifiers as any)?.proof_id || ""),
    execution_hash: String((entry.canonical_identifiers as any)?.execution_id || ""),
    validation_hash: String((entry.canonical_identifiers as any)?.validated_object_hash || "")
  }))
  return sha256Hex(canonicalize({
    traversal_id,
    lineage_anchor: result.lineage_anchor,
    registry_order: result.canonical_registry_ordering,
    checked_registries: canonicalTrace.map((entry) => entry.registry),
    drift_classes,
    reconciliation_merkle_root,
    hash_continuity: hashContinuity
  }))
}

async function deterministicReconciliationReportHash(report: Omit<ReconciliationReport, "report_id">): Promise<string> {
  return sha256Hex(canonicalize(report))
}

async function deterministicReconciliationReport(result: ReconciliationResult, created_at: string): Promise<ReconciliationReport> {
  const merkle = await reconciliationMerkleEvidence(result)
  const traversed = new Set(result.deterministic_traversal_trace.map((entry) => entry.registry))
  const checked_registries = result.canonical_registry_ordering.filter((registry) => traversed.has(registry))
  const drift_results = result.drift_classifications.map((drift) => drift.drift_class).sort()
  const quarantine_candidates = result.drift_classifications
    .filter((drift) => drift.severity === "CRITICAL" || drift.severity === "HIGH")
    .map((drift) => drift.lineage_anchor)
    .sort()
  const traversal_id = await sha256Hex(canonicalize({
    anchor: result.lineage_anchor,
    canonical_registry_ordering: result.canonical_registry_ordering,
    deterministic_traversal_trace: result.deterministic_traversal_trace
  }))
  const traversal_hash = await deterministicTraversalHash(result, merkle.root, traversal_id)
  const reportPayload = {
    traversal_id,
    traversal_hash,
    reconciliation_merkle_root: merkle.root,
    registry_order: result.canonical_registry_ordering,
    checked_registries,
    drift_results,
    quarantine_candidates,
    evidence_only: true as const,
    replay_neutral: true as const,
    created_at
  }
  return { report_id: await deterministicReconciliationReportHash(reportPayload), ...reportPayload }
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
  if (!hmac_secret) return false
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
    WHERE decision_hash IN (
      SELECT decision_hash FROM proof_registry GROUP BY decision_hash HAVING COUNT(*) > 1
    )
    ORDER BY decision_id ASC, validated_object_hash ASC, created_at ASC, proof_id ASC`).all<any>()
  const rows = Array.isArray(duplicateRows?.results) ? duplicateRows.results : []
  if (rows.length === 0) return { detected: false, quarantined: 0 }

  const groups = new Map<string, any[]>()
  for (const row of rows) {
    const key = String(row.decision_hash || proofDecisionHash(String(row.decision_id || ""), String(row.validated_object_hash || "")))
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


async function backfillProofDecisionHashes(env: Env) {
  await env.DB.prepare(`UPDATE proof_registry SET decision_hash = decision_id || char(31) || validated_object_hash WHERE decision_hash IS NULL OR decision_hash = ''`).run()
}

async function validateProofArchiveCompatibility(env: Env) {
  await env.DB.prepare(`INSERT OR IGNORE INTO proof_registry_duplicate_archive (archive_id,proof_id,session_id,execution_id,decision_id,validated_object_hash,surface,run_id,commit_sha,workflow,environment,created_at,archived_at,archive_reason,canonical_proof_id)
    SELECT 'bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe',NULL,NULL,NULL,NULL,NULL,'bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','archive_compatibility_probe','bootstrap_archive_compatibility_probe'
    WHERE 0`).run()
}

async function proofRegistryStabilized(env: Env): Promise<boolean> {
  const duplicates = await env.DB.prepare(`SELECT COUNT(*) AS count FROM (
    SELECT decision_hash FROM proof_registry WHERE decision_hash IS NULL OR decision_hash = '' OR decision_hash != decision_id || char(31) || validated_object_hash
    UNION ALL
    SELECT decision_hash FROM proof_registry GROUP BY decision_hash HAVING COUNT(*) > 1
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

async function emitInstallBaseTelemetryEvidence(env: Env, event: {
  event_type: InstallBaseTelemetryEventType
  decision_id?: string
  authority_id?: string
  execution_id?: string
  proof_id?: string
  lineage_origin_hash?: string
  lineage_origin_match?: "MATCH" | "MISMATCH" | "UNKNOWN"
  payload?: Record<string, unknown>
}) {
  const created_at = new Date().toISOString()
  const payload = canonicalize({ ...(event.payload || {}), telemetry: "evidence_only", non_authoritative: true, append_only: true, created_at })
  await env.DB.prepare(`INSERT INTO install_base_telemetry_registry (event_id,event_type,decision_id,authority_id,execution_id,proof_id,lineage_origin_hash,lineage_origin_match,evidence_only,non_authoritative,append_only,payload,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'true','true','true',?9,?10)`)
    .bind(crypto.randomUUID(), event.event_type, event.decision_id || null, event.authority_id || null, event.execution_id || null, event.proof_id || null, event.lineage_origin_hash || null, event.lineage_origin_match || "UNKNOWN", payload, created_at)
    .run()
}

async function emitInstallBaseTelemetryEvidenceBestEffort(env: Env, event: {
  event_type: InstallBaseTelemetryEventType
  decision_id?: string
  authority_id?: string
  execution_id?: string
  proof_id?: string
  lineage_origin_hash?: string
  lineage_origin_match?: "MATCH" | "MISMATCH" | "UNKNOWN"
  payload?: Record<string, unknown>
}) {
  try {
    await emitInstallBaseTelemetryEvidence(env, event)
  } catch (error) {
    try {
      await emitTelemetry(env, {
        event_type: "INSTALL_BASE_TELEMETRY_WRITE_FAILED",
        severity: "WARN",
        decision_id: event.decision_id,
        authority_id: event.authority_id,
        execution_id: event.execution_id,
        proof_id: event.proof_id,
        payload: {
          install_base_event_type: event.event_type,
          lineage_origin_hash: event.lineage_origin_hash || null,
          lineage_origin_match: event.lineage_origin_match || "UNKNOWN",
          bounded_noop: true,
          observability_only: true,
          non_authoritative: true,
          error: String(error)
        }
      })
    } catch {
      // Intentionally swallowed: install-base telemetry is best-effort evidence only and
      // must never alter /validate, /execute, or /proof legitimacy outcomes.
    }
  }
}

function deterministicRatio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Number((numerator / denominator).toFixed(12))
}

async function installBaseGovernanceMetrics(env: Env) {
  const rows = await env.DB.prepare(`SELECT event_type, COUNT(*) AS count FROM install_base_telemetry_registry GROUP BY event_type`).all<any>()
  const counts = new Map<string, number>()
  for (const row of rows.results || []) counts.set(String(row.event_type || ""), Number(row.count || 0))
  const total_executions = counts.get("governed_execution_attempted") || 0
  const governed_execution_total = counts.get("governed_execution_completed") || 0
  const validated_execution_total = counts.get("validated_execution") || 0
  const proof_generated_total = counts.get("proof_generated") || 0
  const execution_surface_count = counts.get("execution_surface_observed") || 0
  const governed_executions = governed_execution_total
  const invalid_attempts_observed = counts.get("invalid_execution_blocked") || 0
  const invalid_attempts_blocked = invalid_attempts_observed
  const replay_attempts_observed = counts.get("replay_rejected") || 0
  const replay_attempts_rejected = replay_attempts_observed
  const continuity_bound_executions = (counts.get("governed_execution_completed") || 0) + (counts.get("continuity_rejected") || 0)
  const valid_continuity_executions = counts.get("governed_execution_completed") || 0
  const executions_with_valid_proof = proof_generated_total
  return {
    source: "install_base_telemetry_registry",
    deterministic: true,
    read_only: true,
    evidence_only: true,
    non_authoritative: true,
    append_only_source: true,
    no_execution_authority: true,
    no_validator_influence: true,
    no_proof_legitimacy_inference: true,
    numerators_denominators: {
      governance_dependency_ratio: { governed_executions, total_executions },
      fail_closed_interception_ratio: { invalid_attempts_blocked, invalid_attempts_observed },
      proof_attachment_ratio: { executions_with_valid_proof, governed_executions },
      replay_rejection_ratio: { replay_attempts_rejected, replay_attempts_observed },
      continuity_integrity_ratio: { valid_continuity_executions, continuity_bound_executions },
    },
    governance_dependency_ratio: deterministicRatio(governed_executions, total_executions),
    fail_closed_interception_ratio: deterministicRatio(invalid_attempts_blocked, invalid_attempts_observed),
    proof_attachment_ratio: deterministicRatio(executions_with_valid_proof, governed_executions),
    replay_rejection_ratio: deterministicRatio(replay_attempts_rejected, replay_attempts_observed),
    continuity_integrity_ratio: deterministicRatio(valid_continuity_executions, continuity_bound_executions),
    governed_execution_total,
    validated_execution_total,
    proof_generated_total,
    execution_surface_count,
    blocked_execution_total: counts.get("invalid_execution_blocked") || 0,
    cost_per_legitimate_execution: null,
    invalid_execution_block_total: counts.get("invalid_execution_blocked") || 0,
    replay_rejection_total: counts.get("replay_rejected") || 0,
    hash_mismatch_total: counts.get("hash_mismatch_rejected") || 0,
    expired_authority_rejection_total: counts.get("expired_authority_rejected") || 0,
    policy_violation_total: counts.get("policy_violation_rejected") || 0,
    continuity_chain_depth: null,
    orphaned_lineage_total: counts.get("orphaned_lineage_observed") || 0,
    revocation_propagation_total: counts.get("revocation_propagation_observed") || 0,
    continuity_expiry_total: counts.get("continuity_expiry_rejected") || 0,
    stale_lineage_rejection_total: counts.get("stale_lineage_rejected") || 0,
    registry_reconciliation_failure_total: counts.get("reconciliation_failure_detected") || 0,
    replay_rejected_total: counts.get("replay_rejected") || 0,
    continuity_revocation_total: counts.get("revocation_propagation_observed") || 0,
    reconciliation_failure_total: counts.get("reconciliation_failure_detected") || 0,
    distributed_disagreement_total: counts.get("distributed_disagreement_observed") || 0,
    quorum_collapse_total: counts.get("quorum_collapse_observed") || 0,
    temporal_divergence_total: counts.get("temporal_divergence_observed") || 0,
    proof_lineage_conflict_total: counts.get("proof_lineage_conflict_observed") || 0,
  }
}



function boundedObservabilityWindow(url: URL, fallback = 30): number {
  const requested = Number(url.searchParams.get("window") || url.searchParams.get("limit") || String(fallback))
  if (!Number.isFinite(requested) || requested < 1) return fallback
  return Math.min(Math.floor(requested), 90)
}

async function installBaseEventTrend(env: Env, event_type: InstallBaseTelemetryEventType, window: number) {
  const rows = await env.DB.prepare(`SELECT substr(created_at,1,10) AS day, COUNT(*) AS count FROM install_base_telemetry_registry WHERE event_type=?1 GROUP BY day ORDER BY day DESC LIMIT ?2`)
    .bind(event_type, window)
    .all<any>()
  return (rows.results || []).map((row: any) => ({ day: String(row.day || ""), count: Number(row.count || 0) }))
}

async function governanceObservabilityEvidence(env: Env, window: number) {
  const telemetrySummaryRows = await env.DB.prepare(`SELECT event_type, COUNT(*) AS count FROM observability_registry GROUP BY event_type ORDER BY count DESC LIMIT 50`).all<any>()
  const telemetry_event_summaries = (telemetrySummaryRows.results || []).map((row: any) => ({ event_type: String(row.event_type || ""), count: Number(row.count || 0) }))
  const governance_dependency_metrics = await installBaseGovernanceMetrics(env)
  const replay_rejection_trends = await installBaseEventTrend(env, "replay_rejected", window)
  const continuity_rejection_trends = await installBaseEventTrend(env, "continuity_rejected", window)
  const workflow_integrity_drift_trends = await installBaseEventTrend(env, "workflow_integrity_drift", window)
  const reconciliation_failure_trends = await installBaseEventTrend(env, "reconciliation_failure_detected", window)
  return {
    classification: {
      evidence_only: true,
      read_only: true,
      get_only: true,
      non_authoritative: true,
      mutation_capable: false,
      creates_authority: false,
      influences_validator_outcome: false,
      influences_execution_eligibility: false,
      creates_proof_legitimacy: false,
      mutates_runtime_lineage: false,
      append_only_telemetry_preserved: true,
      deterministic_metrics_preserved: true,
    },
    telemetry_event_summaries,
    governance_dependency_metrics,
    replay_rejection_trends,
    continuity_rejection_trends,
    workflow_integrity_drift_trends,
    reconciliation_failure_trends,
  }
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


function continuousFateFlags() {
  return { evidence_only: true, replay_neutral: true, append_only: true, authoritative: false, mutation_capable: false, creates_authority: false, execution_started: false, replay_consumed: false, remote_authority_denied: true, read_only: true }
}

function continuousFateStressDepth(url: URL): number {
  const requested = Number(url.searchParams.get("runtime_stress_depth") || url.searchParams.get("depth") || "10")
  if (!Number.isFinite(requested) || requested < 1) return 1
  return Math.min(Math.floor(requested), CONTINUOUS_FATE_MAX_STRESS_DEPTH)
}

function continuousFateDriftTaxonomy(): ContinuousFATEDriftClass[] {
  return ["continuous_fate_divergence", "replay_mutation_survival", "sovereignty_escape_detected", "runtime_stress_instability", "governance_replay_divergence", "reconciliation_corruption_detected", "topology_instability_detected", "deterministic_stress_hash_mismatch", "continuous_fate_checkpoint_instability", "recursive_drift_accumulation"]
}

function continuousFateStressClasses(): FATEStressScenario["stress_class"][] {
  return ["replay_resurrection_attempts", "hidden_route_emergence", "governance_mutation_replay", "recursive_lineage_corruption", "topology_instability", "reconciliation_corruption", "delegated_replay_resurrection", "authority_fragmentation", "proof_discontinuity", "federation_drift_accumulation"]
}

async function ensureContinuousFATERegistry(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS continuous_fate_registry (continuous_fate_id TEXT PRIMARY KEY, stress_window_id TEXT NOT NULL, deterministic_stress_hash TEXT NOT NULL, topology_stability_hash TEXT NOT NULL, drift_survivability_state TEXT NOT NULL CHECK (drift_survivability_state IN ('SURVIVED','FAIL_CLOSED','NULL')), replay_mutation_vector_hash TEXT NOT NULL, governance_replay_checkpoint TEXT NOT NULL, runtime_stress_depth TEXT NOT NULL, scenario_set_hash TEXT NOT NULL, drift_classes TEXT NOT NULL, checkpoint_hash TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), execution_started TEXT NOT NULL CHECK (execution_started='false'), replay_consumed TEXT NOT NULL CHECK (replay_consumed='false'), authoritative TEXT NOT NULL CHECK (authoritative='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_continuous_fate_registry_checkpoint_unique ON continuous_fate_registry(checkpoint_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_continuous_fate_registry_deterministic ON continuous_fate_registry(stress_window_id, deterministic_stress_hash, topology_stability_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_continuous_fate_registry_replay_checkpoint ON continuous_fate_registry(replay_mutation_vector_hash, governance_replay_checkpoint)`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_continuous_fate_registry_no_update BEFORE UPDATE ON continuous_fate_registry BEGIN SELECT RAISE(ABORT, 'continuous_fate_registry is append-only'); END`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_continuous_fate_registry_no_delete BEFORE DELETE ON continuous_fate_registry BEGIN SELECT RAISE(ABORT, 'continuous_fate_registry is append-only'); END`).run()
}

async function buildFATEStressScenario(stress_class: FATEStressScenario["stress_class"], deterministic_order: number, drift_class: ContinuousFATEDriftClass, stress_window_id: string, runtime_stress_depth: number): Promise<FATEStressScenario> {
  const evidence_hash = await sha256Hex(canonicalize({ stress_class, deterministic_order, expected_result: "NULL", stress_window_id, runtime_stress_depth, replay_neutral: true, mutation_allowed: false }))
  return { scenario_id: `fate-scenario-${String(deterministic_order).padStart(2, "0")}-${stress_class}`, stress_class, deterministic_order, expected_result: "NULL", drift_class, evidence_hash }
}

async function buildContinuousFATEEnvelope(url: URL, generated_at: string): Promise<ContinuousFATEEnvelope> {
  const runtime_stress_depth = continuousFateStressDepth(url)
  const stress_window_id = String(url.searchParams.get("stress_window_id") || "continuous-fate-default-window")
  const driftTaxonomy = continuousFateDriftTaxonomy()
  const stressClasses = continuousFateStressClasses()
  const scenarios = await Promise.all(stressClasses.map((stress_class, index) => buildFATEStressScenario(stress_class, index + 1, driftTaxonomy[index], stress_window_id, runtime_stress_depth)))
  const scenario_set_hash = await sha256Hex(canonicalize(scenarios.map((scenario) => ({ scenario_id: scenario.scenario_id, stress_class: scenario.stress_class, deterministic_order: scenario.deterministic_order, expected_result: scenario.expected_result, drift_class: scenario.drift_class, evidence_hash: scenario.evidence_hash }))))
  const replay_mutation_vectors: ReplayMutationVector[] = []
  for (const mutation_type of ["replay_resurrection_attempt", "governance_mutation_replay", "delegated_replay_resurrection"] as const) {
    const target_registry = mutation_type === "governance_mutation_replay" ? "recursive_governance_replay_registry" : mutation_type === "delegated_replay_resurrection" ? "delegated_authority_registry" : "invocation_registry"
    const exact_object_hash = await sha256Hex(canonicalize({ mutation_type, target_registry, stress_window_id, runtime_stress_depth, exact_object_mutation_verification: true }))
    const vector_hash = await sha256Hex(canonicalize({ mutation_type, target_registry, exact_object_hash, replay_consumed: false, mutation_allowed: false }))
    replay_mutation_vectors.push({ vector_id: `vector-${mutation_type}`, mutation_type, target_registry, exact_object_hash, replay_consumed: false, mutation_allowed: false, vector_hash })
  }
  const replay_mutation_vector_hash = await sha256Hex(canonicalize(replay_mutation_vectors))
  const sovereignty_escape_probes: SovereigntyEscapeProbe[] = []
  for (const [index, route] of [...CANONICAL_RUNTIME_ROUTES, ...NON_EXECUTABLE_OBSERVABILITY_ROUTES].sort().entries()) {
    const method = CONTINUOUS_FATE_ROUTES.includes(route as any) || NON_EXECUTABLE_OBSERVABILITY_ROUTES.includes(route as any) ? "GET" : "POST"
    const contained = !CONTINUOUS_FATE_ROUTES.includes(route as any) || method === "GET"
    const probe_hash = await sha256Hex(canonicalize({ route, method, creates_authority: false, execution_capable: false, mutation_capable: false, remote_authority_denied: true, contained, deterministic_order: index + 1 }))
    sovereignty_escape_probes.push({ probe_id: `sovereignty-probe-${String(index + 1).padStart(2, "0")}`, route, method, creates_authority: false, execution_capable: false, mutation_capable: false, remote_authority_denied: true, contained, probe_hash })
  }
  const topology_stability_hash = await sha256Hex(canonicalize({ canonical_runtime_routes: [...CANONICAL_RUNTIME_ROUTES].sort(), observability_routes: [...NON_EXECUTABLE_OBSERVABILITY_ROUTES].sort(), continuous_fate_routes: [...CONTINUOUS_FATE_ROUTES].sort(), bounded_recursive_stress_depth: CONTINUOUS_FATE_MAX_STRESS_DEPTH, hidden_route_emergence: false }))
  const governance_replay_checkpoint = await sha256Hex(canonicalize({ scenario_set_hash, replay_mutation_vector_hash, topology_stability_hash, governance_replay_divergence: "FAIL_CLOSED", replay_consumed: false }))
  const exact_object_hash = await sha256Hex(canonicalize({ scenario_set_hash, replay_mutation_vector_hash, governance_replay_checkpoint, exact_object_mutation_verification: true }))
  const governance_drift_replay_object: GovernanceDriftReplayObject = { replay_object_id: `governance-drift-replay-${stress_window_id}`, governance_replay_checkpoint, exact_object_hash, mutation_verified: true, checkpoint_hash: await sha256Hex(canonicalize({ exact_object_hash, governance_replay_checkpoint, replay_consumed: false })), replay_consumed: false }
  const deterministic_stress_hash = await sha256Hex(canonicalize({ scenario_set_hash, replay_mutation_vector_hash, topology_stability_hash, governance_replay_checkpoint, runtime_stress_depth, stress_window_id, deterministic_stress_replay_ordering: true }))
  const drift_survivability_state: RuntimeStressCheckpoint["drift_survivability_state"] = runtime_stress_depth <= CONTINUOUS_FATE_MAX_STRESS_DEPTH ? "SURVIVED" : "FAIL_CLOSED"
  const continuous_fate_id = await sha256Hex(canonicalize({ object_type: "ContinuousFATEEnvelope", stress_window_id, deterministic_stress_hash, topology_stability_hash }))
  const checkpoint_hash = await sha256Hex(canonicalize({ continuous_fate_id, stress_window_id, deterministic_stress_hash, topology_stability_hash, drift_survivability_state, replay_mutation_vector_hash, governance_replay_checkpoint, runtime_stress_depth }))
  const runtime_stress_checkpoint: RuntimeStressCheckpoint = { checkpoint_id: `runtime-stress-checkpoint-${checkpoint_hash.slice(0, 24)}`, continuous_fate_id, stress_window_id, deterministic_stress_hash, topology_stability_hash, drift_survivability_state, replay_mutation_vector_hash, governance_replay_checkpoint, runtime_stress_depth, checkpoint_hash, evidence_only: true, replay_neutral: true, mutation_capable: false }
  return { object_type: "ContinuousFATEEnvelope", continuous_fate_id, stress_window_id, deterministic_stress_hash, topology_stability_hash, drift_survivability_state, replay_mutation_vector_hash, governance_replay_checkpoint, runtime_stress_depth, scenarios, replay_mutation_vectors, sovereignty_escape_probes, governance_drift_replay_object, runtime_stress_checkpoint, drift_classes: driftTaxonomy, evidence_only: true, replay_neutral: true, append_only: true, authoritative: false, mutation_capable: false, creates_authority: false, execution_started: false, replay_consumed: false, generated_at }
}

async function appendContinuousFATEObservation(env: Env, envelope: ContinuousFATEEnvelope) {
  await ensureContinuousFATERegistry(env)
  await env.DB.prepare(`INSERT OR IGNORE INTO continuous_fate_registry (continuous_fate_id, stress_window_id, deterministic_stress_hash, topology_stability_hash, drift_survivability_state, replay_mutation_vector_hash, governance_replay_checkpoint, runtime_stress_depth, scenario_set_hash, drift_classes, checkpoint_hash, evidence_only, replay_neutral, mutation_capable, remote_authority_denied, read_only, creates_authority, execution_started, replay_consumed, authoritative, generated_at, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'true','true','false','true','true','false','false','false','false',?12,?12)`)
    .bind(envelope.continuous_fate_id, envelope.stress_window_id, envelope.deterministic_stress_hash, envelope.topology_stability_hash, envelope.drift_survivability_state, envelope.replay_mutation_vector_hash, envelope.governance_replay_checkpoint, String(envelope.runtime_stress_depth), await sha256Hex(canonicalize(envelope.scenarios)), canonicalize(envelope.drift_classes), envelope.runtime_stress_checkpoint.checkpoint_hash, envelope.generated_at)
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


const RUNTIME_VALIDATOR_SURFACE = Object.freeze(["activeContinuity", "activeSession", "authorized", "deploymentPreoLineage", "enforceRecursiveGovernanceBoundary", "validateDsseProvenanceEnvelope", "validateDelegatedAuthorityLineage", "validateExecutionProvenance", "verifyRecursiveGovernanceIntegrity"].sort())
const RUNTIME_REPLAY_TOPOLOGY = Object.freeze(["authority_registry.status", "execution_registry.unique_decision_object", "external_authority_registry.replay_neutral", "invocation_registry.nonce", "proof_registry.unique_decision_object", "proof_registry.unique_workflow_run", "recursive_governance_replay_registry"].sort())
const RUNTIME_PROOF_TOPOLOGY = Object.freeze(["attestation_registry", "proof_quarantine_registry", "proof_registry", "proof_registry_duplicate_archive"].sort())
const RUNTIME_GOVERNANCE_TOPOLOGY = Object.freeze(["bootstrap_sovereignty_registry", "external_authority_registry", "recursive_governance_registry", "runtime_governance_lock_registry", "runtime_sovereignty_registry", REQUIRE_PREO_LINEAGE, RECURSIVE_GOVERNANCE_ADMISSION_ROUTE, RECURSIVE_GOVERNANCE_ROUTE].sort())
const CANONICAL_EXECUTION_AUTHORITY_SURFACE = Object.freeze(["authority:create", "compile:aeo", "validate:exact-object", "execute:governed-deploy", "proof:persist-consume"].sort())
const CANONICAL_MIGRATION_CHAIN = Object.freeze([
  "0001_init.sql", "0002_governed_deploy_schema.sql", "0003_authority_registry_schema_fix.sql", "0004_enforcement_lock.sql", "0004_execution_replay_protection.sql", "0005_invocation_registry.sql", "0006_enforcement_reboot_v1.sql", "0007_canonical_aeo_registry_rebuild.sql", "0008_canonical_runtime_registry_rebuild.sql", "0009_runtime_observability_and_drift_registry.sql", "0010_identity_session_continuity.sql", "0011_proof_atomicity_unique_guard.sql", "0012_continuity_registry.sql", "0013_preo_registry.sql", "0014_deployment_provenance_lineage.sql", "0015_cryptographic_provenance_attestations.sql", "0016_federated_revocation_observability.sql", "0017_federated_trust_topology_observability.sql", "0018_distributed_legitimacy_interoperability.sql", "0019_distributed_reconciliation_governance.sql", "0020_governance_compression.sql", "0021_federation_conformance.sql", "0022_proof_quarantine_registry.sql", "0022_recursive_governance_registry.sql", "0023_recursive_governance_enforcement_boundary.sql", "0024_runtime_sovereignty_registry.sql", "0026_external_authority_registry.sql", "0027_bootstrap_sovereignty_registry.sql", "0028_legitimacy_graph_registry.sql", "0029_reconciliation_closure_registry.sql"
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

async function runtimeSovereigntyManifestReadOnly(env: Env): Promise<RuntimeSovereigntyManifest> {
  return RUNTIME_SOVEREIGNTY_FREEZES.get(env.DB) || await generateRuntimeSovereigntyManifest(new Date().toISOString())
}

async function assertRuntimeSovereigntyCanonical(env: Env, options: { readOnly?: boolean } = {}): Promise<RuntimeSovereigntyDrift> {
  const expected = options.readOnly ? await runtimeSovereigntyManifestReadOnly(env) : (RUNTIME_SOVEREIGNTY_FREEZES.get(env.DB) || await freezeRuntimeSovereignty(env))
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


const BOOTSTRAP_INITIALIZATION_ORDER = Object.freeze([
  "schema:create-registries",
  "schema:verify-required-columns",
  "proof:stabilize-duplicates",
  "proof:enforce-uniqueness",
  "governance:verify-recursive-boundary",
  "evolution:verify-consensus-registry",
  "sovereignty:freeze-runtime-surface",
  "sovereignty:append-checkpoint",
  "bootstrap:verify-initialization-lineage",
  "append-only:activate-triggers",
  "runtime:ready"
].sort())

function bootstrapDependencyNode(dependency_id: string, dependency_class: BootstrapDependencyNode["dependency_class"], declared_surface: string): BootstrapDependencyNode {
  return Object.freeze({ dependency_id, dependency_class, declared_surface, authority_granted: false, execution_capable: false, mutation_capable: false, replay_neutral: true })
}

function canonicalBootstrapDependencies(): readonly BootstrapDependencyNode[] {
  return Object.freeze([
    bootstrapDependencyNode("canonical_runtime_routes", "runtime", canonicalize(CANONICAL_RUNTIME_ROUTES)),
    bootstrapDependencyNode("recursive_governance_boundary", "governance", RECURSIVE_GOVERNANCE_ROUTE),
    bootstrapDependencyNode("runtime_evolution_consensus", "governance", RUNTIME_EVOLUTION_CONSENSUS_REGISTRY),
    bootstrapDependencyNode("runtime_sovereignty_registry", "registry", "runtime_sovereignty_registry"),
    bootstrapDependencyNode("bootstrap_sovereignty_registry", "registry", BOOTSTRAP_SOVEREIGNTY_REGISTRY),
    bootstrapDependencyNode("external_authority_registry", "registry", "external_authority_registry"),
    bootstrapDependencyNode("proof_replay_guards", "registry", "proof_registry.unique_execution_decision_object+workflow_run"),
    bootstrapDependencyNode("cloudflare_worker_runtime", "infrastructure", "host:runtime_http;observe:request_boundary"),
    bootstrapDependencyNode("cloudflare_d1_registry", "infrastructure", "host:append_only_registries;observe:proof_persistence"),
    bootstrapDependencyNode("github_actions_governed_deploy", "infrastructure", GOVERNED_WORKFLOW)
  ].sort((a, b) => a.dependency_id.localeCompare(b.dependency_id)))
}

async function buildBootstrapSovereigntyManifest(): Promise<BootstrapSovereigntyManifest> {
  const startup_dependencies = canonicalBootstrapDependencies()
  const externalTrust = await canonicalExternalAuthorityRegistry()
  const deployment_lineage_root = await sha256Hex(canonicalize({ governed_workflow: GOVERNED_WORKFLOW, canonical_path: CANONICAL_RUNTIME_ROUTES, migration_chain: CANONICAL_MIGRATION_CHAIN, no_direct_deploy: true }))
  const bootstrap_trust_root_hash = await sha256Hex(canonicalize({ external_trust_roots: externalTrust.map((item) => ({ surface: item.external_authority_surface, origin: item.authority_origin, scope: item.infrastructure_scope, bootstrap_trust_hash: item.bootstrap_trust_hash })), remote_authority_denied: true }))
  const initialization_order_hash = await sha256Hex(canonicalize(BOOTSTRAP_INITIALIZATION_ORDER))
  const runtime_initialization_ordering_proof = await sha256Hex(canonicalize({ initialization_order_hash, happens_before: BOOTSTRAP_INITIALIZATION_ORDER.map((step, index) => ({ step, index })) }))
  const startup_dependency_graph_hash = await sha256Hex(canonicalize({ nodes: startup_dependencies, edges: startup_dependencies.map((node) => ({ from: node.dependency_id, to: "runtime:ready", authority_granted: false })) }))
  const startup_topology_hash = await sha256Hex(canonicalize({ initialization_order_hash, startup_dependency_graph_hash, routes: canonicalSovereigntyRoutes(), observability_routes: [BOOTSTRAP_VERIFY_ROUTE, BOOTSTRAP_TOPOLOGY_ROUTE, BOOTSTRAP_CHECKPOINT_ROUTE] }))
  const replay_neutrality_hash = await sha256Hex(canonicalize({ replay_neutral: true, replay_state_consumed: false, mutation_capable: false, execution_authority_created: false, evidence_only: true }))
  const recursive_bootstrap_hash = await sha256Hex(canonicalize({ recursive_governance_route: RECURSIVE_GOVERNANCE_ROUTE, self_integrity_route: RECURSIVE_GOVERNANCE_SELF_INTEGRITY_ROUTE, runtime_evolution_consensus: RUNTIME_EVOLUTION_CONSENSUS_ROUTE, bootstrap_registry: BOOTSTRAP_SOVEREIGNTY_REGISTRY }))
  const identity = { manifest_type: "deterministic_runtime_initialization_manifest" as const, runtime_id: RUNTIME_ID, runtime_version: RUNTIME_VERSION, initialization_order: BOOTSTRAP_INITIALIZATION_ORDER, startup_dependencies, deployment_lineage_root, bootstrap_trust_root_hash, initialization_order_hash, runtime_initialization_ordering_proof, startup_dependency_graph_hash, startup_topology_hash, replay_neutrality_hash, recursive_bootstrap_hash, evidence_only: true as const, replay_neutral: true as const, mutation_capable: false as const, remote_authority_denied: true as const, read_only: true as const }
  const manifest_hash = await sha256Hex(canonicalize(identity))
  return Object.freeze({ ...identity, manifest_hash })
}

function bootstrapSovereigntyFlags() {
  return { evidence_only: true as const, replay_neutral: true as const, mutation_capable: false as const, remote_authority_denied: true as const, read_only: true as const }
}

async function classifyBootstrapSovereigntyDrift(url: URL, manifest: BootstrapSovereigntyManifest): Promise<BootstrapSovereigntyDriftClass[]> {
  const drift = new Set<BootstrapSovereigntyDriftClass>()
  const order = url.searchParams.get("initialization_order") || url.searchParams.get("startup_order")
  if (order && canonicalize(order.split(",").map((item) => item.trim()).filter(Boolean)) !== canonicalize(manifest.initialization_order)) drift.add("bootstrap_order_divergence")
  const dependency = url.searchParams.get("dependency") || url.searchParams.get("startup_dependency")
  if (dependency && !manifest.startup_dependencies.some((node) => node.dependency_id === dependency)) drift.add("undeclared_bootstrap_dependency")
  if (url.searchParams.get("inherit_bootstrap_authority") === "true" || url.searchParams.get("remote_authority_inherited") === "true" || url.searchParams.get("authority_granted") === "true") drift.add("bootstrap_authority_inheritance")
  if (url.searchParams.get("initialization_surface") || url.searchParams.get("hidden_surface") === "true" || url.searchParams.get("mutation_capable") === "true") drift.add("initialization_surface_expansion")
  if (url.searchParams.get("startup_topology_hash") && url.searchParams.get("startup_topology_hash") !== manifest.startup_topology_hash) drift.add("startup_topology_instability")
  if (url.searchParams.get("deployment_lineage_root") && url.searchParams.get("deployment_lineage_root") !== manifest.deployment_lineage_root) drift.add("deployment_root_divergence")
  if (url.searchParams.get("manifest_hash") && url.searchParams.get("manifest_hash") !== manifest.manifest_hash) drift.add("runtime_bootstrap_corruption")
  if (url.searchParams.get("recursive_bootstrap_hash") && url.searchParams.get("recursive_bootstrap_hash") !== manifest.recursive_bootstrap_hash) drift.add("recursive_bootstrap_instability")
  if (url.searchParams.get("replay_attempt") === "true" || url.searchParams.get("replay_neutral") === "false" || url.searchParams.get("replay_state_consumed") === "true") drift.add("bootstrap_replay_instability")
  if (url.searchParams.get("lineage_fragment") === "true" || url.searchParams.get("lineage_checkpoint_hash") === "fragmented") drift.add("initialization_lineage_fragmentation")
  return Array.from(drift).sort()
}

async function buildBootstrapLineageCheckpoint(manifest: BootstrapSovereigntyManifest, drift_classes: BootstrapSovereigntyDriftClass[], generated_at = new Date().toISOString()): Promise<BootstrapLineageCheckpoint> {
  const conformance_status = drift_classes.length === 0 ? "BOOTSTRAP_CONFORMANT" as const : "NULL" as const
  const lineage_checkpoint_hash = await sha256Hex(canonicalize({ manifest_hash: manifest.manifest_hash, deployment_lineage_root: manifest.deployment_lineage_root, bootstrap_trust_root_hash: manifest.bootstrap_trust_root_hash, initialization_order_hash: manifest.initialization_order_hash, startup_dependency_graph_hash: manifest.startup_dependency_graph_hash, startup_topology_hash: manifest.startup_topology_hash, replay_neutrality_hash: manifest.replay_neutrality_hash, recursive_bootstrap_hash: manifest.recursive_bootstrap_hash, drift_classes, conformance_status }))
  const checkpoint_id = await sha256Hex(canonicalize({ checkpoint_type: "bootstrap_lineage_checkpoint", lineage_checkpoint_hash, generated_at }))
  return Object.freeze({ checkpoint_id, checkpoint_type: "bootstrap_lineage_checkpoint", manifest_hash: manifest.manifest_hash, lineage_checkpoint_hash, deployment_lineage_root: manifest.deployment_lineage_root, bootstrap_trust_root_hash: manifest.bootstrap_trust_root_hash, initialization_order_hash: manifest.initialization_order_hash, startup_dependency_graph_hash: manifest.startup_dependency_graph_hash, startup_topology_hash: manifest.startup_topology_hash, replay_neutrality_hash: manifest.replay_neutrality_hash, recursive_bootstrap_hash: manifest.recursive_bootstrap_hash, conformance_status, drift_classes, generated_at, ...bootstrapSovereigntyFlags() })
}

async function appendBootstrapSovereigntyCheckpoint(env: Env, checkpoint: BootstrapLineageCheckpoint) {
  await env.DB.prepare(`INSERT OR IGNORE INTO bootstrap_sovereignty_registry (checkpoint_id,manifest_hash,lineage_checkpoint_hash,deployment_lineage_root,bootstrap_trust_root_hash,initialization_order_hash,startup_dependency_graph_hash,startup_topology_hash,replay_neutrality_hash,conformance_status,drift_classes,evidence_only,replay_neutral,mutation_capable,remote_authority_denied,read_only,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'true','true','false','true','true',?12,?13)`)
    .bind(checkpoint.checkpoint_id, checkpoint.manifest_hash, checkpoint.lineage_checkpoint_hash, checkpoint.deployment_lineage_root, checkpoint.bootstrap_trust_root_hash, checkpoint.initialization_order_hash, checkpoint.startup_dependency_graph_hash, checkpoint.startup_topology_hash, checkpoint.replay_neutrality_hash, checkpoint.conformance_status, canonicalize(checkpoint.drift_classes), checkpoint.generated_at, checkpoint.generated_at)
    .run()
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

async function buildInfrastructureDependencyReconciliation(url: URL) {
  const dependencies = await canonicalExternalAuthorityRegistry()
  const dependency_drifts = await Promise.all(dependencies.map(async (dependency) => ({
    sovereignty_dependency_id: dependency.sovereignty_dependency_id,
    external_authority_surface: dependency.external_authority_surface,
    containment_state: dependency.containment_state,
    sovereignty_classification: dependency.sovereignty_classification,
    drift_classes: await classifyExternalAuthorityDrift(dependency, dependency)
  })))
  const probeDependency = url.searchParams.has("surface") ? await externalAuthorityObservationFromUrl(url) : null
  const probeExpected = probeDependency ? dependencies.find((dependency) => dependency.external_authority_surface === probeDependency.external_authority_surface) : undefined
  const probeDrift = probeDependency ? await classifyExternalAuthorityDrift({
    ...probeDependency,
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
  }, probeExpected) : []
  const drift_classes = Array.from(new Set([...dependency_drifts.flatMap((entry) => entry.drift_classes), ...probeDrift])).sort() as RuntimeSovereigntyDriftClass[]
  const reconciliation_material = {
    object_type: "InfrastructureDependencyReconciliation",
    route: INFRASTRUCTURE_DEPENDENCY_RECONCILIATION_ROUTE,
    dependency_count: dependencies.length,
    dependencies: dependencies.map((dependency) => ({
      sovereignty_dependency_id: dependency.sovereignty_dependency_id,
      external_authority_surface: dependency.external_authority_surface,
      authority_origin: dependency.authority_origin,
      infrastructure_scope: dependency.infrastructure_scope,
      bootstrap_trust_hash: dependency.bootstrap_trust_hash,
      sovereignty_classification: dependency.sovereignty_classification,
      containment_state: dependency.containment_state,
      observability_only: dependency.observability_only,
      replay_neutral: dependency.replay_neutral
    })),
    dependency_drifts,
    probe: probeDependency ? { external_authority_surface: probeDependency.external_authority_surface, drift_classes: probeDrift } : null,
    drift_classes,
    closure_condition: "classified->bounded->observable->replay-neutral->sovereignty-contained",
    local_validation_supremacy: true,
    exact_object_execution_legitimacy_preserved: true,
    replay_state_consumed: false,
    authority_created: false
  }
  const reconciliation_hash = await sha256Hex(canonicalize(reconciliation_material))
  return Object.freeze({ ...reconciliation_material, reconciliation_hash, status: drift_classes.length > 0 ? "INFRASTRUCTURE_DEPENDENCY_DRIFT" : "INFRASTRUCTURE_DEPENDENCY_RECONCILED" })
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


function proofExecutionLineageMatches(proof: any, execution: any): boolean {
  let executionLineage: any
  try { executionLineage = JSON.parse(String(proof?.execution_lineage || "{}")) } catch { return false }
  if (String(execution?.status || "") !== "EXECUTED") return false
  if (String(execution?.continuity_id || "") === "") return false
  if (String(proof?.continuity_id || "") !== String(execution?.continuity_id || "")) return false
  return String(proof?.execution_id || "") === String(execution?.execution_id || "")
    && String(proof?.decision_id || "") === String(execution?.decision_id || "")
    && String(proof?.validated_object_hash || "") === String(execution?.validated_object_hash || "")
    && String(executionLineage?.execution_id || "") === String(execution?.execution_id || "")
    && String(executionLineage?.decision_id || "") === String(execution?.decision_id || "")
    && String(executionLineage?.validated_object_hash || "") === String(execution?.validated_object_hash || "")
    && String(executionLineage?.execution_status || "") === String(execution?.status || "")
    && String(executionLineage?.invocation_nonce || "") === String(execution?.invocation_nonce || "")
    && String(executionLineage?.delegation_lineage_hash || "") === String(execution?.delegation_lineage_hash || "")
    && String(executionLineage?.delegation_root_hash || "") === String(execution?.delegation_root_hash || "")
}

type CanonicalProofResolution =
  | { status: "NONE", candidates: any[], canonical_candidates: any[], canonical_proof: null }
  | { status: "SELECTED", candidates: any[], canonical_candidates: any[], canonical_proof: any }
  | { status: "AMBIGUOUS", candidates: any[], canonical_candidates: any[], canonical_proof: null }

function resolveCanonicalProofEvidence(proofs: any[], execution: any): CanonicalProofResolution {
  const candidates = sortProofLineageRows(Array.isArray(proofs) ? proofs : [])
  const canonical_candidates = candidates.filter((proof: any) => proofExecutionLineageMatches(proof, execution))
  if (candidates.length === 0) return { status: "NONE", candidates, canonical_candidates, canonical_proof: null }
  if (candidates.length === 1 && canonical_candidates.length === 1) return { status: "SELECTED", candidates, canonical_candidates, canonical_proof: canonical_candidates[0] }
  return { status: "AMBIGUOUS", candidates, canonical_candidates, canonical_proof: null }
}

function proofAmbiguityReplayEvidence(candidate_count: number, canonical_candidate_count: number) {
  return {
    classification: "PROOF_AMBIGUITY_FAIL_CLOSED_CONFIRMED",
    replay_detected: true,
    proof_drift_detected: true,
    duplicate_proof_replay: candidate_count > 1,
    ambiguous_proof_lineage: true,
    candidate_count,
    canonical_candidate_count,
    evidence_only: true,
    read_only: true,
    non_authoritative: true,
    replay_neutral: true,
    lifecycle_advanced: false,
    proof_registry_appended: false,
    proof_registry_mutated: false,
    registry_mutation_blocked: ["authority_registry", "execution_registry", "invocation_registry", "proof_registry"],
    authority_registry_mutated: false,
    execution_registry_mutated: false,
    invocation_registry_mutated: false,
    merge_authorized: false,
    deployment_authorized: false,
    validator_mutation_authorized: false,
    runtime_authority_granted: false,
    proof_issue_authority_granted: false
  } as const
}

function proofReplayEvidence(proof: any, candidate_count: number) {
  return {
    classification: "PROOF_CANONICAL_EVIDENCE_REPLAY_CONTAINED",
    replay_detected: true,
    duplicate_proof_replay: true,
    proof_id: String(proof?.proof_id || ""),
    execution_id: String(proof?.execution_id || ""),
    decision_id: String(proof?.decision_id || ""),
    validated_object_hash: String(proof?.validated_object_hash || ""),
    candidate_count,
    evidence_only: true,
    read_only: true,
    non_authoritative: true,
    replay_neutral: true,
    lifecycle_advanced: false,
    proof_registry_appended: false,
    proof_registry_mutated: false,
    registry_mutation_blocked: ["authority_registry", "execution_registry", "invocation_registry", "proof_registry"],
    authority_registry_mutated: false,
    execution_registry_mutated: false,
    invocation_registry_mutated: false,
    merge_authorized: false,
    deployment_authorized: false,
    validator_mutation_authorized: false,
    runtime_authority_granted: false,
    proof_issue_authority_granted: false
  } as const
}


function installBaseTelemetryTypeFromRejection(reason: string, event_type?: TelemetryEventType): InstallBaseTelemetryEventType | null {
  if (reason === "replay_detected" || reason === "nonce_used" || reason === "proof_replay" || event_type === "REPLAY_BLOCKED") return "replay_rejected"
  if (reason === "hash_mismatch" || reason === "execution_hash_mismatch" || reason === "execution_snapshot_hash_mismatch" || event_type === "HASH_MISMATCH") return "hash_mismatch_rejected"
  if (reason === "authority_expired") return "expired_authority_rejected"
  if (reason === "policy_violation") return "policy_violation_rejected"
  if (reason === "continuity_expired") return "continuity_expiry_rejected"
  if (reason === "stale_lineage") return "stale_lineage_rejected"
  if (reason === "invalid_continuity" || reason === "continuity_hash_mismatch") return "continuity_rejected"
  if (String(reason || "").includes("lineage")) return "orphaned_lineage_observed"
  return "invalid_execution_blocked"
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
  const installBaseType = installBaseTelemetryTypeFromRejection(String(response.reason || ""), telemetry.event_type)
  if (installBaseType) {
    await emitInstallBaseTelemetryEvidenceBestEffort(env, {
      event_type: installBaseType,
      decision_id: telemetry.decision_id,
      authority_id: telemetry.authority_id,
      execution_id: telemetry.execution_id,
      proof_id: telemetry.proof_id,
      payload: { ...payload, execution_surface: String((telemetry.payload || {}).route || "unknown"), result: "NULL" }
    })
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

function isFresh(created_at: string, freshnessWindowMs: number, nowMs = Date.now()): boolean {
  const createdMs = Date.parse(created_at)
  return Number.isFinite(createdMs) && (nowMs - createdMs) <= freshnessWindowMs
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

function containmentFlags(): { evidence_only: true, replay_neutral: true, mutation_capable: false, remote_authority_denied: true, read_only: true, creates_authority: false, execution_started: false, replay_consumed: false, authoritative: false } {
  return { evidence_only: true, replay_neutral: true, mutation_capable: false, remote_authority_denied: true, read_only: true, creates_authority: false, execution_started: false, replay_consumed: false, authoritative: false }
}

const DECLARED_RUNTIME_ROUTE_CONSTANTS = Object.freeze([...CANONICAL_RUNTIME_ROUTES, ...NON_EXECUTABLE_OBSERVABILITY_ROUTES].sort())
const DECLARED_NON_MUTATING_RUNTIME_ROUTES = Object.freeze(["/health", ...NON_EXECUTABLE_RUNTIME_ROUTES, ...NON_EXECUTABLE_OBSERVABILITY_ROUTES].sort())
const DECLARED_EXECUTABLE_ROUTE_CONSTANTS = Object.freeze([...EXECUTABLE_RUNTIME_ROUTES].sort())
const DECLARED_NON_EXECUTABLE_RUNTIME_ROUTE_CONSTANTS = Object.freeze([...NON_EXECUTABLE_RUNTIME_ROUTES].sort())
const DECLARED_ROUTE_HANDLER_SURFACES = Object.freeze(["/health", ...CANONICAL_RUNTIME_ROUTES, ...GOVERNANCE_EVIDENCE_ROUTES, RECURSIVE_GOVERNANCE_ROUTE, RECURSIVE_GOVERNANCE_ADMISSION_ROUTE, RECURSIVE_GOVERNANCE_SELF_INTEGRITY_ROUTE, ...NON_EXECUTABLE_OBSERVABILITY_ROUTES].sort())
const GOVERNED_DEPLOY_WORKFLOW_SURFACES = Object.freeze([".github/workflows/governed-deploy.yml", ".github/workflows/prepare-governed-deploy.yml"])
const NON_DEPLOY_WORKFLOW_SURFACES = Object.freeze([".github/workflows/merge-governance-check.yml", ".github/workflows/preo-candidate.yml", ".github/workflows/sco-candidate.yml"])
const PACKAGE_COMMAND_SURFACES = Object.freeze(["deploy:disabled-direct-deploy", "dev:local-only", "d1:migrate:local-only", "test:non-deploy", "conformance:non-deploy"])
const ADAPTER_MUTATION_SURFACES = Object.freeze(["cloudflare-d1:canonical-registry-only", "github-actions:governed-deploy-only", "wrangler:governed-workflow-only"])
const WEBHOOK_MUTATION_SURFACES = Object.freeze(["github-pull-request:review-observability-only", "github-workflow-dispatch:governed-deploy-only"])
const UNAUTHORIZED_MUTATION_CLOSURE_DRIFT_TAXONOMY: readonly UnauthorizedMutationClosureDriftClass[] = Object.freeze(["UNDECLARED_MUTATION_SURFACE", "UNCLASSIFIED_EXECUTION_SURFACE", "UNBOUND_DATABASE_WRITE", "UNBOUND_DEPLOYMENT_SURFACE", "OBSERVABILITY_MUTATION_ESCALATION", "GOVERNANCE_MUTATION_WITHOUT_SCO", "AGENT_TOOL_MUTATION_UNCLASSIFIED", "EXTERNAL_API_MUTATION_UNCLASSIFIED", "RECONCILIATION_MUTATION_ESCAPE", "PROOFLESS_MUTATION_PATH", "AUTHORITYLESS_MUTATION_PATH", "CLOSURE_INCOMPLETE"])
const UNAUTHORIZED_MUTATION_CLOSURE_FAIL_CLOSED = Object.freeze({ drift_class: "UNDECLARED_MUTATION_SURFACE" as const, status: "NULL" as const, evidence_only: true as const, non_authoritative: true as const, replay_neutral: true as const })
const MUTATION_CLOSURE_INVENTORY_ARTIFACTS = Object.freeze(["runtime/unauthorized_mutation_surface_inventory.json", "runtime/unauthorized_mutation_path_closure_audit.json"])

async function ensureRuntimeSurfaceContainmentRegistry(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS runtime_surface_containment_registry (containment_id TEXT PRIMARY KEY, containment_hash TEXT NOT NULL UNIQUE, route_surface_hash TEXT NOT NULL, deployment_surface_hash TEXT NOT NULL, package_surface_hash TEXT NOT NULL, runtime_sovereignty_hash TEXT NOT NULL, hidden_surface_count INTEGER NOT NULL, drift_classes TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'), remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'), read_only TEXT NOT NULL CHECK (read_only='true'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), execution_started TEXT NOT NULL CHECK (execution_started='false'), replay_consumed TEXT NOT NULL CHECK (replay_consumed='false'), authoritative TEXT NOT NULL CHECK (authoritative='false'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_runtime_surface_containment_registry_routes ON runtime_surface_containment_registry(route_surface_hash, hidden_surface_count)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_runtime_surface_containment_registry_deploy ON runtime_surface_containment_registry(deployment_surface_hash, package_surface_hash)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_runtime_surface_containment_registry_sovereignty ON runtime_surface_containment_registry(runtime_sovereignty_hash, containment_hash)`).run()
}

function hiddenSurfaceProbeFromUrl(url: URL): HiddenSurfaceProbe {
  return Object.freeze({ route: url.searchParams.get("route") || undefined, method: url.searchParams.get("method") || undefined, workflow: url.searchParams.get("workflow") || undefined, package_command: url.searchParams.get("package_command") || undefined, adapter: url.searchParams.get("adapter") || undefined, webhook: url.searchParams.get("webhook") || undefined, mutation_capable: url.searchParams.get("mutation_capable") === "true", deploy_capable: url.searchParams.get("deploy_capable") === "true", proof_bound: url.searchParams.get("proof_bound") === "true" })
}

function runtimeSurfaceInventory(probe: HiddenSurfaceProbe): ExecutableSurfaceInventory {
  const handlerSet = new Set<string>(DECLARED_ROUTE_HANDLER_SURFACES)
  if (probe.route) handlerSet.add(probe.route)
  const declaredRouteSet = new Set<string>([...DECLARED_RUNTIME_ROUTE_CONSTANTS, "/health"])
  const undeclared_route_handlers = [...handlerSet].filter((route) => !declaredRouteSet.has(route)).sort()
  const non_get_observability_handlers = probe.route && probe.method && probe.method.toUpperCase() !== "GET" && declaredRouteSet.has(probe.route) && (NON_EXECUTABLE_OBSERVABILITY_ROUTES as readonly string[]).includes(probe.route) ? [probe.route] : []
  return Object.freeze({
    declared_canonical_routes: Object.freeze([...CANONICAL_RUNTIME_ROUTES].sort()),
    declared_executable_routes: Object.freeze([...EXECUTABLE_RUNTIME_ROUTES].sort()),
    declared_non_executable_runtime_routes: Object.freeze([...NON_EXECUTABLE_RUNTIME_ROUTES].sort()),
    declared_observability_routes: Object.freeze([...NON_EXECUTABLE_OBSERVABILITY_ROUTES].sort()),
    route_handlers: Object.freeze([...handlerSet].sort()),
    undeclared_route_handlers: Object.freeze(undeclared_route_handlers),
    non_get_observability_handlers: Object.freeze(non_get_observability_handlers),
    workflow_surfaces: Object.freeze([...GOVERNED_DEPLOY_WORKFLOW_SURFACES, ...NON_DEPLOY_WORKFLOW_SURFACES, probe.workflow].filter(Boolean).sort() as string[]),
    package_surfaces: Object.freeze([...PACKAGE_COMMAND_SURFACES, probe.package_command].filter(Boolean).sort() as string[]),
    adapter_surfaces: Object.freeze([...ADAPTER_MUTATION_SURFACES, probe.adapter].filter(Boolean).sort() as string[]),
    webhook_surfaces: Object.freeze([...WEBHOOK_MUTATION_SURFACES, probe.webhook].filter(Boolean).sort() as string[])
  })
}

function classifyContainmentSurfaces(inventory: ExecutableSurfaceInventory): Record<string, MutationSurfaceClassification> {
  const classification: Record<string, MutationSurfaceClassification> = {}
  for (const route of inventory.route_handlers) {
    if ((CANONICAL_RUNTIME_ROUTES as readonly string[]).includes(route)) classification[route] = "canonical_runtime"
    else if ((GOVERNANCE_EVIDENCE_ROUTES as readonly string[]).includes(route)) classification[route] = "governed_evidence"
    else if ((NON_EXECUTABLE_OBSERVABILITY_ROUTES as readonly string[]).includes(route)) classification[route] = "observability_only"
    else classification[route] = "hidden"
  }
  for (const workflow of inventory.workflow_surfaces) classification[workflow] = "workflow"
  for (const command of inventory.package_surfaces) classification[command] = "package_script"
  for (const adapter of inventory.adapter_surfaces) classification[adapter] = "external_adapter"
  for (const webhook of inventory.webhook_surfaces) classification[webhook] = "webhook"
  return canonicalRecord(classification) as Record<string, MutationSurfaceClassification>
}

function classifyRuntimeSurfaceContainmentDrift(inventory: ExecutableSurfaceInventory, probe: HiddenSurfaceProbe): RuntimeSurfaceContainmentDriftClass[] {
  const drift = new Set<RuntimeSurfaceContainmentDriftClass>()
  const canonicalUnchanged = canonicalize(CANONICAL_RUNTIME_ROUTES) === canonicalize(["/session", "/continuity", "/authority", "/compile", "/validate", "/execute", "/proof"])
  if (!canonicalUnchanged) drift.add("canonical_route_boundary_drift")
  if (inventory.undeclared_route_handlers.length > 0 || (probe.route && !(DECLARED_RUNTIME_ROUTE_CONSTANTS as readonly string[]).includes(probe.route))) drift.add("hidden_execution_surface_detected")
  if (probe.mutation_capable && probe.route && !(EXECUTABLE_RUNTIME_ROUTES as readonly string[]).includes(probe.route)) {
    drift.add("undeclared_mutation_surface_detected")
    drift.add("runtime_route_containment_drift")
  }
  if (inventory.non_get_observability_handlers.length > 0) drift.add("observability_route_execution_upgrade")
  if (probe.route && probe.method && probe.method.toUpperCase() !== "GET" && (DECLARED_NON_MUTATING_RUNTIME_ROUTES as readonly string[]).includes(probe.route) && probe.mutation_capable) {
    drift.add("observability_route_execution_upgrade")
    drift.add("runtime_route_containment_drift")
  }
  if (probe.route && probe.method && probe.method.toUpperCase() !== "POST" && (EXECUTABLE_RUNTIME_ROUTES as readonly string[]).includes(probe.route) && probe.mutation_capable) {
    drift.add("runtime_route_containment_drift")
  }
  if (probe.route && (NON_EXECUTABLE_OBSERVABILITY_ROUTES as readonly string[]).includes(probe.route) && probe.mutation_capable) drift.add("runtime_route_containment_drift")
  if (probe.workflow && probe.workflow !== ".github/workflows/governed-deploy.yml" && probe.deploy_capable) drift.add("workflow_dispatch_escape_detected")
  if (probe.package_command && /deploy|wrangler publish|wrangler deploy/.test(probe.package_command) && probe.deploy_capable) drift.add("deployment_surface_hash_drift")
  if ((probe.adapter || probe.webhook) && probe.mutation_capable) drift.add("adapter_authority_escape_detected")
  if ((probe.deploy_capable || probe.mutation_capable) && !probe.proof_bound) drift.add("proofless_execution_surface_detected")
  if (drift.size > 0) drift.add("sovereignty_containment_failure")
  return [...drift].sort()
}

async function deploymentSurfaceHash(inventory: ExecutableSurfaceInventory): Promise<DeploymentSurfaceHash> {
  const workflow_surface_hash = await sha256Hex(canonicalize(inventory.workflow_surfaces))
  const package_surface_hash = await sha256Hex(canonicalize(inventory.package_surfaces))
  const deployment_surface_hash = await sha256Hex(canonicalize({ governed_workflow: GOVERNED_WORKFLOW, workflows: inventory.workflow_surfaces, packages: inventory.package_surfaces, deploy_capable_outside_governed_path: false }))
  return Object.freeze({ workflow_surface_hash, package_surface_hash, deployment_surface_hash })
}

async function buildSovereigntyContainmentEnvelope(env: Env, url: URL, generated_at = new Date().toISOString()): Promise<SovereigntyContainmentEnvelope> {
  const probe = hiddenSurfaceProbeFromUrl(url)
  const inventory = runtimeSurfaceInventory(probe)
  const mutation_surface_classification = classifyContainmentSurfaces(inventory)
  const deployment_surface_hash = await deploymentSurfaceHash(inventory)
  const executable_route_surface_hash = await sha256Hex(canonicalize(inventory.declared_executable_routes))
  const non_executable_runtime_route_surface_hash = await sha256Hex(canonicalize(inventory.declared_non_executable_runtime_routes))
  const observability_route_surface_hash = await sha256Hex(canonicalize(inventory.declared_observability_routes))
  const route_surface_hash = await sha256Hex(canonicalize({ canonical: inventory.declared_canonical_routes, executable: inventory.declared_executable_routes, non_executable_runtime: inventory.declared_non_executable_runtime_routes, observability: inventory.declared_observability_routes, handlers: inventory.route_handlers, executable_route_surface_hash, non_executable_runtime_route_surface_hash, observability_route_surface_hash }))
  const runtime_sovereignty_hash = (await runtimeSovereigntyManifestReadOnly(env)).sovereignty_hash
  const drift_classes = classifyRuntimeSurfaceContainmentDrift(inventory, probe)
  const hidden_surface_count = inventory.undeclared_route_handlers.length
  const objectMaterial = { object_type: "RuntimeSurfaceContainmentObject" as const, inventory, mutation_surface_classification, deployment_surface_hash, route_surface_hash, executable_route_surface_hash, non_executable_runtime_route_surface_hash, observability_route_surface_hash, package_surface_hash: deployment_surface_hash.package_surface_hash, hidden_surface_count, drift_classes, runtime_sovereignty_hash }
  const containment_hash = await sha256Hex(canonicalize(objectMaterial))
  const checkpoint = Object.freeze({ checkpoint_hash: await sha256Hex(canonicalize({ containment_hash, route_surface_hash, deployment_surface_hash, drift_classes, hidden_surface_count })), route_surface_hash, hidden_surface_count, drift_classes })
  return Object.freeze({ ...objectMaterial, containment_hash, generated_at, envelope_type: "SovereigntyContainmentEnvelope" as const, checkpoint, ...containmentFlags() }) as SovereigntyContainmentEnvelope
}

async function appendRuntimeSurfaceContainmentCheckpoint(env: Env, envelope: SovereigntyContainmentEnvelope) {
  await ensureRuntimeSurfaceContainmentRegistry(env)
  await env.DB.prepare(`INSERT OR IGNORE INTO runtime_surface_containment_registry (containment_id,containment_hash,route_surface_hash,deployment_surface_hash,package_surface_hash,runtime_sovereignty_hash,hidden_surface_count,drift_classes,evidence_only,replay_neutral,mutation_capable,remote_authority_denied,read_only,creates_authority,execution_started,replay_consumed,authoritative,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'true','true','false','true','true','false','false','false','false',?9,?10)`)
    .bind(envelope.checkpoint.checkpoint_hash, envelope.containment_hash, envelope.route_surface_hash, envelope.deployment_surface_hash.deployment_surface_hash, envelope.package_surface_hash, envelope.runtime_sovereignty_hash, envelope.hidden_surface_count, canonicalize(envelope.drift_classes), envelope.generated_at, envelope.generated_at)
    .run()
}


function rootAuthorityFlags() {
  return { evidence_only: true as const, append_only: true as const, replay_neutral: true as const, non_authoritative: true as const, executable: false as const, deployment_capable: false as const, creates_authority: false as const, secret_values_inspected: false as const, secret_material_persisted: false as const, fail_closed_on_ambiguity: true as const }
}

const ROOT_AUTHORITY_BASELINE_SURFACES = Object.freeze([
  Object.freeze({ surface_id: "cloudflare_account_authority", authority_origin: "cloudflare_account", declared_boundary: "/session→/continuity→/authority→/compile→/validate→/execute→/proof", classifications: ["ROOT_DEPLOY_AUTHORITY", "ROOT_RUNTIME_CONFIGURATION_AUTHORITY", "ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY", "ROOT_AUTHORITY_CONTAINMENT_REQUIRED"] as const }),
  Object.freeze({ surface_id: "cloudflare_deployment_token_authority", authority_origin: "cloudflare_api_token", declared_boundary: "observability-only-no-secret-inspection", classifications: ["ROOT_DEPLOY_AUTHORITY", "ROOT_ENVIRONMENT_AUTHORITY", "ROOT_AUTHORITY_CONTAINMENT_REQUIRED"] as const }),
  Object.freeze({ surface_id: "github_admin_authority", authority_origin: "github_repository_admin", declared_boundary: "/session→/continuity→/authority→/compile→/validate→/execute→/proof", classifications: ["ROOT_REPOSITORY_AUTHORITY", "ROOT_BRANCH_POLICY_AUTHORITY", "ROOT_WORKFLOW_AUTHORITY", "ROOT_AUTHORITY_CONTAINMENT_REQUIRED"] as const }),
  Object.freeze({ surface_id: "github_actions_token_authority", authority_origin: "github_actions_token", declared_boundary: "least-privilege-observability-only", classifications: ["ROOT_REPOSITORY_AUTHORITY", "ROOT_WORKFLOW_AUTHORITY", "ROOT_ENVIRONMENT_AUTHORITY"] as const }),
  Object.freeze({ surface_id: "github_actions_workflow_dispatch", authority_origin: "github_actions_workflow_dispatch", declared_boundary: "trigger-only-no-secret-inspection", classifications: ["ROOT_WORKFLOW_AUTHORITY"] as const }),
  Object.freeze({ surface_id: "github_workflow_file_mutation", authority_origin: "github_repository_workflows", declared_boundary: "workflow-file-mutation-containment-required", classifications: ["ROOT_REPOSITORY_AUTHORITY", "ROOT_WORKFLOW_AUTHORITY", "ROOT_AUTHORITY_CONTAINMENT_REQUIRED"] as const }),
  Object.freeze({ surface_id: "github_environment_and_secrets_configuration", authority_origin: "github_environment", declared_boundary: "declared-not-inspected", classifications: ["ROOT_ENVIRONMENT_AUTHORITY", "ROOT_AUTHORITY_CONTAINMENT_REQUIRED"] as const }),
  Object.freeze({ surface_id: "repository_secret_mutation_authority", authority_origin: "github_repository_secrets", declared_boundary: "observability-only-no-secret-inspection", classifications: ["ROOT_REPOSITORY_AUTHORITY", "ROOT_ENVIRONMENT_AUTHORITY", "ROOT_AUTHORITY_CONTAINMENT_REQUIRED"] as const }),
  Object.freeze({ surface_id: "wrangler_deploy_capability", authority_origin: "cloudflare_wrangler", declared_boundary: "governed-deploy-workflow-only", classifications: ["ROOT_DEPLOY_AUTHORITY", "ROOT_LOCAL_EXECUTION_AUTHORITY"] as const }),
  Object.freeze({ surface_id: "wrangler_local_deploy_authority", authority_origin: "local_wrangler_cli", declared_boundary: "local-deploy-denied-observability-only", classifications: ["ROOT_DEPLOY_AUTHORITY", "ROOT_LOCAL_EXECUTION_AUTHORITY", "ROOT_AUTHORITY_BYPASS_RISK"] as const }),
  Object.freeze({ surface_id: "package_script_deploy_guard", authority_origin: "package_scripts", declared_boundary: "disabled-direct-deploy", classifications: ["ROOT_PACKAGE_EXECUTION_AUTHORITY", "ROOT_AUTHORITY_BYPASS_RISK"] as const }),
  Object.freeze({ surface_id: "local_deploy_credentials_presence", authority_origin: "local_environment", declared_boundary: "observability-only-no-secret-inspection", classifications: ["ROOT_LOCAL_EXECUTION_AUTHORITY", "ROOT_ENVIRONMENT_AUTHORITY", "ROOT_AUTHORITY_BYPASS_RISK"] as const }),
  Object.freeze({ surface_id: "ci_token_permissions", authority_origin: "github_actions_token", declared_boundary: "least-privilege-assumption", classifications: ["ROOT_REPOSITORY_AUTHORITY", "ROOT_WORKFLOW_AUTHORITY", "ROOT_ENVIRONMENT_AUTHORITY"] as const }),
  Object.freeze({ surface_id: "federated_runtime_authority", authority_origin: "remote_runtime", declared_boundary: "remote-authority-denied", classifications: ["ROOT_FEDERATION_AUTHORITY", "ROOT_AUTHORITY_CONTAINMENT_REQUIRED"] as const }),
  Object.freeze({ surface_id: "root_runtime_authority_assumption", authority_origin: "runtime_root", declared_boundary: "runtime-authority-assumption-observability-only", classifications: ["ROOT_FEDERATION_AUTHORITY", "ROOT_RUNTIME_CONFIGURATION_AUTHORITY", "ROOT_AUTHORITY_CONTAINMENT_REQUIRED"] as const })
].sort((a, b) => a.surface_id.localeCompare(b.surface_id)))

function classifyRootAuthoritySurface(surface: Partial<RootAuthoritySurface> & Record<string, unknown>): RootAuthorityClassification[] {
  const material = `${surface.surface_id || ""} ${surface.authority_origin || ""} ${surface.declared_boundary || ""}`.toLowerCase()
  const classes = new Set<RootAuthorityClassification>()
  for (const c of (Array.isArray(surface.classifications) ? surface.classifications : [])) classes.add(c as RootAuthorityClassification)
  if (/deploy|wrangler|cloudflare|deployment_token|api_token/.test(material)) classes.add("ROOT_DEPLOY_AUTHORITY")
  if (/repo|repository|github_admin|settings|admin/.test(material)) classes.add("ROOT_REPOSITORY_AUTHORITY")
  if (/env|environment|secret|variable|credential|token/.test(material)) classes.add("ROOT_ENVIRONMENT_AUTHORITY")
  if (/workflow|dispatch|actions/.test(material)) classes.add("ROOT_WORKFLOW_AUTHORITY")
  if (/branch|protection/.test(material)) classes.add("ROOT_BRANCH_POLICY_AUTHORITY")
  if (/runtime|configuration|config/.test(material)) classes.add("ROOT_RUNTIME_CONFIGURATION_AUTHORITY")
  if (/federat|remote|runtime_root/.test(material)) classes.add("ROOT_FEDERATION_AUTHORITY")
  if (/local|cli/.test(material)) classes.add("ROOT_LOCAL_EXECUTION_AUTHORITY")
  if (/package|npm|script/.test(material)) classes.add("ROOT_PACKAGE_EXECUTION_AUTHORITY")
  if (/mutation|infrastructure|account|cloudflare|settings/.test(material)) classes.add("ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY")
  if (/bypass|direct|local-deploy|disabled-direct-deploy/.test(material)) classes.add("ROOT_AUTHORITY_BYPASS_RISK")
  if (/containment-required|account|admin|secret|environment|federat|runtime_root/.test(material)) classes.add("ROOT_AUTHORITY_CONTAINMENT_REQUIRED")
  if (surface.declared === false || material.includes("undeclared")) classes.add("UNDECLARED_ROOT_SURFACE")
  return [...classes].sort()
}

function canonicalizeRootAuthorityInventory(input: Partial<RootAuthorityInventory> = {}): RootAuthorityInventory {
  const surfaces = (Array.isArray(input.surfaces) && input.surfaces.length > 0 ? input.surfaces : ROOT_AUTHORITY_BASELINE_SURFACES).map((surface: any) => {
    const observed_secret_material = String(surface.observed_secret_material ?? surface.secret_material ?? "NOT_INSPECTED")
    return Object.freeze({
      surface_id: String(surface.surface_id || "undeclared_root_surface"),
      authority_origin: String(surface.authority_origin || "unknown"),
      declared_boundary: String(surface.declared_boundary || "NULL"),
      classifications: Object.freeze(classifyRootAuthoritySurface(surface)),
      workflow_dispatch_semantics: /workflow_dispatch|dispatch/.test(`${surface.surface_id || ""} ${surface.authority_origin || ""}`.toLowerCase()) ? "TRIGGER_ONLY" as const : "NOT_APPLICABLE" as const,
      deployment_token_observability: /token/.test(`${surface.surface_id || ""} ${surface.authority_origin || ""}`.toLowerCase()) ? "OBSERVABILITY_ONLY_NO_SECRET_INSPECTION" as const : "NOT_APPLICABLE" as const,
      mutation_capability_observed: Boolean(surface.mutation_capability_observed ?? true),
      declared: surface.declared === false ? false : true,
      observed_executable: Boolean(surface.observed_executable ?? surface.executable ?? false),
      observed_deployment_capable: Boolean(surface.observed_deployment_capable ?? surface.deployment_capable ?? false),
      observed_creates_authority: Boolean(surface.observed_creates_authority ?? surface.creates_authority ?? false),
      observed_secret_values_inspected: Boolean(surface.observed_secret_values_inspected ?? surface.secret_values_inspected ?? false),
      observed_secret_material_persisted: Boolean(surface.observed_secret_material_persisted ?? surface.secret_material_persisted ?? false),
      observed_secret_material,
      normalized_secret_material: "NOT_INSPECTED" as const,
      normalized_executable: false as const,
      normalized_deployment_capable: false as const,
      normalized_creates_authority: false as const,
      secret_material: "NOT_INSPECTED" as const,
      executable: false as const,
      deployment_capable: false as const,
      creates_authority: false as const
    })
  }).sort((a, b) => a.surface_id.localeCompare(b.surface_id) || a.authority_origin.localeCompare(b.authority_origin))
  const declared_root_surfaces = surfaces.filter((surface) => surface.declared).map((surface) => surface.surface_id).sort()
  const undeclared_root_surfaces = surfaces.filter((surface) => !surface.declared || surface.classifications.includes("UNDECLARED_ROOT_SURFACE")).map((surface) => surface.surface_id).sort()
  return Object.freeze({ inventory_type: "RootAuthorityInventory" as const, surfaces: Object.freeze(surfaces), declared_root_surfaces: Object.freeze(declared_root_surfaces), undeclared_root_surfaces: Object.freeze(undeclared_root_surfaces), evidence_only: true as const, executable: false as const, deployment_capable: false as const, creates_authority: false as const, secret_values_inspected: false as const })
}

async function hashRootAuthorityTopology(inventory: RootAuthorityInventory): Promise<string> {
  return sha256Hex(canonicalize({ surfaces: inventory.surfaces.map((surface) => ({ surface_id: surface.surface_id, authority_origin: surface.authority_origin, declared_boundary: surface.declared_boundary, classifications: surface.classifications, declared: surface.declared })), evidence_only: true, executable: false, deployment_capable: false, creates_authority: false }))
}

async function computeAuthorityContainmentBoundary(inventory: RootAuthorityInventory): Promise<RootAuthorityBoundary> {
  const overflow_surfaces = inventory.surfaces.filter((surface) => !surface.declared || surface.classifications.includes("UNDECLARED_ROOT_SURFACE")).map((surface) => surface.surface_id).sort()
  const contained_surfaces = inventory.surfaces.map((surface) => surface.surface_id).sort()
  const containment_status = overflow_surfaces.length > 0 ? "ROOT_AUTHORITY_CONTAINMENT_REQUIRED" as const : "ROOT_AUTHORITY_CONTAINED" as const
  const material = { allowed_canonical_path: CANONICAL_RUNTIME_ROUTES, contained_surfaces, overflow_surfaces, containment_status, classification_authorizes: false, evidence_authorizes_merge: false }
  const boundary_hash = await sha256Hex(canonicalize(material))
  return Object.freeze({ boundary_type: "RootAuthorityContainmentBoundary" as const, allowed_canonical_path: CANONICAL_RUNTIME_ROUTES, contained_surfaces: Object.freeze(contained_surfaces), overflow_surfaces: Object.freeze(overflow_surfaces), declared_root_surfaces: Object.freeze(inventory.surfaces.filter((surface) => surface.declared).map((surface) => surface.surface_id).sort()), undeclared_root_surfaces: Object.freeze(overflow_surfaces), containment_status, merge_legitimacy: overflow_surfaces.length > 0 ? "NULL" as const : "UNCHANGED" as const, preo_validity: overflow_surfaces.length > 0 ? "NULL" as const : "UNCHANGED" as const, classification_authorizes: false as const, evidence_authorizes_merge: false as const, boundary_hash, evidence_only: true as const, non_authoritative: true as const, executable: false as const, deployment_capable: false as const, creates_authority: false as const })
}

async function detectRootAuthorityDrift(inventory: RootAuthorityInventory, topology_hash: string, boundary?: RootAuthorityBoundary): Promise<RootAuthorityDrift> {
  const b = boundary || await computeAuthorityContainmentBoundary(inventory)
  const drift = new Set<RootAuthorityClassification>()
  const undeclared_surfaces = b.overflow_surfaces
  if (undeclared_surfaces.length > 0) drift.add("UNDECLARED_ROOT_SURFACE")
  if (undeclared_surfaces.length > 0) drift.add("SOVEREIGNTY_DRIFT_DETECTED")
  if (undeclared_surfaces.length > 0) drift.add("ROOT_AUTHORITY_BOUNDARY_OVERFLOW")
  if (undeclared_surfaces.length > 0) drift.add("ROOT_AUTHORITY_CONTAINMENT_REQUIRED")
  const unsafeObservedSurface = inventory.surfaces.some((surface) => surface.observed_executable === true || surface.observed_deployment_capable === true || surface.observed_creates_authority === true || surface.observed_secret_values_inspected === true || surface.observed_secret_material_persisted === true || surface.observed_secret_material !== "NOT_INSPECTED")
  const topologyDivergence = inventory.surfaces.some((surface) => surface.classifications.length === 0 || surface.secret_material !== "NOT_INSPECTED" || surface.executable !== false || surface.deployment_capable !== false || surface.creates_authority !== false) || unsafeObservedSurface
  if (topologyDivergence) drift.add("ROOT_AUTHORITY_TOPOLOGY_DIVERGENCE")
  if (unsafeObservedSurface) {
    drift.add("SOVEREIGNTY_DRIFT_DETECTED")
    drift.add("ROOT_AUTHORITY_BYPASS_RISK")
    drift.add("ROOT_AUTHORITY_CONTAINMENT_REQUIRED")
  }
  if (inventory.surfaces.some((surface) => surface.classifications.includes("ROOT_AUTHORITY_BYPASS_RISK"))) drift.add("ROOT_AUTHORITY_BYPASS_RISK")
  const drift_classes = [...drift].sort()
  const drift_hash = await sha256Hex(canonicalize({ topology_hash, drift_classes, undeclared_surfaces, merge_legitimacy: drift_classes.length > 0 ? "NULL" : "UNCHANGED" }))
  return Object.freeze({ drift_type: "RootAuthorityDrift" as const, drift_classes, containment_status: drift_classes.length > 0 ? "ROOT_AUTHORITY_CONTAINMENT_REQUIRED" as const : "ROOT_AUTHORITY_CONTAINED" as const, declared_root_surfaces: Object.freeze(inventory.surfaces.filter((surface) => surface.declared).map((surface) => surface.surface_id).sort()), undeclared_root_surfaces: undeclared_surfaces, undeclared_surfaces, topology_hash, drift_hash, merge_legitimacy: drift_classes.length > 0 ? "NULL" as const : "UNCHANGED" as const, fail_closed: drift_classes.length > 0, evidence_only: true as const, replay_neutral: true as const, non_authoritative: true as const, secret_material_persisted: false as const })
}

async function buildRootAuthorityContainmentEnvelope(input: Partial<RootAuthorityInventory> = {}, generated_at = new Date().toISOString()): Promise<RootAuthorityContainmentEnvelope> {
  const inventory = canonicalizeRootAuthorityInventory(input)
  const topology_hash = await hashRootAuthorityTopology(inventory)
  const boundary = await computeAuthorityContainmentBoundary(inventory)
  const drift = await detectRootAuthorityDrift(inventory, topology_hash, boundary)
  const containment_identity = await sha256Hex(canonicalize({ topology_hash, boundary_hash: boundary.boundary_hash, drift_hash: drift.drift_hash }))
  const containment_status = drift.drift_classes.length > 0 ? "ROOT_AUTHORITY_CONTAINMENT_REQUIRED" as const : "ROOT_AUTHORITY_CONTAINED" as const
  const containment_hash = await sha256Hex(canonicalize({ containment_identity, topology_hash, boundary_hash: boundary.boundary_hash, drift_hash: drift.drift_hash, containment_status, evidence_only: true, non_authoritative: true }))
  return Object.freeze({ envelope_type: "RootAuthorityContainmentEnvelope" as const, inventory, topology_hash, boundary, drift, containment_status, declared_root_surfaces: inventory.declared_root_surfaces, undeclared_root_surfaces: inventory.undeclared_root_surfaces, drift_classes: drift.drift_classes, containment_identity, containment_hash, generated_at, ...rootAuthorityFlags() })
}

async function ensureRootAuthorityObservabilityRegistry(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS root_authority_observability_registry (observation_id TEXT PRIMARY KEY, observation_hash TEXT NOT NULL UNIQUE, topology_hash TEXT NOT NULL, boundary_hash TEXT NOT NULL, drift_hash TEXT NOT NULL, containment_identity TEXT NOT NULL, classification TEXT NOT NULL CHECK (classification IN ('ROOT_DEPLOY_AUTHORITY','ROOT_REPOSITORY_AUTHORITY','ROOT_ENVIRONMENT_AUTHORITY','ROOT_WORKFLOW_AUTHORITY','ROOT_BRANCH_POLICY_AUTHORITY','ROOT_RUNTIME_CONFIGURATION_AUTHORITY','ROOT_FEDERATION_AUTHORITY','ROOT_LOCAL_EXECUTION_AUTHORITY','ROOT_PACKAGE_EXECUTION_AUTHORITY','ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY','UNDECLARED_ROOT_SURFACE','SOVEREIGNTY_DRIFT_DETECTED','ROOT_AUTHORITY_TOPOLOGY_DIVERGENCE','ROOT_AUTHORITY_BOUNDARY_OVERFLOW','ROOT_AUTHORITY_BYPASS_RISK','ROOT_AUTHORITY_CONTAINMENT_REQUIRED')), inventory_object TEXT NOT NULL, boundary_object TEXT NOT NULL, drift_object TEXT NOT NULL, containment_envelope TEXT NOT NULL, evidence_only TEXT NOT NULL CHECK (evidence_only='true'), append_only TEXT NOT NULL CHECK (append_only='true'), replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'), non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'), executable TEXT NOT NULL CHECK (executable='false'), deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'), creates_authority TEXT NOT NULL CHECK (creates_authority='false'), secret_material_persisted TEXT NOT NULL CHECK (secret_material_persisted='false'), fail_closed_on_ambiguity TEXT NOT NULL CHECK (fail_closed_on_ambiguity='true'), generated_at TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_root_authority_observability_registry_topology ON root_authority_observability_registry(topology_hash, containment_identity)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_root_authority_observability_registry_boundary ON root_authority_observability_registry(boundary_hash, classification)`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_root_authority_observability_registry_drift ON root_authority_observability_registry(drift_hash, classification)`).run()
}

async function appendRootAuthorityObservation(env: Env, envelope: RootAuthorityContainmentEnvelope) {
  await ensureRootAuthorityObservabilityRegistry(env)
  const classification = envelope.drift.drift_classes[0] || "ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY"
  const created_at = new Date().toISOString()
  const observation_nonce = crypto.randomUUID()
  const observation_id = await sha256Hex(canonicalize({ containment_identity: envelope.containment_identity, created_at, observation_nonce, observation: "root_authority_containment" }))
  const observation_hash = await sha256Hex(canonicalize({ observation_id, containment_hash: envelope.containment_hash, topology_hash: envelope.topology_hash, boundary_hash: envelope.boundary.boundary_hash, drift_hash: envelope.drift.drift_hash, created_at, observation_nonce, evidence_only: true, non_authoritative: true }))
  await env.DB.prepare(`INSERT INTO root_authority_observability_registry (observation_id,observation_hash,topology_hash,boundary_hash,drift_hash,containment_identity,classification,inventory_object,boundary_object,drift_object,containment_envelope,evidence_only,append_only,replay_neutral,non_authoritative,executable,deployment_capable,creates_authority,secret_material_persisted,fail_closed_on_ambiguity,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'true','true','true','true','false','false','false','false','true',?12,?13)`)
    .bind(observation_id, observation_hash, envelope.topology_hash, envelope.boundary.boundary_hash, envelope.drift.drift_hash, envelope.containment_identity, classification, canonicalize(envelope.inventory), canonicalize(envelope.boundary), canonicalize(envelope.drift), canonicalize(envelope), envelope.generated_at, created_at)
    .run()
}

function rootAuthorityInventoryFromUrl(url: URL): Partial<RootAuthorityInventory> {
  const undeclared = url.searchParams.get("surface") || url.searchParams.get("undeclared_surface")
  if (!undeclared) return {}
  return { surfaces: [...ROOT_AUTHORITY_BASELINE_SURFACES, { surface_id: undeclared, authority_origin: url.searchParams.get("authority_origin") || "undeclared", declared_boundary: "outside-canonical-boundary", classifications: ["UNDECLARED_ROOT_SURFACE", "ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY"], mutation_capability_observed: true, declared: false }] as any }
}



type CrossRegistryDriftClass = "REGISTRY_LINEAGE_MISMATCH" | "ORPHANED_AUTHORITY_RECORD" | "ORPHANED_AEO_RECORD" | "ORPHANED_VALIDATION_RECORD" | "ORPHANED_EXECUTION_RECORD" | "ORPHANED_PROOF_RECORD" | "ORPHANED_INVOCATION_RECORD" | "VALIDATED_HASH_DISCONTINUITY" | "EXECUTION_PROOF_HASH_MISMATCH" | "CANONICAL_OBJECT_HASH_MISMATCH" | "MISSING_PROOF_LINEAGE" | "DUPLICATE_PROOF_QUARANTINED" | "AUTHORITY_LINEAGE_INVALID" | "AUTHORITY_REUSE_BLOCKED" | "SESSION_CONTINUITY_DIVERGENCE" | "AUTHORITY_CONTINUITY_DIVERGENCE" | "REPLAY_GRAPH_FRAGMENTATION" | "TOPOLOGY_BINDING_DIVERGENCE" | "GOVERNANCE_BINDING_DIVERGENCE" | "ROOT_AUTHORITY_EVIDENCE_ESCALATION" | "OBSERVABILITY_RECORD_AUTHORITY_ESCALATION" | "CROSS_REGISTRY_RECONCILIATION_AMBIGUITY"
type CrossRegistryLineageEdge = { object_type: "CrossRegistryLineageEdge", from_registry: string, from_id: string, to_registry: string, to_id: string, relation: string, status: "RESOLVED" | "UNRESOLVED", drift_class: CrossRegistryDriftClass }
type CrossRegistryDrift = { object_type: "CrossRegistryDrift", drift_class: CrossRegistryDriftClass, registry: string, record_id: string, reason: string, legitimacy_status: "NULL" }
type CrossRegistryReconciliationSnapshot = {
  object_type: "CrossRegistryReconciliationSnapshot"
  reconciliation_id: string
  registry_set_hash: string
  lineage_graph_hash: string
  continuity_graph_hash: string
  proof_graph_hash: string
  replay_graph_hash: string
  topology_binding_hash: string
  governance_binding_hash: string
  reconciliation_equivalence_hash: string
  lineage_edges: CrossRegistryLineageEdge[]
  drift: CrossRegistryDrift[]
  equivalence: Record<string, unknown>
  continuity_proof: Record<string, unknown>
  drift_classes: CrossRegistryDriftClass[]
  unresolved_edges: CrossRegistryLineageEdge[]
  orphaned_records: Record<string, unknown>[]
  containment_status: "RECONCILED" | "RECONCILIATION_REQUIRED"
  legitimacy_status: "LEGITIMATE" | "NULL"
  evidence_only: true
  replay_neutral: true
  non_authoritative: true
  executable: false
  deployment_capable: false
  creates_authority: false
  proof_generating: false
}

function crossRegistryRouteFlags(): { evidence_only: true, replay_neutral: true, non_authoritative: true, executable: false, deployment_capable: false, creates_authority: false, proof_generating: false } { return { evidence_only: true, replay_neutral: true, non_authoritative: true, executable: false, deployment_capable: false, creates_authority: false, proof_generating: false } }
function crossRegistryRecordId(record: Record<string, unknown>): string {
  return String(record.session_id || record.continuity_id || record.authority_id || record.aeo_id || record.validation_id || record.execution_id || record.proof_id || record.invocation_nonce || record.preo_id || record.snapshot_id || record.governance_observation_id || record.observation_id || record.closure_id || record.reconciliation_id || canonicalize(record))
}
function crossRegistryField(record: Record<string, unknown> | null | undefined, field: string): string { return String(record?.[field] || "") }
function sortCrossRegistryRecords(records: Record<string, unknown>[]): Record<string, unknown>[] { return records.map((record) => canonicalRecord(record)).sort((a, b) => crossRegistryRecordId(a).localeCompare(crossRegistryRecordId(b)) || canonicalize(a).localeCompare(canonicalize(b))) }
function oneCrossRegistry(records: Record<string, unknown>[], predicate: (record: Record<string, unknown>) => boolean): { match: Record<string, unknown> | null, ambiguous: boolean } {
  const matches = records.filter(predicate)
  return { match: matches[0] || null, ambiguous: matches.length > 1 }
}
function crossRegistryEdge(from_registry: string, from_id: string, to_registry: string, to_id: string, relation: string, resolved: boolean, drift_class: CrossRegistryDriftClass): CrossRegistryLineageEdge {
  return { object_type: "CrossRegistryLineageEdge", from_registry, from_id, to_registry, to_id, relation, status: resolved ? "RESOLVED" : "UNRESOLVED", drift_class }
}
function truthyEvidenceEscalation(value: unknown): boolean { return value === true || value === "true" || value === 1 || value === "1" }
function parseCrossRegistryCanonicalObject(value: unknown): Record<string, unknown> | null {
  if (isPlainRecord(value)) return canonicalRecord(value)
  if (typeof value !== "string" || value.length === 0) return null
  try {
    const parsed = JSON.parse(value)
    return isPlainRecord(parsed) ? canonicalRecord(parsed) : null
  } catch {
    return null
  }
}
async function crossRegistryCanonicalObjectHash(record: Record<string, unknown>): Promise<string> {
  const object = parseCrossRegistryCanonicalObject(record.canonical_aeo || record.canonical_object || record.validated_object || record.object)
  return object ? sha256Hex(canonicalize(object)) : ""
}
function crossRegistryAuthorityHistoricallyValid(status: unknown): boolean { return ["ACTIVE", "VALIDATED", "RESERVED", "EXECUTED", "CONSUMED"].includes(String(status || "")) }
function crossRegistryLineageObject(value: unknown): Record<string, unknown> | null {
  if (isPlainRecord(value)) return canonicalRecord(value)
  if (typeof value !== "string" || value.length === 0) return null
  try {
    const parsed = JSON.parse(value)
    return isPlainRecord(parsed) ? canonicalRecord(parsed) : null
  } catch {
    return null
  }
}
async function crossRegistryContinuityDrift(continuity: Record<string, unknown>, session: Record<string, unknown> | null, continuities: Record<string, unknown>[]): Promise<string | null> {
  if (!session) return "continuity requires canonical session lineage"
  if (crossRegistryField(continuity, "session_id") !== crossRegistryField(session, "session_id")) return "continuity session differs from session registry"
  if (crossRegistryField(continuity, "identity_id") !== crossRegistryField(session, "identity_id")) return "continuity identity differs from session registry"
  if (crossRegistryField(continuity, "status") !== "ACTIVE" || continuity.revoked_at || isExpired(crossRegistryField(continuity, "expires_at"))) return "continuity must remain ACTIVE and unexpired"
  const canonical = crossRegistryLineageObject(continuity.canonical_continuity)
  if (!canonical) return "continuity canonical lineage is missing or malformed"
  const actualHash = await continuityHash(canonical)
  if (actualHash !== crossRegistryField(continuity, "continuity_hash") || actualHash !== String(canonical.continuity_hash || "")) return "continuity hash must match canonical continuity lineage"
  const canonicalParent = canonical.parent_continuity_id ? String(canonical.parent_continuity_id) : ""
  const storedParent = crossRegistryField(continuity, "parent_continuity_id")
  if (canonicalParent !== storedParent) return "continuity parent differs from canonical continuity lineage"
  if (canonicalParent && !continuities.some((row) => crossRegistryField(row, "continuity_id") === canonicalParent)) return "continuity parent must resolve in continuity registry"
  return null
}
async function buildCrossRegistryReconciliationSnapshot(state: Record<string, Record<string, unknown>[]>, generated_at = new Date().toISOString()): Promise<CrossRegistryReconciliationSnapshot> {
  const canonicalState = Object.fromEntries((CANONICAL_RECONCILIATION_REGISTRY_ORDER as readonly string[]).map((registry) => [registry, sortCrossRegistryRecords(state[registry] || [])])) as Record<string, Record<string, unknown>[]>
  const edges: CrossRegistryLineageEdge[] = []
  const drift: CrossRegistryDrift[] = []
  const orphaned_records: Record<string, unknown>[] = []
  const addDrift = (drift_class: CrossRegistryDriftClass, registry: string, record: Record<string, unknown>, reason: string) => { drift.push({ object_type: "CrossRegistryDrift", drift_class, registry, record_id: crossRegistryRecordId(record), reason, legitimacy_status: "NULL" }); orphaned_records.push({ registry, record_id: crossRegistryRecordId(record), drift_class, reason }) }
  const sessions = canonicalState.session_registry || [], continuities = canonicalState.continuity_registry || [], authorities = canonicalState.authority_registry || [], aeos = canonicalState.aeo_registry || [], validations = canonicalState.validation_registry || [], executions = canonicalState.execution_registry || [], proofs = canonicalState.proof_registry || [], invocations = canonicalState.invocation_registry || []
  for (const continuity of continuities) {
    const session = oneCrossRegistry(sessions, (row) => crossRegistryField(row, "session_id") === crossRegistryField(continuity, "session_id"))
    edges.push(crossRegistryEdge("continuity_registry", crossRegistryRecordId(continuity), "session_registry", crossRegistryField(continuity, "session_id"), "CONTINUITY_SESSION", Boolean(session.match) && !session.ambiguous, "REGISTRY_LINEAGE_MISMATCH"))
    if (session.ambiguous) addDrift("CROSS_REGISTRY_RECONCILIATION_AMBIGUITY", "continuity_registry", continuity, "continuity session resolves ambiguously")
    const continuityDrift = await crossRegistryContinuityDrift(continuity, session.match, continuities)
    if (continuityDrift) addDrift("REGISTRY_LINEAGE_MISMATCH", "continuity_registry", continuity, continuityDrift)
  }
  for (const authority of authorities) {
    const session = oneCrossRegistry(sessions, (row) => crossRegistryField(row, "session_id") === crossRegistryField(authority, "session_id"))
    const continuity = oneCrossRegistry(continuities, (row) => crossRegistryField(row, "continuity_id") === crossRegistryField(authority, "continuity_id"))
    edges.push(crossRegistryEdge("authority_registry", crossRegistryRecordId(authority), "session_registry", crossRegistryField(authority, "session_id"), "AUTHORITY_SESSION", Boolean(session.match) && !session.ambiguous, "ORPHANED_AUTHORITY_RECORD"))
    edges.push(crossRegistryEdge("authority_registry", crossRegistryRecordId(authority), "continuity_registry", crossRegistryField(authority, "continuity_id"), "AUTHORITY_CONTINUITY", Boolean(continuity.match) && !continuity.ambiguous, "ORPHANED_AUTHORITY_RECORD"))
    if (!session.match || !continuity.match) addDrift("ORPHANED_AUTHORITY_RECORD", "authority_registry", authority, "authority requires valid session and continuity")
    if (session.ambiguous || continuity.ambiguous) addDrift("CROSS_REGISTRY_RECONCILIATION_AMBIGUITY", "authority_registry", authority, "authority lineage resolves ambiguously")
    if (continuity.match && crossRegistryField(continuity.match, "session_id") !== crossRegistryField(authority, "session_id")) addDrift("SESSION_CONTINUITY_DIVERGENCE", "authority_registry", authority, "authority session differs from continuity session")
  }
  for (const aeo of aeos) {
    const authority = oneCrossRegistry(authorities, (row) => crossRegistryField(row, "authority_id") === crossRegistryField(aeo, "authority_id"))
    edges.push(crossRegistryEdge("aeo_registry", crossRegistryRecordId(aeo), "authority_registry", crossRegistryField(aeo, "authority_id"), "AEO_AUTHORITY", Boolean(authority.match) && !authority.ambiguous, "ORPHANED_AEO_RECORD"))
    if (!authority.match) addDrift("ORPHANED_AEO_RECORD", "aeo_registry", aeo, "AEO requires valid authority")
    if (authority.ambiguous) addDrift("CROSS_REGISTRY_RECONCILIATION_AMBIGUITY", "aeo_registry", aeo, "AEO authority resolves ambiguously")
    if (authority.match && crossRegistryField(aeo, "continuity_id") && crossRegistryField(authority.match, "continuity_id") && crossRegistryField(aeo, "continuity_id") !== crossRegistryField(authority.match, "continuity_id")) addDrift("AUTHORITY_CONTINUITY_DIVERGENCE", "aeo_registry", aeo, "AEO continuity differs from authority continuity")
  }
  for (const validation of validations) {
    const aeo = oneCrossRegistry(aeos, (row) => crossRegistryField(row, "decision_id") === crossRegistryField(validation, "decision_id") && crossRegistryField(row, "validated_object_hash") === crossRegistryField(validation, "validated_object_hash"))
    const session = oneCrossRegistry(sessions, (row) => crossRegistryField(row, "session_id") === crossRegistryField(validation, "session_id"))
    const invocation = oneCrossRegistry(invocations, (row) => crossRegistryField(row, "invocation_nonce") === crossRegistryField(validation, "invocation_nonce") && crossRegistryField(row, "validated_object_hash") === crossRegistryField(validation, "validated_object_hash"))
    edges.push(crossRegistryEdge("validation_registry", crossRegistryRecordId(validation), "aeo_registry", aeo.match ? crossRegistryRecordId(aeo.match) : "", "VALIDATION_AEO", Boolean(aeo.match) && !aeo.ambiguous, "ORPHANED_VALIDATION_RECORD"))
    edges.push(crossRegistryEdge("validation_registry", crossRegistryRecordId(validation), "session_registry", crossRegistryField(validation, "session_id"), "VALIDATION_SESSION", Boolean(session.match) && !session.ambiguous, "ORPHANED_VALIDATION_RECORD"))
    edges.push(crossRegistryEdge("validation_registry", crossRegistryRecordId(validation), "invocation_registry", crossRegistryField(validation, "invocation_nonce"), "VALIDATION_NONCE", Boolean(invocation.match) && !invocation.ambiguous, "ORPHANED_INVOCATION_RECORD"))
    if (!aeo.match || !session.match || !invocation.match || !crossRegistryField(validation, "invocation_nonce")) addDrift("ORPHANED_VALIDATION_RECORD", "validation_registry", validation, "validation requires AEO, session, and nonce")
    if (aeo.ambiguous || session.ambiguous || invocation.ambiguous) addDrift("CROSS_REGISTRY_RECONCILIATION_AMBIGUITY", "validation_registry", validation, "validation lineage resolves ambiguously")
    if (aeo.match) {
      const objectHash = await crossRegistryCanonicalObjectHash(aeo.match)
      if (!objectHash || objectHash !== crossRegistryField(validation, "validated_object_hash") || objectHash !== crossRegistryField(aeo.match, "validated_object_hash")) addDrift("CANONICAL_OBJECT_HASH_MISMATCH", "validation_registry", validation, "validation hash must equal the canonical serialized object hash")
      if (canonicalize(parseCrossRegistryCanonicalObject(aeo.match.canonical_aeo)) !== String(aeo.match.canonical_aeo || "")) addDrift("CANONICAL_OBJECT_HASH_MISMATCH", "aeo_registry", aeo.match, "canonical object serialization is not stable")
    }
  }
  for (const execution of executions) {
    const validation = oneCrossRegistry(validations, (row) => crossRegistryField(row, "decision_id") === crossRegistryField(execution, "decision_id") && crossRegistryField(row, "validated_object_hash") === crossRegistryField(execution, "validated_object_hash") && crossRegistryField(row, "invocation_nonce") === crossRegistryField(execution, "invocation_nonce"))
    const session = oneCrossRegistry(sessions, (row) => crossRegistryField(row, "session_id") === crossRegistryField(execution, "session_id"))
    const continuity = oneCrossRegistry(continuities, (row) => crossRegistryField(row, "continuity_id") === crossRegistryField(execution, "continuity_id"))
    edges.push(crossRegistryEdge("execution_registry", crossRegistryRecordId(execution), "validation_registry", validation.match ? crossRegistryRecordId(validation.match) : "", "EXECUTION_VALIDATION", Boolean(validation.match) && !validation.ambiguous, "ORPHANED_EXECUTION_RECORD"))
    edges.push(crossRegistryEdge("execution_registry", crossRegistryRecordId(execution), "session_registry", crossRegistryField(execution, "session_id"), "EXECUTION_SESSION", Boolean(session.match) && !session.ambiguous, "ORPHANED_EXECUTION_RECORD"))
    edges.push(crossRegistryEdge("execution_registry", crossRegistryRecordId(execution), "continuity_registry", crossRegistryField(execution, "continuity_id"), "EXECUTION_CONTINUITY", Boolean(continuity.match) && !continuity.ambiguous, "ORPHANED_EXECUTION_RECORD"))
    const proof = oneCrossRegistry(proofs, (row) => crossRegistryField(row, "execution_id") === crossRegistryField(execution, "execution_id") && crossRegistryField(row, "decision_id") === crossRegistryField(execution, "decision_id") && crossRegistryField(row, "validated_object_hash") === crossRegistryField(execution, "validated_object_hash"))
    const authority = oneCrossRegistry(authorities, (row) => crossRegistryField(row, "decision_id") === crossRegistryField(execution, "decision_id"))
    edges.push(crossRegistryEdge("execution_registry", crossRegistryRecordId(execution), "proof_registry", proof.match ? crossRegistryRecordId(proof.match) : "", "EXECUTION_PROOF", Boolean(proof.match) && !proof.ambiguous, "MISSING_PROOF_LINEAGE"))
    edges.push(crossRegistryEdge("execution_registry", crossRegistryRecordId(execution), "authority_registry", authority.match ? crossRegistryRecordId(authority.match) : "", "EXECUTION_AUTHORITY", Boolean(authority.match) && !authority.ambiguous, "AUTHORITY_LINEAGE_INVALID"))
    if (!validation.match || !session.match || !continuity.match) addDrift("ORPHANED_EXECUTION_RECORD", "execution_registry", execution, "execution requires validation, session, and continuity")
    if (!proof.match) addDrift("MISSING_PROOF_LINEAGE", "execution_registry", execution, "execution requires canonical proof lineage")
    if (!authority.match || !crossRegistryAuthorityHistoricallyValid(crossRegistryField(authority.match, "status")) || crossRegistryField(authority.match, "session_id") !== crossRegistryField(execution, "session_id")) addDrift("AUTHORITY_LINEAGE_INVALID", "execution_registry", execution, "execution authority must exist and be historically valid for the execution session")
    if (validation.ambiguous || session.ambiguous || continuity.ambiguous || proof.ambiguous || authority.ambiguous) addDrift("CROSS_REGISTRY_RECONCILIATION_AMBIGUITY", "execution_registry", execution, "execution lineage resolves ambiguously")
    if (validation.match && (crossRegistryField(validation.match, "validated_object_hash") !== crossRegistryField(execution, "validated_object_hash") || crossRegistryField(validation.match, "status") !== "VALID" || crossRegistryField(validation.match, "result") !== "VALID")) addDrift("VALIDATED_HASH_DISCONTINUITY", "execution_registry", execution, "execution requires matching VALID validation result")
    if (crossRegistryField(execution, "status") !== "EXECUTED") addDrift("REGISTRY_LINEAGE_MISMATCH", "execution_registry", execution, "execution status must remain EXECUTED within reconciled lineage")
  }
  for (const proof of proofs) {
    const execution = oneCrossRegistry(executions, (row) => crossRegistryField(row, "execution_id") === crossRegistryField(proof, "execution_id"))
    const authority = oneCrossRegistry(authorities, (row) => crossRegistryField(row, "decision_id") === crossRegistryField(proof, "decision_id"))
    const continuity = oneCrossRegistry(continuities, (row) => crossRegistryField(row, "continuity_id") === crossRegistryField(proof, "continuity_id"))
    edges.push(crossRegistryEdge("proof_registry", crossRegistryRecordId(proof), "execution_registry", crossRegistryField(proof, "execution_id"), "PROOF_EXECUTION", Boolean(execution.match) && !execution.ambiguous, "ORPHANED_PROOF_RECORD"))
    edges.push(crossRegistryEdge("proof_registry", crossRegistryRecordId(proof), "authority_registry", authority.match ? crossRegistryRecordId(authority.match) : "", "PROOF_AUTHORITY", Boolean(authority.match) && !authority.ambiguous, "ORPHANED_PROOF_RECORD"))
    edges.push(crossRegistryEdge("proof_registry", crossRegistryRecordId(proof), "continuity_registry", crossRegistryField(proof, "continuity_id"), "PROOF_CONTINUITY", Boolean(continuity.match) && !continuity.ambiguous, "ORPHANED_PROOF_RECORD"))
    if (!execution.match || !authority.match || !crossRegistryField(proof, "validated_object_hash")) addDrift("ORPHANED_PROOF_RECORD", "proof_registry", proof, "proof requires execution, authority, and validated object hash")
    if (authority.match && (!crossRegistryAuthorityHistoricallyValid(crossRegistryField(authority.match, "status")) || crossRegistryField(authority.match, "session_id") !== crossRegistryField(proof, "session_id"))) addDrift("AUTHORITY_LINEAGE_INVALID", "proof_registry", proof, "proof authority must exist and be historically valid for the proof session")
    if (!continuity.match) addDrift("ORPHANED_PROOF_RECORD", "proof_registry", proof, "proof requires continuity lineage")
    if (execution.ambiguous || authority.ambiguous || continuity.ambiguous) addDrift("CROSS_REGISTRY_RECONCILIATION_AMBIGUITY", "proof_registry", proof, "proof lineage resolves ambiguously")
    if (execution.match && crossRegistryField(execution.match, "validated_object_hash") !== crossRegistryField(proof, "validated_object_hash")) addDrift("EXECUTION_PROOF_HASH_MISMATCH", "proof_registry", proof, "proof hash differs from execution hash")
    if (continuity.match && crossRegistryField(proof, "continuity_hash") !== crossRegistryField(continuity.match, "continuity_hash")) addDrift("EXECUTION_PROOF_HASH_MISMATCH", "proof_registry", proof, "proof continuity hash differs from continuity registry")
    const authorityLineage = crossRegistryLineageObject(proof.authority_lineage)
    const executionLineage = crossRegistryLineageObject(proof.execution_lineage)
    if (!authorityLineage || !executionLineage || (authority.match && String(authorityLineage.authority_id || "") !== crossRegistryField(authority.match, "authority_id")) || (execution.match && String(executionLineage.execution_id || "") !== crossRegistryField(execution.match, "execution_id"))) addDrift("EXECUTION_PROOF_HASH_MISMATCH", "proof_registry", proof, "proof authority and execution lineage references must resolve deterministically")
  }
  const proofTruth = new Map<string, Record<string, unknown>[]>()
  for (const proof of proofs) {
    const key = `${crossRegistryField(proof, "decision_id")}:${crossRegistryField(proof, "validated_object_hash")}`
    if (!key.includes(":") || key === ":") continue
    const set = proofTruth.get(key) || []
    set.push(proof)
    proofTruth.set(key, set)
  }
  for (const duplicateSet of proofTruth.values()) if (duplicateSet.length > 1) for (const proof of duplicateSet) addDrift("DUPLICATE_PROOF_QUARANTINED", "proof_registry", proof, "duplicate proof cannot become canonical truth")
  const executionByAuthority = new Map<string, Record<string, unknown>[]>()
  for (const execution of executions) {
    const key = crossRegistryField(execution, "decision_id")
    const set = executionByAuthority.get(key) || []
    set.push(execution)
    executionByAuthority.set(key, set)
  }
  for (const authority of authorities) {
    const executionsForAuthority = executionByAuthority.get(crossRegistryField(authority, "decision_id")) || []
    if ((crossRegistryField(authority, "status") === "REVOKED" && executionsForAuthority.length > 0) || executionsForAuthority.length > 1) addDrift("AUTHORITY_REUSE_BLOCKED", "authority_registry", authority, "revoked or already consumed authority cannot be reused for execution")
    if (crossRegistryField(authority, "status") === "CONSUMED" && executionsForAuthority.length > 1) addDrift("AUTHORITY_REUSE_BLOCKED", "authority_registry", authority, "consumed authority cannot authorize multiple executions")
  }
  const nonceToObjects = new Map<string, Set<string>>()
  for (const record of [...validations, ...executions]) {
    const nonce = crossRegistryField(record, "invocation_nonce")
    if (!nonce) continue
    const set = nonceToObjects.get(nonce) || new Set<string>()
    set.add(`${crossRegistryField(record, "decision_id")}:${crossRegistryField(record, "validated_object_hash")}`)
    nonceToObjects.set(nonce, set)
  }
  for (const invocation of invocations) {
    const objects = nonceToObjects.get(crossRegistryField(invocation, "invocation_nonce")) || new Set<string>()
    if (objects.size !== 1) addDrift(objects.size === 0 ? "ORPHANED_INVOCATION_RECORD" : "REPLAY_GRAPH_FRAGMENTATION", "invocation_registry", invocation, "invocation nonce must map to exactly one validated/executed object")
    const validation = oneCrossRegistry(validations, (row) => crossRegistryField(row, "decision_id") === crossRegistryField(invocation, "decision_id") && crossRegistryField(row, "validated_object_hash") === crossRegistryField(invocation, "validated_object_hash") && crossRegistryField(row, "invocation_nonce") === crossRegistryField(invocation, "invocation_nonce"))
    const execution = oneCrossRegistry(executions, (row) => crossRegistryField(row, "decision_id") === crossRegistryField(invocation, "decision_id") && crossRegistryField(row, "validated_object_hash") === crossRegistryField(invocation, "validated_object_hash") && crossRegistryField(row, "invocation_nonce") === crossRegistryField(invocation, "invocation_nonce"))
    if (!validation.match || !execution.match) addDrift("ORPHANED_INVOCATION_RECORD", "invocation_registry", invocation, "invocation requires validation and execution lineage")
    if (validation.ambiguous || execution.ambiguous) addDrift("CROSS_REGISTRY_RECONCILIATION_AMBIGUITY", "invocation_registry", invocation, "invocation lineage resolves ambiguously")
    if (crossRegistryField(invocation, "status") !== "EXECUTED") addDrift("REPLAY_GRAPH_FRAGMENTATION", "invocation_registry", invocation, "invocation status must remain EXECUTED")
    if ((validation.match && crossRegistryField(invocation, "continuity_id") !== crossRegistryField(validation.match, "continuity_id")) || (execution.match && crossRegistryField(invocation, "continuity_id") !== crossRegistryField(execution.match, "continuity_id"))) addDrift("REPLAY_GRAPH_FRAGMENTATION", "invocation_registry", invocation, "invocation continuity must match validation and execution lineage")
  }
  for (const preo of canonicalState.preo_registry || []) {
    const authority = oneCrossRegistry(authorities, (row) => crossRegistryField(row, "decision_id") === crossRegistryField(preo, "decision_id") && crossRegistryField(row, "authority_id") === crossRegistryField(preo, "authority_id"))
    const aeo = oneCrossRegistry(aeos, (row) => crossRegistryField(row, "decision_id") === crossRegistryField(preo, "decision_id") && crossRegistryField(row, "validated_object_hash") === crossRegistryField(preo, "reviewed_hash"))
    edges.push(crossRegistryEdge("preo_registry", crossRegistryRecordId(preo), "authority_registry", crossRegistryField(preo, "authority_id"), "PREO_AUTHORITY", Boolean(authority.match) && !authority.ambiguous, "GOVERNANCE_BINDING_DIVERGENCE"))
    edges.push(crossRegistryEdge("preo_registry", crossRegistryRecordId(preo), "aeo_registry", crossRegistryField(preo, "reviewed_hash"), "PREO_AEO_REVIEWED_HASH", Boolean(aeo.match) && !aeo.ambiguous, "GOVERNANCE_BINDING_DIVERGENCE"))
    if (!authority.match || !aeo.match) addDrift("GOVERNANCE_BINDING_DIVERGENCE", "preo_registry", preo, "PREO requires authority and reviewed AEO hash lineage")
    if (authority.ambiguous || aeo.ambiguous) addDrift("CROSS_REGISTRY_RECONCILIATION_AMBIGUITY", "preo_registry", preo, "PREO lineage resolves ambiguously")
    if (authority.match && crossRegistryField(preo, "continuity_id") !== crossRegistryField(authority.match, "continuity_id")) addDrift("GOVERNANCE_BINDING_DIVERGENCE", "preo_registry", preo, "PREO continuity differs from authority lineage")
    if (crossRegistryField(preo, "status") !== "PREO_VALID") addDrift("GOVERNANCE_BINDING_DIVERGENCE", "preo_registry", preo, "PREO status must remain PREO_VALID")
  }
  for (const topology of canonicalState.runtime_topology_registry || []) if (truthyEvidenceEscalation(topology.executable) || truthyEvidenceEscalation(topology.deployment_capable) || truthyEvidenceEscalation(topology.creates_authority) || topology.evidence_only === "false") addDrift("TOPOLOGY_BINDING_DIVERGENCE", "runtime_topology_registry", topology, "topology evidence became authoritative or executable")
  for (const governance of canonicalState.recursive_governance_containment_registry || []) if (truthyEvidenceEscalation(governance.executable) || truthyEvidenceEscalation(governance.deployment_capable) || truthyEvidenceEscalation(governance.creates_authority) || governance.evidence_only === "false") addDrift("GOVERNANCE_BINDING_DIVERGENCE", "recursive_governance_containment_registry", governance, "recursive governance containment must remain evidence-only")
  for (const root of canonicalState.root_authority_observability_registry || []) if (truthyEvidenceEscalation(root.executable) || truthyEvidenceEscalation(root.deployment_capable) || truthyEvidenceEscalation(root.creates_authority) || root.non_authoritative === "false") addDrift("ROOT_AUTHORITY_EVIDENCE_ESCALATION", "root_authority_observability_registry", root, "root authority evidence cannot grant authority")
  for (const closure of canonicalState.unauthorized_mutation_closure_registry || []) if (truthyEvidenceEscalation(closure.executable) || truthyEvidenceEscalation(closure.creates_authority) || truthyEvidenceEscalation(closure.proof_generating)) addDrift("OBSERVABILITY_RECORD_AUTHORITY_ESCALATION", "unauthorized_mutation_closure_registry", closure, "observability evidence cannot become proof or authority")
  const lineage_edges = edges.sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)))
  const unresolved_edges = lineage_edges.filter((edge) => edge.status === "UNRESOLVED")
  const drift_classes = [...new Set(drift.map((item) => item.drift_class))].sort() as CrossRegistryDriftClass[]
  const sorted_orphans = orphaned_records.sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)))
  const containment_status = drift_classes.length || unresolved_edges.length ? "RECONCILIATION_REQUIRED" : "RECONCILED"
  const legitimacy_status = containment_status === "RECONCILED" ? "LEGITIMATE" : "NULL"
  const registry_set_hash = await sha256Hex(canonicalize(canonicalState))
  const lineage_graph_hash = await sha256Hex(canonicalize(lineage_edges))
  const continuity_graph_hash = await sha256Hex(canonicalize(lineage_edges.filter((edge) => edge.relation.includes("CONTINUITY") || edge.relation.includes("SESSION"))))
  const proof_graph_hash = await sha256Hex(canonicalize(lineage_edges.filter((edge) => edge.from_registry === "proof_registry" || edge.to_registry === "proof_registry")))
  const replay_graph_hash = await sha256Hex(canonicalize({ invocations, nonce_to_objects: [...nonceToObjects.entries()].map(([nonce, objects]) => [nonce, [...objects].sort()]).sort() }))
  const topology_binding_hash = await sha256Hex(canonicalize(canonicalState.runtime_topology_registry || []))
  const governance_binding_hash = await sha256Hex(canonicalize({ recursive: canonicalState.recursive_governance_containment_registry || [], root: canonicalState.root_authority_observability_registry || [], closure: canonicalState.unauthorized_mutation_closure_registry || [], preo: canonicalState.preo_registry || [] }))
  const equivalence = { object_type: "CrossRegistryEquivalence", equivalent: containment_status === "RECONCILED", drift_classes, legitimacy_status }
  const continuity_proof = { object_type: "CrossRegistryContinuityProof", replay_neutral: true, replay_consumed: false, continuity_preserved: containment_status === "RECONCILED", legitimacy_status }
  const reconciliation_equivalence_hash = await sha256Hex(canonicalize({ equivalence, continuity_proof, drift_classes, unresolved_edges, orphaned_records: sorted_orphans }))
  const reconciliation_id = await sha256Hex(canonicalize({ registry_set_hash, lineage_graph_hash, continuity_graph_hash, proof_graph_hash, replay_graph_hash, topology_binding_hash, governance_binding_hash, reconciliation_equivalence_hash }))
  return { object_type: "CrossRegistryReconciliationSnapshot", reconciliation_id, registry_set_hash, lineage_graph_hash, continuity_graph_hash, proof_graph_hash, replay_graph_hash, topology_binding_hash, governance_binding_hash, reconciliation_equivalence_hash, lineage_edges, drift: drift.sort((a, b) => canonicalize(a).localeCompare(canonicalize(b))), equivalence, continuity_proof, drift_classes, unresolved_edges, orphaned_records: sorted_orphans, containment_status, legitimacy_status, ...crossRegistryRouteFlags() }
}
async function fetchCrossRegistryState(env: Env): Promise<Record<string, Record<string, unknown>[]>> {
  const state: Record<string, Record<string, unknown>[]> = {}
  for (const registry of CANONICAL_RECONCILIATION_REGISTRY_ORDER) {
    try {
      const result = await env.DB.prepare(`SELECT * FROM ${registry} LIMIT 1000`).all<Record<string, unknown>>()
      state[registry] = sortCrossRegistryRecords(result.results || [])
    } catch { state[registry] = [] }
  }
  return state
}
async function appendCrossRegistryReconciliationSnapshot(env: Env, snapshot: CrossRegistryReconciliationSnapshot, generated_at: string) {
  await env.DB.prepare(`INSERT OR IGNORE INTO cross_registry_reconciliation_registry (reconciliation_id,registry_set_hash,lineage_graph_hash,continuity_graph_hash,proof_graph_hash,replay_graph_hash,topology_binding_hash,governance_binding_hash,reconciliation_equivalence_hash,drift_classes,unresolved_edges,orphaned_records,containment_status,legitimacy_status,evidence_only,replay_neutral,non_authoritative,executable,deployment_capable,creates_authority,proof_generating,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,'true','true','true','false','false','false','false',?15,?16)`)
    .bind(snapshot.reconciliation_id, snapshot.registry_set_hash, snapshot.lineage_graph_hash, snapshot.continuity_graph_hash, snapshot.proof_graph_hash, snapshot.replay_graph_hash, snapshot.topology_binding_hash, snapshot.governance_binding_hash, snapshot.reconciliation_equivalence_hash, canonicalize(snapshot.drift_classes), canonicalize(snapshot.unresolved_edges), canonicalize(snapshot.orphaned_records), snapshot.containment_status, snapshot.legitimacy_status === "NULL" ? null : snapshot.legitimacy_status, generated_at, generated_at).run()
}

type RuntimeTopologyDriftClass = "TOPOLOGY_VALID" | "UNDECLARED_RUNTIME_SURFACE" | "TOPOLOGY_EQUIVALENCE_DRIFT" | "MUTATION_SURFACE_EXPANSION" | "GOVERNANCE_SURFACE_DRIFT" | "OBSERVABILITY_BOUNDARY_DRIFT" | "EXECUTION_BOUNDARY_DRIFT" | "REGISTRY_LINEAGE_DRIFT" | "CONTAINMENT_DIVERGENCE" | "CANONICAL_ROUTE_DIVERGENCE" | "RECONCILIATION_AMBIGUITY"

type RuntimeTopologySnapshot = {
  object_type: "RuntimeTopologySnapshot"
  nodes: Record<string, unknown>[]
  edges: Record<string, unknown>[]
  topology_hash: string
  topology_semantic_hash: string
  topology_boundary_hash: string
  topology_lineage_hash: string
  topology_equivalence_hash: string
  replay_neutral: true
  executable: false
  deployment_capable: false
  creates_authority: false
}

function topologyRouteFlags() {
  return { evidence_only: true, replay_neutral: true, executable: false, deployment_capable: false, creates_authority: false, mutation_capable: false, read_only: true, authoritative: false, proof_generating: false, replay_consumed: false }
}

function runtimeTopologyNodeObject(section: string, identity: string, object: Record<string, unknown>) {
  return Object.freeze({ object_type: "RuntimeTopologyNode", section, identity, object, executable: false, deployment_capable: false, creates_authority: false, mutation_capable: Boolean(object.mutation_capable ?? false) })
}

function sortTopologyObjects(objects: Record<string, unknown>[]) {
  return [...objects].map(canonicalRecord).sort((a, b) => String(a.identity ?? a.route ?? a.registry ?? a.artifact ?? canonicalize(a)).localeCompare(String(b.identity ?? b.route ?? b.registry ?? b.artifact ?? canonicalize(b))) || canonicalize(a).localeCompare(canonicalize(b)))
}

async function enumerateRuntimeTopologySnapshot(): Promise<RuntimeTopologySnapshot> {
  const routeNodes = [...CANONICAL_RUNTIME_ROUTES].sort().map((route) => runtimeTopologyNodeObject("canonical_routes", route, { route, canonical: true, observability_only: false, mutation_requires_authority: true }))
  const observabilityNodes = [...NON_EXECUTABLE_OBSERVABILITY_ROUTES].sort().map((route) => runtimeTopologyNodeObject("observability_only_routes", route, { route, observability_only: true, replay_neutral: true, executable: false, deployment_capable: false, creates_authority: false }))
  const appendOnlyRegistries = [
    "authority_registry", "aeo_registry", "validation_registry", "execution_registry", "proof_registry", "invocation_registry", "preo_registry", "runtime_surface_containment_registry", "reconciliation_closure_registry", "recursive_governance_containment_registry", "runtime_sovereignty_registry", "root_authority_observability_registry", "runtime_topology_registry", "topology_reconciliation_registry"
  ].sort().map((registry) => runtimeTopologyNodeObject("append_only_registries", registry, { registry, append_only: true, update_allowed: false, delete_allowed: false }))
  const mutationNodes = [
    ...GOVERNED_DEPLOY_WORKFLOW_SURFACES.map((workflow) => runtimeTopologyNodeObject("workflow_mutation_surfaces", workflow, { workflow, declared: true, governed: true, direct_deploy_allowed: false })),
    ...ADAPTER_MUTATION_SURFACES.map((adapter) => runtimeTopologyNodeObject("deploy_mutation_surfaces", adapter, { adapter, declared: true, governed: true, direct_deploy_allowed: false })),
  ]
  const governanceNodes = [
    "governance/runtime-topology-equivalence.json", "governance/runtime-topology-drift-taxonomy.json", "governance/runtime-topology-reconciliation.json", "governance/runtime/MERGE_GOVERNANCE_RULES.json", "governance/runtime/RECURSIVE_GOVERNANCE_SPEC.json", "governance/runtime/EXECUTION_SURFACES.json"
  ].sort().map((artifact) => runtimeTopologyNodeObject("governance_artifacts", artifact, { artifact, machine_readable: true, authorizes_execution: false }))
  const containmentNodes = [
    runtimeTopologyNodeObject("recursive_governance_containment", RECURSIVE_GOVERNANCE_CONTAINMENT_REGISTRY, { registry: RECURSIVE_GOVERNANCE_CONTAINMENT_REGISTRY, contained: true }),
    runtimeTopologyNodeObject("sovereignty_containment", ROOT_AUTHORITY_OBSERVABILITY_REGISTRY, { registry: ROOT_AUTHORITY_OBSERVABILITY_REGISTRY, contained: true }),
  ]
  const nodes = sortTopologyObjects([...routeNodes, ...observabilityNodes, ...appendOnlyRegistries, ...mutationNodes, ...governanceNodes, ...containmentNodes])
  const edges = sortTopologyObjects(nodes.map((node) => canonicalRecord({ object_type: "RuntimeTopologyEdge", from: node.section, to: node.identity, relation: "ENUMERATES_EXACT_OBJECT" })))
  const runtimeMaterial = { canonical_routes: [...CANONICAL_RUNTIME_ROUTES].sort(), observability_routes: [...NON_EXECUTABLE_OBSERVABILITY_ROUTES].sort() }
  const semanticMaterial = { governance_artifacts: governanceNodes.map((node) => node.identity).sort(), registries: appendOnlyRegistries.map((node) => node.identity).sort() }
  const boundaryMaterial = { execution_boundary: [...CANONICAL_RUNTIME_ROUTES].sort(), observability_boundary: [...NON_EXECUTABLE_OBSERVABILITY_ROUTES].sort(), workflow_mutation_surfaces: GOVERNED_DEPLOY_WORKFLOW_SURFACES }
  const lineageMaterial = { append_only_registries: appendOnlyRegistries.map((node) => node.identity).sort(), containment: containmentNodes.map((node) => node.identity).sort() }
  const topology_hash = await sha256Hex(canonicalize(runtimeMaterial))
  const topology_semantic_hash = await sha256Hex(canonicalize(semanticMaterial))
  const topology_boundary_hash = await sha256Hex(canonicalize(boundaryMaterial))
  const topology_lineage_hash = await sha256Hex(canonicalize(lineageMaterial))
  const topology_equivalence_hash = await sha256Hex(canonicalize({ topology_hash, topology_semantic_hash, topology_boundary_hash, topology_lineage_hash }))
  return Object.freeze({ object_type: "RuntimeTopologySnapshot", nodes, edges, topology_hash, topology_semantic_hash, topology_boundary_hash, topology_lineage_hash, topology_equivalence_hash, replay_neutral: true, executable: false, deployment_capable: false, creates_authority: false })
}

function classifyRuntimeTopologySnapshot(snapshot: RuntimeTopologySnapshot): RuntimeTopologyDriftClass[] {
  const drift = new Set<RuntimeTopologyDriftClass>()
  if (!snapshot || snapshot.object_type !== "RuntimeTopologySnapshot") drift.add("RECONCILIATION_AMBIGUITY")
  for (const node of snapshot.nodes) {
    if (node.section === "observability_only_routes" && (node.executable !== false || node.deployment_capable !== false || node.creates_authority !== false)) drift.add("OBSERVABILITY_BOUNDARY_DRIFT")
    const object = canonicalRecord(node.object)
    if (object.append_only === false || object.update_allowed === true || object.delete_allowed === true) drift.add("REGISTRY_LINEAGE_DRIFT")
    if (object.contained === false || object.divergent === true || object.boundary_overflow === true) drift.add("CONTAINMENT_DIVERGENCE")
  }
  return [...drift].sort()
}

async function buildRuntimeTopologyReconciliationEnvelope(generated_at: string) {
  const snapshot = await enumerateRuntimeTopologySnapshot()
  const drift_classes = classifyRuntimeTopologySnapshot(snapshot)
  const classification: RuntimeTopologyDriftClass = drift_classes.includes("RECONCILIATION_AMBIGUITY") ? "RECONCILIATION_AMBIGUITY" : drift_classes[0] || "TOPOLOGY_VALID"
  const equivalence = Object.freeze({ object_type: "RuntimeTopologyEquivalence", validated_topology_hash: snapshot.topology_equivalence_hash, executed_topology_hash: snapshot.topology_equivalence_hash, equivalent: classification === "TOPOLOGY_VALID", legitimacy: classification === "TOPOLOGY_VALID" ? "UNCHANGED" : "NULL", evidence_only: true, authorizes_execution: false, authorizes_deployment: false })
  const fingerprint = Object.freeze({ object_type: "RuntimeTopologyFingerprint", topology_hash: snapshot.topology_hash, topology_semantic_hash: snapshot.topology_semantic_hash, topology_boundary_hash: snapshot.topology_boundary_hash, topology_lineage_hash: snapshot.topology_lineage_hash, topology_equivalence_hash: snapshot.topology_equivalence_hash, replay_neutral: true })
  const reconciliation_id = await sha256Hex(canonicalize({ fingerprint, drift_classes, equivalence }))
  return Object.freeze({ object_type: "RuntimeTopologyReconciliation", reconciliation_id, reconciliation_timestamp: generated_at, fingerprint, snapshot, drift: { object_type: "RuntimeTopologyDrift", classification, drift_classes: drift_classes.length ? drift_classes : ["TOPOLOGY_VALID"], fail_closed: classification !== "TOPOLOGY_VALID", legitimacy: classification === "TOPOLOGY_VALID" ? "UNCHANGED" : "NULL" }, equivalence, ...topologyRouteFlags() })
}

async function appendRuntimeTopologySnapshot(env: Env, envelope: Awaited<ReturnType<typeof buildRuntimeTopologyReconciliationEnvelope>>, created_at: string) {
  await env.DB.prepare(`INSERT OR IGNORE INTO runtime_topology_registry (snapshot_id,topology_hash,topology_semantic_hash,topology_boundary_hash,topology_lineage_hash,topology_equivalence_hash,drift_classes,lineage_hash,boundary_hash,reconciliation_timestamp,containment_references,topology_snapshot,evidence_only,replay_neutral,executable,deployment_capable,creates_authority,append_only,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'true','true','false','false','false','true',?13)`).bind(envelope.reconciliation_id, envelope.fingerprint.topology_hash, envelope.fingerprint.topology_semantic_hash, envelope.fingerprint.topology_boundary_hash, envelope.fingerprint.topology_lineage_hash, envelope.fingerprint.topology_equivalence_hash, JSON.stringify(envelope.drift.drift_classes), envelope.fingerprint.topology_lineage_hash, envelope.fingerprint.topology_boundary_hash, envelope.reconciliation_timestamp, JSON.stringify([RECURSIVE_GOVERNANCE_CONTAINMENT_REGISTRY, ROOT_AUTHORITY_OBSERVABILITY_REGISTRY]), canonicalize(envelope.snapshot), created_at).run()
}

type ConsensusDriftClass = "OBSERVER_DIVERGENCE" | "QUORUM_AMBIGUITY" | "SEMANTIC_DIVERGENCE" | "FEDERATED_EQUIVALENCE_DRIFT" | "CHECKPOINT_CORRUPTION" | "PORTABILITY_LINEAGE_DRIFT" | "REMOTE_AUTHORITY_INHERITANCE_ATTEMPT" | "CONSENSUS_CONTAINMENT_OVERFLOW" | "OBSERVER_REPLAY_RESURRECTION" | "GOVERNANCE_CONSENSUS_FRAGMENTATION" | "SEMANTIC_AMBIGUITY" | "SEMANTIC_REPLAY" | "SEMANTIC_CONTAINMENT_OVERFLOW" | "SEMANTIC_GOVERNANCE_DRIFT"
const CONSENSUS_DRIFT_TAXONOMY: readonly ConsensusDriftClass[] = Object.freeze(["OBSERVER_DIVERGENCE", "QUORUM_AMBIGUITY", "SEMANTIC_DIVERGENCE", "FEDERATED_EQUIVALENCE_DRIFT", "CHECKPOINT_CORRUPTION", "PORTABILITY_LINEAGE_DRIFT", "REMOTE_AUTHORITY_INHERITANCE_ATTEMPT", "CONSENSUS_CONTAINMENT_OVERFLOW", "OBSERVER_REPLAY_RESURRECTION", "GOVERNANCE_CONSENSUS_FRAGMENTATION", "SEMANTIC_AMBIGUITY", "SEMANTIC_REPLAY", "SEMANTIC_CONTAINMENT_OVERFLOW", "SEMANTIC_GOVERNANCE_DRIFT"])
const CONSENSUS_FLAGS = Object.freeze({ evidence_only: true, replay_neutral: true, non_authoritative: true, read_only: true, mutation_capable: false, creates_authority: false, executable: false, deployment_capable: false, proof_generating: false, merge_authorizing: false, remote_authority_denied: true, local_validation_required: true, observer_agreement_authorizes_execution: false, semantic_equivalence_authorizes_execution: false, remote_legitimacy_inherits_local_authority: false, fail_closed_on_ambiguity: true })
type ObserverCheckpointObject = { observer_id: string, observed_checkpoint_hash: string, semantic_hash: string, topology_hash: string, reconciliation_hash: string, sovereignty_hash: string, equivalence_hash: string, drift_classes: ConsensusDriftClass[], legitimacy_status: "LEGITIMATE" | null }
type GovernanceConsensusEnvelope = { envelope_type: "GovernanceConsensusCheckpoint", observer: ObserverCheckpointObject, semantic_envelope: Record<string, unknown>, portable_checkpoint: Record<string, unknown>, conformance: Record<string, unknown>, quorum: Record<string, unknown>, consensus_hash: string, generated_at: string, evidence_only: true, replay_neutral: true, non_authoritative: true, executable: false, creates_authority: false }

function consensusGeneratedAt(): string { return new Date(0).toISOString() }
function consensusRouteFlags() { return CONSENSUS_FLAGS }
function decodeConsensusEnvelope(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  try { return canonicalRecord(JSON.parse(new TextDecoder().decode(base64ToBytes(value) || utf8Bytes("{}")))) } catch { return null }
}
async function semanticHashForConsensus(route: string): Promise<string> {
  return sha256Hex(canonicalize({ exact_object_discipline: true, schema_evolution_equivalence: true, topology_evolution_equivalence: true, portability_evolution_equivalence: true, replay_neutral: true, route, semantic_equivalence_authorizes: false }))
}
async function buildGovernanceConsensusEnvelope(url: URL): Promise<GovernanceConsensusEnvelope> {
  const generated_at = consensusGeneratedAt()
  const remote = decodeConsensusEnvelope(url.searchParams.get("remote_envelope"))
  const observer_id = String(url.searchParams.get("observer_id") || "local-observer")
  const semantic_hash = await semanticHashForConsensus(url.pathname)
  const topology_hash = await sha256Hex(canonicalize({ canonical_routes: CANONICAL_RUNTIME_ROUTES, observer_routes: OBSERVER_CONSENSUS_ROUTES, conformance_routes: EXTERNAL_CONFORMANCE_ROUTES, routes_outside_runtime: true }))
  const reconciliation_hash = await sha256Hex(canonicalize({ registries: [OBSERVER_ATTESTATION_REGISTRY, SEMANTIC_EQUIVALENCE_REGISTRY, PORTABLE_GOVERNANCE_CHECKPOINT_REGISTRY, EXTERNAL_CONFORMANCE_VERIFICATION_REGISTRY], append_only: true, observer_consensus_authoritative: false }))
  const sovereignty_hash = await sha256Hex(canonicalize({ local_sovereignty_isolated: true, remote_authority_denied: true, federation_inheritance: false, runtime_id: RUNTIME_ID }))
  const observed_checkpoint_hash = await sha256Hex(canonicalize({ semantic_hash, topology_hash, reconciliation_hash, sovereignty_hash, generated_at, replay_neutral: true }))
  const equivalence_hash = await sha256Hex(canonicalize({ semantic_hash, topology_hash, reconciliation_hash, sovereignty_hash, observed_checkpoint_hash }))
  const drift = new Set<ConsensusDriftClass>()
  const remoteStatus = String(remote?.legitimacy_status || remote?.status || "")
  if (remote && String(remote.equivalence_hash || "") && String(remote.equivalence_hash) !== equivalence_hash) drift.add("FEDERATED_EQUIVALENCE_DRIFT")
  if (remote && String(remote.semantic_hash || "") && String(remote.semantic_hash) !== semantic_hash) drift.add("SEMANTIC_DIVERGENCE")
  if (remote && (remote.creates_authority === true || remote["remote_authority_inherited"] === true || remote["authority_inherited"] === true)) drift.add("REMOTE_AUTHORITY_INHERITANCE_ATTEMPT")
  if (remote && remoteStatus && !["LEGITIMATE", "CONFORMANT", "OBSERVER_CONSENSUS_OBSERVED"].includes(remoteStatus)) drift.add("OBSERVER_DIVERGENCE")
  if (url.searchParams.get("replay") === "true") drift.add("OBSERVER_REPLAY_RESURRECTION")
  if (url.searchParams.get("ambiguous") === "true") drift.add("QUORUM_AMBIGUITY")
  const drift_classes = Array.from(drift).sort() as ConsensusDriftClass[]
  const legitimacy_status: "LEGITIMATE" | null = drift_classes.length === 0 ? "LEGITIMATE" : null
  const observer: ObserverCheckpointObject = { observer_id, observed_checkpoint_hash, semantic_hash, topology_hash, reconciliation_hash, sovereignty_hash, equivalence_hash, drift_classes, legitimacy_status }
  const semantic_envelope = canonicalRecord({ semantic_hash, schema_semantic_hash: semantic_hash, topology_semantic_hash: topology_hash, governance_semantic_hash: reconciliation_hash, portability_semantic_hash: observed_checkpoint_hash, equivalence_hash, drift_classes, legitimacy_status, same_meaning_same_legitimacy_identity: drift_classes.length === 0, authority_inheritance: false })
  const portable_checkpoint = canonicalRecord({ checkpoint_hash: observed_checkpoint_hash, reconciliation_hash, topology_hash, semantic_equivalence_hash: equivalence_hash, conformance_hash: sovereignty_hash, jcs_compatible: true, dsse_compatible: true, exact_object_stable: true, replay_neutral: true, authorizes_execution: false, authorizes_proof: false, authorizes_merge: false })
  const conformance = canonicalRecord({ runtime_compatibility_hash: topology_hash, governance_semantic_hash: semantic_hash, checkpoint_equivalence_hash: equivalence_hash, federated_conformance_hash: await sha256Hex(canonicalize({ topology_hash, semantic_hash, equivalence_hash, sovereignty_hash })), conformance_status: drift_classes.length === 0 ? "CONFORMANT" : "NULL", bounded_federated_reconciliation: true, trust_inheritance: false })
  const quorum = canonicalRecord({ observer_count: remote ? 2 : 1, quorum_status: drift_classes.includes("QUORUM_AMBIGUITY") || drift_classes.includes("OBSERVER_DIVERGENCE") ? "NULL" : "QUORUM_CLASSIFIED", observer_agreement_authorizes_execution: false })
  const consensus_hash = await sha256Hex(canonicalize({ observer, semantic_envelope, portable_checkpoint, conformance, quorum }))
  return { envelope_type: "GovernanceConsensusCheckpoint", observer, semantic_envelope, portable_checkpoint, conformance, quorum, consensus_hash, generated_at, evidence_only: true, replay_neutral: true, non_authoritative: true, executable: false, creates_authority: false }
}
async function appendGovernanceConsensusEvidence(env: Env, envelope: GovernanceConsensusEnvelope, created_at: string) {
  const o = envelope.observer
  await env.DB.prepare(`INSERT OR IGNORE INTO observer_attestation_registry (attestation_id,observer_id,observed_checkpoint_hash,semantic_hash,topology_hash,reconciliation_hash,sovereignty_hash,equivalence_hash,drift_classes,legitimacy_status,attestation_hash,observer_envelope,evidence_only,replay_neutral,non_authoritative,read_only,mutation_capable,creates_authority,executable,deployment_capable,proof_generating,merge_authorizing,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'true','true','true','true','false','false','false','false','false','false',?13,?14)`).bind(crypto.randomUUID(), o.observer_id, o.observed_checkpoint_hash, o.semantic_hash, o.topology_hash, o.reconciliation_hash, o.sovereignty_hash, o.equivalence_hash, canonicalize(o.drift_classes), o.legitimacy_status, envelope.consensus_hash, canonicalize(envelope), envelope.generated_at, created_at).run()
  await env.DB.prepare(`INSERT OR IGNORE INTO semantic_equivalence_registry (semantic_equivalence_id,semantic_hash,schema_semantic_hash,topology_semantic_hash,governance_semantic_hash,portability_semantic_hash,equivalence_hash,drift_classes,legitimacy_status,semantic_envelope,evidence_only,replay_neutral,non_authoritative,read_only,mutation_capable,creates_authority,executable,deployment_capable,proof_generating,merge_authorizing,generated_at,created_at) VALUES (?1,?2,?2,?3,?4,?5,?6,?7,?8,?9,'true','true','true','true','false','false','false','false','false','false',?10,?11)`).bind(crypto.randomUUID(), o.semantic_hash, o.topology_hash, o.reconciliation_hash, o.observed_checkpoint_hash, o.equivalence_hash, canonicalize(o.drift_classes), o.legitimacy_status, canonicalize(envelope.semantic_envelope), envelope.generated_at, created_at).run()
  await env.DB.prepare(`INSERT OR IGNORE INTO portable_governance_checkpoint_registry (checkpoint_id,checkpoint_hash,reconciliation_hash,topology_hash,semantic_equivalence_hash,conformance_hash,portable_envelope,dsse_payload_type,jcs_canonical,drift_classes,legitimacy_status,evidence_only,replay_neutral,non_authoritative,read_only,mutation_capable,creates_authority,executable,deployment_capable,proof_generating,merge_authorizing,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'application/vnd.mindshift.governance-checkpoint.v1+json','true',?8,?9,'true','true','true','true','false','false','false','false','false','false',?10,?11)`).bind(crypto.randomUUID(), o.observed_checkpoint_hash, o.reconciliation_hash, o.topology_hash, o.equivalence_hash, String(envelope.conformance.conformance_hash || envelope.consensus_hash), canonicalize(envelope.portable_checkpoint), canonicalize(o.drift_classes), o.legitimacy_status, envelope.generated_at, created_at).run()
  await env.DB.prepare(`INSERT OR IGNORE INTO external_conformance_verification_registry (verification_id,runtime_compatibility_hash,governance_semantic_hash,checkpoint_equivalence_hash,federated_conformance_hash,conformance_status,drift_classes,verification_envelope,evidence_only,replay_neutral,non_authoritative,read_only,mutation_capable,creates_authority,executable,deployment_capable,proof_generating,merge_authorizing,remote_authority_denied,generated_at,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'true','true','true','true','false','false','false','false','false','false','true',?9,?10)`).bind(crypto.randomUUID(), String(envelope.conformance.runtime_compatibility_hash || ""), String(envelope.conformance.governance_semantic_hash || ""), String(envelope.conformance.checkpoint_equivalence_hash || ""), String(envelope.conformance.federated_conformance_hash || envelope.consensus_hash), String(envelope.conformance.conformance_status || "NULL"), canonicalize(o.drift_classes), canonicalize(envelope.conformance), envelope.generated_at, created_at).run()
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
    if (RECURSIVE_GOVERNANCE_CONTAINMENT_ROUTES.includes(url.pathname as any) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", ...recursiveGovernanceContainmentStatusFlags() }, 405)
    if (RECURSIVE_GOVERNANCE_CONTAINMENT_ROUTES.includes(url.pathname as any) && request.method === "GET") {
      try {
        const generated_at = new Date().toISOString()
        const observation = await buildRecursiveGovernanceContainmentObservation(url, generated_at)
        if (hasDb(env)) await appendRecursiveGovernanceContainmentObservation(env, observation)
        const status = observation.recursive_containment_status === "RECURSIVE_CONTAINMENT_REQUIRED" ? "NULL" : "GOVERNANCE_CONTAINED"
        if (url.pathname === RECURSIVE_GOVERNANCE_CONTAINMENT_DRIFT_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", semantic_divergence_classes: observation.semantic_divergence_classes, drift_taxonomy: GOVERNANCE_DRIFT_TAXONOMY, recursive_containment_status: observation.recursive_containment_status, governance_mutation_class: observation.governance_mutation_class, merge_legitimacy: observation.containment_object.merge_legitimacy, proof_authority: observation.containment_object.proof_authority, execution_authority: observation.containment_object.execution_authority, ...recursiveGovernanceContainmentStatusFlags() })
        if (url.pathname === RECURSIVE_GOVERNANCE_CONTAINMENT_TOPOLOGY_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", governance_topology_hash: observation.governance_topology_hash, execution_boundary_topology: observation.containment_object.execution_boundary_topology, governance_lineage_hash: observation.governance_lineage_hash, governance_continuity: observation.containment_object.governance_continuity, ...recursiveGovernanceContainmentStatusFlags() })
        if (url.pathname === RECURSIVE_GOVERNANCE_CONTAINMENT_EQUIVALENCE_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", governance_equivalence_hash: observation.governance_equivalence_hash, governance_semantic_hash: observation.governance_semantic_hash, governance_topology_hash: observation.governance_topology_hash, governance_lineage_hash: observation.governance_lineage_hash, semantic_divergence_classes: observation.semantic_divergence_classes, ...recursiveGovernanceContainmentStatusFlags() })
        return json({ status, route: url.pathname, reason: "observability_only", observation, governance_equivalence_hash: observation.governance_equivalence_hash, governance_semantic_hash: observation.governance_semantic_hash, governance_topology_hash: observation.governance_topology_hash, governance_lineage_hash: observation.governance_lineage_hash, semantic_divergence_classes: observation.semantic_divergence_classes, recursive_containment_status: observation.recursive_containment_status, governance_mutation_class: observation.governance_mutation_class, ...recursiveGovernanceContainmentStatusFlags() })
      } catch {
        return json({ status: "NULL", route: url.pathname, reason: "recursive_governance_containment_unavailable", semantic_divergence_classes: ["RECURSIVE_CONTAINMENT_REQUIRED"], recursive_containment_status: "RECURSIVE_CONTAINMENT_REQUIRED", ...recursiveGovernanceContainmentStatusFlags() }, 500)
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
        const report = await deterministicReconciliationReport(result, new Date().toISOString())
        const summary = await reconciliationSummaryObject(result, new Date().toISOString())
        const portable = await portableReconciliationEnvelope(summary as unknown as Record<string, unknown>)
        return json({ status: result.result, route: "/reconcile/report", reason: "observability_only", report, summary, portable, evidence_only: true, replay_neutral: true, read_only: true, mutation_capable: false, authority_created: false, execution_started: false, proof_created: false, authority_consumed: false, canonical_lifecycle_mutated: false })
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
        const report = await deterministicReconciliationReport(result, emitted_at)
        const summary = await reconciliationSummaryObject(result, emitted_at)
        const snapshot = await deterministicReconciliationSnapshot(result)
        const bundle = await portableLegitimacyBundleFromResult(result, emitted_at)
        const drift = await federatedDriftClassificationsAfterPortableBundleResolution(result, bundle)
        return json({ status: reconciliationStatusAfterPortableBundleResolution(result, bundle), route: "/federation/reconcile/report", reason: "observability_only", report, summary, deterministic_snapshot: snapshot, portable_legitimacy_bundle: bundle, drift, federation_boundary: "portable_evidence_not_portable_authority", evidence_only: true, replay_neutral: true, read_only: true, mutation_capable: false, authority_created: false, execution_started: false, proof_created: false, authority_consumed: false, canonical_lifecycle_mutated: false })
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
        await assertSchemaAvailableReadOnly(env)
        const anchor = reconciliationAnchorFromRequest(url)
        const generated_at = new Date().toISOString()
        const topology = await deriveRevocationTopology(env, anchor)
        const trust = await classifyFederatedTrust({ federation_origin: url.searchParams.get("federation_origin") || LOCAL_FEDERATION_RUNTIME_ID, continuity_reference: topology.continuity_id, lineage_root: topology.lineage_root, verification_status: topology.drift_classifications.includes("replay_resurrection_attempt") ? "REPLAY_DETECTED" : topology.drift_classifications.includes("federated_lineage_divergence") ? "LINEAGE_MISMATCH" : "VERIFIED" }, generated_at)
        const observability_envelope = await createObservabilityEnvelope(topology, trust.envelope, traceRevocationImpact(topology), topology.drift_classifications.filter((drift) => drift === "replay_resurrection_attempt" || drift === "federated_revocation_replay_drift"), generated_at)
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
        return json({ status: consensus.consensus_status, route: "/federation/reconcile/distributed", reason: "observability_only", reconciliation_envelope, checkpoint_comparison_summary, topology_drift_summary, replay_indicators: reconciliation_envelope.replay_indicators, remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, remote_execution_legitimacy: false, remote_authority_inherited: false, local_validation_required: true, append_only: true })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile/distributed", reason: "reconciliation_unavailable", remote_authority_denied: true, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
      }
    }


    if (url.pathname === "/federation/sovereignty/checkpoint" && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: "/federation/sovereignty/checkpoint", reason: "database_unavailable", evidence_only: true, remote_authority_denied: true, read_only: true, mutation_capable: false, replay_neutral: true })
        await assertSchemaAvailableReadOnly(env)
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
    if (url.pathname === INSTALL_BASE_METRICS_ROUTE && request.method !== "GET") return json({ status: "NULL", route: INSTALL_BASE_METRICS_ROUTE, reason: "get_only", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, creates_authority: false, proof_created: false }, 405)
    if (url.pathname === INSTALL_BASE_METRICS_ROUTE && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: INSTALL_BASE_METRICS_ROUTE, reason: "database_unavailable", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, creates_authority: false, proof_created: false })
        const metrics = await installBaseGovernanceMetrics(env)
        return json({ status: "NULL", route: INSTALL_BASE_METRICS_ROUTE, reason: "observability_only", metrics, authority_issuance_influenced: false, validator_decisions_influenced: false, execution_eligibility_influenced: false, proof_legitimacy_influenced: false })
      } catch {
        return json({ status: "NULL", route: INSTALL_BASE_METRICS_ROUTE, reason: "database_unavailable", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, creates_authority: false, proof_created: false })
      }
    }
    if (url.pathname === TELEMETRY_ROUTE && request.method !== "GET") return json({ status: "NULL", route: TELEMETRY_ROUTE, reason: "get_only", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, creates_authority: false, validates_objects: false, executes_actions: false, creates_proof: false, mutates_registries: false, repairs_failures: false, turns_failed_executions_valid: false }, 405)
    if (url.pathname === TELEMETRY_ROUTE && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: TELEMETRY_ROUTE, reason: "database_unavailable", evidence_only: true, read_only: true, mutation_capable: false })
        const telemetryRows = await env.DB.prepare(`SELECT event_type, COUNT(*) AS count FROM install_base_telemetry_registry GROUP BY event_type`).all<any>()
        const telemetryCounts = new Map<string, number>()
        for (const row of telemetryRows.results || []) telemetryCounts.set(String(row.event_type || ""), Number(row.count || 0))
        const metrics = {
          governed_execution_total: telemetryCounts.get("governed_execution_completed") || 0,
          blocked_execution_total: telemetryCounts.get("invalid_execution_blocked") || 0,
          proof_generated_total: telemetryCounts.get("proof_generated") || 0,
          replay_rejected_total: telemetryCounts.get("replay_rejected") || 0,
          continuity_revocation_total: telemetryCounts.get("revocation_propagation_observed") || 0,
          reconciliation_failure_total: telemetryCounts.get("reconciliation_failure_detected") || 0,
          execution_surface_count: telemetryCounts.get("execution_surface_observed") || 0,
        }
        return json({ status: "NULL", route: TELEMETRY_ROUTE, reason: "observability_only", metrics, creates_authority: false, validates_objects: false, executes_actions: false, creates_proof: false, mutates_registries: false, repairs_failures: false, turns_failed_executions_valid: false, read_only: true, evidence_only: true, non_authoritative: true })
      } catch {
        return json({ status: "NULL", route: TELEMETRY_ROUTE, reason: "database_unavailable", evidence_only: true, read_only: true, mutation_capable: false })
      }
    }

    if (GOVERNANCE_OBSERVABILITY_ROUTES.includes(url.pathname as any) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", evidence_only: true, read_only: true, get_only: true, mutation_capable: false, non_authoritative: true, creates_authority: false, influences_validator_outcome: false, influences_execution_eligibility: false, creates_proof_legitimacy: false, mutates_runtime_lineage: false, append_only: true, deterministic: true }, 405)
    if (GOVERNANCE_OBSERVABILITY_ROUTES.includes(url.pathname as any) && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: url.pathname, reason: "database_unavailable", evidence_only: true, read_only: true, get_only: true, mutation_capable: false, non_authoritative: true, creates_authority: false })
        const window = boundedObservabilityWindow(url)
        const evidence = await governanceObservabilityEvidence(env, window)
        if (url.pathname === GOVERNANCE_OBSERVABILITY_TELEMETRY_ROUTE) return json({ status: "NULL", route: url.pathname, reason: "observability_only", telemetry_event_summaries: evidence.telemetry_event_summaries, classification: evidence.classification })
        if (url.pathname === GOVERNANCE_OBSERVABILITY_METRICS_ROUTE) return json({ status: "NULL", route: url.pathname, reason: "observability_only", governance_dependency_metrics: evidence.governance_dependency_metrics, classification: evidence.classification })
        if (url.pathname === GOVERNANCE_OBSERVABILITY_REPLAY_ROUTE) return json({ status: "NULL", route: url.pathname, reason: "observability_only", replay_rejection_trends: evidence.replay_rejection_trends, classification: evidence.classification })
        if (url.pathname === GOVERNANCE_OBSERVABILITY_CONTINUITY_ROUTE) return json({ status: "NULL", route: url.pathname, reason: "observability_only", continuity_rejection_trends: evidence.continuity_rejection_trends, classification: evidence.classification })
        if (url.pathname === GOVERNANCE_OBSERVABILITY_WORKFLOW_DRIFT_ROUTE) return json({ status: "NULL", route: url.pathname, reason: "observability_only", workflow_integrity_drift_trends: evidence.workflow_integrity_drift_trends, classification: evidence.classification })
        if (url.pathname === GOVERNANCE_OBSERVABILITY_RECONCILIATION_FAILURE_ROUTE) return json({ status: "NULL", route: url.pathname, reason: "observability_only", reconciliation_failure_trends: evidence.reconciliation_failure_trends, classification: evidence.classification })
        return json({ status: "NULL", route: url.pathname, reason: "observability_only", ...evidence })
      } catch {
        return json({ status: "NULL", route: url.pathname, reason: "database_unavailable", evidence_only: true, read_only: true, get_only: true, mutation_capable: false, non_authoritative: true, creates_authority: false })
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
    if (DRIFT_PROPAGATION_ROUTES.includes(url.pathname as any) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", ...DRIFT_PROPAGATION_FLAGS }, 405)

    if (DRIFT_PROPAGATION_ROUTES.includes(url.pathname as any) && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: url.pathname, reason: "database_unavailable", ...DRIFT_PROPAGATION_FLAGS }, 500)
        await assertSchemaAvailableReadOnly(env)
        const evidence = await latestTopologyReconciliationEvidence(env)
        const envelope = await buildDriftPropagationEnvelope(evidence)
        await appendDriftPropagationObservation(env, envelope)
        if (url.pathname === RECONCILIATION_IMPACT_ROUTE) return json({ status: envelope.status, route: RECONCILIATION_IMPACT_ROUTE, reason: "observability_only", impact_graph: envelope.impact_graph, impact_hash: envelope.impact_hash, drift_classes: envelope.drift_classes, append_only: true, ...DRIFT_PROPAGATION_FLAGS })
        if (url.pathname === RECONCILIATION_PROPAGATION_ROUTE) return json({ status: envelope.status, route: RECONCILIATION_PROPAGATION_ROUTE, reason: "observability_only", propagation: envelope.propagation_object, propagation_hash: envelope.propagation_hash, drift_classes: envelope.drift_classes, append_only: true, ...DRIFT_PROPAGATION_FLAGS })
        if (url.pathname === RECONCILIATION_TOPOLOGY_DELTA_ROUTE) return json({ status: envelope.status, route: RECONCILIATION_TOPOLOGY_DELTA_ROUTE, reason: "observability_only", topology_delta: envelope.topology_delta, topology_hash: envelope.topology_hash, append_only: true, ...DRIFT_PROPAGATION_FLAGS })
        return json({ status: envelope.status, route: RECONCILIATION_VERDICT_ROUTE, reason: "observability_only", verdict: envelope.verdict_object, merge_impact: envelope.merge_impact, verdict_hash: envelope.verdict_hash, propagation_hash: envelope.propagation_hash, append_only: true, ...DRIFT_PROPAGATION_FLAGS })
      } catch {
        return json({ status: "NULL", route: url.pathname, reason: "drift_propagation_unavailable", drift_classes: ["DOWNSTREAM_LEGITIMACY_NULL"], ...DRIFT_PROPAGATION_FLAGS }, 500)
      }
    }

    if (QUARANTINE_CONTAINMENT_ROUTES.includes(url.pathname as any) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", ...QUARANTINE_CONTAINMENT_FLAGS }, 405)

    if (QUARANTINE_CONTAINMENT_ROUTES.includes(url.pathname as any) && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: url.pathname, reason: "database_unavailable", ...QUARANTINE_CONTAINMENT_FLAGS }, 500)
        await assertSchemaAvailableReadOnly(env)
        const contamination = await latestContainmentContaminationEvidence(env)
        const envelope = await buildQuarantineContainmentEnvelope(contamination)
        await appendQuarantineContainmentObservation(env, envelope)
        if (url.pathname === RECONCILIATION_QUARANTINE_ROUTE) return json({ status: envelope.status, route: RECONCILIATION_QUARANTINE_ROUTE, reason: "observability_only", quarantine: envelope.quarantine_object, propagation_envelope: envelope.propagation_envelope, quarantine_hash: envelope.quarantine_hash, containment_classes: envelope.containment_classes, append_only: true, ...QUARANTINE_CONTAINMENT_FLAGS })
        if (url.pathname === RECONCILIATION_CONTAINMENT_ROUTE) return json({ status: envelope.status, route: RECONCILIATION_CONTAINMENT_ROUTE, reason: "observability_only", containment_boundary: envelope.containment_boundary, verdict: envelope.verdict_object, containment_hash: envelope.containment_hash, boundary_hash: envelope.boundary_hash, containment_classes: envelope.containment_classes, append_only: true, ...QUARANTINE_CONTAINMENT_FLAGS })
        if (url.pathname === RECONCILIATION_ISOLATION_ROUTE) return json({ status: envelope.status, route: RECONCILIATION_ISOLATION_ROUTE, reason: "observability_only", isolation_graph: envelope.isolation_graph, containment_hash: envelope.containment_hash, lineage_hash: envelope.lineage_hash, containment_classes: envelope.containment_classes, append_only: true, ...QUARANTINE_CONTAINMENT_FLAGS })
        return json({ status: envelope.status, route: RECONCILIATION_FEDERATION_BOUNDARY_ROUTE, reason: "observability_only", federated_containment: envelope.federated_containment, federation_hash: envelope.federation_hash, boundary_hash: envelope.boundary_hash, containment_classes: envelope.containment_classes, append_only: true, ...QUARANTINE_CONTAINMENT_FLAGS })
      } catch {
        return json({ status: "NULL", route: url.pathname, reason: "quarantine_containment_unavailable", containment_classes: ["CONTAINMENT_BOUNDARY_OVERFLOW"], ...QUARANTINE_CONTAINMENT_FLAGS }, 500)
      }
    }

    if (RECONCILIATION_CLOSURE_ROUTES.includes(url.pathname as any) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", ...reconciliationClosureFlags() }, 405)

    if (RECONCILIATION_CLOSURE_ROUTES.includes(url.pathname as any) && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: url.pathname, reason: "database_unavailable", ...reconciliationClosureFlags() })
        const closure = await buildRecursiveReconciliationClosureObject(env, url)
        await ensureReconciliationClosureRegistry(env)
        await appendReconciliationClosureObservation(env, closure)
        const status = closure.drift_classes.length > 0 ? "RECONCILIATION_CLOSURE_DRIFT" : "RECONCILIATION_CLOSURE_VERIFIED"
        if (url.pathname === RECONCILIATION_CLOSURE_CHECKPOINT_ROUTE) return json({ status, route: RECONCILIATION_CLOSURE_CHECKPOINT_ROUTE, reason: "observability_only", checkpoint: { closure_id: closure.closure_id, closure_hash: closure.closure_hash, deterministic_reconciliation_anchor: closure.deterministic_reconciliation_anchor, recursive_checkpoint_identity: closure.recursive_checkpoint_identity, graph_checkpoint_hash: closure.graph_checkpoint_hash, bootstrap_checkpoint_hash: closure.bootstrap_checkpoint_hash, runtime_sovereignty_checkpoint_hash: closure.runtime_sovereignty_checkpoint_hash, federation_conformance_checkpoint_hash: closure.federation_conformance_checkpoint_hash, lineage_depth: closure.lineage_depth, bounded_window: closure.bounded_window, generated_at: closure.generated_at }, drift_classes: closure.drift_classes, append_only: true, ...reconciliationClosureFlags() })
        if (url.pathname === RECONCILIATION_CLOSURE_EQUIVALENCE_ROUTE) return json({ status, route: RECONCILIATION_CLOSURE_EQUIVALENCE_ROUTE, reason: "observability_only", reconciliation_equivalence_state: closure.reconciliation_equivalence_state, closure_hash: closure.closure_hash, deterministic_reconciliation_anchor: closure.deterministic_reconciliation_anchor, recursive_checkpoint_identity: closure.recursive_checkpoint_identity, drift_classes: closure.drift_classes, append_only: true, ...reconciliationClosureFlags() })
        if (url.pathname === RECONCILIATION_CLOSURE_DRIFT_ROUTE) return json({ status, route: RECONCILIATION_CLOSURE_DRIFT_ROUTE, reason: "observability_only", drift_classes: closure.drift_classes, closure_divergence_classification: closure.drift_classes, closure_hash: closure.closure_hash, append_only: true, ...reconciliationClosureFlags() })
        return json({ status, route: RECONCILIATION_CLOSURE_ROUTE, reason: "observability_only", closure, closure_hash: closure.closure_hash, deterministic_reconciliation_anchor: closure.deterministic_reconciliation_anchor, recursive_checkpoint_identity: closure.recursive_checkpoint_identity, reconciliation_equivalence_state: closure.reconciliation_equivalence_state, drift_classes: closure.drift_classes, append_only: true, ...reconciliationClosureFlags() })
      } catch {
        return json({ status: "NULL", route: url.pathname, reason: "reconciliation_closure_unavailable", drift_classes: ["reconciliation_closure_failure"], ...reconciliationClosureFlags() })
      }
    }

    if ([GRAPH_VERIFY_ROUTE, GRAPH_TOPOLOGY_ROUTE, GRAPH_CHECKPOINT_ROUTE, GRAPH_ORPHANS_ROUTE].includes(url.pathname as any) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", ...legitimacyGraphStatusFlags() }, 405)

    if ([GRAPH_VERIFY_ROUTE, GRAPH_TOPOLOGY_ROUTE, GRAPH_CHECKPOINT_ROUTE, GRAPH_ORPHANS_ROUTE].includes(url.pathname as any) && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: url.pathname, reason: "database_unavailable", ...legitimacyGraphStatusFlags() })
        const checkpoint = await deterministicGraphTraversalEngine(env)
        const graphStatus = checkpoint.drift_classes.length > 0 ? "GRAPH_CLOSURE_DRIFT" : "GRAPH_CLOSURE_VERIFIED"
        if (url.pathname === GRAPH_TOPOLOGY_ROUTE) return json({ status: graphStatus, route: GRAPH_TOPOLOGY_ROUTE, reason: "observability_only", topology: { nodes: checkpoint.nodes, edges: checkpoint.edges, node_count: checkpoint.nodes.length, edge_count: checkpoint.edges.length }, graph_checkpoint_hash: checkpoint.graph_checkpoint_hash, graph_coherence_hash: checkpoint.graph_coherence_hash, drift_classes: checkpoint.drift_classes, ...legitimacyGraphStatusFlags(), append_only: true })
        if (url.pathname === GRAPH_CHECKPOINT_ROUTE) return json({ status: graphStatus, route: GRAPH_CHECKPOINT_ROUTE, reason: "observability_only", checkpoint: { checkpoint_id: checkpoint.checkpoint_id, graph_checkpoint_hash: checkpoint.graph_checkpoint_hash, graph_coherence_hash: checkpoint.graph_coherence_hash, node_count: checkpoint.nodes.length, edge_count: checkpoint.edges.length, orphan_count: checkpoint.orphans.length, cross_registry_replay_continuity: checkpoint.cross_registry_replay_continuity, traversal_depth_limit: checkpoint.traversal_depth_limit, generated_at: checkpoint.generated_at }, drift_classes: checkpoint.drift_classes, ...legitimacyGraphStatusFlags(), append_only: true })
        if (url.pathname === GRAPH_ORPHANS_ROUTE) return json({ status: checkpoint.orphans.length > 0 ? "GRAPH_ORPHANS_DETECTED" : "GRAPH_ORPHANS_CLEAR", route: GRAPH_ORPHANS_ROUTE, reason: "observability_only", orphans: checkpoint.orphans, orphan_count: checkpoint.orphans.length, graph_checkpoint_hash: checkpoint.graph_checkpoint_hash, drift_classes: checkpoint.drift_classes, ...legitimacyGraphStatusFlags(), append_only: true })
        return json({ status: graphStatus, route: GRAPH_VERIFY_ROUTE, reason: "observability_only", checkpoint, graph_checkpoint_hash: checkpoint.graph_checkpoint_hash, graph_coherence_hash: checkpoint.graph_coherence_hash, drift_classes: checkpoint.drift_classes, orphan_count: checkpoint.orphans.length, cross_registry_replay_continuity: checkpoint.cross_registry_replay_continuity, ...legitimacyGraphStatusFlags(), append_only: true })
      } catch {
        return json({ status: "NULL", route: url.pathname, reason: "graph_verification_unavailable", ...legitimacyGraphStatusFlags() })
      }
    }

    if (url.pathname === RUNTIME_EVOLUTION_CONSENSUS_ROUTE && request.method !== "GET") return json({ status: "NULL", route: RUNTIME_EVOLUTION_CONSENSUS_ROUTE, reason: "get_only", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true }, 405)

    if (url.pathname === RUNTIME_EVOLUTION_CONSENSUS_ROUTE && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: RUNTIME_EVOLUTION_CONSENSUS_ROUTE, reason: "database_unavailable", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
        const envelope = await buildRuntimeEvolutionConsensusEnvelope(runtimeEvolutionConsensusInputFromUrl(url))
        await appendRuntimeEvolutionConsensusObservation(env, envelope)
        return json({ status: envelope.consensus_result, route: RUNTIME_EVOLUTION_CONSENSUS_ROUTE, reason: "observability_only", envelope, drift_classes: envelope.drift_classes, consensus_result: envelope.consensus_result, canonical_hash: envelope.consensus_object.canonical_hash, replay_neutral: true, evidence_only: true, read_only: true, mutation_capable: false, execution_authority: false, remote_authority_inherited: false, runtime_mutated: false, governance_state_altered: false, append_only: true })
      } catch {
        return json({ status: "NULL", route: RUNTIME_EVOLUTION_CONSENSUS_ROUTE, reason: "consensus_unavailable", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true })
      }
    }
    if (url.pathname === EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE && request.method !== "GET") return json({ status: "NULL", route: EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE, reason: "get_only", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, authoritative: false }, 405)
    if (url.pathname === INFRASTRUCTURE_DEPENDENCY_RECONCILIATION_ROUTE && request.method !== "GET") return json({ status: "NULL", route: INFRASTRUCTURE_DEPENDENCY_RECONCILIATION_ROUTE, reason: "get_only", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, authoritative: false }, 405)
    if ([BOOTSTRAP_VERIFY_ROUTE, BOOTSTRAP_TOPOLOGY_ROUTE, BOOTSTRAP_CHECKPOINT_ROUTE].includes(url.pathname as any) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", evidence_only: true, replay_neutral: true, mutation_capable: false, remote_authority_denied: true, read_only: true }, 405)

    if (CONTINUOUS_FATE_ROUTES.includes(url.pathname as any) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", ...continuousFateFlags() }, 405)
    if (CONTINUOUS_FATE_ROUTES.includes(url.pathname as any) && request.method === "GET") {
      try {
        const generated_at = new Date().toISOString()
        const envelope = await buildContinuousFATEEnvelope(url, generated_at)
        if (!hasDb(env)) return json({ status: "NULL", route: url.pathname, reason: "database_unavailable", envelope, drift_taxonomy: continuousFateDriftTaxonomy(), stress_scenarios: envelope.scenarios, runtime_stress_checkpoint: envelope.runtime_stress_checkpoint, ...continuousFateFlags() })
        const status = envelope.drift_survivability_state === "SURVIVED" ? "CONTINUOUS_FATE_VERIFIED" : "NULL"
        if (url.pathname === "/fate/stress") return json({ status, route: url.pathname, reason: "observability_only", stress_scenarios: envelope.scenarios, deterministic_stress_hash: envelope.deterministic_stress_hash, runtime_stress_depth: envelope.runtime_stress_depth, bounded_recursive_stress_depth: CONTINUOUS_FATE_MAX_STRESS_DEPTH, deterministic_stress_replay_ordering: true, fail_closed_instability_classification: true, ...continuousFateFlags() })
        if (url.pathname === "/fate/drift") return json({ status, route: url.pathname, reason: "observability_only", drift_taxonomy: continuousFateDriftTaxonomy(), drift_classes: envelope.drift_classes, drift_survivability_state: envelope.drift_survivability_state, exact_object_mutation_verification: envelope.governance_drift_replay_object.mutation_verified, sovereignty_containment_verified: envelope.sovereignty_escape_probes.every((probe) => probe.contained), reconciliation_survivability_verification: true, ...continuousFateFlags() })
        if (url.pathname === "/fate/checkpoint") return json({ status, route: url.pathname, reason: "observability_only", checkpoint: envelope.runtime_stress_checkpoint, governance_replay_checkpoint: envelope.governance_replay_checkpoint, continuous_fate_id: envelope.continuous_fate_id, stress_window_id: envelope.stress_window_id, immutable_stress_checkpoint_persistence: true, ...continuousFateFlags() })
        if (url.pathname === "/fate/topology") return json({ status, route: url.pathname, reason: "observability_only", topology_stability_hash: envelope.topology_stability_hash, sovereignty_escape_probes: envelope.sovereignty_escape_probes, topology_drift_verification: true, hidden_route_emergence: false, ...continuousFateFlags() })
        return json({ status, route: url.pathname, reason: "observability_only", envelope, continuous_fate_id: envelope.continuous_fate_id, stress_window_id: envelope.stress_window_id, deterministic_stress_hash: envelope.deterministic_stress_hash, topology_stability_hash: envelope.topology_stability_hash, drift_survivability_state: envelope.drift_survivability_state, replay_mutation_vector_hash: envelope.replay_mutation_vector_hash, governance_replay_checkpoint: envelope.governance_replay_checkpoint, runtime_stress_depth: envelope.runtime_stress_depth, ...continuousFateFlags() })
      } catch {
        return json({ status: "NULL", route: url.pathname, reason: "continuous_fate_unavailable", ...continuousFateFlags() })
      }
    }

    if (DELEGATION_OBSERVABILITY_ROUTES.includes(url.pathname as any) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", evidence_only: true, replay_neutral: true, append_only: true, authoritative: false, mutation_capable: false, replay_consumed: false }, 405)
    if (DELEGATION_OBSERVABILITY_ROUTES.includes(url.pathname as any) && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: url.pathname, reason: "database_unavailable", evidence_only: true, replay_neutral: true, mutation_capable: false })
        await assertSchemaAvailableReadOnly(env)
        const envelope = await delegatedObservabilityEnvelope(env, url)
        const status = envelope.drift_classes.length > 0 ? "DELEGATION_DRIFT" : "DELEGATION_OBSERVED"
        if (url.pathname === DELEGATION_CHECKPOINT_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", checkpoint_hash: envelope.checkpoint_hash, drift_classes: envelope.drift_classes, evidence_only: true, replay_neutral: true, append_only: true, authoritative: false, mutation_capable: false, replay_consumed: false })
        if (url.pathname === DELEGATION_DRIFT_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", drift_classes: envelope.drift_classes, drift_taxonomy: ["delegated_lineage_drift","delegated_scope_expansion","orphaned_delegated_execution","delegated_replay_resurrection","delegated_revocation_failure","delegated_exact_object_drift","delegation_root_divergence","delegated_authority_fragmentation","recursive_delegation_instability"], evidence_only: true, replay_neutral: true, append_only: true, authoritative: false, mutation_capable: false, replay_consumed: false })
        if (url.pathname === DELEGATION_REPLAY_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", replay: envelope.replay, replay_consumed: false, evidence_only: true, replay_neutral: true, append_only: true, authoritative: false, mutation_capable: false })
        return json({ status, route: url.pathname, reason: "observability_only", envelope, checkpoint_hash: envelope.checkpoint_hash, evidence_only: true, replay_neutral: true, append_only: true, authoritative: false, mutation_capable: false, replay_consumed: false })
      } catch {
        return json({ status: "NULL", route: url.pathname, reason: "delegation_observability_unavailable", evidence_only: true, replay_neutral: true, mutation_capable: false, replay_consumed: false })
      }
    }

    if (RUNTIME_CONTAINMENT_ROUTES.includes(url.pathname as any) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", ...containmentFlags() }, 405)
    if (RUNTIME_CONTAINMENT_ROUTES.includes(url.pathname as any) && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: url.pathname, reason: "database_unavailable", ...containmentFlags() }, 500)
        await assertSchemaAvailableReadOnly(env)
        const envelope = await buildSovereigntyContainmentEnvelope(env, url)
        await appendRuntimeSurfaceContainmentCheckpoint(env, envelope)
        const status = envelope.drift_classes.length > 0 ? "NULL" : "RUNTIME_SURFACE_CONTAINED"
        if (url.pathname === RUNTIME_CONTAINMENT_ROUTES_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", route_inventory: envelope.inventory, route_surface_hash: envelope.route_surface_hash, hidden_surface_count: envelope.hidden_surface_count, drift_classes: envelope.drift_classes, append_only: true, ...containmentFlags() })
        if (url.pathname === RUNTIME_CONTAINMENT_DEPLOY_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", deployment_surface_hash: envelope.deployment_surface_hash, package_surface_hash: envelope.package_surface_hash, workflow_surfaces: envelope.inventory.workflow_surfaces, package_surfaces: envelope.inventory.package_surfaces, drift_classes: envelope.drift_classes, append_only: true, ...containmentFlags() })
        if (url.pathname === RUNTIME_CONTAINMENT_DRIFT_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", drift_classes: envelope.drift_classes, drift_taxonomy: ["hidden_execution_surface_detected", "undeclared_mutation_surface_detected", "runtime_route_containment_drift", "deployment_surface_hash_drift", "workflow_dispatch_escape_detected", "adapter_authority_escape_detected", "proofless_execution_surface_detected", "canonical_route_boundary_drift", "observability_route_execution_upgrade", "sovereignty_containment_failure"], fail_closed: envelope.drift_classes.length > 0, append_only: true, ...containmentFlags() })
        if (url.pathname === RUNTIME_CONTAINMENT_CHECKPOINT_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", checkpoint: envelope.checkpoint, containment_hash: envelope.containment_hash, runtime_sovereignty_hash: envelope.runtime_sovereignty_hash, append_only: true, ...containmentFlags() })
        return json({ status, route: url.pathname, reason: "observability_only", envelope, containment_hash: envelope.containment_hash, runtime_sovereignty_hash: envelope.runtime_sovereignty_hash, append_only: true, ...containmentFlags() })
      } catch {
        return json({ status: "NULL", route: url.pathname, reason: "sovereignty_containment_unavailable", drift_classes: ["sovereignty_containment_failure"], ...containmentFlags() }, 500)
      }
    }

    if (ROOT_AUTHORITY_OBSERVABILITY_ROUTES.includes(url.pathname as any) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", ...rootAuthorityFlags() }, 405)
    if (ROOT_AUTHORITY_OBSERVABILITY_ROUTES.includes(url.pathname as any) && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: url.pathname, reason: "database_unavailable", ...rootAuthorityFlags() }, 500)
        await assertSchemaAvailableReadOnly(env)
        const envelope = await buildRootAuthorityContainmentEnvelope(rootAuthorityInventoryFromUrl(url))
        await appendRootAuthorityObservation(env, envelope)
        const status = envelope.containment_status === "ROOT_AUTHORITY_CONTAINMENT_REQUIRED" ? "NULL" : "ROOT_AUTHORITY_CONTAINED"
        if (url.pathname === ROOT_AUTHORITY_DRIFT_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", drift: envelope.drift, drift_taxonomy: ["ROOT_DEPLOY_AUTHORITY", "ROOT_REPOSITORY_AUTHORITY", "ROOT_ENVIRONMENT_AUTHORITY", "ROOT_WORKFLOW_AUTHORITY", "ROOT_BRANCH_POLICY_AUTHORITY", "ROOT_RUNTIME_CONFIGURATION_AUTHORITY", "ROOT_FEDERATION_AUTHORITY", "ROOT_LOCAL_EXECUTION_AUTHORITY", "ROOT_PACKAGE_EXECUTION_AUTHORITY", "ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY", "UNDECLARED_ROOT_SURFACE", "SOVEREIGNTY_DRIFT_DETECTED", "ROOT_AUTHORITY_TOPOLOGY_DIVERGENCE", "ROOT_AUTHORITY_BOUNDARY_OVERFLOW", "ROOT_AUTHORITY_BYPASS_RISK", "ROOT_AUTHORITY_CONTAINMENT_REQUIRED"], merge_legitimacy: envelope.drift.merge_legitimacy, ...rootAuthorityFlags() })
        if (url.pathname === ROOT_AUTHORITY_BOUNDARY_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", boundary: envelope.boundary, containment_identity: envelope.containment_identity, merge_legitimacy: envelope.boundary.merge_legitimacy, ...rootAuthorityFlags() })
        if (url.pathname === ROOT_AUTHORITY_TOPOLOGY_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", topology_hash: envelope.topology_hash, containment_identity: envelope.containment_identity, inventory: envelope.inventory, ...rootAuthorityFlags() })
        return json({ status, route: url.pathname, reason: "observability_only", envelope, containment_status: envelope.containment_status, declared_root_surfaces: envelope.declared_root_surfaces, undeclared_root_surfaces: envelope.undeclared_root_surfaces, drift_classes: envelope.drift_classes, containment_identity: envelope.containment_identity, topology_hash: envelope.topology_hash, ...rootAuthorityFlags() })
      } catch {
        return json({ status: "NULL", route: url.pathname, reason: "root_authority_observability_unavailable", drift_classes: ["ROOT_AUTHORITY_BOUNDARY_OVERFLOW", "ROOT_AUTHORITY_BYPASS_RISK", "ROOT_AUTHORITY_CONTAINMENT_REQUIRED"], ...rootAuthorityFlags() }, 500)
      }
    }

    if ((CROSS_REGISTRY_RECONCILIATION_ROUTES as readonly string[]).includes(url.pathname) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", allowed_methods: ["GET"], ...crossRegistryRouteFlags() }, 405)
    if ((CROSS_REGISTRY_RECONCILIATION_ROUTES as readonly string[]).includes(url.pathname) && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: url.pathname, reason: "database_unavailable", ...crossRegistryRouteFlags() }, 500)
        await assertSchemaAvailableReadOnly(env)
        const generated_at = new Date().toISOString()
        const snapshot = await buildCrossRegistryReconciliationSnapshot(await fetchCrossRegistryState(env), generated_at)
        const status = snapshot.legitimacy_status === "NULL" ? "NULL" : "RECONCILED"
        if (url.pathname === CROSS_REGISTRY_RECONCILE_DRIFT_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", drift_classes: snapshot.drift_classes, drift: snapshot.drift, containment_status: snapshot.containment_status, legitimacy_status: snapshot.legitimacy_status, ...crossRegistryRouteFlags() })
        if (url.pathname === CROSS_REGISTRY_RECONCILE_LINEAGE_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", lineage_edges: snapshot.lineage_edges, lineage_graph_hash: snapshot.lineage_graph_hash, continuity_graph_hash: snapshot.continuity_graph_hash, proof_graph_hash: snapshot.proof_graph_hash, unresolved_edges: snapshot.unresolved_edges, legitimacy_status: snapshot.legitimacy_status, ...crossRegistryRouteFlags() })
        if (url.pathname === CROSS_REGISTRY_RECONCILE_EQUIVALENCE_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", equivalence: snapshot.equivalence, continuity_proof: snapshot.continuity_proof, reconciliation_equivalence_hash: snapshot.reconciliation_equivalence_hash, legitimacy_status: snapshot.legitimacy_status, ...crossRegistryRouteFlags() })
        if (url.pathname === CROSS_REGISTRY_RECONCILE_ORPHANS_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", orphaned_records: snapshot.orphaned_records, unresolved_edges: snapshot.unresolved_edges, containment_status: snapshot.containment_status, legitimacy_status: snapshot.legitimacy_status, ...crossRegistryRouteFlags() })
        return json({ status, route: url.pathname, reason: "observability_only", reconciliation: snapshot, append_only: true, ...crossRegistryRouteFlags() })
      } catch {
        return json({ status: "NULL", route: url.pathname, reason: "cross_registry_reconciliation_unavailable", containment_status: "RECONCILIATION_REQUIRED", legitimacy_status: "NULL", ...crossRegistryRouteFlags() }, 500)
      }
    }

    if ([...OBSERVER_CONSENSUS_ROUTES, ...EXTERNAL_CONFORMANCE_ROUTES].includes(url.pathname as any) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", allowed_methods: ["GET"], ...consensusRouteFlags() }, 405)

    if ([...OBSERVER_CONSENSUS_ROUTES, ...EXTERNAL_CONFORMANCE_ROUTES].includes(url.pathname as any) && request.method === "GET") {
      try {
        if (!hasDb(env)) return json({ status: "NULL", route: url.pathname, reason: "database_unavailable", drift_classes: ["GOVERNANCE_CONSENSUS_FRAGMENTATION"], legitimacy_status: null, ...consensusRouteFlags() }, 500)
        await assertSchemaAvailableReadOnly(env)
        const envelope = await buildGovernanceConsensusEnvelope(url)
        const status = envelope.observer.legitimacy_status ? "CONSENSUS_EVIDENCE_OBSERVED" : "NULL"
        if (url.pathname === OBSERVER_CONSENSUS_EQUIVALENCE_ROUTE || url.pathname === OBSERVER_CONSENSUS_EQUIVALENCE_ALIAS_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", equivalence_hash: envelope.observer.equivalence_hash, semantic_hash: envelope.observer.semantic_hash, topology_hash: envelope.observer.topology_hash, reconciliation_hash: envelope.observer.reconciliation_hash, sovereignty_hash: envelope.observer.sovereignty_hash, legitimacy_status: envelope.observer.legitimacy_status, drift_classes: envelope.observer.drift_classes, append_only: true, ...consensusRouteFlags() })
        if (url.pathname === OBSERVER_CONSENSUS_DRIFT_ROUTE) return json({ status, route: url.pathname, reason: "observability_only", drift_classes: envelope.observer.drift_classes, drift_taxonomy: CONSENSUS_DRIFT_TAXONOMY, legitimacy_status: envelope.observer.legitimacy_status, observer_divergence_authorizes_execution: false, ambiguity_result: envelope.observer.drift_classes.length > 0 ? "NULL" : "LEGITIMATE", append_only: true, ...consensusRouteFlags() })
        if (url.pathname === CONFORMANCE_RUNTIME_ROUTE || url.pathname === CONFORMANCE_EXTERNAL_ROUTE) return json({ status: String(envelope.conformance.conformance_status || "NULL") === "CONFORMANT" ? "CONFORMANCE_EVIDENCE_OBSERVED" : "NULL", route: url.pathname, reason: "observability_only", runtime_compatibility_hash: envelope.conformance.runtime_compatibility_hash, conformance: envelope.conformance, drift_classes: envelope.observer.drift_classes, legitimacy_status: envelope.observer.legitimacy_status, append_only: true, ...consensusRouteFlags() })
        if (url.pathname === CONFORMANCE_EQUIVALENCE_ROUTE) return json({ status: String(envelope.conformance.conformance_status || "NULL") === "CONFORMANT" ? "CONFORMANCE_EVIDENCE_OBSERVED" : "NULL", route: url.pathname, reason: "observability_only", checkpoint_equivalence_hash: envelope.conformance.checkpoint_equivalence_hash, semantic_envelope: envelope.semantic_envelope, drift_classes: envelope.observer.drift_classes, legitimacy_status: envelope.observer.legitimacy_status, append_only: true, ...consensusRouteFlags() })
        if (url.pathname === CONFORMANCE_CHECKPOINT_ROUTE) return json({ status: String(envelope.conformance.conformance_status || "NULL") === "CONFORMANT" ? "CONFORMANCE_EVIDENCE_OBSERVED" : "NULL", route: url.pathname, reason: "observability_only", checkpoint: envelope.portable_checkpoint, checkpoint_hash: envelope.observer.observed_checkpoint_hash, drift_classes: envelope.observer.drift_classes, legitimacy_status: envelope.observer.legitimacy_status, append_only: true, ...consensusRouteFlags() })
        return json({ status, route: url.pathname, reason: "observability_only", observer: envelope.observer, quorum: envelope.quorum, checkpoint: envelope.portable_checkpoint, append_only: true, ...consensusRouteFlags() })
      } catch {
        return json({ status: "NULL", route: url.pathname, reason: "governance_consensus_unavailable", drift_classes: ["GOVERNANCE_CONSENSUS_FRAGMENTATION"], legitimacy_status: null, ...consensusRouteFlags() }, 500)
      }
    }

    if ((TOPOLOGY_OBSERVABILITY_ROUTES as readonly string[]).includes(url.pathname) && request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", allowed_methods: ["GET"], ...topologyRouteFlags() }, 405)

    if (NON_EXECUTABLE_OBSERVABILITY_ROUTES.includes(url.pathname as any) && !(TOPOLOGY_OBSERVABILITY_ROUTES as readonly string[]).includes(url.pathname) && url.pathname !== RUNTIME_SOVEREIGNTY_ROUTE && url.pathname !== EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE && ![BOOTSTRAP_VERIFY_ROUTE, BOOTSTRAP_TOPOLOGY_ROUTE, BOOTSTRAP_CHECKPOINT_ROUTE].includes(url.pathname as any)) return json({ status: "NULL", route: url.pathname, reason: "observability_only" }, request.method === "GET" ? 200 : 405)

    const canonicalRuntimeRoute = CANONICAL_RUNTIME_ROUTES.includes(url.pathname as any)
    const governedCandidateRoute = url.pathname === OPENCLAW_GOVERN_ROUTE
    const governanceEvidenceRoute = GOVERNANCE_EVIDENCE_ROUTES.includes(url.pathname as any)
    const governedMutationRoute = canonicalRuntimeRoute || governanceEvidenceRoute || governedCandidateRoute
    const mutationEndpoint = governedMutationRoute && request.method === "POST"
    if (mutationEndpoint && !authorized(request, env)) return json({ status: "NULL", reason: "unauthorized" }, 403)

    if (!hasDb(env)) return json({ status: "NULL", reason: "database_unavailable" }, 500)

    const readOnlyObservabilityRoute = request.method === "GET" && (NON_EXECUTABLE_OBSERVABILITY_ROUTES.includes(url.pathname as any) || (TOPOLOGY_OBSERVABILITY_ROUTES as readonly string[]).includes(url.pathname) || url.pathname === RUNTIME_SOVEREIGNTY_ROUTE || url.pathname === EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE || [BOOTSTRAP_VERIFY_ROUTE, BOOTSTRAP_TOPOLOGY_ROUTE, BOOTSTRAP_CHECKPOINT_ROUTE].includes(url.pathname as any))
    try {
      if (readOnlyObservabilityRoute) await assertSchemaAvailableReadOnly(env)
      else await ensureSchema(env, { stabilizeProofRegistry: url.pathname !== "/session" })
    } catch (error) {
      if (error instanceof RuntimeSovereigntyViolationError) return json({ status: "RUNTIME_SOVEREIGNTY_VIOLATION", reason: "runtime_sovereignty_drift", drift_classes: error.drift_classes, expected_sovereignty_hash: error.expected_sovereignty_hash, actual_sovereignty_hash: error.actual_sovereignty_hash, runtime_ready: false }, 503)
      if (error instanceof BootstrapRegistryUnstableError) return json({ status: "NULL", reason: "bootstrap_registry_unstable" }, 500)
      return json({ status: "NULL", reason: schemaDiagnosticReason(error) }, 500)
    }

    const sovereigntyState = await assertRuntimeSovereigntyCanonical(env, { readOnly: readOnlyObservabilityRoute })
    if (sovereigntyState.status !== "CANONICAL") return json({ status: "RUNTIME_SOVEREIGNTY_VIOLATION", reason: "runtime_sovereignty_drift", drift_classes: sovereigntyState.drift_classes, expected_sovereignty_hash: sovereigntyState.expected_sovereignty_hash, actual_sovereignty_hash: sovereigntyState.actual_sovereignty_hash, runtime_ready: false }, 503)

    if ((TOPOLOGY_OBSERVABILITY_ROUTES as readonly string[]).includes(url.pathname)) {
      if (request.method !== "GET") return json({ status: "NULL", route: url.pathname, reason: "get_only", allowed_methods: ["GET"], ...topologyRouteFlags() }, 405)
      const generated_at = new Date(0).toISOString()
      const envelope = await buildRuntimeTopologyReconciliationEnvelope(generated_at)
      await appendRuntimeTopologySnapshot(env, envelope, new Date().toISOString())
      if (url.pathname === TOPOLOGY_FINGERPRINT_ROUTE) return json({ status: envelope.drift.classification === "TOPOLOGY_VALID" ? "TOPOLOGY_FINGERPRINTED" : "NULL", route: url.pathname, fingerprint: envelope.fingerprint, legitimacy: envelope.drift.legitimacy, ...topologyRouteFlags() })
      if (url.pathname === TOPOLOGY_DRIFT_ROUTE) return json({ status: envelope.drift.classification === "TOPOLOGY_VALID" ? "TOPOLOGY_VALID" : "NULL", route: url.pathname, drift: envelope.drift, legitimacy: envelope.drift.legitimacy, ...topologyRouteFlags() })
      if (url.pathname === TOPOLOGY_EQUIVALENCE_ROUTE) return json({ status: envelope.equivalence.equivalent ? "TOPOLOGY_EQUIVALENT" : "NULL", route: url.pathname, equivalence: envelope.equivalence, legitimacy: envelope.drift.legitimacy, ...topologyRouteFlags() })
      return json({ status: envelope.drift.classification === "TOPOLOGY_VALID" ? "TOPOLOGY_RECONCILED" : "NULL", route: url.pathname, reconciliation: envelope, legitimacy: envelope.drift.legitimacy, ...topologyRouteFlags() })
    }

    if (url.pathname === RUNTIME_SOVEREIGNTY_ROUTE && request.method !== "GET") return json({ status: "NULL", route: RUNTIME_SOVEREIGNTY_ROUTE, reason: "get_only", evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, authoritative: false }, 405)
    if (url.pathname === RUNTIME_SOVEREIGNTY_ROUTE && request.method === "GET") {
      const manifest = await runtimeSovereigntyManifestReadOnly(env)
      await appendRuntimeSovereigntyCheckpoint(env, manifest)
      return json({ status: "RUNTIME_SOVEREIGNTY_CANONICAL", route: RUNTIME_SOVEREIGNTY_ROUTE, manifest, sovereignty: sovereigntyState, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, authoritative: false, creates_authority: false, bypass_governance: false, append_only: true })
    }

    if (url.pathname === EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE && request.method === "GET") {
      const registry = await canonicalExternalAuthorityRegistry()
      const dependency = await externalAuthorityObservationFromUrl(url)
      const expected = registry.find((item) => item.external_authority_surface === dependency.external_authority_surface)
      const driftProbe = { ...dependency, creates_authority: url.searchParams.get("creates_authority") === "true", bypass_validation: url.searchParams.get("bypass_validation") === "true", mutate_legitimacy: url.searchParams.get("mutate_legitimacy") === "true", consume_replay_state: url.searchParams.get("consume_replay_state") === "true", inherit_execution_legitimacy: url.searchParams.get("inherit_execution_legitimacy") === "true", direct_deploy_allowed: url.searchParams.get("direct_deploy_allowed") === "true", deploy_capable: url.searchParams.get("deploy_capable") === "true", mutation_capable: url.searchParams.get("mutation_capable") === "true", hidden_mutation: url.searchParams.get("hidden_mutation") === "true", command: url.searchParams.get("command") || "" }
      const drift_classes = await classifyExternalAuthorityDrift(driftProbe, expected)
      const evidence_hash = await sha256Hex(canonicalize({ dependency, drift_classes }))
      const escalationProbe = ["creates_authority", "bypass_validation", "mutate_legitimacy", "consume_replay_state", "inherit_execution_legitimacy", "direct_deploy_allowed", "deploy_capable", "mutation_capable", "hidden_mutation"].some((key) => url.searchParams.get(key) === "true")
      if (!escalationProbe) await appendExternalAuthorityObservation(env, dependency, drift_classes)
      const status = drift_classes.length > 0 ? "EXTERNAL_AUTHORITY_DRIFT" : "EXTERNAL_AUTHORITY_CONTAINED"
      return json({ status, route: EXTERNAL_AUTHORITY_OBSERVABILITY_ROUTE, external_authority_registry: registry, dependency, drift_classes, evidence_hash, fail_closed: drift_classes.length > 0, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, authoritative: false, creates_authority: false, bypass_governance: false, append_only: true })
    }


    if (url.pathname === INFRASTRUCTURE_DEPENDENCY_RECONCILIATION_ROUTE && request.method === "GET") {
      const reconciliation = await buildInfrastructureDependencyReconciliation(url)
      const evidence_hashes = await Promise.all((await canonicalExternalAuthorityRegistry()).map((dependency) => appendExternalAuthorityObservation(env, dependency, [])))
      return json({ status: reconciliation.status, route: INFRASTRUCTURE_DEPENDENCY_RECONCILIATION_ROUTE, reason: "observability_only", reconciliation, external_authority_registry: reconciliation.dependencies, drift_classes: reconciliation.drift_classes, evidence_hashes, fail_closed: reconciliation.drift_classes.length > 0, evidence_only: true, read_only: true, mutation_capable: false, replay_neutral: true, authoritative: false, creates_authority: false, bypass_governance: false, append_only: true })
    }

    if ([BOOTSTRAP_VERIFY_ROUTE, BOOTSTRAP_TOPOLOGY_ROUTE, BOOTSTRAP_CHECKPOINT_ROUTE].includes(url.pathname as any) && request.method === "GET") {
      const manifest = await buildBootstrapSovereigntyManifest()
      const drift_classes = await classifyBootstrapSovereigntyDrift(url, manifest)
      const checkpoint = await buildBootstrapLineageCheckpoint(manifest, drift_classes)
      await appendBootstrapSovereigntyCheckpoint(env, checkpoint)
      const status = drift_classes.length > 0 ? "NULL" : "BOOTSTRAP_CONFORMANT"
      if (url.pathname === BOOTSTRAP_TOPOLOGY_ROUTE) return json({ status, route: BOOTSTRAP_TOPOLOGY_ROUTE, reason: "observability_only", topology: { startup_dependencies: manifest.startup_dependencies, initialization_order: manifest.initialization_order, startup_dependency_graph_hash: manifest.startup_dependency_graph_hash, startup_topology_hash: manifest.startup_topology_hash, deterministic_startup_topology_evidence: true }, checkpoint, drift_classes, append_only: true, ...bootstrapSovereigntyFlags() })
      if (url.pathname === BOOTSTRAP_CHECKPOINT_ROUTE) return json({ status, route: BOOTSTRAP_CHECKPOINT_ROUTE, reason: "observability_only", checkpoint, drift_classes, append_only: true, ...bootstrapSovereigntyFlags() })
      return json({ status, route: BOOTSTRAP_VERIFY_ROUTE, reason: "observability_only", manifest, checkpoint, drift_classes, deployment_lineage_root_verified: !drift_classes.includes("deployment_root_divergence"), initialization_replay_neutrality_verified: !drift_classes.includes("bootstrap_replay_instability"), runtime_initialization_conformant: drift_classes.length === 0, append_only: true, ...bootstrapSovereigntyFlags() })
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

    if (request.method === "POST" && !canonicalRuntimeRoute && !governedCandidateRoute) {
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
      const governed_tool_envelope_id = String(b.governed_tool_envelope_id || "")
      if (!governed_tool_envelope_id) return rejectWithTelemetry(env, { status: "NULL", reason: "governed_tool_envelope_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/authority", indicator: "governed_tool_envelope_missing" }, drift_class: "authority_drift" })
      const continuity_id = String(b.continuity_id || "")
      if (!continuity_id) return rejectWithTelemetry(env, { status: "NULL", reason: "missing_continuity_id" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/authority", session_id }, drift_class: "authority_drift" })
      const continuity = await activeContinuity(env, continuity_id, session, decision_id)
      if (!continuity) return rejectWithTelemetry(env, { status: "NULL", reason: "invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/authority", session_id, continuity_id }, drift_class: "authority_drift" })
      const currentContinuityIdentity = await resolveCurrentContinuityIdentity(env, session)
      if (!currentContinuityIdentity) return rejectWithTelemetry(env, { status: "NULL", reason: "missing_continuity_identity" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "CRITICAL", payload: { route: "/authority", session_id, continuity_id, indicator: "missing_current_continuity_identity" }, drift_class: "authority_drift" })
      if (String(currentContinuityIdentity.identity_id || "") !== String(session.identity_id || "") || String(currentContinuityIdentity.continuity_id || "") !== String(continuity_id || "")) {
        return rejectWithTelemetry(env, { status: "NULL", reason: "continuity_identity_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "CRITICAL", payload: { route: "/authority", session_id, continuity_id, expected_continuity_id: currentContinuityIdentity.continuity_id, expected_identity_id: currentContinuityIdentity.identity_id, indicator: "stale_or_detached_continuity_identity" }, drift_class: "authority_drift" })
      }
      const baseScope = canonicalRecord(b.scope || {})
      const rec: any = { authority_id: crypto.randomUUID(), decision_id, identity_id: String(session.identity_id || ""), session_id, continuity_id, owner: String(b.owner || "unknown"), intent: String(b.intent || "deploy_production"), scope: JSON.stringify(baseScope), constraints: JSON.stringify(b.constraints || {}), expiry: String(b.expiry || new Date(Date.now()+3600_000).toISOString()), status: "ACTIVE", created_at: new Date().toISOString() }
      const delegated = await buildDelegatedAuthorityForIssuance(env, b, rec)
      if (!delegated.ok) return rejectWithTelemetry(env, { status: "NULL", reason: delegated.reason }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/authority", session_id, continuity_id, indicator: delegated.reason }, drift_class: delegated.drift_class })
      if (delegated.object) {
        rec.delegated_authority_id = delegated.object.delegated_authority_id
        rec.parent_authority_id = delegated.object.parent_authority_id
        rec.delegation_depth = String(delegated.object.delegation_depth)
        rec.delegation_scope_subset = canonicalize(delegated.object.delegation_scope_subset)
        rec.delegation_expiry = delegated.object.delegation_expiry
        rec.delegation_lineage_hash = delegated.object.delegation_lineage_hash
        rec.delegation_root_hash = delegated.object.delegation_root_hash
        rec.delegated_replay_chain_hash = delegated.object.delegated_replay_chain_hash
        rec.scope = canonicalize({ ...baseScope, delegated_authority_id: rec.delegated_authority_id, parent_authority_id: rec.parent_authority_id, delegation_depth: rec.delegation_depth, delegation_scope_subset: delegated.object.delegation_scope_subset, delegation_expiry: rec.delegation_expiry, delegation_lineage_hash: rec.delegation_lineage_hash, delegation_root_hash: rec.delegation_root_hash, delegated_replay_chain_hash: rec.delegated_replay_chain_hash })
      }
      await env.DB.prepare(`INSERT INTO authority_registry (authority_id,decision_id,identity_id,session_id,continuity_id,owner,intent,scope,constraints,expiry,status,created_at,delegated_authority_id,parent_authority_id,delegation_depth,delegation_scope_subset,delegation_expiry,delegation_lineage_hash,delegation_root_hash,delegated_replay_chain_hash,governed_tool_envelope_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)`).bind(rec.authority_id,rec.decision_id,rec.identity_id,rec.session_id,rec.continuity_id,rec.owner,rec.intent,rec.scope,rec.constraints,rec.expiry,rec.status,rec.created_at,rec.delegated_authority_id || "",rec.parent_authority_id || "",rec.delegation_depth || "",rec.delegation_scope_subset || "",rec.delegation_expiry || "",rec.delegation_lineage_hash || "",rec.delegation_root_hash || "",rec.delegated_replay_chain_hash || "", governed_tool_envelope_id).run()
      if (delegated.object) await appendDelegatedAuthorityObject(env, delegated.object, rec.created_at)
      await emitTelemetry(env, { event_type: "AUTHORITY_CREATED", decision_id: rec.decision_id, authority_id: rec.authority_id, severity: "INFO", payload: { route: "/authority", session_id, continuity_id, authority_status: "ACTIVE", delegated_authority_id: rec.delegated_authority_id || null } })
      return json(rec)
    }

    if (url.pathname === "/compile" && request.method === "POST") {
      try {
        const b = await body(request)
        const decision_id = String(b.decision_id || "")
        const envelopeLink = await verifyGovernedToolEnvelopeLinkage(env, decision_id, "/compile")
        if (!envelopeLink.ok) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: envelopeLink.reason }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/compile", indicator: envelopeLink.reason }, drift_class: "authority_drift" })
        const compileSnapshot = executionSnapshotFrom(b)
        const missingCompileSnapshotFields = missingExecutionSnapshotFields(compileSnapshot)
        if (!decision_id) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "missing_decision_id" }, { event_type: "VALIDATION_REJECTED", severity: "WARN", payload: { route: "/compile", indicator: "missing_decision_id" }, drift_class: "registry_drift" })
        if (missingCompileSnapshotFields.length) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "execution_snapshot_missing_fields" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/compile", indicator: "execution_snapshot_missing_fields", missing_fields: missingCompileSnapshotFields }, drift_class: "workflow_source_drift" })

        const authorityHasStatus = await hasColumn(env, "authority_registry", "status")
        const authorityHasDecision = await hasColumn(env, "authority_registry", "decision_id")
        if (!authorityHasStatus || !authorityHasDecision) {
          return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "schema_incompatible_authority_registry" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "CRITICAL", payload: { route: "/compile" }, drift_class: "registry_drift" })
        }
        const aeoHasHash = await hasColumn(env, "aeo_registry", "validated_object_hash")
        if (!aeoHasHash) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "schema_incompatible_aeo_registry" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "CRITICAL", payload: { route: "/compile" }, drift_class: "registry_drift" })

        const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
        if (!authority) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "authority_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/compile" }, drift_class: "authority_drift" })
        const authorityStatus = String(authority.status || "")
        if (isExpired(authority.expiry)) {
          return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "authority_expired" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", authority_status: authority.status, indicator: "expired_authority_blocked" }, drift_class: "authority_drift" })
        }
        if (authorityStatus === "REVOKED") {
          return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "authority_revoked" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", authority_status: authority.status, indicator: "revoked_authority_blocked" }, drift_class: "authority_drift" })
        }
        if (authorityStatus === "CONSUMED") {
          return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "authority_consumed" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", authority_status: authority.status, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
        }
        if (authorityStatus !== "ACTIVE") {
          return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "authority_not_active" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", authority_status: authority.status, indicator: "authority_not_active_at_compile" }, drift_class: "authority_drift" })
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
          const validated_execution_snapshot = await sha256Hex(canonicalize({ decision_id, validated_object_hash: storedHash, ...compileSnapshot }))
          await emitTelemetry(env, { event_type: "AEO_COMPILED", decision_id, authority_id: String(first.authority_id || ""), severity: "INFO", payload: { route: "/compile", validated_object_hash: storedHash, validated_execution_snapshot, indicator: "existing_canonical_aeo_reused" } })
          return json({ status: "COMPILED", decision_id, validated_object_hash: storedHash, validated_execution_snapshot, canonical_aeo: canonicalAeo })
        }

        const canonical_aeo = toCanonicalAeo({ intent: authority.intent, scope: JSON.parse(String(authority.scope || "{}")), validation: { workflow: GOVERNED_WORKFLOW }, target, finality: { proof_required: true } })
        if (!canonical_aeo) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "invalid_canonical_aeo" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile" }, drift_class: "registry_drift" })
        const canonical_aeo_json = canonicalize(canonical_aeo)
        const validated_object_hash = await sha256Hex(canonical_aeo_json)
        const validated_execution_snapshot = await sha256Hex(canonicalize({ decision_id, validated_object_hash, ...compileSnapshot }))
        const preoLineage = await validatePreoLineage(env, { decision_id, validated_object_hash, authority, required: requirePreoLineage })
        if (preoLineage !== "OK") return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: preoLineage }, { event_type: preoLineage === "preo_hash_mismatch" ? "HASH_MISMATCH" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", validated_object_hash, policy: REQUIRE_PREO_LINEAGE, required: requirePreoLineage, indicator: preoLineage }, drift_class: preoLineage === "preo_hash_mismatch" ? "hash_drift" : "registry_drift" })
        await env.DB.prepare(`INSERT INTO aeo_registry (aeo_id,authority_id,decision_id,continuity_id,canonical_aeo,validated_object_hash,status,created_at,workflow_integrity_hash,delegated_authority_id,delegation_lineage_hash,delegation_root_hash,delegated_replay_chain_hash,governed_tool_envelope_id) VALUES (?1,?2,?3,?4,?5,?6,'COMPILED',?7,?8,?9,?10,?11,?12,?13)`).bind(crypto.randomUUID(), authority.authority_id, decision_id, String(authority.continuity_id || ""), canonical_aeo_json, validated_object_hash, new Date().toISOString(), String(compileSnapshot.workflow_hash || ""), String(authority.delegated_authority_id || ""), String(authority.delegation_lineage_hash || ""), String(authority.delegation_root_hash || ""), String(authority.delegated_replay_chain_hash || ""), String(authority.governed_tool_envelope_id || "")).run()
        await emitTelemetry(env, { event_type: "AEO_COMPILED", decision_id, authority_id: String(authority.authority_id || ""), severity: "INFO", payload: { route: "/compile", validated_object_hash, validated_execution_snapshot } })
        return json({ status: "COMPILED", decision_id, validated_object_hash, validated_execution_snapshot, canonical_aeo: JSON.parse(canonical_aeo_json) })
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


    if (url.pathname === "/govern" && request.method === "POST") {
      const body = await request.json().catch(() => null)
      const nonce = String(request.headers.get("X-Nonce") || "")
      const nonce_domain = String(request.headers.get("X-Nonce-Domain") || "openclaw")
      const parsed = parseGovernCandidate(body)
      const candidate = parsed.ok ? parsed.candidate : { intent: "", scope: {}, target: {}, finality: {} }
      const candidate_canonical = canonicalize(candidate)
      const candidate_hash = await sha256Hex(candidate_canonical)
      const timestamp = new Date().toISOString()
      let result: GovernResult = parsed.ok ? "VALID_CANDIDATE" : "NULL"
      let reason = parsed.ok ? "" : "malformed_candidate"
      if (!nonce) {
        result = "NULL"
        reason = "missing_nonce"
      }
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS govern_nonce_registry (nonce TEXT NOT NULL, nonce_domain TEXT NOT NULL, candidate_hash TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (nonce, nonce_domain))`).run()
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS govern_evidence_registry (evidence_id TEXT PRIMARY KEY, candidate_hash TEXT NOT NULL, nonce TEXT NOT NULL, result TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL)`).run()
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS governed_tool_envelope_registry (envelope_id TEXT PRIMARY KEY, candidate_hash TEXT NOT NULL, nonce_binding TEXT NOT NULL UNIQUE, policy_digest TEXT NOT NULL, topology_digest TEXT NOT NULL, lineage_pointers TEXT NOT NULL, timestamp TEXT NOT NULL, non_operative TEXT NOT NULL CHECK (non_operative IN ('true','false')), tool_surface_descriptor TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS govern_envelope_registry (envelope_id TEXT PRIMARY KEY, envelope_hash TEXT NOT NULL, candidate_hash TEXT NOT NULL, candidate_canonical TEXT NOT NULL, nonce TEXT NOT NULL, nonce_domain TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
      if (result === "VALID_CANDIDATE") {
        const nonceExisting = await env.DB.prepare(`SELECT candidate_hash FROM govern_nonce_registry WHERE nonce=?1 AND nonce_domain=?2`).bind(nonce, nonce_domain).first<any>()
        if (nonceExisting) {
          if (String(nonceExisting.candidate_hash || "") !== candidate_hash) {
            result = "NULL"
            reason = "nonce_rebinding"
          } else {
            result = "NULL"
            reason = "nonce_replay"
          }
        }
      }
      if (result === "VALID_CANDIDATE") {
        const nonceInsert = await env.DB.prepare(`INSERT OR IGNORE INTO govern_nonce_registry (nonce, nonce_domain, candidate_hash, created_at) VALUES (?1,?2,?3,?4)`).bind(nonce, nonce_domain, candidate_hash, timestamp).run()
        if ((nonceInsert.meta?.changes || 0) === 0) {
          result = "NULL"
          reason = "nonce_replay"
        }
      }
      const evidence_id = await sha256Hex(canonicalize({ candidate_hash, nonce, nonce_domain, timestamp, result, reason }))
      await env.DB.prepare(`INSERT OR IGNORE INTO govern_evidence_registry (evidence_id, candidate_hash, nonce, result, reason, created_at) VALUES (?1,?2,?3,?4,?5,?6)`).bind(evidence_id, candidate_hash, nonce, result, reason || null, timestamp).run()
      const envelope: GovernedToolEnvelope = {
        candidate_hash,
        nonce_binding: nonce,
        policy_digest: await sha256Hex(canonicalize({ intent: candidate.intent, finality: candidate.finality })),
        topology_digest: await sha256Hex(canonicalize({ scope: candidate.scope, target: candidate.target, route: "/govern" })),
        lineage_pointers: { decision_id: String((body as any)?.decision_id || ""), continuity_id: String((body as any)?.continuity_id || "") },
        timestamp,
        non_operative: true,
        tool_surface_descriptor: { route: "/govern", workflow: GOVERNED_WORKFLOW, executable: false },
      }
      const envelope_id = await sha256Hex(canonicalize(envelope))
      await env.DB.prepare(`INSERT OR IGNORE INTO governed_tool_envelope_registry (envelope_id,candidate_hash,nonce_binding,policy_digest,topology_digest,lineage_pointers,timestamp,non_operative,tool_surface_descriptor,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'true',?8,?9)`)
        .bind(envelope_id, envelope.candidate_hash, envelope.nonce_binding, envelope.policy_digest, envelope.topology_digest, canonicalize(envelope.lineage_pointers), envelope.timestamp, canonicalize(envelope.tool_surface_descriptor), timestamp).run()
      const envelope_status = result
      const envelope_reason = reason || (result === "VALID_CANDIDATE" ? "valid_candidate" : "malformed_candidate")
      const envelope_hash = await sha256Hex(canonicalize({ candidate_hash, nonce, nonce_domain, route: "/govern", status: envelope_status }))
      const envelopePersist = await env.DB.prepare(`INSERT OR IGNORE INTO govern_envelope_registry (envelope_id, envelope_hash, candidate_hash, candidate_canonical, nonce, nonce_domain, status, reason, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`)
        .bind(envelope_id, envelope_hash, candidate_hash, candidate_canonical, nonce, nonce_domain, envelope_status, envelope_reason, timestamp).run()
      if ((envelopePersist.meta?.changes || 0) === 0) {
        result = "NULL"
        reason = "envelope_persist_failed"
      }
      try { await emitTelemetry(env, { event_type: result === "VALID_CANDIDATE" ? "VALIDATION_GRANTED" : "VALIDATION_REJECTED", severity: result === "VALID_CANDIDATE" ? "INFO" : "WARN", payload: { route: "/govern", candidate_hash, nonce, timestamp, result, reason: reason || null, non_operative: true } }) } catch {}
      return json({ status: result, reason: reason || (result === "VALID_CANDIDATE" ? "valid_candidate" : "malformed_candidate"), envelope_id, envelope_hash, nonce_domain, evidence: { candidate_hash, nonce, nonce_domain, timestamp, result, ...(reason ? { reason } : {}) } }, 200)
    }

    if (url.pathname === "/validate" && request.method === "POST") {
      const b = await body(request); const decision_id = String(b.decision_id || ""); const validated_object_hash = String(b.validated_object_hash || ""); const invocation_nonce = String(b.invocation_nonce || ""); const environment = b.environment; const session_id = String(b.session_id || "")
      const envelopeLink = await verifyGovernedToolEnvelopeLinkage(env, decision_id, "/validate")
      if (!envelopeLink.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:envelopeLink.reason }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/validate", indicator: envelopeLink.reason }, drift_class: "authority_drift" })
      if (!decision_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_decision_id" }, { event_type: "VALIDATION_REJECTED", severity: "WARN", payload: { route: "/validate" }, drift_class: "hash_drift" })
      if (!validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_validated_object_hash" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/validate", indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (!invocation_nonce) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_invocation_nonce" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "WARN", payload: { route: "/validate", validated_object_hash }, drift_class: "replay_drift" })
      const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
      if (!authority) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/validate" }, drift_class: "authority_drift" })
      if (isExpired(authority.expiry)) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_expired" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", authority_status: authority.status, indicator: "expired_authority_blocked" }, drift_class: "authority_drift" })
      if (String(authority.status || "") === "REVOKED") return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_revoked" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", authority_status: authority.status, indicator: "revoked_authority_blocked" }, drift_class: "authority_drift" })
      if (!["ACTIVE","VALIDATED","RESERVED"].includes(String(authority.status))) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_unusable" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", authority_status: authority.status, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", session_id }, drift_class: "authority_drift" })
      if (String(authority.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_session_id: authority.session_id, provided_session_id: session_id }, drift_class: "authority_drift" })
      const continuity = await activeContinuity(env, String(authority.continuity_id || ""), session, String(decision_id || ""))
      if (!continuity) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", continuity_id: authority.continuity_id || null }, drift_class: "authority_drift" })
      const currentContinuityIdentity = await resolveCurrentContinuityIdentity(env, session)
      if (!currentContinuityIdentity) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_continuity_identity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/validate", continuity_id: authority.continuity_id || null, indicator: "missing_current_continuity_identity" }, drift_class: "authority_drift" })
      if (String(currentContinuityIdentity.identity_id || "") !== String(session.identity_id || "") || String(currentContinuityIdentity.continuity_id || "") !== String(authority.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_identity_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/validate", continuity_id: authority.continuity_id || null, expected_continuity_id: currentContinuityIdentity.continuity_id, expected_identity_id: currentContinuityIdentity.identity_id, indicator: "stale_authority_continuity_identity" }, drift_class: "authority_drift" })
      if (String(authority.identity_id || "") !== String(session.identity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"identity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_identity_id: session.identity_id, provided_identity_id: authority.identity_id }, drift_class: "authority_drift" })
      const compiled = await env.DB.prepare(`SELECT * FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND status='COMPILED'`).bind(decision_id, validated_object_hash).first<any>()
      const validateSurface = classifyToolSurface({ execution_surface: "deploy_runtime" })
      const validatePolicyClass = validateSurface.policy_class
      const validatePolicyClassDigest = await policyClassDigest(validatePolicyClass)
      const validatePolicy = validatePolicyClass === "TOOL_UNKNOWN" ? null : POLICY_REGISTRY[validatePolicyClass]
      if (!validatePolicy || !validatePolicyClassDigest) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"policy_class_invalid" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", policy_class: validatePolicyClass, indicator: "policy_class_missing_or_invalid", denial_reason: "policy_class_missing_or_invalid" }, drift_class: "registry_drift" })
      if (!compiled) {
        const compiledForOtherLineage = await env.DB.prepare(`SELECT decision_id,authority_id,continuity_id FROM aeo_registry WHERE validated_object_hash=?1 AND status='COMPILED'`).bind(validated_object_hash).first<any>()
        if (compiledForOtherLineage) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", validated_object_hash, expected_decision_id: decision_id, provided_decision_id: String(compiledForOtherLineage.decision_id || ""), indicator: "non_canonical_validation_lineage" }, drift_class: "hash_drift" })
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", validated_object_hash, indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      }
      let compiledAeo: any
      try { compiledAeo = JSON.parse(String(compiled.canonical_aeo || "{}")) } catch { compiledAeo = null }
      const compiledCanonicalAeo = toCanonicalAeo(compiledAeo)
      const canonicalCompiledJson = compiledCanonicalAeo ? canonicalize(compiledCanonicalAeo) : ""
      const compiledHash = compiledCanonicalAeo ? await sha256Hex(canonicalize(compiledCanonicalAeo)) : ""
      if (!compiledCanonicalAeo || compiledHash !== validated_object_hash || compiledHash !== String(compiled.validated_object_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_hash: validated_object_hash, actual_hash: compiledHash, indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (String(compiled.canonical_aeo || "") !== canonicalCompiledJson) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_hash: validated_object_hash, actual_hash: compiledHash, indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (String(compiled.authority_id || "") !== String(authority.authority_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_authority_id: authority.authority_id, provided_authority_id: compiled.authority_id, indicator: "non_canonical_validation_lineage" }, drift_class: "hash_drift" })
      if (String(compiled.continuity_id || "") !== String(authority.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_continuity_id: authority.continuity_id, provided_continuity_id: compiled.continuity_id, indicator: "non_canonical_validation_lineage" }, drift_class: "hash_drift" })
      if (String(compiled.delegated_authority_id || "") !== String(authority.delegated_authority_id || "") || String(compiled.delegated_replay_chain_hash || "") !== String(authority.delegated_replay_chain_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", delegated_authority_id: String(authority.delegated_authority_id || ""), indicator: "non_canonical_validation_lineage" }, drift_class: "hash_drift" })
      const delegatedValidation = await validateDelegatedAuthorityLineage(env, authority, compiledCanonicalAeo)
      if (!delegatedValidation.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: delegatedValidation.reason }, { event_type: delegatedValidation.drift_class === "delegated_replay_resurrection" ? "REPLAY_BLOCKED" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", delegated_authority_id: String(authority.delegated_authority_id || ""), indicator: delegatedValidation.reason }, drift_class: delegatedValidation.drift_class })
      const target = compiledCanonicalAeo.target
      const authorityScope = canonicalRecord(JSON.parse(String(authority.scope || "{}")))
      const compiledScope = canonicalRecord(compiledCanonicalAeo.scope)
      if (canonicalize(authorityScope) !== canonicalize(compiledScope)) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"scope_constraints_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", indicator: "authority_scope_widening" }, drift_class: "registry_drift" })
      if (compiledCanonicalAeo.finality?.proof_required !== true) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"proof_requirement_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", indicator: "proof_requirement_missing" }, drift_class: "registry_drift" })
      const constraints = canonicalDeployTarget(JSON.parse(String(authority.constraints)))
      if (String(target.repo)!==constraints.repo || String(target.branch)!==constraints.branch || String(target.workflow)!==constraints.workflow) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"scope_constraints_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", indicator: "non_canonical_workflow" }, drift_class: "registry_drift" })
      if (target.workflow !== GOVERNED_WORKFLOW) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"workflow_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", workflow: target.workflow, indicator: "unmanaged_deploy_surface" }, drift_class: "registry_drift" })
      const insert = await env.DB.prepare(`INSERT OR IGNORE INTO invocation_registry (decision_id,validated_object_hash,invocation_nonce,continuity_id,status,created_at) VALUES (?1,?2,?3,?4,'RESERVED',?5)`).bind(decision_id,validated_object_hash,invocation_nonce,String(authority.continuity_id || ""),new Date().toISOString()).run()
      if ((insert.meta?.changes||0)===0) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"nonce_used" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", validated_object_hash, invocation_nonce, indicator: "reused_nonce" }, drift_class: "replay_drift" })
      const parent_compilation_hash = await sha256Hex(canonicalCompiledJson)
      const validationLineageOriginHash = canonicalLineageHash({ lineage_stage: "validate", decision_id, validated_object_hash, parent_hash: parent_compilation_hash })
      const validationLineageVerification = verifyLineageOrigin({ stage: "validate", decision_id, validated_object_hash, lineage_stage: "validate", lineage_origin_hash: validationLineageOriginHash, parent_compilation_hash, compiled_hash: parent_compilation_hash })
      if (!validationLineageVerification.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: validationLineageVerification.reason }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", indicator: validationLineageVerification.reason }, drift_class: "hash_drift" })
      await env.DB.prepare(`INSERT INTO validation_registry (validation_id,session_id,continuity_id,decision_id,validated_object_hash,invocation_nonce,environment,result,reason,status,created_at,delegated_authority_id,delegated_replay_chain_hash,parent_compilation_hash,workflow_integrity_hash,lineage_stage,lineage_origin_hash) VALUES (?1,?2,?3,?4,?5,?6,?7,'VALID',NULL,'VALID',?8,?9,?10,?11,?12,'validate',?13)`).bind(crypto.randomUUID(),session_id,String(authority.continuity_id || ""),decision_id,validated_object_hash,invocation_nonce,String(environment||""),new Date().toISOString(),String(authority.delegated_authority_id || ""),String(authority.delegated_replay_chain_hash || ""),parent_compilation_hash,String(compiled.workflow_integrity_hash || ""),validationLineageOriginHash).run()
      await env.DB.prepare(`UPDATE authority_registry SET status='RESERVED' WHERE decision_id=?1 AND status IN ('ACTIVE','VALIDATED','RESERVED')`).bind(decision_id).run()
      await env.DB.prepare(`UPDATE governed_tool_envelope_registry SET non_operative='false' WHERE envelope_id=(SELECT governed_tool_envelope_id FROM authority_registry WHERE decision_id=?1)`).bind(decision_id).run()
      await emitTelemetry(env, { event_type: "VALIDATION_GRANTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "INFO", payload: { route: "/validate", validated_object_hash, invocation_nonce, authority_status: "RESERVED" } })
      await emitInstallBaseTelemetryEvidenceBestEffort(env, { event_type: "validated_execution", decision_id, authority_id: String(authority.authority_id || ""), lineage_origin_hash: validationLineageOriginHash, lineage_origin_match: "MATCH", payload: { event_type: "validated_execution", continuity_id: String(authority.continuity_id || ""), validated_object_hash, execution_surface: "deploy_runtime", result: "NULL" } })
      const _topology_present = false // topology infrastructure pending (#1346+); fail-closed
      const _predicate_snapshot = { V: true, A: true, U: true, P: true, R: true, T: false, C: true, Q: false, G: false, L: false, X: false }
      const _classification = classifyFromPredicates(_predicate_snapshot, _topology_present)
      return json({ status:"VALID", result:"VALID", session_id, validated_object_hash, invocation_nonce, policy_class: validatePolicyClass, policy_class_digest: validatePolicyClassDigest, policy_predicate_outcomes: { authority_active: true, continuity_identity_match: true, compiled_hash_match: true, delegated_authority_lineage_valid: true, topology_visible: _topology_present }, denial_reason: null, classification_evidence: { classification: _classification, predicate_snapshot: _predicate_snapshot, topology_present: _topology_present } })
    }

    if (url.pathname === "/execute" && request.method === "POST") {
      const b = await body(request); const decision_id = String(b.decision_id || ""); const validated_object_hash = String(b.validated_object_hash || ""); const invocation_nonce = String(b.invocation_nonce || ""); const session_id = String(b.session_id || ""); const provenance = deploymentProvenanceFrom(b); const executionSnapshot = executionSnapshotFrom(b)
      const envelopeLink = await verifyGovernedToolEnvelopeLinkage(env, decision_id, "/execute")
      if (!envelopeLink.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: envelopeLink.reason }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", indicator: envelopeLink.reason }, drift_class: "authority_drift" })
      await emitTelemetry(env, { event_type: "EXECUTION_STARTED", decision_id, severity: "INFO", payload: { route: "/execute", validated_object_hash, invocation_nonce } })
      if (!decision_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_decision_id" }, { event_type: "VALIDATION_REJECTED", severity: "WARN", payload: { route: "/execute" }, drift_class: "execution_drift" })
      if (!validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_validated_object_hash" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/execute", indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (!invocation_nonce) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_invocation_nonce" }, { event_type: "REPLAY_BLOCKED", decision_id, severity: "HIGH", payload: { route: "/execute", validated_object_hash, indicator: "missing_nonce" }, drift_class: "replay_drift" })
      const validation = await env.DB.prepare(`SELECT * FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3 AND result='VALID' AND status='VALID'`).bind(decision_id,validated_object_hash,invocation_nonce).first<any>()
      if (!validation) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/execute", expected_hash: validated_object_hash, indicator: "validation_lineage_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (!isFresh(String(validation.created_at || ""), VALIDATION_FRESHNESS_WINDOW_MS)) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"stale_validation" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", validation_created_at: validation.created_at || null, freshness_window_ms: VALIDATION_FRESHNESS_WINDOW_MS, indicator: "stale_validation_blocked_at_execution" }, drift_class: "execution_drift" })
      if (String(validation.decision_id || "") !== decision_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/execute", expected_decision_id: decision_id, provided_decision_id: validation.decision_id, indicator: "validation_lineage_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (String(validation.validated_object_hash || "") !== validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/execute", expected_hash: validated_object_hash, provided_hash: validation.validated_object_hash, indicator: "validation_lineage_missing_or_mismatched" }, drift_class: "hash_drift" })
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", session_id, validated_object_hash, invocation_nonce }, drift_class: "execution_drift" })
      if (String(validation.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/execute", expected_session_id: validation.session_id, provided_session_id: session_id, validated_object_hash, invocation_nonce, indicator: "validation_lineage_missing_or_mismatched" }, drift_class: "hash_drift" })
      const inv = await env.DB.prepare(`SELECT * FROM invocation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3`).bind(decision_id,validated_object_hash,invocation_nonce).first<any>()
      if (!inv || inv.status!=="RESERVED") return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"nonce_not_reserved" }, { event_type: "REPLAY_BLOCKED", decision_id, severity: "HIGH", payload: { route: "/execute", validated_object_hash, invocation_nonce, invocation_status: inv?.status || null, indicator: "reused_nonce" }, drift_class: "replay_drift" })
      const proofReplay = await env.DB.prepare(`SELECT proof_id FROM proof_registry WHERE decision_id=?1 AND validated_object_hash=?2 ORDER BY created_at ASC, proof_id ASC LIMIT 1`).bind(decision_id,validated_object_hash).first<any>()
      if (proofReplay) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"proof_replay" }, { event_type: "REPLAY_BLOCKED", decision_id, proof_id: String(proofReplay.proof_id || ""), severity: "HIGH", payload: { route: "/execute", validated_object_hash, invocation_nonce, indicator: "proof_already_exists" }, drift_class: "replay_drift" })
      const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
      if (!authority || !["RESERVED","VALIDATED"].includes(String(authority.status))) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_not_reserved" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority?.authority_id || ""), severity: "HIGH", payload: { route: "/execute", authority_status: authority?.status || null, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      await emitInstallBaseTelemetryEvidenceBestEffort(env, { event_type: "governed_execution_attempted", decision_id, authority_id: String(authority.authority_id || ""), payload: { event_type: "governed_execution_attempted", continuity_id: String(authority.continuity_id || ""), validated_object_hash, execution_surface: "deploy_runtime", result: "NULL" } })
      if (isExpired(String(authority.expiry || ""))) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_expired" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority?.authority_id || ""), severity: "HIGH", payload: { route: "/execute", authority_status: authority?.status || null, indicator: "authority_expired_after_validation" }, drift_class: "authority_drift" })
      const missingExecutionSnapshot = missingExecutionSnapshotFields(executionSnapshot)
      if (missingExecutionSnapshot.length) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"execution_snapshot_missing_fields" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", indicator: "execution_snapshot_missing_fields", missing_fields: missingExecutionSnapshot }, drift_class: "workflow_source_drift" })
      if (String(authority.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_session_id: authority.session_id, provided_session_id: session_id }, drift_class: "authority_drift" })
      const continuity = await activeContinuity(env, String(authority.continuity_id || ""), session, String(decision_id || ""))
      if (!continuity) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", continuity_id: authority.continuity_id || null, indicator: "orphaned_execution_prevented" }, drift_class: "execution_drift" })
      const currentContinuityIdentity = await resolveCurrentContinuityIdentity(env, session)
      if (!currentContinuityIdentity) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_continuity_identity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/execute", continuity_id: authority.continuity_id || null, indicator: "missing_current_continuity_identity" }, drift_class: "execution_drift" })
      if (String(currentContinuityIdentity.identity_id || "") !== String(session.identity_id || "") || String(currentContinuityIdentity.continuity_id || "") !== String(authority.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_identity_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/execute", continuity_id: authority.continuity_id || null, expected_continuity_id: currentContinuityIdentity.continuity_id, expected_identity_id: currentContinuityIdentity.identity_id, indicator: "stale_validation_continuity_identity" }, drift_class: "execution_drift" })
      if (String(validation.continuity_id || "") !== String(authority.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_continuity_id: authority.continuity_id, provided_continuity_id: validation.continuity_id, indicator: "validation_lineage_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (String(validation.delegated_authority_id || "") !== String(authority.delegated_authority_id || "") || String(validation.delegated_replay_chain_hash || "") !== String(authority.delegated_replay_chain_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", delegated_authority_id: String(authority.delegated_authority_id || ""), indicator: "validation_lineage_missing_or_mismatched" }, drift_class: "hash_drift" })
      const expectedValidationHash = await sha256Hex(canonicalize({ validation_id: String(validation.validation_id || ""), decision_id, validated_object_hash, invocation_nonce }))
      const executionLineageCheck = verifyLineageOrigin({ stage: "execute", decision_id, validated_object_hash, lineage_stage: "execute", lineage_origin_hash: canonicalLineageHash({ lineage_stage: "execute", decision_id, validated_object_hash, parent_hash: expectedValidationHash }), parent_validation_hash: expectedValidationHash, validation_hash: expectedValidationHash })
      if (!executionLineageCheck.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: executionLineageCheck.reason }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", indicator: executionLineageCheck.reason }, drift_class: "execution_drift" })
      const replay = await env.DB.prepare(`SELECT execution_id FROM execution_registry WHERE decision_id=?1 AND validated_object_hash=?2`).bind(decision_id,validated_object_hash).first<any>()
      if (replay) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"replay_detected" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), execution_id: String(replay.execution_id || ""), severity: "HIGH", payload: { route: "/execute", validated_object_hash, invocation_nonce, indicator: "duplicate_execution" }, drift_class: "replay_drift" })
      const compiled = await env.DB.prepare(`SELECT canonical_aeo,validated_object_hash,continuity_id,status FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND status='COMPILED'`).bind(decision_id,validated_object_hash).first<any>()
      let executionAeo: any
      try { executionAeo = JSON.parse(String(compiled?.canonical_aeo || "{}")) } catch { executionAeo = null }
      const executionCanonicalAeo = toCanonicalAeo(executionAeo)
      const execHash = executionCanonicalAeo ? await sha256Hex(canonicalize(executionCanonicalAeo)) : ""
      if (!compiled || !executionCanonicalAeo || execHash !== validated_object_hash || execHash !== String(compiled.validated_object_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_hash: validated_object_hash, actual_hash: execHash, indicator: "execution_hash_mismatch" }, drift_class: "hash_drift" })
      if (String(validation.validated_object_hash || "") !== execHash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_hash: String(validation.validated_object_hash || ""), actual_hash: execHash, indicator: "validated_object_execution_mismatch" }, drift_class: "hash_drift" })
      if (String(compiled.continuity_id || "") !== String(authority.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_continuity_id: authority.continuity_id, provided_continuity_id: compiled.continuity_id, indicator: "non_canonical_validation_lineage" }, drift_class: "execution_drift" })
      if (String(compiled.status || "") !== "COMPILED") return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"policy_invalid" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", compiled_status: compiled.status || null, indicator: "policy_invalid_at_execution" }, drift_class: "execution_drift" })
      const compiledCanonicalHash = await sha256Hex(canonicalize(executionCanonicalAeo))
      const validationLineageCheck = verifyLineageOrigin({
        stage: "validate",
        decision_id,
        validated_object_hash,
        lineage_stage: String(validation.lineage_stage || ""),
        lineage_origin_hash: String(validation.lineage_origin_hash || ""),
        parent_compilation_hash: String(validation.parent_compilation_hash || ""),
        compiled_hash: compiledCanonicalHash
      })
      if (!validationLineageCheck.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: validationLineageCheck.reason }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", indicator: validationLineageCheck.reason }, drift_class: "execution_drift" })
      const delegatedExecution = await validateDelegatedAuthorityLineage(env, authority, executionCanonicalAeo)
      if (!delegatedExecution.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: delegatedExecution.reason }, { event_type: delegatedExecution.drift_class === "delegated_replay_resurrection" ? "REPLAY_BLOCKED" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", delegated_authority_id: String(authority.delegated_authority_id || ""), indicator: delegatedExecution.reason }, drift_class: delegatedExecution.drift_class })
      const provenanceValidation = await validateDeploymentProvenance(env, { route: "/execute", decision_id, validated_object_hash, authority, compiledCanonicalAeo: executionCanonicalAeo, provenance })
      if (!provenanceValidation.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: provenanceValidation.reason }, { event_type: provenanceValidation.drift_class === "workflow_source_drift" ? "HASH_MISMATCH" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { ...provenanceValidation.payload, validated_object_hash }, drift_class: provenanceValidation.drift_class })
      const attestationValidation = await validateRequestProvenanceAttestation(env, b, {
        decision_id,
        validated_object_hash,
        workflow_run_id: provenance.workflow_run_id,
        workflow_sha: provenance.workflow_sha,
        canonical_aeo_hash: execHash,
        expected_signer_identity: String(authority.identity_id || ""),
        hmac_secret: String(env.PROVENANCE_HMAC_SECRET || "")
      })
      if (!attestationValidation.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: attestationValidation.reason }, { event_type: attestationValidation.drift_class === "replay_drift" ? "REPLAY_BLOCKED" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", ...attestationValidation.payload, validated_object_hash }, drift_class: attestationValidation.drift_class })
      if (!String(validation.workflow_integrity_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"workflow_integrity_drift" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/execute", indicator: "missing_validated_workflow_integrity" }, drift_class: "workflow_source_drift" })
      if (String(executionSnapshot.workflow_hash || "") !== String(validation.workflow_integrity_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"workflow_integrity_drift" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/execute", indicator: "workflow_integrity_drift", expected_workflow_integrity_hash: String(validation.workflow_integrity_hash || ""), provided_workflow_integrity_hash: String(executionSnapshot.workflow_hash || "") }, drift_class: "workflow_source_drift" })
      if (provenance.source_tree_hash !== executionSnapshot.repository_tree_hash || provenance.workflow_sha !== executionSnapshot.workflow_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"execution_snapshot_hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/execute", indicator: "compile_execution_divergence", expected_tree_hash: executionSnapshot.repository_tree_hash, actual_tree_hash: provenance.source_tree_hash, expected_workflow_hash: executionSnapshot.workflow_hash, actual_workflow_hash: provenance.workflow_sha }, drift_class: "hash_drift" })
      const execution_id = crypto.randomUUID()
      try {
        const parent_validation_hash = await sha256Hex(canonicalize({ validation_id: String(validation.validation_id || ""), decision_id, validated_object_hash, invocation_nonce }))
        const executionLineageOriginHash = canonicalLineageHash({ lineage_stage: "execute", decision_id, validated_object_hash, parent_hash: parent_validation_hash })
        const executionWrite = await env.DB.prepare(`INSERT INTO execution_registry (execution_id,session_id,decision_id,validated_object_hash,invocation_nonce,status,created_at,continuity_id,repository,branch,pull_request_id,merge_commit_sha,source_tree_hash,workflow_run_id,workflow_sha,workflow_integrity_hash,delegated_authority_id,delegated_replay_chain_hash,delegation_lineage_hash,delegation_root_hash,parent_validation_hash,lineage_stage,lineage_origin_hash)
          SELECT ?1,?2,?3,?4,?5,'EXECUTED',?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,'execute',?21
          WHERE EXISTS (SELECT 1 FROM continuity_registry c WHERE c.continuity_id=?7 AND c.status='ACTIVE' AND c.revoked_at IS NULL AND c.expires_at>?6)
            AND EXISTS (SELECT 1 FROM authority_registry a WHERE a.decision_id=?3 AND a.session_id=?2 AND a.continuity_id=?7 AND a.status IN ('RESERVED','VALIDATED'))
            AND EXISTS (SELECT 1 FROM validation_registry v WHERE v.decision_id=?3 AND v.validated_object_hash=?4 AND v.invocation_nonce=?5 AND v.session_id=?2 AND v.continuity_id=?7 AND v.status='VALID' AND v.result='VALID')
            AND EXISTS (SELECT 1 FROM invocation_registry i WHERE i.decision_id=?3 AND i.validated_object_hash=?4 AND i.invocation_nonce=?5 AND i.continuity_id=?7 AND i.status='RESERVED')`).bind(execution_id, authority.session_id, decision_id, validated_object_hash, invocation_nonce, new Date().toISOString(), String(authority.continuity_id || ""), provenance.repository, provenance.branch, provenance.pull_request_id, provenance.merge_commit_sha, provenance.source_tree_hash, provenance.workflow_run_id, provenance.workflow_sha, String(validation.workflow_integrity_hash || ""), String(authority.delegated_authority_id || ""), String(authority.delegated_replay_chain_hash || ""), String(authority.delegation_lineage_hash || ""), String(authority.delegation_root_hash || ""), parent_validation_hash, executionLineageOriginHash).run()
        if ((executionWrite.meta?.changes || 0) !== 1) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"revoked_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/execute", continuity_id: authority.continuity_id || null, indicator: "execution_blocked_by_revocation_closure_barrier" }, drift_class: "execution_drift" })
      } catch {
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"replayed_provenance" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, severity: "HIGH", payload: { route: "/execute", workflow_run_id: provenance.workflow_run_id, indicator: "duplicate_workflow_run" }, drift_class: "replay_drift" })
      }
      await env.DB.prepare(`UPDATE invocation_registry SET status='EXECUTED' WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3`).bind(decision_id,validated_object_hash,invocation_nonce).run()
      await env.DB.prepare(`INSERT OR IGNORE INTO execution_snapshot_registry (snapshot_id,decision_id,continuity_id,authority_id,repository_tree_hash,workflow_hash,governance_hash,topology_hash,runtime_surface_hash,schema_set_hash,workflow_identity,validated_object_hash,invocation_nonce,replay_epoch,status,execution_id,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,'EXECUTED',?15,?16)`).bind(crypto.randomUUID(),decision_id,String(authority.continuity_id || ""),String(authority.authority_id || ""),executionSnapshot.repository_tree_hash,executionSnapshot.workflow_hash,executionSnapshot.governance_hash,executionSnapshot.topology_hash,executionSnapshot.runtime_surface_hash,executionSnapshot.schema_set_hash,executionSnapshot.workflow_identity,validated_object_hash,invocation_nonce,executionSnapshot.replay_epoch,execution_id,new Date().toISOString()).run()
      await env.DB.prepare(`UPDATE authority_registry SET status='EXECUTED' WHERE decision_id=?1`).bind(decision_id).run()
      await emitTelemetry(env, { event_type: "EXECUTION_COMPLETED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, severity: "INFO", payload: { route: "/execute", validated_object_hash, invocation_nonce, authority_status: "EXECUTED" } })
      await emitInstallBaseTelemetryEvidenceBestEffort(env, { event_type: "governed_execution_completed", decision_id, authority_id: String(authority.authority_id || ""), execution_id, payload: { event_type: "governed_execution_completed", continuity_id: String(authority.continuity_id || ""), validated_object_hash, execution_surface: "deploy_runtime", result: "NULL" } })
      await emitInstallBaseTelemetryEvidenceBestEffort(env, { event_type: "execution_surface_observed", decision_id, authority_id: String(authority.authority_id || ""), execution_id, payload: { event_type: "execution_surface_observed", execution_surface: "deploy_runtime", result: "NULL" } })
      return json({ status:"EXECUTED", session_id, execution_id })
    }

    if (url.pathname === "/proof" && request.method === "POST") {
      const b = await body(request)
      const provenance = deploymentProvenanceFrom(b)
      const execution_id = String(b.execution_id || "")
      const decision_id = String(b.decision_id || "")
      const envelopeLink = await verifyGovernedToolEnvelopeLinkage(env, decision_id, "/proof")
      if (!envelopeLink.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: envelopeLink.reason }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/proof", indicator: envelopeLink.reason }, drift_class: "authority_drift" })
      const validated_object_hash = String(b.validated_object_hash || "")
      const invocation_nonce = String(b.invocation_nonce || "")
      const session_id = String(b.session_id || "")
      if (!execution_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_execution_id" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "WARN", payload: { route: "/proof" }, drift_class: "proof_drift" })
      if (!decision_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_decision_id" }, { event_type: "VALIDATION_REJECTED", execution_id, severity: "WARN", payload: { route: "/proof" }, drift_class: "proof_drift" })
      if (!validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_validated_object_hash" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "WARN", payload: { route: "/proof" }, drift_class: "proof_drift" })
      if (!invocation_nonce) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_invocation_nonce" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", validated_object_hash, indicator: "missing_nonce" }, drift_class: "replay_drift" })
      const proofEarlyValidation = await env.DB.prepare(`SELECT created_at FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3 AND status='VALID' AND result='VALID'`).bind(decision_id,validated_object_hash,invocation_nonce).first<any>()
      if (proofEarlyValidation && !isFresh(String(proofEarlyValidation.created_at || ""), VALIDATION_FRESHNESS_WINDOW_MS)) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"stale_validation" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", validation_created_at: proofEarlyValidation.created_at || null, freshness_window_ms: VALIDATION_FRESHNESS_WINDOW_MS, indicator: "stale_validation_blocked_at_proof" }, drift_class: "proof_drift" })
      const proof_id = crypto.randomUUID()
      const decision_hash = proofDecisionHash(decision_id, validated_object_hash)
      const executionSnapshot = await env.DB.prepare(`SELECT * FROM execution_snapshot_registry WHERE execution_id=?1 AND decision_id=?2 AND validated_object_hash=?3 AND invocation_nonce=?4 AND status='EXECUTED' ORDER BY created_at DESC LIMIT 1`).bind(execution_id,decision_id,validated_object_hash,invocation_nonce).first<any>()
      if (!executionSnapshot) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_execution_snapshot" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "CRITICAL", payload: { route: "/proof", indicator: "missing_execution_snapshot" }, drift_class: "proof_drift" })
      const created_at = new Date().toISOString()
      let execution: any = null
      let session: any = null
      let authority: any = null
      let validation: any = null
      let proofInserted = 0
      let authorityConsumed = 0
      let proofBoundary: any[] = []
      try {
        const proofReads = await env.DB.batch<any>([
          env.DB.prepare(`SELECT * FROM execution_registry WHERE execution_id=?1 AND decision_id=?2 AND validated_object_hash=?3 AND invocation_nonce=?4 AND status='EXECUTED'`).bind(execution_id,decision_id,validated_object_hash,invocation_nonce),
          env.DB.prepare(`SELECT * FROM session_registry WHERE session_id=?1 AND continuity_status='ACTIVE' AND expires_at>?2`).bind(session_id,created_at),
          env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id),
          env.DB.prepare(`SELECT * FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND session_id=?3 AND invocation_nonce=?4 AND status='VALID' AND result='VALID' ORDER BY created_at DESC LIMIT 1`).bind(decision_id,validated_object_hash,session_id,invocation_nonce)
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
        if (executionById && String(executionById.decision_id || "") !== decision_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"execution_decision_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", expected_decision_id: executionById.decision_id, provided_decision_id: decision_id, indicator: "proof_execution_decision_mismatch" }, drift_class: "proof_drift" })
        if (executionById && String(executionById.validated_object_hash || "") !== validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"execution_hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", expected_hash: executionById.validated_object_hash, provided_hash: validated_object_hash, indicator: "proof_hash_mismatch" }, drift_class: "proof_drift" })
        if (executionById && String(executionById.invocation_nonce || "") !== invocation_nonce) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invocation_lineage_mismatch" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", expected_invocation_nonce: executionById.invocation_nonce, provided_invocation_nonce: invocation_nonce, indicator: "proof_execution_invocation_mismatch" }, drift_class: "replay_drift" })
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"execution_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", validated_object_hash, indicator: "proof_without_execute" }, drift_class: "proof_drift" })
      }
      if (!session) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", session_id }, drift_class: "proof_drift" })
      if (String(execution.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", expected_session_id: execution.session_id, provided_session_id: session_id }, drift_class: "proof_drift" })
      if (Object.hasOwn(b, "continuity_id") && String(b.continuity_id || "") && String(b.continuity_id || "") !== String(execution.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", expected_continuity_id: execution.continuity_id, provided_continuity_id: b.continuity_id, indicator: "proof_execution_continuity_mismatch" }, drift_class: "proof_drift" })
      if (String(execution.invocation_nonce || "") !== invocation_nonce) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invocation_lineage_mismatch" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", expected_invocation_nonce: execution.invocation_nonce, provided_invocation_nonce: invocation_nonce, indicator: "proof_execution_invocation_mismatch" }, drift_class: "replay_drift" })
      if (!authority) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_not_executed" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, authority_id: "", severity: "HIGH", payload: { route: "/proof", authority_status: null, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      if (String(authority.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_session_id: authority.session_id, provided_session_id: session_id }, drift_class: "authority_drift" })
      if (String(authority.continuity_id || "") !== String(execution.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_continuity_id: authority.continuity_id, provided_continuity_id: execution.continuity_id }, drift_class: "proof_drift" })
      if (!validation || String(validation.continuity_id || "") !== String(execution.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_continuity_id: execution.continuity_id, provided_continuity_id: validation?.continuity_id || null }, drift_class: "proof_drift" })
      if (!isFresh(String(validation.created_at || ""), VALIDATION_FRESHNESS_WINDOW_MS)) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"stale_validation" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", validation_created_at: validation?.created_at || null, freshness_window_ms: VALIDATION_FRESHNESS_WINDOW_MS, indicator: "stale_validation_blocked_at_proof" }, drift_class: "proof_drift" })
      if (!isFresh(String(execution.created_at || ""), PROOF_FRESHNESS_WINDOW_MS)) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"proof_freshness_expired" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", execution_created_at: execution?.created_at || null, freshness_window_ms: PROOF_FRESHNESS_WINDOW_MS, indicator: "proof_freshness_window_expired" }, drift_class: "proof_drift" })
      if (String(execution.validated_object_hash || "") !== validated_object_hash || String(validation?.validated_object_hash || "") !== validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, execution_id, severity: "CRITICAL", payload: { route: "/proof", expected_hash: validated_object_hash, execution_hash: String(execution.validated_object_hash || ""), validation_hash: String(validation?.validated_object_hash || ""), indicator: "validated_object_execution_mismatch" }, drift_class: "hash_drift" })
      const validationOriginHashAtProof = await sha256Hex(canonicalize({ validation_id: String(validation?.validation_id || ""), decision_id, validated_object_hash, invocation_nonce }))
      const executionLineageOriginCheck = verifyLineageOrigin({
        stage: "execute",
        decision_id,
        validated_object_hash,
        lineage_stage: String(execution.lineage_stage || ""),
        lineage_origin_hash: String(execution.lineage_origin_hash || ""),
        parent_validation_hash: String(execution.parent_validation_hash || ""),
        validation_hash: validationOriginHashAtProof
      })
      if (!executionLineageOriginCheck.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: executionLineageOriginCheck.reason }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", indicator: executionLineageOriginCheck.reason }, drift_class: "proof_drift" })
      if (String(authority.status) !== "EXECUTED") return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_not_executed" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", authority_status: authority.status || null, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      const executionContinuityRevoked = await continuityIsRevokedOrAmbiguous(env, String(execution.continuity_id || ""))
      if (executionContinuityRevoked) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"revoked_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/proof", continuity_id: execution.continuity_id || null, indicator: "proof_lookup_blocked_by_revocation" }, drift_class: "proof_drift" })
      const existingProofs = await env.DB.prepare(`SELECT p.* FROM proof_registry p JOIN execution_registry e ON e.execution_id=p.execution_id WHERE p.decision_hash=?1 AND p.execution_id=?2 AND p.decision_id=?3 AND p.validated_object_hash=?4 AND e.invocation_nonce=?5 ORDER BY p.created_at ASC, p.proof_id ASC LIMIT 3`).bind(decision_hash,execution_id,decision_id,validated_object_hash,invocation_nonce).all<any>()
      const canonicalProofResolution = resolveCanonicalProofEvidence(existingProofs.results || [], execution)
      const proofCandidates = canonicalProofResolution.candidates
      const canonicalProofCandidates = proofCandidates.filter((proof: any) => proofExecutionLineageMatches(proof, execution))
      if (proofCandidates.length > 1 || (proofCandidates.length === 1 && canonicalProofCandidates.length !== 1)) {
        const ambiguityReplay = proofAmbiguityReplayEvidence(proofCandidates.length, canonicalProofCandidates.length)
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"proof_lineage_ambiguous", replay: ambiguityReplay }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, severity: "CRITICAL", payload: { route: "/proof", validated_object_hash, invocation_nonce: String(execution.invocation_nonce || ""), indicator: "duplicate_or_ambiguous_proof_lineage", classification: "PROOF_AMBIGUITY_FAIL_CLOSED_CONFIRMED", drift_classes: ["replay_drift", "proof_lineage_drift"], candidate_count: proofCandidates.length, canonical_candidate_count: canonicalProofCandidates.length }, drift_class: "proof_lineage_drift" })
      }
      const canonicalExistingProof = canonicalProofResolution.canonical_proof
      if (canonicalExistingProof) {
        const canonicalEvidenceReplay = proofReplayEvidence(canonicalExistingProof, proofCandidates.length)
        await emitTelemetry(env, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, proof_id: String(canonicalExistingProof.proof_id || ""), severity: "HIGH", payload: { route: "/proof", validated_object_hash, indicator: "duplicate_proof_or_transaction_conflict", replay: canonicalEvidenceReplay } })
        await recordDrift(env, { drift_class: "replay_drift", severity: "HIGH", decision_id, execution_id, payload: { route: "/proof", validated_object_hash, indicator: "duplicate_proof_or_transaction_conflict", replay: canonicalEvidenceReplay } })
        return json({ status:"NULL", result:"INVALID", reason:"proof_replay", proof_id: String(canonicalExistingProof.proof_id || ""), replay: canonicalEvidenceReplay })
      }
      const continuity = await activeContinuity(env, String(execution.continuity_id || ""), session, decision_id)
      if (!continuity) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", continuity_id: execution.continuity_id || null, indicator: "proof_lineage_invalid" }, drift_class: "proof_drift" })
      const currentContinuityIdentity = await resolveCurrentContinuityIdentity(env, session)
      if (!currentContinuityIdentity) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_continuity_identity" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/proof", continuity_id: execution.continuity_id || null, indicator: "missing_current_continuity_identity" }, drift_class: "proof_drift" })
      if (String(currentContinuityIdentity.identity_id || "") !== String(session.identity_id || "") || String(currentContinuityIdentity.continuity_id || "") !== String(execution.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_identity_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/proof", continuity_id: execution.continuity_id || null, expected_continuity_id: currentContinuityIdentity.continuity_id, expected_identity_id: currentContinuityIdentity.identity_id, indicator: "stale_execution_continuity_identity" }, drift_class: "proof_drift" })
      const compiled = await env.DB.prepare(`SELECT canonical_aeo,validated_object_hash,continuity_id,status FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND status='COMPILED'`).bind(decision_id,validated_object_hash).first<any>()
      let proofAeo: any
      try { proofAeo = JSON.parse(String(compiled?.canonical_aeo || "{}")) } catch { proofAeo = null }
      const proofCanonicalAeo = toCanonicalAeo(proofAeo)
      const proofHash = proofCanonicalAeo ? await sha256Hex(canonicalize(proofCanonicalAeo)) : ""
      if (!compiled || !proofCanonicalAeo || proofHash !== validated_object_hash || proofHash !== String(compiled.validated_object_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_hash: validated_object_hash, actual_hash: proofHash, indicator: "proof_hash_mismatch" }, drift_class: "hash_drift" })
      const delegatedProof = await validateDelegatedAuthorityLineage(env, authority, proofCanonicalAeo)
      if (!delegatedProof.ok && delegatedProof.reason !== "replayed_delegated_authority") return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: delegatedProof.reason }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", delegated_authority_id: String(authority.delegated_authority_id || ""), indicator: delegatedProof.reason }, drift_class: delegatedProof.drift_class })
      const provenanceValidation = await validateDeploymentProvenance(env, { route: "/proof", decision_id, validated_object_hash, authority, compiledCanonicalAeo: proofCanonicalAeo, provenance, execution })
      if (!provenanceValidation.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: provenanceValidation.reason }, { event_type: provenanceValidation.drift_class === "workflow_source_drift" ? "HASH_MISMATCH" : "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { ...provenanceValidation.payload, validated_object_hash }, drift_class: provenanceValidation.drift_class })
      const attestationValidation = await validateRequestProvenanceAttestation(env, b, {
        decision_id,
        validated_object_hash,
        workflow_run_id: provenance.workflow_run_id,
        workflow_sha: provenance.workflow_sha,
        canonical_aeo_hash: proofHash,
        expected_signer_identity: String(authority.identity_id || ""),
        hmac_secret: String(env.PROVENANCE_HMAC_SECRET || "")
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
        validation_status: String(validation.status || ""),
        delegated_authority_id: String(authority.delegated_authority_id || ""),
        parent_authority_id: String(authority.parent_authority_id || ""),
        delegation_lineage_hash: String(authority.delegation_lineage_hash || ""),
        delegation_root_hash: String(authority.delegation_root_hash || ""),
        delegated_replay_chain_hash: String(authority.delegated_replay_chain_hash || "")
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
        execution_status: String(execution.status || ""),
        delegated_authority_id: String(execution.delegated_authority_id || ""),
        delegation_lineage_hash: String(execution.delegation_lineage_hash || ""),
        delegation_root_hash: String(execution.delegation_root_hash || ""),
        delegated_replay_chain_hash: String(execution.delegated_replay_chain_hash || "")
      })
      const parent_execution_hash = await sha256Hex(canonicalize({ execution_id, decision_id, validated_object_hash, invocation_nonce: String(execution.invocation_nonce || "") }))
      const executionClosureHash = await sha256Hex(canonicalize({ execution_id, decision_id, validated_object_hash, invocation_nonce, execution_snapshot_hash: await sha256Hex(canonicalize(executionSnapshot)), workflow_identity: String(executionSnapshot.workflow_identity || "") }))
      const proofLineageOriginHash = canonicalLineageHash({ lineage_stage: "proof", decision_id, validated_object_hash, parent_hash: parent_execution_hash })
      if (!String(validation.workflow_integrity_hash || "") || !String(execution.workflow_integrity_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"workflow_integrity_drift" }, { event_type: "HASH_MISMATCH", decision_id, execution_id, severity: "CRITICAL", payload: { route: "/proof", indicator: "missing_workflow_integrity_lineage" }, drift_class: "workflow_source_drift" })
      if (String(executionSnapshot.workflow_hash || "") !== String(validation.workflow_integrity_hash || "") || String(executionSnapshot.workflow_hash || "") !== String(execution.workflow_integrity_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"workflow_integrity_drift" }, { event_type: "HASH_MISMATCH", decision_id, execution_id, severity: "CRITICAL", payload: { route: "/proof", indicator: "workflow_integrity_drift", expected_validation_workflow_integrity_hash: String(validation.workflow_integrity_hash || ""), expected_execution_workflow_integrity_hash: String(execution.workflow_integrity_hash || ""), provided_workflow_integrity_hash: String(executionSnapshot.workflow_hash || "") }, drift_class: "workflow_source_drift" })
      const proofLineageCheck = verifyLineageOrigin({ stage: "proof", decision_id, validated_object_hash, lineage_stage: "proof", lineage_origin_hash: proofLineageOriginHash, parent_execution_hash, execution_hash: parent_execution_hash })
      if (!proofLineageCheck.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: proofLineageCheck.reason }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", indicator: proofLineageCheck.reason }, drift_class: "proof_drift" })
      try {
        const proofStatements = [
          env.DB.prepare(`INSERT OR IGNORE INTO proof_registry (proof_id,identity_id,session_id,continuity_id,continuity_hash,execution_id,decision_id,validated_object_hash,decision_hash,authority_lineage,execution_lineage,surface,run_id,commit_sha,workflow,environment,created_at,repository,branch,pull_request_id,merge_commit_sha,source_tree_hash,workflow_run_id,workflow_sha,workflow_integrity_hash,delegated_authority_id,delegated_replay_chain_hash,delegation_lineage_hash,delegation_root_hash,parent_execution_hash,lineage_stage,lineage_origin_hash)
            SELECT ?1, s.identity_id, ?2, a.continuity_id, c.continuity_hash, ?3, ?4, ?5, ?22, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?26, a.delegated_authority_id, a.delegated_replay_chain_hash, a.delegation_lineage_hash, a.delegation_root_hash, ?23, 'proof', ?24
            FROM authority_registry a JOIN session_registry s ON s.session_id=a.session_id JOIN continuity_registry c ON c.continuity_id=a.continuity_id
            WHERE a.decision_id=?4 AND a.session_id=?2 AND a.status='EXECUTED' AND c.status='ACTIVE' AND c.expires_at>?13
              AND a.continuity_id=?14
              AND EXISTS (SELECT 1 FROM execution_registry WHERE execution_id=?3 AND decision_id=?4 AND validated_object_hash=?5 AND invocation_nonce=?25 AND session_id=?2 AND continuity_id=a.continuity_id AND status='EXECUTED')
              AND EXISTS (SELECT 1 FROM validation_registry WHERE decision_id=?4 AND validated_object_hash=?5 AND invocation_nonce=?25 AND session_id=?2 AND continuity_id=a.continuity_id AND status='VALID' AND result='VALID')
              AND s.continuity_status='ACTIVE' AND s.expires_at>?13`).bind(proof_id,session_id,execution_id,decision_id,validated_object_hash,authorityLineage,executionLineage,String(b.surface||""),provenance.workflow_run_id,provenance.workflow_sha,String(b.workflow||GOVERNED_WORKFLOW),String(b.environment||""),created_at,String(execution.continuity_id || ""),provenance.repository,provenance.branch,provenance.pull_request_id,provenance.merge_commit_sha,provenance.source_tree_hash,provenance.workflow_run_id,provenance.workflow_sha,decision_hash,parent_execution_hash,proofLineageOriginHash,invocation_nonce,String(execution.workflow_integrity_hash || "")),
          env.DB.prepare(`UPDATE authority_registry SET status='CONSUMED' WHERE decision_id=?1 AND session_id=?2 AND status='EXECUTED' AND continuity_id=?5 AND EXISTS (SELECT 1 FROM proof_registry p JOIN execution_registry e ON e.execution_id=p.execution_id WHERE p.proof_id=?3 AND p.decision_id=?1 AND p.validated_object_hash=?4 AND e.invocation_nonce=?6)`).bind(decision_id,session_id,proof_id,validated_object_hash,String(execution.continuity_id || ""),invocation_nonce),
          env.DB.prepare(`INSERT OR IGNORE INTO proof_propagation_outbox (outbox_id,proof_id,decision_id,execution_id,validated_object_hash,event_type,payload,status,publish_attempts,created_at,replay_neutral,fail_closed) SELECT ?1,?2,?3,?4,?5,'LEGITIMACY_PROOF_PERSISTED',?6,'PENDING',0,?7,'true','true' WHERE EXISTS (SELECT 1 FROM proof_registry p JOIN execution_registry e ON e.execution_id=p.execution_id WHERE p.proof_id=?2 AND p.decision_id=?3 AND p.execution_id=?4 AND p.validated_object_hash=?5 AND e.invocation_nonce=?8)`).bind(crypto.randomUUID(),proof_id,decision_id,execution_id,validated_object_hash,canonicalize({ proof_id, decision_id, execution_id, validated_object_hash, invocation_nonce, route: "/proof", lineage_stage: "proof", execution_closure_hash: executionClosureHash }),created_at,invocation_nonce)
        ]
        if (validatedAttestation) {
          proofStatements.push(env.DB.prepare(`INSERT INTO attestation_registry (attestation_id,envelope_hash,payload_hash,payload_type,signer_identity,decision_id,validated_object_hash,workflow_run_id,workflow_sha,canonical_aeo_hash,transparency_log_id,transparency_integrated_time,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'VALIDATED',?13)`).bind(crypto.randomUUID(), validatedAttestation.envelope_hash, validatedAttestation.payload_hash, validatedAttestation.payload_type, validatedAttestation.signer_identity, validatedAttestation.decision_id, validatedAttestation.validated_object_hash, validatedAttestation.workflow_run_id, validatedAttestation.workflow_sha, validatedAttestation.canonical_aeo_hash, validatedAttestation.transparency_log_id, validatedAttestation.transparency_integrated_time, created_at))
        }
        proofBoundary = await env.DB.batch<any>(proofStatements)
        proofInserted = proofBoundary[0]?.meta?.changes || 0
        authorityConsumed = proofBoundary[1]?.meta?.changes || 0
        if (proofInserted === 0) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"proof_replay" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, proof_id, severity: "HIGH", payload: { route: "/proof", validated_object_hash, indicator: "duplicate_proof_or_transaction_conflict" }, drift_class: "replay_drift" })
      } catch {
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"proof_replay" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, proof_id, severity: "HIGH", payload: { route: "/proof", validated_object_hash, indicator: "duplicate_proof_or_transaction_conflict" }, drift_class: "replay_drift" })
      }
      const outboxQueued = proofBoundary[2]?.meta?.changes || 0
      await env.DB.prepare(`UPDATE execution_snapshot_registry SET status='PROVEN', proof_id=?2 WHERE execution_id=?1 AND status='EXECUTED'`).bind(execution_id,proof_id).run()
      if (proofInserted !== 1 || authorityConsumed !== 1) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_consumption_failed" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, proof_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/proof", proof_inserted: proofInserted, authority_consumed: authorityConsumed }, drift_class: "authority_drift" })
      if (outboxQueued !== 1) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"proof_outbox_enqueue_failed" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, proof_id, severity: "CRITICAL", payload: { route: "/proof", outbox_queued: outboxQueued }, drift_class: "proof_drift" })
      await emitTelemetry(env, { event_type: "PROOF_PERSISTED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, proof_id, severity: "INFO", payload: { route: "/proof", session_id, validated_object_hash, repository: provenance.repository, branch: provenance.branch, workflow_run_id: provenance.workflow_run_id } })
      await emitInstallBaseTelemetryEvidenceBestEffort(env, { event_type: "proof_generated", decision_id, authority_id: String(authority.authority_id || ""), execution_id, proof_id, payload: { event_type: "proof_generated", continuity_id: String(authority.continuity_id || ""), validated_object_hash, execution_surface: "deploy_runtime", result: "NULL" } })
      await emitTelemetry(env, { event_type: "AUTHORITY_CONSUMED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, proof_id, severity: "INFO", payload: { route: "/proof", authority_status: "CONSUMED" } })
      return json({ status:"PROVEN", result:"OK", proof_id, proof: { proof_id, identity_id: String(authority.identity_id || ""), session_id, continuity_id: String(authority.continuity_id || ""), execution_id, decision_id, validated_object_hash, repository: provenance.repository, branch: provenance.branch, pull_request_id: provenance.pull_request_id, merge_commit_sha: provenance.merge_commit_sha, source_tree_hash: provenance.source_tree_hash, workflow_run_id: provenance.workflow_run_id, workflow_sha: provenance.workflow_sha } })
    }

    return json({ status: "NULL", reason: "not_found" }, 404)
    } catch {
      return json({ status: "NULL", reason: "runtime_exception" }, 500)
    }
  }
}
