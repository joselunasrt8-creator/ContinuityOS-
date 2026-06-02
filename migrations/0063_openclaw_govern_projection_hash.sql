-- Issue #1465/#1485 follow-up: keep migration-built AEO registry aligned with
-- runtime exact-object OpenClaw projection binding.
ALTER TABLE aeo_registry ADD COLUMN govern_projection_hash TEXT NOT NULL DEFAULT '';
