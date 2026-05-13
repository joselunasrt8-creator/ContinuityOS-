-- Runtime Sovereignty Manifest registry: append-only evidence of the frozen runtime identity.
CREATE TABLE IF NOT EXISTS runtime_sovereignty_registry (
  sovereignty_id TEXT PRIMARY KEY,
  sovereignty_hash TEXT NOT NULL,
  runtime_surface_hash TEXT NOT NULL,
  governance_surface_hash TEXT NOT NULL,
  replay_surface_hash TEXT NOT NULL,
  proof_surface_hash TEXT NOT NULL,
  validator_surface_hash TEXT NOT NULL,
  schema_hash TEXT NOT NULL,
  migration_chain_hash TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_sovereignty_registry_hash_unique
  ON runtime_sovereignty_registry(sovereignty_hash);

CREATE INDEX IF NOT EXISTS idx_runtime_sovereignty_registry_surfaces
  ON runtime_sovereignty_registry(runtime_surface_hash, governance_surface_hash, replay_surface_hash, proof_surface_hash);

CREATE TRIGGER IF NOT EXISTS trg_runtime_sovereignty_registry_no_update
BEFORE UPDATE ON runtime_sovereignty_registry
BEGIN
  SELECT RAISE(ABORT, 'runtime_sovereignty_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_sovereignty_registry_no_delete
BEFORE DELETE ON runtime_sovereignty_registry
BEGIN
  SELECT RAISE(ABORT, 'runtime_sovereignty_registry is append-only');
END;
