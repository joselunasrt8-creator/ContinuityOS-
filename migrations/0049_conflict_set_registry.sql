-- Migration: 0049_conflict_set_registry
-- Purpose: Persist legitimacy conflict set evidence — competing canonical heads,
-- tie-break outcomes, and resolution lineage. Evidence-only; conflict detection,
-- split-brain collapse, and quorum consensus are out of scope for this migration.
-- Semantic prerequisite: docs/distributed-finality-arbitration-canon.md
-- Append-only: no UPDATE or DELETE permitted.

CREATE TABLE IF NOT EXISTS conflict_set_registry (
  conflict_set_id               TEXT    NOT NULL PRIMARY KEY,
  lineage_scope                 TEXT    NOT NULL,
  -- GLOBAL | DOMAIN:<id> | PARTITION:<id> | LOCAL:<node_id>
  conflict_state                TEXT    NOT NULL
    CHECK(conflict_state IN ('OPEN','RESOLVED','SUPERSEDED','NULL')),
  competing_heads_json          TEXT    NOT NULL,
  -- JSON array: [{head_hash, reconciliability_score, quorum_weight, causal_clock_index}]
  collapse_rule_applied         TEXT    NOT NULL
    CHECK(collapse_rule_applied IN ('RECONCILIABILITY','QUORUM_WEIGHT','CAUSAL_CLOCK','LEXICOGRAPHIC','UNRESOLVED')),
  winner_head_hash              TEXT,             -- nullable until RESOLVED
  winner_reconciliability_score REAL,             -- evidence field; not authority-granting
  winner_quorum_weight          REAL,             -- evidence field; not authority-granting
  winner_causal_clock_index     INTEGER,          -- evidence field; not authority-granting
  arbitration_hash              TEXT,             -- sha256 from computeArbitrationHash() in legitimacy-conflict-arbitration.ts
  supersedes_conflict_set_id    TEXT,             -- links prior conflict entry being superseded
  finality_classification_id    TEXT,             -- optional reference to finality_classification_registry
  reason_code                   TEXT    NOT NULL,
  created_at                    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  -- Evidence-only discipline: all records must carry these invariant flags
  evidence_only                 INTEGER NOT NULL DEFAULT 1 CHECK(evidence_only = 1),
  creates_authority             INTEGER NOT NULL DEFAULT 0 CHECK(creates_authority = 0),
  creates_execution             INTEGER NOT NULL DEFAULT 0 CHECK(creates_execution = 0),
  mutates_registry              INTEGER NOT NULL DEFAULT 0 CHECK(mutates_registry = 0),

  raw_production_apply_path     TEXT    NOT NULL DEFAULT 'DENIED'
    CHECK(raw_production_apply_path = 'DENIED')
);

-- Index: fast lookup of all conflict sets for a given scope
CREATE INDEX IF NOT EXISTS idx_csr_lineage_scope
  ON conflict_set_registry(lineage_scope);

-- Index: find open conflict sets efficiently
CREATE INDEX IF NOT EXISTS idx_csr_conflict_state
  ON conflict_set_registry(conflict_state);

-- Index: walk supersession chain
CREATE INDEX IF NOT EXISTS idx_csr_supersedes
  ON conflict_set_registry(supersedes_conflict_set_id)
  WHERE supersedes_conflict_set_id IS NOT NULL;

-- Index: temporal ordering for audit
CREATE INDEX IF NOT EXISTS idx_csr_created_at
  ON conflict_set_registry(created_at);

-- Append-only enforcement: no UPDATE
CREATE TRIGGER IF NOT EXISTS csr_no_update
  BEFORE UPDATE ON conflict_set_registry
BEGIN
  SELECT RAISE(ABORT, 'conflict_set_registry is append-only: UPDATE is forbidden');
END;

-- Append-only enforcement: no DELETE
CREATE TRIGGER IF NOT EXISTS csr_no_delete
  BEFORE DELETE ON conflict_set_registry
BEGIN
  SELECT RAISE(ABORT, 'conflict_set_registry is append-only: DELETE is forbidden');
END;

-- NULL is terminal — no supersession from NULL
CREATE TRIGGER IF NOT EXISTS csr_no_upgrade_from_null
  BEFORE INSERT ON conflict_set_registry
  WHEN NEW.supersedes_conflict_set_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT conflict_state FROM conflict_set_registry
          WHERE conflict_set_id = NEW.supersedes_conflict_set_id) = 'NULL'
    THEN RAISE(ABORT, 'NULL conflict_state is terminal: supersession from NULL is forbidden')
  END;
END;

-- Supersession referential integrity: referenced record must exist
CREATE TRIGGER IF NOT EXISTS csr_supersedes_must_exist
  BEFORE INSERT ON conflict_set_registry
  WHEN NEW.supersedes_conflict_set_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM conflict_set_registry
          WHERE conflict_set_id = NEW.supersedes_conflict_set_id) = 0
    THEN RAISE(ABORT, 'supersedes_conflict_set_id references non-existent conflict set record')
  END;
END;

-- RESOLVED state requires winner_head_hash and a resolved collapse rule
CREATE TRIGGER IF NOT EXISTS csr_resolved_requires_winner
  BEFORE INSERT ON conflict_set_registry
  WHEN NEW.conflict_state = 'RESOLVED'
BEGIN
  SELECT CASE
    WHEN NEW.winner_head_hash IS NULL
    THEN RAISE(ABORT, 'RESOLVED conflict state requires winner_head_hash to be set')
    WHEN NEW.collapse_rule_applied = 'UNRESOLVED'
    THEN RAISE(ABORT, 'RESOLVED conflict state requires collapse_rule_applied != UNRESOLVED')
  END;
END;

-- finality_classification_id referential integrity
CREATE TRIGGER IF NOT EXISTS csr_finality_class_must_exist
  BEFORE INSERT ON conflict_set_registry
  WHEN NEW.finality_classification_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM finality_classification_registry
          WHERE finality_classification_id = NEW.finality_classification_id) = 0
    THEN RAISE(ABORT, 'finality_classification_id references non-existent finality classification record')
  END;
END;
