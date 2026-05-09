-- Durable legitimacy continuity hardening.
CREATE TABLE IF NOT EXISTS continuity_registry (
  continuity_id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  parent_continuity_id TEXT,
  continuity_hash TEXT NOT NULL UNIQUE,
  canonical_continuity TEXT NOT NULL,
  status TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_continuity_registry_session_identity
  ON continuity_registry (session_id, identity_id, status, expires_at);

ALTER TABLE authority_registry ADD COLUMN continuity_id TEXT;
ALTER TABLE authority_registry ADD COLUMN identity_id TEXT;
ALTER TABLE aeo_registry ADD COLUMN continuity_id TEXT;
ALTER TABLE validation_registry ADD COLUMN continuity_id TEXT;
ALTER TABLE execution_registry ADD COLUMN continuity_id TEXT;
ALTER TABLE invocation_registry ADD COLUMN continuity_id TEXT;
ALTER TABLE proof_registry ADD COLUMN continuity_id TEXT;
ALTER TABLE proof_registry ADD COLUMN continuity_hash TEXT;
ALTER TABLE proof_registry ADD COLUMN identity_id TEXT;
ALTER TABLE proof_registry ADD COLUMN authority_lineage TEXT;
ALTER TABLE proof_registry ADD COLUMN execution_lineage TEXT;
