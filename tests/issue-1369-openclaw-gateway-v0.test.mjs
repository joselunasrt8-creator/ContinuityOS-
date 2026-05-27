import test from 'node:test'
import assert from 'node:assert/strict'
import { importWorker } from './helpers/import-worker.mjs'

async function loadWorker() { return (await importWorker()).default }

function createEnv() {
  const writes = []
  const nonceMap = new Map()
  const evidence = []
  const envelopes = []
  return {
    writes,
    evidence,
    envelopes,
    env: {
      API_KEY: 'test-key',
      DB: {
        prepare(sql) {
          return {
            _args: [],
            bind(...args) { this._args = args; return this },
            async run() {
              writes.push({ sql, args: this._args })
              if (sql.includes('INSERT OR IGNORE INTO govern_nonce_registry')) {
                const nonce = this._args[0]
                const nonceDomain = this._args[1]
                const key = `${nonce}:${nonceDomain}`
                if (nonceMap.has(key)) return { meta: { changes: 0 } }
                nonceMap.set(key, this._args[2])
                return { meta: { changes: 1 } }
              }
              if (sql.includes('INSERT OR IGNORE INTO govern_evidence_registry')) {
                evidence.push({ candidate_hash: this._args[1], nonce: this._args[2], result: this._args[3], reason: this._args[4], created_at: this._args[5] })
              }
              if (sql.includes('INSERT OR IGNORE INTO govern_envelope_registry')) {
                envelopes.push({ envelope_id: this._args[0], envelope_hash: this._args[1], nonce: this._args[5], nonce_domain: this._args[6], status: this._args[10], reason: this._args[11] })
              }
              return { meta: { changes: 1 } }
            },
            async first() {
              if (sql.includes('SELECT candidate_hash FROM govern_nonce_registry')) {
                const key = `${this._args[0]}:${this._args[1]}`
                const candidate_hash = nonceMap.get(key)
                return candidate_hash ? { candidate_hash } : null
              }
              return null
            },
            async all() {
              if (sql.includes('PRAGMA table_info(govern_nonce_registry)')) return { results: [{ name: 'nonce' }, { name: 'nonce_domain' }, { name: 'candidate_hash' }, { name: 'created_at' }] }
              return { results: [] }
            }
          }
        }
      }
    }
  }
}

function post(body, nonce='n', nonceDomain='openclaw') {
  return new Request('https://runtime.test/govern', { method: 'POST', headers: { 'content-type': 'application/json', 'X-API-Key': 'test-key', 'X-Nonce': nonce, 'X-Nonce-Domain': nonceDomain }, body: JSON.stringify(body) })
}

const validCandidate = {
  intent: 'create_github_issue',
  scope: { repo: 'mindshift-demo' },
  target: { system: 'github', action: 'issue_draft', title: 'example' },
  finality: { proof_required: true, proof_type: 'governance_evaluation_log' },
  policy_class: 'TOOL_RUNTIME_MUTATION',
  policy_digest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  topology_attestation_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
}

test('issue #1369 /govern validates candidate, deterministically hashes, records evidence, and blocks replay', async () => {
  const worker = await loadWorker()
  const db = createEnv()

  const first = await worker.fetch(post(validCandidate, 'n1'), db.env)
  const firstPayload = await first.json()
  assert.equal(firstPayload.status, 'VALID_CANDIDATE')
  assert.equal(firstPayload.reason, 'valid_candidate')
  assert.equal(firstPayload.evidence.nonce, 'n1')
  assert.ok(firstPayload.evidence.candidate_hash)

  const second = await worker.fetch(post(validCandidate, 'n2'), db.env)
  const secondPayload = await second.json()
  assert.equal(secondPayload.status, 'VALID_CANDIDATE')
  assert.equal(secondPayload.evidence.candidate_hash, firstPayload.evidence.candidate_hash)

  const replay = await worker.fetch(post(validCandidate, 'n1'), db.env)
  const replayPayload = await replay.json()
  assert.equal(replayPayload.status, 'NULL')
  assert.equal(replayPayload.evidence.reason, 'nonce_replay')
  assert.equal(replayPayload.reason, 'nonce_replay')

  assert.equal(db.evidence.length >= 3, true)
  assert.equal(firstPayload.evidence.result, 'VALID_CANDIDATE')
  assert.equal(firstPayload.status === 'VALID_CANDIDATE' && !('execution_id' in firstPayload), true)
  assert.equal(db.envelopes.length >= 3, true)
})

test('issue #1369 /govern rejects missing required fields and strict-mode extra top-level fields', async () => {
  const worker = await loadWorker()
  const db = createEnv()
  for (const item of [
    { body: { ...validCandidate, intent: undefined }, nonce: 'm1' },
    { body: { ...validCandidate, scope: undefined }, nonce: 'm2' },
    { body: { ...validCandidate, target: undefined }, nonce: 'm3' },
    { body: { ...validCandidate, finality: undefined }, nonce: 'm4' },
    { body: { ...validCandidate, extra: true }, nonce: 'm5' },
  ]) {
    const res = await worker.fetch(post(item.body, item.nonce), db.env)
    const payload = await res.json()
    assert.equal(payload.status, 'NULL')
    assert.equal(payload.reason, 'malformed_candidate')
  }
  assert.equal(db.evidence.length, 5)
})

test('issue #1463 /govern detects nonce rebinding within nonce domain and allows cross-domain reuse', async () => {
  const worker = await loadWorker()
  const db = createEnv()
  const alternateCandidate = { ...validCandidate, target: { ...validCandidate.target, title: 'different' } }

  const first = await worker.fetch(post(validCandidate, 'rb1', 'openclaw'), db.env)
  const firstPayload = await first.json()
  assert.equal(firstPayload.status, 'VALID_CANDIDATE')

  const rebinding = await worker.fetch(post(alternateCandidate, 'rb1', 'openclaw'), db.env)
  const rebindingPayload = await rebinding.json()
  assert.equal(rebindingPayload.status, 'NULL')
  assert.equal(rebindingPayload.reason, 'nonce_rebinding')

  const differentDomain = await worker.fetch(post(alternateCandidate, 'rb1', 'openclaw-alt'), db.env)
  const differentDomainPayload = await differentDomain.json()
  assert.equal(differentDomainPayload.status, 'VALID_CANDIDATE')
  assert.equal(differentDomainPayload.nonce_domain, 'openclaw-alt')
})


function createLegacySchemaEnv(legacyRows = []) {
  const writes = []
  const legacyMap = new Map(legacyRows.map((row) => [row.nonce, row.candidate_hash]))
  const nonceMap = new Map()
  let upgraded = false
  return {
    writes,
    env: {
      API_KEY: 'test-key',
      DB: {
        prepare(sql) {
          return {
            _args: [],
            bind(...args) { this._args = args; return this },
            async run() {
              writes.push({ sql, args: this._args })
              if (sql.includes('INSERT OR IGNORE INTO govern_nonce_registry_v2') && !upgraded) {
                for (const [nonce, hash] of legacyMap.entries()) nonceMap.set(`${nonce}:openclaw`, hash)
                return { meta: { changes: 1 } }
              }
              if (sql.includes('ALTER TABLE govern_nonce_registry_v2 RENAME TO govern_nonce_registry')) {
                upgraded = true
                return { meta: { changes: 1 } }
              }
              if (sql.includes('INSERT OR IGNORE INTO govern_nonce_registry')) {
                const key = `${this._args[0]}:${this._args[1]}`
                if (nonceMap.has(key)) return { meta: { changes: 0 } }
                nonceMap.set(key, this._args[2])
                return { meta: { changes: 1 } }
              }
              return { meta: { changes: 1 } }
            },
            async first() {
              if (sql.includes('SELECT candidate_hash FROM govern_nonce_registry')) {
                const key = `${this._args[0]}:${this._args[1]}`
                const candidate_hash = nonceMap.get(key)
                return candidate_hash ? { candidate_hash } : null
              }
              return null
            },
            async all() {
              if (sql.includes('PRAGMA table_info(govern_nonce_registry)')) {
                if (!upgraded) return { results: [{ name: 'nonce' }, { name: 'candidate_hash' }, { name: 'created_at' }] }
                return { results: [{ name: 'nonce' }, { name: 'nonce_domain' }, { name: 'candidate_hash' }, { name: 'created_at' }] }
              }
              return { results: [] }
            }
          }
        }
      }
    }
  }
}

test('issue #1469 /govern upgrades old nonce schema and preserves openclaw replay semantics', async () => {
  const worker = await loadWorker()
  const baseline = createEnv()
  const seeded = await worker.fetch(post(validCandidate, 'legacy-nonce', 'openclaw'), baseline.env)
  const seededPayload = await seeded.json()
  const db = createLegacySchemaEnv([{ nonce: 'legacy-nonce', candidate_hash: seededPayload.evidence.candidate_hash }])

  const replay = await worker.fetch(post(validCandidate, 'legacy-nonce', 'openclaw'), db.env)
  const replayPayload = await replay.json()
  assert.equal(replayPayload.status, 'NULL')
  assert.equal(replayPayload.reason, 'nonce_replay')

  const crossDomain = await worker.fetch(post(validCandidate, 'legacy-nonce', 'openclaw-alt'), db.env)
  const crossDomainPayload = await crossDomain.json()
  assert.equal(crossDomainPayload.status, 'VALID_CANDIDATE')

  assert.equal(db.writes.some((entry) => entry.sql.includes('ALTER TABLE govern_nonce_registry_v2 RENAME TO govern_nonce_registry')), true)
})
