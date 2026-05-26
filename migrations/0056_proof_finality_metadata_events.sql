-- Migration: 0056_proof_finality_metadata_events
-- Purpose: Persist ProofFinalityMetadata, ProofDowngradeEvent, and ProofUpgradeEvent records.
-- Evidence-only: proof finality metadata ≠ authority. No UPDATE/DELETE permitted on any table.
-- Append-only: downgrade and upgrade events are immutable once written.
-- Depends on: 0042 (proof_execution_lineage_binding), 0052 (epoch_registry)

-- ── proof_finality_metadata ────────────────────────────────────────────────────
-- One metadata record per proof classification snapshot.
-- Tracks finality classification, detach status, and epoch/topology binding.
CREATE TABLE IF NOT EXISTS proof_finality_metadata (
  proof_finality_metadata_id  TEXT    NOT NULL PRIMARY KEY,
  proof_id                    TEXT    NOT NULL,
  finality_classification     TEXT    NOT NULL
    CHECK(finality_classification IN (
      'LOCAL_VALID','CONVERGENCE_VALID','GLOBAL_VALID',
      'AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL'
    )),
  topology_snapshot_hash      TEXT    NOT NULL,
  epoch_id                    TEXT    NOT NULL,
  detached                    INTEGER NOT NULL DEFAULT 0 CHECK(detached IN (0,1)),
  detach_reason               TEXT    CHECK(detach_reason IN (
    'missing_continuity_lineage',
    'missing_validated_object_hash',
    'missing_execution_lineage',
    'stale_proof_reuse'
  )),
  created_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- Evidence-only discipline
  creates_authority           INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  restores_replay             INTEGER NOT NULL DEFAULT 0 CHECK(restores_replay = 0),
  raw_production_apply_path   TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: all finality records for a given proof
CREATE INDEX IF NOT EXISTS idx_pfm_proof_id
  ON proof_finality_metadata(proof_id);

-- Index: filter by classification
CREATE INDEX IF NOT EXISTS idx_pfm_finality_classification
  ON proof_finality_metadata(finality_classification);

-- Index: filter by detached flag
CREATE INDEX IF NOT EXISTS idx_pfm_detached
  ON proof_finality_metadata(detached);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS pfm_no_update
  BEFORE UPDATE ON proof_finality_metadata
BEGIN
  SELECT RAISE(ABORT, 'proof_finality_metadata is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS pfm_no_delete
  BEFORE DELETE ON proof_finality_metadata
BEGIN
  SELECT RAISE(ABORT, 'proof_finality_metadata is append-only: DELETE is forbidden');
END;

-- Detached proof classification must be NULL or STALE_VISIBLE
CREATE TRIGGER IF NOT EXISTS pfm_detached_must_be_null_or_stale
  BEFORE INSERT ON proof_finality_metadata
  WHEN NEW.detached = 1
BEGIN
  SELECT CASE
    WHEN NEW.finality_classification NOT IN ('NULL', 'STALE_VISIBLE')
    THEN RAISE(ABORT, 'detached proof finality_classification must be NULL or STALE_VISIBLE')
  END;
END;

-- ── proof_downgrade_event ──────────────────────────────────────────────────────
-- Immutable record of a proof classification downgrade.
-- Downgrade may move proof toward PARTITION_SUSPENDED, STALE_VISIBLE, AMBIGUOUS, or NULL.
CREATE TABLE IF NOT EXISTS proof_downgrade_event (
  event_id                    TEXT    NOT NULL PRIMARY KEY,
  proof_id                    TEXT    NOT NULL,
  from_classification         TEXT    NOT NULL
    CHECK(from_classification IN (
      'LOCAL_VALID','CONVERGENCE_VALID','GLOBAL_VALID',
      'AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL'
    )),
  to_classification           TEXT    NOT NULL
    CHECK(to_classification IN (
      'LOCAL_VALID','CONVERGENCE_VALID','GLOBAL_VALID',
      'AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL'
    )),
  reason_code                 TEXT    NOT NULL,
  timestamp_utc               TEXT    NOT NULL,
  evidence_ref                TEXT,
  created_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- Evidence-only discipline
  creates_authority           INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  restores_replay             INTEGER NOT NULL DEFAULT 0 CHECK(restores_replay = 0),
  raw_production_apply_path   TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: all downgrade events for a given proof
CREATE INDEX IF NOT EXISTS idx_pde_proof_id
  ON proof_downgrade_event(proof_id);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS pde_no_update
  BEFORE UPDATE ON proof_downgrade_event
BEGIN
  SELECT RAISE(ABORT, 'proof_downgrade_event is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS pde_no_delete
  BEFORE DELETE ON proof_downgrade_event
BEGIN
  SELECT RAISE(ABORT, 'proof_downgrade_event is append-only: DELETE is forbidden');
END;

-- ── proof_upgrade_event ────────────────────────────────────────────────────────
-- Immutable record of a proof classification upgrade.
-- Upgrade may move proof toward CONVERGENCE_VALID only when evidence exists.
-- Upgrade must not create authority. Upgrade must not restore replay eligibility.
CREATE TABLE IF NOT EXISTS proof_upgrade_event (
  event_id                    TEXT    NOT NULL PRIMARY KEY,
  proof_id                    TEXT    NOT NULL,
  from_classification         TEXT    NOT NULL
    CHECK(from_classification IN (
      'LOCAL_VALID','CONVERGENCE_VALID','GLOBAL_VALID',
      'AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL'
    )),
  to_classification           TEXT    NOT NULL
    CHECK(to_classification IN (
      'LOCAL_VALID','CONVERGENCE_VALID','GLOBAL_VALID',
      'AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL'
    )),
  reason_code                 TEXT    NOT NULL,
  timestamp_utc               TEXT    NOT NULL,
  evidence_ref                TEXT,
  created_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- Evidence-only discipline; upgrade cannot create authority or restore replay eligibility
  creates_authority           INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  restores_replay             INTEGER NOT NULL DEFAULT 0 CHECK(restores_replay = 0),
  raw_production_apply_path   TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: all upgrade events for a given proof
CREATE INDEX IF NOT EXISTS idx_pue_proof_id
  ON proof_upgrade_event(proof_id);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS pue_no_update
  BEFORE UPDATE ON proof_upgrade_event
BEGIN
  SELECT RAISE(ABORT, 'proof_upgrade_event is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS pue_no_delete
  BEFORE DELETE ON proof_upgrade_event
BEGIN
  SELECT RAISE(ABORT, 'proof_upgrade_event is append-only: DELETE is forbidden');
END;

-- Defense-in-depth: upgrade cannot create authority (CHECK already blocks this)
CREATE TRIGGER IF NOT EXISTS pue_upgrade_cannot_create_authority
  BEFORE INSERT ON proof_upgrade_event
BEGIN
  SELECT CASE
    WHEN NEW.creates_authority != 0
    THEN RAISE(ABORT, 'proof_upgrade_event cannot create authority')
  END;
END;

-- Defense-in-depth: upgrade cannot restore replay eligibility (CHECK already blocks this)
CREATE TRIGGER IF NOT EXISTS pue_upgrade_cannot_restore_replay
  BEFORE INSERT ON proof_upgrade_event
BEGIN
  SELECT CASE
    WHEN NEW.restores_replay != 0
    THEN RAISE(ABORT, 'proof_upgrade_event cannot restore replay eligibility')
  END;
END;
