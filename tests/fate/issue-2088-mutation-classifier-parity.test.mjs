/**
 * FATE regression test for issue #2088 — mutation-classifier parity.
 *
 * merge-governance-check.yml (the admission gate) and
 * governance-mutation-authorization.yml (the GMA issuer) each embed an
 * independent bash `case` classifier over changed file paths. Both must
 * agree on (a) whether a path is a *governed file* (and therefore part of
 * governed_files_hash) and (b) which mutation_class it is assigned, or a
 * GMA issued from one classifier's view of the diff can desync from the
 * gate's view (issue #2088 — operational-risk/*.md was classified as
 * `governance_mutation` by the issuer but `operational_risk_evidence` by
 * the gate).
 *
 * This test extracts each workflow's `case "$file" in ... esac` classifier
 * verbatim and runs it under bash for a representative set of paths,
 * asserting identical (governed, mutation_class) results.
 */

import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = process.cwd();

const gateWorkflow = readFileSync(
  join(root, '.github', 'workflows', 'merge-governance-check.yml'),
  'utf8',
);
const issuerWorkflow = readFileSync(
  join(root, '.github', 'workflows', 'governance-mutation-authorization.yml'),
  'utf8',
);

// Extract the `case "$file" in ... esac` block verbatim from a workflow.
function extractCaseBlock(workflow, label) {
  const start = workflow.indexOf('case "$file" in');
  assert.ok(start >= 0, `${label}: case "$file" in must be present`);
  const end = workflow.indexOf('esac', start);
  assert.ok(end >= 0, `${label}: esac must terminate the classifier`);
  return workflow.slice(start, end + 'esac'.length);
}

const gateCase = extractCaseBlock(gateWorkflow, 'merge-governance-check.yml');
const issuerCase = extractCaseBlock(issuerWorkflow, 'governance-mutation-authorization.yml');

// Normalize each classifier's output filenames so both can be driven by the
// same harness: governed-file list -> governed.txt, mutation classes ->
// classes.txt. The gate also writes target_surfaces.txt and a
// GOVERNED_PATH_DETECTED flag — redirected/left as harmless no-ops.
function normalize(caseBlock) {
  return caseBlock
    .replaceAll('gma_governed_files.txt', 'governed.txt')
    .replaceAll('gma_mutation_classes.txt', 'classes.txt')
    .replaceAll('governed_files.txt', 'governed.txt')
    .replaceAll('mutation_classes.txt', 'classes.txt')
    .replaceAll('target_surfaces.txt', 'surfaces.txt');
}

const gateScript = normalize(gateCase);
const issuerScript = normalize(issuerCase);

// Classify a single path with one of the extracted case blocks.
function classify(caseScript, path) {
  const dir = mkdtempSync(join(tmpdir(), 'mutation-classifier-'));
  try {
    const script = `
set -euo pipefail
: > governed.txt
: > classes.txt
: > surfaces.txt
GOVERNED_PATH_DETECTED="false"
file=${JSON.stringify(path)}
${caseScript}
cat governed.txt
echo '---'
cat classes.txt
`;
    const result = spawnSync('bash', ['-c', script], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const [governedPart, classesPart] = result.stdout.split('---\n');
    const governed = governedPart.split('\n').filter(Boolean);
    const classes = classesPart.split('\n').filter(Boolean);
    return { governed, classes };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Representative paths spanning every classified path class, including the
// operational-risk evidence surface at the center of issue #2088.
const PATH_CLASSES = [
  { path: 'governance/operational-risk/OPERATIONAL_RISK_AUDIT_2031.md', governed: true, classes: ['operational_risk_evidence'] },
  { path: 'governance/operational-risk/STANDING_AUTHORITY_GOVERNANCE_DOCS_2062.md', governed: true, classes: ['operational_risk_evidence'] },
  { path: 'governance/authorizations/standing_authority_registry.jsonl', governed: true, classes: ['governance_mutation'] },
  { path: 'governance/authorizations/GOVERNANCE_MUTATION_AUTHORIZATION.json', governed: false, classes: [] },
  { path: 'governance/authorizations/gma_registry.jsonl', governed: false, classes: [] },
  { path: 'runtime/standing-authority.mjs', governed: true, classes: ['governance_mutation'] },
  { path: 'governance/merge-legitimacy/merge_proof_registry.jsonl', governed: true, classes: ['proof_persistence'] },
  { path: 'governance/runtime/MERGE_GOVERNANCE_RULES.json', governed: true, classes: ['governance_mutation'] },
  { path: '.github/workflows/merge-governance-check.yml', governed: true, classes: ['workflow_mutation'] },
  { path: 'src/index.ts', governed: true, classes: ['runtime_mutation'] },
  { path: 'schema.sql', governed: true, classes: ['schema_mutation'] },
  { path: 'migrations/0048_example.sql', governed: true, classes: ['migration_mutation'] },
  { path: 'wrangler.toml', governed: true, classes: ['deployment_config_mutation'] },
  { path: 'README.md', governed: false, classes: [] },
];

for (const { path, governed, classes } of PATH_CLASSES) {
  test(`gate and issuer classifiers agree on ${path}`, () => {
    const gateResult = classify(gateScript, path);
    const issuerResult = classify(issuerScript, path);

    assert.deepEqual(gateResult.governed, issuerResult.governed,
      `governed-file detection for ${path} must match between gate and issuer`);
    assert.deepEqual(gateResult.classes, issuerResult.classes,
      `mutation_class for ${path} must match between gate and issuer`);

    // Pin against the expected classification so a future edit to either
    // classifier that drifts from the documented path classes fails loudly.
    assert.deepEqual(gateResult.governed, governed ? [path] : [], `gate governed-file result for ${path}`);
    assert.deepEqual(gateResult.classes, classes, `gate mutation_class for ${path}`);
  });
}

test('operational-risk evidence is exempt from GMA requirement in both classifiers (issue #2088)', () => {
  const gateResult = classify(gateScript, 'governance/operational-risk/OPERATIONAL_RISK_AUDIT_2031.md');
  const issuerResult = classify(issuerScript, 'governance/operational-risk/OPERATIONAL_RISK_AUDIT_2031.md');

  for (const result of [gateResult, issuerResult]) {
    const requiresGma = result.classes.some((c) => c === 'governance_mutation' || c === 'workflow_mutation');
    assert.equal(requiresGma, false, 'operational-risk/*.md must not be classified as governance_mutation or workflow_mutation');
  }
});
