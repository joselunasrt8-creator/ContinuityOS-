-- Migration: 0057_conflict_set_envelope_settlement
-- Purpose: Persist ConflictSetEnvelope records — competing proof roots, winning root,
-- losing roots (append-only accumulation), settlement state, and settlement evidence.
-- Slice E: ConflictSetEnvelope + Settlement Determinism.
-- Evidence-only: settlement ≠ authority; losing branches are preserved, not erased.
-- Append-only: no UPDATE or DELETE permitted on any row.
-- Anchor issue: #1441  Supporting: #1348, #1418, #1442, #1347, #1414

CREATE TABLE IF NOT EXISTS conflict_set_envelope_registry (
  conflict_id               TEXT    NOT NULL PRIMARY KEY,
  detected_at               TEXT    NOT NULL,
  competing_roots_json      TEXT    NOT NULL,
  -- JSON array: [{root_hash, proof_id, validator_attestations, causal_clock, branch_evidence}]
  winning_root              TEXT,
  -- nullable until SETTLED; absent when UNSETTLEABLE or NULL
  losing_roots_json         TEXT    NOT NULL DEFAULT '[]',
  -- JSON array of root_hash strings; append-only accumulation; never empty after SETTLED
  settlement_state          TEXT    NOT NULL
    CHECK(settlement_state IN ('DETECTING','CONFLICTED','SETTLEMENT_CANDIDATE','SETTLED','UNSETTLEABLE','NULL')),
  settlement_evidence_json  TEXT    NOT NULL DEFAULT '{}',
  epoch_id                  TEXT    NOT NULL,

  -- Evidence-only discipline: invariant flags enforced on every row
  evidence_only             INTEGER NOT NULL DEFAULT 1 CHECK(evidence_only = 1),
  creates_authority         INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  restores_replay           INTEGER NOT NULL DEFAULT 0 CHECK(restores_replay = 0),
  raw_production_apply_path TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: fast lookup by settlement state (e.g. find all CONFLICTED envelopes)
CREATE INDEX IF NOT EXISTS idx_cse_settlement_state
  ON conflict_set_envelope_registry(settlement_state);

-- Index: temporal ordering for audit
CREATE INDEX IF NOT EXISTS idx_cse_detected_at
  ON conflict_set_envelope_registry(detected_at);

-- Index: epoch coupling
CREATE INDEX IF NOT EXISTS idx_cse_epoch_id
  ON conflict_set_envelope_registry(epoch_id);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS cse_no_update
  BEFORE UPDATE ON conflict_set_envelope_registry
BEGIN
  SELECT RAISE(ABORT, 'conflict_set_envelope_registry is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS cse_no_delete
  BEFORE DELETE ON conflict_set_envelope_registry
BEGIN
  SELECT RAISE(ABORT, 'conflict_set_envelope_registry is append-only: DELETE is forbidden');
END;

-- SETTLED state requires winning_root to be set
CREATE TRIGGER IF NOT EXISTS cse_settled_requires_winner
  BEFORE INSERT ON conflict_set_envelope_registry
  WHEN NEW.settlement_state = 'SETTLED'
BEGIN
  SELECT CASE
    WHEN NEW.winning_root IS NULL
    THEN RAISE(ABORT, 'SETTLED conflict_set_envelope requires winning_root to be set')
  END;
END;

-- UNSETTLEABLE and NULL states must not carry a winning_root (no phantom authority)
CREATE TRIGGER IF NOT EXISTS cse_unsettleable_no_winner
  BEFORE INSERT ON conflict_set_envelope_registry
  WHEN NEW.settlement_state IN ('UNSETTLEABLE','NULL')
BEGIN
  SELECT CASE
    WHEN NEW.winning_root IS NOT NULL
    THEN RAISE(ABORT, 'UNSETTLEABLE or NULL conflict_set_envelope must not have winning_root set')
  END;
END;

-- creates_authority must always be 0: settlement cannot create authority
CREATE TRIGGER IF NOT EXISTS cse_no_authority_creation
  BEFORE INSERT ON conflict_set_envelope_registry
BEGIN
  SELECT CASE
    WHEN NEW.creates_authority != 0
    THEN RAISE(ABORT, 'conflict_set_envelope: creates_authority must be 0 — settlement cannot create authority')
  END;
END;

-- restores_replay must always be 0: settlement cannot restore replay eligibility
CREATE TRIGGER IF NOT EXISTS cse_no_replay_restoration
  BEFORE INSERT ON conflict_set_envelope_registry
BEGIN
  SELECT CASE
    WHEN NEW.restores_replay != 0
    THEN RAISE(ABORT, 'conflict_set_envelope: restores_replay must be 0 — settlement cannot restore replay eligibility')
  END;
END;
