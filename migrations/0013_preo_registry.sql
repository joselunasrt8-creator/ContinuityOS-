CREATE TABLE IF NOT EXISTS preo_registry (
  preo_id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  reviewed_hash TEXT NOT NULL,
  canonical_preo TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(decision_id, reviewed_hash)
);

CREATE INDEX IF NOT EXISTS idx_preo_registry_decision_hash
  ON preo_registry (decision_id, reviewed_hash);
