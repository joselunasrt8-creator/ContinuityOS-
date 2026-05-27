import test from 'node:test'
import assert from 'node:assert/strict'
import { importWorker } from './helpers/import-worker.mjs'

async function loadWorker() { return (await importWorker()).default }

function createEnv() {
  return {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        return {
          _args: [],
          bind(...args) { this._args = args; return this },
          async run() { return { meta: { changes: 1 } } },
          async first() { return null },
          async all() {
            if (sql.includes('PRAGMA table_info(govern_nonce_registry)')) return { results: [{ name: 'nonce' }, { name: 'nonce_domain' }, { name: 'candidate_hash' }, { name: 'created_at' }] }
            return { results: [] }
          }
        }
      }
    }
  }
}

function post(body, nonce='n') {
  return new Request('https://runtime.test/govern', { method: 'POST', headers: { 'content-type': 'application/json', 'X-API-Key': 'test-key', 'X-Nonce': nonce, 'X-Nonce-Domain': 'openclaw' }, body: JSON.stringify(body) })
}

const baseCandidate = {
  intent: 'create_github_issue',
  scope: { repo: 'mindshift-demo' },
  target: { system: 'github', action: 'issue_draft', title: 'example' },
  finality: { proof_required: true }
}

test('issue #1466 /govern fails closed on explicit policy and topology predicate errors', async () => {
  const worker = await loadWorker()
  const env = createEnv()

  const cases = [
    [{ ...baseCandidate }, 'policy_class_missing'],
    [{ ...baseCandidate, policy_class: 'TOOL_RUNTIME_MUTATION' }, 'policy_digest_missing'],
    [{ ...baseCandidate, policy_class: 'INVALID', policy_digest: 'a'.repeat(64) }, 'policy_class_invalid'],
    [{ ...baseCandidate, policy_class: 'TOOL_RUNTIME_MUTATION', policy_digest: 'bad-digest' }, 'policy_digest_mismatch'],
    [{ ...baseCandidate, policy_class: 'TOOL_RUNTIME_MUTATION', policy_digest: 'a'.repeat(64) }, 'topology_attestation_missing'],
    [{ ...baseCandidate, policy_class: 'TOOL_RUNTIME_MUTATION', policy_digest: 'a'.repeat(64), topology_attestation_hash: 'stale' }, 'topology_attestation_stale'],
    [{ ...baseCandidate, policy_class: 'TOOL_RUNTIME_MUTATION', policy_digest: 'a'.repeat(64), topology_attestation_hash: 'ambiguous' }, 'topology_attestation_ambiguous'],
    [{ ...baseCandidate, policy_class: 'TOOL_RUNTIME_MUTATION', policy_digest: 'a'.repeat(64), topology_attestation_hash: 'not-a-hash' }, 'topology_unreconcilable']
  ]

  for (const [body, reason] of cases) {
    const res = await worker.fetch(post(body), env)
    const payload = await res.json()
    assert.equal(payload.status, 'NULL')
    assert.equal(payload.reason, reason)
  }

  const ok = await worker.fetch(post({ ...baseCandidate, policy_class: 'TOOL_RUNTIME_MUTATION', policy_digest: 'a'.repeat(64), topology_attestation_hash: 'b'.repeat(64) }, 'ok-1'), env)
  const okPayload = await ok.json()
  assert.equal(okPayload.status, 'VALID_CANDIDATE')
  assert.equal(okPayload.reason, 'valid_candidate')
})
