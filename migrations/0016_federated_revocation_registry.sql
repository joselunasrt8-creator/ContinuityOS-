CREATE TABLE IF NOT EXISTS federated_revocation_registry (
  revocation_id TEXT PRIMARY KEY,
  runtime_id TEXT NOT NULL,
  remote_runtime_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  revocation_class TEXT NOT NULL,
  lineage_hash TEXT NOT NULL,
  reconciliation_merkle_root TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  drift_class TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_federated_revocation_runtime_hash
ON federated_revocation_registry(runtime_id, remote_runtime_id, validated_object_hash);
