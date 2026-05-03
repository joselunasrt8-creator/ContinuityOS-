-- Enforcement Lock Hardening Migration

-- 1. Add validated_object_hash to execution_registry if missing
ALTER TABLE execution_registry ADD COLUMN validated_object_hash TEXT;

-- 2. Add validated_object_hash to proof_registry if missing
ALTER TABLE proof_registry ADD COLUMN validated_object_hash TEXT;

-- 3. Add timestamp column to proof_registry if missing
ALTER TABLE proof_registry ADD COLUMN timestamp TEXT;

-- 4. Add replay protection index
CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_replay_guard
ON execution_registry (decision_id, validated_object_hash);

-- 5. Invocation-level replay guard already enforced via PK
-- decision_id + validated_object_hash + invocation_nonce

-- 6. Optional: proof linkage index
CREATE INDEX IF NOT EXISTS idx_proof_object_hash
ON proof_registry (validated_object_hash);
