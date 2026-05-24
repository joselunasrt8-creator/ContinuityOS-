import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from './helpers/import-worker.mjs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

async function loadWorker() {
  return (await importWorker()).default
}

function post(path, body) {
  return new Request(`https://runtime.test${path}`, { method: 'POST', headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

function envWithRows(rows) {
  return {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        return {
          bind(...args) { this.args = args; return this },
          run() { return Promise.resolve({ meta: { changes: 1 } }) },
          all() {
            if (sql.includes('SELECT session_id, identity_id, expires_at, continuity_status FROM session_registry')) return Promise.resolve({ results: [{ session_id: 's1', continuity_status: 'ACTIVE', identity_id: 'id1', expires_at: '2999-01-01T00:00:00.000Z' }] })
            return Promise.resolve({ results: [] })
          },
          first() {
            if (sql.includes('FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3')) return Promise.resolve(rows.validation || null)
            if (sql.includes('FROM invocation_registry')) return Promise.resolve({ status: 'RESERVED' })
            if (sql.includes('FROM authority_registry WHERE decision_id=?1')) return Promise.resolve(rows.authority || null)
            if (sql.includes('FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2')) return Promise.resolve(rows.compiled || null)
            if (sql.includes('FROM proof_registry WHERE decision_id=?1 AND validated_object_hash=?2')) return Promise.resolve(null)
            if (sql.includes('FROM continuity_registry')) return Promise.resolve(rows.continuity || null)
            if (sql.includes('FROM session_registry WHERE session_id=?1')) return Promise.resolve({ session_id: 's1', continuity_status: 'ACTIVE', identity_id: 'id1', expires_at: '2999-01-01T00:00:00.000Z' })
            return Promise.resolve(null)
          }
        }
      },
      batch() { return Promise.resolve([{ results: [rows.execution || null] }, { results: [{ session_id: 's1', continuity_status: 'ACTIVE', identity_id: 'id1', expires_at: '2999-01-01T00:00:00.000Z' }] }, { results: [rows.authority || null] }, { results: [rows.validation || null] }]) }
    }
  }
}

test('execute rejects stale validation', async () => {
  const worker = await loadWorker()
  const stale = new Date(Date.now() - 7 * 60_000).toISOString()
  const response = await worker.fetch(post('/execute', { decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', session_id: 's1' }), envWithRows({
    validation: { validation_id: 'v1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', result: 'VALID', status: 'VALID', created_at: stale, session_id: 's1', continuity_id: 'c1' }
  }))
  const payload = await response.json()
  assert.equal(payload.status, 'NULL')
  assert.equal(payload.reason, 'stale_validation')
})

test('execute rejects authority expired after validation', async () => {
  const worker = await loadWorker()
  const now = new Date().toISOString()
  const response = await worker.fetch(post('/execute', { decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', session_id: 's1' }), envWithRows({
    validation: { validation_id: 'v1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', result: 'VALID', status: 'VALID', created_at: now, session_id: 's1', continuity_id: 'c1' },
    authority: { authority_id: 'a1', status: 'RESERVED', session_id: 's1', continuity_id: 'c1', expiry: '2000-01-01T00:00:00.000Z' }
  }))
  const payload = await response.json()
  assert.equal(payload.status, 'NULL')
  assert.equal(payload.reason, 'authority_expired')
})

test('proof rejects stale validation and preserves proof persistence boundary', async () => {
  const worker = await loadWorker()
  const stale = new Date(Date.now() - 7 * 60_000).toISOString()
  const response = await worker.fetch(post('/proof', { execution_id: 'e1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', session_id: 's1' }), envWithRows({
    execution: { execution_id: 'e1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', status: 'EXECUTED', session_id: 's1', continuity_id: 'c1', created_at: new Date().toISOString() },
    authority: { authority_id: 'a1', decision_id: 'd1', status: 'EXECUTED', session_id: 's1', continuity_id: 'c1' },
    validation: { validation_id: 'v1', decision_id: 'd1', validated_object_hash: 'h1', invocation_nonce: 'n1', result: 'VALID', status: 'VALID', created_at: stale, session_id: 's1', continuity_id: 'c1' }
  }))
  const payload = await response.json()
  assert.equal(payload.status, 'NULL')
  assert.equal(payload.reason, 'stale_validation')
})
