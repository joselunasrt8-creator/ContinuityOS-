-- Align D1 tables with Worker insert expectations.
-- This migration is additive and preserves existing records.

CREATE TABLE IF NOT EXISTS authority_registry (
  authority_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  intent TEXT NOT NULL,
  scope TEXT NOT NULL,
  constraints TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aeo_registry (
  aeo_id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  aeo TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS validation_registry (
  validation_id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL,
  aeo_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_registry (
  execution_id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  upstream_status INTEGER,
  status TEXT NOT NULL,
  execution_event TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proof_registry (
  proof_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  surface TEXT NOT NULL,
  proof_reference TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);


CREATE INDEX IF NOT EXISTS idx_authority_registry_decision_id
  ON authority_registry (decision_id);

CREATE INDEX IF NOT EXISTS idx_aeo_registry_decision_id
  ON aeo_registry (decision_id);

CREATE INDEX IF NOT EXISTS idx_validation_registry_decision_id
  ON validation_registry (decision_id);

CREATE INDEX IF NOT EXISTS idx_execution_registry_decision_id
  ON execution_registry (decision_id);

CREATE INDEX IF NOT EXISTS idx_proof_registry_decision_id
  ON proof_registry (decision_id);
