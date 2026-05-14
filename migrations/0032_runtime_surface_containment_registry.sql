CREATE TABLE IF NOT EXISTS runtime_surface_containment_registry (
  containment_id TEXT PRIMARY KEY,
  containment_hash TEXT NOT NULL UNIQUE,
  route_surface_hash TEXT NOT NULL,
  deployment_surface_hash TEXT NOT NULL,
  package_surface_hash TEXT NOT NULL,
  runtime_sovereignty_hash TEXT NOT NULL,
  hidden_surface_count INTEGER NOT NULL,
  drift_classes TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  execution_started TEXT NOT NULL CHECK (execution_started='false'),
  replay_consumed TEXT NOT NULL CHECK (replay_consumed='false'),
  authoritative TEXT NOT NULL CHECK (authoritative='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_surface_containment_registry_routes
  ON runtime_surface_containment_registry(route_surface_hash, hidden_surface_count);

CREATE INDEX IF NOT EXISTS idx_runtime_surface_containment_registry_deploy
  ON runtime_surface_containment_registry(deployment_surface_hash, package_surface_hash);

CREATE INDEX IF NOT EXISTS idx_runtime_surface_containment_registry_sovereignty
  ON runtime_surface_containment_registry(runtime_sovereignty_hash, containment_hash);

CREATE TRIGGER IF NOT EXISTS trg_runtime_surface_containment_registry_no_update
BEFORE UPDATE ON runtime_surface_containment_registry
BEGIN
  SELECT RAISE(ABORT, 'runtime_surface_containment_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_surface_containment_registry_no_delete
BEFORE DELETE ON runtime_surface_containment_registry
BEGIN
  SELECT RAISE(ABORT, 'runtime_surface_containment_registry is append-only');
END;
