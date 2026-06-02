import test from 'node:test'
import assert from 'node:assert/strict'
import { importWorker } from './helpers/import-worker.mjs'
import { canonicalize, sha256Hex } from '../src/canonical.js'

let _worker
async function getWorker() {
  if (!_worker) _worker = (await importWorker()).default
  return _worker
}

const route = '/agent/tool-call'
const future = '2999-01-01T00:00:00.000Z'
const ids = {
  atao_id: 'atao-1',
  atao_hash: 'atao-hash-1',
  session_id: 'session-1',
  continuity_id: 'continuity-1',
  authority_id: 'authority-1',
  decision_id: 'decision-1',
  invocation_nonce: 'nonce-1',
  execution_id: 'execution-1',
  proof_id: 'proof-1'
}

const canonicalAeo = Object.freeze({
  intent: 'mutate-runtime',
  scope: { session_id: ids.session_id },
  validation: { workflow: '.github/workflows/governed-deploy.yml' },
  target: { execution_surface: 'deploy_runtime' },
  finality: { proof_required: true }
})
const validatedObjectHash = sha256Hex(canonicalize(canonicalAeo))
const validPayload = Object.freeze({
  policy_class: 'TOOL_RUNTIME_MUTATION',
  target: { execution_surface: 'deploy_runtime' },
  ...ids,
  validated_object_hash: validatedObjectHash
})

function post(payload) {
  return new Request(`https://runtime.test${route}`, {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
}

function makeEnv(overrides = {}) {
  const writes = []
  const consumed = new Set()
  const rows = {
    atao: { ...ids, status: 'CAPTURED' },
    session: { session_id: ids.session_id, identity_id: 'identity-1', continuity_status: 'ACTIVE', expires_at: future },
    continuity: { continuity_id: ids.continuity_id, session_id: ids.session_id, identity_id: 'identity-1', status: 'ACTIVE', revoked_at: null, expires_at: future },
    authority: { authority_id: ids.authority_id, decision_id: ids.decision_id, session_id: ids.session_id, continuity_id: ids.continuity_id, status: 'CONSUMED' },
    compiled: { authority_id: ids.authority_id, decision_id: ids.decision_id, continuity_id: ids.continuity_id, canonical_aeo: JSON.stringify(canonicalAeo), validated_object_hash: validatedObjectHash, status: 'COMPILED' },
    validation: { decision_id: ids.decision_id, session_id: ids.session_id, continuity_id: ids.continuity_id, invocation_nonce: ids.invocation_nonce, validated_object_hash: validatedObjectHash, status: 'VALID', result: 'VALID' },
    execution: { execution_id: ids.execution_id, decision_id: ids.decision_id, session_id: ids.session_id, continuity_id: ids.continuity_id, invocation_nonce: ids.invocation_nonce, validated_object_hash: validatedObjectHash, status: 'EXECUTED' },
    proof: { proof_id: ids.proof_id, execution_id: ids.execution_id, decision_id: ids.decision_id, session_id: ids.session_id, continuity_id: ids.continuity_id, validated_object_hash: validatedObjectHash },
    ...overrides
  }

  return {
    writes,
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        const stmt = {
          args: [],
          bind(...args) { this.args = args; return this },
          async run() {
            writes.push({ sql, args: this.args })
            if (sql.includes('INSERT OR IGNORE INTO agent_tool_invocation_registry')) {
              const key = `${this.args[1]}:${this.args[2]}:${this.args[3]}:${this.args[4]}`
              if (consumed.has(key)) return { meta: { changes: 0 } }
              consumed.add(key)
              return { meta: { changes: 1 } }
            }
            return { meta: { changes: 1 } }
          },
          async first() {
            if (sql.includes('FROM agent_tool_call_atao_registry')) return rows.atao
            if (sql.includes('FROM session_registry')) return rows.session
            if (sql.includes('FROM continuity_registry')) return rows.continuity
            if (sql.includes('FROM authority_registry')) return rows.authority
            if (sql.includes('FROM aeo_registry')) return rows.compiled
            if (sql.includes('FROM validation_registry')) return rows.validation
            if (sql.includes('FROM execution_registry')) return rows.execution
            if (sql.includes('FROM proof_registry')) return rows.proof
            return null
          },
          async all() { return { results: [] } }
        }
        return stmt
      }
    }
  }
}

test('ungoverned_agent_tool_call: mutation tool without authority returns NULL', async () => {
  const worker = await getWorker()
  const env = makeEnv({ authority: null })
  const res = await worker.fetch(post(validPayload), env)
  const body = await res.json()
  assert.equal(body.status, 'NULL')
  assert.equal(body.reason, 'authority_missing')
})

test('ungoverned_agent_tool_call: mutation tool without validation returns NULL', async () => {
  const worker = await getWorker()
  const env = makeEnv({ validation: null })
  const res = await worker.fetch(post(validPayload), env)
  const body = await res.json()
  assert.equal(body.status, 'NULL')
  assert.equal(body.reason, 'validation_missing')
})

test('ungoverned_agent_tool_call: mutation tool without proof is rejected as incomplete', async () => {
  const worker = await getWorker()
  const env = makeEnv({ proof: null })
  const res = await worker.fetch(post(validPayload), env)
  const body = await res.json()
  assert.equal(body.status, 'NULL')
  assert.equal(body.reason, 'proof_missing')
})

test('ungoverned_agent_tool_call: replayed mutation invocation returns NULL', async () => {
  const worker = await getWorker()
  const env = makeEnv()
  const first = await worker.fetch(post(validPayload), env)
  assert.equal((await first.json()).status, 'PROVEN')

  const replay = await worker.fetch(post(validPayload), env)
  const body = await replay.json()
  assert.equal(body.status, 'NULL')
  assert.equal(body.reason, 'agent_tool_invocation_replay')
})

test('ungoverned_agent_tool_call: read-only tool does not require execution authority and does not mutate state', async () => {
  const worker = await getWorker()
  const env = makeEnv({ authority: null, validation: null, execution: null, proof: null })
  const res = await worker.fetch(post({ policy_class: 'TOOL_RECONCILIATION_READONLY', target: { tool_surface: 'reconciliation_readonly' } }), env)
  const body = await res.json()
  assert.equal(body.status, 'READONLY_OBSERVED')
  assert.equal(body.execution_authority_required, false)
  assert.equal(body.runtime_mutated, false)
  assert.equal(env.writes.length, 0)
})

test('ungoverned_agent_tool_call: validated_object equals executed_object for proven invocation', async () => {
  const worker = await getWorker()
  const env = makeEnv()
  const res = await worker.fetch(post(validPayload), env)
  const body = await res.json()
  assert.equal(body.status, 'PROVEN')
  assert.equal(body.validated_object_hash, validatedObjectHash)
  assert.equal(body.executed_object_hash, validatedObjectHash)
  assert.equal(body.validated_object_equals_executed_object, true)
})
