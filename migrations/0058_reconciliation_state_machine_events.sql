-- Migration: 0058_reconciliation_state_machine_events
-- Purpose: Persist reconciliation state machine records, downgrade events, and upgrade events.
-- Slice H: Reconciliation State Machine + Downgrade/Upgrade Events.
-- Evidence-only: reconciliation classification ≠ authority. No UPDATE/DELETE permitted.
-- Append-only: downgrade and upgrade events are immutable once written.
-- Invariants: creates_authority=0, restores_replay=0, raw_production_apply_path='DENIED'
-- Anchor issue: #1405  Supporting: #1339, #1418, #1442, #1347, #1414, #1441, #1443
-- Depends on: 0052 (epoch_registry), 0051 (revocation_liveness_registry)

-- ── reconciliation_state_record ───────────────────────────────────────────────
-- One record per reconciliation state snapshot.
-- Tracks current state, lineage evidence, and classification evidence.
CREATE TABLE IF NOT EXISTS reconciliation_state_record (
  reconciliation_state_id     TEXT    NOT NULL PRIMARY KEY,
  reconciliation_id           TEXT    NOT NULL,
  reconciliation_state        TEXT    NOT NULL
    CHECK(reconciliation_state IN (
      'OBSERVED','PENDING','PARTITIONED','RECONCILING','CONFLICTED',
      'SETTLEMENT_CANDIDATE','CONVERGED','FINALIZED','REVOKED','STALE_VISIBLE','NULL'
    )),
  classification              TEXT    NOT NULL,
  lineage_stale               INTEGER NOT NULL DEFAULT 0 CHECK(lineage_stale IN (0,1)),
  has_revocation              INTEGER NOT NULL DEFAULT 0 CHECK(has_revocation IN (0,1)),
  replay_divergent            INTEGER NOT NULL DEFAULT 0 CHECK(replay_divergent IN (0,1)),
  conflict_set_unresolved     INTEGER NOT NULL DEFAULT 0 CHECK(conflict_set_unresolved IN (0,1)),
  proof_lineage_detached      INTEGER NOT NULL DEFAULT 0 CHECK(proof_lineage_detached IN (0,1)),
  topology_visible            INTEGER NOT NULL DEFAULT 1 CHECK(topology_visible IN (0,1)),
  epoch_stale                 INTEGER NOT NULL DEFAULT 0 CHECK(epoch_stale IN (0,1)),
  epoch_mismatched            INTEGER NOT NULL DEFAULT 0 CHECK(epoch_mismatched IN (0,1)),
  convergence_evidence_present INTEGER NOT NULL DEFAULT 0 CHECK(convergence_evidence_present IN (0,1)),
  partition_detected          INTEGER NOT NULL DEFAULT 0 CHECK(partition_detected IN (0,1)),
  settlement_candidate        INTEGER NOT NULL DEFAULT 0 CHECK(settlement_candidate IN (0,1)),
  finalized                   INTEGER NOT NULL DEFAULT 0 CHECK(finalized IN (0,1)),
  evidence_refs_json          TEXT    NOT NULL DEFAULT '[]',
  epoch_id                    TEXT,
  created_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  -- Evidence-only discipline
  evidence_only               INTEGER NOT NULL DEFAULT 1 CHECK(evidence_only = 1),
  creates_authority           INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  restores_replay             INTEGER NOT NULL DEFAULT 0 CHECK(restores_replay = 0),
  raw_production_apply_path   TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: fast lookup by reconciliation_id
CREATE INDEX IF NOT EXISTS idx_rsr_reconciliation_id
  ON reconciliation_state_record(reconciliation_id);

-- Index: filter by state
CREATE INDEX IF NOT EXISTS idx_rsr_reconciliation_state
  ON reconciliation_state_record(reconciliation_state);

-- Index: temporal ordering for audit
CREATE INDEX IF NOT EXISTS idx_rsr_created_at
  ON reconciliation_state_record(created_at);

-- Index: epoch coupling
CREATE INDEX IF NOT EXISTS idx_rsr_epoch_id
  ON reconciliation_state_record(epoch_id);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS rsr_no_update
  BEFORE UPDATE ON reconciliation_state_record
BEGIN
  SELECT RAISE(ABORT, 'reconciliation_state_record is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS rsr_no_delete
  BEFORE DELETE ON reconciliation_state_record
BEGIN
  SELECT RAISE(ABORT, 'reconciliation_state_record is append-only: DELETE is forbidden');
END;

-- Reconciliation cannot create authority: FINALIZED state must not be executable
CREATE TRIGGER IF NOT EXISTS rsr_no_authority_creation
  BEFORE INSERT ON reconciliation_state_record
BEGIN
  SELECT CASE
    WHEN NEW.creates_authority != 0
    THEN RAISE(ABORT, 'reconciliation cannot create authority: creates_authority must be 0')
  END;
END;

-- Reconciliation cannot restore replay eligibility
CREATE TRIGGER IF NOT EXISTS rsr_no_replay_restoration
  BEFORE INSERT ON reconciliation_state_record
BEGIN
  SELECT CASE
    WHEN NEW.restores_replay != 0
    THEN RAISE(ABORT, 'reconciliation cannot restore replay eligibility: restores_replay must be 0')
  END;
END;

-- raw_production_apply_path must be DENIED
CREATE TRIGGER IF NOT EXISTS rsr_raw_production_path_denied
  BEFORE INSERT ON reconciliation_state_record
BEGIN
  SELECT CASE
    WHEN NEW.raw_production_apply_path != 'DENIED'
    THEN RAISE(ABORT, 'reconciliation_state_record raw_production_apply_path must be DENIED')
  END;
END;

-- Revoked state: has_revocation must be set when state is REVOKED
CREATE TRIGGER IF NOT EXISTS rsr_revoked_requires_revocation_evidence
  BEFORE INSERT ON reconciliation_state_record
  WHEN NEW.reconciliation_state = 'REVOKED'
BEGIN
  SELECT CASE
    WHEN NEW.has_revocation = 0
    THEN RAISE(ABORT, 'REVOKED state requires has_revocation=1')
  END;
END;

-- NULL terminal: replay_divergent must not yield non-NULL state
CREATE TRIGGER IF NOT EXISTS rsr_replay_divergent_yields_null
  BEFORE INSERT ON reconciliation_state_record
  WHEN NEW.replay_divergent = 1
BEGIN
  SELECT CASE
    WHEN NEW.reconciliation_state NOT IN ('NULL')
    THEN RAISE(ABORT, 'replay_divergent reconciliation must yield NULL state')
  END;
END;

-- ── reconciliation_downgrade_event ────────────────────────────────────────────
-- Immutable record of a reconciliation state downgrade.
-- Downgrade may move toward STALE_VISIBLE / PARTITIONED / CONFLICTED / REVOKED / NULL.
CREATE TABLE IF NOT EXISTS reconciliation_downgrade_event (
  event_id                    TEXT    NOT NULL PRIMARY KEY,
  reconciliation_id           TEXT    NOT NULL,
  from_state                  TEXT    NOT NULL
    CHECK(from_state IN (
      'OBSERVED','PENDING','PARTITIONED','RECONCILING','CONFLICTED',
      'SETTLEMENT_CANDIDATE','CONVERGED','FINALIZED','REVOKED','STALE_VISIBLE','NULL'
    )),
  to_state                    TEXT    NOT NULL
    CHECK(to_state IN (
      'STALE_VISIBLE','PARTITIONED','CONFLICTED','REVOKED','NULL'
    )),
  reason_code                 TEXT    NOT NULL,
  timestamp_utc               TEXT    NOT NULL,
  evidence_refs_json          TEXT    NOT NULL DEFAULT '[]',
  created_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  -- Evidence-only discipline
  creates_authority           INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  restores_replay             INTEGER NOT NULL DEFAULT 0 CHECK(restores_replay = 0),
  raw_production_apply_path   TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: all downgrade events for a given reconciliation
CREATE INDEX IF NOT EXISTS idx_rde_reconciliation_id
  ON reconciliation_downgrade_event(reconciliation_id);

-- Index: filter by target state
CREATE INDEX IF NOT EXISTS idx_rde_to_state
  ON reconciliation_downgrade_event(to_state);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS rde_no_update
  BEFORE UPDATE ON reconciliation_downgrade_event
BEGIN
  SELECT RAISE(ABORT, 'reconciliation_downgrade_event is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS rde_no_delete
  BEFORE DELETE ON reconciliation_downgrade_event
BEGIN
  SELECT RAISE(ABORT, 'reconciliation_downgrade_event is append-only: DELETE is forbidden');
END;

-- Downgrade cannot create authority
CREATE TRIGGER IF NOT EXISTS rde_no_authority_creation
  BEFORE INSERT ON reconciliation_downgrade_event
BEGIN
  SELECT CASE
    WHEN NEW.creates_authority != 0
    THEN RAISE(ABORT, 'reconciliation downgrade event cannot create authority')
  END;
END;

-- Downgrade cannot restore replay eligibility
CREATE TRIGGER IF NOT EXISTS rde_no_replay_restoration
  BEFORE INSERT ON reconciliation_downgrade_event
BEGIN
  SELECT CASE
    WHEN NEW.restores_replay != 0
    THEN RAISE(ABORT, 'reconciliation downgrade event cannot restore replay eligibility')
  END;
END;

-- ── reconciliation_upgrade_event ──────────────────────────────────────────────
-- Immutable record of a reconciliation state upgrade.
-- Upgrade may move toward CONVERGED only with convergence evidence.
-- Upgrade must not create authority. Upgrade must not restore replay eligibility.
CREATE TABLE IF NOT EXISTS reconciliation_upgrade_event (
  event_id                    TEXT    NOT NULL PRIMARY KEY,
  reconciliation_id           TEXT    NOT NULL,
  from_state                  TEXT    NOT NULL
    CHECK(from_state IN (
      'OBSERVED','PENDING','PARTITIONED','RECONCILING','CONFLICTED',
      'SETTLEMENT_CANDIDATE','CONVERGED','FINALIZED','REVOKED','STALE_VISIBLE','NULL'
    )),
  to_state                    TEXT    NOT NULL
    CHECK(to_state IN (
      'PENDING','RECONCILING','SETTLEMENT_CANDIDATE','CONVERGED','FINALIZED'
    )),
  reason_code                 TEXT    NOT NULL,
  timestamp_utc               TEXT    NOT NULL,
  evidence_refs_json          TEXT    NOT NULL DEFAULT '[]',
  convergence_evidence_present INTEGER NOT NULL DEFAULT 0 CHECK(convergence_evidence_present IN (0,1)),
  created_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  -- Evidence-only discipline; upgrade cannot create authority or restore replay eligibility
  creates_authority           INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  restores_replay             INTEGER NOT NULL DEFAULT 0 CHECK(restores_replay = 0),
  raw_production_apply_path   TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: all upgrade events for a given reconciliation
CREATE INDEX IF NOT EXISTS idx_rue_reconciliation_id
  ON reconciliation_upgrade_event(reconciliation_id);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS rue_no_update
  BEFORE UPDATE ON reconciliation_upgrade_event
BEGIN
  SELECT RAISE(ABORT, 'reconciliation_upgrade_event is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS rue_no_delete
  BEFORE DELETE ON reconciliation_upgrade_event
BEGIN
  SELECT RAISE(ABORT, 'reconciliation_upgrade_event is append-only: DELETE is forbidden');
END;

-- Upgrade to CONVERGED requires convergence evidence
CREATE TRIGGER IF NOT EXISTS rue_converged_requires_evidence
  BEFORE INSERT ON reconciliation_upgrade_event
  WHEN NEW.to_state = 'CONVERGED'
BEGIN
  SELECT CASE
    WHEN NEW.convergence_evidence_present = 0
    THEN RAISE(ABORT, 'upgrade to CONVERGED requires convergence_evidence_present=1')
  END;
END;

-- Upgrade cannot create authority (defense-in-depth)
CREATE TRIGGER IF NOT EXISTS rue_no_authority_creation
  BEFORE INSERT ON reconciliation_upgrade_event
BEGIN
  SELECT CASE
    WHEN NEW.creates_authority != 0
    THEN RAISE(ABORT, 'reconciliation upgrade event cannot create authority')
  END;
END;

-- Upgrade cannot restore replay eligibility (defense-in-depth)
CREATE TRIGGER IF NOT EXISTS rue_no_replay_restoration
  BEFORE INSERT ON reconciliation_upgrade_event
BEGIN
  SELECT CASE
    WHEN NEW.restores_replay != 0
    THEN RAISE(ABORT, 'reconciliation upgrade event cannot restore replay eligibility')
  END;
END;
