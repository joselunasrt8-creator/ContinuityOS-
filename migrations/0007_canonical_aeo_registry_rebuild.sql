-- Rebuild stale pre-reboot AEO registry shape into the canonical compile schema.
-- Earlier migrations created aeo_registry with NOT NULL intent/aeo columns and without
-- canonical_aeo or validated_object_hash. Because ALTER TABLE cannot drop or relax those
-- stale NOT NULL columns, archive the legacy table and create the canonical registry.

DROP INDEX IF EXISTS idx_aeo_registry_decision_id;
DROP INDEX IF EXISTS idx_aeo_registry_decision_hash;

ALTER TABLE aeo_registry RENAME TO aeo_registry_legacy_pre_reboot;

CREATE TABLE aeo_registry (
  aeo_id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  canonical_aeo TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aeo_registry_decision_id
  ON aeo_registry (decision_id);

CREATE INDEX IF NOT EXISTS idx_aeo_registry_decision_hash
  ON aeo_registry (decision_id, validated_object_hash);
