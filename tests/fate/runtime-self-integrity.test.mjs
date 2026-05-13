import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

class D1 { prepare() { return { bind() { return this }, all() { return Promise.resolve({ results: [] }) }, first() { return Promise.resolve(null) }, run() { return Promise.resolve({ meta: { changes: 1 } }) } } } }
async function worker() {
  const { transformSync } = await import('esbuild')
  return (await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`)).default
}

test('runtime self-integrity checkpoint is deterministic', async () => {
  const runtime = await worker()
  const one = await (await runtime.fetch(new Request('https://runtime.test/governance/recursive/self-integrity'), { DB: new D1() })).json()
  const two = await (await runtime.fetch(new Request('https://runtime.test/governance/recursive/self-integrity'), { DB: new D1() })).json()
  assert.equal(one.checkpoint.runtime_surface_hash, two.checkpoint.runtime_surface_hash)
  assert.equal(one.checkpoint.governance_checkpoint_hash, two.checkpoint.governance_checkpoint_hash)
  assert.equal(one.checkpoint.recursive_integrity_hash, two.checkpoint.recursive_integrity_hash)
  assert.equal(one.runtime_ready, true)
})

test('runtime self-integrity mismatch returns NULL before activation', async () => {
  const runtime = await worker()
  const response = await runtime.fetch(new Request('https://runtime.test/health'), { DB: new D1(), CANONICAL_RUNTIME_SURFACE_HASH: 'bad-hash' })
  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.status, 'NULL')
  assert.equal(body.runtime_ready, false)
})
