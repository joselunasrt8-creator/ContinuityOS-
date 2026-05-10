import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const runtimeDir = join(process.cwd(), 'governance', 'runtime');
const preoRequirements = JSON.parse(readFileSync(join(runtimeDir, 'PREO_REQUIREMENTS.json'), 'utf8'));
const mergeRules = JSON.parse(readFileSync(join(runtimeDir, 'MERGE_GOVERNANCE_RULES.json'), 'utf8'));

const requiredPreoFields = [
  'preo_id',
  'pr_number',
  'repo',
  'base_branch',
  'head_branch',
  'head_sha',
  'changed_files',
  'review_status',
  'checks_status',
  'risk_class',
  'created_at',
];

test('PREO requirements define required PR evidence fields', () => {
  assert.ok(Array.isArray(preoRequirements.required_fields), 'PREO_REQUIREMENTS.json must define required_fields');

  for (const field of requiredPreoFields) {
    assert.ok(
      preoRequirements.required_fields.includes(field),
      `PREO_REQUIREMENTS.json missing required field: ${field}`,
    );
  }
});

test('PREO requirements bind review evidence to exact PR head SHA', () => {
  assert.ok(Array.isArray(preoRequirements.rules), 'PREO_REQUIREMENTS.json must define rules');

  const rules = preoRequirements.rules.join('\n');

  for (const requiredSignal of [
    'No PREO -> no governed merge',
    'PREO must bind to exact PR head_sha',
    'PREO must enumerate changed files',
    'PREO cannot be reused for a different PR or head_sha',
  ]) {
    assert.ok(
      rules.includes(requiredSignal),
      `PREO_REQUIREMENTS.json missing rule signal: ${requiredSignal}`,
    );
  }
});

test('merge governance requires PREO before governed merge', () => {
  assert.ok(Array.isArray(mergeRules.rules), 'MERGE_GOVERNANCE_RULES.json must define rules');

  const rules = mergeRules.rules.join('\n');

  assert.ok(
    rules.includes('No PREO -> no governed merge'),
    'MERGE_GOVERNANCE_RULES.json must require PREO before governed merge',
  );

  assert.ok(
    rules.includes('PREO must bind exact PR head_sha'),
    'MERGE_GOVERNANCE_RULES.json must bind PREO to exact PR head_sha',
  );
});
