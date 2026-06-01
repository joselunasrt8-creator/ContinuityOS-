-- Issue #1624: evidence-only ATAO capture for governed agent tool calls.
-- This registry is append-only and non-authoritative; it records proposed action
-- material observed at /govern before any execution legitimacy exists.
CREATE TABLE IF NOT EXISTS agent_tool_call_atao_registry (
  atao_id TEXT PRIMARY KEY,
  atao_hash TEXT NOT NULL UNIQUE,
  candidate_hash TEXT NOT NULL,
  govern_envelope_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  nonce_domain TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  risk_class TEXT NOT NULL CHECK (risk_class IN ('P0','P1','P2','P3')),
  proposed_action TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CAPTURED')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_call_atao_candidate
  ON agent_tool_call_atao_registry (candidate_hash);

CREATE INDEX IF NOT EXISTS idx_agent_tool_call_atao_envelope
  ON agent_tool_call_atao_registry (govern_envelope_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tool_call_atao_nonce_binding
  ON agent_tool_call_atao_registry (candidate_hash, nonce, nonce_domain);

CREATE TRIGGER IF NOT EXISTS agent_tool_call_atao_registry_append_only_update
BEFORE UPDATE ON agent_tool_call_atao_registry
BEGIN
  SELECT RAISE(ABORT, 'agent_tool_call_atao_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS agent_tool_call_atao_registry_append_only_delete
BEFORE DELETE ON agent_tool_call_atao_registry
BEGIN
  SELECT RAISE(ABORT, 'agent_tool_call_atao_registry is append-only');
END;
