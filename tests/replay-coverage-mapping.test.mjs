import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const replayRequirementsPath = join(process.cwd(), 'governance', 'runtime', 'REPLAY_TESTS.json');
const testsDir = join(process.cwd(), 'tests');

const replayRequirements = JSON.parse(readFileSync(replayRequirementsPath, 'utf8'));

function readAllTestSources(dir) {
  if (!existsSync(dir)) return '';

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(mjs|js|json|ts)$/.test(entry.name))
    .map((entry) => readFileSync(join(dir, entry.name), 'utf8'))
    .join('\n');
}

const coverageAliases = {
  reused_nonce: ['reused_nonce', 'invocation_nonce', 'nonce', 'REPLAY_BLOCKED', 'replay_detected'],
  reused_authority: ['reused_authority', 'authority', 'CONSUMED', 'replay_detected'],
  duplicate_validated_hash: ['duplicate_validated_hash', 'validated_object_hash', 'duplicate', 'replay_detected'],
};

test('replay requirements map to implemented replay/FATE coverage signals', () => {
  assert.ok(Array.isArray(replayRequirements.tests), 'REPLAY_TESTS.json must define tests');

  const testSources = readAllTestSources(testsDir);
  assert.ok(testSources.length > 0, 'No test sources found for replay coverage mapping');

  const missingCoverage = [];

  for (const replayTest of replayRequirements.tests) {
    const testId = replayTest.test_id;
    const aliases = coverageAliases[testId] || [testId];
    const covered = aliases.some((alias) => testSources.includes(alias));

    if (!covered) {
      missingCoverage.push({
        test_id: testId,
        expected_result: replayTest.expected_result,
        searched_aliases: aliases,
      });
    }
  }

  assert.deepEqual(
    missingCoverage,
    [],
    `Replay coverage mapping missing implemented signals:\n${JSON.stringify(missingCoverage, null, 2)}`,
  );
});
