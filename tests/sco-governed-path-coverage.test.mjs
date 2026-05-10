import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const runtimeDir = join(process.cwd(), 'governance', 'runtime');
const scoRequirements = JSON.parse(readFileSync(join(runtimeDir, 'SCO_REQUIREMENTS.json'), 'utf8'));
const mergeRules = JSON.parse(readFileSync(join(runtimeDir, 'MERGE_GOVERNANCE_RULES.json'), 'utf8'));

const requiredGovernedPaths = [
  'governance/**',
  '.github/workflows/**',
  'src/**',
  'schema.sql',
  'migrations/**',
  'wrangler.toml',
];

test('SCO requirements cover all governed mutation paths', () => {
  assert.ok(Array.isArray(scoRequirements.governed_paths), 'SCO_REQUIREMENTS.json must define governed_paths');

  for (const governedPath of requiredGovernedPaths) {
    assert.ok(
      scoRequirements.governed_paths.includes(governedPath),
      `SCO_REQUIREMENTS.json missing governed path: ${governedPath}`,
    );
  }
});

test('SCO requirements bind governed files to exact scope', () => {
  assert.ok(Array.isArray(scoRequirements.rules), 'SCO_REQUIREMENTS.json must define rules');

  const rules = scoRequirements.rules.join('\n');

  for (const requiredSignal of [
    'governance/runtime mutation requires SCO',
    'workflow mutation requires SCO',
    'schema mutation requires SCO',
    'deployment-boundary mutation requires SCO',
    'SCO must bind exact changed files',
    'SCO cannot authorize files outside declared scope',
  ]) {
    assert.ok(
      rules.includes(requiredSignal),
      `SCO_REQUIREMENTS.json missing rule signal: ${requiredSignal}`,
    );
  }
});

test('merge governance requires SCO for governance/runtime mutation', () => {
  assert.ok(Array.isArray(mergeRules.rules), 'MERGE_GOVERNANCE_RULES.json must define rules');

  const rules = mergeRules.rules.join('\n');

  assert.ok(
    rules.includes('Governance/runtime mutation -> requires SCO'),
    'MERGE_GOVERNANCE_RULES.json must require SCO for governance/runtime mutation',
  );

  assert.ok(
    rules.includes('SCO must bind exact governed files'),
    'MERGE_GOVERNANCE_RULES.json must bind SCO to exact governed files',
  );
});
