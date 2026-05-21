import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

function workerFromSource() {
  return import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)
}

test('issue-870: governance dependency metrics are deterministic read-only observability derived from telemetry', async () => {
  const worker = (await workerFromSource()).default
  const sqlCalls = []
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        sqlCalls.push(sql)
        return {
          all: async () => ({ results: [
            { event_type: 'governed_execution_attempted', count: 4 },
            { event_type: 'governed_execution_completed', count: 3 },
            { event_type: 'invalid_execution_blocked', count: 2 },
            { event_type: 'replay_rejected', count: 1 },
            { event_type: 'continuity_rejected', count: 1 },
            { event_type: 'proof_generated', count: 2 },
          ] })
        }
      }
    }
  }

  const response = await worker.fetch(new Request('https://runtime.test/install-base/metrics'), env)
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.route, '/install-base/metrics')
  assert.equal(payload.reason, 'observability_only')
  assert.equal(payload.metrics.governance_dependency_ratio, 0.75)
  assert.equal(payload.metrics.fail_closed_interception_ratio, 1)
  assert.equal(payload.metrics.proof_attachment_ratio, 0.666666666667)
  assert.equal(payload.metrics.replay_rejection_ratio, 1)
  assert.equal(payload.metrics.continuity_integrity_ratio, 0.75)
  assert.equal(payload.authority_issuance_influenced, false)
  assert.equal(payload.validator_decisions_influenced, false)
  assert.equal(payload.execution_eligibility_influenced, false)
  assert.equal(payload.proof_legitimacy_influenced, false)
  assert.equal(sqlCalls.length, 1)
  assert.match(sqlCalls[0], /SELECT event_type, COUNT\(\*\) AS count FROM install_base_telemetry_registry GROUP BY event_type/)
})

test('issue-870: telemetry absence returns deterministic null metrics and route is GET only', async () => {
  const worker = (await workerFromSource()).default
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare() {
        return { all: async () => ({ results: [] }) }
      }
    }
  }

  const getResponse = await worker.fetch(new Request('https://runtime.test/install-base/metrics'), env)
  assert.equal(getResponse.status, 200)
  const getPayload = await getResponse.json()
  assert.equal(getPayload.metrics.governance_dependency_ratio, null)
  assert.equal(getPayload.metrics.fail_closed_interception_ratio, null)
  assert.equal(getPayload.metrics.proof_attachment_ratio, null)
  assert.equal(getPayload.metrics.replay_rejection_ratio, null)
  assert.equal(getPayload.metrics.continuity_integrity_ratio, null)

  const postResponse = await worker.fetch(new Request('https://runtime.test/install-base/metrics', { method: 'POST' }), env)
  assert.equal(postResponse.status, 405)
  assert.deepEqual(await postResponse.json(), {
    status: 'NULL',
    route: '/install-base/metrics',
    reason: 'get_only',
    evidence_only: true,
    read_only: true,
    mutation_capable: false,
    replay_neutral: true,
    creates_authority: false,
    proof_created: false,
  })
})
