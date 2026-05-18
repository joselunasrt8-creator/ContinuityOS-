DROP INDEX IF EXISTS idx_proof_registry_execution_decision_hash_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique
  ON proof_registry (decision_id, validated_object_hash);
