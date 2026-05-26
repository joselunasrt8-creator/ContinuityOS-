-- Migration: 0053_finality_classification_convergence_valid
-- Purpose: Add CONVERGENCE_VALID to the finality classification state vocabulary
--          and enforce that GLOBAL_VALID cannot be reached without first passing
--          through CONVERGENCE_VALID (i.e., LOCAL_VALID → GLOBAL_VALID is forbidden).
--
-- CONVERGENCE_VALID is the required intermediate state:
--   LOCAL_VALID  →  CONVERGENCE_VALID  →  GLOBAL_VALID
--
-- This migration recreates finality_classification_registry to expand the
-- classification CHECK constraint (SQLite does not support ALTER COLUMN).
-- All existing data and append-only triggers are preserved.

BEGIN;

-- Step 1: Create the replacement table with the expanded classification vocabulary.

CREATE TABLE finality_classification_registry_v2 (
  finality_classification_id           TEXT    NOT NULL PRIMARY KEY,
  object_hash                          TEXT    NOT NULL,
  object_type                          TEXT    NOT NULL
    CHECK(object_type IN ('authority','aeo','execution','proof','session','continuity','validation')),
  classification                       TEXT    NOT NULL
    CHECK(classification IN ('LOCAL_VALID','CONVERGENCE_VALID','GLOBAL_VALID','AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL')),
  predicate_snapshot_json              TEXT    NOT NULL,
  topology_visibility_snapshot_json    TEXT,
  continuity_id                        TEXT,
  authority_id                         TEXT,
  validation_id                        TEXT,
  proof_id                             TEXT,
  causal_clock_json                    TEXT,
  epoch_id                             TEXT,
  reason_code                          TEXT    NOT NULL,
  supersedes_classification_id         TEXT,
  created_at                           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  has_quorum_evidence                  INTEGER NOT NULL DEFAULT 0
    CHECK(has_quorum_evidence IN (0,1)),
  has_global_consensus_evidence        INTEGER NOT NULL DEFAULT 0
    CHECK(has_global_consensus_evidence IN (0,1)),
  has_lineage_freshness_evidence       INTEGER NOT NULL DEFAULT 0
    CHECK(has_lineage_freshness_evidence IN (0,1)),
  has_cryptographic_integrity_evidence INTEGER NOT NULL DEFAULT 0
    CHECK(has_cryptographic_integrity_evidence IN (0,1)),

  raw_production_apply_path            TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Step 2: Copy all existing records (classification values were a strict subset;
--         no existing row can violate the expanded constraint).

INSERT INTO finality_classification_registry_v2
  SELECT * FROM finality_classification_registry;

-- Step 3: Drop the old table (its triggers drop with it).

DROP TABLE finality_classification_registry;

-- Step 4: Rename the replacement into position.

ALTER TABLE finality_classification_registry_v2
  RENAME TO finality_classification_registry;

-- Step 5: Recreate indexes.

CREATE INDEX IF NOT EXISTS idx_fcr_object_hash
  ON finality_classification_registry(object_hash);

CREATE INDEX IF NOT EXISTS idx_fcr_supersedes
  ON finality_classification_registry(supersedes_classification_id)
  WHERE supersedes_classification_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fcr_created_at
  ON finality_classification_registry(created_at);

-- Step 6: Recreate append-only triggers.

CREATE TRIGGER IF NOT EXISTS fcr_no_update
  BEFORE UPDATE ON finality_classification_registry
BEGIN
  SELECT RAISE(ABORT, 'finality_classification_registry is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS fcr_no_delete
  BEFORE DELETE ON finality_classification_registry
BEGIN
  SELECT RAISE(ABORT, 'finality_classification_registry is append-only: DELETE is forbidden');
END;

-- Step 7: Recreate referential-integrity and evidence-guard triggers.

CREATE TRIGGER IF NOT EXISTS fcr_supersedes_must_exist
  BEFORE INSERT ON finality_classification_registry
  WHEN NEW.supersedes_classification_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM finality_classification_registry
          WHERE finality_classification_id = NEW.supersedes_classification_id) = 0
    THEN RAISE(ABORT, 'supersedes_classification_id references non-existent classification record')
  END;
END;

CREATE TRIGGER IF NOT EXISTS fcr_no_upgrade_from_null
  BEFORE INSERT ON finality_classification_registry
  WHEN NEW.supersedes_classification_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT classification FROM finality_classification_registry
          WHERE finality_classification_id = NEW.supersedes_classification_id) = 'NULL'
    THEN RAISE(ABORT, 'NULL classification is terminal: supersession from NULL is forbidden')
  END;
END;

CREATE TRIGGER IF NOT EXISTS fcr_global_valid_requires_evidence
  BEFORE INSERT ON finality_classification_registry
  WHEN NEW.classification = 'GLOBAL_VALID'
BEGIN
  SELECT CASE
    WHEN NEW.has_quorum_evidence = 0 OR NEW.has_global_consensus_evidence = 0
    THEN RAISE(ABORT, 'GLOBAL_VALID classification requires has_quorum_evidence=1 and has_global_consensus_evidence=1')
  END;
END;

-- Step 8: New guard — GLOBAL_VALID must supersede a CONVERGENCE_VALID record.
--         LOCAL_VALID cannot be promoted directly to GLOBAL_VALID.
--         The supersession chain enforces: LOCAL_VALID → CONVERGENCE_VALID → GLOBAL_VALID.

CREATE TRIGGER IF NOT EXISTS fcr_global_valid_requires_convergence_supersession
  BEFORE INSERT ON finality_classification_registry
  WHEN NEW.classification = 'GLOBAL_VALID'
BEGIN
  SELECT CASE
    WHEN NEW.supersedes_classification_id IS NULL
    THEN RAISE(ABORT, 'GLOBAL_VALID must supersede a CONVERGENCE_VALID record: direct promotion without convergence evidence is forbidden')
    WHEN (SELECT classification FROM finality_classification_registry
          WHERE finality_classification_id = NEW.supersedes_classification_id) != 'CONVERGENCE_VALID'
    THEN RAISE(ABORT, 'GLOBAL_VALID must supersede a CONVERGENCE_VALID record: LOCAL_VALID cannot be directly promoted to GLOBAL_VALID')
  END;
END;

CREATE TRIGGER IF NOT EXISTS fcr_proof_must_exist
  BEFORE INSERT ON finality_classification_registry
  WHEN NEW.proof_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM proof_registry
          WHERE proof_id = NEW.proof_id
          AND status = 'COMPLETED') = 0
    THEN RAISE(ABORT, 'proof_id references non-existent or incomplete proof in proof_registry')
  END;
END;

COMMIT;
