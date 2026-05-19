UPDATE proof_registry
SET decision_hash = decision_id || char(31) || validated_object_hash
WHERE decision_hash IS NULL OR decision_hash = '';
DROP INDEX IF EXISTS idx_proof_registry_execution_decision_hash_unique;
DROP INDEX IF EXISTS idx_proof_registry_decision_hash_unique;

CREATE TRIGGER IF NOT EXISTS trg_proof_registry_decision_hash_guard
BEFORE INSERT ON proof_registry
WHEN NEW.decision_hash IS NULL
  OR NEW.decision_hash = ''
  OR NEW.decision_hash != NEW.decision_id || char(31) || NEW.validated_object_hash
BEGIN
  SELECT RAISE(ABORT, 'proof_registry decision_hash mismatch');
END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique
  ON proof_registry (decision_hash);
