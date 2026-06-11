import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = process.cwd();
const mergeGovernanceWorkflow = readFileSync(
  join(root, '.github', 'workflows', 'merge-governance-check.yml'),
  'utf8',
);
const issuanceWorkflow = readFileSync(
  join(root, '.github', 'workflows', 'governance-mutation-authorization.yml'),
  'utf8',
);
const spec = JSON.parse(
  readFileSync(join(root, 'governance', 'authorizations', 'GOVERNANCE_MUTATION_AUTHORIZATION_SPEC.json'), 'utf8'),
);

// Extract the embedded node validator script from the
// "Validate governance mutation authorization (GAP-005 / Issue #1984)" step
// so the registry-selection logic can be exercised directly against fixtures.
function extractValidatorScript(workflow) {
  const stepMarker = 'name: Validate governance mutation authorization (GAP-005 / Issue #1984)';
  const stepStart = workflow.indexOf(stepMarker);
  assert.ok(stepStart >= 0, 'validator step must be present in merge-governance-check.yml');

  const marker = "node --input-type=module <<'NODE'";
  const start = workflow.indexOf(marker, stepStart);
  assert.ok(start >= 0, 'validator node script must be present in merge-governance-check.yml');
  const bodyStart = workflow.indexOf('\n', start) + 1;
  const end = workflow.indexOf('\n          NODE', bodyStart);
  assert.ok(end >= 0, 'validator node script must be terminated by NODE heredoc marker');
  const raw = workflow.slice(bodyStart, end);
  // Each line is indented by 10 spaces in the workflow YAML — dedent for execution.
  return raw
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
}

const validatorScript = extractValidatorScript(mergeGovernanceWorkflow);

function governedFilesHash(files) {
  const parts = Object.entries(files)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([path, content]) => `${path}:${createHash('sha256').update(content).digest('hex')}`);
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

function gmaEntry(overrides = {}) {
  const now = new Date();
  const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  return {
    gma_id: 'GMA-test',
    decision_id: 'd'.repeat(64),
    continuity_id: 'c'.repeat(64),
    session_id: 's'.repeat(64),
    validated_object_hash: 'v'.repeat(64),
    governed_files: ['fixture/governed.txt'],
    mutation_classes: ['workflow_mutation'],
    gm_control_class: 'GOVERNANCE_CONTAINED',
    issuance_method: 'LOCAL_DETERMINISTIC',
    canonical_lifecycle_executed: false,
    authorized_by: 'test-actor',
    authority_lineage_bound: true,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    status: 'GMA_VALID',
    ...overrides,
  };
}

// Runs the extracted validator against a throwaway directory containing
// governed_files.txt, mutation_classes.txt, the governed file(s), and
// (optionally) gma_registry.jsonl / GOVERNANCE_MUTATION_AUTHORIZATION.json.
function runValidator({ governedFileContent, mutationClasses, registryEntries, singleton, headRef }) {
  const dir = mkdtempSync(join(tmpdir(), 'gma-registry-test-'));
  try {
    writeFileSync(join(dir, 'governed_files.txt'), 'fixture/governed.txt\n');
    writeFileSync(join(dir, 'mutation_classes.txt'), `${mutationClasses.join('\n')}\n`);

    const fixtureDir = join(dir, 'fixture');
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(join(fixtureDir, 'governed.txt'), governedFileContent);

    const authDir = join(dir, 'governance', 'authorizations');
    mkdirSync(authDir, { recursive: true });
    if (registryEntries) {
      writeFileSync(
        join(authDir, 'gma_registry.jsonl'),
        registryEntries.map((e) => JSON.stringify(e)).join('\n') + (registryEntries.length ? '\n' : ''),
      );
    }
    if (singleton) {
      writeFileSync(join(authDir, 'GOVERNANCE_MUTATION_AUTHORIZATION.json'), JSON.stringify(singleton, null, 2));
    }

    const result = spawnSync(process.execPath, ['--input-type=module'], {
      cwd: dir,
      input: validatorScript,
      encoding: 'utf8',
      env: { ...process.env, HEAD_REF: headRef },
    });
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('two distinct GMA entries coexist in the registry and each validates against its own branch+hash', () => {
  const contentA = 'branch A governed content\n';
  const contentB = 'branch B governed content\n';
  const hashA = governedFilesHash({ 'fixture/governed.txt': contentA });
  const hashB = governedFilesHash({ 'fixture/governed.txt': contentB });
  assert.notEqual(hashA, hashB);

  const entryA = gmaEntry({ gma_id: 'GMA-A', branch: 'branch-a', governed_files_hash: hashA });
  const entryB = gmaEntry({ gma_id: 'GMA-B', branch: 'branch-b', governed_files_hash: hashB });
  const registryEntries = [entryA, entryB];

  const resultA = runValidator({
    governedFileContent: contentA,
    mutationClasses: ['workflow_mutation'],
    registryEntries,
    headRef: 'branch-a',
  });
  assert.equal(resultA.status, 0, resultA.stderr);
  assert.match(resultA.stdout, /GMA_VALID: GMA-A \(source: registry \(branch\+hash\)\)/);

  const resultB = runValidator({
    governedFileContent: contentB,
    mutationClasses: ['workflow_mutation'],
    registryEntries,
    headRef: 'branch-b',
  });
  assert.equal(resultB.status, 0, resultB.stderr);
  assert.match(resultB.stdout, /GMA_VALID: GMA-B \(source: registry \(branch\+hash\)\)/);
});

test('a PR whose governed diff matches no registry entry is MERGE_LEGITIMACY_NULL', () => {
  const content = 'unmatched governed content\n';
  const hash = governedFilesHash({ 'fixture/governed.txt': 'something else\n' });
  const registryEntries = [gmaEntry({ gma_id: 'GMA-OTHER', branch: 'branch-a', governed_files_hash: hash })];

  const result = runValidator({
    governedFileContent: content,
    mutationClasses: ['workflow_mutation'],
    registryEntries,
    headRef: 'branch-a',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NULL — no valid GMA for this PR's governed diff/);
  assert.match(result.stderr, /MERGE_LEGITIMACY_NULL/);
});

test('a content-hash match bound to a different branch is MERGE_LEGITIMACY_NULL (replay guard)', () => {
  const content = 'shared governed content\n';
  const hash = governedFilesHash({ 'fixture/governed.txt': content });
  const registryEntries = [gmaEntry({ gma_id: 'GMA-OTHER-BRANCH', branch: 'branch-a', governed_files_hash: hash })];

  const result = runValidator({
    governedFileContent: content,
    mutationClasses: ['workflow_mutation'],
    registryEntries,
    headRef: 'branch-b',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NULL — no valid GMA for this PR's governed diff/);
  assert.match(result.stderr, /MERGE_LEGITIMACY_NULL/);
});

test('legacy singleton remains a transitional fallback when no registry entry matches', () => {
  const content = 'singleton-fallback governed content\n';
  const hash = governedFilesHash({ 'fixture/governed.txt': content });
  const singleton = gmaEntry({ gma_id: 'GMA-SINGLETON', branch: 'some-other-branch', governed_files_hash: hash });

  const result = runValidator({
    governedFileContent: content,
    mutationClasses: ['workflow_mutation'],
    registryEntries: [],
    singleton,
    headRef: 'branch-a',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GMA_VALID: GMA-SINGLETON \(source: singleton-fallback\)/);
});

test('issuance workflow appends to the append-only registry and stages it for commit', () => {
  assert.match(issuanceWorkflow, /appendFileSync\(REGISTRY, JSON\.stringify\(gma\) \+ '\\n'\)/, 'issuance must append a single-line GMA entry to the registry');
  assert.match(issuanceWorkflow, /git add governance\/authorizations\/gma_registry\.jsonl/, 'commit step must stage the registry');
  assert.match(issuanceWorkflow, /writeFileSync\(\s*\n\s*'governance\/authorizations\/GOVERNANCE_MUTATION_AUTHORIZATION\.json'/, 'issuance must continue dual-writing the legacy singleton (Phase 1)');
});

test('merge-governance-check enforces append-only growth of gma_registry.jsonl', () => {
  assert.match(mergeGovernanceWorkflow, /name: Enforce append-only GMA registry \(Issue #1984\)/);
  assert.match(mergeGovernanceWorkflow, /head\.subarray\(0, base\.length\)\.equals\(base\)/, 'append-only check must assert the base registry is a byte-exact prefix of the head registry');
  assert.match(mergeGovernanceWorkflow, /MERGE_LEGITIMACY_NULL/);
});

test('spec documents the append-only registry, selection key, and migration phase', () => {
  assert.equal(spec.registry_model.store, 'governance/authorizations/gma_registry.jsonl');
  assert.equal(spec.registry_model.selection_key, '(branch, governed_files_hash)');
  assert.equal(spec.registry_model.merge_union_driver.attribute, 'merge=union');
  assert.match(spec.registry_model.merge_union_driver.limitation, /does NOT apply to GitHub's server-side/);
  assert.equal(spec.migration.model, '5-phase dual-write');
  assert.equal(spec.migration.current_phase, 'PHASE_1_2_ACTIVE');
});

test('.gitattributes declares merge=union for both append-only governance registries', () => {
  const gitattributes = readFileSync(join(root, '.gitattributes'), 'utf8');
  assert.match(gitattributes, /governance\/authorizations\/gma_registry\.jsonl\s+merge=union/);
  assert.match(gitattributes, /governance\/merge-legitimacy\/merge_proof_registry\.jsonl\s+merge=union/);
});
