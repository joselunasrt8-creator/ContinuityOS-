import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

async function loadWorker() {
  const { transformSync } = await import('esbuild')
  const compiled = transformSync(source, { loader: 'ts', format: 'esm' }).code
  return (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default
}

function post(path, body) {
  return new Request(`https://runtime.test${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function buildContinuityRecord() {
  const canonical = { continuity_id: 'continuity-1', identity_id: 'identity-1', session_id: 'session-1', parent_continuity_id: null, authority_chain: ['decision-1'], actor_chain: ['human'], scope: {}, constraints: {}, revocation: { status: 'ACTIVE', revoked_at: null }, issued_at: '2026-01-01T00:00:00.000Z', expires_at: '2999-01-01T00:00:00.000Z' }
  const continuity_hash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
  const canonicalWithHash = { ...canonical, continuity_hash }
  const canonical_continuity = JSON.stringify(canonicalWithHash)
  return { continuity_id: 'continuity-1', status: 'ACTIVE', identity_id: 'identity-1', session_id: 'session-1', expires_at: '2999-01-01T00:00:00.000Z', canonical_continuity, continuity_hash }
}

function buildEnv(overrides = {}) {
  const authority = overrides.authority ?? {
    authority_id: 'auth-1', decision_id: 'decision-1', status: 'ACTIVE', session_id: 'session-1', continuity_id: 'continuity-1', identity_id: 'identity-1',
    constraints: JSON.stringify({ repo: 'owner/repo', branch: 'main', workflow: 'governed-deploy.yml' }), scope: JSON.stringify({ repo: 'owner/repo', branch: 'main' }), expiry: '2999-01-01T00:00:00.000Z'
  }
  const canonicalAeo = overrides.canonicalAeo ?? JSON.stringify({ intent: 'deploy_production', scope: { repo: 'owner/repo', branch: 'main' }, validation: { workflow: 'governed-deploy.yml' }, target: { repo: 'owner/repo', branch: 'main', workflow: 'governed-deploy.yml' }, finality: { proof_required: true } })
  const validatedHash = createHash('sha256').update(canonicalAeo).digest('hex')
  const compiled = overrides.compiled ?? { authority_id: 'auth-1', continuity_id: 'continuity-1', delegated_authority_id: '', delegated_replay_chain_hash: '', validated_object_hash: validatedHash, canonical_aeo: canonicalAeo }

  return { validatedHash,
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        return {
          bind(...params) { this.params = params; return this },
          async first() {
            if (sql.includes('FROM authority_registry WHERE decision_id=')) return authority
            if (sql.includes('FROM session_registry')) return { session_id: 'session-1', identity_id: 'identity-1', continuity_status: 'ACTIVE', expires_at: '2999-01-01T00:00:00.000Z' }
            if (sql.includes('FROM continuity_registry')) return buildContinuityRecord()
            if (sql.includes('FROM aeo_registry WHERE decision_id=')) return compiled
            if (sql.includes('FROM delegated_authority_registry')) return null
            return null
          },
          async run() {
            if (sql.includes('INSERT OR IGNORE INTO invocation_registry')) return { meta: { changes: 1 } }
            return { meta: { changes: 1 } }
          },
          async all() { return { results: [] } }
        }
      }
    }
  }
}

test('Issue #540: expired authority returns NULL', async () => {
  const worker = await loadWorker()
  const env = buildEnv({ authority: { authority_id: 'auth-1', decision_id: 'decision-1', status: 'ACTIVE', session_id: 'session-1', continuity_id: 'continuity-1', identity_id: 'identity-1', constraints: JSON.stringify({ repo: 'owner/repo', branch: 'main', workflow: 'governed-deploy.yml' }), scope: JSON.stringify({ repo: 'owner/repo', branch: 'main' }), expiry: '2000-01-01T00:00:00.000Z' } })
  const res = await worker.fetch(post('/validate', { decision_id: 'decision-1', validated_object_hash: env.validatedHash, invocation_nonce: 'n1', session_id: 'session-1' }), env)
  assert.deepEqual(await res.json(), { status: 'NULL', result: 'INVALID', reason: 'authority_expired' })
})

test('Issue #540: revoked authority returns NULL', async () => {
  const worker = await loadWorker()
  const env = buildEnv({ authority: { authority_id: 'auth-1', decision_id: 'decision-1', status: 'REVOKED', session_id: 'session-1', continuity_id: 'continuity-1', identity_id: 'identity-1', constraints: JSON.stringify({ repo: 'owner/repo', branch: 'main', workflow: 'governed-deploy.yml' }), scope: JSON.stringify({ repo: 'owner/repo', branch: 'main' }), expiry: '2999-01-01T00:00:00.000Z' } })
  const res = await worker.fetch(post('/validate', { decision_id: 'decision-1', validated_object_hash: env.validatedHash, invocation_nonce: 'n1', session_id: 'session-1' }), env)
  assert.deepEqual(await res.json(), { status: 'NULL', result: 'INVALID', reason: 'authority_revoked' })
})

test('Issue #540: ATAO mutation after validation returns NULL', async () => {
  const worker = await loadWorker()
  const widened = JSON.stringify({ intent: 'deploy_production', scope: { repo: 'owner/repo', branch: 'main', admin: true }, validation: { workflow: 'governed-deploy.yml' }, target: { repo: 'owner/repo', branch: 'main', workflow: 'governed-deploy.yml' }, finality: { proof_required: true } })
  const env = buildEnv({ canonicalAeo: widened })
  const res = await worker.fetch(post('/validate', { decision_id: 'decision-1', validated_object_hash: env.validatedHash, invocation_nonce: 'n1', session_id: 'session-1' }), env)
  assert.deepEqual(await res.json(), { status: 'NULL', result: 'INVALID', reason: 'invalid_continuity' })
})

test('Issue #540: deterministic ATAO canonicalization required', async () => {
  const worker = await loadWorker()
  const noProof = JSON.stringify({ intent: 'deploy_production', scope: { repo: 'owner/repo', branch: 'main' }, validation: { workflow: 'governed-deploy.yml' }, target: { repo: 'owner/repo', branch: 'main', workflow: 'governed-deploy.yml' }, finality: { proof_required: false } })
  const env = buildEnv({ canonicalAeo: noProof })
  const res = await worker.fetch(post('/validate', { decision_id: 'decision-1', validated_object_hash: env.validatedHash, invocation_nonce: 'n1', session_id: 'session-1' }), env)
  assert.deepEqual(await res.json(), { status: 'NULL', result: 'INVALID', reason: 'invalid_continuity' })
})
