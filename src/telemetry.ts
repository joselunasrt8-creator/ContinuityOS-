// Install Base Telemetry Module — Issue #1042
// Observability-only. Read-only. Non-authoritative.
//
// Canonical invariant: VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID → governed execution. Else → NULL.
// Telemetry observes this invariant. Telemetry must never participate in satisfying it.

export const TELEMETRY_ROUTE = "/metrics" as const

export const INSTALL_BASE_METRIC_NAMES = [
  "governed_execution_total",
  "blocked_execution_total",
  "proof_generated_total",
  "replay_rejected_total",
  "continuity_revocation_total",
  "reconciliation_failure_total",
  "execution_surface_count",
] as const

export type InstallBaseMetricName = (typeof INSTALL_BASE_METRIC_NAMES)[number]

// Classification constants: this module cannot satisfy the canonical invariant.
// Each field documents an action this module is prohibited from performing.
export const TELEMETRY_MODULE_CLASSIFICATION = {
  creates_authority: false,
  validates_objects: false,
  executes_actions: false,
  creates_proof: false,
  mutates_registries: false,
  repairs_failures: false,
  turns_failed_executions_valid: false,
  read_only: true,
  evidence_only: true,
  non_authoritative: true,
  append_only_source: true,
} as const

export type TelemetryModuleClassification = typeof TELEMETRY_MODULE_CLASSIFICATION

// Maps the 7 canonical Issue #1042 counter names to install_base_telemetry_registry event types.
// All values are read from append-only telemetry records. No value returned here alters
// legitimacy outcomes, authority, validation state, execution eligibility, or proof status.
export function readInstallBaseCounters(
  eventCounts: Map<string, number>
): Record<InstallBaseMetricName, number> {
  return {
    governed_execution_total: eventCounts.get("governed_execution_completed") ?? 0,
    blocked_execution_total: eventCounts.get("invalid_execution_blocked") ?? 0,
    proof_generated_total: eventCounts.get("proof_generated") ?? 0,
    replay_rejected_total: eventCounts.get("replay_rejected") ?? 0,
    continuity_revocation_total: eventCounts.get("revocation_propagation_observed") ?? 0,
    reconciliation_failure_total: eventCounts.get("reconciliation_failure_detected") ?? 0,
    execution_surface_count: eventCounts.get("execution_surface_observed") ?? 0,
  }
}
