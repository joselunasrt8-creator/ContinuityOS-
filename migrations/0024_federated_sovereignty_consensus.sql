CREATE TABLE IF NOT EXISTS federated_sovereignty_registry (
  federation_id TEXT PRIMARY KEY,
  local_runtime_id TEXT NOT NULL,
  remote_runtime_id TEXT NOT NULL,
  sovereignty_hash TEXT NOT NULL,
  equivalence_hash TEXT NOT NULL,
  drift_summary TEXT NOT NULL,
  replay_indicators TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'),
  generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_federated_sovereignty_registry_runtime
  ON federated_sovereignty_registry(local_runtime_id, remote_runtime_id, verification_status);

CREATE INDEX IF NOT EXISTS idx_federated_sovereignty_registry_hash
  ON federated_sovereignty_registry(sovereignty_hash, equivalence_hash);

CREATE TRIGGER IF NOT EXISTS trg_federated_sovereignty_registry_no_update
BEFORE UPDATE ON federated_sovereignty_registry
BEGIN
  SELECT RAISE(ABORT, 'federated_sovereignty_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_federated_sovereignty_registry_no_delete
BEFORE DELETE ON federated_sovereignty_registry
BEGIN
  SELECT RAISE(ABORT, 'federated_sovereignty_registry is append-only');
END;
