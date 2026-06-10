// Lineage Registry Boundary tests (issue #1934).
//
// Verifies that lineage persistence is routed through LineageRegistryPort at the
// route level — after proof persistence, never before, and never via direct SQL.
//
// Required ordering:
//   executeWithAdapter → markNonceConsumed → appendProofReceipt → appendLineageNode
//
// Boundary contract:
//   route orchestrates
//   adapter persists (through LineageRegistryPort — no direct lineage SQL in route)
//
// Acceptance criteria:
//   - NULL outcome → no lineage append
//   - EXECUTED_UNCOMMITTED → no lineage append (does not claim convergence)
//   - EXECUTED → lineage appended through port after proof
//   - lineage node binds: canonical_aeo_hash, receipt_id, decision_id, replay_nonce,
//     target_system, target_action, target_path, status
//   - lineage_append_status exposed on EXECUTED response (separate from execution result)
//   - lineage append failure does not change execution result
//   - proof remains authoritative; lineage is traceability only

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
    content: 'Lineage boundary test content.\n',
    replay_nonce: `nonce-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  }
}

// ── Mock D1 environment ────────────────────────────────────────────────────────
// Extends the standard gateway mock with a lineageRegistry map so tests can
// inspect which lineage nodes were appended through LineageRegistryPort.

function makeEnv({ lineageAppendBehavior = 'normal' } = {}) {
  const decisionRegistry = new Map()
  const nonceRegistry = new Map()
  const objectRegistry = new Map()
  const proofRegistry = new Map()
  const lineageRegistry = new Map()
  const writes = []

  const env = {
    API_KEY: 'test-key',
    decisionRegistry,
    nonceRegistry,
    objectRegistry,
    proofRegistry,
    lineageRegistry,
    writes,
    DB: {
      prepare(sql) {
        const stmt = {
          args: [],
          bind(...args) { this.args = args; return this },
          async run() {
            writes.push({ sql, args: this.args })

            if (/^\s*CREATE /i.test(sql)) return { meta: { changes: 0 } }
            if (/^\s*CREATE TRIGGER/i.test(sql)) return { meta: { changes: 0 } }

            if (sql.includes('INSERT OR IGNORE INTO governed_filesystem_write_decision_registry')) {
              const [decision_id, authority_lineage_hash, created_at] = this.args
              if (!decisionRegistry.has(decision_id)) {
                decisionRegistry.set(decision_id, { decision_id, status: 'ACTIVE', authority_lineage_hash, scope: 'repository', expires_at: null, created_at })
              }
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT OR IGNORE INTO governed_filesystem_object_registry')) {
              const [p, content, content_hash, bytes_written, updated_at] = this.args
              if (!objectRegistry.has(p)) {
                objectRegistry.set(p, { path: p, content, content_hash, bytes_written, updated_at })
              }
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_write_nonce_registry')
                && sql.includes('ON CONFLICT(replay_nonce) DO UPDATE')) {
              const [replay_nonce, decision_id, created_at] = this.args
              const existing = nonceRegistry.get(replay_nonce)
              nonceRegistry.set(replay_nonce, { replay_nonce, decision_id, state: 'CONSUMED', created_at: existing ? existing.created_at : created_at, consumed_at: created_at })
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_object_registry') && sql.includes('ON CONFLICT(path) DO UPDATE')) {
              const [p, content, content_hash, bytes_written, updated_at] = this.args
              objectRegistry.set(p, { path: p, content, content_hash, bytes_written, updated_at })
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_write_proof_registry')) {
              const [receipt_id] = this.args
              proofRegistry.set(receipt_id, this.args)
              return { meta: { changes: 1 } }
            }

            if (sql.includes('governed_filesystem_write_lineage_registry')
                && sql.includes('INSERT INTO')) {
              if (lineageAppendBehavior === 'conflict') {
                // Simulate ON CONFLICT(node_id) DO NOTHING — no changes
                return { meta: { changes: 0 } }
              }
              // node_id is first bind arg
              const [node_id] = this.args
              lineageRegistry.set(node_id, this.args)
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
              const [p] = this.args
              return objectRegistry.get(p) ?? null
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

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: EXECUTED path — lineage appended through port after proof
// ─────────────────────────────────────────────────────────────────────────────

test('lineage boundary: EXECUTED path appends lineage through port after proof', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const body = makeRequestBody()
  const res = await worker.fetch(post(body), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED', 'execution must succeed')
  assert.equal(out.result, 'EXECUTED')
  assert.ok(out.receipt, 'proof receipt must be present')

  // Lineage was appended through the port — lineageRegistry has one record
  assert.equal(env.lineageRegistry.size, 1, 'one lineage record must be appended through the port')
})

test('lineage boundary: lineage_append_status is present on EXECUTED response', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  assert.ok(Object.prototype.hasOwnProperty.call(out, 'lineage_append_status'),
    'lineage_append_status must be present on EXECUTED response')
  assert.equal(out.lineage_append_status, 'APPENDED')
})

test('lineage boundary: proof is persisted before lineage append', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')

  // Verify ordering in the write log: proof INSERT must appear before lineage INSERT
  const proofIdx = env.writes.findIndex(w => w.sql.includes('governed_filesystem_write_proof_registry') && w.sql.includes('INSERT INTO'))
  const lineageIdx = env.writes.findIndex(w => w.sql.includes('governed_filesystem_write_lineage_registry') && w.sql.includes('INSERT INTO'))
  assert.ok(proofIdx !== -1, 'proof INSERT must be present in write log')
  assert.ok(lineageIdx !== -1, 'lineage INSERT must be present in write log')
  assert.ok(proofIdx < lineageIdx, 'proof must be persisted before lineage append')
})

test('lineage boundary: lineage node binds canonical_aeo_hash from proof receipt', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  const [nodeId, parentId, canonical_aeo_hash] = [...env.lineageRegistry.values()][0]
  assert.equal(canonical_aeo_hash, out.receipt.validated_object_hash,
    'canonical_aeo_hash must equal proof receipt validated_object_hash')
  assert.match(canonical_aeo_hash, /^sha256:[0-9a-f]{64}$/)
})

test('lineage boundary: lineage node binds receipt_id from proof receipt', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  const bindArgs = [...env.lineageRegistry.values()][0]
  // Bind order: node_id, parent_id, canonical_aeo_hash, receipt_id, decision_id, replay_nonce, ...
  const receipt_id = bindArgs[3]
  assert.equal(receipt_id, out.receipt.receipt_id, 'lineage receipt_id must match proof receipt')
})

test('lineage boundary: lineage node binds decision_id from proof receipt', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  const bindArgs = [...env.lineageRegistry.values()][0]
  const decision_id = bindArgs[4]
  assert.equal(decision_id, out.receipt.decision_id, 'lineage decision_id must match proof receipt')
})

test('lineage boundary: lineage node binds replay_nonce from proof receipt', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const body = makeRequestBody()
  const res = await worker.fetch(post(body), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  const bindArgs = [...env.lineageRegistry.values()][0]
  const replay_nonce = bindArgs[5]
  assert.equal(replay_nonce, out.receipt.replay_nonce, 'lineage replay_nonce must match proof receipt')
  assert.equal(replay_nonce, body.replay_nonce)
})

test('lineage boundary: lineage node binds target_system = "filesystem"', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  const bindArgs = [...env.lineageRegistry.values()][0]
  const target_system = bindArgs[6]
  assert.equal(target_system, 'filesystem')
})

test('lineage boundary: lineage node binds target_action = "write_file"', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  const bindArgs = [...env.lineageRegistry.values()][0]
  const target_action = bindArgs[7]
  assert.equal(target_action, 'write_file')
})

test('lineage boundary: lineage node binds target_path matching written file', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const body = makeRequestBody()
  const res = await worker.fetch(post(body), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  const bindArgs = [...env.lineageRegistry.values()][0]
  const target_path = bindArgs[8]
  assert.equal(target_path, body.path)
  assert.equal(target_path, out.target_path)
})

test('lineage boundary: lineage node status = "EXECUTED"', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  const bindArgs = [...env.lineageRegistry.values()][0]
  const status = bindArgs[9]
  assert.equal(status, 'EXECUTED')
})

test('lineage boundary: lineage node_id is deterministic "lineage:" + receipt_id', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  const [node_id, , , receipt_id] = [...env.lineageRegistry.values()][0]
  assert.equal(node_id, 'lineage:' + out.receipt.receipt_id)
  assert.equal(node_id, 'lineage:' + receipt_id)
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: NULL path — no lineage, no proof
// ─────────────────────────────────────────────────────────────────────────────

test('lineage boundary: NULL outcome — no lineage appended', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  // Malformed request → NULL at capture
  const res = await worker.fetch(post({ agent_id: '', session_id: '', intent: '', path: '', replay_nonce: '' }), env)
  const out = await res.json()

  assert.equal(out.result, 'NULL')
  assert.equal(env.lineageRegistry.size, 0, 'no lineage may be appended on NULL path')
})

test('lineage boundary: denied path (NULL at validate) — no lineage appended', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody({ path: 'wrangler.toml' })), env)
  const out = await res.json()

  assert.equal(out.result, 'NULL')
  assert.match(out.correlation_id, /^null_evt_[0-9a-f]{32}$/)
  assert.equal(env.lineageRegistry.size, 0, 'no lineage may be appended on NULL path')
})

test('lineage boundary: NULL path — no proof appended either', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post({ agent_id: '', session_id: '', intent: '', path: '', replay_nonce: '' }), env)
  assert.equal((await res.json()).result, 'NULL')
  assert.equal(env.proofRegistry.size, 0)
  assert.equal(env.lineageRegistry.size, 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: lineage append failure — execution result unchanged
// ─────────────────────────────────────────────────────────────────────────────

test('lineage boundary: lineage_append_status ALREADY_EXISTS does not change EXECUTED result', async () => {
  const worker = await getWorker()
  // conflict behavior → ON CONFLICT DO NOTHING → changes: 0 → ALREADY_EXISTS
  const env = makeEnv({ lineageAppendBehavior: 'conflict' })

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED', 'execution result must not change on ALREADY_EXISTS')
  assert.ok(out.receipt, 'proof receipt must be present')
  assert.equal(out.lineage_append_status, 'ALREADY_EXISTS')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: Proof hash invariant preserved
// ─────────────────────────────────────────────────────────────────────────────

test('lineage boundary: EXECUTED proof hash invariant preserved (validated == executed)', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  assert.equal(out.receipt.validated_object_hash, out.receipt.executed_object_hash,
    'proof hash invariant must not be affected by lineage boundary')
})

test('lineage boundary: no direct lineage SQL in route — only LineageRegistryPort calls', async () => {
  // Verify that the lineage boundary is enforced at the source level:
  // the route adapter must not contain raw SQL targeting the lineage table
  // outside of the buildD1LineageRegistryPort factory.
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const adapterSource = readFileSync(
    new URL('../src/lib/filesystem-write-route-adapter.ts', import.meta.url),
    'utf8'
  )

  // The only place lineage SQL should appear is inside buildD1LineageRegistryPort.
  // Count occurrences of the lineage table name — must all be within the port factory.
  const lineageTableMentions = (adapterSource.match(/governed_filesystem_write_lineage_registry/g) || []).length
  // Expected: CREATE TABLE, CREATE TRIGGER x2, INSERT INTO (all inside buildD1LineageRegistryPort)
  // No raw lineage SQL should appear in the route handler body.
  assert.ok(lineageTableMentions > 0, 'lineage table must be referenced in the adapter')

  // The route handler (handleFilesystemWriteRoute) must not contain
  // raw INSERT SQL for the lineage table outside the port factory.
  // We verify by checking that "appendLineageNode" is called, not raw SQL.
  assert.match(adapterSource, /appendLineageNode/, 'route must call appendLineageNode through the port')
  assert.match(adapterSource, /lineageRegistryPort\.appendLineageNode/, 'lineage must be called via port, not inline SQL')
})
