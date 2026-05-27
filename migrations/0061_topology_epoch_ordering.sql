-- Migration: 0061_topology_epoch_ordering
-- Purpose: strict monotonic topology epoch ordering fields for admission checks.

ALTER TABLE epoch_registry ADD COLUMN topology_epoch INTEGER;
ALTER TABLE epoch_registry ADD COLUMN epoch_lineage_parent TEXT;
ALTER TABLE epoch_registry ADD COLUMN epoch_nonce TEXT;
ALTER TABLE epoch_registry ADD COLUMN epoch_ordering_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_er_scope_topology_epoch ON epoch_registry(epoch_scope, topology_epoch);
CREATE UNIQUE INDEX IF NOT EXISTS idx_er_scope_epoch_nonce_unique ON epoch_registry(epoch_scope, epoch_nonce) WHERE epoch_nonce IS NOT NULL;
