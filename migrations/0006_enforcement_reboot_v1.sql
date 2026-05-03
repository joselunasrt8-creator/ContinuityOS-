CREATE TABLE IF NOT EXISTS authority_registry (
  authority_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL,
  intent TEXT NOT NULL,
  scope TEXT NOT NULL,
  constraints TEXT NOT NULL,
  expiry TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aeo_registry (
  aeo_id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  canonical_aeo TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS validation_registry (
  validation_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  environment TEXT,
  result TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_registry (
  execution_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(decision_id, validated_object_hash)
);

CREATE TABLE IF NOT EXISTS proof_registry (
  proof_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  surface TEXT,
  run_id TEXT,
  commit_sha TEXT,
  workflow TEXT,
  environment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invocation_registry (
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce)
);
