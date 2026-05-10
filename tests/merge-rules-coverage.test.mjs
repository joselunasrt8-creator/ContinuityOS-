import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const mergeRules = JSON.parse(
  readFileSync(join(process.cwd(), 'governance', 'runtime', 'MERGE_GOVERNANCE_RULES.json'), 'utf8'),
);

const requiredRules = [
  'No PREO -> no governed merge',
  'Governance/runtime mutation -> requires SCO',
  'PREO must bind exact PR head_sha',
  'SCO must bind exact governed files',
  'Merge proof must persist merge_commit_sha',
  'Protected branch required for governed merges',
  'Direct push to governed branches is a bypass path',
];

const requiredProofFields = [
  'pr_number',
  'head_sha',
  'merge_commit_sha',
  'review_status',
  'checks_status',
  'merged_by',
  'merged_at',
];

const requiredBypassPaths = [
  'direct_push_to_main',
  'merge_without_PREO',
  'merge_without_SCO',
  'admin_bypass',
  'force_push',
  'branch_protection_disabled',
];

test('merge governance rules define required PR merge legitimacy rules', () => {
  assert.equal(mergeRules.merge_surface, 'github_pr_merge_surface');
  assert.ok(Array.isArray(mergeRules.rules), 'MERGE_GOVERNANCE_RULES.json must define rules');

  for (const rule of requiredRules) {
    assert.ok(
      mergeRules.rules.includes(rule),
      `MERGE_GOVERNANCE_RULES.json missing rule: ${rule}`,
    );
  }
});

test('merge governance proof fields define merge proof requirements', () => {
  assert.ok(
    Array.isArray(mergeRules.required_proof_fields),
    'MERGE_GOVERNANCE_RULES.json must define required_proof_fields',
  );

  for (const field of requiredProofFields) {
    assert.ok(
      mergeRules.required_proof_fields.includes(field),
      `MERGE_GOVERNANCE_RULES.json missing proof field: ${field}`,
    );
  }
});

test('merge governance bypass paths cover source-control bypass modes', () => {
  assert.ok(
    Array.isArray(mergeRules.bypass_paths),
    'MERGE_GOVERNANCE_RULES.json must define bypass_paths',
  );

  for (const bypassPath of requiredBypassPaths) {
    assert.ok(
      mergeRules.bypass_paths.includes(bypassPath),
      `MERGE_GOVERNANCE_RULES.json missing bypass path: ${bypassPath}`,
    );
  }
});
