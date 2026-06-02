-- Issue #1773: Phase 3A Agent Tool AEO Template Registry.
-- Canonical registry surface for deterministic agent tool template resolution.
--
-- This migration introduces lookup topology only. It does not create authority,
-- reserve authority, validate execution, execute tools, generate proof, mutate
-- replay state, or implement predicate execution semantics.

CREATE TABLE IF NOT EXISTS agent_tool_aeo_template_registry (
  template_id        TEXT NOT NULL,
  schema_version     TEXT NOT NULL,
  surface_type       TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','DEPRECATED','DRAFT')),
  risk_floor         TEXT NOT NULL,
  predicate_set_id   TEXT NOT NULL,
  predicate_hash     TEXT NOT NULL,
  lineage_version    TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  PRIMARY KEY (template_id, schema_version)
);

-- Deterministic template identity invariant: a versioned template is unique.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tool_aeo_template_registry_template_version
  ON agent_tool_aeo_template_registry (template_id, schema_version);

-- Deterministic active-surface invariant: one ACTIVE template per surface_type.
-- The resolver still fail-closes if a corrupted/mock registry presents multiple
-- ACTIVE rows, preserving deterministic NULL behavior under drift.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tool_aeo_template_registry_active_surface
  ON agent_tool_aeo_template_registry (surface_type)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_agent_tool_aeo_template_registry_surface_status
  ON agent_tool_aeo_template_registry (surface_type, status);

CREATE TRIGGER IF NOT EXISTS agent_tool_aeo_template_registry_append_only_update
BEFORE UPDATE ON agent_tool_aeo_template_registry
BEGIN
  SELECT RAISE(ABORT, 'agent_tool_aeo_template_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS agent_tool_aeo_template_registry_append_only_delete
BEFORE DELETE ON agent_tool_aeo_template_registry
BEGIN
  SELECT RAISE(ABORT, 'agent_tool_aeo_template_registry is append-only');
END;
