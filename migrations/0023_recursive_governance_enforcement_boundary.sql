-- Recursive governance enforcement boundary.
-- Canonical invariant: a runtime mutation cannot activate unless VALID SCO + VALID PREO + exact object + canonical path + replay neutrality all hold.
CREATE TABLE IF NOT EXISTS runtime_governance_lock_registry (
  lock_id TEXT PRIMARY KEY,
  mutation_hash TEXT NOT NULL,
  governance_id TEXT NOT NULL,
  lock_state TEXT NOT NULL CHECK (lock_state IN ('LOCKED','NULL')),
  activation_allowed TEXT NOT NULL CHECK (activation_allowed IN ('true','false')),
  canonical_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (activation_allowed='true' AND lock_state='LOCKED')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_governance_lock_activation
  ON runtime_governance_lock_registry(mutation_hash, governance_id);

CREATE INDEX IF NOT EXISTS idx_runtime_governance_lock_canonical_hash
  ON runtime_governance_lock_registry(canonical_hash);

CREATE TABLE IF NOT EXISTS recursive_governance_replay_registry (
  replay_id TEXT PRIMARY KEY,
  mutation_hash TEXT NOT NULL,
  sco_hash TEXT NOT NULL,
  preo_hash TEXT NOT NULL,
  governance_id TEXT NOT NULL,
  activation_lock_id TEXT NOT NULL,
  consumed_at TEXT NOT NULL,
  UNIQUE(mutation_hash, sco_hash, preo_hash),
  UNIQUE(governance_id)
);

CREATE INDEX IF NOT EXISTS idx_recursive_governance_replay_lock
  ON recursive_governance_replay_registry(activation_lock_id);

CREATE TRIGGER IF NOT EXISTS trg_runtime_governance_lock_registry_no_update
BEFORE UPDATE ON runtime_governance_lock_registry
BEGIN
  SELECT RAISE(ABORT, 'runtime_governance_lock_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_governance_lock_registry_no_delete
BEFORE DELETE ON runtime_governance_lock_registry
BEGIN
  SELECT RAISE(ABORT, 'runtime_governance_lock_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_replay_registry_no_update
BEFORE UPDATE ON recursive_governance_replay_registry
BEGIN
  SELECT RAISE(ABORT, 'recursive_governance_replay_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_recursive_governance_replay_registry_no_delete
BEFORE DELETE ON recursive_governance_replay_registry
BEGIN
  SELECT RAISE(ABORT, 'recursive_governance_replay_registry is append-only');
END;
