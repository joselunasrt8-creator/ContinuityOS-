-- Issue #890: Deployment provenance registry (append-only)
CREATE TABLE IF NOT EXISTS deployment_provenance_registry (
  provenance_id TEXT PRIMARY KEY,
  commit_sha TEXT NOT NULL,
  workflow_hash TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  deploy_actor TEXT NOT NULL,
  deployment_timestamp TEXT NOT NULL,
  environment_classification TEXT NOT NULL,
  deployment_proof_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(workflow_hash, artifact_hash, commit_sha, deployment_proof_id)
);

CREATE INDEX IF NOT EXISTS idx_deployment_provenance_registry_proof
  ON deployment_provenance_registry (deployment_proof_id);

CREATE INDEX IF NOT EXISTS idx_deployment_provenance_registry_commit
  ON deployment_provenance_registry (commit_sha, workflow_hash, artifact_hash);

CREATE TRIGGER IF NOT EXISTS deployment_provenance_registry_append_only_update
  BEFORE UPDATE ON deployment_provenance_registry
BEGIN
  SELECT RAISE(ABORT, 'deployment_provenance_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS deployment_provenance_registry_append_only_delete
  BEFORE DELETE ON deployment_provenance_registry
BEGIN
  SELECT RAISE(ABORT, 'deployment_provenance_registry is append-only');
END;

-- Issue #891: Deployment proof registry (append-only, immutable)
CREATE TABLE IF NOT EXISTS deployment_proof_registry (
  deployment_proof_id TEXT PRIMARY KEY,
  workflow_hash TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  deployment_environment TEXT NOT NULL,
  provenance_lineage_hash TEXT NOT NULL,
  proof_binding_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(proof_binding_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deployment_proof_registry_binding
  ON deployment_proof_registry (proof_binding_hash);

CREATE INDEX IF NOT EXISTS idx_deployment_proof_registry_commit_workflow
  ON deployment_proof_registry (commit_sha, workflow_hash, artifact_hash);

CREATE TRIGGER IF NOT EXISTS deployment_proof_registry_append_only_update
  BEFORE UPDATE ON deployment_proof_registry
BEGIN
  SELECT RAISE(ABORT, 'deployment_proof_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS deployment_proof_registry_append_only_delete
  BEFORE DELETE ON deployment_proof_registry
BEGIN
  SELECT RAISE(ABORT, 'deployment_proof_registry is append-only');
END;

-- Issue #893: Rollback proof registry (append-only)
CREATE TABLE IF NOT EXISTS deployment_rollback_registry (
  rollback_id TEXT PRIMARY KEY,
  prior_deployment_proof_id TEXT NOT NULL,
  rollback_artifact_hash TEXT NOT NULL,
  rollback_workflow_hash TEXT NOT NULL,
  rollback_commit_sha TEXT NOT NULL,
  rollback_lineage_hash TEXT NOT NULL,
  rollback_proof_binding_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(rollback_proof_binding_hash)
);

CREATE INDEX IF NOT EXISTS idx_deployment_rollback_registry_prior_proof
  ON deployment_rollback_registry (prior_deployment_proof_id);

CREATE TRIGGER IF NOT EXISTS deployment_rollback_registry_append_only_update
  BEFORE UPDATE ON deployment_rollback_registry
BEGIN
  SELECT RAISE(ABORT, 'deployment_rollback_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS deployment_rollback_registry_append_only_delete
  BEFORE DELETE ON deployment_rollback_registry
BEGIN
  SELECT RAISE(ABORT, 'deployment_rollback_registry is append-only');
END;
