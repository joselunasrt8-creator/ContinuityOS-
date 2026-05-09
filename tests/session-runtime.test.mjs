import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

async function loadWorker() {
  const { transformSync } = await import('esbuild')
  const compiled = transformSync(source, { loader: 'ts', format: 'esm' }).code
  return (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default
}

function createD1Mock({ failRunWhen, firstResult = null } = {}) {
  const preparedSql = []
  let writes = 0
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        preparedSql.push(sql)
        return {
          bind() { return this },
          run() {
            if (failRunWhen?.(sql)) throw new Error('simulated D1 schema failure')
            writes += 1
            return Promise.resolve({ meta: { changes: 1 } })
          },
          all() { return Promise.resolve({ results: [] }) },
          first() { return Promise.resolve(firstResult) }
        }
      }
    }
  }
  return { env, preparedSql, get writes() { return writes } }
}

function post(path, body) {
  return new Request(`https://runtime.test${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

test('schema bootstrap failure returns canonical NULL instead of Worker exception', async () => {
  const worker = await loadWorker()
  const { env } = createD1Mock({ failRunWhen: () => true })
  let response

  await assert.doesNotReject(async () => {
    response = await worker.fetch(post('/session', { identity_id: 'identity-1' }), env)
  })

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { status: 'NULL', reason: 'schema_initialization_failed' })
})

test('malformed proof registry D1 state returns canonical NULL before request handling', async () => {
  const worker = await loadWorker()
  const { env } = createD1Mock({
    failRunWhen: (sql) => sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique')
  })
  let response

  await assert.doesNotReject(async () => {
    response = await worker.fetch(post('/authority', { session_id: 'session-1' }), env)
  })

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { status: 'NULL', reason: 'schema_initialization_failed' })
})

test('/session does not run historical proof quarantine or unique index mutation', async () => {
  const worker = await loadWorker()
  const { env, preparedSql } = createD1Mock({
    failRunWhen: (sql) => sql.includes('INSERT OR IGNORE INTO proof_registry_duplicate_archive') || sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique')
  })

  const response = await worker.fetch(post('/session', { identity_id: 'identity-1' }), env)
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'SESSION_ACTIVE')
  assert.ok(payload.session_id)
  assert.equal(preparedSql.some((sql) => sql.includes('INSERT OR IGNORE INTO proof_registry_duplicate_archive')), false)
  assert.equal(preparedSql.some((sql) => sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique')), false)
})


test('/session telemetry failure does not throw Worker exception or invalidate persisted session', async () => {
  const worker = await loadWorker()
  const { env } = createD1Mock({
    failRunWhen: (sql) => sql.includes('INSERT INTO observability_registry')
  })
  let response

  await assert.doesNotReject(async () => {
    response = await worker.fetch(post('/session', { identity_id: 'identity-telemetry-failure' }), env)
  })

  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.status, 'SESSION_ACTIVE')
  assert.equal(payload.identity_id, 'identity-telemetry-failure')
  assert.ok(payload.created_at)
  assert.ok(payload.expires_at)
})

test('/session missing identity_id returns canonical NULL', async () => {
  const worker = await loadWorker()
  const { env } = createD1Mock()

  const response = await worker.fetch(post('/session', {}), env)

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { status: 'NULL', reason: 'missing_identity_id' })
})

test('/session valid identity_id returns SESSION_ACTIVE', async () => {
  const worker = await loadWorker()
  const db = createD1Mock()

  const response = await worker.fetch(post('/session', { identity_id: 'github_actions:owner/repo:1234' }), db.env)
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'SESSION_ACTIVE')
  assert.ok(payload.session_id)
  assert.ok(db.writes > 0)
})

test('/authority returns diagnostic NULL when schema initialization hits an incompatible archive shape', async () => {
  const worker = await loadWorker()
  const { env } = createD1Mock({
    failRunWhen(sql) {
      if (sql.includes('INSERT OR IGNORE INTO proof_registry_duplicate_archive')) {
        throw new Error('table proof_registry_duplicate_archive has no column named canonical_proof_id')
      }
      return false
    }
  })
  let response

  await assert.doesNotReject(async () => {
    response = await worker.fetch(post('/authority', { session_id: 'session-1' }), env)
  })

  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { status: 'NULL', reason: 'missing_required_column' })
})

test('/authority rejects missing session_id without creating authority', async () => {
  const worker = await loadWorker()
  const db = createD1Mock()
  const response = await worker.fetch(post('/authority', {}), db.env)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'NULL', reason: 'invalid_session' })
})

test('/authority rejects orphaned session_id without creating authority', async () => {
  const worker = await loadWorker()
  const db = createD1Mock()
  const response = await worker.fetch(post('/authority', { session_id: 'orphan-session' }), db.env)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'NULL', reason: 'invalid_session' })
})

test('/authority succeeds only after schema bootstrap with active session and continuity', async () => {
  const worker = await loadWorker()
  let writes = 0
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        return {
          bind() { return this },
          run() { writes += 1; return Promise.resolve({ meta: { changes: 1 } }) },
          all() { return Promise.resolve({ results: [] }) },
          first() {
            if (sql.includes('FROM session_registry')) return Promise.resolve({ session_id: 'session-1', continuity_status: 'ACTIVE', identity_id: 'identity-1', expires_at: '2999-01-01T00:00:00.000Z' })
            if (sql.includes('FROM continuity_registry')) return Promise.resolve({
              continuity_id: 'continuity-1',
              identity_id: 'identity-1',
              session_id: 'session-1',
              status: 'ACTIVE',
              expires_at: '2999-01-01T00:00:00.000Z',
              continuity_hash: 'ef2c820c0baa0545de7eba7329129e2ce345ee62261c6d43bfaa0090a49410a2',
              canonical_continuity: JSON.stringify({ continuity_id: 'continuity-1', identity_id: 'identity-1', session_id: 'session-1', parent_continuity_id: null, authority_chain: ['decision-1'], actor_chain: ['human'], scope: {}, constraints: {}, revocation: { status: 'ACTIVE', revoked_at: null }, issued_at: '2026-01-01T00:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z', continuity_hash: 'ef2c820c0baa0545de7eba7329129e2ce345ee62261c6d43bfaa0090a49410a2' })
            })
            return Promise.resolve(null)
          }
        }
      }
    }
  }

  const response = await worker.fetch(post('/authority', { session_id: 'session-1', continuity_id: 'continuity-1', decision_id: 'decision-1' }), env)
  const payload = await response.json()

  assert.equal(response.status, 200)
  assert.equal(payload.status, 'ACTIVE')
  assert.equal(payload.decision_id, 'decision-1')
  assert.ok(writes > 0)
})
