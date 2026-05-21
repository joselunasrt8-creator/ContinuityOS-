-- Issue #382: Release artifact attestation registry — immutable artifact hash binding.
-- Each artifact attested under a release must trace back to a governed release provenance record.
-- Append-only; no mutable attestation paths permitted.
CREATE TABLE IF NOT EXISTS release_artifact_attestation_registry (
  attestation_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  artifact_name TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  artifact_media_type TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  workflow_hash TEXT NOT NULL,
  release_lineage_hash TEXT NOT NULL,
  attestation_hash TEXT NOT NULL,
  validation_proof_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ATTESTED','REJECTED','REVOKED')),
  evidence_only TEXT NOT NULL CHECK (evidence_only='false'),
  append_only TEXT NOT NULL CHECK (append_only='true'),
  mutable TEXT NOT NULL CHECK (mutable='false'),
  created_at TEXT NOT NULL,
  CHECK (attestation_hash != ''),
  CHECK (artifact_hash != ''),
  CHECK (commit_sha != ''),
  CHECK (release_id != ''),
  CHECK (validation_proof_id != '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_release_artifact_attestation_hash_unique
  ON release_artifact_attestation_registry (attestation_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_release_artifact_release_artifact_unique
  ON release_artifact_attestation_registry (release_id, artifact_hash);

CREATE INDEX IF NOT EXISTS idx_release_artifact_attestation_release
  ON release_artifact_attestation_registry (release_id, status);

CREATE INDEX IF NOT EXISTS idx_release_artifact_attestation_commit
  ON release_artifact_attestation_registry (commit_sha, artifact_hash);

CREATE TRIGGER IF NOT EXISTS trg_release_artifact_attestation_registry_no_update
  BEFORE UPDATE ON release_artifact_attestation_registry
  BEGIN SELECT RAISE(ABORT, 'release_artifact_attestation_registry is append-only'); END;

CREATE TRIGGER IF NOT EXISTS trg_release_artifact_attestation_registry_no_delete
  BEFORE DELETE ON release_artifact_attestation_registry
  BEGIN SELECT RAISE(ABORT, 'release_artifact_attestation_registry is append-only'); END;

CREATE TRIGGER IF NOT EXISTS trg_release_artifact_attestation_requires_provenance
  BEFORE INSERT ON release_artifact_attestation_registry
  WHEN NOT EXISTS (
    SELECT 1 FROM release_provenance_registry r
    WHERE r.release_id = NEW.release_id
      AND r.commit_sha = NEW.commit_sha
      AND r.artifact_hash = NEW.artifact_hash
      AND r.release_lineage_hash = NEW.release_lineage_hash
      AND r.validation_proof_id = NEW.validation_proof_id
      AND r.status IN ('PENDING','RELEASED')
  )
  BEGIN
    SELECT RAISE(ABORT, 'release_artifact_attestation requires matching release provenance');
  END;
