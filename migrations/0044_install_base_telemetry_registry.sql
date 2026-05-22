CREATE TABLE IF NOT EXISTS install_base_telemetry_registry (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'governed_execution_attempted','governed_execution_completed','validated_execution','proof_generated','execution_surface_observed','invalid_execution_blocked','replay_rejected','hash_mismatch_rejected','expired_authority_rejected','policy_violation_rejected','continuity_rejected','orphaned_lineage_observed','revocation_propagation_observed','continuity_expiry_rejected','stale_lineage_rejected','reconciliation_failure_detected','distributed_disagreement_observed','quorum_collapse_observed','temporal_divergence_observed','proof_lineage_conflict_observed','proof_rejected','workflow_integrity_drift'
  )),
  decision_id TEXT,
  authority_id TEXT,
  execution_id TEXT,
  proof_id TEXT,
  lineage_origin_hash TEXT,
  lineage_origin_match TEXT NOT NULL CHECK (lineage_origin_match IN ('MATCH','MISMATCH','UNKNOWN')),
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  append_only TEXT NOT NULL CHECK (append_only='true'),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_install_base_telemetry_registry_type_created
  ON install_base_telemetry_registry(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_install_base_telemetry_registry_decision
  ON install_base_telemetry_registry(decision_id);

CREATE TRIGGER IF NOT EXISTS trg_install_base_telemetry_registry_no_update
BEFORE UPDATE ON install_base_telemetry_registry
BEGIN
  SELECT RAISE(ABORT, 'install_base_telemetry_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_install_base_telemetry_registry_no_delete
BEFORE DELETE ON install_base_telemetry_registry
BEGIN
  SELECT RAISE(ABORT, 'install_base_telemetry_registry is append-only');
END;
