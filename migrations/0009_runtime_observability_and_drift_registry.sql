CREATE TABLE observability_registry (
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

CREATE INDEX idx_observability_decision
ON observability_registry(decision_id);
CREATE INDEX idx_observability_execution
ON observability_registry(execution_id);
CREATE INDEX idx_observability_type
ON observability_registry(event_type);

CREATE TABLE drift_registry (
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
