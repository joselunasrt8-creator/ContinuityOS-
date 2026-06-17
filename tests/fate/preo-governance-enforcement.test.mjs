import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const branchProtection = JSON.parse(
  readFileSync(join(root, 'governance', 'runtime', 'BRANCH_PROTECTION_POLICY.json'), 'utf8'),
);
const preoRequirements = JSON.parse(
  readFileSync(join(root, 'governance', 'runtime', 'PREO_REQUIREMENTS.json'), 'utf8'),
);

function emittedCheckNames() {
  const workflowDir = join(root, '.github', 'workflows');
  return new Set(
    readdirSync(workflowDir)
      .filter((file) => file.endsWith('.yml'))
      .sort()
      .flatMap((file) => {
        const source = readFileSync(join(workflowDir, file), 'utf8');
        const jobsBlock = source.match(/^jobs:\s*$([\s\S]*)/m)?.[1] ?? '';
        return [...jobsBlock.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => match[1]);
      }),
  );
}

import { sortCanonical, canonicalHash } from '../helpers/canonical-test-hash.mjs';

function validatePreoCandidate({ preo, policy = branchProtection }) {
  const missingFields = preoRequirements.required_fields.filter((field) => !Object.hasOwn(preo, field));
  const unresolvedChecks = policy.required_controls.required_status_checks.filter(
    (requiredCheck) => !emittedCheckNames().has(requiredCheck),
  );

  if (missingFields.length > 0 || unresolvedChecks.length > 0 || preo.status !== 'PREO_CANDIDATE') {
    return {
      status: 'PREO_INVALID',
      merge_legitimacy: null,
      missing_fields: missingFields,
      unresolved_required_checks: unresolvedChecks,
      evidence_hash: null,
    };
  }

  return {
    status: 'PREO_VALID',
    merge_legitimacy: 'ELIGIBLE_ONLY_AFTER_REQUIRED_CHECKS_AND_REVIEW_PASS',
    missing_fields: [],
    unresolved_required_checks: [],
    evidence_hash: canonicalHash(preo),
  };
}

const exactHeadPreo = Object.freeze({
  preo_id: 'PREO-7-abc123',
  pr_number: 7,
  repo: 'example/mindshift-demo',
  base_branch: 'main',
  head_branch: 'governance/parity',
  head_sha: 'abc123',
  changed_files: ['governance/runtime/BRANCH_PROTECTION_POLICY.json'],
  review_status: 'APPROVED_FOR_HEAD_SHA',
  checks_status: 'REQUIRED_CHECKS_PASSING_FOR_HEAD_SHA',
  risk_class: 'P2',
  created_at: '2026-05-12T00:00:00Z',
  status: 'PREO_CANDIDATE',
});

test('PREO evidence remains deterministic and bound to exact head SHA', () => {
  const first = validatePreoCandidate({ preo: exactHeadPreo });
  const second = validatePreoCandidate({ preo: structuredClone(exactHeadPreo) });

  assert.equal(first.status, 'PREO_VALID');
  assert.equal(first.evidence_hash, second.evidence_hash);

  const replayForDifferentHead = {
    ...exactHeadPreo,
    head_sha: 'def456',
  };
  assert.notEqual(
    validatePreoCandidate({ preo: replayForDifferentHead }).evidence_hash,
    first.evidence_hash,
    'changing the head SHA must change deterministic PREO evidence',
  );
});

test('missing emitted branch protection check invalidates PREO and nulls merge legitimacy', () => {
  const driftedPolicy = structuredClone(branchProtection);
  driftedPolicy.required_controls.required_status_checks = [
    ...driftedPolicy.required_controls.required_status_checks,
    'preo-candidate',
  ];

  const outcome = validatePreoCandidate({ preo: exactHeadPreo, policy: driftedPolicy });

  assert.equal(outcome.status, 'PREO_INVALID');
  assert.deepEqual(outcome.unresolved_required_checks, ['preo-candidate']);
  assert.equal(outcome.merge_legitimacy, null);
  assert.equal(outcome.evidence_hash, null);
});

test('valid emitted-check parity permits only gated merge eligibility, not a bypass', () => {
  const outcome = validatePreoCandidate({ preo: exactHeadPreo });

  assert.equal(outcome.status, 'PREO_VALID');
  assert.deepEqual(outcome.unresolved_required_checks, []);
  assert.equal(
    outcome.merge_legitimacy,
    'ELIGIBLE_ONLY_AFTER_REQUIRED_CHECKS_AND_REVIEW_PASS',
  );
});
