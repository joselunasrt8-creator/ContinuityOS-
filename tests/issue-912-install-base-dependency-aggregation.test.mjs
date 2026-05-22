import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
function workerFromSource() {
  return import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)
}

test('issue-912: install-base aggregation derives required execution dependency metrics', async () => {
  const worker = (await workerFromSource()).default
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare() {
        return {
          all: async () => ({ results: [
            { event_type: 'governed_execution_completed', count: 5 },
            { event_type: 'validated_execution', count: 6 },
            { event_type: 'invalid_execution_blocked', count: 2 },
            { event_type: 'replay_rejected', count: 1 },
            { event_type: 'proof_generated', count: 4 },
            { event_type: 'execution_surface_observed', count: 3 },
          ] })
        }
      }
    }
  }

  const res = await worker.fetch(new Request('https://runtime.test/install-base/metrics'), env)
  const payload = await res.json()
  assert.equal(payload.metrics.governed_execution_total, 5)
  assert.equal(payload.metrics.validated_execution_total, 6)
  assert.equal(payload.metrics.blocked_execution_total, 2)
  assert.equal(payload.metrics.replay_rejection_total, 1)
  assert.equal(payload.metrics.proof_generated_total, 4)
  assert.equal(payload.metrics.execution_surface_count, 3)
  assert.equal(payload.metrics.cost_per_legitimate_execution, null)
})

test('issue-912: proof missing does not increment proof_generated_total and telemetry route is read-only', async () => {
  const worker = (await workerFromSource()).default
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare() {
        return { all: async () => ({ results: [{ event_type: 'governed_execution_completed', count: 2 }] }) }
      }
    }
  }

  const getRes = await worker.fetch(new Request('https://runtime.test/install-base/metrics'), env)
  const getPayload = await getRes.json()
  assert.equal(getPayload.metrics.proof_generated_total, 0)

  const postRes = await worker.fetch(new Request('https://runtime.test/install-base/metrics', { method: 'POST' }), env)
  const postPayload = await postRes.json()
  assert.equal(postRes.status, 405)
  assert.equal(postPayload.proof_created, false)
  assert.equal(postPayload.mutation_capable, false)
  assert.equal(postPayload.creates_authority, false)
})
