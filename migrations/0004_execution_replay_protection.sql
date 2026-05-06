-- Add replay protection lookup index after enforcement lock added validated_object_hash.
-- Do not add the column here; 0004_enforcement_lock.sql owns that schema mutation.

CREATE INDEX IF NOT EXISTS idx_execution_registry_validated_hash_status
  ON execution_registry (validated_object_hash, status, created_at);
