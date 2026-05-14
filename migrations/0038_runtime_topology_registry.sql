CREATE TABLE IF NOT EXISTS runtime_topology_registry (
  snapshot_id TEXT PRIMARY KEY,
  topology_hash TEXT NOT NULL,
  topology_semantic_hash TEXT NOT NULL,
  topology_boundary_hash TEXT NOT NULL,
  topology_lineage_hash TEXT NOT NULL,
  topology_equivalence_hash TEXT NOT NULL UNIQUE,
  drift_classes TEXT NOT NULL,
  lineage_hash TEXT NOT NULL,
  boundary_hash TEXT NOT NULL,
  reconciliation_timestamp TEXT NOT NULL,
  containment_references TEXT NOT NULL,
  topology_snapshot TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  append_only TEXT NOT NULL CHECK (append_only='true'),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_topology_registry_hashes
  ON runtime_topology_registry(topology_hash, topology_semantic_hash, topology_boundary_hash, topology_lineage_hash);

CREATE INDEX IF NOT EXISTS idx_runtime_topology_registry_boundary
  ON runtime_topology_registry(boundary_hash, lineage_hash);

CREATE TRIGGER IF NOT EXISTS trg_runtime_topology_registry_no_update
  BEFORE UPDATE ON runtime_topology_registry
  BEGIN SELECT RAISE(ABORT, 'runtime_topology_registry is append-only'); END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_topology_registry_no_delete
  BEFORE DELETE ON runtime_topology_registry
  BEGIN SELECT RAISE(ABORT, 'runtime_topology_registry is append-only'); END;
