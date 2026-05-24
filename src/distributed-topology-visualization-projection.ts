/**
 * src/distributed-topology-visualization-projection.ts
 * Issue #1054 — Distributed Topology Visualization Projection
 *
 * Evidence-only, read-only visualization projection layer on top of
 * distributed topology convergence and divergence observer artifacts.
 *
 * Canonical chain:
 *   distributed topology convergence (#1050)
 *   → divergence observation (#1052)
 *   → quorum drift telemetry (#1052)
 *   → visualization projection (this module)
 *
 * Critical boundary:
 *   This module must not create authority, validation, execution, proof,
 *   registry writes, reconciliation mutation, or automatic repair.
 *   It converts existing evidence into deterministic graph projection artifacts only.
 */

import { canonicalize, sha256Hex } from './canonical.js'

// ── Result constants ───────────────────────────────────────────────────────────

export const TOPOLOGY_VISUALIZATION_RESULTS = {
  PROJECTED: 'TOPOLOGY_VISUALIZATION_PROJECTED',
  NULL: 'TOPOLOGY_VISUALIZATION_NULL',
} as const

export type TopologyVisualizationResult =
  (typeof TOPOLOGY_VISUALIZATION_RESULTS)[keyof typeof TOPOLOGY_VISUALIZATION_RESULTS]

// ── Projection shape types ─────────────────────────────────────────────────────

type ProjectionNodeType = 'participant' | 'quorum' | 'boundary' | 'collapse_reason' | 'topology'

type ProjectionEdgeType =
  | 'PARTICIPATES_IN'
  | 'CONTRIBUTES_TO_QUORUM'
  | 'TRIGGERS_BOUNDARY'
  | 'COLLAPSES_TO'
  | 'BELONGS_TO_TOPOLOGY'

interface ProjectionNode {
  readonly node_id: string
  readonly node_type: ProjectionNodeType
  readonly state: string
  readonly evidence_hash: string | null
}

interface ProjectionEdge {
  readonly edge_id: string
  readonly edge_type: ProjectionEdgeType
  readonly from: string
  readonly to: string
}

interface ProjectionMetrics {
  readonly participant_count: number
  readonly converged_count: number
  readonly divergent_count: number
  readonly invalid_hash_count: number
  readonly stale_count: number
  readonly missing_evidence_count: number
  readonly boundary_trigger_count: number
}

export interface DistributedTopologyVisualizationProjection {
  readonly artifact_type: 'DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION'
  readonly evidence_only: true
  readonly source_observation_hash: string
  readonly distributed_topology_hash: string
  readonly projection_result: TopologyVisualizationResult
  readonly nodes: readonly ProjectionNode[]
  readonly edges: readonly ProjectionEdge[]
  readonly metrics: ProjectionMetrics
  readonly projection_hash: string
}

// ── Valid input artifact types ─────────────────────────────────────────────────

const VALID_INPUT_ARTIFACT_TYPES = new Set([
  'DISTRIBUTED_TOPOLOGY_CONVERGENCE',
  'DISTRIBUTED_TOPOLOGY_DIVERGENCE_OBSERVATION',
])

// ── Boundary violation class names (from convergence module) ──────────────────

const BOUNDARY_CLASS_NAMES = new Set([
  'topology_authority_attempt',
  'topology_execution_attempt',
  'topology_proof_attempt',
  'topology_registry_mutation',
  'topology_boundary_violation',
  'topology_implicit_consensus_forbidden',
  'topology_break_glass_normalization',
])

// ── Internal helpers ───────────────────────────────────────────────────────────

const HEX64_RE = /^[0-9a-f]{64}$/

function isValidSha256Hex(v: unknown): boolean {
  return typeof v === 'string' && HEX64_RE.test(v)
}

function safeObj(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }
  return input as Record<string, unknown>
}

// ── Hash function ──────────────────────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 hash for a visualization projection artifact.
 * Excludes projection_hash from the payload to prevent circularity.
 * Sorts nodes and edges by their IDs for canonical stability.
 */
export function computeTopologyVisualizationProjectionHash(
  fields: Record<string, unknown>,
): string {
  const { projection_hash: _excluded, ...rest } = fields

  const payload = {
    ...rest,
    nodes: Array.isArray(rest.nodes)
      ? [...(rest.nodes as ProjectionNode[])].sort((a, b) => a.node_id.localeCompare(b.node_id))
      : rest.nodes,
    edges: Array.isArray(rest.edges)
      ? [...(rest.edges as ProjectionEdge[])].sort((a, b) => a.edge_id.localeCompare(b.edge_id))
      : rest.edges,
  }

  return sha256Hex(canonicalize(payload))
}

// ── Null projection builder ────────────────────────────────────────────────────

function buildNullProjection(
  source_observation_hash: string,
  distributed_topology_hash: string,
): DistributedTopologyVisualizationProjection {
  const fields: Record<string, unknown> = {
    artifact_type: 'DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION',
    evidence_only: true,
    source_observation_hash,
    distributed_topology_hash,
    projection_result: TOPOLOGY_VISUALIZATION_RESULTS.NULL,
    nodes: [],
    edges: [],
    metrics: Object.freeze({
      participant_count: 0,
      converged_count: 0,
      divergent_count: 0,
      invalid_hash_count: 0,
      stale_count: 0,
      missing_evidence_count: 0,
      boundary_trigger_count: 0,
    }),
  }

  return Object.freeze({
    ...fields,
    nodes: Object.freeze([]),
    edges: Object.freeze([]),
    projection_hash: computeTopologyVisualizationProjectionHash(fields),
  }) as DistributedTopologyVisualizationProjection
}

// ── Projection builder ─────────────────────────────────────────────────────────

/**
 * Builds a DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION evidence artifact from
 * a convergence or divergence observation input artifact.
 *
 * Evidence only — does not create authority, execute, or mutate registries.
 * Fail closed if artifact_type is missing or invalid.
 * Converts existing convergence/divergence evidence into deterministic graph nodes and edges.
 */
export function buildDistributedTopologyVisualizationProjection(
  input: unknown,
): DistributedTopologyVisualizationProjection {
  const obj = safeObj(input)

  const source_observation_hash = sha256Hex(canonicalize(obj))
  const nullDistributedHash = sha256Hex('')

  // Step 1: Fail closed if artifact_type is missing or invalid
  const artifactType = obj.artifact ?? obj.artifact_type
  if (typeof artifactType !== 'string' || !VALID_INPUT_ARTIFACT_TYPES.has(artifactType)) {
    return buildNullProjection(source_observation_hash, nullDistributedHash)
  }

  // Step 2: Fail closed if not evidence_only
  if (obj.evidence_only !== true) {
    return buildNullProjection(source_observation_hash, nullDistributedHash)
  }

  // Step 3: Extract distributed_topology_hash — fail closed if not a valid SHA-256 hex
  if (!isValidSha256Hex(obj.distributed_topology_hash)) {
    return buildNullProjection(source_observation_hash, nullDistributedHash)
  }
  const distributed_topology_hash = obj.distributed_topology_hash as string

  // Step 4: Extract convergence fields
  const convergence_result =
    typeof obj.convergence_result === 'string' ? obj.convergence_result : 'NULL'
  const quorum_result = typeof obj.quorum_result === 'string' ? obj.quorum_result : 'NULL'

  const participant_hashes: string[] = Array.isArray(obj.participant_hashes)
    ? (obj.participant_hashes as unknown[]).filter((h): h is string => typeof h === 'string')
    : []

  const current_count =
    typeof obj.current_count === 'number' && obj.current_count >= 0
      ? Math.floor(obj.current_count)
      : 0
  const stale_count =
    typeof obj.stale_count === 'number' && obj.stale_count >= 0
      ? Math.floor(obj.stale_count)
      : 0
  const divergent_count =
    typeof obj.divergent_count === 'number' && obj.divergent_count >= 0
      ? Math.floor(obj.divergent_count)
      : 0

  const convergence_classes: string[] = Array.isArray(obj.convergence_classes)
    ? (obj.convergence_classes as unknown[]).filter((c): c is string => typeof c === 'string')
    : []

  // Step 5: Identify boundary classes and collapse state
  const activeBoundaryClasses = convergence_classes.filter((c) => BOUNDARY_CLASS_NAMES.has(c))
  const hasBoundary = activeBoundaryClasses.length > 0
  const hasCollapse = convergence_result === 'QUORUM_COLLAPSED'

  // Step 6: Build structural node IDs
  const topologyNodeId = 'topology:' + distributed_topology_hash.slice(0, 16)
  const quorumNodeId = 'quorum:' + source_observation_hash.slice(0, 16)
  const boundaryNodeId = 'boundary:' + distributed_topology_hash.slice(0, 16)
  const collapseNodeId = 'collapse_reason:' + distributed_topology_hash.slice(0, 16)

  // Step 7: Build nodes
  const nodes: ProjectionNode[] = []

  nodes.push(
    Object.freeze({
      node_id: topologyNodeId,
      node_type: 'topology' as const,
      state: convergence_result,
      evidence_hash: distributed_topology_hash,
    }),
  )

  nodes.push(
    Object.freeze({
      node_id: quorumNodeId,
      node_type: 'quorum' as const,
      state: quorum_result,
      evidence_hash: source_observation_hash,
    }),
  )

  if (hasBoundary) {
    nodes.push(
      Object.freeze({
        node_id: boundaryNodeId,
        node_type: 'boundary' as const,
        state: activeBoundaryClasses[0],
        evidence_hash: distributed_topology_hash,
      }),
    )
  }

  if (hasCollapse) {
    const collapseState =
      convergence_classes.find(
        (c) => c === 'quorum_collapsed' || c === 'quorum_not_satisfied',
      ) ?? 'QUORUM_COLLAPSED'
    nodes.push(
      Object.freeze({
        node_id: collapseNodeId,
        node_type: 'collapse_reason' as const,
        state: collapseState,
        evidence_hash: distributed_topology_hash,
      }),
    )
  }

  // Participant nodes — assign states deterministically from aggregate counts
  let invalid_hash_count = 0
  let assigned_current = 0
  let assigned_stale = 0
  let assigned_divergent = 0

  for (const hash of participant_hashes) {
    const validHash = isValidSha256Hex(hash)
    if (!validHash) {
      invalid_hash_count++
    }

    let state: string
    if (assigned_current < current_count) {
      state = 'PARTICIPANT_CURRENT'
      assigned_current++
    } else if (assigned_stale < stale_count) {
      state = 'PARTICIPANT_STALE'
      assigned_stale++
    } else if (assigned_divergent < divergent_count) {
      state = 'PARTICIPANT_DIVERGENT'
      assigned_divergent++
    } else {
      state = 'PARTICIPANT_UNTRUSTED'
    }

    const participantNodeId =
      'participant:' + (validHash ? hash.slice(0, 16) : sha256Hex(hash).slice(0, 16))

    nodes.push(
      Object.freeze({
        node_id: participantNodeId,
        node_type: 'participant' as const,
        state,
        evidence_hash: validHash ? hash : null,
      }),
    )
  }

  // Step 8: Build edges
  const edges: ProjectionEdge[] = []

  // Quorum → topology
  edges.push(
    Object.freeze({
      edge_id: `BELONGS_TO_TOPOLOGY:${quorumNodeId}:${topologyNodeId}`,
      edge_type: 'BELONGS_TO_TOPOLOGY' as const,
      from: quorumNodeId,
      to: topologyNodeId,
    }),
  )

  // Participant → topology and → quorum
  for (const node of nodes.filter((n) => n.node_type === 'participant')) {
    edges.push(
      Object.freeze({
        edge_id: `PARTICIPATES_IN:${node.node_id}:${topologyNodeId}`,
        edge_type: 'PARTICIPATES_IN' as const,
        from: node.node_id,
        to: topologyNodeId,
      }),
    )
    edges.push(
      Object.freeze({
        edge_id: `CONTRIBUTES_TO_QUORUM:${node.node_id}:${quorumNodeId}`,
        edge_type: 'CONTRIBUTES_TO_QUORUM' as const,
        from: node.node_id,
        to: quorumNodeId,
      }),
    )
  }

  // Boundary edges
  if (hasBoundary) {
    edges.push(
      Object.freeze({
        edge_id: `TRIGGERS_BOUNDARY:${topologyNodeId}:${boundaryNodeId}`,
        edge_type: 'TRIGGERS_BOUNDARY' as const,
        from: topologyNodeId,
        to: boundaryNodeId,
      }),
    )
    edges.push(
      Object.freeze({
        edge_id: `BELONGS_TO_TOPOLOGY:${boundaryNodeId}:${topologyNodeId}`,
        edge_type: 'BELONGS_TO_TOPOLOGY' as const,
        from: boundaryNodeId,
        to: topologyNodeId,
      }),
    )
  }

  // Collapse edge
  if (hasCollapse) {
    edges.push(
      Object.freeze({
        edge_id: `COLLAPSES_TO:${topologyNodeId}:${collapseNodeId}`,
        edge_type: 'COLLAPSES_TO' as const,
        from: topologyNodeId,
        to: collapseNodeId,
      }),
    )
  }

  // Step 9: Compute metrics
  const boundary_trigger_count = edges.filter((e) => e.edge_type === 'TRIGGERS_BOUNDARY').length
  const missing_evidence_count = nodes.filter((n) => n.evidence_hash === null).length

  const metrics: ProjectionMetrics = Object.freeze({
    participant_count: participant_hashes.length,
    converged_count: current_count,
    divergent_count,
    invalid_hash_count,
    stale_count,
    missing_evidence_count,
    boundary_trigger_count,
  })

  // Step 10: Assemble final projection artifact
  const frozenNodes = Object.freeze(nodes.map((n) => Object.freeze({ ...n })))
  const frozenEdges = Object.freeze(edges.map((e) => Object.freeze({ ...e })))

  const fields: Record<string, unknown> = {
    artifact_type: 'DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION',
    evidence_only: true,
    source_observation_hash,
    distributed_topology_hash,
    projection_result: TOPOLOGY_VISUALIZATION_RESULTS.PROJECTED,
    nodes: frozenNodes,
    edges: frozenEdges,
    metrics,
  }

  return Object.freeze({
    ...fields,
    projection_hash: computeTopologyVisualizationProjectionHash(fields),
  }) as DistributedTopologyVisualizationProjection
}
