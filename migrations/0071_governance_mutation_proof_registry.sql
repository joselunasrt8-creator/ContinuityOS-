-- GAP-005 closure (issue #1831): governance mutation proof persistence.
-- Wires /execute -> /proof for governance mutations by adding a registry that
-- binds each governance mutation proof to its full lineage chain: session_id,
-- continuity_id, decision_id, authority_id, gma_id, compiled_object_hash,
-- executed_object_hash, and the underlying execution proof_id.
--
-- Evidence-only — does not create authority, does not authorize execution,
-- does not redefine GMA format or the authority lifecycle. Replay-safe:
-- lineage_hash and execution_proof_id are unique, so a replayed lineage
-- cannot produce a second registry row.

CREATE TABLE IF NOT EXISTS governance_mutation_proof_registry (
  proof_id TEXT PRIMARY KEY,
  lineage_hash TEXT NOT NULL,
  session_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  gma_id TEXT NOT NULL,
  compiled_object_hash TEXT NOT NULL,
  executed_object_hash TEXT NOT NULL,
  execution_proof_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(lineage_hash),
  UNIQUE(execution_proof_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_mutation_proof_lineage
  ON governance_mutation_proof_registry (decision_id, continuity_id, session_id);

CREATE TRIGGER IF NOT EXISTS trg_governance_mutation_proof_requires_hash_match
BEFORE INSERT ON governance_mutation_proof_registry
WHEN NEW.compiled_object_hash != NEW.executed_object_hash
BEGIN
  SELECT RAISE(ABORT, 'governance_mutation_proof_registry compiled/executed hash mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_governance_mutation_proof_requires_valid_proof
BEFORE INSERT ON governance_mutation_proof_registry
WHEN NOT EXISTS (
  SELECT 1 FROM proof_registry p
  WHERE p.proof_id = NEW.execution_proof_id
    AND p.decision_id = NEW.decision_id
    AND p.validated_object_hash = NEW.executed_object_hash
)
BEGIN
  SELECT RAISE(ABORT, 'governance_mutation_proof_registry missing bound execution proof lineage');
END;
