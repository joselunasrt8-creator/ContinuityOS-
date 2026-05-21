-- Issue #382: Release provenance registry — immutable lineage binding for governed releases
-- Binds release tags to governed commit lineage, proof evidence, and deterministic workflow hashes.
-- Append-only; no mutable provenance records permitted.
CREATE TABLE IF NOT EXISTS release_provenance_registry (
  release_id TEXT PRIMARY KEY,
  release_tag TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  workflow_hash TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  validation_proof_id TEXT NOT NULL,
  proof_references TEXT NOT NULL,
  release_lineage_hash TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','RELEASED','REJECTED','SUPERSEDED')),
  evidence_only TEXT NOT NULL CHECK (evidence_only='false'),
  append_only TEXT NOT NULL CHECK (append_only='true'),
  mutable TEXT NOT NULL CHECK (mutable='false'),
  created_at TEXT NOT NULL,
  CHECK (release_tag != ''),
  CHECK (commit_sha != ''),
  CHECK (workflow_hash != ''),
  CHECK (artifact_hash != ''),
  CHECK (validation_proof_id != ''),
  CHECK (release_lineage_hash != ''),
  CHECK (decision_id != ''),
  CHECK (invocation_nonce != '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_release_provenance_registry_tag_unique
  ON release_provenance_registry (release_tag);

CREATE UNIQUE INDEX IF NOT EXISTS idx_release_provenance_registry_lineage_unique
  ON release_provenance_registry (release_lineage_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_release_provenance_registry_nonce_unique
  ON release_provenance_registry (invocation_nonce);

CREATE INDEX IF NOT EXISTS idx_release_provenance_registry_commit
  ON release_provenance_registry (commit_sha, status);

CREATE INDEX IF NOT EXISTS idx_release_provenance_registry_proof
  ON release_provenance_registry (validation_proof_id, decision_id);

CREATE TRIGGER IF NOT EXISTS trg_release_provenance_registry_no_update
  BEFORE UPDATE ON release_provenance_registry
  BEGIN SELECT RAISE(ABORT, 'release_provenance_registry is append-only'); END;

CREATE TRIGGER IF NOT EXISTS trg_release_provenance_registry_no_delete
  BEFORE DELETE ON release_provenance_registry
  BEGIN SELECT RAISE(ABORT, 'release_provenance_registry is append-only'); END;
