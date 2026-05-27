-- Migration: 0060_causal_legitimacy_clock_registry
-- Purpose: Persist causal legitimacy clock evidence for happens-before ordering and ambiguity detection.
-- Slice J: Causal Legitimacy Clocks.
-- Evidence-only: causal ordering ≠ authority; clock evidence ≠ execution eligibility.
-- Append-only: no UPDATE or DELETE permitted on any row.
-- Ambiguity evidence and concurrent root evidence are always preserved — never collapsed.
-- Anchor issues: #1338, #1346  Supporting: #1418, #1340, #1405, #1408, #1442, #1441

CREATE TABLE IF NOT EXISTS causal_legitimacy_clock_registry (
  clock_id                       TEXT    NOT NULL PRIMARY KEY,
  -- clc_<sha256> — deterministic, unique per (node_id, epoch_id, created_at)
  epoch_id                       TEXT    NOT NULL,
  -- Epoch coupling: clock is bound to this epoch
  node_id                        TEXT    NOT NULL,
  -- Originating node that advanced this vector clock
  vector_json                    TEXT    NOT NULL DEFAULT '{}',
  -- JSON object: { "node_id": logical_timestamp, ... } — per-node Lamport counters
  observed_events_json           TEXT    NOT NULL DEFAULT '[]',
  -- JSON array of event identifiers observed at clock creation
  happens_before_json            TEXT    NOT NULL DEFAULT '[]',
  -- JSON array of clock_ids that happen-before this clock (deterministic ordering)
  concurrent_with_json           TEXT    NOT NULL DEFAULT '[]',
  -- JSON array of clock_ids concurrent with this clock (ambiguity evidence)
  ambiguity_detected             INTEGER NOT NULL DEFAULT 0
    CHECK(ambiguity_detected IN (0, 1)),
  -- 1 when ordering cannot be deterministically resolved; blocks CONVERGENCE_VALID
  topology_snapshot_hash         TEXT    NULL,
  -- Optional: topology snapshot hash at clock creation time
  created_at                     TEXT    NOT NULL,
  -- ISO 8601 creation timestamp

  -- Evidence-only discipline: invariant flags enforced on every row
  creates_authority              INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  creates_execution              INTEGER NOT NULL DEFAULT 0 CHECK(creates_execution = 0),
  raw_production_apply_path      TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: epoch coupling — find all clocks for an epoch
CREATE INDEX IF NOT EXISTS idx_clcr_epoch_id
  ON causal_legitimacy_clock_registry(epoch_id);

-- Index: node_id — find all clocks originating from a node
CREATE INDEX IF NOT EXISTS idx_clcr_node_id
  ON causal_legitimacy_clock_registry(node_id);

-- Index: ambiguity detection — find ambiguous clocks for gating queries
CREATE INDEX IF NOT EXISTS idx_clcr_ambiguity_detected
  ON causal_legitimacy_clock_registry(ambiguity_detected);

-- Index: temporal ordering for audit
CREATE INDEX IF NOT EXISTS idx_clcr_created_at
  ON causal_legitimacy_clock_registry(created_at);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS clcr_no_update
  BEFORE UPDATE ON causal_legitimacy_clock_registry
BEGIN
  SELECT RAISE(ABORT, 'causal_legitimacy_clock_registry is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS clcr_no_delete
  BEFORE DELETE ON causal_legitimacy_clock_registry
BEGIN
  SELECT RAISE(ABORT, 'causal_legitimacy_clock_registry is append-only: DELETE is forbidden');
END;

-- creates_authority must always be 0: causal ordering cannot create authority
CREATE TRIGGER IF NOT EXISTS clcr_no_authority_creation
  BEFORE INSERT ON causal_legitimacy_clock_registry
BEGIN
  SELECT CASE
    WHEN NEW.creates_authority != 0
    THEN RAISE(ABORT, 'causal_legitimacy_clock: creates_authority must be 0 — causal ordering cannot create authority')
  END;
END;

-- creates_execution must always be 0: causal ordering cannot create execution eligibility
CREATE TRIGGER IF NOT EXISTS clcr_no_execution_creation
  BEFORE INSERT ON causal_legitimacy_clock_registry
BEGIN
  SELECT CASE
    WHEN NEW.creates_execution != 0
    THEN RAISE(ABORT, 'causal_legitimacy_clock: creates_execution must be 0 — causal ordering cannot create execution eligibility')
  END;
END;

-- Ambiguity evidence must be preserved: ambiguous clocks cannot be silently cleared
-- A clock with ambiguity_detected=1 must retain concurrent_with_json evidence.
-- ambiguity cannot be collapsed into convergence.
CREATE TRIGGER IF NOT EXISTS clcr_ambiguity_preserves_concurrent_evidence
  BEFORE INSERT ON causal_legitimacy_clock_registry
  WHEN NEW.ambiguity_detected = 1
BEGIN
  SELECT CASE
    WHEN NEW.concurrent_with_json = '[]' AND NEW.happens_before_json = '[]'
    THEN RAISE(ABORT, 'causal_legitimacy_clock: ambiguous clock must carry concurrent_with or happens_before evidence — ambiguity cannot be collapsed into convergence')
  END;
END;
