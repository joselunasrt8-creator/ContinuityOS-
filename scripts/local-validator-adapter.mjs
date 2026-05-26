#!/usr/bin/env node
/**
 * CLI adapter for the local validator mock.
 * Starts the mock server, runs a validation sequence, and returns a structured result.
 *
 * Usage:
 *   node scripts/local-validator-adapter.mjs --scenario valid-workflow [--timeout-ms 5000]
 *
 * Output (stdout, JSON):
 *   { "validation_result": "VALID"|"NULL", "reason": string|null, "error_code": string|null }
 *
 * Exit codes:
 *   0 — result determined (VALID or NULL); check validation_result field
 *   1 — adapter error (fail-closed)
 *
 * Invariant: any adapter error → NULL output, exit 1. Never silently VALID on error.
 */

import { startMockServer } from '../tests/validator-mock/server.mjs';

const args = process.argv.slice(2);

function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
}

const scenario = getArg('--scenario', process.env.VALIDATOR_MOCK_SCENARIO ?? 'valid-workflow');
const timeoutMs = parseInt(getArg('--timeout-ms', '5000'), 10);

process.env.VALIDATOR_MOCK_TIMEOUT_MS = String(timeoutMs);

function failClosed(reason, errorCode) {
  process.stdout.write(JSON.stringify({ validation_result: 'NULL', reason, error_code: errorCode }) + '\n');
  process.exit(1);
}

async function fetchJson(url, body, timeoutOverride) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutOverride ?? timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'mock-key' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json();
    return { code: res.status, json };
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('request_timeout');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  let server, port;
  try {
    ({ server, port } = await startMockServer(0, scenario));
  } catch (err) {
    failClosed('mock_server_start_failed', 'ADAPTER_ERROR');
  }

  const base = `http://127.0.0.1:${port}`;

  async function call(path, body) {
    try {
      return await fetchJson(`${base}${path}`, body);
    } catch (err) {
      server.close();
      failClosed(err.message ?? 'fetch_failed', 'ADAPTER_FETCH_ERROR');
    }
  }

  try {
    // /session
    const session = await call('/session', { identity_id: 'local-validator-adapter' });
    if (session.code < 200 || session.code > 299 || session.json.status !== 'SESSION_ACTIVE') {
      server.close();
      process.stdout.write(JSON.stringify({ validation_result: 'NULL', reason: session.json.reason ?? 'session_failed', error_code: 'NULL_SESSION' }) + '\n');
      return;
    }
    const sessionId = session.json.session_id;

    // /continuity
    const continuity = await call('/continuity', {
      session_id: sessionId,
      decision_id: 'dec-cicd-mock-00000000',
      environment: 'production',
      repo: 'joselunasrt8-creator/mindshift-demo',
      branch: 'main',
      workflow: 'governed-deploy.yml',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    if (continuity.code < 200 || continuity.code > 299 || continuity.json.status !== 'CONTINUITY_ACTIVE') {
      server.close();
      process.stdout.write(JSON.stringify({ validation_result: 'NULL', reason: continuity.json.reason ?? 'continuity_failed', error_code: 'NULL_CONTINUITY' }) + '\n');
      return;
    }
    const continuityId = continuity.json.continuity_id;

    // /authority
    const authority = await call('/authority', {
      session_id: sessionId,
      continuity_id: continuityId,
      decision_id: 'dec-cicd-mock-00000000',
    });
    if (authority.code < 200 || authority.code > 299 || authority.json.status !== 'ACTIVE') {
      server.close();
      process.stdout.write(JSON.stringify({ validation_result: 'NULL', reason: authority.json.reason ?? 'authority_failed', error_code: 'NULL_AUTHORITY' }) + '\n');
      return;
    }

    // /compile
    const compile = await call('/compile', { decision_id: 'dec-cicd-mock-00000000' });
    if (compile.code < 200 || compile.code > 299 || compile.json.status !== 'COMPILED') {
      server.close();
      process.stdout.write(JSON.stringify({ validation_result: 'NULL', reason: compile.json.reason ?? 'compile_failed', error_code: 'NULL_COMPILE' }) + '\n');
      return;
    }
    const validatedObjectHash = compile.json.validated_object_hash;
    const proofRequired = compile.json.proof_required;

    if (!proofRequired) {
      server.close();
      process.stdout.write(JSON.stringify({ validation_result: 'NULL', reason: 'proof_required_not_set', error_code: 'NULL_PROOF_GUARD' }) + '\n');
      return;
    }

    // /validate
    const validate = await call('/validate', {
      session_id: sessionId,
      decision_id: 'dec-cicd-mock-00000000',
      validated_object_hash: validatedObjectHash,
      invocation_nonce: 'mock-nonce-adapter-' + Date.now(),
      environment: 'production',
      repo: 'joselunasrt8-creator/mindshift-demo',
      branch: 'main',
      workflow: 'governed-deploy.yml',
    });
    if (validate.code < 200 || validate.code > 299 || validate.json.status !== 'VALID') {
      server.close();
      process.stdout.write(JSON.stringify({ validation_result: 'NULL', reason: validate.json.reason ?? 'validation_failed', error_code: 'NULL_VALIDATE' }) + '\n');
      return;
    }
    const invocationNonce = validate.json.invocation_nonce;

    // /execute
    const execute = await call('/execute', {
      session_id: sessionId,
      decision_id: 'dec-cicd-mock-00000000',
      validated_object_hash: validatedObjectHash,
      invocation_nonce: invocationNonce,
      environment: 'production',
      repo: 'joselunasrt8-creator/mindshift-demo',
      branch: 'main',
      workflow: 'governed-deploy.yml',
    });
    if (execute.code < 200 || execute.code > 299 || execute.json.status !== 'EXECUTED') {
      server.close();
      process.stdout.write(JSON.stringify({ validation_result: 'NULL', reason: execute.json.reason ?? 'execute_failed', error_code: 'NULL_EXECUTE' }) + '\n');
      return;
    }
    const executionId = execute.json.execution_id;

    // /proof
    const proof = await call('/proof', {
      session_id: sessionId,
      continuity_id: continuityId,
      execution_id: executionId,
      decision_id: 'dec-cicd-mock-00000000',
      validated_object_hash: validatedObjectHash,
      invocation_nonce: invocationNonce,
      surface: 'local_validator_adapter',
      environment: 'production',
      repo: 'joselunasrt8-creator/mindshift-demo',
      branch: 'main',
      workflow: 'governed-deploy.yml',
    });
    if (proof.code < 200 || proof.code > 299 || proof.json.status !== 'PROVEN') {
      server.close();
      process.stdout.write(JSON.stringify({ validation_result: 'NULL', reason: proof.json.reason ?? 'proof_failed', error_code: 'NULL_PROOF' }) + '\n');
      return;
    }

    const proofAeoHash = proof.json.proof?.aeo_hash ?? proof.json.aeo_hash;
    if (!proofAeoHash || proofAeoHash !== validatedObjectHash) {
      server.close();
      process.stdout.write(JSON.stringify({ validation_result: 'NULL', reason: 'proof_hash_mismatch', error_code: 'NULL_PROOF_HASH' }) + '\n');
      return;
    }

    server.close();
    process.stdout.write(JSON.stringify({ validation_result: 'VALID', reason: null, error_code: null, proof_id: proof.json.proof_id ?? proof.json.proof?.proof_id }) + '\n');
  } catch (err) {
    server?.close();
    failClosed(err.message ?? 'unexpected_error', 'ADAPTER_RUNTIME_ERROR');
  }
}

run();
