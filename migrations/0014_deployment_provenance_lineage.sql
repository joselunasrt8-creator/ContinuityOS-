ALTER TABLE preo_registry ADD COLUMN reviewed_tree_hash TEXT;
ALTER TABLE preo_registry ADD COLUMN merge_commit_sha TEXT;

ALTER TABLE execution_registry ADD COLUMN repository TEXT;
ALTER TABLE execution_registry ADD COLUMN branch TEXT;
ALTER TABLE execution_registry ADD COLUMN pull_request_id TEXT;
ALTER TABLE execution_registry ADD COLUMN merge_commit_sha TEXT;
ALTER TABLE execution_registry ADD COLUMN source_tree_hash TEXT;
ALTER TABLE execution_registry ADD COLUMN workflow_run_id TEXT;
ALTER TABLE execution_registry ADD COLUMN workflow_sha TEXT;

ALTER TABLE proof_registry ADD COLUMN repository TEXT;
ALTER TABLE proof_registry ADD COLUMN branch TEXT;
ALTER TABLE proof_registry ADD COLUMN pull_request_id TEXT;
ALTER TABLE proof_registry ADD COLUMN merge_commit_sha TEXT;
ALTER TABLE proof_registry ADD COLUMN source_tree_hash TEXT;
ALTER TABLE proof_registry ADD COLUMN workflow_run_id TEXT;
ALTER TABLE proof_registry ADD COLUMN workflow_sha TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_preo_registry_lineage_unique
  ON preo_registry (decision_id, reviewed_hash, reviewed_tree_hash, merge_commit_sha);

CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_registry_workflow_run_unique
  ON execution_registry (workflow_run_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_workflow_run_unique
  ON proof_registry (workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_proof_registry_provenance
  ON proof_registry (repository, branch, pull_request_id, merge_commit_sha, workflow_run_id);
