-- Phase 1 identity/session continuity gate.
-- Existing pre-session runtime records are archived so new execution objects must be
-- recreated under an ACTIVE session without weakening replay constraints.

CREATE TABLE IF NOT EXISTS session_registry (
  session_id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  trust_tier TEXT NOT NULL,
  continuity_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_registry_status_expiry
  ON session_registry (continuity_status, expires_at);

DROP INDEX IF EXISTS idx_authority_registry_decision_id;
DROP INDEX IF EXISTS idx_authority_registry_decision_unique;
ALTER TABLE authority_registry RENAME TO authority_registry_legacy_pre_session_continuity;

CREATE TABLE authority_registry (
  authority_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
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
ALTER TABLE validation_registry RENAME TO validation_registry_legacy_pre_session_continuity;

CREATE TABLE validation_registry (
  validation_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
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
ALTER TABLE execution_registry RENAME TO execution_registry_legacy_pre_session_continuity;

CREATE TABLE execution_registry (
  execution_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
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
ALTER TABLE proof_registry RENAME TO proof_registry_legacy_pre_session_continuity;

CREATE TABLE proof_registry (
  proof_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  surface TEXT,
  run_id TEXT,
  commit_sha TEXT,
  workflow TEXT,
  environment TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(decision_id, validated_object_hash)
);

CREATE INDEX IF NOT EXISTS idx_proof_registry_execution_decision_hash
  ON proof_registry (execution_id, decision_id, validated_object_hash);

CREATE TABLE IF NOT EXISTS proof_registry_duplicate_archive (
  archive_id TEXT PRIMARY KEY,
  proof_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  surface TEXT,
  run_id TEXT,
  commit_sha TEXT,
  workflow TEXT,
  environment TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  archive_reason TEXT NOT NULL,
  canonical_proof_id TEXT NOT NULL,
  UNIQUE(proof_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_execution_decision_hash
  ON proof_registry (decision_id, validated_object_hash);
