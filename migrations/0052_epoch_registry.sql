-- Migration: 0052_epoch_registry
-- Purpose: Persist globally authoritative epoch substrate records for distributed
-- legitimacy temporal convergence. Epoch records are classification evidence only;
-- they do not create authority and do not widen the execution surface.
-- Append-only: no UPDATE or DELETE permitted.
-- Depends on: 0048 (finality_classification_registry), 0050 (quorum_attestation_registry)

CREATE TABLE IF NOT EXISTS epoch_registry (
  epoch_id                        TEXT    NOT NULL PRIMARY KEY,
  epoch_scope                     TEXT    NOT NULL,
    -- GLOBAL | DOMAIN:<id> | PARTITION:<id> | LOCAL:<node_id>

  epoch_finality_status           TEXT    NOT NULL
    CHECK(epoch_finality_status IN (
      'EPOCH_LOCAL',
      'EPOCH_GLOBAL_CANDIDATE',
      'EPOCH_GLOBAL_AUTHORITATIVE',
      'EPOCH_AMBIGUOUS',
      'EPOCH_STALE_VISIBLE',
      'EPOCH_PARTITION_SUSPENDED',
      'EPOCH_CONFLICTED',
      'EPOCH_REVOKED',
      'EPOCH_NULL'
    )),

  -- Quorum and attestation binding (#1343)
  quorum_attestation_id           TEXT,     -- nullable: may precede full quorum
  epoch_quorum_profile            TEXT,     -- federation profile ID governing quorum math

  -- Causal frontier binding (#1346)
  epoch_causal_frontier           INTEGER,  -- highest causal_index causally within this epoch

  -- Replay frontier binding (#1347)
  epoch_replay_frontier           TEXT,     -- highest replay nonce consumed within epoch scope

  -- Reconciliation frontier binding (#1348)
  epoch_reconciliation_frontier   TEXT
    CHECK(epoch_reconciliation_frontier IS NULL OR epoch_reconciliation_frontier IN (
      'LOCAL_RECONCILED',
      'GLOBAL_RECONCILED_CANDIDATE',
      'AMBIGUOUS_RECONCILIATION',
      'AMBIGUOUS_REQUIRES_EPOCH',
      'NULL_RECONCILIATION'
    )),

  -- Revocation liveness frontier binding (#1344)
  epoch_revocation_frontier       TEXT,     -- last observed revocation liveness timestamp

  -- Finality classification linkage (#1340)
  finality_classification_id      TEXT,     -- nullable; populated after classification record exists

  -- Supersession chain (epoch lifecycle progression)
  supersedes_epoch_id             TEXT,     -- links prior epoch being superseded
  reason_code                     TEXT    NOT NULL,

  -- Evidence-only discipline flags
  evidence_only                   INTEGER NOT NULL DEFAULT 1 CHECK(evidence_only = 1),
  creates_authority               INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  creates_execution               INTEGER NOT NULL DEFAULT 0 CHECK(creates_execution = 0),

  -- Production apply path guard
  raw_production_apply_path       TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED'),

  created_at                      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Indexes for common lookup patterns
CREATE INDEX IF NOT EXISTS idx_er_epoch_scope
  ON epoch_registry(epoch_scope);

CREATE INDEX IF NOT EXISTS idx_er_epoch_finality_status
  ON epoch_registry(epoch_finality_status);

CREATE INDEX IF NOT EXISTS idx_er_supersedes
  ON epoch_registry(supersedes_epoch_id)
  WHERE supersedes_epoch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_er_created_at
  ON epoch_registry(created_at);

-- Append-only: no UPDATE
CREATE TRIGGER IF NOT EXISTS er_no_update
  BEFORE UPDATE ON epoch_registry
BEGIN
  SELECT RAISE(ABORT, 'epoch_registry is append-only: UPDATE is forbidden');
END;

-- Append-only: no DELETE
CREATE TRIGGER IF NOT EXISTS er_no_delete
  BEFORE DELETE ON epoch_registry
BEGIN
  SELECT RAISE(ABORT, 'epoch_registry is append-only: DELETE is forbidden');
END;

-- EPOCH_NULL is terminal: no supersession from NULL
CREATE TRIGGER IF NOT EXISTS er_no_upgrade_from_null
  BEFORE INSERT ON epoch_registry
  WHEN NEW.supersedes_epoch_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT epoch_finality_status FROM epoch_registry
          WHERE epoch_id = NEW.supersedes_epoch_id) = 'EPOCH_NULL'
    THEN RAISE(ABORT, 'EPOCH_NULL is terminal: supersession from EPOCH_NULL is forbidden')
  END;
END;

-- Supersession referential integrity
CREATE TRIGGER IF NOT EXISTS er_supersedes_must_exist
  BEFORE INSERT ON epoch_registry
  WHEN NEW.supersedes_epoch_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM epoch_registry
          WHERE epoch_id = NEW.supersedes_epoch_id) = 0
    THEN RAISE(ABORT, 'supersedes_epoch_id references non-existent epoch record')
  END;
END;

-- EPOCH_GLOBAL_AUTHORITATIVE requires quorum_attestation_id
CREATE TRIGGER IF NOT EXISTS er_authoritative_requires_quorum
  BEFORE INSERT ON epoch_registry
  WHEN NEW.epoch_finality_status = 'EPOCH_GLOBAL_AUTHORITATIVE'
BEGIN
  SELECT CASE
    WHEN NEW.quorum_attestation_id IS NULL
    THEN RAISE(ABORT, 'EPOCH_GLOBAL_AUTHORITATIVE requires quorum_attestation_id to be set')
  END;
END;

-- Quorum attestation referential integrity
CREATE TRIGGER IF NOT EXISTS er_quorum_attestation_must_exist
  BEFORE INSERT ON epoch_registry
  WHEN NEW.quorum_attestation_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM quorum_attestation_registry
          WHERE quorum_attestation_id = NEW.quorum_attestation_id) = 0
    THEN RAISE(ABORT, 'quorum_attestation_id references non-existent quorum attestation record')
  END;
END;

-- Finality classification referential integrity
CREATE TRIGGER IF NOT EXISTS er_finality_class_must_exist
  BEFORE INSERT ON epoch_registry
  WHEN NEW.finality_classification_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM finality_classification_registry
          WHERE finality_classification_id = NEW.finality_classification_id) = 0
    THEN RAISE(ABORT, 'finality_classification_id references non-existent finality classification record')
  END;
END;
