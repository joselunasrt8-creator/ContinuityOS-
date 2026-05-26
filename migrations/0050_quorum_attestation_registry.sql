-- Migration: 0050_quorum_attestation_registry
-- Purpose: Persist weighted quorum attestation envelopes for distributed legitimacy
-- finality decisions. Provides the Q predicate evidence required for GLOBAL_VALID
-- classification in finality_classification_registry.
-- Semantic prerequisite: docs/distributed-finality-arbitration-canon.md, Section 3
-- Distinct from attestation_registry (workflow provenance) and
-- federation_conformance_registry (topology compatibility).
-- Append-only: no UPDATE or DELETE permitted.

CREATE TABLE IF NOT EXISTS quorum_attestation_registry (
  quorum_attestation_id       TEXT    NOT NULL PRIMARY KEY,
  federation_profile_id       TEXT    NOT NULL,
  -- Identifies the quorum profile governing math, weights, and threshold
  attested_object_hash        TEXT    NOT NULL,
  -- Hash of the legitimacy object being attested (canonical form)
  attested_object_type        TEXT    NOT NULL
    CHECK(attested_object_type IN ('authority','aeo','execution','proof','session','continuity','validation','epoch_head','registry_head')),
  member_attestations_json    TEXT    NOT NULL,
  -- JSON array: [{member_id, member_weight, attested_hash, attested_at, signature_present}]
  weight_total                REAL    NOT NULL CHECK(weight_total > 0),
  -- Sum of weights of all participating federation members
  weight_approved             REAL    NOT NULL CHECK(weight_approved >= 0),
  -- Sum of weights of members who attested the same canonical head
  quorum_threshold_fraction   REAL    NOT NULL CHECK(quorum_threshold_fraction > 0 AND quorum_threshold_fraction <= 1),
  -- Required fraction of weight_total that must approve (e.g. 0.667 for 2/3)
  quorum_met                  INTEGER NOT NULL DEFAULT 0 CHECK(quorum_met IN (0,1)),
  -- 1 if weight_approved / weight_total >= quorum_threshold_fraction
  finality_classification_id  TEXT,             -- nullable: links to finality_classification_registry
  conflict_set_id             TEXT,             -- nullable: links to conflict_set_registry when quorum disagreement present
  epoch_id                    TEXT,             -- nullable: epoch forward-placeholder (#1249)
  reason_code                 TEXT    NOT NULL,
  created_at                  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  -- Evidence-only discipline: quorum attestation ≠ execution authority
  evidence_only               INTEGER NOT NULL DEFAULT 1 CHECK(evidence_only = 1),
  creates_authority           INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  creates_execution           INTEGER NOT NULL DEFAULT 0 CHECK(creates_execution = 0),
  replay_neutral              INTEGER NOT NULL DEFAULT 1 CHECK(replay_neutral = 1),
  mutates_registry            INTEGER NOT NULL DEFAULT 0 CHECK(mutates_registry = 0),

  raw_production_apply_path   TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: fast lookup of all attestations for a given object
CREATE INDEX IF NOT EXISTS idx_qar_attested_object_hash
  ON quorum_attestation_registry(attested_object_hash);

-- Index: all attestations for a federation profile
CREATE INDEX IF NOT EXISTS idx_qar_federation_profile_id
  ON quorum_attestation_registry(federation_profile_id);

-- Index: find quorum-met attestations efficiently
CREATE INDEX IF NOT EXISTS idx_qar_quorum_met
  ON quorum_attestation_registry(quorum_met);

-- Index: temporal ordering for audit
CREATE INDEX IF NOT EXISTS idx_qar_created_at
  ON quorum_attestation_registry(created_at);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS qar_no_update
  BEFORE UPDATE ON quorum_attestation_registry
BEGIN
  SELECT RAISE(ABORT, 'quorum_attestation_registry is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS qar_no_delete
  BEFORE DELETE ON quorum_attestation_registry
BEGIN
  SELECT RAISE(ABORT, 'quorum_attestation_registry is append-only: DELETE is forbidden');
END;

-- quorum_met consistency: if quorum_met=1 then weight_approved must meet threshold
CREATE TRIGGER IF NOT EXISTS qar_quorum_met_consistency
  BEFORE INSERT ON quorum_attestation_registry
BEGIN
  SELECT CASE
    WHEN NEW.quorum_met = 1
      AND NEW.weight_approved < NEW.weight_total * NEW.quorum_threshold_fraction
    THEN RAISE(ABORT, 'quorum_met=1 requires weight_approved >= weight_total * quorum_threshold_fraction')
    WHEN NEW.quorum_met = 0
      AND NEW.weight_approved >= NEW.weight_total * NEW.quorum_threshold_fraction
    THEN RAISE(ABORT, 'quorum_met=0 inconsistent: weight_approved already meets threshold')
  END;
END;

-- weight_approved cannot exceed weight_total
CREATE TRIGGER IF NOT EXISTS qar_weight_approved_bounded
  BEFORE INSERT ON quorum_attestation_registry
BEGIN
  SELECT CASE
    WHEN NEW.weight_approved > NEW.weight_total
    THEN RAISE(ABORT, 'weight_approved cannot exceed weight_total')
  END;
END;

-- finality_classification_id referential integrity
CREATE TRIGGER IF NOT EXISTS qar_finality_class_must_exist
  BEFORE INSERT ON quorum_attestation_registry
  WHEN NEW.finality_classification_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM finality_classification_registry
          WHERE finality_classification_id = NEW.finality_classification_id) = 0
    THEN RAISE(ABORT, 'finality_classification_id references non-existent finality classification record')
  END;
END;

-- conflict_set_id referential integrity
CREATE TRIGGER IF NOT EXISTS qar_conflict_set_must_exist
  BEFORE INSERT ON quorum_attestation_registry
  WHEN NEW.conflict_set_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM conflict_set_registry
          WHERE conflict_set_id = NEW.conflict_set_id) = 0
    THEN RAISE(ABORT, 'conflict_set_id references non-existent conflict set record')
  END;
END;
