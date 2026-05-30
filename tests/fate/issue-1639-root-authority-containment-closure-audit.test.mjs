import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const spec = JSON.parse(
  readFileSync(join(root, 'governance', 'ROOT_AUTHORITY_CONTAINMENT_CLOSURE_AUDIT_SPEC.json'), 'utf8'),
);
const inventory = JSON.parse(
  readFileSync(join(root, 'governance', 'ROOT_AUTHORITY_INVENTORY.json'), 'utf8'),
);
const driftTaxonomy = JSON.parse(
  readFileSync(join(root, 'governance', 'SOVEREIGNTY_DRIFT_TAXONOMY.json'), 'utf8'),
);
const containmentRules = JSON.parse(
  readFileSync(join(root, 'governance', 'ROOT_AUTHORITY_CONTAINMENT_RULES.json'), 'utf8'),
);
const bypassInventory = JSON.parse(
  readFileSync(join(root, 'governance', 'ROOT_BYPASS_PATH_INVENTORY.json'), 'utf8'),
);

// ---------------------------------------------------------------------------
// Canonical hash helper
// ---------------------------------------------------------------------------

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortCanonical(v)]),
    );
  }
  return value;
}

function canonicalHash(value) {
  return createHash('sha256').update(`${JSON.stringify(sortCanonical(value))}\n`).digest('hex');
}

// ---------------------------------------------------------------------------
// Root authority containment closure audit logic
//
// Boundary contract:
//   #1639 classifies containment. It does not grant, revoke, repair, or
//   execute authority.
//
//   Core invariants:
//     root authority exists ≠ root authority may bypass lineage
//     registry agreement ≠ authority containment
//     declared inventory alone ≠ containment proof
//
//   Classification priority (fail-first):
//     1. Missing required field          → ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE
//     2. Malformed bypass_source         → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL
//     3. Bypass path observed            → ROOT_AUTHORITY_BYPASS_PATH_PRESENT
//     4. Scope drift detected            → ROOT_AUTHORITY_SCOPE_DRIFT
//     5. Delegation drift detected       → ROOT_AUTHORITY_DELEGATION_DRIFT
//     6. Revocation failure detected     → ROOT_AUTHORITY_REVOCATION_DRIFT
//     7a. lineage_bound false + exec path present
//                                        → ROOT_AUTHORITY_BYPASS_PATH_PRESENT
//     7b. lineage_bound false + exec path unknown/absent
//                                        → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL
//     8. cross_registry_reconciliation_hash absent
//                                        → ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE
//     9. All clear                       → ROOT_AUTHORITY_CONTAINMENT_CLOSED
//
//   bypass_source required fields: entry_id, registry, path_type,
//     target_surface, evidence_hash
//   bypass_source disallowed fields: raw_token, raw_secret, secret_value,
//     token_value, credential
//
//   Lineage binding boundary:
//     lineage_bound missing         → RECONCILIATION_INCOMPLETE
//     lineage_bound false + execution_path_present true
//                                   → BYPASS_PATH_PRESENT
//     lineage_bound false + execution_path_present not true
//                                   → AMBIGUITY_FORCES_NULL
//     lineage_bound true + no bypass/drift/revocation + hash present
//                                   → CONTAINMENT_CLOSED
// ---------------------------------------------------------------------------

const AUDIT_TYPE = 'ROOT_AUTHORITY_CONTAINMENT_CLOSURE_AUDIT';

const NON_OPERATIVE_BASE = {
  audit_creates_authority: false,
  audit_creates_execution: false,
  audit_creates_deployment: false,
  audit_creates_merge_permission: false,
  audit_creates_proof: false,
  audit_type: AUDIT_TYPE,
};

const REQUIRED_BYPASS_SOURCE_FIELDS = [
  'entry_id',
  'registry',
  'path_type',
  'target_surface',
  'evidence_hash',
];

const DISALLOWED_BYPASS_SOURCE_FIELDS = [
  'raw_token',
  'raw_secret',
  'secret_value',
  'token_value',
  'credential',
];

function classifyRootAuthorityContainment({
  authority_inventory,
  bypass_observations,
  scope_drift_events,
  delegation_drift_events,
  revocation_failures,
  authority_lineage_bound,
  execution_path_present,
  cross_registry_reconciliation_hash,
}) {
  // --- Phase 1: Missing required fields → RECONCILIATION_INCOMPLETE ---
  const requiredPresence = {
    authority_inventory,
    bypass_observations,
    scope_drift_events,
    delegation_drift_events,
    revocation_failures,
  };
  for (const [field, value] of Object.entries(requiredPresence)) {
    if (value == null) {
      return {
        ...NON_OPERATIVE_BASE,
        classification: 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE',
        legitimacy_status: 'LEGITIMACY_NULL',
        missing_field: field,
      };
    }
  }
  if (authority_lineage_bound == null) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE',
      legitimacy_status: 'LEGITIMACY_NULL',
      missing_field: 'authority_lineage_bound',
    };
  }

  // --- Phase 2: bypass_source field validation → AMBIGUITY_FORCES_NULL ---
  for (const obs of bypass_observations) {
    for (const field of REQUIRED_BYPASS_SOURCE_FIELDS) {
      if (!obs[field]) {
        return {
          ...NON_OPERATIVE_BASE,
          classification: 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL',
          legitimacy_status: 'LEGITIMACY_NULL',
          reason: 'bypass_source_missing_required_field',
          missing_field: field,
        };
      }
    }
    for (const field of DISALLOWED_BYPASS_SOURCE_FIELDS) {
      if (Object.hasOwn(obs, field)) {
        return {
          ...NON_OPERATIVE_BASE,
          classification: 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL',
          legitimacy_status: 'LEGITIMACY_NULL',
          reason: 'bypass_source_contains_disallowed_field',
          disallowed_field: field,
        };
      }
    }
  }

  // --- Phase 3: Bypass path observed → BYPASS_PATH_PRESENT ---
  if (bypass_observations.length > 0) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'ROOT_AUTHORITY_BYPASS_PATH_PRESENT',
      legitimacy_status: 'LEGITIMACY_NULL',
      bypass_observations,
    };
  }

  // --- Phase 4: Scope drift → SCOPE_DRIFT ---
  if (scope_drift_events.length > 0) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'ROOT_AUTHORITY_SCOPE_DRIFT',
      legitimacy_status: 'LEGITIMACY_NULL',
      scope_drift_events,
    };
  }

  // --- Phase 5: Delegation drift → DELEGATION_DRIFT ---
  if (delegation_drift_events.length > 0) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'ROOT_AUTHORITY_DELEGATION_DRIFT',
      legitimacy_status: 'LEGITIMACY_NULL',
      delegation_drift_events,
    };
  }

  // --- Phase 6: Revocation failure → REVOCATION_DRIFT ---
  if (revocation_failures.length > 0) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'ROOT_AUTHORITY_REVOCATION_DRIFT',
      legitimacy_status: 'LEGITIMACY_NULL',
      revocation_failures,
    };
  }

  // --- Phase 7: Authority lineage binding ---
  // authority_lineage_bound null/undefined already handled in Phase 1
  if (authority_lineage_bound !== true) {
    // lineage_bound false + execution path present → bypass (direct auth without lineage)
    if (execution_path_present === true) {
      return {
        ...NON_OPERATIVE_BASE,
        classification: 'ROOT_AUTHORITY_BYPASS_PATH_PRESENT',
        legitimacy_status: 'LEGITIMACY_NULL',
        reason: 'authority_not_lineage_bound_with_execution_path',
      };
    }
    // lineage_bound false + execution path unknown or absent → ambiguity
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL',
      legitimacy_status: 'LEGITIMACY_NULL',
      reason: 'authority_lineage_unbound_execution_path_unknown',
    };
  }

  // --- Phase 8: cross_registry_reconciliation_hash required for CONTAINMENT_CLOSED ---
  if (!cross_registry_reconciliation_hash) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE',
      legitimacy_status: 'LEGITIMACY_NULL',
      missing_field: 'cross_registry_reconciliation_hash',
    };
  }

  // --- All checks pass → CONTAINMENT_CLOSED ---
  return {
    ...NON_OPERATIVE_BASE,
    classification: 'ROOT_AUTHORITY_CONTAINMENT_CLOSED',
    legitimacy_status: 'ROOT_AUTHORITY_CONTAINMENT_CLOSED',
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const RECONCILIATION_HASH = canonicalHash({ reconciliation: 'cross-registry-closed', epoch: 'test-1' });

function validBypassSource(overrides = {}) {
  return {
    entry_id: 'RBP-001',
    registry: 'ROOT_BYPASS_PATH_INVENTORY',
    path_type: 'direct_deploy',
    target_surface: 'RAS-005',
    evidence_hash: canonicalHash({ path: 'cloudflare-git-integration', epoch: 'test' }),
    ...overrides,
  };
}

function containedInputs() {
  return {
    authority_inventory: [
      { surface_id: 'RAS-001', declared_containment_class: 'CLASSIFIED_OPEN' },
      { surface_id: 'RAS-003', declared_containment_class: 'GOVERNED' },
    ],
    bypass_observations: [],
    scope_drift_events: [],
    delegation_drift_events: [],
    revocation_failures: [],
    authority_lineage_bound: true,
    execution_path_present: false,
    cross_registry_reconciliation_hash: RECONCILIATION_HASH,
  };
}

// ---------------------------------------------------------------------------
// Spec boundary assertions
// ---------------------------------------------------------------------------

test('spec: artifact_id is root_authority_containment_closure_audit_spec', () => {
  assert.equal(spec.artifact_id, 'root_authority_containment_closure_audit_spec');
});

test('spec: closes issue #1639', () => {
  assert.equal(spec.closes, '#1639');
});

test('spec: depends_on includes #1636, #1637, #1638', () => {
  assert.ok(spec.depends_on.includes('#1636'));
  assert.ok(spec.depends_on.includes('#1637'));
  assert.ok(spec.depends_on.includes('#1638'));
});

test('spec: non_operability fields are all false', () => {
  for (const [key, val] of Object.entries(spec.non_operability)) {
    assert.equal(val, false, `non_operability.${key} must be false`);
  }
});

test('spec: non_goals fields are all false', () => {
  for (const [key, val] of Object.entries(spec.non_goals)) {
    assert.equal(val, false, `non_goals.${key} must be false`);
  }
});

test('spec: defines all nine required audit surfaces', () => {
  const expected = [
    'repository_admin_authority',
    'branch_protection_authority',
    'workflow_dispatch_authority',
    'environment_secret_authority',
    'cloudflare_deploy_authority',
    'local_wrangler_authority',
    'token_authority',
    'infrastructure_mutation_authority',
    'federation_root_authority',
  ];
  assert.deepEqual(spec.audit_surfaces, expected);
});

test('spec: defines all seven classifications', () => {
  const expected = [
    'ROOT_AUTHORITY_CONTAINMENT_CLOSED',
    'ROOT_AUTHORITY_BYPASS_PATH_PRESENT',
    'ROOT_AUTHORITY_SCOPE_DRIFT',
    'ROOT_AUTHORITY_DELEGATION_DRIFT',
    'ROOT_AUTHORITY_REVOCATION_DRIFT',
    'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE',
    'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL',
  ];
  for (const cls of expected) {
    assert.ok(cls in spec.classifications, `Missing classification: ${cls}`);
  }
});

test('spec: all non-CLOSED classifications have LEGITIMACY_NULL legitimacy_status', () => {
  for (const [name, cls] of Object.entries(spec.classifications)) {
    if (name !== 'ROOT_AUTHORITY_CONTAINMENT_CLOSED') {
      assert.equal(
        cls.legitimacy_status,
        'LEGITIMACY_NULL',
        `${name} must have LEGITIMACY_NULL`,
      );
    }
  }
});

test('spec: ROOT_AUTHORITY_CONTAINMENT_CLOSED does not authorize execution, merge, deployment, or proof', () => {
  const cls = spec.classifications.ROOT_AUTHORITY_CONTAINMENT_CLOSED;
  assert.equal(cls.authorizes_execution, false);
  assert.equal(cls.authorizes_merge, false);
  assert.equal(cls.authorizes_deployment, false);
  assert.equal(cls.creates_proof, false);
});

test('spec: ROOT_AUTHORITY_CONTAINMENT_CLOSED condition requires cross_registry_reconciliation_hash', () => {
  assert.ok(
    spec.classifications.ROOT_AUTHORITY_CONTAINMENT_CLOSED.condition.includes('cross_registry_reconciliation_hash'),
    'CLOSED condition must mention cross_registry_reconciliation_hash',
  );
});

test('spec: failure_result is LEGITIMACY_NULL', () => {
  assert.equal(spec.failure_result, 'LEGITIMACY_NULL');
});

test('spec: bypass_source_evidence_structure defines required and disallowed fields', () => {
  const bss = spec.bypass_source_evidence_structure;
  for (const f of ['entry_id', 'registry', 'path_type', 'target_surface', 'evidence_hash']) {
    assert.ok(bss.required_fields.includes(f), `required_fields must include ${f}`);
  }
  for (const f of ['raw_token', 'raw_secret', 'secret_value', 'credential']) {
    assert.ok(bss.disallowed_fields.includes(f), `disallowed_fields must include ${f}`);
  }
});

test('spec: core_invariants encode root authority exists ≠ bypass lineage', () => {
  assert.ok(spec.core_invariants.root_authority_exists_ne_bypass_lineage.includes('≠'));
});

test('spec: core_invariants encode registry agreement ≠ authority containment', () => {
  assert.ok(spec.core_invariants.registry_agreement_ne_authority_containment.includes('≠'));
});

test('spec: inventory_ne_containment_proof encodes declared inventory ≠ containment proof', () => {
  assert.ok(spec.inventory_ne_containment_proof.invariant.includes('≠'));
});

test('spec: lineage_binding_semantics defines all four cases', () => {
  const lb = spec.lineage_binding_semantics;
  assert.ok('missing' in lb, 'lineage_binding_semantics.missing must exist');
  assert.ok('false_with_execution_path' in lb, 'false_with_execution_path must exist');
  assert.ok('false_without_execution_path' in lb, 'false_without_execution_path must exist');
  assert.ok('true_with_no_bypass_or_drift' in lb, 'true_with_no_bypass_or_drift must exist');
  assert.equal(lb.missing.classification, 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE');
  assert.equal(lb.false_with_execution_path.classification, 'ROOT_AUTHORITY_BYPASS_PATH_PRESENT');
  assert.equal(lb.false_without_execution_path.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(lb.true_with_no_bypass_or_drift.classification, 'ROOT_AUTHORITY_CONTAINMENT_CLOSED');
});

test('spec: cross_audit_boundary encodes registry agreement ≠ authority containment', () => {
  assert.ok(spec.cross_audit_boundary.invariant.includes('≠'));
  assert.equal(
    spec.cross_audit_boundary.root_authority_bypass_path_present.prevents_derivation_of,
    'CROSS_REGISTRY_RECONCILIATION_CLOSED',
  );
});

// ---------------------------------------------------------------------------
// Inventory boundary assertions
// ---------------------------------------------------------------------------

test('inventory: artifact_class is declared_root_authority_inventory', () => {
  assert.equal(inventory.artifact_class, 'declared_root_authority_inventory');
});

test('inventory: declares all nine audit surfaces', () => {
  const names = inventory.surfaces.map((s) => s.surface_name);
  for (const name of spec.audit_surfaces) {
    assert.ok(names.includes(name), `Missing surface: ${name}`);
  }
});

test('inventory: all surfaces use declared_containment_class not current_containment_status', () => {
  for (const s of inventory.surfaces) {
    assert.ok('declared_containment_class' in s, `${s.surface_name} must have declared_containment_class`);
    assert.ok(!('current_containment_status' in s), `${s.surface_name} must not have current_containment_status`);
  }
});

test('inventory: all surfaces have declared_classification_basis', () => {
  for (const s of inventory.surfaces) {
    assert.ok(
      Array.isArray(s.declared_classification_basis) && s.declared_classification_basis.length > 0,
      `${s.surface_name} must have declared_classification_basis`,
    );
  }
});

test('inventory: all surfaces have declared_evidence_rule', () => {
  for (const s of inventory.surfaces) {
    assert.ok(typeof s.declared_evidence_rule === 'string', `${s.surface_name} must have declared_evidence_rule`);
  }
});

test('inventory: gap_report declares no undeclared surfaces', () => {
  assert.equal(inventory.inventory_completeness.gap_report.undeclared_surfaces_detected, false);
  assert.deepEqual(inventory.inventory_completeness.gap_report.gaps, []);
});

// ---------------------------------------------------------------------------
// Drift taxonomy boundary assertions
// ---------------------------------------------------------------------------

test('drift taxonomy: defines ROOT_AUTHORITY_SCOPE_DRIFT with LEGITIMACY_NULL', () => {
  const found = driftTaxonomy.drift_classes.find((d) => d.drift_class === 'ROOT_AUTHORITY_SCOPE_DRIFT');
  assert.ok(found, 'ROOT_AUTHORITY_SCOPE_DRIFT must be in drift taxonomy');
  assert.equal(found.containment_result, 'LEGITIMACY_NULL');
});

test('drift taxonomy: defines ROOT_AUTHORITY_DELEGATION_DRIFT with LEGITIMACY_NULL', () => {
  const found = driftTaxonomy.drift_classes.find((d) => d.drift_class === 'ROOT_AUTHORITY_DELEGATION_DRIFT');
  assert.ok(found);
  assert.equal(found.containment_result, 'LEGITIMACY_NULL');
});

test('drift taxonomy: defines ROOT_AUTHORITY_REVOCATION_DRIFT with LEGITIMACY_NULL', () => {
  const found = driftTaxonomy.drift_classes.find((d) => d.drift_class === 'ROOT_AUTHORITY_REVOCATION_DRIFT');
  assert.ok(found);
  assert.equal(found.containment_result, 'LEGITIMACY_NULL');
});

test('drift taxonomy: all drift classes have LEGITIMACY_NULL containment_result', () => {
  for (const cls of driftTaxonomy.drift_classes) {
    assert.equal(cls.containment_result, 'LEGITIMACY_NULL', `${cls.drift_class} must have LEGITIMACY_NULL`);
  }
});

// ---------------------------------------------------------------------------
// Containment rules boundary assertions
// ---------------------------------------------------------------------------

test('containment rules: every inventory surface has a containment rule', () => {
  const ruled = containmentRules.containment_rules.map((r) => r.surface_id);
  for (const s of inventory.surfaces) {
    assert.ok(ruled.includes(s.surface_id), `Missing containment rule for ${s.surface_id}`);
  }
});

test('containment rules: all rules have non-empty may_do and may_not_do', () => {
  for (const rule of containmentRules.containment_rules) {
    assert.ok(Array.isArray(rule.may_do) && rule.may_do.length > 0, `${rule.rule_id} must have may_do`);
    assert.ok(Array.isArray(rule.may_not_do) && rule.may_not_do.length > 0, `${rule.rule_id} must have may_not_do`);
  }
});

// ---------------------------------------------------------------------------
// Bypass path inventory boundary assertions
// ---------------------------------------------------------------------------

test('bypass inventory: all entries have valid bypass_source structure', () => {
  for (const path of bypassInventory.bypass_paths) {
    const src = path.bypass_source;
    assert.ok(src, `${path.bypass_id} must have bypass_source`);
    for (const field of REQUIRED_BYPASS_SOURCE_FIELDS) {
      assert.ok(src[field], `${path.bypass_id} bypass_source must have ${field}`);
    }
    for (const field of DISALLOWED_BYPASS_SOURCE_FIELDS) {
      assert.ok(!Object.hasOwn(src, field), `${path.bypass_id} bypass_source must not contain ${field}`);
    }
  }
});

test('bypass inventory: all entries reference ROOT_AUTHORITY_BYPASS_PATH_PRESENT in declared_legitimacy_effect', () => {
  for (const path of bypassInventory.bypass_paths) {
    assert.ok(
      path.declared_legitimacy_effect.includes('ROOT_AUTHORITY_BYPASS_PATH_PRESENT'),
      `${path.bypass_id} declared_legitimacy_effect must reference ROOT_AUTHORITY_BYPASS_PATH_PRESENT`,
    );
  }
});

// ---------------------------------------------------------------------------
// Classification: ROOT_AUTHORITY_CONTAINMENT_CLOSED
//
// Requires ALL of:
//   - cross_registry_reconciliation_hash present
//   - declared root surfaces known (authority_inventory)
//   - authority_lineage_bound true
//   - no bypass observations
//   - no scope drift
//   - no delegation drift
//   - no revocation failure
//   - no ambiguity
// ---------------------------------------------------------------------------

test('full closure conditions met → ROOT_AUTHORITY_CONTAINMENT_CLOSED', () => {
  const report = classifyRootAuthorityContainment(containedInputs());
  assert.equal(report.classification, 'ROOT_AUTHORITY_CONTAINMENT_CLOSED');
  assert.equal(report.legitimacy_status, 'ROOT_AUTHORITY_CONTAINMENT_CLOSED');
});

test('CONTAINMENT_CLOSED: all non-operative flags are false', () => {
  const report = classifyRootAuthorityContainment(containedInputs());
  assert.equal(report.audit_creates_authority, false);
  assert.equal(report.audit_creates_execution, false);
  assert.equal(report.audit_creates_deployment, false);
  assert.equal(report.audit_creates_merge_permission, false);
  assert.equal(report.audit_creates_proof, false);
});

// ---------------------------------------------------------------------------
// Invariant: declared inventory alone ≠ containment proof
// ---------------------------------------------------------------------------

test('inventory populated but cross_registry_reconciliation_hash absent → not CONTAINMENT_CLOSED', () => {
  const inputs = containedInputs();
  inputs.cross_registry_reconciliation_hash = null;
  const report = classifyRootAuthorityContainment(inputs);
  assert.notEqual(report.classification, 'ROOT_AUTHORITY_CONTAINMENT_CLOSED');
  assert.equal(report.classification, 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE');
});

test('inventory populated but authority_lineage_bound absent → not CONTAINMENT_CLOSED', () => {
  const inputs = containedInputs();
  inputs.authority_lineage_bound = null;
  const report = classifyRootAuthorityContainment(inputs);
  assert.notEqual(report.classification, 'ROOT_AUTHORITY_CONTAINMENT_CLOSED');
  assert.equal(report.classification, 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE');
});

test('inventory populated but bypass_observations absent → not CONTAINMENT_CLOSED', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = null;
  const report = classifyRootAuthorityContainment(inputs);
  assert.notEqual(report.classification, 'ROOT_AUTHORITY_CONTAINMENT_CLOSED');
});

// ---------------------------------------------------------------------------
// Invariant: root authority exists ≠ root authority may bypass lineage
// ---------------------------------------------------------------------------

test('authority_inventory populated with bypass path observed → BYPASS_PATH_PRESENT not CONTAINMENT_CLOSED', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [validBypassSource()];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_BYPASS_PATH_PRESENT');
  assert.notEqual(report.classification, 'ROOT_AUTHORITY_CONTAINMENT_CLOSED');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

// ---------------------------------------------------------------------------
// Invariant: registry agreement ≠ authority containment
// ---------------------------------------------------------------------------

test('all drift arrays empty and hash present but bypass observed → BYPASS_PATH_PRESENT not CONTAINMENT_CLOSED', () => {
  const inputs = {
    ...containedInputs(),
    scope_drift_events: [],
    delegation_drift_events: [],
    revocation_failures: [],
    bypass_observations: [validBypassSource()],
  };
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_BYPASS_PATH_PRESENT');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

// ---------------------------------------------------------------------------
// Classification: ROOT_AUTHORITY_BYPASS_PATH_PRESENT
// ---------------------------------------------------------------------------

test('bypass path observed → ROOT_AUTHORITY_BYPASS_PATH_PRESENT', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [validBypassSource()];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_BYPASS_PATH_PRESENT');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('BYPASS_PATH_PRESENT: bypass_observations included in report', () => {
  const obs = validBypassSource();
  const inputs = containedInputs();
  inputs.bypass_observations = [obs];
  const report = classifyRootAuthorityContainment(inputs);
  assert.deepEqual(report.bypass_observations, [obs]);
});

test('multiple bypass observations → BYPASS_PATH_PRESENT with all observations', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [
    validBypassSource({ entry_id: 'RBP-001', target_surface: 'RAS-005' }),
    validBypassSource({ entry_id: 'RBP-004', target_surface: 'RAS-001' }),
  ];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_BYPASS_PATH_PRESENT');
  assert.equal(report.bypass_observations.length, 2);
});

// ---------------------------------------------------------------------------
// Classification: ROOT_AUTHORITY_SCOPE_DRIFT
// ---------------------------------------------------------------------------

test('scope expansion → ROOT_AUTHORITY_SCOPE_DRIFT', () => {
  const inputs = containedInputs();
  inputs.scope_drift_events = [{ surface_id: 'RAS-001', expanded_target: 'proof_registry' }];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_SCOPE_DRIFT');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('SCOPE_DRIFT: scope_drift_events included in report', () => {
  const evt = { surface_id: 'RAS-001', expanded_target: 'proof_registry' };
  const inputs = containedInputs();
  inputs.scope_drift_events = [evt];
  const report = classifyRootAuthorityContainment(inputs);
  assert.deepEqual(report.scope_drift_events, [evt]);
});

// ---------------------------------------------------------------------------
// Classification: ROOT_AUTHORITY_DELEGATION_DRIFT
// ---------------------------------------------------------------------------

test('delegation expansion → ROOT_AUTHORITY_DELEGATION_DRIFT', () => {
  const inputs = containedInputs();
  inputs.delegation_drift_events = [{ surface_id: 'RAS-007', new_principal: 'workflow-xyz' }];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_DELEGATION_DRIFT');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('DELEGATION_DRIFT: delegation_drift_events included in report', () => {
  const evt = { surface_id: 'RAS-007', new_principal: 'workflow-xyz' };
  const inputs = containedInputs();
  inputs.delegation_drift_events = [evt];
  const report = classifyRootAuthorityContainment(inputs);
  assert.deepEqual(report.delegation_drift_events, [evt]);
});

// ---------------------------------------------------------------------------
// Classification: ROOT_AUTHORITY_REVOCATION_DRIFT
// ---------------------------------------------------------------------------

test('revocation failure → ROOT_AUTHORITY_REVOCATION_DRIFT', () => {
  const inputs = containedInputs();
  inputs.revocation_failures = [{ surface_id: 'RAS-007', reason: 'token_not_rotated' }];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_REVOCATION_DRIFT');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('REVOCATION_DRIFT: revocation_failures included in report', () => {
  const failure = { surface_id: 'RAS-007', reason: 'token_not_rotated' };
  const inputs = containedInputs();
  inputs.revocation_failures = [failure];
  const report = classifyRootAuthorityContainment(inputs);
  assert.deepEqual(report.revocation_failures, [failure]);
});

// ---------------------------------------------------------------------------
// Classification: ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE
// Missing evidence → RECONCILIATION_INCOMPLETE
// ---------------------------------------------------------------------------

test('missing authority_inventory → ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE', () => {
  const inputs = containedInputs();
  inputs.authority_inventory = null;
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE');
  assert.equal(report.missing_field, 'authority_inventory');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('missing bypass_observations → ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = null;
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE');
  assert.equal(report.missing_field, 'bypass_observations');
});

test('missing scope_drift_events → ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE', () => {
  const inputs = containedInputs();
  inputs.scope_drift_events = null;
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE');
  assert.equal(report.missing_field, 'scope_drift_events');
});

test('missing delegation_drift_events → ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE', () => {
  const inputs = containedInputs();
  inputs.delegation_drift_events = null;
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE');
  assert.equal(report.missing_field, 'delegation_drift_events');
});

test('missing revocation_failures → ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE', () => {
  const inputs = containedInputs();
  inputs.revocation_failures = null;
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE');
  assert.equal(report.missing_field, 'revocation_failures');
});

test('missing authority_lineage_bound → ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE', () => {
  const inputs = containedInputs();
  inputs.authority_lineage_bound = null;
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE');
  assert.equal(report.missing_field, 'authority_lineage_bound');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('missing cross_registry_reconciliation_hash → ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE', () => {
  const inputs = containedInputs();
  inputs.cross_registry_reconciliation_hash = null;
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_RECONCILIATION_INCOMPLETE');
  assert.equal(report.missing_field, 'cross_registry_reconciliation_hash');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

// ---------------------------------------------------------------------------
// Classification: ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL
// Malformed bypass_source, or unbound authority with unknown execution path
// ---------------------------------------------------------------------------

test('bypass_source missing entry_id → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [validBypassSource({ entry_id: undefined })];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(report.reason, 'bypass_source_missing_required_field');
  assert.equal(report.missing_field, 'entry_id');
});

test('bypass_source missing registry → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [validBypassSource({ registry: undefined })];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(report.missing_field, 'registry');
});

test('bypass_source missing path_type → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [validBypassSource({ path_type: undefined })];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(report.missing_field, 'path_type');
});

test('bypass_source missing target_surface → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [validBypassSource({ target_surface: undefined })];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(report.missing_field, 'target_surface');
});

test('bypass_source missing evidence_hash → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [validBypassSource({ evidence_hash: undefined })];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(report.missing_field, 'evidence_hash');
});

test('bypass_source with raw_token → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [{ ...validBypassSource(), raw_token: 'secret-token-value' }];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(report.reason, 'bypass_source_contains_disallowed_field');
  assert.equal(report.disallowed_field, 'raw_token');
});

test('bypass_source with raw_secret → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [{ ...validBypassSource(), raw_secret: 'exposed' }];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(report.disallowed_field, 'raw_secret');
});

test('bypass_source with secret_value → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [{ ...validBypassSource(), secret_value: 'leaked' }];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(report.disallowed_field, 'secret_value');
});

test('bypass_source with credential → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [{ ...validBypassSource(), credential: 'some-cred' }];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(report.disallowed_field, 'credential');
});

// ---------------------------------------------------------------------------
// Lineage binding boundary: three distinct cases for authority_lineage_bound false
// ---------------------------------------------------------------------------

test('lineage_bound false + execution_path_present true → ROOT_AUTHORITY_BYPASS_PATH_PRESENT', () => {
  const inputs = containedInputs();
  inputs.authority_lineage_bound = false;
  inputs.execution_path_present = true;
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_BYPASS_PATH_PRESENT');
  assert.equal(report.reason, 'authority_not_lineage_bound_with_execution_path');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('lineage_bound false + execution_path_present false → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL', () => {
  const inputs = containedInputs();
  inputs.authority_lineage_bound = false;
  inputs.execution_path_present = false;
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(report.reason, 'authority_lineage_unbound_execution_path_unknown');
  assert.equal(report.legitimacy_status, 'LEGITIMACY_NULL');
});

test('lineage_bound false + execution_path_present null (unknown) → ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL', () => {
  const inputs = containedInputs();
  inputs.authority_lineage_bound = false;
  inputs.execution_path_present = null;
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(report.reason, 'authority_lineage_unbound_execution_path_unknown');
});

test('lineage_bound false with exec path — distinct from bypass_observation path (reason differs)', () => {
  const withObs = containedInputs();
  withObs.bypass_observations = [validBypassSource()];
  const reportObs = classifyRootAuthorityContainment(withObs);

  const withUnbound = containedInputs();
  withUnbound.authority_lineage_bound = false;
  withUnbound.execution_path_present = true;
  const reportUnbound = classifyRootAuthorityContainment(withUnbound);

  // Both are BYPASS_PATH_PRESENT but with different reasons
  assert.equal(reportObs.classification, 'ROOT_AUTHORITY_BYPASS_PATH_PRESENT');
  assert.equal(reportUnbound.classification, 'ROOT_AUTHORITY_BYPASS_PATH_PRESENT');
  assert.ok(!reportObs.reason, 'observation-based bypass has no reason field');
  assert.equal(reportUnbound.reason, 'authority_not_lineage_bound_with_execution_path');
});

// ---------------------------------------------------------------------------
// Classification priority order
// ---------------------------------------------------------------------------

test('bypass path + scope drift → BYPASS_PATH_PRESENT takes priority over SCOPE_DRIFT', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [validBypassSource()];
  inputs.scope_drift_events = [{ surface_id: 'RAS-001', expanded_target: 'proof_registry' }];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_BYPASS_PATH_PRESENT');
});

test('scope drift + delegation drift → SCOPE_DRIFT takes priority over DELEGATION_DRIFT', () => {
  const inputs = containedInputs();
  inputs.scope_drift_events = [{ surface_id: 'RAS-001', expanded_target: 'x' }];
  inputs.delegation_drift_events = [{ surface_id: 'RAS-007', new_principal: 'wf' }];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_SCOPE_DRIFT');
});

test('delegation drift + revocation failure → DELEGATION_DRIFT takes priority over REVOCATION_DRIFT', () => {
  const inputs = containedInputs();
  inputs.delegation_drift_events = [{ surface_id: 'RAS-007', new_principal: 'wf' }];
  inputs.revocation_failures = [{ surface_id: 'RAS-007', reason: 'not_rotated' }];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_DELEGATION_DRIFT');
});

test('malformed bypass_source takes priority over bypass path observed (validation before count)', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [validBypassSource({ entry_id: undefined })];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.classification, 'ROOT_AUTHORITY_AMBIGUITY_FORCES_NULL');
  assert.equal(report.reason, 'bypass_source_missing_required_field');
});

// ---------------------------------------------------------------------------
// Non-operability: all results never create authority
// ---------------------------------------------------------------------------

test('LEGITIMACY_NULL result: audit never creates authority', () => {
  const inputs = containedInputs();
  inputs.bypass_observations = [validBypassSource()];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.audit_creates_authority, false);
  assert.equal(report.audit_creates_execution, false);
});

test('LEGITIMACY_NULL from scope drift: audit never creates deployment', () => {
  const inputs = containedInputs();
  inputs.scope_drift_events = [{ surface_id: 'RAS-005', expanded_target: 'new_worker' }];
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.audit_creates_deployment, false);
});

test('LEGITIMACY_NULL from missing evidence: audit never creates merge permission', () => {
  const inputs = containedInputs();
  inputs.authority_inventory = null;
  const report = classifyRootAuthorityContainment(inputs);
  assert.equal(report.audit_creates_merge_permission, false);
});

// ---------------------------------------------------------------------------
// Audit type always present
// ---------------------------------------------------------------------------

test('report always includes audit_type field', () => {
  assert.equal(classifyRootAuthorityContainment(containedInputs()).audit_type, AUDIT_TYPE);
});

test('LEGITIMACY_NULL report always includes audit_type field', () => {
  const inputs = containedInputs();
  inputs.authority_inventory = null;
  assert.equal(classifyRootAuthorityContainment(inputs).audit_type, AUDIT_TYPE);
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('same contained inputs → identical classification on repeated calls', () => {
  const first = classifyRootAuthorityContainment(containedInputs());
  const second = classifyRootAuthorityContainment(containedInputs());
  assert.equal(first.classification, second.classification);
  assert.equal(first.legitimacy_status, second.legitimacy_status);
});

test('same bypass inputs → identical classification on repeated calls', () => {
  function withBypass() {
    const inputs = containedInputs();
    inputs.bypass_observations = [validBypassSource()];
    return inputs;
  }
  assert.equal(
    classifyRootAuthorityContainment(withBypass()).classification,
    classifyRootAuthorityContainment(withBypass()).classification,
  );
});

test('different evidence_hash values produce different canonical hashes', () => {
  const h1 = canonicalHash({ path: 'rbp-001', epoch: 'epoch-1' });
  const h2 = canonicalHash({ path: 'rbp-001', epoch: 'epoch-2' });
  assert.notEqual(h1, h2);
});
