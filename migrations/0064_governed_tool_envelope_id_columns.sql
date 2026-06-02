-- Promote governed_tool_envelope_id from runtime-only schema into canonical migration path.
-- governed_tool_envelope_id was added to authority_registry and aeo_registry in the runtime
-- CREATE TABLE statements but was never migrated, causing INSERT failures on migration-built
-- schemas. govern_projection_hash was promoted separately in 0063_openclaw_govern_projection_hash.
ALTER TABLE authority_registry ADD COLUMN governed_tool_envelope_id TEXT;
ALTER TABLE aeo_registry ADD COLUMN governed_tool_envelope_id TEXT;
