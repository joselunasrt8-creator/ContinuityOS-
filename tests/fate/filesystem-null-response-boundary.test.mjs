// Bounded NULL Response + Correlation ID Audit Binding (Governed Filesystem Write).
//
// The agent-visible NULL response from /gateway/tool/filesystem-write must be
// minimal and non-enumerating: { result, execution_performed, proof_emitted,
// correlation_id }. No stage, reason, validator_denial, receipt, or reason_class
// may be exposed to the agent. The full diagnostic detail (including reason_class)
// is recorded only in governed_filesystem_write_null_audit_registry, resolvable
// by an operator via correlation_id.
//
// This is the leak-guard counterpart to
// tests/issue-1890-filesystem-write-gateway-route.test.mjs.

import test from 'node:test'
import assert from 'node:assert/strict'
import { importWorker } from '../helpers/import-worker.mjs'

let _worker
async function getWorker() {
  if (!_worker) _worker = (await importWorker()).default
  return _worker
}

const ROUTE = '/gateway/tool/filesystem-write'
const SEED_PATH = 'governed/filesystem-write-gateway/seed.md'

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

const NULL_AGENT_VISIBLE_FIELDS = ['result', 'execution_performed', 'proof_emitted', 'correlation_id']
const LEAKED_FIELDS = ['stage', 'reason', 'validator_denial', 'receipt', 'reason_class', 'status']

function assertBoundedNull(out) {
  assert.equal(out.result, 'NULL')
  assert.equal(out.execution_performed, false)
  assert.equal(out.proof_emitted, false)
  assert.match(out.correlation_id, /^null_evt_[0-9a-f]{32}$/)
  for (const field of LEAKED_FIELDS) {
    assert.equal(out[field], undefined, `NULL response must not expose "${field}"`)
  }
}

// ── In-memory D1 mock ─────────────────────────────────────────────────────────
// Mirrors the registries the route reads/writes, including the new
// governed_filesystem_write_null_audit_registry.

function makeFilesystemGatewayEnv() {
  const decisionRegistry = new Map()
  const nonceRegistry = new Map()
  const objectRegistry = new Map()
  const proofRegistry = new Map()
  const lineageRegistry = new Map()
  const nullAuditRegistry = new Map()

  const env = {
    API_KEY: 'test-key',
    decisionRegistry,
    nonceRegistry,
    objectRegistry,
    proofRegistry,
    lineageRegistry,
    nullAuditRegistry,
    DB: {
      prepare(sql) {
        const stmt = {
          args: [],
          bind(...args) { this.args = args; return this },
          async run() {
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

            if (sql.includes('INSERT INTO governed_filesystem_write_lineage_registry')) {
              const [node_id] = this.args
              if (!lineageRegistry.has(node_id)) lineageRegistry.set(node_id, this.args)
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_write_null_audit_registry')) {
              const [
                correlation_id, reason_class, stage, denial_reason, agent_id, session_id,
                atao_id, canonical_aeo_hash, decision_id, replay_nonce, validator_version,
                _execution_performed, _proof_emitted, created_at,
              ] = this.args
              if (nullAuditRegistry.has(correlation_id)) return { meta: { changes: 0 } }
              nullAuditRegistry.set(correlation_id, {
                correlation_id, reason_class, stage, denial_reason, agent_id, session_id,
                atao_id, canonical_aeo_hash, decision_id, replay_nonce, validator_version,
                execution_performed: 0, proof_emitted: 0, created_at,
              })
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

// ── Bounded NULL shape ────────────────────────────────────────────────────────

test('NULL-01 missing required fields produce a bounded NULL response with audit record', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const res = await worker.fetch(post({ agent_id: '', session_id: '', intent: '', path: '', replay_nonce: '' }), env)
  const out = await res.json()

  assertBoundedNull(out)

  const auditRow = env.nullAuditRegistry.get(out.correlation_id)
  assert.ok(auditRow, 'a NULL audit record must exist for the correlation_id')
  assert.equal(auditRow.stage, 'capture')
  assert.equal(auditRow.denial_reason, 'missing_required_fields')
  assert.equal(auditRow.execution_performed, 0)
  assert.equal(auditRow.proof_emitted, 0)
})

test('NULL-02 a reused replay nonce is classified REPLAY_NULL internally but bounded externally', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const body = makeRequestBody({ content: 'first governed write\n' })
  const first = await worker.fetch(post(body), env)
  assert.equal((await first.json()).result, 'EXECUTED')

  const replay = await worker.fetch(post({ ...body, content: 'replay attempt\n' }), env)
  const out = await replay.json()

  assertBoundedNull(out)

  const auditRow = env.nullAuditRegistry.get(out.correlation_id)
  assert.ok(auditRow)
  assert.equal(auditRow.reason_class, 'REPLAY_NULL')
})

test('NULL-03 a write outside the governed policy paths is classified POLICY_NULL internally but bounded externally', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const body = makeRequestBody({ path: 'wrangler.toml', content: 'malicious overwrite attempt\n' })
  const res = await worker.fetch(post(body), env)
  const out = await res.json()

  assertBoundedNull(out)

  const auditRow = env.nullAuditRegistry.get(out.correlation_id)
  assert.ok(auditRow)
  assert.equal(auditRow.reason_class, 'POLICY_NULL')
})

test('NULL-04 an unknown decision_id is bounded externally with a POLICY_NULL audit record', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const body = makeRequestBody({ decision_id: 'AUTH-does-not-exist' })
  const res = await worker.fetch(post(body), env)
  const out = await res.json()

  assertBoundedNull(out)

  const auditRow = env.nullAuditRegistry.get(out.correlation_id)
  assert.ok(auditRow)
  assert.equal(auditRow.denial_reason, 'decision_not_found')
  assert.equal(auditRow.reason_class, 'POLICY_NULL')
})

// ── Correlation ID uniqueness ────────────────────────────────────────────────

test('NULL-05 two NULL requests produce two distinct, non-sequential correlation_ids', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const bodyA = makeRequestBody({ path: 'wrangler.toml', content: 'attempt A\n' })
  const bodyB = makeRequestBody({ path: 'wrangler.toml', content: 'attempt B\n' })

  const outA = await (await worker.fetch(post(bodyA), env)).json()
  const outB = await (await worker.fetch(post(bodyB), env)).json()

  assertBoundedNull(outA)
  assertBoundedNull(outB)
  assert.notEqual(outA.correlation_id, outB.correlation_id)

  // Non-sequential: not simple counters / timestamps differing by a small delta.
  const hexA = BigInt('0x' + outA.correlation_id.slice('null_evt_'.length))
  const hexB = BigInt('0x' + outB.correlation_id.slice('null_evt_'.length))
  const diff = hexA > hexB ? hexA - hexB : hexB - hexA
  assert.ok(diff > 1000n, 'correlation_ids must not be sequential counters')
})

// ── EXECUTED path is unaffected ──────────────────────────────────────────────

test('NULL-06 a successful EXECUTED response is unchanged: full receipt, no correlation_id, no audit row', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const body = makeRequestBody()
  const res = await worker.fetch(post(body), env)
  const out = await res.json()

  assert.equal(out.result, 'EXECUTED')
  assert.notEqual(out.receipt, null)
  assert.equal(out.receipt.execution_result, 'EXECUTED')
  assert.equal(out.correlation_id, undefined)
  assert.equal(env.nullAuditRegistry.size, 0, 'no NULL audit record may be written on the EXECUTED path')
})

// ── Audit independence ────────────────────────────────────────────────────────

test('NULL-07 a NULL audit record never appears in the proof or lineage registries and never consumes a nonce', async () => {
  const worker = await getWorker()
  const env = makeFilesystemGatewayEnv()

  const body = makeRequestBody({ path: 'wrangler.toml', content: 'malicious overwrite attempt\n' })
  const res = await worker.fetch(post(body), env)
  const out = await res.json()

  assertBoundedNull(out)
  assert.equal(env.proofRegistry.size, 0, 'NULL audit record != proof')
  assert.equal(env.lineageRegistry.size, 0, 'NULL audit record != lineage')
  assert.equal(env.nonceRegistry.has(body.replay_nonce), false, 'NULL audit record != replay eligibility')
  assert.equal(env.nullAuditRegistry.size, 1)
})
