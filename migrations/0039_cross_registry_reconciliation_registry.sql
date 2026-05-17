CREATE TABLE IF NOT EXISTS unauthorized_mutation_closure_registry (
  closure_id TEXT PRIMARY KEY,
  inventory_hash TEXT NOT NULL,
  route_hash TEXT NOT NULL,
  registry_hash TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating='false'),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cross_registry_reconciliation_registry (
  reconciliation_id TEXT PRIMARY KEY,
  registry_set_hash TEXT NOT NULL,
  lineage_graph_hash TEXT NOT NULL,
  continuity_graph_hash TEXT NOT NULL,
  proof_graph_hash TEXT NOT NULL,
  replay_graph_hash TEXT NOT NULL,
  topology_binding_hash TEXT NOT NULL,
  governance_binding_hash TEXT NOT NULL,
  reconciliation_equivalence_hash TEXT NOT NULL,
  drift_classes TEXT NOT NULL,
  unresolved_edges TEXT NOT NULL,
  orphaned_records TEXT NOT NULL,
  containment_status TEXT NOT NULL CHECK (containment_status IN ('RECONCILED','RECONCILIATION_REQUIRED')),
  legitimacy_status TEXT CHECK (legitimacy_status IS NULL OR legitimacy_status='LEGITIMATE'),
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cross_registry_reconciliation_registry_hash_unique
  ON cross_registry_reconciliation_registry(reconciliation_equivalence_hash);

CREATE INDEX IF NOT EXISTS idx_cross_registry_reconciliation_registry_status
  ON cross_registry_reconciliation_registry(containment_status, legitimacy_status);

CREATE TRIGGER IF NOT EXISTS trg_cross_registry_reconciliation_registry_no_update
BEFORE UPDATE ON cross_registry_reconciliation_registry
BEGIN
  SELECT RAISE(ABORT, 'cross_registry_reconciliation_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_cross_registry_reconciliation_registry_no_delete
BEFORE DELETE ON cross_registry_reconciliation_registry
BEGIN
  SELECT RAISE(ABORT, 'cross_registry_reconciliation_registry is append-only');
END;
