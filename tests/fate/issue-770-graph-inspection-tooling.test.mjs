import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createProjection,
  deterministicProjectionHash,
  inspectProjection,
  verifyDeterministicRegeneration,
} from '../../runtime/control_graph_projection.ts'

const topologyHash = 'topo-hash'
const continuityHash = 'cont-hash'

function canonicalNodes() {
  return [
    { id: 'sess-1', type: 'session_registry', legitimacy_state: 'VALID' },
    { id: 'cont-1', type: 'continuity_registry', legitimacy_state: 'VALID' },
    { id: 'auth-1', type: 'authority_registry', legitimacy_state: 'VALID' },
    { id: 'preo-1', type: 'preo_registry', legitimacy_state: 'VALID' },
  ]
}

function canonicalEdges() {
  return [
    { from: 'sess-1', to: 'cont-1', relation: 'lineage' },
    { from: 'cont-1', to: 'auth-1', relation: 'lineage' },
    { from: 'auth-1', to: 'preo-1', relation: 'reconciliation' },
  ]
}

test('Issue #770: deterministic regeneration is ordering-neutral and replay-neutral', () => {
  const projectionA = createProjection(topologyHash, continuityHash, canonicalNodes(), canonicalEdges())
  const projectionB = createProjection(topologyHash, continuityHash, [...canonicalNodes()].reverse(), [...canonicalEdges()].reverse())
  assert.equal(verifyDeterministicRegeneration(projectionA, projectionB), true)
  assert.equal(deterministicProjectionHash(projectionA), deterministicProjectionHash(projectionB))
})

test('Issue #770: orphan lineage and stale evidence are detected fail-closed', () => {
  const projection = createProjection(
    topologyHash,
    continuityHash,
    [...canonicalNodes(), { id: 'proof-old', type: 'proof_registry', legitimacy_state: 'STALE' }],
    [...canonicalEdges(), { from: 'proof-old', to: 'missing-parent', relation: 'lineage' }],
  )
  const inspected = inspectProjection(projection, projection, canonicalNodes().map((node) => node.id))
  assert.equal(inspected.ok, false)
  assert.equal(inspected.fail_closed, false)
  assert.ok(inspected.issues.some((issue) => issue.class === 'orphan-induced'))
  assert.ok(inspected.issues.some((issue) => issue.class === 'stale-state-induced'))
})

test('Issue #770: PREO ancestry/continuity ordering drift is classified as ordering-induced', () => {
  const projection = createProjection(topologyHash, continuityHash, [...canonicalNodes()].reverse(), canonicalEdges())
  const inspected = inspectProjection(
    projection,
    projection,
    canonicalNodes().map((node) => node.id),
  )
  assert.equal(inspected.ok, false)
  assert.ok(inspected.issues.some((issue) => issue.class === 'ordering-induced'))
})
