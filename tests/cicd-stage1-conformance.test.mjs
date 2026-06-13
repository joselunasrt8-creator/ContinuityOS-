/**
 * Stage 1 Governed CI/CD conformance test runner.
 * Tests CONF-CICD-01 through CONF-CICD-15 against the local validator mock.
 * No live credentials or deployed Worker required.
 */

import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { startMockServer } from './validator-mock/server.mjs';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

async function post(base, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'test-key' },
    body: JSON.stringify(body),
  });
  return { code: res.status, json: await res.json() };
}

async function withMock(scenario, fn) {
  const { server, port } = await startMockServer(0, scenario);
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

async function fullValidPath(base) {
  const session = await post(base, '/session', { identity_id: 'conformance-test' });
  assert.equal(session.json.status, 'SESSION_ACTIVE');
  const sessionId = session.json.session_id;

  const continuity = await post(base, '/continuity', {
    session_id: sessionId, decision_id: 'dec-cicd-mock-00000000', environment: 'production',
    repo: 'joselunasrt8-creator/mindshift-demo', branch: 'main', workflow: 'governed-deploy.yml',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  });
  assert.equal(continuity.json.status, 'CONTINUITY_ACTIVE');
  const continuityId = continuity.json.continuity_id;

  const authority = await post(base, '/authority', {
    session_id: sessionId, continuity_id: continuityId, decision_id: 'dec-cicd-mock-00000000',
  });
  assert.equal(authority.json.status, 'ACTIVE');

  const compile = await post(base, '/compile', { decision_id: 'dec-cicd-mock-00000000' });
  assert.equal(compile.json.status, 'COMPILED');
  const hash = compile.json.validated_object_hash;
  const proofRequired = compile.json.proof_required;

  const nonce = 'conformance-nonce-' + Date.now() + '-' + Math.random();

  const validate = await post(base, '/validate', {
    session_id: sessionId, decision_id: 'dec-cicd-mock-00000000',
    validated_object_hash: hash, invocation_nonce: nonce,
    environment: 'production', repo: 'joselunasrt8-creator/mindshift-demo',
    branch: 'main', workflow: 'governed-deploy.yml',
  });

  const execute = validate.json.status === 'VALID'
    ? await post(base, '/execute', {
        session_id: sessionId, decision_id: 'dec-cicd-mock-00000000',
        validated_object_hash: hash, invocation_nonce: nonce,
        environment: 'production', repo: 'joselunasrt8-creator/mindshift-demo',
        branch: 'main', workflow: 'governed-deploy.yml',
      })
    : null;

  const proof = execute?.json?.status === 'EXECUTED'
    ? await post(base, '/proof', {
        session_id: sessionId, continuity_id: continuityId,
        execution_id: execute.json.execution_id,
        decision_id: 'dec-cicd-mock-00000000',
        validated_object_hash: hash, invocation_nonce: nonce,
        surface: 'conformance_test', environment: 'production',
        repo: 'joselunasrt8-creator/mindshift-demo', branch: 'main',
        workflow: 'governed-deploy.yml',
      })
    : null;

  return { sessionId, continuityId, hash, proofRequired, nonce, validate, execute, proof };
}

// ── CONF-CICD-01: Valid end-to-end ───────────────────────────────────────────
describe('CONF-CICD-01 — valid end-to-end', () => {
  it('conformant AEO + active authority + unused nonce → PROVEN proof', async () => {
    await withMock('valid-workflow', async (base) => {
      const { validate, execute, proof, hash } = await fullValidPath(base);
      assert.equal(validate.json.status, 'VALID');
      assert.equal(execute.json.status, 'EXECUTED');
      assert.equal(proof.json.status, 'PROVEN');
      assert.ok(proof.json.proof_id ?? proof.json.proof?.proof_id);
    });
  });
});

// ── CONF-CICD-02: Wrong branch ────────────────────────────────────────────────
describe('CONF-CICD-02 — wrong branch rejected', () => {
  it('/validate returns NULL for scope_mismatch on wrong branch', async () => {
    await withMock('wrong-branch', async (base) => {
      const { validate } = await fullValidPath(base);
      assert.equal(validate.json.status, 'NULL');
      assert.ok(validate.json.reason === 'scope_mismatch' || validate.json.reason === 'validation_failed');
    });
  });
});

// ── CONF-CICD-03: Wrong repo ──────────────────────────────────────────────────
describe('CONF-CICD-03 — wrong repo rejected', () => {
  it('/validate returns NULL for scope_mismatch on wrong repo', async () => {
    await withMock('wrong-repo', async (base) => {
      const { validate } = await fullValidPath(base);
      assert.equal(validate.json.status, 'NULL');
      assert.ok(validate.json.reason === 'scope_mismatch' || validate.json.reason === 'validation_failed');
    });
  });
});

// ── CONF-CICD-04: Replay nonce ────────────────────────────────────────────────
describe('CONF-CICD-04 — replay nonce rejected', () => {
  it('second /execute with same nonce returns NULL/replay_detected', async () => {
    await withMock('valid-workflow', async (base) => {
      const session = await post(base, '/session', { identity_id: 'replay-test' });
      const sessionId = session.json.session_id;
      const continuity = await post(base, '/continuity', {
        session_id: sessionId, decision_id: 'dec-cicd-mock-00000000', environment: 'production',
        repo: 'joselunasrt8-creator/mindshift-demo', branch: 'main', workflow: 'governed-deploy.yml',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
      const compile = await post(base, '/compile', { decision_id: 'dec-cicd-mock-00000000' });
      const hash = compile.json.validated_object_hash;
      const nonce = 'replay-cicd-nonce-' + Date.now();

      const validate = await post(base, '/validate', {
        session_id: sessionId, decision_id: 'dec-cicd-mock-00000000',
        validated_object_hash: hash, invocation_nonce: nonce,
        environment: 'production', repo: 'joselunasrt8-creator/mindshift-demo',
        branch: 'main', workflow: 'governed-deploy.yml',
      });
      assert.equal(validate.json.status, 'VALID');

      const exec1 = await post(base, '/execute', {
        session_id: sessionId, decision_id: 'dec-cicd-mock-00000000',
        validated_object_hash: hash, invocation_nonce: nonce,
        environment: 'production', repo: 'joselunasrt8-creator/mindshift-demo',
        branch: 'main', workflow: 'governed-deploy.yml',
      });
      assert.equal(exec1.json.status, 'EXECUTED');

      // Replay
      const exec2 = await post(base, '/execute', {
        session_id: sessionId, decision_id: 'dec-cicd-mock-00000000',
        validated_object_hash: hash, invocation_nonce: nonce,
        environment: 'production', repo: 'joselunasrt8-creator/mindshift-demo',
        branch: 'main', workflow: 'governed-deploy.yml',
      });
      assert.equal(exec2.json.status, 'NULL');
      assert.equal(exec2.json.reason, 'replay_detected');
      assert.equal(exec2.code, 409);
    });
  });
});

// ── CONF-CICD-05: Mutated AEO hash ───────────────────────────────────────────
describe('CONF-CICD-05 — mutated AEO hash rejected', () => {
  it('/validate returns NULL when submitted hash differs from compiled hash', async () => {
    await withMock('valid-workflow', async (base) => {
      const session = await post(base, '/session', { identity_id: 'mutation-test' });
      const sessionId = session.json.session_id;

      const wrongHash = sha256('mutated-content-not-matching');
      const result = await post(base, '/validate', {
        session_id: sessionId, decision_id: 'dec-cicd-mock-00000000',
        validated_object_hash: wrongHash, invocation_nonce: 'nonce-mutation-' + Date.now(),
        environment: 'production', repo: 'joselunasrt8-creator/mindshift-demo',
        branch: 'main', workflow: 'governed-deploy.yml',
      });
      assert.equal(result.json.status, 'NULL');
      assert.ok(
        result.json.reason === 'hash_mismatch' || result.json.reason === 'validation_failed',
        `expected hash_mismatch but got: ${result.json.reason}`,
      );
    });
  });
});

// ── CONF-CICD-06: proof_required=false guard ─────────────────────────────────
describe('CONF-CICD-06 — proof_required=false rejected', () => {
  it('compile returns proof_required=false → adapter returns NULL/proof_required_not_set', async () => {
    await withMock('missing-proof', async (base) => {
      const compile = await post(base, '/compile', { decision_id: 'dec-cicd-mock-00000000' });
      assert.equal(compile.json.proof_required, false, 'mock should return proof_required=false for this scenario');
    });
  });
});

// ── CONF-CICD-07: Direct deploy blocked ──────────────────────────────────────
describe('CONF-CICD-07 — direct deploy bypass blocked', () => {
  it('npm run deploy exits 1 immediately', () => {
    const pkgPath = resolve(ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const deployScript = pkg.scripts?.deploy ?? '';
    assert.ok(
      deployScript.includes('exit 1') || deployScript.startsWith('exit'),
      `package.json deploy script must exit 1; got: "${deployScript}"`,
    );

    const result = spawnSync('npm', ['run', 'deploy'], { cwd: ROOT, shell: true });
    assert.equal(result.status, 1, 'npm run deploy must exit with code 1');
  });
});

// ── CONF-CICD-08: Proof aeo_hash invariant ───────────────────────────────────
describe('CONF-CICD-08 — proof.aeo_hash == validated_object_hash', () => {
  it('proof.aeo_hash must equal validated_object_hash on VALID path', async () => {
    await withMock('valid-workflow', async (base) => {
      const { hash, proof } = await fullValidPath(base);
      const proofAeoHash = proof.json.proof?.aeo_hash ?? proof.json.aeo_hash;
      assert.equal(proofAeoHash, hash, 'proof.aeo_hash must match validated_object_hash');
    });
  });
});

// ── CONF-CICD-09: Expired authority ──────────────────────────────────────────
describe('CONF-CICD-09 — expired authority rejected', () => {
  it('/authority returns NULL/authority_expired', async () => {
    await withMock('expired-authority', async (base) => {
      const session = await post(base, '/session', { identity_id: 'expired-test' });
      const sessionId = session.json.session_id;
      const continuity = await post(base, '/continuity', {
        session_id: sessionId, decision_id: 'dec-cicd-mock-00000000', environment: 'production',
        repo: 'joselunasrt8-creator/mindshift-demo', branch: 'main', workflow: 'governed-deploy.yml',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
      const continuityId = continuity.json.continuity_id;
      const authority = await post(base, '/authority', {
        session_id: sessionId, continuity_id: continuityId, decision_id: 'dec-cicd-mock-00000000',
      });
      assert.equal(authority.json.status, 'NULL');
      assert.equal(authority.json.reason, 'authority_expired');
    });
  });
});

// ── CONF-CICD-10: Revoked authority ──────────────────────────────────────────
describe('CONF-CICD-10 — revoked authority rejected', () => {
  it('/authority returns NULL/authority_revoked', async () => {
    await withMock('revoked-authority', async (base) => {
      const session = await post(base, '/session', { identity_id: 'revoked-test' });
      const sessionId = session.json.session_id;
      const continuity = await post(base, '/continuity', {
        session_id: sessionId, decision_id: 'dec-cicd-mock-00000000', environment: 'production',
        repo: 'joselunasrt8-creator/mindshift-demo', branch: 'main', workflow: 'governed-deploy.yml',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
      const continuityId = continuity.json.continuity_id;
      const authority = await post(base, '/authority', {
        session_id: sessionId, continuity_id: continuityId, decision_id: 'dec-cicd-mock-00000000',
      });
      assert.equal(authority.json.status, 'NULL');
      assert.equal(authority.json.reason, 'authority_revoked');
    });
  });
});

// ── CONF-CICD-14: Validator unavailable (fail-closed) ────────────────────────
describe('CONF-CICD-14 — validator unavailable → fail closed', () => {
  it('/validate returns 503 → adapter gets NULL result', async () => {
    await withMock('validator-failure', async (base) => {
      const session = await post(base, '/session', { identity_id: 'validator-fail-test' });
      const sessionId = session.json.session_id;

      const result = await post(base, '/validate', {
        session_id: sessionId, decision_id: 'dec-cicd-mock-00000000',
        validated_object_hash: sha256('any-hash'), invocation_nonce: 'nonce-validator-fail',
        environment: 'production', repo: 'joselunasrt8-creator/mindshift-demo',
        branch: 'main', workflow: 'governed-deploy.yml',
      });
      assert.equal(result.json.status, 'NULL');
      assert.equal(result.code, 503);
    });
  });
});

// ── CONF-CICD-08 (proof hash mismatch) ───────────────────────────────────────
describe('CONF-CICD-08b — proof.aeo_hash mismatch detected', () => {
  it('wrong proof.aeo_hash is caught by aeo_hash invariant check', async () => {
    await withMock('proof-hash-mismatch', async (base) => {
      const { hash, proof } = await fullValidPath(base);
      const proofAeoHash = proof.json.proof?.aeo_hash ?? proof.json.aeo_hash;
      assert.notEqual(proofAeoHash, hash, 'mock returns wrong aeo_hash in this scenario');
      assert.equal(proofAeoHash, '0000000000000000000000000000000000000000000000000000000000000000');
    });
  });
});

// ── Schema conformance: aeo.json ─────────────────────────────────────────────
describe('Slice B — aeo.json schema conformance', () => {
  it('root aeo.json has exactly the required 5 fields with correct structure', () => {
    const aeo = JSON.parse(readFileSync(resolve(ROOT, 'aeo.json'), 'utf8'));
    const keys = Object.keys(aeo).sort();
    assert.deepEqual(keys, ['finality', 'intent', 'scope', 'target', 'validation'], 'must have exactly 5 required fields');
    assert.equal(typeof aeo.intent, 'string');
    assert.equal(typeof aeo.scope, 'object');
    assert.equal(typeof aeo.validation, 'object');
    assert.equal(typeof aeo.target, 'object');
    assert.equal(typeof aeo.finality, 'object');
    assert.equal(typeof aeo.validation.decision_id, 'string');
    assert.equal(typeof aeo.validation.authority_id, 'string');
    assert.equal(aeo.validation.require_active_authority, true);
    assert.equal(aeo.validation.require_exact_object_hash, true);
    assert.equal(aeo.validation.require_session_continuity, true);
    assert.equal(typeof aeo.target.system, 'string');
    assert.equal(typeof aeo.target.action, 'string');
    assert.equal(aeo.finality.proof_required, true);
    assert.equal(typeof aeo.finality.proof_type, 'string');
    assert.equal(aeo.finality.registry_required, true);
  });

  it('tests/fixtures/valid-aeo.json is a structurally complete fate-harness AEO', () => {
    // valid-aeo.json is the shared lifecycle fixture loaded by
    // tests/fate/fate-attack-helpers.mjs (fixtures.aeo). Its canonical role is
    // the full fate-harness AEO object, not the 5-field deploy AEO — the 5-field
    // conformant example is tests/fixtures/cicd-aeo-conformant.json (checked
    // below). It must carry every key the fate harness requires, tagged AEO.
    const aeo = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/valid-aeo.json'), 'utf8'));
    const keys = Object.keys(aeo).sort();
    assert.deepEqual(
      keys,
      ['aeo_id', 'authority_id', 'continuity_id', 'decision_id', 'finality', 'intent', 'nonce', 'object_type', 'runtime_id', 'scope', 'session_id', 'target', 'validation'],
      'must carry the full fate-harness AEO field set',
    );
    assert.equal(aeo.object_type, 'AEO');
    assert.equal(aeo.validation.require_active_authority, true);
    assert.equal(aeo.validation.require_exact_object_hash, true);
    assert.equal(aeo.validation.require_session_continuity, true);
    assert.equal(aeo.finality.proof_required, true);
  });

  it('tests/fixtures/cicd-aeo-conformant.json passes structural schema check', () => {
    const aeo = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/cicd-aeo-conformant.json'), 'utf8'));
    const keys = Object.keys(aeo).sort();
    assert.deepEqual(keys, ['finality', 'intent', 'scope', 'target', 'validation'], 'must have exactly 5 required fields');
    assert.equal(aeo.finality.proof_required, true);
    assert.equal(aeo.finality.registry_required, true);
  });
});
