-- MindShift recursive reconciliation closure registry.
-- Append-only, replay-neutral observability evidence only.
-- No UPDATE. No DELETE. No execution authority fields. No authority inheritance.

CREATE TABLE IF NOT EXISTS reconciliation_closure_registry (
  closure_id TEXT PRIMARY KEY,
  closure_hash TEXT NOT NULL,
  deterministic_reconciliation_anchor TEXT NOT NULL,
  recursive_checkpoint_identity TEXT NOT NULL,
  reconciliation_equivalence_state TEXT NOT NULL CHECK (reconciliation_equivalence_state IN ('RECONCILIATION_EQUIVALENT','RECONCILIATION_DRIFT','NULL')),
  lineage_depth TEXT NOT NULL,
  bounded_window TEXT NOT NULL,
  graph_checkpoint_hash TEXT NOT NULL,
  bootstrap_checkpoint_hash TEXT NOT NULL,
  runtime_sovereignty_checkpoint_hash TEXT NOT NULL,
  federation_conformance_checkpoint_hash TEXT NOT NULL,
  drift_classes TEXT NOT NULL,
  closure_object_hash TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  execution_started TEXT NOT NULL CHECK (execution_started='false'),
  replay_consumed TEXT NOT NULL CHECK (replay_consumed='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_closure_registry_hash
  ON reconciliation_closure_registry(closure_hash, recursive_checkpoint_identity, reconciliation_equivalence_state);

CREATE INDEX IF NOT EXISTS idx_reconciliation_closure_registry_bindings
  ON reconciliation_closure_registry(graph_checkpoint_hash, bootstrap_checkpoint_hash, runtime_sovereignty_checkpoint_hash, federation_conformance_checkpoint_hash);

CREATE INDEX IF NOT EXISTS idx_reconciliation_closure_registry_drift
  ON reconciliation_closure_registry(reconciliation_equivalence_state, bounded_window);

CREATE TRIGGER IF NOT EXISTS trg_reconciliation_closure_registry_no_update
BEFORE UPDATE ON reconciliation_closure_registry
BEGIN
  SELECT RAISE(ABORT, 'reconciliation_closure_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_reconciliation_closure_registry_no_delete
BEFORE DELETE ON reconciliation_closure_registry
BEGIN
  SELECT RAISE(ABORT, 'reconciliation_closure_registry is append-only');
END;
