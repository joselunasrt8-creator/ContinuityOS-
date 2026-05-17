CREATE TABLE IF NOT EXISTS recursive_governance_containment_registry (
  governance_observation_id TEXT PRIMARY KEY,
  governance_observation_hash TEXT NOT NULL UNIQUE,
  governance_equivalence_hash TEXT NOT NULL,
  governance_semantic_hash TEXT NOT NULL,
  governance_topology_hash TEXT NOT NULL,
  governance_lineage_hash TEXT NOT NULL,
  semantic_divergence_classes TEXT NOT NULL,
  recursive_containment_status TEXT NOT NULL CHECK (recursive_containment_status IN ('GOVERNANCE_CONTAINED','RECURSIVE_CONTAINMENT_REQUIRED')),
  governance_mutation_class TEXT NOT NULL CHECK (governance_mutation_class IN ('SAFE_OBSERVABILITY_ONLY','GOVERNANCE_CONTAINED','GOVERNANCE_EXPANSION','EXECUTION_BOUNDARY_EXPANSION','VALIDATION_SEMANTICS_DRIFT','AUTHORITY_SEMANTICS_DRIFT','PROOF_SEMANTICS_DRIFT','REPLAY_SEMANTICS_DRIFT','FEDERATION_SEMANTICS_DRIFT','OBSERVABILITY_TO_AUTHORITY_ESCALATION','ROOT_GOVERNANCE_BYPASS_RISK','RECURSIVE_CONTAINMENT_REQUIRED')),
  containment_object TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  append_only TEXT NOT NULL CHECK (append_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recursive_governance_containment_registry_equivalence ON recursive_governance_containment_registry(governance_equivalence_hash, governance_semantic_hash, governance_topology_hash);
CREATE INDEX IF NOT EXISTS idx_recursive_governance_containment_registry_lineage ON recursive_governance_containment_registry(governance_lineage_hash, recursive_containment_status);
CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_containment_registry_no_update BEFORE UPDATE ON recursive_governance_containment_registry BEGIN SELECT RAISE(ABORT, 'recursive_governance_containment_registry is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_containment_registry_no_delete BEFORE DELETE ON recursive_governance_containment_registry BEGIN SELECT RAISE(ABORT, 'recursive_governance_containment_registry is append-only'); END;
