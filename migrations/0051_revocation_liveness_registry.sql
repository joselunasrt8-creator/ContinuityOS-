-- Migration: 0051_revocation_liveness_registry
-- Purpose: Persist revocation channel liveness evidence for the L (lineage freshness)
-- predicate in distributed legitimacy finality decisions.
-- Semantic prerequisite: docs/distributed-finality-arbitration-canon.md, Section 4
-- Distinct from federated_revocation_observability_registry (cross-runtime observation)
-- and attestation_registry (workflow provenance).
-- L=true when channel is within_sla; L=false triggers GLOBAL_VALID → STALE_VISIBLE
-- downgrade with reason_code='revocation_channel_silent'.
-- Append-only: no UPDATE or DELETE permitted.

CREATE TABLE IF NOT EXISTS revocation_liveness_registry (
  revocation_liveness_id      TEXT    NOT NULL PRIMARY KEY,
  channel_id                  TEXT    NOT NULL,
  -- Identifies the revocation channel being monitored
  channel_scope               TEXT    NOT NULL,
  -- GLOBAL | DOMAIN:<id> | PARTITION:<id> | LOCAL:<node_id>
  channel_type                TEXT    NOT NULL
    CHECK(channel_type IN ('authority','continuity','proof','epoch','session','validation')),
  -- Class of object whose revocation channel this monitors
  last_observed_at            TEXT    NOT NULL,
  -- ISO-8601 timestamp of most recent liveness observation for this channel
  max_allowed_silence_ms      INTEGER NOT NULL CHECK(max_allowed_silence_ms > 0),
  -- Policy silence threshold; from federation profile or governance config
  observed_silence_ms         INTEGER NOT NULL CHECK(observed_silence_ms >= 0),
  -- Silence duration at record creation time: (created_at - last_observed_at) in ms
  within_sla                  INTEGER NOT NULL DEFAULT 0 CHECK(within_sla IN (0,1)),
  -- 1 if observed_silence_ms <= max_allowed_silence_ms; drives L predicate
  federation_profile_id       TEXT,             -- nullable: federation profile governing this threshold
  finality_classification_id  TEXT,             -- nullable: linked finality classification record
  quorum_attestation_id       TEXT,             -- nullable: linked quorum attestation record
  epoch_id                    TEXT,             -- nullable: epoch forward-placeholder (#1249)
  reason_code                 TEXT    NOT NULL,
  created_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  -- Evidence-only discipline: liveness observation ≠ execution authority
  evidence_only               INTEGER NOT NULL DEFAULT 1 CHECK(evidence_only = 1),
  creates_authority           INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  creates_execution           INTEGER NOT NULL DEFAULT 0 CHECK(creates_execution = 0),
  replay_neutral              INTEGER NOT NULL DEFAULT 1 CHECK(replay_neutral = 1),
  mutates_registry            INTEGER NOT NULL DEFAULT 0 CHECK(mutates_registry = 0),

  raw_production_apply_path   TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: fast lookup of all liveness records for a channel
CREATE INDEX IF NOT EXISTS idx_rlr_channel_id
  ON revocation_liveness_registry(channel_id);

-- Index: find channels outside SLA efficiently
CREATE INDEX IF NOT EXISTS idx_rlr_within_sla
  ON revocation_liveness_registry(within_sla);

-- Index: all liveness records for a given scope
CREATE INDEX IF NOT EXISTS idx_rlr_channel_scope
  ON revocation_liveness_registry(channel_scope);

-- Index: temporal ordering for audit
CREATE INDEX IF NOT EXISTS idx_rlr_created_at
  ON revocation_liveness_registry(created_at);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS rlr_no_update
  BEFORE UPDATE ON revocation_liveness_registry
BEGIN
  SELECT RAISE(ABORT, 'revocation_liveness_registry is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS rlr_no_delete
  BEFORE DELETE ON revocation_liveness_registry
BEGIN
  SELECT RAISE(ABORT, 'revocation_liveness_registry is append-only: DELETE is forbidden');
END;

-- within_sla consistency: value must agree with silence math
CREATE TRIGGER IF NOT EXISTS rlr_within_sla_consistency
  BEFORE INSERT ON revocation_liveness_registry
BEGIN
  SELECT CASE
    WHEN NEW.within_sla = 1
      AND NEW.observed_silence_ms > NEW.max_allowed_silence_ms
    THEN RAISE(ABORT, 'within_sla=1 inconsistent: observed_silence_ms exceeds max_allowed_silence_ms')
    WHEN NEW.within_sla = 0
      AND NEW.observed_silence_ms <= NEW.max_allowed_silence_ms
    THEN RAISE(ABORT, 'within_sla=0 inconsistent: observed_silence_ms is within max_allowed_silence_ms')
  END;
END;

-- finality_classification_id referential integrity
CREATE TRIGGER IF NOT EXISTS rlr_finality_class_must_exist
  BEFORE INSERT ON revocation_liveness_registry
  WHEN NEW.finality_classification_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM finality_classification_registry
          WHERE finality_classification_id = NEW.finality_classification_id) = 0
    THEN RAISE(ABORT, 'finality_classification_id references non-existent finality classification record')
  END;
END;

-- quorum_attestation_id referential integrity
CREATE TRIGGER IF NOT EXISTS rlr_quorum_attestation_must_exist
  BEFORE INSERT ON revocation_liveness_registry
  WHEN NEW.quorum_attestation_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM quorum_attestation_registry
          WHERE quorum_attestation_id = NEW.quorum_attestation_id) = 0
    THEN RAISE(ABORT, 'quorum_attestation_id references non-existent quorum attestation record')
  END;
END;
