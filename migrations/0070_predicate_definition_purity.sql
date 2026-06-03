-- Issue #1773: PredicateDefinition purity metadata.
-- Adds explicit purity visibility for validator pre-flight enforcement only.
-- This migration does not load predicate implementations, execute predicates,
-- create proof, create authority, or create execution eligibility.

ALTER TABLE predicate_registry
  ADD COLUMN side_effects_allowed TEXT NOT NULL DEFAULT 'false'
  CHECK (side_effects_allowed IN ('false','true'));
