CREATE TABLE IF NOT EXISTS runtime_evolution_consensus_registry (
  consensus_id TEXT PRIMARY KEY,
  mutation_hash TEXT NOT NULL,
  canonical_hash TEXT NOT NULL,
  governance_scope TEXT NOT NULL,
  quorum_threshold TEXT NOT NULL,
  approval_count TEXT NOT NULL,
  approval_hash TEXT NOT NULL,
  consensus_status TEXT NOT NULL CHECK (consensus_status IN ('VALID_CONSENSUS','NULL')),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_evolution_consensus_registry_mutation
  ON runtime_evolution_consensus_registry(mutation_hash, canonical_hash, governance_scope);

CREATE INDEX IF NOT EXISTS idx_runtime_evolution_consensus_registry_approval
  ON runtime_evolution_consensus_registry(approval_hash, consensus_status);

CREATE TRIGGER IF NOT EXISTS trg_runtime_evolution_consensus_registry_no_update
BEFORE UPDATE ON runtime_evolution_consensus_registry
BEGIN
  SELECT RAISE(ABORT, 'runtime_evolution_consensus_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_evolution_consensus_registry_no_delete
BEFORE DELETE ON runtime_evolution_consensus_registry
BEGIN
  SELECT RAISE(ABORT, 'runtime_evolution_consensus_registry is append-only');
END;
