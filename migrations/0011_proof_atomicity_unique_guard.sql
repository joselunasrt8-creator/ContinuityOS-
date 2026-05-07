-- Harden proof lifecycle closure against duplicate proof lineage persistence.
CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique
  ON proof_registry (decision_id, validated_object_hash);
