import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashTarget(target) {
  return createHash('sha256').update(canonicalize(target)).digest('hex');
}

function validArtifact() {
  const nonce = Math.random().toString(36).slice(2);
  const deployment_target = { repo: 'example/repo', branch: 'main', workflow: 'governed-deploy.yml', commit: 'abc123' };
  const hash = hashTarget(deployment_target);
  return {
    session_id: `session-${nonce}`,
    decision_id: `decision-${nonce}`,
    invocation_nonce: `nonce-${nonce}`,
    preo: { id: 'preo-1', status: 'VALID' },
    continuity: { status: 'VALID', orphaned: false },
    validator: { status: 'APPROVED', approved: true },
    replay: { status: 'INVALID', reused: false },
    authority: { status: 'ACTIVE', expires_at: '2999-01-01T00:00:00.000Z' },
    proof: { status: 'VALID', binding_hash: hash, proof_id: `proof-${nonce}` },
    validated_object_hash: hash,
    deployment_hash: hash,
    deployment_target
  };
}

function runWithArtifact(artifact, opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'issue-610-'));
  const file = join(dir, 'artifact.json');
  const registry = join(dir, 'deploy_audit_registry.json');
  writeFileSync(file, JSON.stringify(artifact), 'utf8');
  const res = spawnSync('npx', ['tsx', 'scripts/governed-deploy.ts', file, ...(opts.deployCommand ?? ['node', '-e', 'process.exit(0)'])], {
    encoding: 'utf8',
    env: {
      ...process.env,
      MINDSHIFT_GOVERNED_DEPLOY_CONTEXT: opts.context ?? 'github_actions_governed',
      MINDSHIFT_DEPLOY_AUDIT_REGISTRY: registry,
      ...(opts.breakGlass ? { MINDSHIFT_BREAK_GLASS_DEPLOY: 'true' } : {})
    }
  });
  const registryJson = readFileSync(registry, 'utf8');
  const parsedRegistry = JSON.parse(registryJson);
  rmSync(dir, { recursive: true, force: true });
  return { res, registry: parsedRegistry };
}

test('deploy denied without PREO', () => {
  const artifact = validArtifact();
  delete artifact.preo;
  const { res } = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /deployment without PREO rejected/);
});

test('deploy denied with invalid validator state', () => {
  const artifact = validArtifact();
  artifact.validator.status = 'INVALID';
  const { res } = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /invalid validator state/);
});

test('deploy denied with replayed legitimacy object', () => {
  const artifact = validArtifact();
  artifact.replay = { status: 'VALID', reused: true };
  const { res } = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /replayed legitimacy artifacts rejected/);
});

test('deploy denied with expired authority', () => {
  const artifact = validArtifact();
  artifact.authority.expires_at = '2000-01-01T00:00:00.000Z';
  const { res } = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /expired authority rejected/);
});

test('deploy denied with orphan continuity lineage', () => {
  const artifact = validArtifact();
  artifact.continuity.orphaned = true;
  const { res } = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /orphan continuity rejected/);
});

test('deploy denied with proof mismatch', () => {
  const artifact = validArtifact();
  artifact.proof.binding_hash = 'mismatch';
  const { res } = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /proof mismatch rejected/);
});

test('deploy denied when deployment target differs from validated object', () => {
  const artifact = validArtifact();
  artifact.deployment_target = { ...artifact.deployment_target, commit: 'def456' };
  const { res } = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /exact deployment hash parity failed/);
});


test('deploy allowed only when legitimacy chain is complete', () => {
  const artifact = validArtifact();
  const { res } = runWithArtifact(artifact);
  assert.equal(res.status, 0);
});

test('direct wrangler invocation rejected', () => {
  const artifact = validArtifact();
  const { res } = runWithArtifact(artifact, { deployCommand: ['wrangler', 'deploy'] });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /direct wrangler invocation rejected/);
});

test('workflow deploy bypass rejected without governed context', () => {
  const artifact = validArtifact();
  const { res } = runWithArtifact(artifact, { context: '' });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /workflow bypasses governed deploy wrapper/);
});

test('successful governed deploy is recorded in deterministic registry', () => {
  const { registry } = runWithArtifact(validArtifact());
  assert.equal(registry.schema_version, 1);
  assert.equal(registry.registry, 'deploy_audit_registry');
  assert.equal(registry.entries.length, 1);
  assert.equal(registry.entries[0].event_type, 'governed_deploy_success');
});

test('rejection and break-glass events are recorded', () => {
  const rejectedArtifact = validArtifact();
  rejectedArtifact.replay = { status: 'VALID', reused: true };
  const rejectionRun = runWithArtifact(rejectedArtifact);
  assert.equal(rejectionRun.registry.entries[0].event_type, 'replay_rejection');

  const breakGlassRun = runWithArtifact(validArtifact(), { breakGlass: true });
  assert.equal(breakGlassRun.registry.entries[0].event_type, 'break_glass_deploy_invocation');
  assert.equal(breakGlassRun.registry.entries[1].event_type, 'governed_deploy_success');
});

test('workflow bypass and direct wrangler rejection are recorded', () => {
  const bypassRun = runWithArtifact(validArtifact(), { context: '' });
  assert.equal(bypassRun.registry.entries[0].event_type, 'workflow_bypass_rejection');

  const wranglerRun = runWithArtifact(validArtifact(), { deployCommand: ['wrangler', 'deploy'] });
  assert.equal(wranglerRun.registry.entries[0].event_type, 'direct_wrangler_invocation_rejection');
});

test('registry corruption fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'issue-610-corrupt-'));
  const file = join(dir, 'artifact.json');
  const registry = join(dir, 'deploy_audit_registry.json');
  writeFileSync(file, JSON.stringify(validArtifact()), 'utf8');
  writeFileSync(registry, '{not-json', 'utf8');
  const res = spawnSync('npx', ['tsx', 'scripts/governed-deploy.ts', file, 'node', '-e', 'process.exit(0)'], {
    encoding: 'utf8',
    env: { ...process.env, MINDSHIFT_GOVERNED_DEPLOY_CONTEXT: 'github_actions_governed', MINDSHIFT_DEPLOY_AUDIT_REGISTRY: registry }
  });
  rmSync(dir, { recursive: true, force: true });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /deploy audit registry corrupted/);
});

test('registry append-only semantics do not rewrite history and reject duplicate replay event writes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'issue-610-append-'));
  const file = join(dir, 'artifact.json');
  const registry = join(dir, 'deploy_audit_registry.json');
  const artifact = validArtifact();
  writeFileSync(file, JSON.stringify(artifact), 'utf8');

  const baseEnv = { ...process.env, MINDSHIFT_GOVERNED_DEPLOY_CONTEXT: 'github_actions_governed', MINDSHIFT_DEPLOY_AUDIT_REGISTRY: registry };
  const first = spawnSync('npx', ['tsx', 'scripts/governed-deploy.ts', file, 'node', '-e', 'process.exit(0)'], { encoding: 'utf8', env: baseEnv });
  assert.equal(first.status, 0);
  const snapshot = JSON.parse(readFileSync(registry, 'utf8'));
  const firstEvent = JSON.stringify(snapshot.entries[0]);

  const replayedArtifact = { ...artifact, replay: { status: 'VALID', reused: true } };
  writeFileSync(file, JSON.stringify(replayedArtifact), 'utf8');
  spawnSync('npx', ['tsx', 'scripts/governed-deploy.ts', file, 'node', '-e', 'process.exit(0)'], { encoding: 'utf8', env: baseEnv });
  spawnSync('npx', ['tsx', 'scripts/governed-deploy.ts', file, 'node', '-e', 'process.exit(0)'], { encoding: 'utf8', env: baseEnv });

  const after = JSON.parse(readFileSync(registry, 'utf8'));
  assert.equal(JSON.stringify(after.entries[0]), firstEvent);
  assert.equal(after.entries.at(-1).event_type, 'replay_rejection');
  rmSync(dir, { recursive: true, force: true });
});


test('deploy denied when canonical lineage fields are missing', () => {
  const artifact = validArtifact();
  delete artifact.invocation_nonce;
  const { res } = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /missing canonical lineage fields/);
});

test('duplicate proof tuple is rejected deterministically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'issue-610-tuple-'));
  const file = join(dir, 'artifact.json');
  const registry = join(dir, 'deploy_audit_registry.json');
  const artifact = validArtifact();
  writeFileSync(file, JSON.stringify(artifact), 'utf8');

  const env = { ...process.env, MINDSHIFT_GOVERNED_DEPLOY_CONTEXT: 'github_actions_governed', MINDSHIFT_DEPLOY_AUDIT_REGISTRY: registry };
  const first = spawnSync('npx', ['tsx', 'scripts/governed-deploy.ts', file, 'node', '-e', 'process.exit(0)'], { encoding: 'utf8', env });
  assert.equal(first.status, 0);

  const second = spawnSync('npx', ['tsx', 'scripts/governed-deploy.ts', file, 'node', '-e', 'process.exit(0)'], { encoding: 'utf8', env });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /duplicate proof tuple rejected/);
  rmSync(dir, { recursive: true, force: true });
});
