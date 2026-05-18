import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const workflowDir = join(root, '.github', 'workflows');
const branchProtection = JSON.parse(
  readFileSync(join(root, 'governance', 'runtime', 'BRANCH_PROTECTION_POLICY.json'), 'utf8'),
);
const mergeRules = JSON.parse(
  readFileSync(join(root, 'governance', 'runtime', 'MERGE_GOVERNANCE_RULES.json'), 'utf8'),
);
const preoRequirements = JSON.parse(
  readFileSync(join(root, 'governance', 'runtime', 'PREO_REQUIREMENTS.json'), 'utf8'),
);
const prTemplate = readFileSync(join(root, '.github', 'pull_request_template.md'), 'utf8');

function extractWorkflowInventory() {
  return readdirSync(workflowDir)
    .filter((file) => file.endsWith('.yml'))
    .sort()
    .flatMap((file) => {
      const workflowFile = `.github/workflows/${file}`;
      const source = readFileSync(join(workflowDir, file), 'utf8');
      const workflowName = source.match(/^name:\s*(.+)$/m)?.[1]?.trim();
      assert.ok(workflowName, `${workflowFile} must declare a workflow name`);

      const jobsBlock = source.match(/^jobs:\s*$([\s\S]*)/m)?.[1] ?? '';
      const jobs = [...jobsBlock.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => match[1]);

      return jobs.map((jobName) => ({
        workflow_file: workflowFile,
        workflow_name: workflowName,
        job_name: jobName,
        emitted_check_run_name: jobName,
      }));
    });
}

const emittedInventory = extractWorkflowInventory();
const emittedCheckNames = new Set(emittedInventory.map((entry) => entry.emitted_check_run_name));

function detectGovernanceDrift(policy = branchProtection) {
  const required = policy.required_controls.required_status_checks;
  const missing = required.filter((checkName) => !emittedCheckNames.has(checkName));

  if (missing.length > 0) {
    return {
      status: 'GOVERNANCE_DRIFT',
      missing_required_checks: missing,
      preo_status: 'PREO_INVALID',
      merge_legitimacy: null,
    };
  }

  return {
    status: 'PARITY_VALID',
    missing_required_checks: [],
    preo_status: 'PREO_VALID',
    merge_legitimacy: 'ELIGIBLE_ONLY_AFTER_REQUIRED_CHECKS_AND_REVIEW_PASS',
  };
}

test('branch protection required checks resolve to emitted GitHub Actions job check-run names', () => {
  const requiredChecks = branchProtection.required_controls.required_status_checks;

  assert.deepEqual(
    requiredChecks,
    ['merge-governance-check', 'generate-preo-candidate', 'generate-sco-candidate'],
    'branch protection must require emitted job names, not workflow-only names',
  );

  for (const requiredCheck of requiredChecks) {
    assert.ok(
      emittedCheckNames.has(requiredCheck),
      `required branch protection check is not emitted by any workflow job: ${requiredCheck}`,
    );
  }
});

test('canonical emitted-check inventory maps every required check to the emitted job name', () => {
  const canonicalInventory = branchProtection.emitted_check_inventory;
  assert.ok(Array.isArray(canonicalInventory), 'branch policy must include emitted_check_inventory');

  const emittedByName = new Map(emittedInventory.map((entry) => [entry.emitted_check_run_name, entry]));

  for (const requiredCheck of branchProtection.required_controls.required_status_checks) {
    const canonicalEntry = canonicalInventory.find((entry) => entry.required_check === requiredCheck);
    assert.ok(canonicalEntry, `missing canonical inventory entry for ${requiredCheck}`);

    const emittedEntry = emittedByName.get(canonicalEntry.emitted_check_run_name);
    assert.ok(emittedEntry, `canonical inventory points at a non-emitted check: ${requiredCheck}`);
    assert.equal(canonicalEntry.required_check, canonicalEntry.emitted_check_run_name);
    assert.equal(canonicalEntry.workflow_file, emittedEntry.workflow_file);
    assert.equal(canonicalEntry.workflow_name, emittedEntry.workflow_name);
    assert.equal(canonicalEntry.job_name, emittedEntry.job_name);
  }
});

test('nonexistent required check is governance drift that fails closed before merge legitimacy', () => {
  const driftedPolicy = structuredClone(branchProtection);
  driftedPolicy.required_controls.required_status_checks = [
    ...driftedPolicy.required_controls.required_status_checks,
    'nonexistent-required-check',
  ];

  const outcome = detectGovernanceDrift(driftedPolicy);

  assert.equal(outcome.status, 'GOVERNANCE_DRIFT');
  assert.deepEqual(outcome.missing_required_checks, ['nonexistent-required-check']);
  assert.equal(outcome.preo_status, 'PREO_INVALID');
  assert.equal(outcome.merge_legitimacy, null);
});

test('PREO_VALID remains the canonical gate for merge legitimacy', () => {
  assert.ok(
    branchProtection.core_invariant.includes('No PREO_VALID -> no merge legitimacy'),
    'branch protection policy must preserve the PREO_VALID legitimacy invariant',
  );
  assert.ok(
    mergeRules.rules.includes('No PREO_VALID -> no merge legitimacy'),
    'merge governance rules must preserve the PREO_VALID legitimacy invariant',
  );

  const parityOutcome = detectGovernanceDrift();
  assert.equal(parityOutcome.status, 'PARITY_VALID');
  assert.equal(parityOutcome.preo_status, 'PREO_VALID');
  assert.equal(
    parityOutcome.merge_legitimacy,
    'ELIGIBLE_ONLY_AFTER_REQUIRED_CHECKS_AND_REVIEW_PASS',
  );
});

test('protection-critical emitted checks are represented canonically with no stale names', () => {
  const requiredChecks = branchProtection.required_controls.required_status_checks;
  const mergeRequiredChecks = mergeRules.required_checks;

  assert.deepEqual(
    [...requiredChecks].sort(),
    [...mergeRequiredChecks].sort(),
    'branch protection and merge governance required checks must remain identical',
  );

  const canonicalChecks = branchProtection.emitted_check_inventory.map((entry) => entry.required_check);
  assert.deepEqual(
    [...canonicalChecks].sort(),
    [...requiredChecks].sort(),
    'canonical emitted inventory must track every required check exactly once',
  );

  const stale = canonicalChecks.filter((name) => !emittedCheckNames.has(name));
  assert.deepEqual(stale, [], 'canonical inventory cannot reference stale/non-emitted checks');
});

test('PREO, PR template, and branch protection artifacts align on merge legitimacy gates', () => {
  assert.ok(
    preoRequirements.rules.some((rule) =>
      rule.includes('PREO_VALID requires all branch protection required_status_checks to resolve to emitted GitHub Actions job check-run names'),
    ),
    'PREO requirements must bind PREO_VALID to branch-protection required-check emission parity',
  );

  assert.match(prTemplate, /`npm test`/, 'PR template must require test evidence before merge');
  assert.match(prTemplate, /`npx tsc --noEmit`/, 'PR template must require static verification evidence before merge');
  assert.equal(branchProtection.status, 'policy_only_non_enforcing');
});

test('governed deploy and constitutional workflows are emitted and non-authoritative for branch protection', () => {
  assert.ok(
    emittedInventory.some(
      (entry) =>
        entry.workflow_file === '.github/workflows/constitutional-integrity.yml' &&
        entry.workflow_name === 'constitutional-integrity' &&
        entry.job_name === 'constitutional-integrity',
    ),
    'constitutional integrity workflow/job must remain emitted for governance integrity checks',
  );

  assert.ok(
    emittedInventory.some(
      (entry) =>
        entry.workflow_file === '.github/workflows/prepare-governed-deploy.yml' &&
        entry.workflow_name === 'prepare-governed-deploy' &&
        entry.job_name === 'prepare-governed-deploy-inputs',
    ),
    'prepare governed deploy workflow/job must remain emitted for dry-run input preparation',
  );

  assert.ok(
    emittedInventory.some(
      (entry) =>
        entry.workflow_file === '.github/workflows/governed-deploy.yml' &&
        entry.workflow_name === 'governed-deploy' &&
        entry.job_name === 'governed-production-deploy',
    ),
    'governed deploy workflow/job must remain emitted as the governed deploy execution surface',
  );
});
