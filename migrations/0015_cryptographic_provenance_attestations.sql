CREATE TABLE IF NOT EXISTS attestation_registry (
  attestation_id TEXT PRIMARY KEY,
  envelope_hash TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  payload_type TEXT NOT NULL,
  signer_identity TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  pull_request_id TEXT NOT NULL,
  merge_commit_sha TEXT NOT NULL,
  source_tree_hash TEXT NOT NULL,
  workflow_run_id TEXT NOT NULL,
  workflow_sha TEXT NOT NULL,
  canonical_aeo_hash TEXT NOT NULL,
  transparency_log_id TEXT NOT NULL,
  transparency_integrated_time TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(workflow_run_id),
  UNIQUE(decision_id, validated_object_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_envelope_unique
  ON attestation_registry (envelope_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_workflow_run_unique
  ON attestation_registry (workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_attestation_registry_lineage
  ON attestation_registry (decision_id, validated_object_hash, workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_attestation_registry_transparency
  ON attestation_registry (transparency_log_id, transparency_integrated_time);
