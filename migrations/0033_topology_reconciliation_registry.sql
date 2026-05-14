CREATE TABLE IF NOT EXISTS topology_reconciliation_registry (
  reconciliation_id TEXT PRIMARY KEY,
  topology_hash TEXT NOT NULL,
  governance_hash TEXT NOT NULL,
  workflow_hash TEXT NOT NULL,
  schema_hash TEXT NOT NULL,
  reconciliation_hash TEXT NOT NULL,
  traversal_hash TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('TOPOLOGY_VALID','TOPOLOGY_DRIFT','UNDECLARED_SURFACE','SCHEMA_DIVERGENCE','WORKFLOW_EXPANSION','GOVERNANCE_MISMATCH')),
  drift_summary TEXT NOT NULL,
  topology_ancestry TEXT NOT NULL,
  merge_signal TEXT NOT NULL CHECK (merge_signal IN ('SAFE_TO_MERGE','TOPOLOGY_DRIFT','GOVERNANCE_DIVERGENCE','UNDECLARED_EXECUTION_SURFACE')),
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  execution_started TEXT NOT NULL CHECK (execution_started='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_topology_reconciliation_registry_hash_unique
  ON topology_reconciliation_registry(reconciliation_hash);

CREATE INDEX IF NOT EXISTS idx_topology_reconciliation_registry_classification
  ON topology_reconciliation_registry(classification, merge_signal);

CREATE INDEX IF NOT EXISTS idx_topology_reconciliation_registry_topology
  ON topology_reconciliation_registry(topology_hash, governance_hash, workflow_hash, schema_hash);

CREATE TRIGGER IF NOT EXISTS trg_topology_reconciliation_registry_no_update
  BEFORE UPDATE ON topology_reconciliation_registry
  BEGIN SELECT RAISE(ABORT, 'topology_reconciliation_registry is append-only'); END;

CREATE TRIGGER IF NOT EXISTS trg_topology_reconciliation_registry_no_delete
  BEFORE DELETE ON topology_reconciliation_registry
  BEGIN SELECT RAISE(ABORT, 'topology_reconciliation_registry is append-only'); END;
