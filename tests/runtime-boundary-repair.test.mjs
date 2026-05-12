import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const canonicalRoutes = ['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof']

test('canonical executable runtime routes exclude governance and observability surfaces', () => {
  assert.match(source, /CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\] as const/)
  assert.doesNotMatch(source.match(/CANONICAL_RUNTIME_ROUTES = \[[^\]]+\]/)?.[0] ?? '', /\/preo|\/reconcile/)

  const rootSurfaces = JSON.parse(readFileSync(new URL('../EXECUTION_SURFACES.json', import.meta.url), 'utf8'))
  assert.deepEqual(rootSurfaces.canonical_runtime_route, canonicalRoutes)

  const runtimeSurfaces = JSON.parse(readFileSync(new URL('../governance/runtime/EXECUTION_SURFACES.json', import.meta.url), 'utf8'))
  assert.deepEqual(runtimeSurfaces.canonical_executable_routes, canonicalRoutes)
  assert.equal(runtimeSurfaces.governance_evidence_routes[0].authoritative_for_execution, false)
  assert.equal(runtimeSurfaces.observability_only_routes[0].authoritative_for_execution, false)
})

test('/reconcile is non-executable and cannot initialize or mutate runtime state', async () => {
  const worker = (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
  const calls = []
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        calls.push(sql)
        throw new Error('reconcile must not touch DB')
      }
    }
  }

  const getResponse = await worker.fetch(new Request('https://runtime.test/reconcile'), env)
  assert.equal(getResponse.status, 200)
  assert.deepEqual(await getResponse.json(), { status: 'NULL', route: '/reconcile', reason: 'observability_only' })

  const postResponse = await worker.fetch(new Request('https://runtime.test/reconcile', {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify({ mutate: true })
  }), env)
  assert.equal(postResponse.status, 405)
  assert.deepEqual(await postResponse.json(), { status: 'NULL', route: '/reconcile', reason: 'observability_only' })
  assert.deepEqual(calls, [])
})

test('PREO lineage is explicitly gated and not an implicit compile dependency', () => {
  assert.match(source, /const requirePreoLineage = preoGovernanceEnabled\(constraints, target\)/)
  assert.match(source, /const requirePreoLineage = preoGovernanceEnabled\(authorityConstraints, target\)/)
  assert.match(source, /deploymentPreoLineage\(env, params\.decision_id, params\.validated_object_hash, params\.authority, requirePreoLineage\)/)
  assert.doesNotMatch(source, /validateDeploymentProvenance[\s\S]*deploymentPreoLineage\(env, params\.decision_id, params\.validated_object_hash, params\.authority, true\)/)
})
