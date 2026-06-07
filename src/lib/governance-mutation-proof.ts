import { sha256Hex, canonicalize } from '../canonical.js'

// GAP-005 closure: binds /execute -> /proof for governance mutations.
// Evidence-only artifact derivation — does not create authority, does not
// authorize execution, does not redefine GMA format or authority lifecycle.
export const governance_mutation_proof_creates_authority = false as const
export const governance_mutation_proof_replay_safe = true as const

export const REQUIRED_PROOF_INPUT_FIELDS = [
  'session_id',
  'continuity_id',
  'decision_id',
  'authority_id',
  'gma_id',
  'gma_status',
  'gma_decision_id',
  'gma_continuity_id',
  'gma_session_id',
  'compiled_object_hash',
  'executed_object_hash',
] as const

export type GovernanceMutationProofRejectionReason =
  | 'missing_proof_inputs'
  | 'compiled_executed_hash_mismatch'
  | 'authorization_not_valid'
  | 'authorization_lineage_mismatch'
  | 'proof_replay'

export interface GovernanceMutationProofLineage {
  readonly session_id: string
  readonly continuity_id: string
  readonly decision_id: string
  readonly authority_id: string
  readonly gma_id: string
  readonly compiled_object_hash: string
  readonly executed_object_hash: string
}

export interface GovernanceMutationProofInputs {
  readonly session_id?: string
  readonly continuity_id?: string
  readonly decision_id?: string
  readonly authority_id?: string
  readonly gma_id?: string
  readonly gma_status?: string
  readonly gma_decision_id?: string
  readonly gma_continuity_id?: string
  readonly gma_session_id?: string
  readonly compiled_object_hash?: string
  readonly executed_object_hash?: string
  readonly seen_proof_ids?: ReadonlySet<string> | readonly string[]
}

export interface GovernanceMutationProofArtifact {
  readonly object_type: 'GovernanceMutationProof'
  readonly proof_id: string
  readonly lineage_hash: string
  readonly session_id: string
  readonly continuity_id: string
  readonly decision_id: string
  readonly authority_id: string
  readonly gma_id: string
  readonly compiled_object_hash: string
  readonly executed_object_hash: string
  readonly creates_authority: false
  readonly replay_safe: true
  readonly fail_closed: true
}

export interface GovernanceMutationProofResult {
  readonly status: 'GOVERNANCE_MUTATION_PROOF_VALID' | 'NULL'
  readonly reason?: GovernanceMutationProofRejectionReason
  readonly proof?: GovernanceMutationProofArtifact
}

const GMA_VALID_STATUS = 'GMA_VALID'

// Deterministic lineage hash — binds the proof to its full lineage chain.
// Same lineage always produces the same hash (replay-safe, idempotent).
export function governanceMutationProofLineageHash(lineage: GovernanceMutationProofLineage): string {
  return sha256Hex(canonicalize({
    object_type: 'GovernanceMutationProofLineage',
    session_id: lineage.session_id,
    continuity_id: lineage.continuity_id,
    decision_id: lineage.decision_id,
    authority_id: lineage.authority_id,
    gma_id: lineage.gma_id,
    compiled_object_hash: lineage.compiled_object_hash,
    executed_object_hash: lineage.executed_object_hash,
  }))
}

// Deterministic proof_id derived from the lineage hash — replayed lineage
// always yields the same proof_id, enabling replay detection by lookup.
export function governanceMutationProofId(lineage_hash: string): string {
  return `GMP-${lineage_hash.slice(0, 32)}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function hasAllRequiredFields(inputs: GovernanceMutationProofInputs): boolean {
  return REQUIRED_PROOF_INPUT_FIELDS.every((field) => isNonEmptyString((inputs as Record<string, unknown>)[field]))
}

function seenProofIdsAsSet(seen?: ReadonlySet<string> | readonly string[]): ReadonlySet<string> {
  if (!seen) return new Set()
  return seen instanceof Set ? seen : new Set(seen)
}

// Builds a governance mutation proof artifact from the given inputs.
//
// Fail-closed checks, in priority order — any failure -> NULL:
// 1. missing_proof_inputs            — any required lineage/hash field absent
// 2. compiled_executed_hash_mismatch — compiled object hash != executed object hash
// 3. authorization_not_valid         — GMA status != GMA_VALID
// 4. authorization_lineage_mismatch  — GMA lineage (decision/continuity/session) != execution lineage
// 5. proof_replay                    — lineage hash already produced a proof_id
//
// On success: returns a GovernanceMutationProof artifact bound to the full
// session -> continuity -> decision -> authority -> GMA -> compiled -> executed
// lineage chain. creates_authority is always false (evidence-only).
export function buildGovernanceMutationProof(inputs: GovernanceMutationProofInputs): GovernanceMutationProofResult {
  if (!hasAllRequiredFields(inputs)) {
    return Object.freeze({ status: 'NULL', reason: 'missing_proof_inputs' })
  }

  const compiled_object_hash = inputs.compiled_object_hash as string
  const executed_object_hash = inputs.executed_object_hash as string
  if (compiled_object_hash !== executed_object_hash) {
    return Object.freeze({ status: 'NULL', reason: 'compiled_executed_hash_mismatch' })
  }

  if (inputs.gma_status !== GMA_VALID_STATUS) {
    return Object.freeze({ status: 'NULL', reason: 'authorization_not_valid' })
  }

  if (
    inputs.gma_decision_id !== inputs.decision_id ||
    inputs.gma_continuity_id !== inputs.continuity_id ||
    inputs.gma_session_id !== inputs.session_id
  ) {
    return Object.freeze({ status: 'NULL', reason: 'authorization_lineage_mismatch' })
  }

  const lineage: GovernanceMutationProofLineage = {
    session_id: inputs.session_id as string,
    continuity_id: inputs.continuity_id as string,
    decision_id: inputs.decision_id as string,
    authority_id: inputs.authority_id as string,
    gma_id: inputs.gma_id as string,
    compiled_object_hash,
    executed_object_hash,
  }

  const lineage_hash = governanceMutationProofLineageHash(lineage)
  const proof_id = governanceMutationProofId(lineage_hash)

  if (seenProofIdsAsSet(inputs.seen_proof_ids).has(proof_id)) {
    return Object.freeze({ status: 'NULL', reason: 'proof_replay' })
  }

  const proof: GovernanceMutationProofArtifact = Object.freeze({
    object_type: 'GovernanceMutationProof',
    proof_id,
    lineage_hash,
    session_id: lineage.session_id,
    continuity_id: lineage.continuity_id,
    decision_id: lineage.decision_id,
    authority_id: lineage.authority_id,
    gma_id: lineage.gma_id,
    compiled_object_hash: lineage.compiled_object_hash,
    executed_object_hash: lineage.executed_object_hash,
    creates_authority: false,
    replay_safe: true,
    fail_closed: true,
  })

  return Object.freeze({ status: 'GOVERNANCE_MUTATION_PROOF_VALID', proof })
}
