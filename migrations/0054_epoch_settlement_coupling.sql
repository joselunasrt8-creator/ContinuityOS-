-- Migration: 0054_epoch_settlement_coupling
-- Purpose: Couple epoch registry state machine and settlement semantics to
-- finality classification. Adds two triggers to epoch_registry:
--
--   1. er_valid_transition_check — enforces isValidEpochTransition() at DB level
--      so that invalid epoch state machine transitions are rejected at insertion time,
--      mirroring the TypeScript-layer check in src/lib/epoch-substrate.ts.
--
--   2. er_stale_downgrade — when an epoch advances to EPOCH_STALE_VISIBLE or
--      EPOCH_NULL, automatically inserts STALE_VISIBLE supersession records for
--      all finality_classification_registry records that referenced the
--      superseded epoch. Stale lineage remains observable but non-executable.
--
-- Depends on: 0052 (epoch_registry), 0053 (finality_classification_registry
-- with CONVERGENCE_VALID vocabulary)
-- Evidence-only: no authority created, no execution surface widened.

-- ── Trigger 1: Epoch state machine transition enforcement ───────────────────
--
-- Mirrors isValidEpochTransition() from src/lib/epoch-substrate.ts.
-- Fires BEFORE INSERT when supersedes_epoch_id is set (i.e., a supersession).
-- Rejects any transition not in the allowed set for the prior epoch status.
-- EPOCH_NULL is terminal and already guarded by er_no_upgrade_from_null (0052).

CREATE TRIGGER IF NOT EXISTS er_valid_transition_check
  BEFORE INSERT ON epoch_registry
  WHEN NEW.supersedes_epoch_id IS NOT NULL
BEGIN
  SELECT CASE
    WHEN (
      SELECT CASE prior.epoch_finality_status
        WHEN 'EPOCH_LOCAL' THEN
          CASE WHEN NEW.epoch_finality_status IN (
            'EPOCH_GLOBAL_CANDIDATE',
            'EPOCH_AMBIGUOUS',
            'EPOCH_PARTITION_SUSPENDED',
            'EPOCH_NULL'
          ) THEN 0 ELSE 1 END
        WHEN 'EPOCH_GLOBAL_CANDIDATE' THEN
          CASE WHEN NEW.epoch_finality_status IN (
            'EPOCH_GLOBAL_AUTHORITATIVE',
            'EPOCH_AMBIGUOUS',
            'EPOCH_PARTITION_SUSPENDED',
            'EPOCH_NULL'
          ) THEN 0 ELSE 1 END
        WHEN 'EPOCH_GLOBAL_AUTHORITATIVE' THEN
          CASE WHEN NEW.epoch_finality_status IN (
            'EPOCH_STALE_VISIBLE',
            'EPOCH_CONFLICTED',
            'EPOCH_REVOKED',
            'EPOCH_AMBIGUOUS',
            'EPOCH_NULL'
          ) THEN 0 ELSE 1 END
        WHEN 'EPOCH_AMBIGUOUS' THEN
          CASE WHEN NEW.epoch_finality_status IN (
            'EPOCH_LOCAL',
            'EPOCH_GLOBAL_AUTHORITATIVE',
            'EPOCH_NULL'
          ) THEN 0 ELSE 1 END
        WHEN 'EPOCH_STALE_VISIBLE' THEN
          CASE WHEN NEW.epoch_finality_status IN (
            'EPOCH_GLOBAL_AUTHORITATIVE',
            'EPOCH_LOCAL',
            'EPOCH_NULL'
          ) THEN 0 ELSE 1 END
        WHEN 'EPOCH_PARTITION_SUSPENDED' THEN
          CASE WHEN NEW.epoch_finality_status IN (
            'EPOCH_LOCAL',
            'EPOCH_GLOBAL_CANDIDATE',
            'EPOCH_GLOBAL_AUTHORITATIVE',
            'EPOCH_NULL'
          ) THEN 0 ELSE 1 END
        WHEN 'EPOCH_CONFLICTED' THEN
          CASE WHEN NEW.epoch_finality_status IN (
            'EPOCH_GLOBAL_AUTHORITATIVE',
            'EPOCH_AMBIGUOUS',
            'EPOCH_NULL'
          ) THEN 0 ELSE 1 END
        WHEN 'EPOCH_REVOKED' THEN
          CASE WHEN NEW.epoch_finality_status IN ('EPOCH_NULL') THEN 0 ELSE 1 END
        ELSE 1
      END
      FROM epoch_registry prior
      WHERE prior.epoch_id = NEW.supersedes_epoch_id
    ) = 1
    THEN RAISE(ABORT,
      'invalid epoch state machine transition: epoch_finality_status violates isValidEpochTransition() rules')
  END;
END;

-- ── Trigger 2: Stale lineage downgrade cascade ──────────────────────────────
--
-- When an epoch advances to EPOCH_STALE_VISIBLE or EPOCH_NULL, all
-- finality_classification_registry records that referenced the superseded
-- epoch must be downgraded to STALE_VISIBLE. Stale lineage remains observable
-- (evidence preserved) but is not execution-eligible.
--
-- Each downgrade record:
--   - classification = 'STALE_VISIBLE'
--   - supersedes_classification_id = the prior active record's id
--   - epoch_id = the new (stale/null) epoch's id
--   - reason_code = 'EPOCH_STALE_DOWNGRADE'
--   - all evidence flags reset to 0 (stale evidence is non-authoritative)
--   - proof_id = NULL (stale records carry no proof binding)
--
-- The downgrade INSERT is subject to finality_classification_registry's own
-- append-only triggers (fcr_supersedes_must_exist, fcr_no_upgrade_from_null).
-- This is intentional: the cascade is itself an evidence record.
--
-- Fires AFTER INSERT so that the epoch record exists before the cascade runs.

CREATE TRIGGER IF NOT EXISTS er_stale_downgrade
  AFTER INSERT ON epoch_registry
  WHEN NEW.supersedes_epoch_id IS NOT NULL
    AND NEW.epoch_finality_status IN ('EPOCH_STALE_VISIBLE', 'EPOCH_NULL')
BEGIN
  INSERT INTO finality_classification_registry (
    finality_classification_id,
    object_hash,
    object_type,
    classification,
    predicate_snapshot_json,
    topology_visibility_snapshot_json,
    continuity_id,
    authority_id,
    validation_id,
    proof_id,
    causal_clock_json,
    epoch_id,
    reason_code,
    supersedes_classification_id,
    created_at,
    has_quorum_evidence,
    has_global_consensus_evidence,
    has_lineage_freshness_evidence,
    has_cryptographic_integrity_evidence,
    raw_production_apply_path
  )
  SELECT
    NEW.epoch_id || '_stale_' || fcr.finality_classification_id,
    fcr.object_hash,
    fcr.object_type,
    'STALE_VISIBLE',
    fcr.predicate_snapshot_json,
    NULL,
    fcr.continuity_id,
    fcr.authority_id,
    fcr.validation_id,
    NULL,
    NULL,
    NEW.epoch_id,
    'EPOCH_STALE_DOWNGRADE',
    fcr.finality_classification_id,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    0,
    0,
    0,
    0,
    'DENIED'
  FROM finality_classification_registry fcr
  WHERE fcr.epoch_id = NEW.supersedes_epoch_id
    AND fcr.classification NOT IN ('NULL', 'STALE_VISIBLE');
END;
