// runtime/lineage/executionEligibility.mjs
// Execution-Eligibility Continuity Gate — the smallest RUNTIME lineage primitive.
//
// PROOF lineage answers "how do proofs inherit?" (proof(N-1) -> proof(N)) and can
// exist without ever governing execution. RUNTIME lineage is the ContinuityOS
// thesis:
//
//   validated_object(N-1) -> executed_object(N) -> proof(N)
//
//   no valid lineage -> no valid authority -> no valid execution
//   validated_object  ==  executed_object
//
// This gate makes a CURRENT run's execution eligibility DEPEND ON the verified
// terminal state of the PRIOR run on the same lineage. It is consumed BEFORE
// /execute: ELIGIBLE is required to execute; NULL means execution does not happen.
//
// PRIMITIVE-GATE DISCIPLINE (docs/stage2-primitive-packaging-plan-v1.md §8/§13):
//   - default is NULL; ELIGIBLE only when EVERY inheritance predicate passes
//   - creates_authority is always false
//   - the gate NARROWS only — it can withhold eligibility, never create or widen it
//   - any broken predicate => NULL (callers exit non-zero)
//
// Pure: no I/O. The prior "eligibility carry" and the consumed-nonce set are
// supplied by the caller (proofChainRegistry.mjs reads them from the JSONL log).

import { canonicalize, sha256Hex } from '../../src/canonical.js'

export { canonicalize, sha256Hex }

// The clean root state. A first run on a lineage must inherit exactly this:
// no prior executed object, no parent continuity.
const GENESIS_OBJECT_HASH = sha256Hex(canonicalize({ genesis: true, lineage: 'EXECUTION_ELIGIBILITY' }))
export const GENESIS_EXECUTION_STATE = Object.freeze({
  continuity_id: '',
  parent_continuity_id: '',
  // validated == executed must hold for the root, or PRIOR_INVARIANT_BROKEN trips.
  validated_object_hash: GENESIS_OBJECT_HASH,
  executed_object_hash: GENESIS_OBJECT_HASH,
  proof_hash: '',
  status: 'ACTIVE',
  expires_at: '',
  revoked_at: '',
  is_genesis: true,
})

export const ELIGIBILITY_NULL_REASONS = Object.freeze([
  'UNVALIDATED_CURRENT',
  'CURRENT_INVARIANT_BROKEN',
  'PRIOR_INVARIANT_BROKEN',
  'UNINHERITED_EXECUTED_STATE',
  'BROKEN_CONTINUITY',
  'REVOKED_LINEAGE',
  'EXPIRED_LINEAGE',
  'REPLAYED_NONCE',
])

function str(v) {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v)
}

function isExpired(expires_at, nowMs) {
  const raw = str(expires_at)
  if (!raw) return false
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return false
  return t < nowMs
}

// classifyExecutionEligibility — the gate.
//
//   prior:   the head eligibility carry on the lineage, or null / GENESIS_EXECUTION_STATE
//            for a root run. Shape: { continuity_id, validated_object_hash,
//            executed_object_hash, proof_hash, status, expires_at, revoked_at }
//   current: the candidate run: { continuity_id, parent_continuity_id,
//            parent_executed_object_hash, validated_object_hash, nonce }
//   options: { now?: ISO|ms, consumed_nonces?: Set|Array }
//
// Returns a frozen decision:
//   { eligibility: 'ELIGIBLE' | 'NULL', null_reasons: string[],
//     creates_authority: false, widens_eligibility: false }
export function classifyExecutionEligibility(prior, current, options = {}) {
  const priorState = prior == null ? GENESIS_EXECUTION_STATE : prior
  const nowMs =
    typeof options.now === 'number'
      ? options.now
      : options.now
        ? Date.parse(String(options.now))
        : Date.now()
  const consumed =
    options.consumed_nonces instanceof Set
      ? options.consumed_nonces
      : new Set(Array.isArray(options.consumed_nonces) ? options.consumed_nonces.map(str) : [])

  const null_reasons = []
  const cur = current && typeof current === 'object' ? current : {}

  // No valid object -> nothing happens.
  if (!str(cur.validated_object_hash)) null_reasons.push('UNVALIDATED_CURRENT')

  // The CURRENT run must itself hold validated == executed. The carry that this
  // run will persist becomes the next run's inheritance base, so an asserted
  // executed object that diverges from the validated object would seed a broken
  // base. Enforced (not assumed) whenever the run asserts an executed object.
  if (str(cur.executed_object_hash) && str(cur.executed_object_hash) !== str(cur.validated_object_hash)) {
    null_reasons.push('CURRENT_INVARIANT_BROKEN')
  }

  // The prior run must itself have held validated == executed, or its state is
  // not a legitimate base to inherit.
  if (str(priorState.validated_object_hash) !== str(priorState.executed_object_hash)) {
    null_reasons.push('PRIOR_INVARIANT_BROKEN')
  }

  // THE core runtime-lineage check: this run must inherit the prior executed object.
  if (str(cur.parent_executed_object_hash) !== str(priorState.executed_object_hash)) {
    null_reasons.push('UNINHERITED_EXECUTED_STATE')
  }

  // Continuity head must be inherited.
  if (str(cur.parent_continuity_id) !== str(priorState.continuity_id)) {
    null_reasons.push('BROKEN_CONTINUITY')
  }

  // Prior lineage must be live (mirrors verifyContinuityLineage).
  if (str(priorState.revoked_at) || str(priorState.status || 'ACTIVE') !== 'ACTIVE') {
    null_reasons.push('REVOKED_LINEAGE')
  }
  if (isExpired(priorState.expires_at, nowMs)) {
    null_reasons.push('EXPIRED_LINEAGE')
  }

  // One-time use: a consumed nonce can never re-admit (no replay restoration).
  if (str(cur.nonce) && consumed.has(str(cur.nonce))) {
    null_reasons.push('REPLAYED_NONCE')
  }

  return Object.freeze({
    eligibility: null_reasons.length === 0 ? 'ELIGIBLE' : 'NULL',
    null_reasons,
    creates_authority: false,
    widens_eligibility: false,
  })
}

// Convenience: build the eligibility carry that a successful run persists as the
// next head. This records terminal runtime state; it grants nothing on its own.
export function eligibilityCarry(current) {
  const cur = current && typeof current === 'object' ? current : {}
  return Object.freeze({
    continuity_id: str(cur.continuity_id),
    parent_continuity_id: str(cur.parent_continuity_id),
    validated_object_hash: str(cur.validated_object_hash),
    // validated == executed (the invariant the run must have held to be here)
    executed_object_hash: str(cur.executed_object_hash ?? cur.validated_object_hash),
    proof_hash: str(cur.proof_hash),
    status: str(cur.status || 'ACTIVE'),
    expires_at: str(cur.expires_at),
    revoked_at: str(cur.revoked_at),
  })
}
