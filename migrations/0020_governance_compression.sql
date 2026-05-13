-- Governance compression is append-only observability evidence only.
-- Remote legitimacy evidence remains non-authoritative, replay-neutral, read-only, and non-executable.
CREATE TABLE IF NOT EXISTS governance_compression_registry (
  compression_id TEXT PRIMARY KEY,
  reconciliation_root TEXT NOT NULL,
  checkpoint_set_hash TEXT NOT NULL,
  topology_root TEXT NOT NULL,
  lineage_root TEXT NOT NULL,
  federation_classification TEXT NOT NULL,
  compressed_drift_summary TEXT NOT NULL,
  compressed_replay_summary TEXT NOT NULL,
  participating_runtimes TEXT NOT NULL,
  canonical_hash TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_governance_compression_registry_hash_unique
  ON governance_compression_registry(canonical_hash);

CREATE INDEX IF NOT EXISTS idx_governance_compression_registry_reconciliation
  ON governance_compression_registry(reconciliation_root, checkpoint_set_hash);

CREATE INDEX IF NOT EXISTS idx_governance_compression_registry_topology_lineage
  ON governance_compression_registry(topology_root, lineage_root);

CREATE TRIGGER IF NOT EXISTS trg_governance_compression_registry_no_update
BEFORE UPDATE ON governance_compression_registry
BEGIN
  SELECT RAISE(ABORT, 'governance_compression_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_governance_compression_registry_no_delete
BEFORE DELETE ON governance_compression_registry
BEGIN
  SELECT RAISE(ABORT, 'governance_compression_registry is append-only');
END;
