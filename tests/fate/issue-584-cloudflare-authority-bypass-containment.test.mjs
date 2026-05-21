import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

function readText(path) {
  return readFileSync(join(root, path), 'utf8');
}

// ---------------------------------------------------------------------------
// Topology and governance document presence
// ---------------------------------------------------------------------------

test('issue #584: required containment artifacts exist', () => {
  for (const path of [
    'governance/runtime/CLOUDFLARE_AUTHORITY_CLASSIFICATION.json',
    'governance/runtime/DEPLOYMENT_TOPOLOGY_MAP.json',
    'governance/runtime/PRODUCTION_MUTATION_CONTAINMENT.json',
    'governance/runtime/RESIDUAL_BYPASS_MATRIX.json',
  ]) {
    const raw = readFileSync(join(root, path), 'utf8');
    assert.ok(raw.length > 0, `${path} must exist and be non-empty`);
  }
});

test('issue #584: Cloudflare authority classification references canonical chain', () => {
  const doc = readJson('governance/runtime/CLOUDFLARE_AUTHORITY_CLASSIFICATION.json');
  assert.deepEqual(doc.canonical_chain, [
    '/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof',
  ]);
});

test('issue #584: all Cloudflare surfaces have required classification fields', () => {
  const doc = readJson('governance/runtime/CLOUDFLARE_AUTHORITY_CLASSIFICATION.json');
  for (const surface of doc.surfaces) {
    assert.ok(surface.surface_id, `surface must have surface_id`);
    assert.ok(surface.surface_name, `surface must have surface_name`);
    assert.equal(typeof surface.production_capable, 'boolean');
    assert.equal(typeof surface.governed_by_mindshift, 'boolean');
    assert.ok(['P0', 'P1', 'P2', 'P3'].includes(surface.bypass_risk), `${surface.surface_name} must have valid bypass_risk`);
    assert.ok(surface.containment_status, `${surface.surface_name} must have containment_status`);
    assert.ok(surface.observability, `${surface.surface_name} must have observability`);
  }
});

test('issue #584: production-capable ungoverned Cloudflare surfaces require P2/P3 risk classification', () => {
  const doc = readJson('governance/runtime/CLOUDFLARE_AUTHORITY_CLASSIFICATION.json');
  for (const surface of doc.surfaces) {
    if (surface.production_capable && !surface.governed_by_mindshift) {
      assert.ok(
        ['P2', 'P3'].includes(surface.bypass_risk),
        `${surface.surface_name}: production-capable ungoverned surface must be P2 or P3`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Production deploy outside governed workflow → NULL
// ---------------------------------------------------------------------------

test('issue #584: production deploy outside governed workflow is classified NULL', () => {
  const containment = readJson('governance/runtime/PRODUCTION_MUTATION_CONTAINMENT.json');
  const governedPath = containment.production_mutation_status.governed_path;
  assert.match(governedPath, /CONTAINED/);
});

test('issue #584: governed-deploy.ts rejects deploy without governed context', () => {
  const script = readText('scripts/governed-deploy.ts');
  assert.match(
    script,
    /process\.env\.MINDSHIFT_GOVERNED_DEPLOY_CONTEXT !== 'github_actions_governed'/,
    'governed-deploy.ts must check MINDSHIFT_GOVERNED_DEPLOY_CONTEXT',
  );
  assert.match(
    script,
    /failClosed\('workflow bypasses governed deploy wrapper'/,
    'governed-deploy.ts must fail closed when context is missing',
  );
});

test('issue #584: governed-deploy.ts blocks direct wrangler deploy (cmd=wrangler)', () => {
  const script = readText('scripts/governed-deploy.ts');
  assert.match(
    script,
    /cmd === 'wrangler'.*\/\\bdeploy\\b\/|\/\\bdeploy\\b\/.*cmd === 'wrangler'/,
    'governed-deploy.ts must block direct wrangler deploy invocation',
  );
  assert.match(
    script,
    /failClosed\('direct wrangler invocation rejected'/,
    'governed-deploy.ts must emit direct_wrangler_invocation_rejection event',
  );
});

test('issue #584: governed-deploy.ts blocks shell-wrapped wrangler deploy bypass', () => {
  const script = readText('scripts/governed-deploy.ts');
  assert.match(
    script,
    /\(bash\|sh\|zsh\).*wrangler.*deploy/,
    'governed-deploy.ts must block bash/sh/zsh-wrapped wrangler deploy patterns',
  );
});

// ---------------------------------------------------------------------------
// Unauthorized workflow dispatch → NULL
// ---------------------------------------------------------------------------

test('issue #584: governed-deploy.yml rejects non-workflow_dispatch triggers', () => {
  const workflow = readText('.github/workflows/governed-deploy.yml');
  assert.match(
    workflow,
    /if \[ "\$\{\{ github\.event_name \}\}" != "workflow_dispatch" \]/,
    'governed-deploy.yml must reject non-workflow_dispatch triggers',
  );
  assert.match(workflow, /echo "NULL — Only explicit invocation allowed"/);
});

test('issue #584: governed-deploy.yml validates CALLER_WORKFLOW_REF', () => {
  const workflow = readText('.github/workflows/governed-deploy.yml');
  assert.match(
    workflow,
    /case "\$CALLER_WORKFLOW_REF"/,
    'governed-deploy.yml must validate CALLER_WORKFLOW_REF',
  );
  assert.match(
    workflow,
    /echo "NULL — Workflow dispatch must enter through governed-deploy\.yml"/,
  );
});

test('issue #584: governed-deploy.yml requires all canonical inputs', () => {
  const workflow = readText('.github/workflows/governed-deploy.yml');
  assert.match(
    workflow,
    /for var in DECISION_ID VALIDATED_OBJECT_HASH INVOCATION_NONCE WORKER_URL API_KEY/,
    'governed-deploy.yml must require all canonical inputs',
  );
});

// ---------------------------------------------------------------------------
// Local bypass classified and observable
// ---------------------------------------------------------------------------

test('issue #584: local wrangler bypass is classified in residual bypass matrix', () => {
  const matrix = readJson('governance/runtime/RESIDUAL_BYPASS_MATRIX.json');
  const localWrangler = matrix.residual_bypasses.find(
    (b) => b.bypass_id === 'RB-002' || b.name.includes('Direct wrangler deploy'),
  );
  assert.ok(localWrangler, 'Direct wrangler deploy must be in residual bypass matrix');
  assert.equal(localWrangler.production_capable, true);
  assert.equal(localWrangler.governed_by_mindshift, false);
  assert.ok(localWrangler.observability, 'local bypass must have observability field');
});

test('issue #584: local bypass is observable via deploy audit registry', () => {
  const containment = readJson('governance/runtime/PRODUCTION_MUTATION_CONTAINMENT.json');
  const auditMeasure = containment.containment_measures.find((m) => m.measure_id === 'CM-009');
  assert.ok(auditMeasure, 'deploy audit registry measure must exist');
  assert.match(auditMeasure.status, /ACTIVE/);
  assert.match(auditMeasure.implementation, /deploy_audit_registry/);
});

test('issue #584: governed-deploy.ts emits audit events for all invocations', () => {
  const script = readText('scripts/governed-deploy.ts');
  // Success event emitted directly
  assert.match(script, /persistEvent\(buildEvent\('governed_deploy_success'/, 'success event must be emitted');
  // Rejection event is the default failClosed type
  assert.match(script, /type: DeployEventType = 'governed_deploy_rejection'/, 'governed_deploy_rejection must be the default failClosed event type');
  // Break-glass event emitted when MINDSHIFT_BREAK_GLASS_DEPLOY=true
  assert.match(script, /persistEvent\(buildEvent\('break_glass_deploy_invocation'/, 'break-glass event must be emitted');
  // Direct wrangler invocation rejection emitted by enforceGovernedDeployCommand
  assert.match(script, /'direct_wrangler_invocation_rejection'/, 'direct invocation rejection event type must be defined');
  // Workflow bypass rejection emitted when MINDSHIFT_GOVERNED_DEPLOY_CONTEXT is wrong
  assert.match(script, /'workflow_bypass_rejection'/, 'workflow bypass rejection event type must be defined');
});

// ---------------------------------------------------------------------------
// Preview-only paths cannot mutate production
// ---------------------------------------------------------------------------

test('issue #584: wrangler.toml has preview environment separation', () => {
  const wrangler = readText('wrangler.toml');
  assert.match(wrangler, /\[env\.preview\]/, 'wrangler.toml must define [env.preview]');
  assert.match(wrangler, /name = "mindshift-demo-preview"/, 'preview env must use separate worker name');
});

test('issue #584: preview environment has no production D1 binding', () => {
  const wrangler = readText('wrangler.toml');
  const previewSection = wrangler.slice(wrangler.indexOf('[env.preview]'));
  assert.doesNotMatch(
    previewSection,
    /mindshift-demo-prod/,
    'preview environment must not reference production D1 database',
  );
  assert.doesNotMatch(
    previewSection,
    /9f8a3741-af9d-4e8b-b973-50967a6fd0e6/,
    'preview environment must not reference production D1 database ID',
  );
});

test('issue #584: topology map confirms preview cannot mutate production', () => {
  const topology = readJson('governance/runtime/DEPLOYMENT_TOPOLOGY_MAP.json');
  const previewPath = topology.deployment_paths.find((p) => p.path_id === 'PATH-005');
  assert.ok(previewPath, 'Preview deploy path must be in topology map');
  assert.equal(previewPath.production_capable, false);
  assert.match(previewPath.status, /CONTAINED_BY_ENVIRONMENT_SEPARATION/);
});

test('issue #584: Cloudflare authority classification marks preview as non-production-capable', () => {
  const doc = readJson('governance/runtime/CLOUDFLARE_AUTHORITY_CLASSIFICATION.json');
  const previewSurface = doc.surfaces.find((s) => s.surface_id === 'CF-003');
  assert.ok(previewSurface, 'Preview environment surface must be classified');
  assert.equal(previewSurface.production_capable, false);
  assert.equal(previewSurface.bypass_risk, 'P0');
});

// ---------------------------------------------------------------------------
// Replayed deployment lineage rejected
// ---------------------------------------------------------------------------

test('issue #584: governed-deploy.yml verifies replay rejection at /execute', () => {
  const workflow = readText('.github/workflows/governed-deploy.yml');
  assert.match(
    workflow,
    /REPLAY_STATUS.*!=.*"NULL".*\|\|.*REPLAY_RESULT.*!=.*"INVALID"/,
    'governed-deploy.yml must check replay status',
  );
  assert.match(workflow, /echo "NULL — Replay protection failed"/);
});

test('issue #584: governed-deploy.ts rejects duplicate proof tuples', () => {
  const script = readText('scripts/governed-deploy.ts');
  assert.match(
    script,
    /tupleCollision/,
    'governed-deploy.ts must detect duplicate proof tuples',
  );
  assert.match(
    script,
    /NULL — duplicate proof tuple rejected/,
    'governed-deploy.ts must fail closed on duplicate proof tuple',
  );
});

test('issue #584: governed-deploy.yml replay check covers recognized rejection reasons', () => {
  const workflow = readText('.github/workflows/governed-deploy.yml');
  assert.match(workflow, /replay_detected/);
  assert.match(workflow, /authority_not_reserved/);
});

// ---------------------------------------------------------------------------
// Authority expiry not hardcoded
// ---------------------------------------------------------------------------

test('issue #584: governed-deploy.yml authority expiry is derived from /authority response', () => {
  const workflow = readText('.github/workflows/governed-deploy.yml');
  assert.doesNotMatch(
    workflow,
    /authority_expiry "2999-01-01T00:00:00\.000Z"/,
    'governed-deploy.yml must not use hardcoded 2999 authority expiry',
  );
  assert.match(
    workflow,
    /AUTHORITY_EXPIRY=\$\(jq -r '\.expiry \/\/ \.expires_at \/\/ empty' authority\.json\)/,
    'governed-deploy.yml must extract authority expiry from /authority response',
  );
  assert.match(
    workflow,
    /authority_expiry "\$AUTHORITY_EXPIRY"/,
    'governed-deploy.yml must use dynamic authority expiry in legitimacy artifact',
  );
});

test('issue #584: governed-deploy.yml fails closed when authority expiry is missing', () => {
  const workflow = readText('.github/workflows/governed-deploy.yml');
  assert.match(
    workflow,
    /echo "NULL — Authority response missing expiry"/,
    'governed-deploy.yml must fail closed when authority expiry is absent',
  );
});

// ---------------------------------------------------------------------------
// Cloudflare Git Integration containment
// ---------------------------------------------------------------------------

test('issue #584: Cloudflare Git Integration is classified as CONTAINMENT_REQUIRED', () => {
  const doc = readJson('governance/runtime/CLOUDFLARE_AUTHORITY_CLASSIFICATION.json');
  const gitIntegration = doc.surfaces.find((s) => s.surface_id === 'CF-001');
  assert.ok(gitIntegration, 'Cloudflare Git Integration must be classified');
  assert.equal(gitIntegration.production_capable, true);
  assert.equal(gitIntegration.governed_by_mindshift, false);
  assert.match(gitIntegration.containment_status, /CONTAINMENT_REQUIRED/);
});

test('issue #584: Git Integration containment requirement specifies account-level action', () => {
  const doc = readJson('governance/runtime/CLOUDFLARE_AUTHORITY_CLASSIFICATION.json');
  const req = doc.git_integration_containment;
  assert.ok(req, 'git_integration_containment must be present');
  assert.match(req.status, /CONTAINMENT_REQUIRED/);
  assert.ok(req.required_account_action, 'must specify required account action');
});

test('issue #584: residual bypass matrix includes Git Integration as open bypass', () => {
  const matrix = readJson('governance/runtime/RESIDUAL_BYPASS_MATRIX.json');
  const rb001 = matrix.residual_bypasses.find((b) => b.bypass_id === 'RB-001');
  assert.ok(rb001, 'RB-001 (Git Integration) must be in residual bypass matrix');
  assert.equal(rb001.production_capable, true);
  assert.equal(rb001.governed_by_mindshift, false);
  assert.match(rb001.status, /OPEN/);
});

// ---------------------------------------------------------------------------
// FATE coverage for deploy bypass attempts
// ---------------------------------------------------------------------------

test('issue #584: deployment topology map is complete and canonical', () => {
  const topology = readJson('governance/runtime/DEPLOYMENT_TOPOLOGY_MAP.json');
  assert.ok(Array.isArray(topology.deployment_paths));
  assert.ok(topology.deployment_paths.length >= 5, 'topology must enumerate at least 5 deployment paths');

  const governed = topology.deployment_paths.find((p) => p.governed === true);
  assert.ok(governed, 'at least one governed path must exist');
  assert.equal(governed.production_capable, true);

  const invariants = topology.topology_invariants;
  assert.ok(Array.isArray(invariants) && invariants.length > 0, 'topology invariants must be present');
});

test('issue #584: production mutation invariant is asserted in topology map', () => {
  const topology = readJson('governance/runtime/DEPLOYMENT_TOPOLOGY_MAP.json');
  assert.ok(topology.production_mutation_invariant, 'topology must assert production mutation invariant');
  assert.match(topology.production_mutation_invariant, /governed deployment lineage/);
});

test('issue #584: residual bypass matrix has acceptance condition', () => {
  const matrix = readJson('governance/runtime/RESIDUAL_BYPASS_MATRIX.json');
  assert.ok(matrix.acceptance_condition, 'residual bypass matrix must have acceptance condition');
  assert.match(matrix.acceptance_condition, /governed deployment lineage/);
});

test('issue #584: no bypass is classified as fully unobservable', () => {
  const matrix = readJson('governance/runtime/RESIDUAL_BYPASS_MATRIX.json');
  for (const bypass of matrix.residual_bypasses) {
    assert.ok(bypass.observability, `${bypass.bypass_id} must have observability field`);
    assert.notEqual(
      bypass.observability.toUpperCase(),
      'NONE',
      `${bypass.bypass_id} must not be classified as fully unobservable`,
    );
  }
});
