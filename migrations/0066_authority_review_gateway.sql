-- Issue #1627 follow-on: Authority Review and ATAO formation.
-- Connects: GovernanceProposal → Authority Review → ATAO
--
-- Invariants enforced by schema:
--   authority_review_registry.creates_atao = 0 for REJECTED decisions (CHECK)
--   agent_tool_atao_registry requires review_id (FK lineage to authority_review_registry)
--   No ATAO row can exist without a corresponding APPROVED authority_review row
--   Both registries are append-only (UPDATE/DELETE triggers)
--
-- Single ATAO primitive: agent_tool_atao_registry is the canonical ATAO registry
-- for gateway-path ATAOs. Distinct from agent_tool_call_atao_registry (issue #1624)
-- which captures evidence-only, pre-authority observations at the /govern route.
--
-- Permitted lineage path:
--   agent_tool_proposal_registry (PENDING_AUTHORITY_REVIEW)
--   → authority_review_registry (APPROVED | REJECTED)
--   → agent_tool_atao_registry (FORMED, only if APPROVED)
--
-- Gateway, CIP, Observation, and Proposal layers cannot create rows here.

CREATE TABLE IF NOT EXISTS authority_review_registry (
  review_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  observation_id TEXT NOT NULL,
  observation_hash TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  tool_system TEXT NOT NULL CHECK (tool_system IN ('filesystem','github','shell','ci_cd','http_api','database','deploy','read_only')),
  risk_class TEXT NOT NULL CHECK (risk_class IN ('P0','P1','P2','P3')),
  reviewer_id TEXT NOT NULL,
  review_decision TEXT NOT NULL CHECK (review_decision IN ('APPROVED','REJECTED')),
  review_rationale TEXT NOT NULL,
  -- creates_atao is 1 only for APPROVED decisions; REJECTED must be 0
  creates_atao INTEGER NOT NULL CHECK (
    (review_decision = 'APPROVED' AND creates_atao = 1)
    OR
    (review_decision = 'REJECTED' AND creates_atao = 0)
  ),
  created_at TEXT NOT NULL,
  FOREIGN KEY (proposal_id) REFERENCES agent_tool_proposal_registry(proposal_id)
);

CREATE INDEX IF NOT EXISTS idx_authority_review_proposal
  ON authority_review_registry (proposal_id, observation_id, observation_hash);

CREATE INDEX IF NOT EXISTS idx_authority_review_decision
  ON authority_review_registry (review_decision, created_at);

CREATE INDEX IF NOT EXISTS idx_authority_review_session
  ON authority_review_registry (session_id, agent_id);

CREATE TRIGGER IF NOT EXISTS authority_review_registry_append_only_update
BEFORE UPDATE ON authority_review_registry
BEGIN
  SELECT RAISE(ABORT, 'authority_review_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS authority_review_registry_append_only_delete
BEFORE DELETE ON authority_review_registry
BEGIN
  SELECT RAISE(ABORT, 'authority_review_registry is append-only');
END;

-- Canonical ATAO registry for the gateway path.
-- Every row requires review_id FK to authority_review_registry.
-- This is the structural guarantee that no ATAO exists without an approved review.
CREATE TABLE IF NOT EXISTS agent_tool_atao_registry (
  atao_id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  observation_id TEXT NOT NULL,
  observation_hash TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  framework TEXT NOT NULL CHECK (framework IN ('langchain')),
  tool_name TEXT NOT NULL,
  tool_system TEXT NOT NULL CHECK (tool_system IN ('filesystem','github','shell','ci_cd','http_api','database','deploy','read_only')),
  risk_class TEXT NOT NULL CHECK (risk_class IN ('P0','P1','P2','P3')),
  intent TEXT NOT NULL,
  scope TEXT NOT NULL,
  constraints TEXT NOT NULL,
  atao_status TEXT NOT NULL CHECK (atao_status IN ('FORMED')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (review_id) REFERENCES authority_review_registry(review_id),
  FOREIGN KEY (proposal_id) REFERENCES agent_tool_proposal_registry(proposal_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_atao_review
  ON agent_tool_atao_registry (review_id, proposal_id);

CREATE INDEX IF NOT EXISTS idx_agent_tool_atao_session
  ON agent_tool_atao_registry (session_id, agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_tool_atao_observation
  ON agent_tool_atao_registry (observation_id, observation_hash);

CREATE TRIGGER IF NOT EXISTS agent_tool_atao_registry_append_only_update
BEFORE UPDATE ON agent_tool_atao_registry
BEGIN
  SELECT RAISE(ABORT, 'agent_tool_atao_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS agent_tool_atao_registry_append_only_delete
BEFORE DELETE ON agent_tool_atao_registry
BEGIN
  SELECT RAISE(ABORT, 'agent_tool_atao_registry is append-only');
END;
