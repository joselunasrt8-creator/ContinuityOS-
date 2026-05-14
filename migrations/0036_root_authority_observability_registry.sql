CREATE TABLE IF NOT EXISTS root_authority_observability_registry (
  observation_id TEXT PRIMARY KEY,
  observation_hash TEXT NOT NULL UNIQUE,
  topology_hash TEXT NOT NULL,
  boundary_hash TEXT NOT NULL,
  drift_hash TEXT NOT NULL,
  containment_identity TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('ROOT_DEPLOY_AUTHORITY','ROOT_REPOSITORY_AUTHORITY','ROOT_ENVIRONMENT_AUTHORITY','ROOT_WORKFLOW_AUTHORITY','ROOT_BRANCH_POLICY_AUTHORITY','ROOT_RUNTIME_CONFIGURATION_AUTHORITY','ROOT_FEDERATION_AUTHORITY','ROOT_LOCAL_EXECUTION_AUTHORITY','ROOT_PACKAGE_EXECUTION_AUTHORITY','ROOT_INFRASTRUCTURE_MUTATION_AUTHORITY','UNDECLARED_ROOT_SURFACE','SOVEREIGNTY_DRIFT_DETECTED','ROOT_AUTHORITY_TOPOLOGY_DIVERGENCE','ROOT_AUTHORITY_BOUNDARY_OVERFLOW','ROOT_AUTHORITY_BYPASS_RISK','ROOT_AUTHORITY_CONTAINMENT_REQUIRED')),
  inventory_object TEXT NOT NULL,
  boundary_object TEXT NOT NULL,
  drift_object TEXT NOT NULL,
  containment_envelope TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  append_only TEXT NOT NULL CHECK (append_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  non_authoritative TEXT NOT NULL CHECK (non_authoritative='true'),
  executable TEXT NOT NULL CHECK (executable='false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable='false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  secret_material_persisted TEXT NOT NULL CHECK (secret_material_persisted='false'),
  fail_closed_on_ambiguity TEXT NOT NULL CHECK (fail_closed_on_ambiguity='true'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_root_authority_observability_registry_topology
  ON root_authority_observability_registry (topology_hash, containment_identity);

CREATE INDEX IF NOT EXISTS idx_root_authority_observability_registry_boundary
  ON root_authority_observability_registry (boundary_hash, classification);

CREATE INDEX IF NOT EXISTS idx_root_authority_observability_registry_drift
  ON root_authority_observability_registry (drift_hash, classification);

CREATE TRIGGER IF NOT EXISTS trg_root_authority_observability_registry_no_update
BEFORE UPDATE ON root_authority_observability_registry
BEGIN
  SELECT RAISE(ABORT, 'root_authority_observability_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_root_authority_observability_registry_no_delete
BEFORE DELETE ON root_authority_observability_registry
BEGIN
  SELECT RAISE(ABORT, 'root_authority_observability_registry is append-only');
END;
