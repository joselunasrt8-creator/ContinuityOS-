CREATE TABLE IF NOT EXISTS continuous_fate_registry (
  continuous_fate_id TEXT PRIMARY KEY,
  stress_window_id TEXT NOT NULL,
  deterministic_stress_hash TEXT NOT NULL,
  topology_stability_hash TEXT NOT NULL,
  drift_survivability_state TEXT NOT NULL CHECK (drift_survivability_state IN ('SURVIVED','FAIL_CLOSED','NULL')),
  replay_mutation_vector_hash TEXT NOT NULL,
  governance_replay_checkpoint TEXT NOT NULL,
  runtime_stress_depth TEXT NOT NULL,
  scenario_set_hash TEXT NOT NULL,
  drift_classes TEXT NOT NULL,
  checkpoint_hash TEXT NOT NULL,
  evidence_only TEXT NOT NULL CHECK (evidence_only='true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral='true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable='false'),
  remote_authority_denied TEXT NOT NULL CHECK (remote_authority_denied='true'),
  read_only TEXT NOT NULL CHECK (read_only='true'),
  creates_authority TEXT NOT NULL CHECK (creates_authority='false'),
  execution_started TEXT NOT NULL CHECK (execution_started='false'),
  replay_consumed TEXT NOT NULL CHECK (replay_consumed='false'),
  authoritative TEXT NOT NULL CHECK (authoritative='false'),
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_continuous_fate_registry_checkpoint_unique
  ON continuous_fate_registry(checkpoint_hash);

CREATE INDEX IF NOT EXISTS idx_continuous_fate_registry_deterministic
  ON continuous_fate_registry(stress_window_id, deterministic_stress_hash, topology_stability_hash);

CREATE INDEX IF NOT EXISTS idx_continuous_fate_registry_replay_checkpoint
  ON continuous_fate_registry(replay_mutation_vector_hash, governance_replay_checkpoint);

CREATE TRIGGER IF NOT EXISTS trg_continuous_fate_registry_no_update
BEFORE UPDATE ON continuous_fate_registry
BEGIN
  SELECT RAISE(ABORT, 'continuous_fate_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_continuous_fate_registry_no_delete
BEFORE DELETE ON continuous_fate_registry
BEGIN
  SELECT RAISE(ABORT, 'continuous_fate_registry is append-only');
END;
