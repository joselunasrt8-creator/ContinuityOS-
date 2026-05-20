import test from 'node:test';
import assert from 'node:assert/strict';

import registry from '../governance/SKILL_SURFACES_REGISTRY_V1.json' with { type: 'json' };
import {
  canonicalizeSkillSurfacesRegistry,
  hashSkillSurfacesRegistry,
  validateSkillSurfaceEntry,
  validateSkillSurfacesRegistry
} from '../src/skill-surfaces/registry-validator.mjs';

const baseEntry = {
  skill_id: 'repository.change.workflow',
  surface_type: 'repository_mutation',
  risk_class: 'P2',
  mutation_capable: true,
  allowed_targets: ['local_workspace', 'github_pull_request'],
  required_validator_layers: ['compile', 'validate', 'execute', 'proof'],
  proof_requirements: ['execution_receipt', 'lineage_binding', 'policy_attestation'],
  replay_domain: 'repository_mutation_pr'
};

test('valid registry fixture validates and remains non-operative', () => {
  const result = validateSkillSurfacesRegistry(registry);
  assert.equal(result.status, 'VALID');
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(registry.registry_semantics.observability_only, true);
  assert.equal(registry.registry_semantics.grants_execution_permission, false);
  assert.equal(registry.registry_semantics.runtime_route_expansion, false);
  assert.equal(registry.registry_semantics.execution_path_creation, false);
  assert.equal(registry.registry_semantics.authority_creation, false);
  assert.equal(registry.registry_semantics.validator_bypass, false);
  assert.equal(registry.registry_semantics.fail_closed, true);
});

test('entry validation enforces mutation-capable requirements', () => {
  const invalid = {
    ...baseEntry,
    required_validator_layers: [],
    proof_requirements: []
  };

  const result = validateSkillSurfaceEntry(invalid);
  assert.equal(result.status, 'NULL');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('required_validator_layers')));
  assert.ok(result.errors.some((error) => error.includes('proof_requirements')));
});

test('unknown risk class fails closed and normalizes to NULL only when explicitly NULL', () => {
  const unknownRisk = { ...baseEntry, risk_class: 'P9' };
  const invalid = validateSkillSurfaceEntry(unknownRisk);
  assert.equal(invalid.status, 'NULL');
  assert.equal(invalid.valid, false);

  const nullRisk = { ...baseEntry, risk_class: null };
  const valid = validateSkillSurfaceEntry(nullRisk);
  assert.equal(valid.status, 'VALID');
  assert.equal(valid.normalized.risk_class, null);
});

test('canonical serialization and hash are deterministic', () => {
  const result = validateSkillSurfacesRegistry(registry);
  const reordered = {
    entries: result.normalized.entries,
    schema_version: result.normalized.schema_version
  };

  assert.equal(
    canonicalizeSkillSurfacesRegistry(reordered),
    canonicalizeSkillSurfacesRegistry(result.normalized)
  );
  assert.equal(hashSkillSurfacesRegistry(reordered), hashSkillSurfacesRegistry(result.normalized));
});

test('registry entry examples include P0, P2, and P3 surfaces', () => {
  const riskClasses = new Set(registry.entries.map((entry) => entry.risk_class));
  assert.equal(riskClasses.has('P0'), true);
  assert.equal(riskClasses.has('P2'), true);
  assert.equal(riskClasses.has('P3'), true);
});
