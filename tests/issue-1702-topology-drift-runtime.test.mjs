import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from './helpers/import-worker.mjs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const topologyAdmissionRoutes = ['/authority', '/compile', '/validate', '/execute']

let workerPromise
async function loadWorker() {
  workerPromise ||= importWorker().then((mod) => mod.default)
  return workerPromise
}

function createCapturingEnv() {
  const statements = []
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        const statement = {
          args: [],
          bind(...args) {
            this.args = args
            return this
          },
          async run() {
            statements.push({ sql, args: this.args })
            return { meta: { changes: 1 } }
          },
          async all() {
            return { results: [] }
          },
          async first() {
            return null
          }
        }
        return statement
      }
    }
  }
  return { env, statements }
}

function post(route, body = {}) {
  return new Request(`https://runtime.test${route}`, {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function driftInserts(statements) {
  return statements.filter(({ sql }) => sql.includes('INSERT INTO drift_registry'))
}

test('issue #1702 topology epoch admission routes retain topology_drift emission sites', () => {
  for (const route of topologyAdmissionRoutes) {
    const routeStart = source.indexOf(`url.pathname === "${route}"`)
    assert.notEqual(routeStart, -1, `${route} route block must exist`)
    const nextRouteStart = source.indexOf('\n\n    if (url.pathname === ', routeStart + 1)
    const routeBlock = source.slice(routeStart, nextRouteStart === -1 ? undefined : nextRouteStart)
    assert.match(
      routeBlock,
      /enforceTopologyEpochAdmission[\s\S]*drift_class:\s*"topology_drift"/,
      `${route} must preserve topology_drift topology epoch rejection emission`
    )
  }
})

test('issue #1702 topology epoch admission failures record topology_drift at runtime', async () => {
  const worker = await loadWorker()

  for (const route of topologyAdmissionRoutes) {
    const { env, statements } = createCapturingEnv()
    const response = await worker.fetch(post(route), env)
    const body = await response.json()

    assert.equal(body.status, 'NULL', `${route} must fail closed when topology_epoch is absent`)
    assert.equal(body.reason, 'missing_topology_epoch', `${route} must reject at topology epoch admission`)

    const driftRows = driftInserts(statements)
    assert.equal(driftRows.length, 1, `${route} must write one drift record for the admission failure`)
    assert.equal(driftRows[0].args[1], 'topology_drift', `${route} must emit topology_drift in drift_registry`)

    const driftPayload = JSON.parse(driftRows[0].args[5])
    assert.equal(driftPayload.route, route === '/authority' ? 'authority' : route, `${route} drift payload must preserve route identity`)
    assert.equal(driftPayload.indicator, 'missing_topology_epoch', `${route} drift payload must preserve admission reason`)
  }
})
