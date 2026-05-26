import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { extractRuntimeTopology } from '../graph/runtime-topology-extractor.ts'

const allowedRelations = new Set([
  'CALLS','VALIDATES','WRITES_PROOF','CONSUMES_NONCE','DEPENDS_ON_AUTHORITY','DEPENDS_ON_CONTINUITY','RECONCILES_WITH','CLASSIFIES_FINALITY','MUTATES_STATE','REFERENCES_REGISTRY'
])

const allowedClosure = new Set(['OPEN','PARTIAL','CONTAINED','CLOSED','BREAK_GLASS'])

test('extractor emits schema-compatible shape', () => {
  const schema = JSON.parse(readFileSync(new URL('../graph/runtime-topology.schema.json', import.meta.url), 'utf8'))
  const out = extractRuntimeTopology(process.cwd())
  assert.equal(typeof out.generated_at, 'string')
  assert.ok(Array.isArray(out.nodes) && out.nodes.length > 0)
  assert.ok(Array.isArray(out.edges) && out.edges.length > 0)
  for (const req of schema.required) assert.ok(req in out)
})

test('classification coverage: mutation, validator, proof, replay', () => {
  const out = extractRuntimeTopology(process.cwd())
  assert.ok(out.nodes.some((n) => n.mutation_capable))
  assert.ok(out.nodes.some((n) => n.validator_bound))
  assert.ok(out.nodes.some((n) => n.proof_generating))
  assert.ok(out.nodes.some((n) => n.type === 'replay' || n.replay_safe))
})

test('all nodes have closure status and edges use allowed relation names', () => {
  const out = extractRuntimeTopology(process.cwd())
  for (const n of out.nodes) {
    assert.ok(allowedClosure.has(n.closure_status))
  }
  for (const e of out.edges) {
    assert.ok(allowedRelations.has(e.relation))
  }
})
