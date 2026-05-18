import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

const targetedRoutes = [
  '/reconcile/closure', '/reconcile/impact', '/reconcile/verdict', '/reconcile/propagation', '/reconcile/topology-delta',
  '/runtime/sovereignty', '/runtime/bootstrap/verify', '/runtime/bootstrap/topology', '/runtime/bootstrap/checkpoint',
  '/registry/graph/verify', '/registry/graph/topology', '/registry/graph/checkpoint', '/registry/graph/orphans',
  '/topology/reconcile', '/topology/drift', '/topology/fingerprint', '/topology/equivalence',
  '/federation/reconcile', '/federation/reconcile/report', '/federation/reconcile/drift', '/federation/reconcile/checkpoint', '/federation/reconcile/topology', '/federation/reconcile/distributed', '/federation/conformance',
  '/governance/evolution/consensus', '/observer/consensus', '/observer/consensus/equivalence', '/conformance/external'
]

const escalationParams = 'creates_authority=true&mutation_capable=true&deploy_capable=true&proof_generating=true&merge_authorizing=true&remote_authority_inherited=true&remote_execution_legitimacy=true&replay_state_consumed=true'
const prohibitedRegistryWrites = ['authority_registry', 'canonical_aeo_registry', 'validation_registry', 'execution_registry', 'proof_registry', 'invocation_registry', 'governance_lock_registry', 'execution_replay_protection']

async function loadWorker() {
  const { transformSync } = await import('esbuild')
  const compiled = transformSync(source, { loader: 'ts', format: 'esm' }).code
  return (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)).default
}

function createEnv() {
  const writeSql = []
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        return {
          bind() { return this },
          run() { writeSql.push(sql); return Promise.resolve({ meta: { changes: 1 } }) },
          all() { return Promise.resolve({ results: [] }) },
          first() { return Promise.resolve(null) }
        }
      }
    }
  }
  return { env, writeSql }
}

test('issue #476 targeted observability routes reject non-GET methods fail-closed', async () => {
  const worker = await loadWorker()
  for (const route of targetedRoutes) {
    const { env } = createEnv()
    const response = await worker.fetch(new Request(`https://runtime.test${route}`, { method: 'POST', headers: { 'X-API-Key': 'test-key' } }), env)
    assert.ok([405, 200].includes(response.status), `${route} must fail closed`) // some routes return NULL with 200
    const payload = await response.json()
    assert.equal(payload.status, 'NULL', `${route} must deny non-GET`)
    assert.ok(['get_only', 'observability_only', 'route_not_found', 'database_unavailable', 'reconciliation_unavailable', 'consensus_unavailable', 'conformance_unavailable'].includes(payload.reason), `${route} unexpected fail-closed reason ${payload.reason}`)
  }
})

test('issue #476 escalation query parameters are denied on targeted observability routes', async () => {
  const worker = await loadWorker()
  for (const route of targetedRoutes) {
    const { env, writeSql } = createEnv()
    const response = await worker.fetch(new Request(`https://runtime.test${route}?${escalationParams}`, { method: 'GET', headers: { 'X-API-Key': 'test-key' } }), env)
    const payload = await response.json()

    const boolFalseKeys = ['creates_authority', 'mutation_capable', 'deploy_capable', 'proof_generating', 'merge_authorizing', 'remote_authority_inherited', 'remote_execution_legitimacy', 'replay_state_consumed', 'replay_consumed']
    for (const key of boolFalseKeys) {
      if (key in payload) assert.equal(payload[key], false, `${route} leaked escalation flag ${key}`)
    }
    if ('evidence_only' in payload) assert.equal(payload.evidence_only, true, `${route} must remain evidence-only`)
    if ('read_only' in payload) assert.equal(payload.read_only, true, `${route} must remain read-only`)
    if ('non_authoritative' in payload) assert.equal(payload.non_authoritative, true, `${route} must remain non-authoritative`)

    const prohibited = writeSql.filter((sql) => prohibitedRegistryWrites.some((registry) => sql.includes(registry)))
    assert.equal(prohibited.length, 0, `${route} attempted prohibited authority write: ${prohibited.join(';')}`)
  }
})

test('issue #476 cross-registry and governance artifacts classify observability as evidence-only and deterministic', () => {
  const cross = JSON.parse(readFileSync(new URL('../governance/cross-registry-reconciliation.json', import.meta.url), 'utf8'))
  const inventory = JSON.parse(readFileSync(new URL('../runtime/unauthorized_mutation_surface_inventory.json', import.meta.url), 'utf8'))
  const determinism = readFileSync(new URL('./governance-regeneration-determinism.test.mjs', import.meta.url), 'utf8')

  assert.match(JSON.stringify(cross), /evidence|non_authoritative|replay_neutral/i)
  assert.match(JSON.stringify(inventory), /observability|mutation|closure/i)
  assert.match(determinism, /governance:regenerate/)
  assert.match(determinism, /drifted across repeated governance regeneration/)
})
