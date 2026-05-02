-- Canonical replay guard registry for invocation nonce reservation and consumption.
CREATE TABLE IF NOT EXISTS invocation_registry (
  invocation_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invocation_registry_nonce_once
  ON invocation_registry (decision_id, invocation_nonce);

CREATE INDEX IF NOT EXISTS idx_invocation_registry_status
  ON invocation_registry (status, created_at);
