/**
 * CONF-CICD-04 / CONF-CICD-05 — Replay and hash-mutation enforcement.
 * Tests run against the local validator mock (no live credentials needed).
 */

import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { describe, it, before, after } from 'node:test';
import { startMockServer } from './validator-mock/server.mjs';

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

async function post(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
    body: JSON.stringify(body),
  });
  return { code: res.status, json: await res.json() };
}

describe('CONF-CICD-04 — Replay nonce enforcement', () => {
  let server;
  let base;

  before(async () => {
    ({ server, port } = await startMockServer(0, 'valid-workflow'));
    base = `http://127.0.0.1:${port}`;
  });

  let port;

  after(() => server?.close());

  it('second /execute with same nonce returns NULL/replay_detected', async () => {
    // Establish session + continuity
    const session = await post(base, '/session', { identity_id: 'test-replay' });
    assert.equal(session.json.status, 'SESSION_ACTIVE');
    const sessionId = session.json.session_id;

    const continuity = await post(base, '/continuity', {
      session_id: sessionId, decision_id: 'dec-test', environment: 'production',
      repo: 'joselunasrt8-creator/mindshift-demo', branch: 'main', workflow: 'governed-deploy.yml',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    assert.equal(continuity.json.status, 'CONTINUITY_ACTIVE');

    const compile = await post(base, '/compile', { decision_id: 'dec-test' });
    assert.equal(compile.json.status, 'COMPILED');
    const hash = compile.json.validated_object_hash;

    const nonce = 'replay-test-nonce-' + Date.now();

    const validate = await post(base, '/validate', {
      session_id: sessionId, decision_id: 'dec-test',
      validated_object_hash: hash, invocation_nonce: nonce,
      environment: 'production', repo: 'joselunasrt8-creator/mindshift-demo',
      branch: 'main', workflow: 'governed-deploy.yml',
    });
    assert.equal(validate.json.status, 'VALID', 'first validate should succeed');

    const execute1 = await post(base, '/execute', {
      session_id: sessionId, decision_id: 'dec-test',
      validated_object_hash: hash, invocation_nonce: nonce,
      environment: 'production', repo: 'joselunasrt8-creator/mindshift-demo',
      branch: 'main', workflow: 'governed-deploy.yml',
    });
    assert.equal(execute1.json.status, 'EXECUTED', 'first execute should succeed');

    // Replay attempt — same nonce
    const execute2 = await post(base, '/execute', {
      session_id: sessionId, decision_id: 'dec-test',
      validated_object_hash: hash, invocation_nonce: nonce,
      environment: 'production', repo: 'joselunasrt8-creator/mindshift-demo',
      branch: 'main', workflow: 'governed-deploy.yml',
    });
    assert.equal(execute2.json.status, 'NULL', 'replayed nonce must return NULL');
    assert.equal(execute2.json.reason, 'replay_detected', 'reason must be replay_detected');
    assert.equal(execute2.code, 409, 'HTTP status must be 409 Conflict');
  });
});

describe('CONF-CICD-05 — Hash mutation enforcement', () => {
  let server;
  let base;
  let port;

  before(async () => {
    ({ server, port } = await startMockServer(0, 'mutated-aeo'));
    base = `http://127.0.0.1:${port}`;
  });

  after(() => server?.close());

  it('/validate returns NULL/hash_mismatch for mutated AEO hash', async () => {
    const session = await post(base, '/session', { identity_id: 'test-mutation' });
    assert.equal(session.json.status, 'SESSION_ACTIVE');

    const wrongHash = sha256('mutated-content-not-matching-compiled-aeo');
    const result = await post(base, '/validate', {
      session_id: session.json.session_id,
      decision_id: 'dec-test',
      validated_object_hash: wrongHash,
      invocation_nonce: 'nonce-mutation-test',
      environment: 'production',
      repo: 'joselunasrt8-creator/mindshift-demo',
      branch: 'main',
      workflow: 'governed-deploy.yml',
    });
    assert.equal(result.json.status, 'NULL', 'mutated hash must return NULL');
    assert.ok(
      result.json.reason === 'hash_mismatch' || result.json.reason === 'validation_failed',
      `reason must indicate hash problem, got: ${result.json.reason}`,
    );
  });
});

describe('CONF-CICD-05b — Canonical hash stability', () => {
  it('same AEO with different key order produces identical hash', () => {
    function stableStringify(val) {
      if (val === null || typeof val !== 'object') return JSON.stringify(val);
      if (Array.isArray(val)) return '[' + val.map(stableStringify).join(',') + ']';
      const keys = Object.keys(val).sort();
      return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(val[k])).join(',') + '}';
    }
    function canonHash(obj) {
      return sha256(stableStringify(obj));
    }

    const aeoA = {
      intent: 'deploy_production_worker',
      scope: { environment: 'production', repo: 'joselunasrt8-creator/mindshift-demo', branch: 'main', workflow: 'governed-deploy.yml' },
      validation: { decision_id: 'dec-test', authority_id: 'auth-test', require_active_authority: true, require_exact_object_hash: true, require_session_continuity: true },
      target: { system: 'cloudflare_worker', action: 'wrangler_deploy' },
      finality: { proof_required: true, proof_type: 'governed_deploy_proof', registry_required: true },
    };

    // Same content, different key insertion order
    const aeoB = {
      finality: { registry_required: true, proof_type: 'governed_deploy_proof', proof_required: true },
      target: { action: 'wrangler_deploy', system: 'cloudflare_worker' },
      validation: { require_session_continuity: true, require_exact_object_hash: true, require_active_authority: true, authority_id: 'auth-test', decision_id: 'dec-test' },
      scope: { workflow: 'governed-deploy.yml', branch: 'main', repo: 'joselunasrt8-creator/mindshift-demo', environment: 'production' },
      intent: 'deploy_production_worker',
    };

    assert.equal(canonHash(aeoA), canonHash(aeoB), 'canonical hash must be key-order independent');
  });

  it('mutated field changes the hash', () => {
    function stableStringify(val) {
      if (val === null || typeof val !== 'object') return JSON.stringify(val);
      if (Array.isArray(val)) return '[' + val.map(stableStringify).join(',') + ']';
      const keys = Object.keys(val).sort();
      return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(val[k])).join(',') + '}';
    }
    function canonHash(obj) {
      return sha256(stableStringify(obj));
    }

    const original = { intent: 'deploy_production_worker', scope: { branch: 'main' }, validation: { decision_id: 'dec-test', authority_id: 'auth-test', require_active_authority: true, require_exact_object_hash: true, require_session_continuity: true }, target: { system: 'cloudflare_worker', action: 'wrangler_deploy' }, finality: { proof_required: true, proof_type: 'governed_deploy_proof', registry_required: true } };
    const mutated = { ...original, target: { system: 'cloudflare_worker', action: 'wrangler_deploy_MUTATED' } };

    assert.notEqual(canonHash(original), canonHash(mutated), 'mutated field must change the hash');
  });
});
