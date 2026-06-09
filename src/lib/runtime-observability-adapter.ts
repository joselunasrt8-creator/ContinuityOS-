import { canonicalize } from "../canonical.js"

type Env = { DB: D1Database }

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

type TelemetryEventType = "SESSION_CREATED" | "CONTINUITY_CREATED" | "AUTHORITY_CREATED" | "AEO_COMPILED" | "VALIDATION_GRANTED" | "VALIDATION_REJECTED" | "EXECUTION_STARTED" | "EXECUTION_COMPLETED" | "PROOF_PERSISTED" | "REPLAY_BLOCKED" | "HASH_MISMATCH" | "AUTHORITY_CONSUMED" | "INSTALL_BASE_TELEMETRY_WRITE_FAILED"
type InstallBaseTelemetryEventType = "governed_execution_attempted" | "governed_execution_completed" | "validated_execution" | "proof_generated" | "execution_surface_observed" | "invalid_execution_blocked" | "replay_rejected" | "hash_mismatch_rejected" | "expired_authority_rejected" | "policy_violation_rejected" | "continuity_rejected" | "orphaned_lineage_observed" | "revocation_propagation_observed" | "continuity_expiry_rejected" | "stale_lineage_rejected" | "reconciliation_failure_detected" | "distributed_disagreement_observed" | "quorum_collapse_observed" | "temporal_divergence_observed" | "proof_lineage_conflict_observed" | "proof_rejected" | "workflow_integrity_drift"

export async function emitBootstrapDiagnostic(env: Env, event_type: BootstrapDiagnosticEvent) {
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

export async function emitTelemetry(env: Env, event: {
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

export async function emitInstallBaseTelemetryEvidence(env: Env, event: {
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

export async function emitInstallBaseTelemetryEvidenceBestEffort(env: Env, event: {
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

export function deterministicRatio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Number((numerator / denominator).toFixed(12))
}

export async function installBaseGovernanceMetrics(env: Env) {
  const rows = await env.DB.prepare(`SELECT event_type, COUNT(*) AS count FROM install_base_telemetry_registry GROUP BY event_type`).all()
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



export function boundedObservabilityWindow(url: URL, fallback = 30): number {
  const requested = Number(url.searchParams.get("window") || url.searchParams.get("limit") || String(fallback))
  if (!Number.isFinite(requested) || requested < 1) return fallback
  return Math.min(Math.floor(requested), 90)
}

export async function installBaseEventTrend(env: Env, event_type: InstallBaseTelemetryEventType, window: number) {
  const rows = await env.DB.prepare(`SELECT substr(created_at,1,10) AS day, COUNT(*) AS count FROM install_base_telemetry_registry WHERE event_type=?1 GROUP BY day ORDER BY day DESC LIMIT ?2`)
    .bind(event_type, window)
    .all()
  return (rows.results || []).map((row: any) => ({ day: String(row.day || ""), count: Number(row.count || 0) }))
}

export async function governanceObservabilityEvidence(env: Env, window: number) {
  const telemetrySummaryRows = await env.DB.prepare(`SELECT event_type, COUNT(*) AS count FROM observability_registry GROUP BY event_type ORDER BY count DESC LIMIT 50`).all()
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
export async function recordDrift(env: Env, drift: {
  drift_class: string
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
