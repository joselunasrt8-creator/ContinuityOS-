/**
 * tests/issue-1054-distributed-topology-visualization-projection.test.mjs
 * Issue #1054 — Distributed Topology Visualization Projection
 *
 * FATE tests proving deterministic evidence-only visualization projection
 * semantics over distributed topology convergence artifacts.
 *
 * Evidence only — no authority creation, no execution, no registry mutation,
 * no reconciliation, no automatic repair.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  TOPOLOGY_VISUALIZATION_RESULTS,
  buildDistributedTopologyVisualizationProjection,
  computeTopologyVisualizationProjectionHash,
} from '../src/distributed-topology-visualization-projection.ts'

import {
  buildTopologyParticipantView,
  evaluateDistributedTopologyConvergence,
  TOPOLOGY_PARTICIPANT_STATES,
} from '../src/distributed-topology-convergence.ts'

// ── Test fixtures ──────────────────────────────────────────────────────────────

const HASH_A = createHash('sha256').update('surface-graph-a').digest('hex')
const HASH_B = createHash('sha256').update('surface-graph-b').digest('hex')

function makeView(overrides = {}) {
  return buildTopologyParticipantView({
    participant_id: 'node-1',
    topology_epoch: 'epoch-42',
    surface_graph_hash: HASH_A,
    arbitration_hash: null,
    participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_CURRENT,
    observed_at: '2026-01-01T00:00:00Z',
    ...overrides,
  })
}

function makeConvergence(viewsData, threshold = 2) {
  const views = viewsData.map((d) => makeView(d))
  return evaluateDistributedTopologyConvergence({
    participant_views: views,
    quorum_threshold: threshold,
    arbitration_evidence: null,
  })
}

// ── 1. Artifact shape and boundary invariants ──────────────────────────────────

test('projection artifact has correct artifact_type and evidence-only fields', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n3', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  assert.equal(proj.artifact_type, 'DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION')
  assert.equal(proj.evidence_only, true)
  assert.equal(proj.projection_result, TOPOLOGY_VISUALIZATION_RESULTS.PROJECTED)
  assert.equal(typeof proj.projection_hash, 'string')
  assert.match(proj.projection_hash, /^[0-9a-f]{64}$/)
  assert.equal(typeof proj.source_observation_hash, 'string')
  assert.match(proj.source_observation_hash, /^[0-9a-f]{64}$/)
  assert.equal(typeof proj.distributed_topology_hash, 'string')
  assert.match(proj.distributed_topology_hash, /^[0-9a-f]{64}$/)
})

test('projection artifact does not expose authority, execution, proof, or mutation fields', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  assert.ok(!('creates_authority' in proj) || proj.creates_authority === false)
  assert.ok(!('creates_execution' in proj) || proj.creates_execution === false)
  assert.ok(!('creates_proof' in proj) || proj.creates_proof === false)
  assert.ok(!('mutates_registry' in proj) || proj.mutates_registry === false)
})

// ── 2. Fail-closed: missing or invalid artifact_type ──────────────────────────

test('returns NULL projection when artifact_type is missing', () => {
  const proj = buildDistributedTopologyVisualizationProjection({})
  assert.equal(proj.projection_result, TOPOLOGY_VISUALIZATION_RESULTS.NULL)
  assert.deepEqual(proj.nodes, [])
  assert.deepEqual(proj.edges, [])
})

test('returns NULL projection when artifact_type is an unknown string', () => {
  const proj = buildDistributedTopologyVisualizationProjection({
    artifact: 'UNKNOWN_ARTIFACT',
    evidence_only: true,
  })
  assert.equal(proj.projection_result, TOPOLOGY_VISUALIZATION_RESULTS.NULL)
})

test('returns NULL projection when input is null', () => {
  const proj = buildDistributedTopologyVisualizationProjection(null)
  assert.equal(proj.projection_result, TOPOLOGY_VISUALIZATION_RESULTS.NULL)
})

test('returns NULL projection when input is a primitive', () => {
  const proj = buildDistributedTopologyVisualizationProjection('not-an-object')
  assert.equal(proj.projection_result, TOPOLOGY_VISUALIZATION_RESULTS.NULL)
})

test('returns NULL projection when evidence_only is false', () => {
  const proj = buildDistributedTopologyVisualizationProjection({
    artifact: 'DISTRIBUTED_TOPOLOGY_CONVERGENCE',
    evidence_only: false,
    distributed_topology_hash: HASH_A,
  })
  assert.equal(proj.projection_result, TOPOLOGY_VISUALIZATION_RESULTS.NULL)
})

test('returns NULL projection when distributed_topology_hash is missing', () => {
  const proj = buildDistributedTopologyVisualizationProjection({
    artifact: 'DISTRIBUTED_TOPOLOGY_CONVERGENCE',
    evidence_only: true,
  })
  assert.equal(proj.projection_result, TOPOLOGY_VISUALIZATION_RESULTS.NULL)
})

test('returns NULL projection when distributed_topology_hash is not valid SHA-256 hex', () => {
  const proj = buildDistributedTopologyVisualizationProjection({
    artifact: 'DISTRIBUTED_TOPOLOGY_CONVERGENCE',
    evidence_only: true,
    distributed_topology_hash: 'not-a-hash',
  })
  assert.equal(proj.projection_result, TOPOLOGY_VISUALIZATION_RESULTS.NULL)
})

// ── 3. NULL projection shape completeness ─────────────────────────────────────

test('NULL projection still has well-formed hashes and zero metrics', () => {
  const proj = buildDistributedTopologyVisualizationProjection(null)

  assert.equal(proj.artifact_type, 'DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION')
  assert.equal(proj.evidence_only, true)
  assert.match(proj.source_observation_hash, /^[0-9a-f]{64}$/)
  assert.match(proj.distributed_topology_hash, /^[0-9a-f]{64}$/)
  assert.match(proj.projection_hash, /^[0-9a-f]{64}$/)
  assert.equal(proj.metrics.participant_count, 0)
  assert.equal(proj.metrics.converged_count, 0)
  assert.equal(proj.metrics.divergent_count, 0)
})

// ── 4. Converged topology projection ──────────────────────────────────────────

test('converged topology produces PROJECTED result with correct node types', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n3', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  assert.equal(proj.projection_result, TOPOLOGY_VISUALIZATION_RESULTS.PROJECTED)

  const nodeTypes = proj.nodes.map((n) => n.node_type)
  assert.ok(nodeTypes.includes('topology'), 'must have topology node')
  assert.ok(nodeTypes.includes('quorum'), 'must have quorum node')
  assert.ok(nodeTypes.includes('participant'), 'must have participant nodes')
})

test('converged topology has correct participant count in metrics', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n3', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  assert.equal(proj.metrics.participant_count, 3)
  assert.equal(proj.metrics.converged_count, 3)
  assert.equal(proj.metrics.divergent_count, 0)
  assert.equal(proj.metrics.stale_count, 0)
})

// ── 5. Node fields and evidence hashes ────────────────────────────────────────

test('topology node carries distributed_topology_hash as evidence_hash', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  const topNode = proj.nodes.find((n) => n.node_type === 'topology')
  assert.ok(topNode, 'topology node must exist')
  assert.equal(topNode.evidence_hash, convergence.distributed_topology_hash)
  assert.equal(topNode.state, convergence.convergence_result)
})

test('quorum node reflects quorum_result as state', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  const quorumNode = proj.nodes.find((n) => n.node_type === 'quorum')
  assert.ok(quorumNode, 'quorum node must exist')
  assert.equal(quorumNode.state, convergence.quorum_result)
})

test('participant nodes have valid evidence_hash values', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n3', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  const participantNodes = proj.nodes.filter((n) => n.node_type === 'participant')
  assert.equal(participantNodes.length, 3)

  for (const node of participantNodes) {
    assert.ok(node.evidence_hash !== null, 'evidence_hash must not be null for valid participant')
    assert.match(node.evidence_hash, /^[0-9a-f]{64}$/)
  }
})

// ── 6. Edge types ──────────────────────────────────────────────────────────────

test('converged topology produces PARTICIPATES_IN and CONTRIBUTES_TO_QUORUM edges', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  const edgeTypes = new Set(proj.edges.map((e) => e.edge_type))
  assert.ok(edgeTypes.has('PARTICIPATES_IN'))
  assert.ok(edgeTypes.has('CONTRIBUTES_TO_QUORUM'))
  assert.ok(edgeTypes.has('BELONGS_TO_TOPOLOGY'))
})

test('each participant has exactly one PARTICIPATES_IN and one CONTRIBUTES_TO_QUORUM edge', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n3', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  const participantNodes = proj.nodes.filter((n) => n.node_type === 'participant')
  const participatesEdges = proj.edges.filter((e) => e.edge_type === 'PARTICIPATES_IN')
  const quorumEdges = proj.edges.filter((e) => e.edge_type === 'CONTRIBUTES_TO_QUORUM')

  assert.equal(participatesEdges.length, participantNodes.length)
  assert.equal(quorumEdges.length, participantNodes.length)
})

test('no TRIGGERS_BOUNDARY edge on clean convergence', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  const boundaryEdges = proj.edges.filter((e) => e.edge_type === 'TRIGGERS_BOUNDARY')
  assert.equal(boundaryEdges.length, 0)
})

// ── 7. Quorum collapsed projection ────────────────────────────────────────────

test('quorum-collapsed convergence produces collapse_reason node and COLLAPSES_TO edge', () => {
  const convergence = makeConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
      { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    ],
    10, // threshold unreachable
  )
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  assert.equal(proj.projection_result, TOPOLOGY_VISUALIZATION_RESULTS.PROJECTED)

  const collapseNode = proj.nodes.find((n) => n.node_type === 'collapse_reason')
  assert.ok(collapseNode, 'collapse_reason node must exist')

  const collapseEdges = proj.edges.filter((e) => e.edge_type === 'COLLAPSES_TO')
  assert.equal(collapseEdges.length, 1)
  assert.equal(collapseEdges[0].to, collapseNode.node_id)
})

test('quorum-collapsed metrics reflect correct counts', () => {
  const convergence = makeConvergence(
    [
      { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
      {
        participant_id: 'n2',
        topology_epoch: 'e1',
        surface_graph_hash: HASH_A,
        participant_state: TOPOLOGY_PARTICIPANT_STATES.PARTICIPANT_STALE,
      },
    ],
    5,
  )
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  assert.equal(proj.metrics.participant_count, 2)
  assert.equal(proj.metrics.stale_count, 1)
})

// ── 8. Diverged topology projection ───────────────────────────────────────────

test('diverged topology produces PROJECTED result without collapse_reason', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e2', surface_graph_hash: HASH_B },
    { participant_id: 'n3', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  assert.equal(proj.projection_result, TOPOLOGY_VISUALIZATION_RESULTS.PROJECTED)
  assert.equal(convergence.convergence_result, 'TOPOLOGY_DIVERGED')

  const collapseNode = proj.nodes.find((n) => n.node_type === 'collapse_reason')
  assert.ok(!collapseNode, 'no collapse_reason node for TOPOLOGY_DIVERGED')
})

test('diverged topology metrics include divergent count', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e2', surface_graph_hash: HASH_B },
    { participant_id: 'n3', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  assert.equal(proj.metrics.participant_count, 3)
  assert.ok(proj.metrics.divergent_count >= 0)
})

// ── 9. Determinism: same input → same projection_hash ─────────────────────────

test('projection is deterministic: identical inputs produce identical projection_hash', () => {
  const views = [
    { participant_id: 'n1', topology_epoch: 'epoch-99', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'epoch-99', surface_graph_hash: HASH_A },
    { participant_id: 'n3', topology_epoch: 'epoch-99', surface_graph_hash: HASH_A },
  ]
  const convergence1 = makeConvergence(views)
  const convergence2 = makeConvergence(views)

  const proj1 = buildDistributedTopologyVisualizationProjection(convergence1)
  const proj2 = buildDistributedTopologyVisualizationProjection(convergence2)

  assert.equal(proj1.projection_hash, proj2.projection_hash)
  assert.equal(proj1.source_observation_hash, proj2.source_observation_hash)
  assert.equal(proj1.distributed_topology_hash, proj2.distributed_topology_hash)
})

test('different convergence inputs produce different projection hashes', () => {
  const convergence1 = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'epoch-1', surface_graph_hash: HASH_A },
  ])
  const convergence2 = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'epoch-2', surface_graph_hash: HASH_B },
    { participant_id: 'n2', topology_epoch: 'epoch-2', surface_graph_hash: HASH_B },
  ])

  const proj1 = buildDistributedTopologyVisualizationProjection(convergence1)
  const proj2 = buildDistributedTopologyVisualizationProjection(convergence2)

  assert.notEqual(proj1.projection_hash, proj2.projection_hash)
})

// ── 10. Hash integrity: computeTopologyVisualizationProjectionHash ─────────────

test('computeTopologyVisualizationProjectionHash matches stored projection_hash', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  const recomputed = computeTopologyVisualizationProjectionHash(
    proj,
  )
  assert.equal(recomputed, proj.projection_hash)
})

test('altering projection fields changes projection_hash', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  const tampered = {
    ...proj,
    metrics: { ...proj.metrics, participant_count: 999 },
  }
  const tamperedHash = computeTopologyVisualizationProjectionHash(tampered)
  assert.notEqual(tamperedHash, proj.projection_hash)
})

// ── 11. source_observation_hash reflects input fingerprint ─────────────────────

test('source_observation_hash changes when input changes', () => {
  const c1 = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const c2 = makeConvergence([
    { participant_id: 'x1', topology_epoch: 'e9', surface_graph_hash: HASH_B },
    { participant_id: 'x2', topology_epoch: 'e9', surface_graph_hash: HASH_B },
  ])

  const p1 = buildDistributedTopologyVisualizationProjection(c1)
  const p2 = buildDistributedTopologyVisualizationProjection(c2)

  assert.notEqual(p1.source_observation_hash, p2.source_observation_hash)
})

// ── 12. Projected distributed_topology_hash matches convergence artifact ───────

test('distributed_topology_hash in projection matches convergence artifact hash', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  assert.equal(proj.distributed_topology_hash, convergence.distributed_topology_hash)
})

// ── 13. Missing evidence count ─────────────────────────────────────────────────

test('missing_evidence_count is zero when all participant hashes are valid', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  assert.equal(proj.metrics.missing_evidence_count, 0)
})

// ── 14. Node and edge IDs are non-empty strings ────────────────────────────────

test('all node_ids and edge_ids are non-empty strings', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n3', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  for (const node of proj.nodes) {
    assert.ok(typeof node.node_id === 'string' && node.node_id.length > 0)
  }
  for (const edge of proj.edges) {
    assert.ok(typeof edge.edge_id === 'string' && edge.edge_id.length > 0)
    assert.ok(typeof edge.from === 'string' && edge.from.length > 0)
    assert.ok(typeof edge.to === 'string' && edge.to.length > 0)
  }
})

// ── 15. Boundary trigger count is zero for clean convergence ──────────────────

test('boundary_trigger_count is zero for clean convergence', () => {
  const convergence = makeConvergence([
    { participant_id: 'n1', topology_epoch: 'e1', surface_graph_hash: HASH_A },
    { participant_id: 'n2', topology_epoch: 'e1', surface_graph_hash: HASH_A },
  ])
  const proj = buildDistributedTopologyVisualizationProjection(convergence)

  assert.equal(proj.metrics.boundary_trigger_count, 0)
})
