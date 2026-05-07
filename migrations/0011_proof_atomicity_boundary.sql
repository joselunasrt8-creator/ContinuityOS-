-- Harden proof atomicity by making proof lineage singular for each executed object.
-- Existing registries are not rewritten; the unique index makes duplicate lineage
-- impossible before the /proof route consumes authority in the same D1 batch.

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_unique_execution_lineage
  ON proof_registry (execution_id, decision_id, validated_object_hash);
