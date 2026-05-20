import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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

function runWithArtifact(artifact) {
  const dir = mkdtempSync(join(tmpdir(), 'issue-610-'));
  const file = join(dir, 'artifact.json');
  writeFileSync(file, JSON.stringify(artifact), 'utf8');
  const res = spawnSync('npx', ['tsx', 'scripts/governed-deploy.ts', file, 'node', '-e', 'process.exit(0)'], { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return res;
}

function validArtifact() {
  const deployment_target = { repo: 'example/repo', branch: 'main', workflow: 'governed-deploy.yml', commit: 'abc123' };
  const hash = hashTarget(deployment_target);
  return {
    preo: { id: 'preo-1', status: 'VALID' },
    continuity: { status: 'VALID', orphaned: false },
    validator: { status: 'APPROVED', approved: true },
    replay: { status: 'INVALID', reused: false },
    authority: { status: 'ACTIVE', expires_at: '2999-01-01T00:00:00.000Z' },
    proof: { status: 'VALID', binding_hash: hash },
    validated_object_hash: hash,
    deployment_hash: hash,
    deployment_target
  };
}

test('deploy denied without PREO', () => {
  const artifact = validArtifact();
  delete artifact.preo;
  const res = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /deployment without PREO rejected/);
});

test('deploy denied with invalid validator state', () => {
  const artifact = validArtifact();
  artifact.validator.status = 'INVALID';
  const res = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /invalid validator state/);
});

test('deploy denied with replayed legitimacy object', () => {
  const artifact = validArtifact();
  artifact.replay = { status: 'VALID', reused: true };
  const res = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /replayed legitimacy artifacts rejected/);
});

test('deploy denied with expired authority', () => {
  const artifact = validArtifact();
  artifact.authority.expires_at = '2000-01-01T00:00:00.000Z';
  const res = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /expired authority rejected/);
});

test('deploy denied with orphan continuity lineage', () => {
  const artifact = validArtifact();
  artifact.continuity.orphaned = true;
  const res = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /orphan continuity rejected/);
});

test('deploy denied with proof mismatch', () => {
  const artifact = validArtifact();
  artifact.proof.binding_hash = 'mismatch';
  const res = runWithArtifact(artifact);
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /proof mismatch rejected/);
});

test('deploy allowed only when legitimacy chain is complete', () => {
  const artifact = validArtifact();
  const res = runWithArtifact(artifact);
  assert.equal(res.status, 0);
});
