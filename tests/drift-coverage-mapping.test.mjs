import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const driftRequirementsPath = join(process.cwd(), 'governance', 'runtime', 'DRIFT_TESTS.json');
const testsDir = join(process.cwd(), 'tests');
const runtimePath = join(process.cwd(), 'src', 'index.ts');

const driftRequirements = JSON.parse(readFileSync(driftRequirementsPath, 'utf8'));

function readAllSources(paths) {
  return paths
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
}

function readAllTestSources(dir) {
  if (!existsSync(dir)) return '';

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(mjs|js|json|ts)$/.test(entry.name))
    .map((entry) => readFileSync(join(dir, entry.name), 'utf8'))
    .join('\n');
}

const coverageAliases = {
  commit_sha_changed_after_validation: [
    'commit_sha_changed_after_validation',
    'commit_sha',
    'hash_drift',
    'execution_drift',
    'HASH_MISMATCH',
  ],
  workflow_changed_after_validation: [
    'workflow_changed_after_validation',
    'workflow',
    'GOVERNED_WORKFLOW',
    'execution_drift',
  ],
  policy_mismatch: [
    'policy_mismatch',
    'authority_drift',
    'registry_drift',
    'VALIDATION_REJECTED',
  ],
};

test('drift requirements map to implemented drift/observability coverage signals', () => {
  assert.ok(Array.isArray(driftRequirements.tests), 'DRIFT_TESTS.json must define tests');

  const sourceCorpus = [
    readAllSources([runtimePath]),
    readAllTestSources(testsDir),
  ].join('\n');

  assert.ok(sourceCorpus.length > 0, 'No source corpus found for drift coverage mapping');

  const missingCoverage = [];

  for (const driftTest of driftRequirements.tests) {
    const testId = driftTest.test_id;
    const aliases = coverageAliases[testId] || [testId];
    const covered = aliases.some((alias) => sourceCorpus.includes(alias));

    if (!covered) {
      missingCoverage.push({
        test_id: testId,
        expected_result: driftTest.expected_result,
        searched_aliases: aliases,
      });
    }
  }

  assert.deepEqual(
    missingCoverage,
    [],
    `Drift coverage mapping missing implemented signals:\n${JSON.stringify(missingCoverage, null, 2)}`,
  );
});
