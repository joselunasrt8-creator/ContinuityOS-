/**
 * Local validator mock server for governed CI/CD conformance testing.
 * Mounts all Worker endpoints used by governed-deploy.yml.
 * Fail-closed: unknown scenario or missing fields → NULL, never silent VALID.
 *
 * Each call to startMockServer creates an isolated instance with its own state,
 * so parallel tests do not share nonce registries or counters.
 */

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const DEFAULT_PORT = parseInt(process.env.VALIDATOR_MOCK_PORT ?? '0', 10);
const DEFAULT_TIMEOUT_MS = parseInt(process.env.VALIDATOR_MOCK_TIMEOUT_MS ?? '5000', 10);

export const MOCK_DECISION_ID = 'dec-cicd-mock-00000000';
export const MOCK_AEO_CONTENT = 'mock-canonical-aeo-governed-deploy';

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

function readBody(req, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => reject(new Error('request_timeout')), timeoutMs);
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      clearTimeout(timer);
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {});
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function send(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function nullResponse(reason) {
  return { status: 'NULL', result: 'INVALID', reason };
}

// Scenario definitions — each maps to a deterministic NULL or VALID path.
const SCENARIOS = {
  'valid-workflow':      { validPath: true,  proofRequired: true },
  'wrong-branch':        { validPath: false, nullReason: 'scope_mismatch',        failAt: 'validate' },
  'wrong-repo':          { validPath: false, nullReason: 'scope_mismatch',        failAt: 'validate' },
  'replayed-nonce':      { validPath: false, nullReason: 'replay_detected',       failAt: 'execute',   preConsumed: true },
  'mutated-aeo':         { validPath: false, nullReason: 'hash_mismatch',         failAt: 'validate' },
  'missing-proof':       { validPath: true,  proofRequired: false },
  'validator-failure':   { validPath: false, nullReason: 'validator_unavailable', failAt: 'validate',  httpCode: 503 },
  'proof-hash-mismatch': { validPath: true,  proofRequired: true, wrongProofHash: true },
  'expired-authority':   { validPath: false, nullReason: 'authority_expired',     failAt: 'authority' },
  'revoked-authority':   { validPath: false, nullReason: 'authority_revoked',     failAt: 'authority' },
  'missing-decision-id': { validPath: false, nullReason: 'missing_variable',      failAt: 'validate' },
};

function resolveScenario(nameOrConfig) {
  if (nameOrConfig && typeof nameOrConfig === 'object') return nameOrConfig;
  const name = nameOrConfig ?? process.env.VALIDATOR_MOCK_SCENARIO ?? 'valid-workflow';
  const s = SCENARIOS[name];
  if (!s) {
    console.error(`NULL — Unknown mock scenario: ${name}`);
    process.exit(1);
  }
  return s;
}

export function startMockServer(port = DEFAULT_PORT, scenarioNameOrConfig = null) {
  const scenario = resolveScenario(scenarioNameOrConfig);
  const mockAeoHash = sha256(MOCK_AEO_CONTENT);
  const timeoutMs = DEFAULT_TIMEOUT_MS;

  // Isolated per-instance state
  let sessionCounter = 0;
  let continuityCounter = 0;
  let executionCounter = 0;
  let proofCounter = 0;
  let authorityCounter = 0;
  const consumedNonces = new Set();

  if (scenario.preConsumed) {
    consumedNonces.add(`${MOCK_DECISION_ID}:${mockAeoHash}:nonce-fixture-replayed-00000004`);
  }

  const routes = {
    '/session': (_body) => {
      if (scenario.failAt === 'session') return [503, nullResponse('session_unavailable')];
      sessionCounter++;
      return [200, { status: 'SESSION_ACTIVE', session_id: `session-mock-${sessionCounter}` }];
    },

    '/continuity': (_body) => {
      if (scenario.failAt === 'continuity') return [503, nullResponse('continuity_unavailable')];
      continuityCounter++;
      return [200, {
        status: 'CONTINUITY_ACTIVE',
        continuity_id: `continuity-mock-${continuityCounter}`,
        continuity_hash: sha256(`continuity-${continuityCounter}`).slice(0, 64),
      }];
    },

    '/authority': (_body) => {
      if (scenario.failAt === 'authority') {
        return [scenario.httpCode ?? 400, nullResponse(scenario.nullReason ?? 'authority_error')];
      }
      authorityCounter++;
      return [200, {
        status: 'ACTIVE',
        decision_id: _body.decision_id ?? MOCK_DECISION_ID,
        continuity_id: _body.continuity_id ?? 'continuity-mock-0',
        authority_id: `auth-mock-${authorityCounter}`,
        expiry: new Date(Date.now() + 3600000).toISOString(),
      }];
    },

    '/compile': (_body) => {
      if (scenario.failAt === 'compile') {
        return [scenario.httpCode ?? 503, nullResponse(scenario.nullReason ?? 'compile_error')];
      }
      return [200, {
        status: 'COMPILED',
        validated_object_hash: mockAeoHash,
        decision_id: _body.decision_id ?? MOCK_DECISION_ID,
        proof_required: scenario.proofRequired !== false,
      }];
    },

    '/validate': (body) => {
      if (scenario.failAt === 'validate') {
        return [scenario.httpCode ?? 400, nullResponse(scenario.nullReason ?? 'validation_failed')];
      }
      const provided = body.validated_object_hash;
      if (provided && provided !== mockAeoHash) {
        return [400, nullResponse('hash_mismatch')];
      }
      return [200, {
        status: 'VALID',
        result: 'VALID',
        decision_id: body.decision_id ?? MOCK_DECISION_ID,
        validated_object_hash: mockAeoHash,
        invocation_nonce: body.invocation_nonce ?? 'mock-nonce',
      }];
    },

    '/execute': (body) => {
      const nonce = body.invocation_nonce ?? 'mock-nonce';
      const key = `${body.decision_id ?? MOCK_DECISION_ID}:${mockAeoHash}:${nonce}`;
      if (consumedNonces.has(key)) {
        return [409, nullResponse('replay_detected')];
      }
      if (scenario.failAt === 'execute') {
        return [409, nullResponse(scenario.nullReason ?? 'execute_error')];
      }
      consumedNonces.add(key);
      executionCounter++;
      return [200, {
        status: 'EXECUTED',
        execution_id: `execution-mock-${executionCounter}`,
        decision_id: body.decision_id ?? MOCK_DECISION_ID,
      }];
    },

    '/proof': (body) => {
      if (scenario.failAt === 'proof') {
        return [scenario.httpCode ?? 500, nullResponse(scenario.nullReason ?? 'proof_error')];
      }
      proofCounter++;
      const aeoHash = scenario.wrongProofHash
        ? '0000000000000000000000000000000000000000000000000000000000000000'
        : mockAeoHash;

      const proofId = `proof-mock-${proofCounter}`;
      return [200, {
        status: 'PROVEN',
        proof_id: proofId,
        proof: {
          proof_id: proofId,
          execution_id: body.execution_id ?? 'execution-mock-0',
          decision_id: body.decision_id ?? MOCK_DECISION_ID,
          authority_id: 'auth-mock-0',
          aeo_hash: aeoHash,
          target_system: 'cloudflare_worker',
          target_action: 'wrangler_deploy',
          result: 'success',
          timestamp: new Date().toISOString(),
          run_id: body.run_id ?? 'mock-run-id',
          commit_sha: body.commit_sha ?? 'mock-sha',
          workflow: body.workflow ?? 'governed-deploy.yml',
          proof_reference: {
            run_id: body.run_id ?? 'mock-run-id',
            commit_sha: body.commit_sha ?? 'mock-sha',
            workflow: body.workflow ?? 'governed-deploy.yml',
            environment: body.environment ?? 'production',
            repo: body.repo ?? 'joselunasrt8-creator/mindshift-demo',
            branch: body.branch ?? 'main',
          },
          continuity_id: body.continuity_id ?? 'continuity-mock-0',
          continuity_hash: sha256('continuity-0').slice(0, 64),
          identity_id: 'github_actions:mock:mock-run-id',
          session_id: body.session_id ?? 'session-mock-0',
          authority_lineage: {
            decision_id: body.decision_id ?? MOCK_DECISION_ID,
            continuity_id: body.continuity_id ?? 'continuity-mock-0',
            session_id: body.session_id ?? 'session-mock-0',
          },
          execution_lineage: {
            execution_id: body.execution_id ?? 'execution-mock-0',
            validated_object_hash: mockAeoHash,
            invocation_nonce: body.invocation_nonce ?? 'mock-nonce',
            workflow_run_id: body.run_id ?? 'mock-run-id',
            workflow_sha: body.commit_sha ?? 'mock-sha',
          },
        },
      }];
    },
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const handler = routes[url.pathname];
    if (!handler) return send(res, 404, { error: 'not_found', path: url.pathname });

    let body;
    try {
      body = await readBody(req, timeoutMs);
    } catch {
      return send(res, 400, nullResponse('request_timeout_or_invalid'));
    }

    try {
      const [code, responseBody] = handler(body);
      send(res, code, responseBody);
    } catch {
      send(res, 500, nullResponse('internal_mock_error'));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, port: server.address().port, mockAeoHash });
    });
  });
}

// Allow running directly as a CLI: node tests/validator-mock/server.mjs
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const scenario = process.env.VALIDATOR_MOCK_SCENARIO ?? 'valid-workflow';
  const { port: listenPort } = await startMockServer(DEFAULT_PORT, scenario);
  process.stdout.write(`VALIDATOR_MOCK_URL=http://127.0.0.1:${listenPort}\n`);
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}
