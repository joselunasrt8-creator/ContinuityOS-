-- Migration: 0055_validator_attestation_envelope
-- Purpose: Persist ValidatorAttestationEnvelope records.
-- Evidence-only: attestation ≠ authority. No UPDATE/DELETE permitted.
-- attestation_type CHECK enforces absence of 'AUTHORITY' at DB level.
-- Depends on: 0050 (quorum_attestation_registry), 0052 (epoch_registry)
-- Append-only: no UPDATE or DELETE permitted.

CREATE TABLE IF NOT EXISTS validator_attestation_envelope_registry (
  validator_attestation_id    TEXT    NOT NULL PRIMARY KEY,
  validator_id                TEXT    NOT NULL,
  epoch_id                    TEXT    NOT NULL,
  object_hash                 TEXT    NOT NULL,
  classification              TEXT    NOT NULL
    CHECK(classification IN (
      'LOCAL_VALID','CONVERGENCE_VALID','GLOBAL_VALID',
      'AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL'
    )),
  topology_snapshot_hash      TEXT    NOT NULL,     -- empty string signals invisible
  causal_clock_json           TEXT    NOT NULL,
  attestation_type            TEXT    NOT NULL
    CHECK(attestation_type IN ('EVIDENCE','OBSERVATION')),  -- 'AUTHORITY' excluded by design
  timestamp_utc               TEXT    NOT NULL,
  signature                   TEXT    NOT NULL,
  quorum_attestation_id       TEXT,                 -- nullable: populated when part of a quorum record
  is_epoch_stale              INTEGER NOT NULL DEFAULT 0 CHECK(is_epoch_stale IN (0,1)),
  is_topology_visible         INTEGER NOT NULL DEFAULT 1 CHECK(is_topology_visible IN (0,1)),
  reason_code                 TEXT    NOT NULL,
  created_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  -- Evidence-only discipline (mirroring quorum_attestation_registry pattern)
  evidence_only               INTEGER NOT NULL DEFAULT 1 CHECK(evidence_only = 1),
  creates_authority           INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  creates_execution           INTEGER NOT NULL DEFAULT 0 CHECK(creates_execution = 0),
  replay_neutral              INTEGER NOT NULL DEFAULT 1 CHECK(replay_neutral = 1),
  raw_production_apply_path   TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: fast lookup of all attestations for a given object
CREATE INDEX IF NOT EXISTS idx_vaer_object_hash
  ON validator_attestation_envelope_registry(object_hash);

-- Index: all attestations for a validator
CREATE INDEX IF NOT EXISTS idx_vaer_validator_id
  ON validator_attestation_envelope_registry(validator_id);

-- Index: lookup by epoch
CREATE INDEX IF NOT EXISTS idx_vaer_epoch_id
  ON validator_attestation_envelope_registry(epoch_id);

-- Index: filter by attestation type
CREATE INDEX IF NOT EXISTS idx_vaer_attestation_type
  ON validator_attestation_envelope_registry(attestation_type);

-- Index: find stale attestations
CREATE INDEX IF NOT EXISTS idx_vaer_is_epoch_stale
  ON validator_attestation_envelope_registry(is_epoch_stale);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS vaer_no_update
  BEFORE UPDATE ON validator_attestation_envelope_registry
BEGIN
  SELECT RAISE(ABORT, 'validator_attestation_envelope_registry is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS vaer_no_delete
  BEFORE DELETE ON validator_attestation_envelope_registry
BEGIN
  SELECT RAISE(ABORT, 'validator_attestation_envelope_registry is append-only: DELETE is forbidden');
END;

-- epoch_id referential integrity
CREATE TRIGGER IF NOT EXISTS vaer_epoch_must_exist
  BEFORE INSERT ON validator_attestation_envelope_registry
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM epoch_registry WHERE epoch_id = NEW.epoch_id) = 0
    THEN RAISE(ABORT, 'epoch_id references non-existent epoch_registry record')
  END;
END;

-- quorum_attestation_id referential integrity (when populated)
CREATE TRIGGER IF NOT EXISTS vaer_quorum_attestation_must_exist
  BEFORE INSERT ON validator_attestation_envelope_registry
  WHEN NEW.quorum_attestation_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM quorum_attestation_registry
          WHERE quorum_attestation_id = NEW.quorum_attestation_id) = 0
    THEN RAISE(ABORT, 'quorum_attestation_id references non-existent quorum_attestation_registry record')
  END;
END;

-- Defense-in-depth: attestation_type must never be 'AUTHORITY' (CHECK already blocks this)
CREATE TRIGGER IF NOT EXISTS vaer_observation_cannot_be_authority
  BEFORE INSERT ON validator_attestation_envelope_registry
BEGIN
  SELECT CASE
    WHEN NEW.attestation_type = 'AUTHORITY'
    THEN RAISE(ABORT, 'attestation_type AUTHORITY is forbidden: validator attestation evidence ≠ authority')
  END;
END;

-- Stale epoch attestations must use OBSERVATION, never EVIDENCE
CREATE TRIGGER IF NOT EXISTS vaer_stale_cannot_be_evidence
  BEFORE INSERT ON validator_attestation_envelope_registry
  WHEN NEW.is_epoch_stale = 1
BEGIN
  SELECT CASE
    WHEN NEW.attestation_type = 'EVIDENCE'
    THEN RAISE(ABORT, 'stale epoch attestation must use attestation_type=OBSERVATION, not EVIDENCE')
  END;
END;

-- Topology-invisible attestations must use OBSERVATION, never EVIDENCE
CREATE TRIGGER IF NOT EXISTS vaer_invisible_cannot_be_evidence
  BEFORE INSERT ON validator_attestation_envelope_registry
  WHEN NEW.is_topology_visible = 0
BEGIN
  SELECT CASE
    WHEN NEW.attestation_type = 'EVIDENCE'
    THEN RAISE(ABORT, 'topology-invisible attestation must use attestation_type=OBSERVATION, not EVIDENCE')
  END;
END;
