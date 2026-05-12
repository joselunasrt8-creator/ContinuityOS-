-- Cloudflare D1 schema for the canonical Worker runtime in src/index.ts.
-- JSON-style canonical objects are stored as TEXT.

CREATE TABLE IF NOT EXISTS session_registry (
  session_id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  trust_tier TEXT NOT NULL,
  continuity_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_registry_status_expiry
  ON session_registry (continuity_status, expires_at);

CREATE TABLE IF NOT EXISTS continuity_registry (
  continuity_id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  parent_continuity_id TEXT,
  continuity_hash TEXT NOT NULL UNIQUE,
  canonical_continuity TEXT NOT NULL,
  status TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_continuity_registry_session_identity
  ON continuity_registry (session_id, identity_id, status, expires_at);

CREATE TABLE IF NOT EXISTS authority_registry (
  authority_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL UNIQUE,
  identity_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  intent TEXT NOT NULL,
  scope TEXT NOT NULL,
  constraints TEXT NOT NULL,
  expiry TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_authority_registry_decision_id
  ON authority_registry (decision_id);

CREATE TABLE IF NOT EXISTS aeo_registry (
  aeo_id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  canonical_aeo TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aeo_registry_decision_id
  ON aeo_registry (decision_id);

CREATE INDEX IF NOT EXISTS idx_aeo_registry_decision_hash
  ON aeo_registry (decision_id, validated_object_hash);

CREATE TABLE IF NOT EXISTS preo_registry (
  preo_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  reviewed_hash TEXT NOT NULL,
  reviewed_tree_hash TEXT,
  merge_commit_sha TEXT,
  canonical_preo TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(decision_id, reviewed_hash)
);

CREATE INDEX IF NOT EXISTS idx_preo_registry_decision_hash
  ON preo_registry (decision_id, reviewed_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_preo_registry_lineage_unique
  ON preo_registry (decision_id, reviewed_hash, reviewed_tree_hash, merge_commit_sha);

CREATE TABLE IF NOT EXISTS validation_registry (
  validation_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  environment TEXT,
  result TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_validation_registry_decision_hash_nonce
  ON validation_registry (decision_id, validated_object_hash, invocation_nonce);

CREATE TABLE IF NOT EXISTS execution_registry (
  execution_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  repository TEXT,
  branch TEXT,
  pull_request_id TEXT,
  merge_commit_sha TEXT,
  source_tree_hash TEXT,
  workflow_run_id TEXT,
  workflow_sha TEXT,
  UNIQUE(decision_id, validated_object_hash),
  UNIQUE(workflow_run_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_registry_decision_hash
  ON execution_registry (decision_id, validated_object_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_registry_workflow_run_unique
  ON execution_registry (workflow_run_id);

CREATE TABLE IF NOT EXISTS proof_registry (
  proof_id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  continuity_hash TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  authority_lineage TEXT NOT NULL,
  execution_lineage TEXT NOT NULL,
  surface TEXT,
  run_id TEXT,
  commit_sha TEXT,
  workflow TEXT,
  environment TEXT,
  created_at TEXT NOT NULL,
  repository TEXT,
  branch TEXT,
  pull_request_id TEXT,
  merge_commit_sha TEXT,
  source_tree_hash TEXT,
  workflow_run_id TEXT,
  workflow_sha TEXT,
  UNIQUE(decision_id, validated_object_hash),
  UNIQUE(workflow_run_id)
);

CREATE INDEX IF NOT EXISTS idx_proof_registry_execution_decision_hash
  ON proof_registry (execution_id, decision_id, validated_object_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_workflow_run_unique
  ON proof_registry (workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_proof_registry_provenance
  ON proof_registry (repository, branch, pull_request_id, merge_commit_sha, workflow_run_id);

CREATE TABLE IF NOT EXISTS proof_registry_duplicate_archive (
  archive_id TEXT PRIMARY KEY,
  proof_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  surface TEXT,
  run_id TEXT,
  commit_sha TEXT,
  workflow TEXT,
  environment TEXT,
  created_at TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  archive_reason TEXT NOT NULL,
  canonical_proof_id TEXT NOT NULL,
  UNIQUE(proof_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique
  ON proof_registry (decision_id, validated_object_hash);

CREATE TABLE IF NOT EXISTS invocation_registry (
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  continuity_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce)
);

CREATE TABLE IF NOT EXISTS observability_registry (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  decision_id TEXT,
  authority_id TEXT,
  execution_id TEXT,
  proof_id TEXT,
  severity TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_observability_decision
  ON observability_registry (decision_id);

CREATE INDEX IF NOT EXISTS idx_observability_execution
  ON observability_registry (execution_id);

CREATE INDEX IF NOT EXISTS idx_observability_type
  ON observability_registry (event_type);

CREATE TABLE IF NOT EXISTS drift_registry (
  drift_id TEXT PRIMARY KEY,
  drift_class TEXT NOT NULL,
  severity TEXT NOT NULL,
  decision_id TEXT,
  execution_id TEXT,
  payload TEXT NOT NULL,
  detected_by TEXT NOT NULL,
  resolution_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attestation_registry (
  attestation_id TEXT PRIMARY KEY,
  envelope_hash TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  payload_type TEXT NOT NULL,
  signer_identity TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  repository TEXT NOT NULL,
  branch TEXT NOT NULL,
  pull_request_id TEXT NOT NULL,
  merge_commit_sha TEXT NOT NULL,
  source_tree_hash TEXT NOT NULL,
  workflow_run_id TEXT NOT NULL,
  workflow_sha TEXT NOT NULL,
  canonical_aeo_hash TEXT NOT NULL,
  transparency_log_id TEXT NOT NULL,
  transparency_integrated_time TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(workflow_run_id),
  UNIQUE(decision_id, validated_object_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_envelope_unique
  ON attestation_registry (envelope_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_workflow_run_unique
  ON attestation_registry (workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_attestation_registry_lineage
  ON attestation_registry (decision_id, validated_object_hash, workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_attestation_registry_transparency
  ON attestation_registry (transparency_log_id, transparency_integrated_time);
