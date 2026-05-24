import { canonicalize, sha256Hex } from './canonical.js'

export const LEGITIMACY_TELEMETRY_METRICS = Object.freeze([
  'governed_execution_total',
  'validated_execution_total',
  'replay_rejection_total',
  'proof_generated_total',
  'continuity_revocation_total',
  'reconciliation_failure_total',
  'distributed_disagreement_total',
  'topology_drift_total',
  'replay_resurrection_total',
  'causal_divergence_total',
  'split_brain_total',
  'unknown_surface_total',
] as const)

export const LEGITIMACY_TELEMETRY_CLASSIFICATIONS = Object.freeze([
  'OBSERVABILITY_ONLY',
  'DEPENDENCY_CRITICAL',
  'GOVERNANCE_DENSE',
  'TOPOLOGY_DRIFT',
  'REPLAY_REJECTED',
  'RECONCILIATION_DIVERGED',
  'TEMPORAL_DIVERGENCE',
  'SPLIT_BRAIN',
  'UNKNOWN_SURFACE',
  'NULL',
] as const)

type TelemetryMetric = (typeof LEGITIMACY_TELEMETRY_METRICS)[number]
type TelemetryClassification = (typeof LEGITIMACY_TELEMETRY_CLASSIFICATIONS)[number]

export interface LegitimacyTelemetryEvent {
  readonly event_type: string
  readonly surface_id?: string
  readonly dependency_id?: string
  readonly authority_scope?: string
}

export interface LegitimacyTelemetryInput {
  readonly telemetry_id: string
  readonly evidence_only: true
  readonly events: readonly LegitimacyTelemetryEvent[]
}

export interface LegitimacyTelemetrySnapshot {
  readonly artifact_type: 'LEGITIMACY_TELEMETRY_SNAPSHOT'
  readonly telemetry_id: string
  readonly classification: TelemetryClassification
  readonly evidence_only: true
  readonly creates_authority: false
  readonly validates_execution: false
  readonly mutates_state: false
  readonly metric_registry: Readonly<Record<TelemetryMetric, number>>
  readonly deterministic_metric_order: readonly TelemetryMetric[]
  readonly dependency_concentration_inventory: readonly string[]
  readonly governance_density_inventory: readonly string[]
  readonly replay_rejection_inventory: readonly string[]
  readonly reconciliation_divergence_inventory: readonly string[]
  readonly topology_drift_inventory: readonly string[]
  readonly authority_concentration_inventory: readonly string[]
  readonly observability_boundary_inventory: readonly string[]
  readonly dependency_concentration_score: number
  readonly governance_density_score: number
  readonly blast_radius_estimate: number
  readonly canonical_hash: string
}

const EVENT_TO_METRIC: Readonly<Record<string, TelemetryMetric>> = Object.freeze({
  governed_execution: 'governed_execution_total',
  validated_execution: 'validated_execution_total',
  replay_rejection: 'replay_rejection_total',
  proof_generated: 'proof_generated_total',
  continuity_revocation: 'continuity_revocation_total',
  reconciliation_failure: 'reconciliation_failure_total',
  distributed_disagreement: 'distributed_disagreement_total',
  topology_drift: 'topology_drift_total',
  replay_resurrection: 'replay_resurrection_total',
  causal_divergence: 'causal_divergence_total',
  split_brain: 'split_brain_total',
  unknown_surface: 'unknown_surface_total',
})

function classify(metrics: Readonly<Record<TelemetryMetric, number>>): TelemetryClassification {
  if (metrics.unknown_surface_total > 0) return 'UNKNOWN_SURFACE'
  if (metrics.split_brain_total > 0) return 'SPLIT_BRAIN'
  if (metrics.causal_divergence_total > 0) return 'TEMPORAL_DIVERGENCE'
  if (metrics.reconciliation_failure_total > 0 || metrics.distributed_disagreement_total > 0) return 'RECONCILIATION_DIVERGED'
  if (metrics.replay_rejection_total > 0 || metrics.replay_resurrection_total > 0) return 'REPLAY_REJECTED'
  if (metrics.topology_drift_total > 0) return 'TOPOLOGY_DRIFT'
  return 'OBSERVABILITY_ONLY'
}

function frozenSortedValues(values: Iterable<string>): readonly string[] {
  return Object.freeze(Array.from(new Set(values)).filter(Boolean).sort((a, b) => a.localeCompare(b)))
}

export function generateLegitimacyTelemetrySnapshot(input: LegitimacyTelemetryInput): LegitimacyTelemetrySnapshot {
  if (!input || input.evidence_only !== true || !Array.isArray(input.events)) {
    const empty = Object.freeze(Object.fromEntries(LEGITIMACY_TELEMETRY_METRICS.map((metric) => [metric, 0])) as Record<TelemetryMetric, number>)
    return Object.freeze({
      artifact_type: 'LEGITIMACY_TELEMETRY_SNAPSHOT',
      telemetry_id: String(input?.telemetry_id || ''),
      classification: 'NULL',
      evidence_only: true,
      creates_authority: false,
      validates_execution: false,
      mutates_state: false,
      metric_registry: empty,
      deterministic_metric_order: LEGITIMACY_TELEMETRY_METRICS,
      dependency_concentration_inventory: Object.freeze([]),
      governance_density_inventory: Object.freeze([]),
      replay_rejection_inventory: Object.freeze([]),
      reconciliation_divergence_inventory: Object.freeze([]),
      topology_drift_inventory: Object.freeze([]),
      authority_concentration_inventory: Object.freeze([]),
      observability_boundary_inventory: Object.freeze([]),
      dependency_concentration_score: 0,
      governance_density_score: 0,
      blast_radius_estimate: 0,
      canonical_hash: sha256Hex(canonicalize({ telemetry_id: String(input?.telemetry_id || ''), metric_registry: empty })),
    })
  }

  const counts = Object.fromEntries(LEGITIMACY_TELEMETRY_METRICS.map((metric) => [metric, 0])) as Record<TelemetryMetric, number>
  const dependencies: string[] = []
  const governance: string[] = []
  const replay: string[] = []
  const reconciliation: string[] = []
  const drift: string[] = []
  const authority: string[] = []
  const observabilityBoundaries = ['visibility_neq_authority', 'observability_only_boundary']

  for (const raw of input.events) {
    const event = raw || { event_type: '' }
    const eventType = String(event.event_type || '')
    const mapped = EVENT_TO_METRIC[eventType]
    if (mapped) counts[mapped] += 1
    const dep = String(event.dependency_id || '').trim()
    const surface = String(event.surface_id || '').trim()
    const auth = String(event.authority_scope || '').trim()
    if (dep) dependencies.push(dep)
    if (surface) governance.push(surface)
    if (auth) authority.push(auth)
    if (eventType === 'replay_rejection' || eventType === 'replay_resurrection') replay.push(dep || surface || eventType)
    if (eventType === 'reconciliation_failure' || eventType === 'distributed_disagreement') reconciliation.push(dep || surface || eventType)
    if (eventType === 'topology_drift' || eventType === 'unknown_surface') drift.push(surface || dep || eventType)
  }

  const metricRegistry = Object.freeze({ ...counts })
  const dependencyInventory = frozenSortedValues(dependencies)
  const governanceInventory = frozenSortedValues(governance)
  const replayInventory = frozenSortedValues(replay)
  const reconciliationInventory = frozenSortedValues(reconciliation)
  const topologyInventory = frozenSortedValues(drift)
  const authorityInventory = frozenSortedValues(authority)
  const observabilityInventory = frozenSortedValues(observabilityBoundaries)

  const dependencyConcentrationScore = dependencyInventory.length === 0 ? 0 : Number((input.events.length / dependencyInventory.length).toFixed(6))
  const governanceDensityScore = governanceInventory.length === 0 ? 0 : Number((input.events.length / governanceInventory.length).toFixed(6))
  const blastRadiusEstimate = Number((dependencyConcentrationScore + governanceDensityScore).toFixed(6))

  const classification = classify(metricRegistry)
  const snapshot = {
    artifact_type: 'LEGITIMACY_TELEMETRY_SNAPSHOT' as const,
    telemetry_id: String(input.telemetry_id || ''),
    classification,
    evidence_only: true as const,
    creates_authority: false as const,
    validates_execution: false as const,
    mutates_state: false as const,
    metric_registry: metricRegistry,
    deterministic_metric_order: LEGITIMACY_TELEMETRY_METRICS,
    dependency_concentration_inventory: dependencyInventory,
    governance_density_inventory: governanceInventory,
    replay_rejection_inventory: replayInventory,
    reconciliation_divergence_inventory: reconciliationInventory,
    topology_drift_inventory: topologyInventory,
    authority_concentration_inventory: authorityInventory,
    observability_boundary_inventory: observabilityInventory,
    dependency_concentration_score: dependencyConcentrationScore,
    governance_density_score: governanceDensityScore,
    blast_radius_estimate: blastRadiusEstimate,
  }

  return Object.freeze({
    ...snapshot,
    canonical_hash: sha256Hex(canonicalize(snapshot)),
  })
}
