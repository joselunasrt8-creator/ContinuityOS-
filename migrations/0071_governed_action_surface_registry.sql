-- Issue #1857: First repeatable governed-action template — GitHub comment surface.
-- Introduces registry tables for the github_comment governed surface.
--
-- This migration introduces ATAO capture storage and proof persistence only.
-- It does not create authority, reserve authority, validate execution, execute
-- comments, mutate replay state, or implement predicate execution semantics.
-- Both tables are append-only: the correctness lineage is preserved as immutable evidence.

-- ── github_comment_atao_registry ─────────────────────────────────────────────
-- Non-operative capture registry for GitHub comment ATAOs.
-- An ATAO row represents a proposed action only — no authority, no execution eligibility.

CREATE TABLE IF NOT EXISTS github_comment_atao_registry (
  atao_id               TEXT NOT NULL PRIMARY KEY,
  agent_id              TEXT NOT NULL,
  session_id            TEXT NOT NULL,
  intent                TEXT NOT NULL,
  repo                  TEXT NOT NULL,
  issue_number          INTEGER NOT NULL,
  comment_type          TEXT NOT NULL CHECK (comment_type IN ('issue_comment','pr_review_comment','pr_review')),
  risk_class            TEXT NOT NULL CHECK (risk_class IN ('P0','P1','P2','P3')),
  status                TEXT NOT NULL DEFAULT 'CAPTURED' CHECK (status IN ('CAPTURED')),
  creates_authority     INTEGER NOT NULL DEFAULT 0 CHECK (creates_authority = 0),
  creates_execution_eligibility INTEGER NOT NULL DEFAULT 0 CHECK (creates_execution_eligibility = 0),
  captured_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_comment_atao_registry_session
  ON github_comment_atao_registry (session_id);

CREATE INDEX IF NOT EXISTS idx_github_comment_atao_registry_repo
  ON github_comment_atao_registry (repo, issue_number);

CREATE TRIGGER IF NOT EXISTS github_comment_atao_registry_append_only_update
BEFORE UPDATE ON github_comment_atao_registry
BEGIN
  SELECT RAISE(ABORT, 'github_comment_atao_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS github_comment_atao_registry_append_only_delete
BEFORE DELETE ON github_comment_atao_registry
BEGIN
  SELECT RAISE(ABORT, 'github_comment_atao_registry is append-only');
END;

-- ── github_comment_proof_registry ────────────────────────────────────────────
-- Immutable proof persistence for GitHub comment execution boundaries.
-- A proof row is emitted only after the exact-object boundary resolves.
-- execution_result EXECUTED: executor was called, validated_object_hash == executed_object_hash
-- execution_result NULL:     executor was NOT called, null_reason explains why

CREATE TABLE IF NOT EXISTS github_comment_proof_registry (
  proof_id                TEXT NOT NULL PRIMARY KEY,
  atao_id                 TEXT NOT NULL REFERENCES github_comment_atao_registry (atao_id),
  aeo_hash                TEXT NOT NULL,
  validated_object_hash   TEXT NOT NULL,
  executed_object_hash    TEXT NOT NULL,
  target_repo             TEXT NOT NULL,
  target_issue_number     INTEGER NOT NULL,
  target_operation        TEXT NOT NULL DEFAULT 'post_comment',
  comment_type            TEXT NOT NULL,
  posted_comment_id       TEXT,
  execution_result        TEXT NOT NULL CHECK (execution_result IN ('EXECUTED','NULL')),
  null_reason             TEXT,
  creates_authority       INTEGER NOT NULL DEFAULT 0 CHECK (creates_authority = 0),
  emitted_at              TEXT NOT NULL,
  -- Integrity: validated and executed hashes must agree on EXECUTED path
  CHECK (
    (execution_result = 'EXECUTED' AND validated_object_hash = executed_object_hash AND posted_comment_id IS NOT NULL AND null_reason IS NULL)
    OR
    (execution_result = 'NULL' AND null_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_github_comment_proof_registry_atao
  ON github_comment_proof_registry (atao_id, aeo_hash);

CREATE INDEX IF NOT EXISTS idx_github_comment_proof_registry_repo
  ON github_comment_proof_registry (target_repo, target_issue_number);

CREATE TRIGGER IF NOT EXISTS github_comment_proof_registry_append_only_update
BEFORE UPDATE ON github_comment_proof_registry
BEGIN
  SELECT RAISE(ABORT, 'github_comment_proof_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS github_comment_proof_registry_append_only_delete
BEFORE DELETE ON github_comment_proof_registry
BEGIN
  SELECT RAISE(ABORT, 'github_comment_proof_registry is append-only');
END;
