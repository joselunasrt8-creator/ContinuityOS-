/**
 * Issue #2062 — Bounded Standing Authority for governance topology-closure docs.
 *
 * Proposal scope (owner-issued via standing-authority-issuance.yml; see
 * governance/operational-risk/STANDING_AUTHORITY_GOVERNANCE_DOCS_2062.md):
 *
 *   branch_pattern   : claude/*
 *   mutation_classes : [governance_mutation]            (NOT workflow_mutation)
 *   path_globs       : [governance/runtime/BRANCH_PROTECTION_POLICY.json,
 *                       governance/topology/**]
 *   ttl_hours        : 168 (7 days, HARD bound)
 *   max_merges       : 3   (async proof-ledger budget)
 *
 * This proves the EXACT proposed bounds behave: #2062/#2066-style governance
 * topology-closure doc PRs on claude/* derive authorization without a per-PR GMA,
 * while everything outside the bounds (other governance files, workflow edits,
 * other branches, expired TTL, exhausted budget) fails closed.
 *
 * The generic derivation engine, trust-surface hard-deny, fork-safety, base-branch
 * provenance, and append-only guards are already covered by
 * tests/fate/standing-authority-derivation.test.mjs and are NOT re-proved here.
 * This file is scope-specific evidence for the #2062 issuance only.
 *
 * Evidence/test only — no runtime route, validator, proof, authority, or workflow
 * behavior changes. Imports the trusted shared verifier; asserts no widening.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  selectStandingAuthority,
  computeAuthorityHash,
  STANDING_AUTHORITY_VALID,
} from '../../runtime/standing-authority.mjs';

const HOUR = 60 * 60 * 1000;

// The exact bounds proposed for issuance (#2062, owner decision: governance docs
// only, 7-day TTL).
const PROPOSED_BOUNDS = {
  branch_pattern: 'claude/*',
  mutation_classes: ['governance_mutation'],
  path_globs: [
    'governance/runtime/BRANCH_PROTECTION_POLICY.json',
    'governance/topology/**',
  ],
  max_merges: 3,
};
const PROPOSED_TTL_HOURS = 168;

function governanceDocsSA(overrides = {}) {
  const issued = overrides.issued_at ? new Date(overrides.issued_at) : new Date();
  return {
    _record_type: 'standing_authority',
    authority_id: 'SA-governance-docs-topology-2062',
    authority_hash: computeAuthorityHash({
      ...PROPOSED_BOUNDS,
      ttl_hours: PROPOSED_TTL_HOURS,
      issued_at: issued.toISOString(),
    }),
    intent:
      'Bounded authority for #2062/#2066-style governance topology-closure docs on claude/* without per-PR GMA.',
    issued_by: 'joselunasrt8-creator',
    source_authority: 'OWNER_WORKFLOW_DISPATCH',
    bounds: { ...PROPOSED_BOUNDS },
    ttl_hours: PROPOSED_TTL_HOURS,
    issued_at: issued.toISOString(),
    expires_at: new Date(issued.getTime() + PROPOSED_TTL_HOURS * HOUR).toISOString(),
    authority_lineage_bound: true,
    status: STANDING_AUTHORITY_VALID,
    ...overrides,
  };
}

function registry(records) {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

// A proof ledger that consumes `n` units of budget against the authority id.
function proofLedger(authorityId, n) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    lines.push(
      JSON.stringify({
        _record_type: 'proof_entry',
        proof_id: `PROOF-${authorityId}-${i}`,
        standing_authority_id: authorityId,
      }),
    );
  }
  return lines.join('\n') + '\n';
}

test('#2062 SA admits a BRANCH_PROTECTION_POLICY.json governance_mutation on claude/*', () => {
  const a = governanceDocsSA();
  const out = selectStandingAuthority({
    registryText: registry([a]),
    headRef: 'claude/2062-required-check-topology-closure',
    governedFiles: ['governance/runtime/BRANCH_PROTECTION_POLICY.json'],
    detectedClasses: ['governance_mutation'],
  });
  assert.equal(out.authorized, true, out.reason || '');
  assert.equal(out.authority.authority_id, a.authority_id);
});

test('#2062 SA admits a governance/topology/** doc', () => {
  const a = governanceDocsSA();
  const out = selectStandingAuthority({
    registryText: registry([a]),
    headRef: 'claude/topology-closure',
    governedFiles: ['governance/topology/REQUIRED_CHECK_TOPOLOGY_AUDIT_2066.json'],
    detectedClasses: ['governance_mutation'],
  });
  assert.equal(out.authorized, true, out.reason || '');
});

test('#2062 SA rejects an out-of-scope governance file (scope containment)', () => {
  const a = governanceDocsSA();
  const out = selectStandingAuthority({
    registryText: registry([a]),
    headRef: 'claude/x',
    governedFiles: ['governance/runtime/MERGE_GOVERNANCE_RULES.json'],
    detectedClasses: ['governance_mutation'],
  });
  assert.equal(out.authorized, false);
  assert.match(out.reason, /outside authority path scope/);
});

test('#2062 SA rejects a workflow edit (workflow_mutation class not in scope)', () => {
  const a = governanceDocsSA();
  const out = selectStandingAuthority({
    registryText: registry([a]),
    headRef: 'claude/x',
    governedFiles: ['.github/workflows/runtime-tests.yml'],
    detectedClasses: ['workflow_mutation'],
  });
  assert.equal(out.authorized, false);
  assert.match(out.reason, /mutation class workflow_mutation outside authority scope/);
});

test('#2062 SA rejects a mixed diff that adds an out-of-scope file', () => {
  const a = governanceDocsSA();
  const out = selectStandingAuthority({
    registryText: registry([a]),
    headRef: 'claude/x',
    governedFiles: [
      'governance/runtime/BRANCH_PROTECTION_POLICY.json',
      'governance/runtime/MERGE_GOVERNANCE_RULES.json',
    ],
    detectedClasses: ['governance_mutation'],
  });
  assert.equal(out.authorized, false);
  assert.match(out.reason, /MERGE_GOVERNANCE_RULES\.json outside authority path scope/);
});

test('#2062 SA rejects a non-claude/* branch (branch-pattern bind)', () => {
  const a = governanceDocsSA();
  const out = selectStandingAuthority({
    registryText: registry([a]),
    headRef: 'feature/topology',
    governedFiles: ['governance/runtime/BRANCH_PROTECTION_POLICY.json'],
    detectedClasses: ['governance_mutation'],
  });
  assert.equal(out.authorized, false);
  assert.match(out.reason, /does not match pattern claude\/\*/);
});

test('#2062 SA rejects after TTL expiry (hard bound)', () => {
  const issuedAt = new Date(Date.now() - 200 * HOUR).toISOString(); // > 168h ago
  const a = governanceDocsSA({ issued_at: issuedAt });
  const out = selectStandingAuthority({
    registryText: registry([a]),
    headRef: 'claude/x',
    governedFiles: ['governance/runtime/BRANCH_PROTECTION_POLICY.json'],
    detectedClasses: ['governance_mutation'],
  });
  assert.equal(out.authorized, false);
  assert.match(out.reason, /expired/);
});

test('#2062 SA admits with budget remaining (2 of 3 consumed)', () => {
  const a = governanceDocsSA();
  const out = selectStandingAuthority({
    registryText: registry([a]),
    headRef: 'claude/x',
    governedFiles: ['governance/runtime/BRANCH_PROTECTION_POLICY.json'],
    detectedClasses: ['governance_mutation'],
    proofRegistryText: proofLedger(a.authority_id, 2),
  });
  assert.equal(out.authorized, true, out.reason || '');
});

test('#2062 SA rejects when budget exhausted, including replay of the same diff', () => {
  const a = governanceDocsSA();
  const args = {
    registryText: registry([a]),
    headRef: 'claude/x',
    governedFiles: ['governance/runtime/BRANCH_PROTECTION_POLICY.json'],
    detectedClasses: ['governance_mutation'],
    proofRegistryText: proofLedger(a.authority_id, 3), // max_merges reached
  };
  const out = selectStandingAuthority(args);
  assert.equal(out.authorized, false);
  assert.match(out.reason, /budget exhausted \(3\/3/);
  // replay of the identical governed diff is likewise not derivable
  const replay = selectStandingAuthority(args);
  assert.equal(replay.authorized, false);
});

test('#2062 SA does not vacuously authorize a diff with no governance/workflow class', () => {
  const a = governanceDocsSA();
  const out = selectStandingAuthority({
    registryText: registry([a]),
    headRef: 'claude/x',
    governedFiles: ['governance/merge-legitimacy/merge_proof_registry.jsonl'],
    detectedClasses: ['proof_persistence'],
  });
  assert.equal(out.authorized, false);
  assert.match(out.reason, /no governance\/workflow mutation to authorize/);
});

test('#2062 proposed authority_hash is deterministic and order-independent over bound lists', () => {
  const issued_at = '2026-06-14T00:00:00Z';
  const h1 = computeAuthorityHash({ ...PROPOSED_BOUNDS, ttl_hours: PROPOSED_TTL_HOURS, issued_at });
  const h2 = computeAuthorityHash({
    branch_pattern: PROPOSED_BOUNDS.branch_pattern,
    mutation_classes: [...PROPOSED_BOUNDS.mutation_classes].reverse(),
    path_globs: [...PROPOSED_BOUNDS.path_globs].reverse(),
    max_merges: PROPOSED_BOUNDS.max_merges,
    ttl_hours: PROPOSED_TTL_HOURS,
    issued_at,
  });
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});
