-- Issue #360: Governed D1 migration legitimacy closure.
-- Declares migration application as a governed infrastructure mutation surface.
-- This table is evidence-only: it records migration governance declarations.
-- It does not create execution authority, proof finality, or deployment capability.

CREATE TABLE IF NOT EXISTS migration_governance_registry (
  migration_id TEXT PRIMARY KEY,
  migration_file TEXT NOT NULL UNIQUE,
  migration_sequence INTEGER NOT NULL,
  governance_classification TEXT NOT NULL CHECK (governance_classification = 'governed_infrastructure_mutation'),
  surface_declaration TEXT NOT NULL CHECK (surface_declaration = 'DECLARED'),
  legitimacy_constraint_preserved TEXT NOT NULL CHECK (legitimacy_constraint_preserved = 'true'),
  append_only_semantics_preserved TEXT NOT NULL CHECK (append_only_semantics_preserved = 'true'),
  raw_production_apply_path TEXT NOT NULL CHECK (raw_production_apply_path = 'DENIED'),
  evidence_only TEXT NOT NULL CHECK (evidence_only = 'true'),
  replay_neutral TEXT NOT NULL CHECK (replay_neutral = 'true'),
  mutation_capable TEXT NOT NULL CHECK (mutation_capable = 'false'),
  creates_authority TEXT NOT NULL CHECK (creates_authority = 'false'),
  executable TEXT NOT NULL CHECK (executable = 'false'),
  proof_generating TEXT NOT NULL CHECK (proof_generating = 'false'),
  deployment_capable TEXT NOT NULL CHECK (deployment_capable = 'false'),
  fail_closed_on_bypass TEXT NOT NULL CHECK (fail_closed_on_bypass = 'true'),
  validation_evidence TEXT NOT NULL,
  registered_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_governance_registry_file
  ON migration_governance_registry (migration_file);

CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_governance_registry_sequence
  ON migration_governance_registry (migration_sequence);

CREATE TRIGGER IF NOT EXISTS trg_migration_governance_registry_no_update
BEFORE UPDATE ON migration_governance_registry
BEGIN
  SELECT RAISE(ABORT, 'migration_governance_registry is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_migration_governance_registry_no_delete
BEFORE DELETE ON migration_governance_registry
BEGIN
  SELECT RAISE(ABORT, 'migration_governance_registry is append-only');
END;
