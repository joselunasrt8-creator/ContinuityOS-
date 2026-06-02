-- Agent tool invocation closure boundary.
-- Mutation-capable agent tool invocations are append-only and single-use once
-- their canonical /session→/continuity→/authority→/compile→/validate→/execute→/proof
-- lineage is proven.

CREATE TABLE IF NOT EXISTS agent_tool_invocation_registry (
  invocation_id TEXT PRIMARY KEY,
  atao_hash TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  proof_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PROVEN')),
  created_at TEXT NOT NULL,
  UNIQUE(atao_hash, decision_id, validated_object_hash, invocation_nonce)
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_invocation_decision
  ON agent_tool_invocation_registry (decision_id, validated_object_hash, invocation_nonce);

CREATE TRIGGER IF NOT EXISTS agent_tool_invocation_registry_append_only_update
BEFORE UPDATE ON agent_tool_invocation_registry
BEGIN
  SELECT RAISE(ABORT, 'agent_tool_invocation_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS agent_tool_invocation_registry_append_only_delete
BEFORE DELETE ON agent_tool_invocation_registry
BEGIN
  SELECT RAISE(ABORT, 'agent_tool_invocation_registry is append-only');
END;
