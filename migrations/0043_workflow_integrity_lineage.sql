-- Issue #826: Persist and enforce workflow integrity lineage across validate/execute/proof
ALTER TABLE aeo_registry ADD COLUMN workflow_integrity_hash TEXT;
ALTER TABLE validation_registry ADD COLUMN workflow_integrity_hash TEXT;
ALTER TABLE execution_registry ADD COLUMN workflow_integrity_hash TEXT;
ALTER TABLE proof_registry ADD COLUMN workflow_integrity_hash TEXT;
