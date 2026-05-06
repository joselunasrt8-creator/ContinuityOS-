-- Rebuild stale pre-reboot runtime registry shapes into the canonical lifecycle schema.
-- Earlier migrations created validation/execution/proof/invocation registries before
-- the enforcement reboot. Migration 0006 used CREATE TABLE IF NOT EXISTS, so those
-- existing legacy tables were not reshaped. Archive each legacy table before
-- replacement so replay, proof, validation, and execution evidence remains available
-- for audit without weakening runtime persistence constraints.


DROP INDEX IF EXISTS idx_authority_registry_decision_id;
DROP INDEX IF EXISTS idx_authority_registry_decision_unique;
ALTER TABLE authority_registry RENAME TO authority_registry_legacy_pre_reboot;

CREATE TABLE authority_registry (
  authority_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL,
  intent TEXT NOT NULL,
  scope TEXT NOT NULL,
  constraints TEXT NOT NULL,
  expiry TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_authority_registry_decision_id
  ON authority_registry (decision_id);

DROP INDEX IF EXISTS idx_validation_registry_decision_id;
DROP INDEX IF EXISTS idx_validation_registry_decision_hash_nonce;
ALTER TABLE validation_registry RENAME TO validation_registry_legacy_pre_reboot;

CREATE TABLE validation_registry (
  validation_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  environment TEXT,
  result TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_validation_registry_decision_hash_nonce
  ON validation_registry (decision_id, validated_object_hash, invocation_nonce);

DROP INDEX IF EXISTS idx_execution_registry_decision_id;
DROP INDEX IF EXISTS idx_execution_replay_guard;
DROP INDEX IF EXISTS idx_execution_registry_validated_hash_status;
DROP INDEX IF EXISTS idx_execution_registry_decision_hash;
ALTER TABLE execution_registry RENAME TO execution_registry_legacy_pre_reboot;

CREATE TABLE execution_registry (
  execution_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(decision_id, validated_object_hash)
);

CREATE INDEX IF NOT EXISTS idx_execution_registry_decision_hash
  ON execution_registry (decision_id, validated_object_hash);

DROP INDEX IF EXISTS idx_proof_registry_decision_id;
DROP INDEX IF EXISTS idx_proof_object_hash;
DROP INDEX IF EXISTS idx_proof_registry_execution_decision_hash;
ALTER TABLE proof_registry RENAME TO proof_registry_legacy_pre_reboot;

CREATE TABLE proof_registry (
  proof_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  surface TEXT,
  run_id TEXT,
  commit_sha TEXT,
  workflow TEXT,
  environment TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proof_registry_execution_decision_hash
  ON proof_registry (execution_id, decision_id, validated_object_hash);

DROP INDEX IF EXISTS idx_invocation_registry_nonce_once;
DROP INDEX IF EXISTS idx_invocation_registry_status;
ALTER TABLE invocation_registry RENAME TO invocation_registry_legacy_pre_reboot;

CREATE TABLE invocation_registry (
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce)
);

INSERT INTO invocation_registry (
  decision_id,
  validated_object_hash,
  invocation_nonce,
  status,
  created_at
)
SELECT
  decision_id,
  validated_object_hash,
  invocation_nonce,
  status,
  created_at
FROM invocation_registry_legacy_pre_reboot;
