-- Enforce proof lineage binding to a valid executed lineage.
CREATE TRIGGER IF NOT EXISTS trg_proof_registry_requires_valid_execution
BEFORE INSERT ON proof_registry
WHEN NOT EXISTS (
  SELECT 1
  FROM execution_registry e
  WHERE e.execution_id = NEW.execution_id
    AND e.decision_id = NEW.decision_id
    AND e.validated_object_hash = NEW.validated_object_hash
    AND e.status = 'EXECUTED'
)
BEGIN
  SELECT RAISE(ABORT, 'proof_registry missing valid execution lineage');
END;
