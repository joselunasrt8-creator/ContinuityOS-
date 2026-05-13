-- Deterministic delegated authority lineage continuity.
ALTER TABLE authority_registry ADD COLUMN delegated_authority_id TEXT;
ALTER TABLE authority_registry ADD COLUMN parent_authority_id TEXT;
ALTER TABLE authority_registry ADD COLUMN delegation_depth TEXT;
ALTER TABLE authority_registry ADD COLUMN delegation_scope_subset TEXT;
ALTER TABLE authority_registry ADD COLUMN delegation_expiry TEXT;
ALTER TABLE authority_registry ADD COLUMN delegation_lineage_hash TEXT;
ALTER TABLE authority_registry ADD COLUMN delegation_root_hash TEXT;
ALTER TABLE authority_registry ADD COLUMN delegated_replay_chain_hash TEXT;

ALTER TABLE aeo_registry ADD COLUMN delegated_authority_id TEXT;
ALTER TABLE aeo_registry ADD COLUMN delegation_lineage_hash TEXT;
ALTER TABLE aeo_registry ADD COLUMN delegation_root_hash TEXT;
ALTER TABLE aeo_registry ADD COLUMN delegated_replay_chain_hash TEXT;

ALTER TABLE validation_registry ADD COLUMN delegated_authority_id TEXT;
ALTER TABLE validation_registry ADD COLUMN delegated_replay_chain_hash TEXT;

ALTER TABLE execution_registry ADD COLUMN delegated_authority_id TEXT;
ALTER TABLE execution_registry ADD COLUMN delegated_replay_chain_hash TEXT;
ALTER TABLE execution_registry ADD COLUMN delegation_lineage_hash TEXT;
ALTER TABLE execution_registry ADD COLUMN delegation_root_hash TEXT;

ALTER TABLE proof_registry ADD COLUMN delegated_authority_id TEXT;
ALTER TABLE proof_registry ADD COLUMN delegated_replay_chain_hash TEXT;
ALTER TABLE proof_registry ADD COLUMN delegation_lineage_hash TEXT;
ALTER TABLE proof_registry ADD COLUMN delegation_root_hash TEXT;

CREATE TABLE IF NOT EXISTS delegated_authority_registry (
  registry_id TEXT PRIMARY KEY,
  object_type TEXT NOT NULL CHECK (object_type IN ('DelegatedAuthorityObject','DelegationChainEnvelope','DelegatedRevocationProjection','DelegatedReplayEnvelope')),
  delegated_authority_id TEXT NOT NULL,
  parent_authority_id TEXT NOT NULL,
  authority_id TEXT,
  decision_id TEXT,
  continuity_id TEXT,
  delegation_depth TEXT NOT NULL,
  delegation_scope_subset TEXT NOT NULL,
  delegation_expiry TEXT NOT NULL,
  delegation_lineage_hash TEXT NOT NULL,
  delegation_root_hash TEXT NOT NULL,
  delegated_replay_chain_hash TEXT NOT NULL,
  canonical_delegation_object TEXT NOT NULL,
  exact_object_hash TEXT NOT NULL,
  projection_status TEXT NOT NULL CHECK (projection_status IN ('ACTIVE','REVOKED','EXPIRED','OBSERVED','NULL')),
  revocation_reason TEXT,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_delegated_authority_registry_exact_object ON delegated_authority_registry(exact_object_hash);
CREATE INDEX IF NOT EXISTS idx_delegated_authority_registry_lineage ON delegated_authority_registry(delegated_authority_id, parent_authority_id, delegation_lineage_hash, delegation_root_hash);
CREATE INDEX IF NOT EXISTS idx_delegated_authority_registry_replay ON delegated_authority_registry(delegated_authority_id, delegated_replay_chain_hash, projection_status);

CREATE TRIGGER IF NOT EXISTS trg_delegated_authority_registry_no_update
BEFORE UPDATE ON delegated_authority_registry
BEGIN
  SELECT RAISE(ABORT, 'delegated_authority_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_delegated_authority_registry_no_delete
BEFORE DELETE ON delegated_authority_registry
BEGIN
  SELECT RAISE(ABORT, 'delegated_authority_registry is append-only');
END;
