// Issue #1890: Enforce first runtime Agent Tool Gateway action — filesystem write.
//
// Scope: the live HTTP route (POST /gateway/tool/filesystem-write,
// handleAgentToolGatewayFilesystemWrite in src/index.ts) — the actual runtime
// wiring that forces every filesystem-write request through
// runFilesystemWriteGatewayAction before any mutation can occur.
//
// This is the route-level counterpart to
// tests/issue-1890-filesystem-write-runtime-gateway.test.mjs (which proves the
// composed chain itself is the gate). Here we prove the runtime actually wires
// real requests through that chain end to end:
//   - a governed write request mutates the D1-backed virtual filesystem
//     (governed_filesystem_object_registry) and emits a proof
//   - a denied / malformed / replayed request returns NULL, never mutates the
//     registry, and never persists a proof

import test from 'node:test'
import assert from 'node:assert/strict'
import { importWorker } from './helpers/import-worker.mjs'

let _worker
async function getWorker() {
  if (!_worker) _worker = (await importWorker()).default
  return _worker
}

const ROUTE = '/gateway/tool/filesystem-write'
const SEED_PATH = 'governed/filesystem-write-gateway/seed.md'
const DECISION_ID = 'AUTH-filesystem-write-gateway-001'

function post(payload) {
  return new Request(`https://runtime.test${ROUTE}`, {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function makeRequestBody(overrides = {}) {
  return {
    agent_id: 'agent-001',
    session_id: 'session-001',
    intent: 'update the governed seed file',
    path: SEED_PATH,
    content: 'Updated content from a governed agent write.\n',
    replay_nonce: `nonce-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  }
}

// ── In-memory D1 mock ─────────────────────────────────────────────────────────
// Mirrors exactly the registries handleAgentToolGatewayFilesystemWrite and
// ensureFilesystemWriteGatewayRegistry read and write — no more. The gateway
// routes return before ensureSchema()/sovereignty checks run (see
// src/index.ts ~8096-8118), so nothing else needs to be modeled.

function makeFilesystemGatewayEnv() {
  const decisionRegistry = new Map()
  const nonceRegistry = new Map()
  const objectRegistry = new Map()
  const proofRegistry = new Map()
  const writes = []

  const env = {
    API_KEY: 'test-key',
    decisionRegistry,
    nonceRegistry,
    objectRegistry,
    proofRegistry,
    writes,
    DB: {
      prepare(sql) {
        const stmt = {
          args: [],
          bind(...args) { this.args = args; return this },
          async run() {
            writes.push({ sql, args: this.args })

            if (/^\s*CREATE /i.test(sql)) return { meta: { changes: 0 } }

            if (sql.includes('INSERT OR IGNORE INTO governed_filesystem_write_decision_registry')) {
              const [decision_id, authority_lineage_hash, created_at] = this.args
              if (!decisionRegistry.has(decision_id)) {
                decisionRegistry.set(decision_id, { decision_id, status: 'ACTIVE', authority_lineage_hash, scope: 'repository', expires_at: null, created_at })
              }
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT OR IGNORE INTO governed_filesystem_object_registry')) {
              const [path, content, content_hash, bytes_written, updated_at] = this.args
              if (!objectRegistry.has(path)) {
                objectRegistry.set(path, { path, content, content_hash, bytes_written, updated_at })
              }
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_object_registry') && sql.includes('ON CONFLICT(path) DO UPDATE')) {
              const [path, content, content_hash, bytes_written, updated_at] = this.args
              objectRegistry.set(path, { path, content, content_hash, bytes_written, updated_at })
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_write_nonce_registry') && sql.includes('ON CONFLICT(replay_nonce) DO UPDATE')) {
              const [replay_nonce, decision_id, created_at, consumed_at] = this.args
              const existing = nonceRegistry.get(replay_nonce)
              nonceRegistry.set(replay_nonce, { replay_nonce, decision_id, state: 'CONSUMED', created_at: existing ? existing.created_at : created_at, consumed_at })
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_write_proof_registry')) {
              const [proof_id] = this.args
              proofRegistry.set(proof_id, this.args)
              return { meta: { changes: 1 } }
            }

            return { meta: { changes: 1 } }
          },
          async first() {
            if (sql.includes('FROM governed_filesystem_write_decision_registry')) {
              const [decision_id] = this.args
              return decisionRegistry.get(decision_id) ?? null
            }
            if (sql.includes('FROM governed_filesystem_write_nonce_registry')) {
              const [replay_nonce] = this.args
              return nonceRegistry.get(replay_nonce) ?? null
            }
            if (sql.includes('FROM governed_filesystem_object_registry')) {
              const [path] = this.args
              return objectRegistry.get(path) ?? null
            }
            return null
          },
          async all() { return { results: [] } },
        }
        return stmt
      },
    },
  }
  return env
}

// ── Valid governed write: mutates the registry and emits proof ───────────────

test('ROUTE-01 a well-formed governed write executes, mutates the virtual filesystem, and emits proof', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const body = makeRequestBody()
  const res = await worker.fetch(post(body), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  assert.equal(out.result, 'EXECUTED')
  assert.notEqual(out.receipt, null)
  assert.equal(out.receipt.execution_result, 'EXECUTED')
  assert.equal(out.receipt.validated_object_hash, out.receipt.executed_object_hash)
  assert.match(out.receipt.validated_object_hash, /^sha256:[0-9a-f]{64}$/)
  assert.match(out.receipt.receipt_id, /^sha256:[0-9a-f]{64}$/)
  assert.equal(out.target_path, SEED_PATH)
  assert.equal(out.receipt.adapter_surface, 'filesystem')
  assert.strictEqual(out.receipt.creates_authority, false)

  // The real side effect: the virtual filesystem object was actually mutated —
  // and with exactly the content the agent proposed and the chain validated.
  const stored = env.objectRegistry.get(SEED_PATH)
  assert.ok(stored, 'governed_filesystem_object_registry must contain the written object')
  assert.equal(stored.content, body.content)

  // The replay nonce was consumed and the proof persisted — both are
  // consequences of EXECUTED, not preconditions an attacker could fabricate.
  const nonceRow = env.nonceRegistry.get(body.replay_nonce)
  assert.ok(nonceRow)
  assert.equal(nonceRow.state, 'CONSUMED')
  assert.equal(env.proofRegistry.size, 1)
})

// ── Replay: a consumed nonce cannot execute a second time ────────────────────

test('ROUTE-02 replaying the same nonce is denied at validate and does not mutate the registry again', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const body = makeRequestBody({ content: 'first governed write\n' })
  const first = await worker.fetch(post(body), env)
  assert.equal((await first.json()).status, 'EXECUTED')

  const beforeReplay = env.objectRegistry.get(SEED_PATH).content

  const replayBody = { ...body, content: 'a replay attempt trying to overwrite with different content\n' }
  const replay = await worker.fetch(post(replayBody), env)
  const out = await replay.json()

  assert.equal(out.status, 'NULL')
  assert.equal(out.result, 'NULL')
  assert.equal(out.stage, 'validate')
  assert.notEqual(out.validator_denial, null)
  assert.equal(out.validator_denial.failure_class, 'REPLAY_NONCE_CONSUMED_OR_RESERVED')

  // The registry must be untouched by the replay — same content as after the
  // first (legitimate) execution, not the replay's payload.
  assert.equal(env.objectRegistry.get(SEED_PATH).content, beforeReplay)
  assert.equal(env.proofRegistry.size, 1, 'no second proof may be persisted for a replayed nonce')
})

// ── Denied path: cannot be smuggled through the live route ───────────────────

test('ROUTE-03 a write outside the governed policy paths is denied at validate and never mutates the registry', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const body = makeRequestBody({ path: 'wrangler.toml', content: 'malicious overwrite attempt\n' })
  const res = await worker.fetch(post(body), env)
  const out = await res.json()

  assert.equal(out.status, 'NULL')
  assert.equal(out.stage, 'validate')
  assert.notEqual(out.validator_denial, null)
  assert.equal(out.validator_denial.failure_class, 'PATH_NOT_ALLOWED')
  assert.equal(out.receipt, null)
  assert.equal(env.objectRegistry.has('wrangler.toml'), false, 'denied path must never be written to the virtual filesystem')
  assert.equal(env.proofRegistry.size, 0)
})

// ── Malformed / bypass requests ───────────────────────────────────────────────

test('ROUTE-04 a malformed request is rejected at capture before any chain stage runs', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const res = await worker.fetch(post({ agent_id: '', session_id: '', intent: '', path: '', replay_nonce: '' }), env)
  const out = await res.json()

  assert.equal(out.status, 'NULL')
  assert.equal(out.stage, 'capture')
  assert.equal(out.reason, 'missing_required_fields')
  assert.equal(env.objectRegistry.size <= 1, true, 'only the seed object may exist — request must not have mutated anything')
  assert.equal(env.proofRegistry.size, 0)
})

test('ROUTE-05 an unknown decision_id is rejected and never reaches execution', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const body = makeRequestBody({ decision_id: 'AUTH-does-not-exist' })
  const res = await worker.fetch(post(body), env)
  const out = await res.json()

  assert.equal(out.status, 'NULL')
  assert.equal(out.reason, 'decision_not_found')
  assert.equal(out.proof, undefined)
  assert.equal(env.proofRegistry.size, 0)
})

test('ROUTE-06 unauthorized requests are rejected before reaching the gateway handler', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const res = await worker.fetch(new Request(`https://runtime.test${ROUTE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(makeRequestBody()),
  }), env)
  assert.equal(res.status, 403)
  const out = await res.json()
  assert.equal(out.status, 'NULL')
  assert.equal(out.reason, 'unauthorized')
  assert.equal(env.proofRegistry.size, 0)
})

// ── Surface declaration: the route is now classified as a real execution surface ──

test('ROUTE-07 the filesystem-write surface is declared mutation- and execution-capable, proof-generating, with no bypass', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()
  // Decision lookup miss is enough to exercise the route without mutating state —
  // we only need the response envelope's structural flags here.
  const body = makeRequestBody({ decision_id: 'AUTH-does-not-exist' })
  const res = await worker.fetch(post(body), env)
  const out = await res.json()

  assert.equal(out.route, ROUTE)
  assert.equal(out.mutation_capability, true)
  assert.equal(out.execution_capability, true)
  assert.equal(out.proof_generating, true)
  assert.equal(out.creates_authority, false)
})
