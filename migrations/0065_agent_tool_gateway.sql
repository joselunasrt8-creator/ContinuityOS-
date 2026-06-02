-- Issue #1627: Agent Tool Gateway — observation and proposal registries.
-- Both tables are append-only and non-authoritative. They record the
-- Observation → CIP → GovernanceProposal flow before any authority exists.
-- ATAO formation occurs only after authority approval (authority layer, not gateway layer).

CREATE TABLE IF NOT EXISTS agent_tool_observation_registry (
  observation_id TEXT PRIMARY KEY,
  observation_hash TEXT NOT NULL UNIQUE,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  framework TEXT NOT NULL CHECK (framework IN ('langchain')),
  tool_name TEXT NOT NULL,
  tool_system TEXT NOT NULL,
  risk_class TEXT NOT NULL CHECK (risk_class IN ('P0', 'P1', 'P2', 'P3')),
  tool_input TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OBSERVED')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_observation_session
  ON agent_tool_observation_registry (session_id);

CREATE INDEX IF NOT EXISTS idx_agent_tool_observation_agent
  ON agent_tool_observation_registry (agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_tool_observation_tool
  ON agent_tool_observation_registry (tool_name, tool_system, risk_class);

CREATE TRIGGER IF NOT EXISTS agent_tool_observation_registry_append_only_update
BEFORE UPDATE ON agent_tool_observation_registry
BEGIN
  SELECT RAISE(ABORT, 'agent_tool_observation_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS agent_tool_observation_registry_append_only_delete
BEFORE DELETE ON agent_tool_observation_registry
BEGIN
  SELECT RAISE(ABORT, 'agent_tool_observation_registry is append-only');
END;

CREATE TABLE IF NOT EXISTS agent_tool_proposal_registry (
  proposal_id TEXT PRIMARY KEY,
  proposal_class TEXT NOT NULL CHECK (proposal_class IN ('GOVERNANCE_PROPOSAL')),
  cip_id TEXT NOT NULL UNIQUE,
  observation_id TEXT NOT NULL,
  observation_hash TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  framework TEXT NOT NULL CHECK (framework IN ('langchain')),
  tool_name TEXT NOT NULL,
  tool_system TEXT NOT NULL,
  risk_class TEXT NOT NULL CHECK (risk_class IN ('P0', 'P1', 'P2', 'P3')),
  intent TEXT NOT NULL,
  scope TEXT NOT NULL,
  constraints TEXT NOT NULL,
  requires_authority_binding INTEGER NOT NULL CHECK (requires_authority_binding IN (0, 1)),
  proposal_status TEXT NOT NULL CHECK (proposal_status IN ('PENDING_AUTHORITY_REVIEW')),
  creates_atao INTEGER NOT NULL DEFAULT 0 CHECK (creates_atao = 0),
  creates_aeo INTEGER NOT NULL DEFAULT 0 CHECK (creates_aeo = 0),
  created_at TEXT NOT NULL,
  FOREIGN KEY (observation_id) REFERENCES agent_tool_observation_registry(observation_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_proposal_observation
  ON agent_tool_proposal_registry (observation_id, observation_hash);

CREATE INDEX IF NOT EXISTS idx_agent_tool_proposal_session
  ON agent_tool_proposal_registry (session_id, agent_id);

CREATE TRIGGER IF NOT EXISTS agent_tool_proposal_registry_append_only_update
BEFORE UPDATE ON agent_tool_proposal_registry
BEGIN
  SELECT RAISE(ABORT, 'agent_tool_proposal_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS agent_tool_proposal_registry_append_only_delete
BEFORE DELETE ON agent_tool_proposal_registry
BEGIN
  SELECT RAISE(ABORT, 'agent_tool_proposal_registry is append-only');
END;
