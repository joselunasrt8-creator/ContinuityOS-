import { canonicalize, sha256Hex } from './canonical.js'

export const RECURSIVE_SEMANTIC_DRIFT_CLASSIFICATIONS = Object.freeze([
  'SEMANTIC_EQUIVALENCE_DRIFT',
  'REPLAY_SEMANTIC_DRIFT',
  'RECONCILIATION_SEMANTIC_DRIFT',
  'AUTHORITY_SCOPE_DRIFT',
  'PROOF_SEMANTIC_DRIFT',
  'TOPOLOGY_SEMANTIC_DRIFT',
  'TEMPORAL_SEMANTIC_DRIFT',
  'TELEMETRY_SEMANTIC_DRIFT',
  'DISTRIBUTED_FRAGMENTATION',
  'CANONICAL_MISMATCH',
  'UNKNOWN_SEMANTIC_SURFACE',
  'NULL',
] as const)

type DriftClassification = (typeof RECURSIVE_SEMANTIC_DRIFT_CLASSIFICATIONS)[number]

export interface RecursiveSemanticRegistryView {
  readonly registry_id: string
  readonly visibility_complete: boolean
  readonly canonical_equivalence: readonly string[]
  readonly replay_semantics: readonly string[]
  readonly reconciliation_semantics: readonly string[]
  readonly authority_scope: readonly string[]
  readonly proof_semantics: readonly string[]
  readonly topology_semantics: readonly string[]
  readonly temporal_semantics: readonly string[]
  readonly telemetry_semantics: readonly string[]
  readonly distributed_semantics: readonly string[]
  readonly hidden_semantic_surfaces?: readonly string[]
}

export interface RecursiveSemanticDriftInput {
  readonly drift_id: string
  readonly evidence_only: true
  readonly views: readonly RecursiveSemanticRegistryView[]
}

export interface RecursiveSemanticDriftResult {
  readonly artifact_type: 'RECURSIVE_SEMANTIC_DRIFT_DETECTION'
  readonly drift_id: string
  readonly classification: DriftClassification
  readonly evidence_only: true
  readonly creates_authority: false
  readonly mutates_state: false
  readonly validates_execution: false
  readonly deterministic_traversal: readonly string[]
  readonly deterministic_semantic_order: readonly string[]
  readonly semantic_drift_inventory: readonly string[]
  readonly equivalence_mismatch_inventory: readonly string[]
  readonly replay_semantic_divergence_inventory: readonly string[]
  readonly reconciliation_semantic_divergence_inventory: readonly string[]
  readonly authority_interpretation_divergence_inventory: readonly string[]
  readonly proof_semantic_mismatch_inventory: readonly string[]
  readonly topology_semantic_drift_inventory: readonly string[]
  readonly temporal_semantic_divergence_inventory: readonly string[]
  readonly telemetry_semantic_drift_inventory: readonly string[]
  readonly distributed_semantic_fragmentation_inventory: readonly string[]
  readonly canonical_hashes: Readonly<Record<string, string>>
}

function ordered(values: readonly string[]): readonly string[] {
  return values.map((v) => String(v || '')).filter(Boolean).sort((a, b) => a.localeCompare(b))
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj)
    for (const value of Object.values(obj as Record<string, unknown>)) deepFreeze(value)
  }
  return obj
}

function viewHashes(view: RecursiveSemanticRegistryView): Record<string, string> {
  const normalized = {
    canonical_equivalence: ordered(view.canonical_equivalence || []),
    replay_semantics: ordered(view.replay_semantics || []),
    reconciliation_semantics: ordered(view.reconciliation_semantics || []),
    authority_scope: ordered(view.authority_scope || []),
    proof_semantics: ordered(view.proof_semantics || []),
    topology_semantics: ordered(view.topology_semantics || []),
    temporal_semantics: ordered(view.temporal_semantics || []),
    telemetry_semantics: ordered(view.telemetry_semantics || []),
    distributed_semantics: ordered(view.distributed_semantics || []),
  }
  return {
    canonical: sha256Hex(canonicalize(normalized.canonical_equivalence)),
    replay: sha256Hex(canonicalize(normalized.replay_semantics)),
    reconciliation: sha256Hex(canonicalize(normalized.reconciliation_semantics)),
    authority: sha256Hex(canonicalize(normalized.authority_scope)),
    proof: sha256Hex(canonicalize(normalized.proof_semantics)),
    topology: sha256Hex(canonicalize(normalized.topology_semantics)),
    temporal: sha256Hex(canonicalize(normalized.temporal_semantics)),
    telemetry: sha256Hex(canonicalize(normalized.telemetry_semantics)),
    distributed: sha256Hex(canonicalize(normalized.distributed_semantics)),
    envelope: sha256Hex(canonicalize(normalized)),
  }
}

export function detectRecursiveSemanticDrift(input: RecursiveSemanticDriftInput): RecursiveSemanticDriftResult {
  if (!input || input.evidence_only !== true || !Array.isArray(input.views) || input.views.length === 0) {
    return Object.freeze({
      artifact_type: 'RECURSIVE_SEMANTIC_DRIFT_DETECTION',
      drift_id: String(input?.drift_id || ''),
      classification: 'NULL',
      evidence_only: true,
      creates_authority: false,
      mutates_state: false,
      validates_execution: false,
      deterministic_traversal: Object.freeze([]),
      deterministic_semantic_order: Object.freeze([]),
      semantic_drift_inventory: Object.freeze([]),
      equivalence_mismatch_inventory: Object.freeze([]),
      replay_semantic_divergence_inventory: Object.freeze([]),
      reconciliation_semantic_divergence_inventory: Object.freeze([]),
      authority_interpretation_divergence_inventory: Object.freeze([]),
      proof_semantic_mismatch_inventory: Object.freeze([]),
      topology_semantic_drift_inventory: Object.freeze([]),
      temporal_semantic_divergence_inventory: Object.freeze([]),
      telemetry_semantic_drift_inventory: Object.freeze([]),
      distributed_semantic_fragmentation_inventory: Object.freeze([]),
      canonical_hashes: Object.freeze({}),
    })
  }

  const views = input.views.slice().sort((a, b) => String(a.registry_id || '').localeCompare(String(b.registry_id || '')))
  const traversal = Object.freeze(views.map((v) => String(v.registry_id || '')))
  const semanticOrder = Object.freeze([
    'canonical_equivalence', 'replay_semantics', 'reconciliation_semantics', 'authority_scope', 'proof_semantics',
    'topology_semantics', 'temporal_semantics', 'telemetry_semantics', 'distributed_semantics',
  ])

  const canonicalHashes: Record<string, string> = {}
  const unknown: string[] = []
  const eq = new Set<string>()
  const replay = new Set<string>()
  const rec = new Set<string>()
  const auth = new Set<string>()
  const proof = new Set<string>()
  const topo = new Set<string>()
  const temporal = new Set<string>()
  const telemetry = new Set<string>()
  const distributed = new Set<string>()

  const buckets: Record<string, Set<string>> = { canonical: new Set(), replay: new Set(), reconciliation: new Set(), authority: new Set(), proof: new Set(), topology: new Set(), temporal: new Set(), telemetry: new Set(), distributed: new Set(), envelope: new Set() }

  for (const view of views) {
    const id = String(view.registry_id || '')
    const hashes = viewHashes(view)
    canonicalHashes[id] = hashes.envelope
    ;(Object.keys(buckets) as (keyof typeof buckets)[]).forEach((k) => buckets[k].add(hashes[k]))
    if (!view.visibility_complete) distributed.add(`${id}:visibility_incomplete`)
    for (const hidden of ordered(view.hidden_semantic_surfaces || [])) unknown.push(`${id}:${hidden}`)
  }

  if (buckets.canonical.size > 1) eq.add('canonical_equivalence_mismatch')
  if (buckets.replay.size > 1) replay.add('replay_interpretation_divergence')
  if (buckets.reconciliation.size > 1) rec.add('reconciliation_interpretation_divergence')
  if (buckets.authority.size > 1) auth.add('authority_scope_interpretation_drift')
  if (buckets.proof.size > 1) proof.add('proof_semantic_mismatch')
  if (buckets.topology.size > 1) topo.add('topology_semantic_fragmentation')
  if (buckets.temporal.size > 1) temporal.add('causal_ordering_semantic_divergence')
  if (buckets.telemetry.size > 1) telemetry.add('telemetry_semantic_leakage')
  if (buckets.distributed.size > 1 || buckets.envelope.size > 1) distributed.add('distributed_semantic_fragmentation')

  const semanticDrift = new Set<string>()
  for (const item of [eq, replay, rec, auth, proof, topo, temporal, telemetry, distributed]) {
    for (const d of item) semanticDrift.add(d)
  }
  for (const u of unknown) semanticDrift.add(`unknown:${u}`)

  let classification: DriftClassification = 'NULL'
  if (unknown.length > 0) classification = 'UNKNOWN_SEMANTIC_SURFACE'
  else if (eq.size > 0) classification = 'SEMANTIC_EQUIVALENCE_DRIFT'
  else if (replay.size > 0) classification = 'REPLAY_SEMANTIC_DRIFT'
  else if (rec.size > 0) classification = 'RECONCILIATION_SEMANTIC_DRIFT'
  else if (auth.size > 0) classification = 'AUTHORITY_SCOPE_DRIFT'
  else if (proof.size > 0) classification = 'PROOF_SEMANTIC_DRIFT'
  else if (topo.size > 0) classification = 'TOPOLOGY_SEMANTIC_DRIFT'
  else if (temporal.size > 0) classification = 'TEMPORAL_SEMANTIC_DRIFT'
  else if (telemetry.size > 0) classification = 'TELEMETRY_SEMANTIC_DRIFT'
  else if (distributed.size > 0) classification = 'DISTRIBUTED_FRAGMENTATION'
  if (buckets.envelope.size > 1 && eq.size > 0) classification = 'CANONICAL_MISMATCH'

  return deepFreeze({
    artifact_type: 'RECURSIVE_SEMANTIC_DRIFT_DETECTION' as const,
    drift_id: String(input.drift_id || ''),
    classification,
    evidence_only: true as const,
    creates_authority: false as const,
    mutates_state: false as const,
    validates_execution: false as const,
    deterministic_traversal: traversal,
    deterministic_semantic_order: semanticOrder,
    semantic_drift_inventory: ordered(Array.from(semanticDrift)),
    equivalence_mismatch_inventory: ordered(Array.from(eq)),
    replay_semantic_divergence_inventory: ordered(Array.from(replay)),
    reconciliation_semantic_divergence_inventory: ordered(Array.from(rec)),
    authority_interpretation_divergence_inventory: ordered(Array.from(auth)),
    proof_semantic_mismatch_inventory: ordered(Array.from(proof)),
    topology_semantic_drift_inventory: ordered(Array.from(topo)),
    temporal_semantic_divergence_inventory: ordered(Array.from(temporal)),
    telemetry_semantic_drift_inventory: ordered(Array.from(telemetry)),
    distributed_semantic_fragmentation_inventory: ordered(Array.from(distributed)),
    canonical_hashes: { ...canonicalHashes },
  })
}
