/**
 * src/temporal-legitimacy-replay-visualization.ts
 * Issue #1056 — Temporal Legitimacy Replay Visualization
 *
 * Evidence-only, read-only temporal replay visualization layer on top of the
 * distributed topology visualization projection artifacts from #1054.
 * Represents how topology legitimacy state evolves across ordered visualization snapshots.
 *
 * Temporal replay may be projected.
 * No replay visualization artifact may change legitimacy state.
 * Must not create authority, validation, execution, proof, registry writes,
 * reconciliation mutation, automatic repair, or runtime mutation.
 *
 * Depends on: distributed topology convergence (#1050), divergence observation (#1052),
 *             quorum drift telemetry (#1052), visualization projection (#1054).
 */

import { createHash } from 'node:crypto'

// ── Result constants ───────────────────────────────────────────────────────────

export const TEMPORAL_REPLAY_VISUALIZATION_RESULTS = {
  PROJECTED: 'TEMPORAL_REPLAY_PROJECTED',
  NULL: 'TEMPORAL_REPLAY_NULL',
} as const

export type TemporalReplayVisualizationResult =
  (typeof TEMPORAL_REPLAY_VISUALIZATION_RESULTS)[keyof typeof TEMPORAL_REPLAY_VISUALIZATION_RESULTS]

// ── Types ──────────────────────────────────────────────────────────────────────

export type ReplayTransitionType =
  | 'STABLE'
  | 'DIVERGENCE_INCREASED'
  | 'DIVERGENCE_DECREASED'
  | 'BOUNDARY_TRIGGERED'
  | 'COLLAPSE_CHANGED'
  | 'QUORUM_CHANGED'

export interface TemporalReplayFrame {
  readonly frame_index: number
  readonly source_projection_hash: string
  readonly distributed_topology_hash: string
  readonly projection_result: string
  readonly participant_count: number
  readonly divergent_count: number
  readonly boundary_trigger_count: number
  readonly collapse_reason: string | null
  readonly frame_hash: string
}

export interface TemporalReplayTransition {
  readonly transition_id: string
  readonly from_frame: number
  readonly to_frame: number
  readonly transition_type: ReplayTransitionType
  readonly from_hash: string
  readonly to_hash: string
}

export interface TemporalLegitimacyReplayVisualization {
  readonly artifact_type: 'TEMPORAL_LEGITIMACY_REPLAY_VISUALIZATION'
  readonly evidence_only: true
  readonly replay_id: string
  readonly replay_result: TemporalReplayVisualizationResult
  readonly frame_count: number
  readonly frames: readonly TemporalReplayFrame[]
  readonly transitions: readonly TemporalReplayTransition[]
  readonly temporal_replay_hash: string
}

export type DistributedTopologyVisualizationProjection = Record<string, unknown>

// ── Internal helpers ───────────────────────────────────────────────────────────

const HEX64_RE = /^[0-9a-f]{64}$/

function isValidSha256Hex(v: unknown): boolean {
  return typeof v === 'string' && HEX64_RE.test(v)
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + (value as unknown[]).map(canonicalJson).join(',') + ']'
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
}

function safeObj(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }
  return input as Record<string, unknown>
}

// ── Boundary detection ─────────────────────────────────────────────────────────

// Fields that must not appear in any projection or the temporal replay output.
// Presence of any of these keys indicates an attempted boundary violation.
const FORBIDDEN_PROJECTION_FIELDS = [
  'creates_authority',
  'authority',
  'validation_result',
  'creates_validation',
  'execution_result',
  'creates_execution',
  'proof',
  'creates_proof',
  'registry_write',
  'mutates_registry',
  'reconciliation_repair',
  'repairs_reconciliation',
  'automatic_repair',
  'mutates_runtime',
] as const

function detectProjectionBoundaryViolation(obj: Record<string, unknown>): string | null {
  for (const field of FORBIDDEN_PROJECTION_FIELDS) {
    if (field in obj) {
      return field
    }
  }
  return null
}

// ── Hash functions ─────────────────────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 hash for a temporal replay visualization artifact.
 * Excludes temporal_replay_hash from the payload to prevent circularity.
 */
export function computeTemporalReplayVisualizationHash(fields: Record<string, unknown>): string {
  const { temporal_replay_hash: _excluded, ...rest } = fields
  return createHash('sha256').update(canonicalJson(rest), 'utf8').digest('hex')
}

function computeVisualizationProjectionHashForVerification(
  projection: Record<string, unknown>,
): string {
  const { projection_hash: _excluded, ...rest } = projection
  return createHash('sha256').update(canonicalJson(rest), 'utf8').digest('hex')
}

function computeFrameHash(frameFields: Omit<TemporalReplayFrame, 'frame_hash'>): string {
  return createHash('sha256').update(canonicalJson(frameFields), 'utf8').digest('hex')
}

function computeTransitionId(
  from_frame: number,
  to_frame: number,
  from_hash: string,
  to_hash: string,
  transition_type: ReplayTransitionType,
): string {
  const payload = canonicalJson({ from_frame, from_hash, to_frame, to_hash, transition_type })
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

// ── Transition classification ──────────────────────────────────────────────────

function classifyTransition(
  prev: TemporalReplayFrame,
  next: TemporalReplayFrame,
): ReplayTransitionType {
  // Priority order: most specific boundary condition first
  if (next.boundary_trigger_count > prev.boundary_trigger_count) {
    return 'BOUNDARY_TRIGGERED'
  }
  if (next.collapse_reason !== prev.collapse_reason) {
    return 'COLLAPSE_CHANGED'
  }
  if (next.projection_result !== prev.projection_result) {
    return 'QUORUM_CHANGED'
  }
  if (next.divergent_count > prev.divergent_count) {
    return 'DIVERGENCE_INCREASED'
  }
  if (next.divergent_count < prev.divergent_count) {
    return 'DIVERGENCE_DECREASED'
  }
  return 'STABLE'
}

// ── Null artifact builder ──────────────────────────────────────────────────────

function buildNullReplay(): TemporalLegitimacyReplayVisualization {
  const fields: Record<string, unknown> = {
    artifact_type: 'TEMPORAL_LEGITIMACY_REPLAY_VISUALIZATION',
    evidence_only: true,
    replay_id: '',
    replay_result: TEMPORAL_REPLAY_VISUALIZATION_RESULTS.NULL,
    frame_count: 0,
    frames: Object.freeze([]),
    transitions: Object.freeze([]),
  }
  return Object.freeze({
    ...fields,
    temporal_replay_hash: computeTemporalReplayVisualizationHash(fields),
  }) as TemporalLegitimacyReplayVisualization
}

// ── Main builder ───────────────────────────────────────────────────────────────

/**
 * Builds a TEMPORAL_LEGITIMACY_REPLAY_VISUALIZATION evidence artifact from an ordered
 * sequence of distributed topology visualization projections.
 *
 * Evidence only — read-only temporal replay. Does not create authority, execute,
 * validate, prove, write to registries, repair reconciliation, or mutate runtime state.
 * Returns a NULL artifact on any validation failure (fail-closed).
 */
export function buildTemporalLegitimacyReplayVisualization(
  input: unknown,
): TemporalLegitimacyReplayVisualization {
  const obj = safeObj(input)

  // evidence_only must be explicitly true at the top level
  if (obj.evidence_only !== true) {
    return buildNullReplay()
  }

  // replay_id must be a non-empty string
  const replay_id =
    typeof obj.replay_id === 'string' && obj.replay_id.length > 0 ? obj.replay_id : null
  if (replay_id === null) {
    return buildNullReplay()
  }

  // replay_ordering must be a recognized value
  const replay_ordering = obj.replay_ordering
  if (replay_ordering !== 'INPUT_ORDER' && replay_ordering !== 'OBSERVED_SEQUENCE') {
    return buildNullReplay()
  }

  // projections must be a non-empty array
  const rawProjections = obj.projections
  if (!Array.isArray(rawProjections) || rawProjections.length === 0) {
    return buildNullReplay()
  }

  // Validate each projection
  const validatedProjections: Record<string, unknown>[] = []
  for (const projection of rawProjections) {
    const pObj = safeObj(projection)

    // artifact_type must identify a visualization projection
    if (pObj.artifact_type !== 'DISTRIBUTED_TOPOLOGY_VISUALIZATION_PROJECTION') {
      return buildNullReplay()
    }

    // projection must be evidence-only
    if (pObj.evidence_only !== true) {
      return buildNullReplay()
    }

    // projection must not contain boundary-violating fields
    const violation = detectProjectionBoundaryViolation(pObj)
    if (violation !== null) {
      return buildNullReplay()
    }

    // projection_hash must be a valid SHA-256 hex string
    if (!isValidSha256Hex(pObj.projection_hash)) {
      return buildNullReplay()
    }

    // distributed_topology_hash must be a valid SHA-256 hex string
    if (!isValidSha256Hex(pObj.distributed_topology_hash)) {
      return buildNullReplay()
    }

    // Recompute projection_hash to verify integrity — fail closed on mismatch
    const recomputed = computeVisualizationProjectionHashForVerification(pObj)
    if (recomputed !== pObj.projection_hash) {
      return buildNullReplay()
    }

    // Required numeric fields
    if (
      typeof pObj.participant_count !== 'number' ||
      typeof pObj.divergent_count !== 'number' ||
      typeof pObj.boundary_trigger_count !== 'number'
    ) {
      return buildNullReplay()
    }

    // projection_result must be a string
    if (typeof pObj.projection_result !== 'string' || pObj.projection_result.length === 0) {
      return buildNullReplay()
    }

    validatedProjections.push(pObj)
  }

  // Determine frame ordering
  let orderedProjections: Record<string, unknown>[]
  if (replay_ordering === 'OBSERVED_SEQUENCE') {
    // Sort by projection_hash for deterministic sequence-independent ordering
    orderedProjections = [...validatedProjections].sort((a, b) =>
      (a.projection_hash as string).localeCompare(b.projection_hash as string),
    )
  } else {
    // INPUT_ORDER: preserve the order provided by the caller
    orderedProjections = [...validatedProjections]
  }

  // Build frames
  const frames: TemporalReplayFrame[] = orderedProjections.map((proj, idx) => {
    const frameFields: Omit<TemporalReplayFrame, 'frame_hash'> = {
      frame_index: idx,
      source_projection_hash: proj.projection_hash as string,
      distributed_topology_hash: proj.distributed_topology_hash as string,
      projection_result: proj.projection_result as string,
      participant_count: proj.participant_count as number,
      divergent_count: proj.divergent_count as number,
      boundary_trigger_count: proj.boundary_trigger_count as number,
      collapse_reason: typeof proj.collapse_reason === 'string' ? proj.collapse_reason : null,
    }
    return Object.freeze({
      ...frameFields,
      frame_hash: computeFrameHash(frameFields),
    }) as TemporalReplayFrame
  })

  // Build transitions between consecutive frames
  const transitions: TemporalReplayTransition[] = []
  for (let i = 0; i < frames.length - 1; i++) {
    const prev = frames[i]
    const next = frames[i + 1]
    const transition_type = classifyTransition(prev, next)
    const from_hash = prev.frame_hash
    const to_hash = next.frame_hash
    transitions.push(
      Object.freeze({
        transition_id: computeTransitionId(i, i + 1, from_hash, to_hash, transition_type),
        from_frame: i,
        to_frame: i + 1,
        transition_type,
        from_hash,
        to_hash,
      }) as TemporalReplayTransition,
    )
  }

  // Build final artifact
  const artifactFields: Record<string, unknown> = {
    artifact_type: 'TEMPORAL_LEGITIMACY_REPLAY_VISUALIZATION',
    evidence_only: true,
    replay_id,
    replay_result: TEMPORAL_REPLAY_VISUALIZATION_RESULTS.PROJECTED,
    frame_count: frames.length,
    frames: Object.freeze([...frames]),
    transitions: Object.freeze([...transitions]),
  }

  return Object.freeze({
    ...artifactFields,
    temporal_replay_hash: computeTemporalReplayVisualizationHash(artifactFields),
  }) as TemporalLegitimacyReplayVisualization
}
