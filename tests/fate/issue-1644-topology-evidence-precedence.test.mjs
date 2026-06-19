import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const spec = JSON.parse(
  readFileSync(join(root, 'governance', 'topology', 'TOPOLOGY_EVIDENCE_PRECEDENCE_SPEC.json'), 'utf8'),
);

import { sortCanonical, canonicalHash } from '../helpers/canonical-test-hash.mjs';

// ---------------------------------------------------------------------------
// Evidence precedence arbitration logic
//
// Boundary contract:
//   #1644 arbitrates — compares, ranks, classifies.
//   It does not repair evidence, rewrite registries, create authority,
//   create legitimacy, create execution eligibility, or mutate topology.
//
//   Tier precedence: Verified Tier 1 > Tier 2 > Tier 3 > Tier 4
//
//   Core invariants:
//     More evidence beats more nodes
//     Visibility ≠ Truth
//     Observation ≠ Finality
//     Arbitration ≠ Truth creation
//     Arbitration ≠ Legitimacy creation
//
//   Arbitration rules:
//     Rule A: Verified Tier 1 + Tier 2 disagrees → Tier 1 wins, REGISTRY_DRIFT
//     Rule B: Tier 1 integrity fails              → suspend closure, LEDGER_INTEGRITY_SUSPECT
//     Rule C: Tier 2 sources disagree             → no closure, REGISTRY_DIVERGENCE
//     Rule D: Tier 3 conflicts with Tier 2        → registry maintains precedence, TOPOLOGY_STALE
//     Rule E: Tier 4 conflicts with Tier 1–3      → reconstruction rejected, ARBITRATION_FORCES_NULL
// ---------------------------------------------------------------------------

const NON_OPERATIVE_BASE = {
  arbitration_creates_authority: false,
  arbitration_creates_legitimacy: false,
  arbitration_creates_execution: false,
  arbitration_creates_deployment: false,
  arbitration_creates_proof: false,
  arbitration_creates_reconciliation_closure: false,
};

function arbitrateEvidence({
  tier1_evidence,
  tier1_integrity_verified,
  tier2_evidence,
  tier2_sources_agree,
  tier3_observations,
  tier4_reconstructions,
  conflict_set,
}) {
  const conflicting_evidence_hashes = (conflict_set ?? []).map((e) => e.hash).filter(Boolean);

  // --- Missing required fields ---
  if (tier1_integrity_verified == null) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'REGISTRY_RECONCILIATION_INCOMPLETE',
      winning_tier: null,
      winning_evidence_hash: null,
      conflicting_evidence_hashes,
      closure_derivable: false,
      missing_field: 'tier1_integrity_verified',
    };
  }

  // --- Rule B: Tier 1 integrity failure → suspend closure ---
  if (tier1_integrity_verified === false) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'LEDGER_INTEGRITY_SUSPECT',
      winning_tier: null,
      winning_evidence_hash: null,
      conflicting_evidence_hashes,
      closure_derivable: false,
    };
  }

  // --- Rule A: Verified Tier 1 wins over Tier 2 disagreement ---
  if (
    tier1_integrity_verified === true &&
    tier1_evidence != null &&
    tier2_evidence != null &&
    tier2_sources_agree === false
  ) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'REGISTRY_DRIFT',
      winning_tier: 'TIER_1',
      winning_evidence_hash: tier1_evidence.hash ?? null,
      conflicting_evidence_hashes,
      closure_derivable: false,
    };
  }

  // --- Verified Tier 1 with converging Tier 2 → EVIDENCE_CONVERGENT ---
  if (
    tier1_integrity_verified === true &&
    tier1_evidence != null &&
    tier2_sources_agree !== false
  ) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'EVIDENCE_CONVERGENT',
      winning_tier: 'TIER_1',
      winning_evidence_hash: tier1_evidence.hash ?? null,
      conflicting_evidence_hashes: [],
      closure_derivable: true,
    };
  }

  // --- No Tier 1 evidence present ---

  // --- Rule C: Tier 2 sources disagree ---
  if (tier2_sources_agree === false) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'REGISTRY_DIVERGENCE',
      winning_tier: null,
      winning_evidence_hash: null,
      conflicting_evidence_hashes,
      closure_derivable: false,
    };
  }

  // --- Rule E: Tier 4 reconstruction conflicts with any higher tier evidence ---
  if (
    Array.isArray(tier4_reconstructions) &&
    tier4_reconstructions.length > 0 &&
    (
      (Array.isArray(tier3_observations) && tier3_observations.length > 0) ||
      tier2_evidence != null ||
      tier1_evidence != null
    )
  ) {
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'ARBITRATION_FORCES_NULL',
      winning_tier: null,
      winning_evidence_hash: null,
      conflicting_evidence_hashes,
      closure_derivable: false,
    };
  }

  // --- Tier 2 sources agree → use Tier 2 ---
  if (tier2_evidence != null && tier2_sources_agree === true) {
    const tier3_conflicts =
      Array.isArray(tier3_observations) && tier3_observations.some((o) => o.conflicts_with_registry);
    if (tier3_conflicts) {
      return {
        ...NON_OPERATIVE_BASE,
        classification: 'TOPOLOGY_STALE',
        winning_tier: 'TIER_2',
        winning_evidence_hash: tier2_evidence.hash ?? null,
        conflicting_evidence_hashes,
        closure_derivable: false,
      };
    }
    return {
      ...NON_OPERATIVE_BASE,
      classification: 'EVIDENCE_CONVERGENT',
      winning_tier: 'TIER_2',
      winning_evidence_hash: tier2_evidence.hash ?? null,
      conflicting_evidence_hashes: [],
      closure_derivable: true,
    };
  }

  // --- No decisive artifact → UNRESOLVED ---
  return {
    ...NON_OPERATIVE_BASE,
    classification: 'UNRESOLVED',
    winning_tier: null,
    winning_evidence_hash: null,
    conflicting_evidence_hashes,
    closure_derivable: false,
  };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TIER1_HASH = canonicalHash({ type: 'signed_revocation_record', epoch: 'test-1' });
const TIER2_HASH = canonicalHash({ type: 'replay_registry_state', epoch: 'test-1' });

function tier1Evidence(overrides = {}) {
  return { type: 'signed_revocation_record', hash: TIER1_HASH, ...overrides };
}

function tier2Evidence(overrides = {}) {
  return { type: 'replay_registry_state', hash: TIER2_HASH, ...overrides };
}

function conflictEntry(hash) {
  return { hash };
}

function convergentInputs() {
  return {
    tier1_evidence: tier1Evidence(),
    tier1_integrity_verified: true,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: true,
    tier3_observations: [],
    tier4_reconstructions: [],
    conflict_set: [],
  };
}

// ---------------------------------------------------------------------------
// Spec boundary assertions
// ---------------------------------------------------------------------------

test('spec: artifact_id is topology_evidence_precedence_spec', () => {
  assert.equal(spec.artifact_id, 'topology_evidence_precedence_spec');
});

test('spec: closes issue #1644', () => {
  assert.equal(spec.closes, '#1644');
});

test('spec: depends_on includes #1640, #1641, #1642, #1643', () => {
  assert.ok(spec.depends_on.includes('#1640'));
  assert.ok(spec.depends_on.includes('#1641'));
  assert.ok(spec.depends_on.includes('#1642'));
  assert.ok(spec.depends_on.includes('#1643'));
});

test('spec: planning_only is true', () => {
  assert.equal(spec.planning_only, true);
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

test('spec: defines four evidence tiers', () => {
  assert.equal(spec.evidence_tiers.tiers.length, 4);
});

test('spec: tiers have correct labels TIER_1 through TIER_4', () => {
  const labels = spec.evidence_tiers.tiers.map((t) => t.label);
  assert.deepEqual(labels, ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4']);
});

test('spec: Tier 1 examples include signed_revocation_record', () => {
  const tier1 = spec.evidence_tiers.tiers.find((t) => t.tier === 1);
  assert.ok(tier1.examples.includes('signed_revocation_record'));
});

test('spec: Tier 1 examples include continuity_invalidation_record', () => {
  const tier1 = spec.evidence_tiers.tiers.find((t) => t.tier === 1);
  assert.ok(tier1.examples.includes('continuity_invalidation_record'));
});

test('spec: Tier 1 can produce deterministic convergence', () => {
  const tier1 = spec.evidence_tiers.tiers.find((t) => t.tier === 1);
  assert.equal(tier1.can_produce_deterministic_convergence, true);
});

test('spec: Tier 3 cannot produce deterministic convergence', () => {
  const tier3 = spec.evidence_tiers.tiers.find((t) => t.tier === 3);
  assert.equal(tier3.can_produce_deterministic_convergence, false);
});

test('spec: Tier 4 cannot produce deterministic convergence', () => {
  const tier4 = spec.evidence_tiers.tiers.find((t) => t.tier === 4);
  assert.equal(tier4.can_produce_deterministic_convergence, false);
});

test('spec: Tier 4 cannot invalidate execution eligibility', () => {
  const tier4 = spec.evidence_tiers.tiers.find((t) => t.tier === 4);
  assert.equal(tier4.can_invalidate_execution_eligibility, false);
});

test('spec: topology_observations_never_override_registry_state is true for Tier 3', () => {
  const tier3 = spec.evidence_tiers.tiers.find((t) => t.tier === 3);
  assert.equal(tier3.topology_observations_never_override_registry_state, true);
});

test('spec: derived_reconstruction_never_overrides_observed_evidence is true for Tier 4', () => {
  const tier4 = spec.evidence_tiers.tiers.find((t) => t.tier === 4);
  assert.equal(tier4.derived_reconstruction_never_overrides_observed_evidence, true);
});

test('spec: tier2_may_not_override_verified_tier1 is true for Tier 2', () => {
  const tier2 = spec.evidence_tiers.tiers.find((t) => t.tier === 2);
  assert.equal(tier2.tier2_may_not_override_verified_tier1, true);
});

test('spec: defines all five arbitration rules', () => {
  const rules = spec.arbitration_rules;
  assert.ok('rule_a' in rules);
  assert.ok('rule_b' in rules);
  assert.ok('rule_c' in rules);
  assert.ok('rule_d' in rules);
  assert.ok('rule_e' in rules);
});

test('spec: Rule A classification is REGISTRY_DRIFT', () => {
  assert.equal(spec.arbitration_rules.rule_a.classification, 'REGISTRY_DRIFT');
});

test('spec: Rule B classification is LEDGER_INTEGRITY_SUSPECT', () => {
  assert.equal(spec.arbitration_rules.rule_b.classification, 'LEDGER_INTEGRITY_SUSPECT');
});

test('spec: Rule C classification is REGISTRY_DIVERGENCE', () => {
  assert.equal(spec.arbitration_rules.rule_c.classification, 'REGISTRY_DIVERGENCE');
});

test('spec: Rule D classification is TOPOLOGY_STALE', () => {
  assert.equal(spec.arbitration_rules.rule_d.classification, 'TOPOLOGY_STALE');
});

test('spec: Rule E classification is ARBITRATION_FORCES_NULL', () => {
  assert.equal(spec.arbitration_rules.rule_e.classification, 'ARBITRATION_FORCES_NULL');
});

test('spec: defines all required evidence_classifications', () => {
  const required = [
    'EVIDENCE_CONVERGENT',
    'EVIDENCE_DIVERGENT',
    'REGISTRY_DRIFT',
    'REGISTRY_DIVERGENCE',
    'TOPOLOGY_STALE',
    'TOPOLOGY_CONFLICTED',
    'LEDGER_INTEGRITY_SUSPECT',
    'ARBITRATION_FORCES_NULL',
    'UNRESOLVED',
  ];
  for (const cls of required) {
    assert.ok(spec.evidence_classifications.includes(cls), `Missing classification: ${cls}`);
  }
});

test('spec: arbitration_output_contract defines required_fields', () => {
  const required = [
    'classification',
    'winning_tier',
    'winning_evidence_hash',
    'conflicting_evidence_hashes',
    'closure_derivable',
  ];
  for (const f of required) {
    assert.ok(
      spec.arbitration_output_contract.required_fields.includes(f),
      `required_fields must include ${f}`,
    );
  }
});

test('spec: convergent_example has closure_derivable true', () => {
  assert.equal(spec.arbitration_output_contract.convergent_example.closure_derivable, true);
});

test('spec: suspended_example has closure_derivable false', () => {
  assert.equal(spec.arbitration_output_contract.suspended_example.closure_derivable, false);
});

test('spec: forbidden_resolution_methods includes majority vote', () => {
  assert.ok(spec.conflict_resolution_semantics.forbidden_resolution_methods.includes('majority vote'));
});

test('spec: forbidden_resolution_methods includes node voting', () => {
  assert.ok(spec.conflict_resolution_semantics.forbidden_resolution_methods.includes('node voting'));
});

test('spec: no_decisive_artifact_fallback has execution_allowed false', () => {
  assert.equal(spec.decisive_artifact_requirements.no_decisive_artifact_fallback.execution_allowed, false);
});

test('spec: failure_result is LEGITIMACY_NULL', () => {
  assert.equal(spec.failure_result, 'LEGITIMACY_NULL');
});

test('spec: core_invariants encode visibility ≠ truth', () => {
  assert.ok(spec.core_invariants.visibility_ne_truth.includes('≠'));
});

test('spec: core_invariants encode observation ≠ finality', () => {
  assert.ok(spec.core_invariants.observation_ne_finality.includes('≠'));
});

test('spec: core_invariants encode arbitration ≠ truth creation', () => {
  assert.ok(spec.core_invariants.arbitration_ne_truth_creation.includes('≠'));
});

test('spec: core_invariants encode arbitration ≠ legitimacy creation', () => {
  assert.ok(spec.core_invariants.arbitration_ne_legitimacy_creation.includes('≠'));
});

test('spec: non_authoritative_boundary defines arbitration_may and arbitration_may_not', () => {
  assert.ok(Array.isArray(spec.non_authoritative_boundary.arbitration_may));
  assert.ok(Array.isArray(spec.non_authoritative_boundary.arbitration_may_not));
  assert.ok(spec.non_authoritative_boundary.arbitration_may.includes('compare'));
  assert.ok(spec.non_authoritative_boundary.arbitration_may_not.includes('create authority'));
  assert.ok(spec.non_authoritative_boundary.arbitration_may_not.includes('create legitimacy'));
});

test('spec: relationship_to_parent_issues covers all four parents', () => {
  assert.ok('#1640' in spec.relationship_to_parent_issues);
  assert.ok('#1641' in spec.relationship_to_parent_issues);
  assert.ok('#1642' in spec.relationship_to_parent_issues);
  assert.ok('#1643' in spec.relationship_to_parent_issues);
});

test('spec: stack_compression labels are relevance, observation, emission, arbitration', () => {
  assert.equal(spec.stack_compression['#1640'], 'relevance');
  assert.equal(spec.stack_compression['#1641'], 'observation');
  assert.equal(spec.stack_compression['#1642'], 'emission');
  assert.equal(spec.stack_compression['#1644'], 'arbitration');
});

// ---------------------------------------------------------------------------
// Rule A: Tier 1 beats Tier 2 when Tier 1 integrity verifies
// ---------------------------------------------------------------------------

test('Rule A: verified Tier 1 + Tier 2 disagrees → REGISTRY_DRIFT', () => {
  const result = arbitrateEvidence({
    tier1_evidence: tier1Evidence(),
    tier1_integrity_verified: true,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: false,
    tier3_observations: [],
    tier4_reconstructions: [],
    conflict_set: [conflictEntry(TIER2_HASH)],
  });
  assert.equal(result.classification, 'REGISTRY_DRIFT');
  assert.equal(result.winning_tier, 'TIER_1');
  assert.equal(result.winning_evidence_hash, TIER1_HASH);
  assert.equal(result.closure_derivable, false);
});

test('Rule A: REGISTRY_DRIFT report never creates authority', () => {
  const result = arbitrateEvidence({
    tier1_evidence: tier1Evidence(),
    tier1_integrity_verified: true,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: false,
    tier3_observations: [],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.equal(result.arbitration_creates_authority, false);
  assert.equal(result.arbitration_creates_legitimacy, false);
});

// ---------------------------------------------------------------------------
// Rule B: Tier 1 integrity failure → LEDGER_INTEGRITY_SUSPECT
// ---------------------------------------------------------------------------

test('Rule B: Tier 1 integrity fails → LEDGER_INTEGRITY_SUSPECT', () => {
  const result = arbitrateEvidence({
    tier1_evidence: tier1Evidence(),
    tier1_integrity_verified: false,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: true,
    tier3_observations: [],
    tier4_reconstructions: [],
    conflict_set: [conflictEntry(TIER1_HASH)],
  });
  assert.equal(result.classification, 'LEDGER_INTEGRITY_SUSPECT');
  assert.equal(result.winning_tier, null);
  assert.equal(result.closure_derivable, false);
});

test('Rule B: Tier 1 integrity failure does not fall back to Tier 2', () => {
  const result = arbitrateEvidence({
    tier1_evidence: tier1Evidence(),
    tier1_integrity_verified: false,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: true,
    tier3_observations: [],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.notEqual(result.classification, 'EVIDENCE_CONVERGENT');
  assert.notEqual(result.winning_tier, 'TIER_2');
  assert.equal(result.classification, 'LEDGER_INTEGRITY_SUSPECT');
});

test('Rule B: Tier 1 integrity status missing → REGISTRY_RECONCILIATION_INCOMPLETE', () => {
  const result = arbitrateEvidence({
    tier1_evidence: tier1Evidence(),
    tier1_integrity_verified: null,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: true,
    tier3_observations: [],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.equal(result.classification, 'REGISTRY_RECONCILIATION_INCOMPLETE');
  assert.equal(result.closure_derivable, false);
});

// ---------------------------------------------------------------------------
// Rule C: Tier 2 registry disagreement → REGISTRY_DIVERGENCE
// ---------------------------------------------------------------------------

test('Rule C: Tier 2 sources disagree (no Tier 1) → REGISTRY_DIVERGENCE', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: false,
    tier3_observations: [],
    tier4_reconstructions: [],
    conflict_set: [conflictEntry(TIER2_HASH)],
  });
  assert.equal(result.classification, 'REGISTRY_DIVERGENCE');
  assert.equal(result.winning_tier, null);
  assert.equal(result.closure_derivable, false);
});

test('Rule C: REGISTRY_DIVERGENCE produces no closure', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: false,
    tier3_observations: [],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.equal(result.arbitration_creates_reconciliation_closure, false);
});

// ---------------------------------------------------------------------------
// Rule D: Tier 3 observation conflicts with Tier 2 registry
// ---------------------------------------------------------------------------

test('Rule D: Tier 3 conflicts with Tier 2 → TOPOLOGY_STALE, Tier 2 maintains precedence', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: true,
    tier3_observations: [{ type: 'TOPOLOGY_VISIBLE', conflicts_with_registry: true }],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.equal(result.classification, 'TOPOLOGY_STALE');
  assert.equal(result.winning_tier, 'TIER_2');
  assert.equal(result.closure_derivable, false);
});

test('Rule D: topology observation cannot override registry state', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: true,
    tier3_observations: [{ type: 'TOPOLOGY_VISIBLE', conflicts_with_registry: true }],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.notEqual(result.winning_tier, 'TIER_3');
});

test('Rule D: non-conflicting Tier 3 observations with Tier 2 agree → EVIDENCE_CONVERGENT at Tier 2', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: true,
    tier3_observations: [{ type: 'TOPOLOGY_VISIBLE', conflicts_with_registry: false }],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.equal(result.classification, 'EVIDENCE_CONVERGENT');
  assert.equal(result.winning_tier, 'TIER_2');
  assert.equal(result.closure_derivable, true);
});

// ---------------------------------------------------------------------------
// Rule E: Tier 4 reconstruction conflicts with Tier 1–3
// ---------------------------------------------------------------------------

test('Rule E: Tier 4 reconstruction with Tier 3 present → ARBITRATION_FORCES_NULL', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: null,
    tier2_sources_agree: null,
    tier3_observations: [{ type: 'TOPOLOGY_PARTIAL', conflicts_with_registry: false }],
    tier4_reconstructions: [{ type: 'observer_aggregation' }],
    conflict_set: [],
  });
  assert.equal(result.classification, 'ARBITRATION_FORCES_NULL');
  assert.equal(result.winning_tier, null);
  assert.equal(result.closure_derivable, false);
});

test('Rule E: derived reconstruction cannot override observed evidence', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: true,
    tier3_observations: [],
    tier4_reconstructions: [{ type: 'bridgeability_reconstruction' }],
    conflict_set: [],
  });
  assert.equal(result.classification, 'ARBITRATION_FORCES_NULL');
  assert.notEqual(result.winning_tier, 'TIER_4');
});

// ---------------------------------------------------------------------------
// Convergent evidence
// ---------------------------------------------------------------------------

test('Tier 1 beats Tier 2 when Tier 1 integrity verifies → EVIDENCE_CONVERGENT at Tier 1', () => {
  const result = arbitrateEvidence(convergentInputs());
  assert.equal(result.classification, 'EVIDENCE_CONVERGENT');
  assert.equal(result.winning_tier, 'TIER_1');
  assert.equal(result.winning_evidence_hash, TIER1_HASH);
  assert.equal(result.closure_derivable, true);
});

test('EVIDENCE_CONVERGENT: conflicting_evidence_hashes is empty', () => {
  const result = arbitrateEvidence(convergentInputs());
  assert.deepEqual(result.conflicting_evidence_hashes, []);
});

test('EVIDENCE_CONVERGENT: all non-operative flags are false', () => {
  const result = arbitrateEvidence(convergentInputs());
  assert.equal(result.arbitration_creates_authority, false);
  assert.equal(result.arbitration_creates_legitimacy, false);
  assert.equal(result.arbitration_creates_execution, false);
  assert.equal(result.arbitration_creates_deployment, false);
  assert.equal(result.arbitration_creates_proof, false);
  assert.equal(result.arbitration_creates_reconciliation_closure, false);
});

// ---------------------------------------------------------------------------
// No decisive artifact → UNRESOLVED
// ---------------------------------------------------------------------------

test('no Tier 1, no Tier 2, no conflict → UNRESOLVED', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: null,
    tier2_sources_agree: null,
    tier3_observations: [],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.equal(result.classification, 'UNRESOLVED');
  assert.equal(result.closure_derivable, false);
  assert.equal(result.winning_tier, null);
});

test('UNRESOLVED: execution not derivable from arbitration', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: null,
    tier2_sources_agree: null,
    tier3_observations: [],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.equal(result.arbitration_creates_execution, false);
});

// ---------------------------------------------------------------------------
// Conflict examples from issue
// ---------------------------------------------------------------------------

test('Case 1: verified revocation record beats DEPLOYMENT_ACTIVE observation', () => {
  const revocationHash = canonicalHash({ type: 'signed_revocation_record', object: 'deploy-xyz' });
  const result = arbitrateEvidence({
    tier1_evidence: { type: 'signed_revocation_record', hash: revocationHash },
    tier1_integrity_verified: true,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: true,
    tier3_observations: [{ type: 'DEPLOYMENT_ACTIVE', conflicts_with_registry: false }],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.equal(result.classification, 'EVIDENCE_CONVERGENT');
  assert.equal(result.winning_tier, 'TIER_1');
  assert.equal(result.winning_evidence_hash, revocationHash);
});

test('Case 1: unverified revocation → LEDGER_INTEGRITY_SUSPECT (suspend closure)', () => {
  const result = arbitrateEvidence({
    tier1_evidence: { type: 'signed_revocation_record', hash: TIER1_HASH },
    tier1_integrity_verified: false,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: true,
    tier3_observations: [{ type: 'DEPLOYMENT_ACTIVE', conflicts_with_registry: false }],
    tier4_reconstructions: [],
    conflict_set: [conflictEntry(TIER1_HASH)],
  });
  assert.equal(result.classification, 'LEDGER_INTEGRITY_SUSPECT');
  assert.equal(result.closure_derivable, false);
});

test('Case 2: proof lineage record present and verifiable → EVIDENCE_CONVERGENT at Tier 1', () => {
  const proofHash = canonicalHash({ type: 'proof_lineage_record', proof_id: 'PLR-001' });
  const result = arbitrateEvidence({
    tier1_evidence: { type: 'proof_lineage_record', hash: proofHash },
    tier1_integrity_verified: true,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: true,
    tier3_observations: [],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.equal(result.classification, 'EVIDENCE_CONVERGENT');
  assert.equal(result.winning_tier, 'TIER_1');
  assert.equal(result.winning_evidence_hash, proofHash);
});

test('Case 2: proof present but not verifiable → LEDGER_INTEGRITY_SUSPECT', () => {
  const result = arbitrateEvidence({
    tier1_evidence: { type: 'proof_lineage_record', hash: TIER1_HASH },
    tier1_integrity_verified: false,
    tier2_evidence: null,
    tier2_sources_agree: null,
    tier3_observations: [{ type: 'PROOF_MISSING', conflicts_with_registry: false }],
    tier4_reconstructions: [],
    conflict_set: [conflictEntry(TIER1_HASH)],
  });
  assert.equal(result.classification, 'LEDGER_INTEGRITY_SUSPECT');
  assert.equal(result.closure_derivable, false);
});

test('Case 3: state match alone without lineage → UNRESOLVED', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: null,
    tier2_sources_agree: null,
    tier3_observations: [{ type: 'STATE_MATCH', conflicts_with_registry: false }],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.equal(result.classification, 'UNRESOLVED');
  assert.equal(result.closure_derivable, false);
});

// ---------------------------------------------------------------------------
// State match cannot create legitimacy
// ---------------------------------------------------------------------------

test('state match is evidence only — cannot produce EVIDENCE_CONVERGENT without lineage-bound artifact', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: null,
    tier2_sources_agree: null,
    tier3_observations: [{ type: 'STATE_MATCH', conflicts_with_registry: false }],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.notEqual(result.classification, 'EVIDENCE_CONVERGENT');
  assert.equal(result.arbitration_creates_legitimacy, false);
});

// ---------------------------------------------------------------------------
// Determinism requirements
// ---------------------------------------------------------------------------

test('identical inputs → identical arbitration output', () => {
  const first = arbitrateEvidence(convergentInputs());
  const second = arbitrateEvidence(convergentInputs());
  assert.equal(first.classification, second.classification);
  assert.equal(first.winning_tier, second.winning_tier);
  assert.equal(first.winning_evidence_hash, second.winning_evidence_hash);
  assert.equal(first.closure_derivable, second.closure_derivable);
});

test('identical LEDGER_INTEGRITY_SUSPECT inputs → identical output', () => {
  function ledgerFailInputs() {
    return {
      tier1_evidence: tier1Evidence(),
      tier1_integrity_verified: false,
      tier2_evidence: tier2Evidence(),
      tier2_sources_agree: true,
      tier3_observations: [],
      tier4_reconstructions: [],
      conflict_set: [conflictEntry(TIER1_HASH)],
    };
  }
  assert.equal(
    arbitrateEvidence(ledgerFailInputs()).classification,
    arbitrateEvidence(ledgerFailInputs()).classification,
  );
});

test('different Tier 1 integrity status → different arbitration output', () => {
  const converging = arbitrateEvidence(convergentInputs());
  const failing = arbitrateEvidence({ ...convergentInputs(), tier1_integrity_verified: false });
  assert.notEqual(converging.classification, failing.classification);
});

test('different evidence hashes produce different canonical hashes', () => {
  const h1 = canonicalHash({ type: 'signed_revocation_record', epoch: 'epoch-1' });
  const h2 = canonicalHash({ type: 'signed_revocation_record', epoch: 'epoch-2' });
  assert.notEqual(h1, h2);
});

test('same conflict set → same conflicting_evidence_hashes', () => {
  const conflict = [conflictEntry(TIER1_HASH), conflictEntry(TIER2_HASH)];
  const r1 = arbitrateEvidence({
    ...convergentInputs(),
    tier2_sources_agree: false,
    conflict_set: conflict,
  });
  const r2 = arbitrateEvidence({
    ...convergentInputs(),
    tier2_sources_agree: false,
    conflict_set: conflict,
  });
  assert.deepEqual(r1.conflicting_evidence_hashes, r2.conflicting_evidence_hashes);
});

// ---------------------------------------------------------------------------
// Non-operability: arbitration never creates authority or legitimacy
// ---------------------------------------------------------------------------

test('EVIDENCE_CONVERGENT never creates authority', () => {
  const result = arbitrateEvidence(convergentInputs());
  assert.equal(result.arbitration_creates_authority, false);
});

test('REGISTRY_DRIFT never creates legitimacy', () => {
  const result = arbitrateEvidence({
    ...convergentInputs(),
    tier2_sources_agree: false,
  });
  assert.equal(result.arbitration_creates_legitimacy, false);
});

test('UNRESOLVED never creates execution', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: null,
    tier2_sources_agree: null,
    tier3_observations: [],
    tier4_reconstructions: [],
    conflict_set: [],
  });
  assert.equal(result.arbitration_creates_execution, false);
});

test('LEDGER_INTEGRITY_SUSPECT never creates proof', () => {
  const result = arbitrateEvidence({
    ...convergentInputs(),
    tier1_integrity_verified: false,
  });
  assert.equal(result.arbitration_creates_proof, false);
});

test('ARBITRATION_FORCES_NULL never creates deployment', () => {
  const result = arbitrateEvidence({
    tier1_evidence: null,
    tier1_integrity_verified: true,
    tier2_evidence: tier2Evidence(),
    tier2_sources_agree: true,
    tier3_observations: [],
    tier4_reconstructions: [{ type: 'bridgeability_reconstruction' }],
    conflict_set: [],
  });
  assert.equal(result.arbitration_creates_deployment, false);
});
