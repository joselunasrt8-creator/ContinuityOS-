import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const scoRequirements = JSON.parse(
  readFileSync(join(process.cwd(), 'governance', 'runtime', 'SCO_REQUIREMENTS.json'), 'utf8'),
);

const prChangedFilesFixture = [
  'governance/runtime/MERGE_GOVERNANCE_RULES.json',
  'governance/runtime/PREO_REQUIREMENTS.json',
  'governance/runtime/SCO_REQUIREMENTS.json',
  'tests/merge-governance-artifacts.test.mjs',
  'tests/merge-rules-coverage.test.mjs',
  'tests/preo-field-coverage.test.mjs',
  'tests/sco-governed-path-coverage.test.mjs',
];

function matchesGovernedPath(file, pattern) {
  if (pattern.endsWith('/**')) {
    return file.startsWith(pattern.slice(0, -3));
  }

  return file === pattern;
}

function classifyChangedFile(file, governedPaths) {
  const matchedGovernedPath = governedPaths.find((pattern) => matchesGovernedPath(file, pattern));

  return {
    file,
    governed: Boolean(matchedGovernedPath),
    matched_governed_path: matchedGovernedPath || null,
    requires_sco: Boolean(matchedGovernedPath),
  };
}

test('PR changed files are classified against SCO governed paths', () => {
  assert.ok(Array.isArray(scoRequirements.governed_paths), 'SCO_REQUIREMENTS.json must define governed_paths');

  const classifications = prChangedFilesFixture.map((file) => classifyChangedFile(file, scoRequirements.governed_paths));
  const unclassifiedGovernedMutations = classifications.filter(
    (classification) => classification.file.startsWith('governance/') && !classification.requires_sco,
  );

  assert.deepEqual(
    unclassifiedGovernedMutations,
    [],
    `Governance mutations not classified as SCO-required:\n${JSON.stringify(unclassifiedGovernedMutations, null, 2)}`,
  );

  const governedChanges = classifications.filter((classification) => classification.requires_sco);

  assert.ok(
    governedChanges.length >= 3,
    'Expected governance runtime changes in this PR to require SCO classification',
  );
});
