-- Issue #826 follow-up: Add execution lineage tracking columns to core registries
ALTER TABLE aeo_registry ADD COLUMN lineage_stage TEXT;
ALTER TABLE aeo_registry ADD COLUMN lineage_origin_hash TEXT;

ALTER TABLE validation_registry ADD COLUMN parent_compilation_hash TEXT;
ALTER TABLE validation_registry ADD COLUMN lineage_stage TEXT;
ALTER TABLE validation_registry ADD COLUMN lineage_origin_hash TEXT;

ALTER TABLE execution_registry ADD COLUMN parent_validation_hash TEXT;
ALTER TABLE execution_registry ADD COLUMN lineage_stage TEXT;
ALTER TABLE execution_registry ADD COLUMN lineage_origin_hash TEXT;

ALTER TABLE proof_registry ADD COLUMN parent_execution_hash TEXT;
ALTER TABLE proof_registry ADD COLUMN lineage_stage TEXT;
ALTER TABLE proof_registry ADD COLUMN lineage_origin_hash TEXT;
