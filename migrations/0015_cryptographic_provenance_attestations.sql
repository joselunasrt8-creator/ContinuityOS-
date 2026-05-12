CREATE TABLE IF NOT EXISTS attestation_registry (
  attestation_id TEXT PRIMARY KEY,
  envelope_hash TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_type TEXT NOT NULL,
  signer_identity TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  workflow_run_id TEXT NOT NULL,
  workflow_sha TEXT NOT NULL,
  canonical_aeo_hash TEXT NOT NULL,
  transparency_log_id TEXT NOT NULL,
  transparency_integrated_time TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(envelope_hash),
  UNIQUE(workflow_run_id),
  UNIQUE(decision_id, validated_object_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_envelope_hash_unique
  ON attestation_registry (envelope_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_workflow_run_unique
  ON attestation_registry (workflow_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_decision_object_unique
  ON attestation_registry (decision_id, validated_object_hash);
