import { canonicalize, sha256Hex } from './canonical.js'

export const CAUSAL_LEGITIMACY_CLOCK_CLASSIFICATIONS = Object.freeze([
  'CAUSALLY_ORDERED',
  'CAUSAL_DIVERGENCE',
  'REPLAY_CHRONOLOGY_DRIFT',
  'REVOCATION_ORDERING_DRIFT',
  'PROOF_FINALITY_DRIFT',
  'TEMPORAL_SPLIT_BRAIN',
  'PARTIAL_TEMPORAL_VISIBILITY',
  'TOPOLOGY_TEMPORAL_DRIFT',
  'NULL',
] as const)

export interface CausalLegitimacyEvent {
  readonly object_id: string
  readonly parent_object_id?: string | null
  readonly replay_step: number
  readonly revocation_step: number
  readonly proof_step: number
  readonly lineage_hash: string
  readonly replay_hash: string
  readonly revocation_hash: string
  readonly proof_hash: string
  readonly topology_hash: string
}

export interface CausalLegitimacyRegistryView {
  readonly registry_id: string
  readonly visibility_complete: boolean
  readonly registry_epoch: number
  readonly events: readonly CausalLegitimacyEvent[]
}

export interface CausalLegitimacyClockInput {
  readonly clock_id: string
  readonly evidence_only: true
  readonly views: readonly CausalLegitimacyRegistryView[]
}

export interface CausalLegitimacyClockResult {
  readonly artifact_type: 'CAUSAL_LEGITIMACY_CLOCK'
  readonly clock_id: string
  readonly classification: (typeof CAUSAL_LEGITIMACY_CLOCK_CLASSIFICATIONS)[number]
  readonly equivalent: boolean
  readonly deterministic_order: readonly string[]
  readonly deterministic_traversal: readonly string[]
  readonly registry_hashes: Readonly<Record<string, string>>
  readonly lineage_happens_before_hash: string
  readonly replay_chronology_hash: string
  readonly revocation_order_hash: string
  readonly proof_finality_hash: string
  readonly topology_hash: string
  readonly drift_classes: readonly string[]
  readonly evidence_only: true
  readonly creates_authority: false
}

function sortEvents(events: readonly CausalLegitimacyEvent[]): readonly CausalLegitimacyEvent[] {
  return events.slice().sort((a, b) => {
    const id = String(a.object_id || '').localeCompare(String(b.object_id || ''))
    if (id !== 0) return id
    const replay = Number(a.replay_step || 0) - Number(b.replay_step || 0)
    if (replay !== 0) return replay
    const revocation = Number(a.revocation_step || 0) - Number(b.revocation_step || 0)
    if (revocation !== 0) return revocation
    return Number(a.proof_step || 0) - Number(b.proof_step || 0)
  })
}

function lineageClosure(events: readonly CausalLegitimacyEvent[]): boolean {
  const ids = new Set(events.map((e) => String(e.object_id || '')))
  for (const event of events) {
    const parent = String(event.parent_object_id || '')
    if (parent && !ids.has(parent)) return false
  }
  return true
}

function hasTemporalInversion(events: readonly CausalLegitimacyEvent[]): boolean {
  const sorted = sortEvents(events)
  for (const event of sorted) {
    const replay = Number(event.replay_step || 0)
    const revocation = Number(event.revocation_step || 0)
    const proof = Number(event.proof_step || 0)
    if (revocation < replay || proof < revocation || proof < replay) return true
  }
  return false
}

function normalizedOrder(events: readonly CausalLegitimacyEvent[]): readonly string[] {
  return sortEvents(events).map((event) => [
    String(event.object_id || ''),
    String(event.parent_object_id || ''),
    Number(event.replay_step || 0),
    Number(event.revocation_step || 0),
    Number(event.proof_step || 0),
  ].join(':'))
}

function buildRegistryHash(view: CausalLegitimacyRegistryView): string {
  return sha256Hex(canonicalize({
    events: sortEvents(view.events || []).map((event) => ({
      object_id: String(event.object_id || ''),
      parent_object_id: event.parent_object_id == null ? null : String(event.parent_object_id),
      replay_step: Number(event.replay_step || 0),
      revocation_step: Number(event.revocation_step || 0),
      proof_step: Number(event.proof_step || 0),
      lineage_hash: String(event.lineage_hash || ''),
      replay_hash: String(event.replay_hash || ''),
      revocation_hash: String(event.revocation_hash || ''),
      proof_hash: String(event.proof_hash || ''),
      topology_hash: String(event.topology_hash || ''),
    })),
    registry_epoch: Number.isFinite(view.registry_epoch) ? view.registry_epoch : -1,
    visibility_complete: Boolean(view.visibility_complete),
  }))
}

export function verifyCausalLegitimacyClocks(input: CausalLegitimacyClockInput): CausalLegitimacyClockResult {
  if (!input || input.evidence_only !== true || !Array.isArray(input.views) || input.views.length === 0) {
    return Object.freeze({
      artifact_type: 'CAUSAL_LEGITIMACY_CLOCK',
      clock_id: String(input?.clock_id || ''),
      classification: 'NULL',
      equivalent: false,
      deterministic_order: Object.freeze([]),
      deterministic_traversal: Object.freeze([]),
      registry_hashes: Object.freeze({}),
      lineage_happens_before_hash: '',
      replay_chronology_hash: '',
      revocation_order_hash: '',
      proof_finality_hash: '',
      topology_hash: '',
      drift_classes: Object.freeze(['fail_closed_null']),
      evidence_only: true,
      creates_authority: false,
    })
  }

  const orderedViews = input.views.slice().sort((a, b) => String(a.registry_id || '').localeCompare(String(b.registry_id || '')))
  const deterministicTraversal = orderedViews.map((v) => String(v.registry_id || ''))
  const registryHashes: Record<string, string> = {}
  const drift = new Set<string>()

  for (const view of orderedViews) {
    registryHashes[String(view.registry_id || '')] = buildRegistryHash(view)
    if (!view.visibility_complete) drift.add('partial_temporal_visibility')
    if (!lineageClosure(view.events || [])) drift.add('topology_temporal_drift')
    if (hasTemporalInversion(view.events || [])) drift.add('causal_divergence')
  }

  const deterministicOrder = orderedViews.flatMap((view) => normalizedOrder(view.events || []))
  const lineageSet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEvents(v.events || []).map((e) => [e.object_id, e.parent_object_id, e.lineage_hash])))))
  const replaySet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEvents(v.events || []).map((e) => [e.object_id, e.replay_step, e.replay_hash])))))
  const revocationSet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEvents(v.events || []).map((e) => [e.object_id, e.revocation_step, e.revocation_hash])))))
  const proofSet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEvents(v.events || []).map((e) => [e.object_id, e.proof_step, e.proof_hash])))))
  const topologySet = new Set(orderedViews.map((v) => sha256Hex(canonicalize(sortEvents(v.events || []).map((e) => [e.object_id, e.topology_hash])))))

  if (new Set(Object.values(registryHashes)).size > 1 && lineageSet.size > 1) drift.add('temporal_split_brain')
  if (lineageSet.size > 1) drift.add('causal_divergence')
  if (replaySet.size > 1) drift.add('replay_chronology_drift')
  if (revocationSet.size > 1) drift.add('revocation_ordering_drift')
  if (proofSet.size > 1) drift.add('proof_finality_drift')
  if (topologySet.size > 1) drift.add('topology_temporal_drift')

  let classification: CausalLegitimacyClockResult['classification'] = 'CAUSALLY_ORDERED'
  if (drift.has('partial_temporal_visibility')) classification = 'PARTIAL_TEMPORAL_VISIBILITY'
  else if (drift.has('temporal_split_brain')) classification = 'TEMPORAL_SPLIT_BRAIN'
  else if (drift.has('topology_temporal_drift')) classification = 'TOPOLOGY_TEMPORAL_DRIFT'
  else if (drift.has('proof_finality_drift')) classification = 'PROOF_FINALITY_DRIFT'
  else if (drift.has('revocation_ordering_drift')) classification = 'REVOCATION_ORDERING_DRIFT'
  else if (drift.has('replay_chronology_drift')) classification = 'REPLAY_CHRONOLOGY_DRIFT'
  else if (drift.has('causal_divergence')) classification = 'CAUSAL_DIVERGENCE'

  return Object.freeze({
    artifact_type: 'CAUSAL_LEGITIMACY_CLOCK',
    clock_id: String(input.clock_id || ''),
    classification,
    equivalent: classification === 'CAUSALLY_ORDERED',
    deterministic_order: Object.freeze(deterministicOrder),
    deterministic_traversal: Object.freeze(deterministicTraversal),
    registry_hashes: Object.freeze({ ...registryHashes }),
    lineage_happens_before_hash: Array.from(lineageSet).sort()[0] || '',
    replay_chronology_hash: Array.from(replaySet).sort()[0] || '',
    revocation_order_hash: Array.from(revocationSet).sort()[0] || '',
    proof_finality_hash: Array.from(proofSet).sort()[0] || '',
    topology_hash: Array.from(topologySet).sort()[0] || '',
    drift_classes: Object.freeze(Array.from(drift).sort((a, b) => a.localeCompare(b))),
    evidence_only: true,
    creates_authority: false,
  })
}
