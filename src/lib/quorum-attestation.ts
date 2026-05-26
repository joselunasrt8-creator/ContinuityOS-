import { sha256Hex, canonicalize } from '../canonical.js'
import {
  type FinalityClassification,
  type PredicateSnapshot,
  classifyFromPredicates,
} from './finality-classification.js'
import { type EpochFinalityStatus } from './epoch-substrate.js'

// Evidence-only — quorum attestation ≠ execution authority
export const creates_authority = false as const

export type QuorumAttestationObjectType =
  | 'authority'
  | 'aeo'
  | 'execution'
  | 'proof'
  | 'session'
  | 'continuity'
  | 'validation'
  | 'epoch_head'
  | 'registry_head'

export type MemberAttestation = {
  readonly member_id: string
  readonly member_weight: number
  readonly attested_hash: string
  readonly attested_at: string
  readonly signature_present: boolean
}

export type QuorumAttestationRecord = {
  readonly quorum_attestation_id: string
  readonly federation_profile_id: string
  readonly attested_object_hash: string
  readonly attested_object_type: QuorumAttestationObjectType
  readonly member_attestations_json: string       // JSON-serialized MemberAttestation[]
  readonly weight_total: number
  readonly weight_approved: number
  readonly quorum_threshold_fraction: number
  readonly quorum_met: 0 | 1
  readonly finality_classification_id: string | null
  readonly conflict_set_id: string | null
  readonly epoch_id: string | null                // populated by #1249
  readonly reason_code: string
  readonly created_at: string
  readonly evidence_only: 1
  readonly creates_authority: 0
  readonly creates_execution: 0
  readonly replay_neutral: 1
  readonly mutates_registry: 0
  readonly raw_production_apply_path: 'DENIED'
}

// Derives the canonical quorum_attestation_id.
// Deterministic: same inputs always yield the same ID.
export function buildQuorumAttestationId(
  federation_profile_id: string,
  attested_object_hash: string,
  created_at: string,
): string {
  const canonical = canonicalize({ federation_profile_id, attested_object_hash, created_at })
  return `qar_${sha256Hex(canonical)}`
}

// ValidatorAttestationType: 'AUTHORITY' is absent from the union by design.
// A TypeScript compile error is produced if any code attempts to assign 'AUTHORITY'.
export type ValidatorAttestationType = 'EVIDENCE' | 'OBSERVATION'

// A single validator's attestation envelope — evidence, never authority.
export type ValidatorAttestationEnvelope = {
  readonly validator_attestation_id: string        // vae_<sha256hex> — deterministic
  readonly validator_id: string                    // stable validator identity
  readonly epoch_id: string                        // epoch binding
  readonly object_hash: string                     // attested canonical content hash
  readonly classification: FinalityClassification  // evidence classification at attestation time
  readonly topology_snapshot_hash: string          // topology state hash; empty string = invisible
  readonly causal_clock_json: string               // serialized CausalClockEntry
  readonly attestation_type: ValidatorAttestationType  // 'EVIDENCE' | 'OBSERVATION'
  readonly timestamp_utc: string                   // ISO 8601
  readonly signature: string                       // hex-encoded cryptographic attestation
  readonly is_epoch_stale: 0 | 1                  // 1 when epoch_id is superseded
  readonly is_topology_visible: 0 | 1             // 0 when topology_snapshot_hash is absent
  // Evidence-only discipline
  readonly evidence_only: 1
  readonly creates_authority: 0
  readonly creates_execution: 0
  readonly replay_neutral: 1
  readonly raw_production_apply_path: 'DENIED'
}

// Derives the canonical validator_attestation_id.
// Deterministic: same inputs always yield the same ID.
export function buildValidatorAttestationId(
  validator_id: string,
  object_hash: string,
  timestamp_utc: string,
): string {
  return `vae_${sha256Hex(canonicalize({ validator_id, object_hash, timestamp_utc }))}`
}

// Returns true when the envelope's epoch_id differs from the supplied active epoch.
// A stale envelope (is_epoch_stale=1) may not contribute quorum weight toward GLOBAL_VALID.
export function isAttestationEpochStale(
  envelope: Pick<ValidatorAttestationEnvelope, 'epoch_id'>,
  active_epoch_id: string,
): boolean {
  return envelope.epoch_id !== active_epoch_id
}

// Returns true when the envelope has a non-empty topology_snapshot_hash.
// false → validator is topology-invisible → attestation_type must be 'OBSERVATION'.
export function isAttestationTopologyVisible(
  envelope: Pick<ValidatorAttestationEnvelope, 'topology_snapshot_hash'>,
): boolean {
  return envelope.topology_snapshot_hash.length > 0
}

// Derives the FinalityClassification supported by a set of ValidatorAttestationEnvelopes.
// Pure function over the envelope set — does not query any registry.
//
// Classification rules (applied in order):
//   1. Empty set → NULL
//   2. Any envelope has is_epoch_stale=1 → STALE_VISIBLE
//   3. All envelopes have is_topology_visible=0 → PARTITION_SUSPENDED
//   4. Disagreement on object_hash across EVIDENCE envelopes → AMBIGUOUS
//   5. Zero or one EVIDENCE envelopes → Q=false → LOCAL_VALID ceiling
//   6. Multiple EVIDENCE envelopes agree; evaluate weighted quorum:
//      - quorum_met=0 → Q=false → LOCAL_VALID ceiling
//      - quorum_met=1 → Q=true → classifyFromPredicates() with full convergence evidence;
//        ceiling is CONVERGENCE_VALID or GLOBAL_VALID depending on epochStatus
//
// OBSERVATION envelopes never contribute quorum weight.
// attestation_type='AUTHORITY' is a TypeScript compile error — absent from ValidatorAttestationType.
export function classifyFromValidatorAttestations(
  envelopes: ValidatorAttestationEnvelope[],
  base_predicates: Omit<PredicateSnapshot, 'Q' | 'G' | 'L' | 'X'>,
  quorum_threshold_fraction: number,
  epochStatus: EpochFinalityStatus | null,
): FinalityClassification {
  if (envelopes.length === 0) return 'NULL'

  if (envelopes.some((e) => e.is_epoch_stale === 1)) return 'STALE_VISIBLE'

  if (envelopes.every((e) => e.is_topology_visible === 0)) return 'PARTITION_SUSPENDED'

  const evidenceEnvelopes = envelopes.filter(
    (e) => e.attestation_type === 'EVIDENCE' && e.is_topology_visible === 1,
  )

  const hashes = new Set(evidenceEnvelopes.map((e) => e.object_hash))
  if (hashes.size > 1) return 'AMBIGUOUS'

  if (evidenceEnvelopes.length <= 1) return 'LOCAL_VALID'

  const targetHash = evidenceEnvelopes[0].object_hash
  const members: MemberAttestation[] = evidenceEnvelopes.map((e) => ({
    member_id: e.validator_id,
    member_weight: 1,
    attested_hash: e.object_hash,
    attested_at: e.timestamp_utc,
    signature_present: e.signature.length > 0,
  }))
  const { quorum_met } = evaluateWeightedQuorum(members, targetHash, quorum_threshold_fraction)

  if (quorum_met === 0) return 'LOCAL_VALID'

  const fullPredicates: PredicateSnapshot = {
    ...base_predicates,
    Q: true,
    G: true,
    L: true,
    X: true,
  }
  return classifyFromPredicates(fullPredicates, true, epochStatus)
}

// Evaluates whether a set of member attestations reaches quorum for a given
// canonical head hash and threshold. Only attestations matching target_hash count
// toward weight_approved.
export function evaluateWeightedQuorum(
  members: MemberAttestation[],
  target_hash: string,
  threshold_fraction: number,
): {
  weight_total: number
  weight_approved: number
  quorum_met: 0 | 1
} {
  const weight_total = members.reduce((sum, m) => sum + m.member_weight, 0)
  const weight_approved = members
    .filter((m) => m.attested_hash === target_hash)
    .reduce((sum, m) => sum + m.member_weight, 0)

  const quorum_met: 0 | 1 =
    weight_total > 0 && weight_approved >= weight_total * threshold_fraction ? 1 : 0

  return { weight_total, weight_approved, quorum_met }
}
