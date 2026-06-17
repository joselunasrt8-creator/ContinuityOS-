import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const scoValidSpec = JSON.parse(
  readFileSync(join(root, 'governance', 'sco', 'SCO_VALID_SPEC.json'), 'utf8'),
);
const registrySpec = JSON.parse(
  readFileSync(join(root, 'governance', 'sco', 'MUTATION_SURFACE_REGISTRY_SPEC.json'), 'utf8'),
);

import { sortCanonical, canonicalHash } from '../helpers/canonical-test-hash.mjs';

// ---------------------------------------------------------------------------
// Mutation surface classification
//
// Registry defines legitimacy. Dynamic scan detects drift.
// When a file matches multiple entries, highest risk wins.
// ---------------------------------------------------------------------------

const RISK_ORDER = { P1: 1, P2: 2, P3: 3 };

function classifyFile(filePath, registry) {
  const matches = registry.filter((entry) => {
    if (entry.path_pattern.endsWith('/')) {
      return filePath.startsWith(entry.path_pattern);
    }
    return filePath === entry.path_pattern;
  });
  if (matches.length === 0) return null;
  return matches.reduce((highest, entry) =>
    RISK_ORDER[entry.risk_class] > RISK_ORDER[highest.risk_class] ? entry : highest,
  );
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// SCO_CANDIDATE → SCO_VALID | SCO_INVALID transition
//
// Boundary contract:
//   SCO_VALID can only derive from canonical mutation-surface evidence.
//   SCO_CANDIDATE alone is not sufficient.
//   Any unknown file, scope expansion, surface mismatch, or underestimated
//   risk fails closed to SCO_INVALID.
// ---------------------------------------------------------------------------

function transitionScoCandidate({ candidate, registry }) {
  if (!candidate || !candidate.sco_id) {
    return { result: 'SCO_INVALID', reason: 'missing_sco_candidate' };
  }

  const requiredFields = [
    'sco_id',
    'head_sha',
    'repo',
    'governed_files',
    'mutation_classes',
    'target_surfaces',
    'requires_sco',
    'risk_class',
    'status',
  ];
  for (const field of requiredFields) {
    if (!Object.hasOwn(candidate, field)) {
      return { result: 'SCO_INVALID', reason: 'missing_required_metadata' };
    }
  }

  const hasGovernedFiles =
    Array.isArray(candidate.governed_files) && candidate.governed_files.length > 0;

  if (candidate.requires_sco !== hasGovernedFiles) {
    return { result: 'SCO_INVALID', reason: 'governed_file_mismatch' };
  }

  const governedFiles = candidate.governed_files ?? [];
  const classifications = [];
  const unclassified = [];

  for (const file of governedFiles) {
    const entry = classifyFile(file, registry);
    if (!entry) {
      unclassified.push(file);
    } else {
      classifications.push({ file_path: file, ...entry });
    }
  }

  if (unclassified.length > 0) {
    return { result: 'SCO_INVALID', reason: 'undeclared_mutation_surface' };
  }

  const derivedClasses = new Set(classifications.map((c) => c.mutation_class));
  const derivedSurfaces = new Set(classifications.map((c) => c.target_surface));
  const derivedRiskClass = classifications.reduce(
    (highest, c) => (RISK_ORDER[c.risk_class] > RISK_ORDER[highest] ? c.risk_class : highest),
    'P1',
  );

  if (!setsEqual(new Set(candidate.mutation_classes), derivedClasses)) {
    return { result: 'SCO_INVALID', reason: 'scope_expansion_detected' };
  }

  if (!setsEqual(new Set(candidate.target_surfaces), derivedSurfaces)) {
    return { result: 'SCO_INVALID', reason: 'target_surface_mismatch' };
  }

  if (RISK_ORDER[candidate.risk_class] < RISK_ORDER[derivedRiskClass]) {
    return { result: 'SCO_INVALID', reason: 'risk_classification_failure' };
  }

  return { result: 'SCO_VALID', reason: null };
}

// ---------------------------------------------------------------------------
// Static registry (mirrors MUTATION_SURFACE_REGISTRY_SPEC.json canonical entries)
// ---------------------------------------------------------------------------

const REGISTRY = [
  {
    path_pattern: 'governance/',
    mutation_class: 'governance_mutation',
    target_surface: 'governance_runtime',
    risk_class: 'P2',
  },
  {
    path_pattern: '.github/workflows/',
    mutation_class: 'workflow_mutation',
    target_surface: 'source_control_governance',
    risk_class: 'P3',
  },
  {
    path_pattern: 'src/',
    mutation_class: 'runtime_mutation',
    target_surface: 'runtime_boundary',
    risk_class: 'P3',
  },
  {
    path_pattern: 'schema.sql',
    mutation_class: 'schema_mutation',
    target_surface: 'database_schema',
    risk_class: 'P2',
  },
  {
    path_pattern: 'migrations/',
    mutation_class: 'migration_mutation',
    target_surface: 'database_migration',
    risk_class: 'P2',
  },
  {
    path_pattern: 'wrangler.toml',
    mutation_class: 'deployment_config_mutation',
    target_surface: 'deployment_configuration',
    risk_class: 'P2',
  },
];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HEAD_SHA = 'a'.repeat(40);

const validCandidate = Object.freeze({
  sco_id: 'SCO-42-' + HEAD_SHA,
  pr_number: 42,
  repo: 'example/mindshift-demo',
  base_branch: 'main',
  head_branch: 'governance/sco-valid',
  head_sha: HEAD_SHA,
  changed_files: ['governance/sco/SCO_VALID_SPEC.json'],
  governed_files: ['governance/sco/SCO_VALID_SPEC.json'],
  mutation_classes: ['governance_mutation'],
  target_surfaces: ['governance_runtime'],
  requires_sco: true,
  risk_class: 'P2',
  created_at: '2026-05-30T00:00:00Z',
  status: 'SCO_CANDIDATE',
});

// ---------------------------------------------------------------------------
// Spec boundary assertions
// ---------------------------------------------------------------------------

test('SCO_VALID spec defines governed mutation legitimacy gate', () => {
  assert.equal(
    scoValidSpec.transition_model.governed_mutation_without_sco_valid,
    'NULL',
    'governed mutation without SCO_VALID must be NULL',
  );
  assert.equal(
    scoValidSpec.transition_model.sco_candidate_alone_as_legitimacy,
    'forbidden',
    'SCO_CANDIDATE alone must not constitute legitimacy',
  );
  assert.equal(
    scoValidSpec.merge_legitimacy_gate.governed_mutation_without_sco_valid,
    'NULL',
    'merge legitimacy gate must declare governed_mutation_without_sco_valid: NULL',
  );
});

test('SCO_VALID spec declares non-operative boundaries', () => {
  const { non_operability } = scoValidSpec;
  assert.equal(non_operability.merge_operations, false, 'SCO_VALID must not perform merge operations');
  assert.equal(non_operability.deploy_mutation, false, 'SCO_VALID must not mutate deployments');
  assert.equal(non_operability.proof_generation, false, 'SCO_VALID must not generate proof');
  assert.equal(non_operability.authority_creation, false, 'SCO_VALID must not create authority');
});

test('SCO_VALID spec declares fail-closed default', () => {
  assert.equal(scoValidSpec.transition_model.default_output, 'SCO_INVALID');
  assert.equal(scoValidSpec.fail_closed_semantics.default_result, 'SCO_INVALID');
  assert.equal(scoValidSpec.fail_closed_semantics.missing_input, 'SCO_INVALID');
  assert.equal(scoValidSpec.fail_closed_semantics.undeclared_surface, 'SCO_INVALID');
});

test('registry spec declares registry-wins-over-scan principle', () => {
  assert.equal(registrySpec.drift_detection.scan_result_overrides_registry, false);
  assert.equal(registrySpec.drift_detection.scan_discovers_unlisted_consumer, 'SCO_INVALID');
  assert.ok(
    registrySpec.registry_principle.unknown_consumer_rule.includes('GOVERNANCE_UNKNOWN'),
    'registry spec must declare GOVERNANCE_UNKNOWN for unknown paths',
  );
});

// ---------------------------------------------------------------------------
// Transition boundary tests
// ---------------------------------------------------------------------------

test('PASS: valid bounded governed mutation produces SCO_VALID', () => {
  const result = transitionScoCandidate({ candidate: validCandidate, registry: REGISTRY });
  assert.equal(result.result, 'SCO_VALID');
  assert.equal(result.reason, null);
});

test('FAIL: SCO_CANDIDATE alone without mutation-surface evidence is not SCO_VALID', () => {
  // Passing the candidate without running classification against the registry
  // is not a valid path to SCO_VALID. We simulate this by using an empty registry
  // — the candidate claims governed_files but no registry exists to validate them.
  const result = transitionScoCandidate({ candidate: validCandidate, registry: [] });
  assert.equal(result.result, 'SCO_INVALID');
  assert.equal(result.reason, 'undeclared_mutation_surface');
});

test('FAIL: unknown file classification produces SCO_INVALID: undeclared_mutation_surface', () => {
  const candidate = {
    ...validCandidate,
    changed_files: ['unknown-unregistered-path/file.json'],
    governed_files: ['unknown-unregistered-path/file.json'],
    mutation_classes: ['unknown_class'],
    target_surfaces: ['unknown_surface'],
  };
  const result = transitionScoCandidate({ candidate, registry: REGISTRY });
  assert.equal(result.result, 'SCO_INVALID');
  assert.equal(result.reason, 'undeclared_mutation_surface');
});

test('FAIL: every changed file must be classified — partial classification fails closed', () => {
  const candidate = {
    ...validCandidate,
    changed_files: ['governance/sco/SCO_VALID_SPEC.json', 'unknown-path/extra.json'],
    governed_files: ['governance/sco/SCO_VALID_SPEC.json', 'unknown-path/extra.json'],
    mutation_classes: ['governance_mutation'],
    target_surfaces: ['governance_runtime'],
  };
  const result = transitionScoCandidate({ candidate, registry: REGISTRY });
  assert.equal(result.result, 'SCO_INVALID');
  assert.equal(result.reason, 'undeclared_mutation_surface');
});

test('PASS: mixed-purpose file → highest risk wins', () => {
  // A file in governance/runtime/ matches both governance/ (P2) and governance/runtime/ (P3).
  // The P3 authority_mutation class wins.
  const mixedRegistry = [
    {
      path_pattern: 'governance/',
      mutation_class: 'governance_mutation',
      target_surface: 'governance_runtime',
      risk_class: 'P2',
    },
    {
      path_pattern: 'governance/runtime/',
      mutation_class: 'authority_mutation',
      target_surface: 'authority_propagation',
      risk_class: 'P3',
    },
  ];

  const classifiedAs = classifyFile('governance/runtime/MERGE_GOVERNANCE_RULES.json', mixedRegistry);
  assert.equal(classifiedAs.mutation_class, 'authority_mutation', 'highest-risk class must win');
  assert.equal(classifiedAs.risk_class, 'P3', 'highest risk_class must win');

  const candidate = {
    ...validCandidate,
    governed_files: ['governance/runtime/MERGE_GOVERNANCE_RULES.json'],
    changed_files: ['governance/runtime/MERGE_GOVERNANCE_RULES.json'],
    mutation_classes: ['authority_mutation'],
    target_surfaces: ['authority_propagation'],
    risk_class: 'P3',
  };
  const result = transitionScoCandidate({ candidate, registry: mixedRegistry });
  assert.equal(result.result, 'SCO_VALID');
});

test('FAIL: underestimated mutation scope → SCO_INVALID: risk_classification_failure', () => {
  const candidate = {
    ...validCandidate,
    governed_files: ['.github/workflows/sco-candidate.yml'],
    changed_files: ['.github/workflows/sco-candidate.yml'],
    mutation_classes: ['workflow_mutation'],
    target_surfaces: ['source_control_governance'],
    risk_class: 'P2',  // workflow mutation is P3 — P2 is an underestimate
  };
  const result = transitionScoCandidate({ candidate, registry: REGISTRY });
  assert.equal(result.result, 'SCO_INVALID');
  assert.equal(result.reason, 'risk_classification_failure');
});

test('FAIL: governed mutation missing required metadata → SCO_INVALID', () => {
  const fieldsToOmit = ['sco_id', 'head_sha', 'governed_files', 'mutation_classes', 'target_surfaces', 'requires_sco', 'risk_class'];
  for (const field of fieldsToOmit) {
    const candidate = Object.fromEntries(
      Object.entries(validCandidate).filter(([k]) => k !== field),
    );
    const result = transitionScoCandidate({ candidate, registry: REGISTRY });
    assert.equal(result.result, 'SCO_INVALID', `missing field '${field}' must produce SCO_INVALID`);
  }
});

test('FAIL: documentation file consumed by governance is governed, not documentation_only', () => {
  // A markdown file under governance/ is classified as governance_mutation (P2),
  // not documentation_only. Consumer wins: governance surface > documentation surface.
  const docGovernanceRegistry = [
    {
      path_pattern: 'docs/',
      mutation_class: 'documentation_only',
      target_surface: 'documentation',
      risk_class: 'P1',
    },
    {
      path_pattern: 'governance/',
      mutation_class: 'governance_mutation',
      target_surface: 'governance_runtime',
      risk_class: 'P2',
    },
  ];

  const classifiedAs = classifyFile('governance/CHANGELOG.md', docGovernanceRegistry);
  assert.equal(
    classifiedAs.mutation_class,
    'governance_mutation',
    'governance doc must be classified as governance_mutation, not documentation_only',
  );
  assert.equal(classifiedAs.risk_class, 'P2');

  const candidate = {
    ...validCandidate,
    governed_files: ['governance/CHANGELOG.md'],
    changed_files: ['governance/CHANGELOG.md'],
    mutation_classes: ['governance_mutation'],
    target_surfaces: ['governance_runtime'],
    risk_class: 'P2',
  };
  const result = transitionScoCandidate({ candidate, registry: docGovernanceRegistry });
  assert.equal(result.result, 'SCO_VALID');

  // Declaring it as documentation_only fails
  const wrongCandidate = {
    ...candidate,
    mutation_classes: ['documentation_only'],
    target_surfaces: ['documentation'],
    risk_class: 'P1',
  };
  const wrongResult = transitionScoCandidate({ candidate: wrongCandidate, registry: docGovernanceRegistry });
  assert.equal(wrongResult.result, 'SCO_INVALID');
});

test('FAIL: scope expansion — candidate declares extra mutation class → SCO_INVALID', () => {
  const candidate = {
    ...validCandidate,
    mutation_classes: ['governance_mutation', 'workflow_mutation'],
  };
  const result = transitionScoCandidate({ candidate, registry: REGISTRY });
  assert.equal(result.result, 'SCO_INVALID');
  assert.equal(result.reason, 'scope_expansion_detected');
});

test('FAIL: target surface mismatch → SCO_INVALID', () => {
  const candidate = {
    ...validCandidate,
    target_surfaces: ['runtime_boundary'],  // wrong surface for governance_mutation
  };
  const result = transitionScoCandidate({ candidate, registry: REGISTRY });
  assert.equal(result.result, 'SCO_INVALID');
  assert.equal(result.reason, 'target_surface_mismatch');
});

test('FAIL: governed_file_mismatch — requires_sco true but governed_files empty', () => {
  const candidate = {
    ...validCandidate,
    governed_files: [],
    mutation_classes: [],
    target_surfaces: [],
    requires_sco: true,
  };
  const result = transitionScoCandidate({ candidate, registry: REGISTRY });
  assert.equal(result.result, 'SCO_INVALID');
  assert.equal(result.reason, 'governed_file_mismatch');
});

// ---------------------------------------------------------------------------
// Determinism: identical SCO_CANDIDATE + registry inputs produce identical results
// ---------------------------------------------------------------------------

test('SCO_VALID result is deterministic from canonical inputs', () => {
  const first = transitionScoCandidate({ candidate: validCandidate, registry: REGISTRY });
  const second = transitionScoCandidate({
    candidate: structuredClone(validCandidate),
    registry: structuredClone(REGISTRY),
  });

  assert.equal(first.result, 'SCO_VALID');
  assert.equal(first.result, second.result, 'identical inputs must produce identical result');
  assert.equal(
    canonicalHash(validCandidate),
    canonicalHash(structuredClone(validCandidate)),
    'candidate hash must be deterministic',
  );
});

test('different governed files produce different candidate hash', () => {
  const altCandidate = {
    ...validCandidate,
    governed_files: ['.github/workflows/sco-candidate.yml'],
    mutation_classes: ['workflow_mutation'],
    target_surfaces: ['source_control_governance'],
    risk_class: 'P3',
  };

  assert.notEqual(
    canonicalHash(altCandidate),
    canonicalHash(validCandidate),
    'changed governed files must change candidate hash',
  );
});
