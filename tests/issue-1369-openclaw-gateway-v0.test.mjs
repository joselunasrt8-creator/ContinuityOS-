import test from 'node:test'
import assert from 'node:assert/strict'
import { importWorker } from './helpers/import-worker.mjs'

async function loadWorker() { return (await importWorker()).default }

function createEnv() {
  const writes = []
  const nonceSet = new Set()
  const evidence = []
  return {
    writes,
    evidence,
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
                if (nonceSet.has(nonce)) return { meta: { changes: 0 } }
                nonceSet.add(nonce)
                return { meta: { changes: 1 } }
              }
              if (sql.includes('INSERT OR IGNORE INTO govern_evidence_registry')) {
                evidence.push({ candidate_hash: this._args[1], nonce: this._args[2], result: this._args[3], reason: this._args[4], created_at: this._args[5] })
              }
              return { meta: { changes: 1 } }
            },
            async first() { return null },
            async all() { return { results: [] } }
          }
        }
      }
    }
  }
}

function post(body, nonce='n') {
  return new Request('https://runtime.test/govern', { method: 'POST', headers: { 'content-type': 'application/json', 'X-API-Key': 'test-key', 'X-Nonce': nonce }, body: JSON.stringify(body) })
}

const validCandidate = {
  intent: 'create_github_issue',
  scope: { repo: 'mindshift-demo' },
  target: { system: 'github', action: 'issue_draft', title: 'example' },
  finality: { proof_required: true, proof_type: 'governance_evaluation_log' }
}

test('issue #1369 /govern validates candidate, deterministically hashes, records evidence, and blocks replay', async () => {
  const worker = await loadWorker()
  const db = createEnv()

  const first = await worker.fetch(post(validCandidate, 'n1'), db.env)
  const firstPayload = await first.json()
  assert.equal(firstPayload.status, 'VALID_CANDIDATE')
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

  assert.equal(db.evidence.length >= 3, true)
  assert.equal(firstPayload.evidence.result, 'VALID_CANDIDATE')
  assert.equal(firstPayload.status === 'VALID_CANDIDATE' && !('execution_id' in firstPayload), true)
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
  }
  assert.equal(db.evidence.length, 5)
})
