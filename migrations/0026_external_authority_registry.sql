-- External authority registry: append-only sovereignty dependency evidence for execution-capable infrastructure surfaces.
CREATE TABLE IF NOT EXISTS external_authority_registry (
  sovereignty_dependency_id TEXT PRIMARY KEY,
  external_authority_surface TEXT NOT NULL,
  authority_origin TEXT NOT NULL,
  infrastructure_scope TEXT NOT NULL,
  bootstrap_trust_hash TEXT NOT NULL,
  sovereignty_classification TEXT NOT NULL,
  containment_state TEXT NOT NULL,
  observability_only TEXT NOT NULL CHECK (observability_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  evidence_hash TEXT NOT NULL UNIQUE,
  drift_classes TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_external_authority_registry_surface
  ON external_authority_registry(external_authority_surface, authority_origin, containment_state);

CREATE INDEX IF NOT EXISTS idx_external_authority_registry_bootstrap
  ON external_authority_registry(bootstrap_trust_hash, sovereignty_classification);

CREATE TRIGGER IF NOT EXISTS trg_external_authority_registry_no_update
BEFORE UPDATE ON external_authority_registry
BEGIN
  SELECT RAISE(ABORT, 'external_authority_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_external_authority_registry_no_delete
BEFORE DELETE ON external_authority_registry
BEGIN
  SELECT RAISE(ABORT, 'external_authority_registry is append-only');
END;
