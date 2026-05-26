import { sha256Hex, canonicalize } from '../canonical.js'

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
