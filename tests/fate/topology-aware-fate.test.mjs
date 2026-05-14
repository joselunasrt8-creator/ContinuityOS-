import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const runtimeRoot = path.join(root, 'runtime');
const surfacesRoot = path.join(runtimeRoot, 'surfaces');
const mapsRoot = path.join(runtimeRoot, 'maps');
const governanceRoot = path.join(runtimeRoot, 'governance');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const requiredSurfaceFiles = [
  'EXECUTION_SURFACES.json',
  'BYPASS_PATHS.json',
  'AUTHORITY_SURFACES.json',
  'TRUST_BOUNDARIES.json',
  'FEDERATION_SURFACES.json',
  'ROOT_AUTHORITY_SURFACES.json'
];

const requiredMapFiles = [
  'EXECUTION_FLOW.md',
  'CANONICAL_RUNTIME_MAP.md',
  'CONTINUITY_LINEAGE_MAP.md',
  'RECONCILIATION_GRAPH.md'
];

const requiredGovernanceFiles = [
  'PREO_POLICY.json',
  'SCO_POLICY.json',
  'REPLAY_POLICY.json',
  'DEPLOY_POLICY.json'
];

test('topology inventory files are present in canonical runtime locations', () => {
  assert.ok(fs.existsSync(surfacesRoot));
  assert.ok(fs.existsSync(mapsRoot));
  assert.ok(fs.existsSync(governanceRoot));

  for (const file of requiredSurfaceFiles) {
    assert.ok(fs.existsSync(path.join(surfacesRoot, file)), `missing runtime/surfaces/${file}`);
  }

  for (const file of requiredMapFiles) {
    assert.ok(fs.existsSync(path.join(mapsRoot, file)), `missing runtime/maps/${file}`);
  }

  for (const file of requiredGovernanceFiles) {
    assert.ok(fs.existsSync(path.join(governanceRoot, file)), `missing runtime/governance/${file}`);
  }
});

test('execution surface inventory declares mutation-capable surfaces and fail-closed invariant', () => {
  const inventory = readJson('runtime/surfaces/EXECUTION_SURFACES.json');
  assert.equal(inventory.classification, 'mutation_capable_surfaces');
  assert.match(inventory.core_invariant, /No execution surface may bypass/);
  assert.ok(Array.isArray(inventory.surfaces));
  assert.ok(inventory.surfaces.length >= 3);

  for (const surface of inventory.surfaces) {
    assert.ok(surface.surface_id);
    assert.ok(surface.category);
    assert.ok(surface.mutation_class);
    assert.ok(surface.entrypoint);
    assert.ok(surface.risk_class);
    assert.ok(surface.canonical_status);
  }
});

test('bypass paths define canonical lifecycle and critical invalid vectors', () => {
  const bypass = readJson('runtime/surfaces/BYPASS_PATHS.json');
  assert.equal(bypass.classification, 'canonical_bypass_paths');
  assert.deepEqual(bypass.canonical_lifecycle, [
    '/session',
    '/continuity',
    '/authority',
    '/compile',
    '/validate',
    '/execute',
    '/proof'
  ]);

  const criticalPaths = bypass.bypass_paths.filter((item) => item.severity === 'CRITICAL');
  assert.ok(criticalPaths.length >= 1);
});

test('federation surfaces deny authority inheritance', () => {
  const federation = readJson('runtime/surfaces/FEDERATION_SURFACES.json');
  assert.equal(federation.classification, 'federation_surfaces');
  assert.match(federation.core_invariant, /not inherit authority/);

  for (const surface of federation.surfaces) {
    assert.equal(surface.authority_inheritance, 'DENIED');
  }
});

test('runtime maps encode execution, continuity, and reconciliation invariants', () => {
  const executionFlow = readText('runtime/maps/EXECUTION_FLOW.md');
  const continuityMap = readText('runtime/maps/CONTINUITY_LINEAGE_MAP.md');
  const reconciliationGraph = readText('runtime/maps/RECONCILIATION_GRAPH.md');

  assert.match(executionFlow, /validated_object == executed_object/);
  assert.match(executionFlow, /No alternate execution path is valid/);
  assert.match(continuityMap, /No valid continuity chain/);
  assert.match(reconciliationGraph, /remote evidence ≠ local authority/);
  assert.match(reconciliationGraph, /registry divergence/);
});

test('governance policies are fail-closed and preserve canonical object discipline', () => {
  const policies = requiredGovernanceFiles.map((file) => readJson(`runtime/governance/${file}`));

  for (const policy of policies) {
    assert.equal(policy.failure_mode, 'NULL');
    assert.ok(policy.core_invariant);
  }

  const sco = readJson('runtime/governance/SCO_POLICY.json');
  const replay = readJson('runtime/governance/REPLAY_POLICY.json');
  const deploy = readJson('runtime/governance/DEPLOY_POLICY.json');

  assert.match(sco.core_invariant, /No system mutation/);
  assert.match(replay.core_invariant, /Reused authority/);
  assert.match(deploy.core_invariant, /Deployment is a governed reality mutation/);
});
