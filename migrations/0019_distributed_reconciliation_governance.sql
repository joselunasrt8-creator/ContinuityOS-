-- Distributed reconciliation governance is append-only observability evidence only.
-- Remote evidence remains non-authoritative, replay-neutral, read-only, and non-executable.
CREATE TABLE IF NOT EXISTS federated_reconciliation_registry (
  reconciliation_id TEXT PRIMARY KEY,
  checkpoint_hash TEXT NOT NULL,
  canonical_hash TEXT NOT NULL,
  lineage_root TEXT NOT NULL,
  continuity_root TEXT NOT NULL,
  federation_classification TEXT NOT NULL,
  drift_summary TEXT NOT NULL,
  replay_indicators TEXT NOT NULL,
  topology_hash TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_federated_reconciliation_checkpoint_hash
  ON federated_reconciliation_registry(checkpoint_hash, canonical_hash);

CREATE INDEX IF NOT EXISTS idx_federated_reconciliation_lineage_topology
  ON federated_reconciliation_registry(lineage_root, continuity_root, topology_hash);

CREATE TRIGGER IF NOT EXISTS trg_federated_reconciliation_registry_no_update
BEFORE UPDATE ON federated_reconciliation_registry
BEGIN
  SELECT RAISE(ABORT, 'federated_reconciliation_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_federated_reconciliation_registry_no_delete
BEFORE DELETE ON federated_reconciliation_registry
BEGIN
  SELECT RAISE(ABORT, 'federated_reconciliation_registry is append-only');
END;

CREATE INDEX IF NOT EXISTS idx_federated_reconciliation_runtime_hash
  ON federated_reconciliation_registry(checkpoint_hash, canonical_hash, topology_hash);
