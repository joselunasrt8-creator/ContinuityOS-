-- Promote governed envelope columns from runtime-only schema into canonical migration path.
-- governed_tool_envelope_id was added to the authority_registry and aeo_registry CREATE TABLE
-- in the runtime but was never migrated, causing INSERT failures on migration-built schemas.
-- govern_projection_hash was likewise runtime-only, requiring a test-harness ALTER TABLE bypass.
ALTER TABLE authority_registry ADD COLUMN governed_tool_envelope_id TEXT;
ALTER TABLE aeo_registry ADD COLUMN govern_projection_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE aeo_registry ADD COLUMN governed_tool_envelope_id TEXT;
