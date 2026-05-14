CREATE TABLE IF NOT EXISTS legitimacy_drift_propagation_registry (
  propagation_id TEXT PRIMARY KEY,
  propagation_hash TEXT NOT NULL,
  topology_hash TEXT NOT NULL,
  impact_hash TEXT NOT NULL,
  merge_legitimacy_hash TEXT NOT NULL,
  verdict_hash TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('TOPOLOGY_VALID','TOPOLOGY_DRIFT_PROPAGATED','MERGE_LINEAGE_CONTAMINATED','GOVERNANCE_IMPACT_EXPANDED','SCHEMA_PROPAGATION_FAILURE','WORKFLOW_TRUST_COLLAPSE','PROOF_LINEAGE_CONTAMINATION','RECONCILIATION_EQUIVALENCE_INVALID','DOWNSTREAM_LEGITIMACY_NULL','NULL')),
  propagation_object TEXT NOT NULL,
  impact_graph TEXT NOT NULL,
  merge_impact TEXT NOT NULL,
  verdict_object TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating='false'),
  fail_closed_on_ambiguity TEXT NOT NULL CHECK (fail_closed_on_ambiguity='true'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_hash_unique
  ON legitimacy_drift_propagation_registry (propagation_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_topology
  ON legitimacy_drift_propagation_registry (topology_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_impact
  ON legitimacy_drift_propagation_registry (impact_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_merge
  ON legitimacy_drift_propagation_registry (merge_legitimacy_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_verdict
  ON legitimacy_drift_propagation_registry (verdict_hash);

CREATE INDEX IF NOT EXISTS idx_legitimacy_drift_propagation_registry_classification
  ON legitimacy_drift_propagation_registry (classification);

CREATE TRIGGER IF NOT EXISTS trg_legitimacy_drift_propagation_registry_no_update
BEFORE UPDATE ON legitimacy_drift_propagation_registry
BEGIN
  SELECT RAISE(ABORT, 'legitimacy_drift_propagation_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_legitimacy_drift_propagation_registry_no_delete
BEFORE DELETE ON legitimacy_drift_propagation_registry
BEGIN
  SELECT RAISE(ABORT, 'legitimacy_drift_propagation_registry is append-only');
END;
