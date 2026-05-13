-- Recursive governance observations are append-only legitimacy evidence.
-- Canonical invariant: system mutation requires legitimacy; invalid mutation evidence cannot become execution authority.
CREATE TABLE IF NOT EXISTS recursive_governance_registry (
  governance_id TEXT PRIMARY KEY,
  mutation_class TEXT NOT NULL CHECK (mutation_class IN ('runtime_route_mutation','validator_mutation','schema_mutation','authority_semantics_mutation','proof_semantics_mutation','replay_semantics_mutation','policy_mutation','observability_mutation','federation_semantics_mutation','governance_surface_expansion')),
  mutation_scope TEXT NOT NULL,
  target_surface TEXT NOT NULL,
  mutation_hash TEXT NOT NULL,
  sco_hash TEXT NOT NULL,
  preo_hash TEXT NOT NULL,
  governance_decision TEXT NOT NULL CHECK (governance_decision IN ('GOVERNANCE_OBSERVED','GOVERNANCE_VALIDATED','GOVERNANCE_QUARANTINED','GOVERNANCE_REJECTED','NULL')),
  drift_classes TEXT NOT NULL,
  exact_object_verified TEXT NOT NULL CHECK (exact_object_verified IN ('true','false')),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_authorized TEXT NOT NULL CHECK (mutation_authorized IN ('true','false')),
  proof_required TEXT NOT NULL CHECK (proof_required='true'),
  canonical_path_preserved TEXT NOT NULL CHECK (canonical_path_preserved IN ('true','false')),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (governance_decision != 'GOVERNANCE_VALIDATED' OR (sco_hash != '' AND exact_object_verified='true' AND replay_neutral='true' AND mutation_authorized='true' AND proof_required='true' AND canonical_path_preserved='true')),
  CHECK (governance_decision = 'GOVERNANCE_VALIDATED' OR mutation_authorized='false')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recursive_governance_registry_governance_unique
  ON recursive_governance_registry(governance_id);

CREATE INDEX IF NOT EXISTS idx_recursive_governance_registry_mutation
  ON recursive_governance_registry(mutation_class, mutation_scope, target_surface);

CREATE INDEX IF NOT EXISTS idx_recursive_governance_registry_legitimacy
  ON recursive_governance_registry(mutation_hash, sco_hash, preo_hash, governance_decision);

CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_registry_no_update
BEFORE UPDATE ON recursive_governance_registry
BEGIN
  SELECT RAISE(ABORT, 'recursive_governance_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_registry_no_delete
BEFORE DELETE ON recursive_governance_registry
BEGIN
  SELECT RAISE(ABORT, 'recursive_governance_registry is append-only');
END;
