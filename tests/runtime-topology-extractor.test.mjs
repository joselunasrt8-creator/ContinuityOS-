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
  assert.ok(out.summary)
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

test('artifact roles and risk scope classify expected paths', () => {
  const out = extractRuntimeTopology(process.cwd())
  const byPath = new Map(out.nodes.map((n) => [n.file_path, n]))
  assert.equal(byPath.get('tests/runtime-topology-extractor.test.mjs')?.artifact_role, 'test')
  assert.equal(byPath.get('tests/fixtures/valid-proof.json')?.artifact_role, 'fixture')
  assert.equal(byPath.get('docs/legitimacy-topology-classification.md')?.artifact_role, 'doc')
  assert.equal(byPath.get('graph/runtime-topology.sample.json')?.artifact_role, 'generated')
  assert.equal(byPath.get('runtime/topology/runtime_graph.json')?.artifact_role, 'topology_metadata')
  assert.equal(byPath.get('.github/workflows/governed-deploy.yml')?.artifact_role, 'workflow')
  assert.equal(byPath.get('src/index.ts')?.artifact_role, 'runtime')

  assert.equal(byPath.get('tests/runtime-topology-extractor.test.mjs')?.risk_scope, 'test_only')
  assert.equal(byPath.get('docs/legitimacy-topology-classification.md')?.risk_scope, 'documentation_only')
  assert.equal(byPath.get('.github/workflows/governed-deploy.yml')?.risk_scope, 'ci_workflow')
  assert.equal(byPath.get('src/index.ts')?.risk_scope, 'production_runtime')
})

test('production closure relevance excludes observational artifacts', () => {
  const out = extractRuntimeTopology(process.cwd())
  for (const n of out.nodes) {
    if (['test', 'fixture', 'doc', 'generated', 'topology_metadata'].includes(n.artifact_role)) {
      assert.equal(n.production_closure_relevant, false, `${n.file_path} should be non-production relevant`)
    }
  }
  assert.ok(out.nodes.some((n) => ['runtime', 'workflow', 'script', 'migration'].includes(n.artifact_role) && n.production_closure_relevant))
  for (const n of out.nodes.filter((node) => node.artifact_role === 'config')) {
    assert.equal(n.production_closure_relevant, n.mutation_capable)
  }
})

test('summary includes all and production-relevant closure counts', () => {
  const out = extractRuntimeTopology(process.cwd())
  assert.ok(out.summary.closure_status_counts_all)
  assert.ok(out.summary.closure_status_counts_production_relevant)
  assert.ok(out.summary.artifact_role_counts)
  assert.ok(out.summary.risk_scope_counts)
  assert.ok(out.summary.mutation_surface_counts_by_role)

  const totalAll = Object.values(out.summary.closure_status_counts_all).reduce((sum, count) => sum + Number(count), 0)
  const totalRelevant = Object.values(out.summary.closure_status_counts_production_relevant).reduce((sum, count) => sum + Number(count), 0)

  assert.equal(totalAll, out.nodes.length)
  assert.ok(totalRelevant <= totalAll)
})
