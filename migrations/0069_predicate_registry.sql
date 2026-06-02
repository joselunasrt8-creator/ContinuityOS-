-- Issue #1777: Phase 3A Predicate Registry Surface.
-- Canonical topology-only registry between ValidatorBinding and future Ω validator execution.
--
-- This migration introduces deterministic predicate identity visibility only. It does
-- not execute predicates, evaluate predicates, create or reserve authority,
-- authorize execution, generate proof, mutate replay state, or implement Ω
-- validator execution.

CREATE TABLE IF NOT EXISTS predicate_registry (
  predicate_set_id  TEXT NOT NULL,
  predicate_hash    TEXT NOT NULL,
  lineage_version   TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','DEPRECATED','DRAFT')),
  predicate_ids     TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_predicate_registry_set_status
  ON predicate_registry (predicate_set_id, status);

CREATE TRIGGER IF NOT EXISTS predicate_registry_append_only_update
BEFORE UPDATE ON predicate_registry
BEGIN
  SELECT RAISE(ABORT, 'predicate_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS predicate_registry_append_only_delete
BEFORE DELETE ON predicate_registry
BEGIN
  SELECT RAISE(ABORT, 'predicate_registry is append-only');
END;
