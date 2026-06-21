// runtime/lineage/continuityProofChain.mjs
// Continuity Proof Chain — the smallest STATEFUL runtime lineage primitive.
//
// PROBLEM (the stateless ceiling):
//   ContinuityOS primitives are stateless — they evaluate current-run inputs
//   and hash them, but carry no VERIFIED state across a run boundary. The Merge
//   Guard proves enforcement; it does not prove continuity. Continuity proof
//   requires verified state inheritance across runs.
//
// THIS PRIMITIVE:
//   Each proof becomes a LINK. A link binds itself to the prior accepted link on
//   the same lineage_key via parent_link_hash. The chain HEAD (the last
//   link_hash) is the verified state inherited by the next run. A run that does
//   not correctly inherit the head is NULL (fail-closed).
//
//   This is the proven append-only hash-chain pattern from
//   src/telemetry/append-only-ingestion-pipeline.ts (genesis -> previous_hash ->
//   entry_hash -> fail-closed verify), applied to proofs with one added
//   cross-run inheritance check.
//
// link_hash is computed over an EXPLICIT field set that EXCLUDES link_hash
// itself (same discipline as buildEntryHash hashing Omit<…,'entry_hash'>).
// The payload carries the EXECUTION-ELIGIBILITY CARRY — the terminal runtime
// state of a run — so the chain head is the prior run's eligibility carry. The
// replay (nonce) and revocation/expiry (status, expires_at, revoked_at) fields
// are BOUND into the link_hash: tampering them on a persisted link breaks the
// recompute (MUTATED_PRIOR_LINK), so a stored carry cannot be silently revived,
// re-expired, or have its nonce swapped without failing the chain:
//
//   link_hash = sha256(canonicalize({
//     lineage_key, sequence_number, parent_link_hash,
//     continuity_id, parent_continuity_id,
//     validated_object_hash, executed_object_hash, proof_hash, timestamp,
//     nonce, status, expires_at, revoked_at,
//   }))
//
// Minimum chain invariant for a lineage_key K:
//   seq 0: parent_link_hash == GENESIS_LINK_HASH
//   seq N: parent_link_hash == link_hash(seq N-1)
//          sequence_number   == sequence_number(N-1) + 1
//
// Store-agnostic: NO I/O here. Persistence is supplied by an adapter
// (proofChainRegistry.mjs persists through the git-committed JSONL registry).
// Evidence-only: creates no authority, mutates no runtime state.

import { canonicalize, sha256Hex } from '../../src/canonical.js'

export { canonicalize, sha256Hex }

// ── Genesis (chain root for the first link of every lineage_key) ──────────────
export const GENESIS_LINK_HASH = sha256Hex(
  canonicalize({ genesis: true, chain: 'CONTINUITY_PROOF_CHAIN' }),
)

// Fields that enter link_hash, in canonical (sorted) form. link_hash is NEVER
// part of its own preimage.
const LINK_HASH_FIELDS = [
  'lineage_key',
  'sequence_number',
  'parent_link_hash',
  'continuity_id',
  'parent_continuity_id',
  'validated_object_hash',
  'executed_object_hash',
  'proof_hash',
  'timestamp',
  // Replay + revocation/expiry state is bound into identity so it is tamper-evident.
  'nonce',
  'status',
  'expires_at',
  'revoked_at',
]

// Default the revocation/replay fields so a link omitting them hashes the SAME as
// an explicit ACTIVE/empty carry — the on-disk record and the recompute must agree.
function withCarryDefaults(o) {
  return {
    ...o,
    nonce: str(o.nonce),
    status: str(o.status) || 'ACTIVE',
    expires_at: str(o.expires_at),
    revoked_at: str(o.revoked_at),
  }
}

function str(v) {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v)
}

// Deterministic link_hash over the explicit field set (self-excluding). Carry
// defaults are applied so an absent status hashes identically to an explicit
// 'ACTIVE' — the on-disk record and the in-memory link must agree byte for byte.
export function computeLinkHash(link) {
  const src = withCarryDefaults(link)
  const preimage = LINK_HASH_FIELDS.reduce((o, f) => {
    o[f] = f === 'sequence_number' ? Number(src.sequence_number) : str(src[f])
    return o
  }, {})
  return sha256Hex(canonicalize(preimage))
}

// ── Build a new link that inherits `head` (the current chain head, or null) ───
// Pure: returns a frozen link. Does not persist.
export function linkProof(input, head) {
  const parent_link_hash = head ? str(head.link_hash) : GENESIS_LINK_HASH
  const sequence_number = head ? Number(head.sequence_number) + 1 : 0

  const core = {
    artifact_type: 'CONTINUITY_PROOF_LINK',
    lineage_key: str(input.lineage_key),
    sequence_number,
    parent_link_hash,
    continuity_id: str(input.continuity_id),
    parent_continuity_id: str(input.parent_continuity_id),
    validated_object_hash: str(input.validated_object_hash),
    executed_object_hash: str(input.executed_object_hash),
    proof_hash: str(input.proof_hash),
    timestamp: str(input.timestamp),
    // Replay + revocation/expiry state — bound into link_hash (tamper-evident).
    nonce: str(input.nonce),
    status: str(input.status) || 'ACTIVE',
    expires_at: str(input.expires_at),
    revoked_at: str(input.revoked_at),
    mutation_allowed: false,
  }
  return Object.freeze({ ...core, link_hash: computeLinkHash(core) })
}

// ── verifyInheritance — the SINGLE cross-run decision ─────────────────────────
// Does `record` correctly inherit `head` (the persisted state)? This is what a
// new run must pass to be admitted. head === null means genesis is expected.
// Returns { result: 'VALID' | 'NULL', null_reasons: string[] }.
export function verifyInheritance(record, head) {
  if (record === null || typeof record !== 'object') {
    return { result: 'NULL', null_reasons: ['MISSING_RECORD'] }
  }

  const null_reasons = []
  const expectedParent = head ? str(head.link_hash) : GENESIS_LINK_HASH
  const expectedSeq = head ? Number(head.sequence_number) + 1 : 0

  if (head && str(record.lineage_key) !== str(head.lineage_key)) {
    null_reasons.push('LINEAGE_KEY_MISMATCH')
  }

  if (!record.parent_link_hash) null_reasons.push('MISSING_PARENT')
  else if (str(record.parent_link_hash) !== expectedParent) null_reasons.push('PARENT_MISMATCH')

  const seq = Number(record.sequence_number)
  if (!Number.isInteger(seq) || seq > expectedSeq) null_reasons.push('SEQUENCE_GAP')
  else if (seq < expectedSeq) null_reasons.push('DUPLICATE_SEQUENCE')

  if (computeLinkHash(record) !== str(record.link_hash)) null_reasons.push('LINK_HASH_MISMATCH')

  return { result: null_reasons.length === 0 ? 'VALID' : 'NULL', null_reasons }
}

// ── verifyChain — full append-only replay of a persisted chain ────────────────
// Replays records in order from genesis, fail-closed on the first broken link.
// Surfaces stored-chain tampering (MUTATED_PRIOR_LINK), duplicate sequences,
// duplicate link_hashes, forks (PARENT_MISMATCH), gaps, and lineage_key drift.
// Returns { result, head_link_hash, length, null_reasons, broken_at? }.
export function verifyChain(records) {
  if (!Array.isArray(records)) {
    return { result: 'NULL', null_reasons: ['MISSING_CHAIN'], head_link_hash: null, length: 0 }
  }
  if (records.length === 0) {
    return { result: 'VALID', null_reasons: [], head_link_hash: GENESIS_LINK_HASH, length: 0 }
  }

  const lineage_key = str(records[0].lineage_key)
  const seenLinkHashes = new Set()
  const seenSequences = new Set()
  let head = null

  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    const null_reasons = []

    if (str(record.lineage_key) !== lineage_key) null_reasons.push('LINEAGE_KEY_MISMATCH')

    // Integrity of this stored link — a tampered persisted link fails here.
    if (computeLinkHash(record) !== str(record.link_hash)) null_reasons.push('MUTATED_PRIOR_LINK')

    const expectedParent = head ? str(head.link_hash) : GENESIS_LINK_HASH
    if (!record.parent_link_hash) null_reasons.push('MISSING_PARENT')
    else if (str(record.parent_link_hash) !== expectedParent) null_reasons.push('PARENT_MISMATCH')

    const expectedSeq = head ? Number(head.sequence_number) + 1 : 0
    const seq = Number(record.sequence_number)
    if (seenSequences.has(seq)) null_reasons.push('DUPLICATE_SEQUENCE')
    else if (!Number.isInteger(seq) || seq > expectedSeq) null_reasons.push('SEQUENCE_GAP')
    else if (seq < expectedSeq) null_reasons.push('DUPLICATE_SEQUENCE')

    if (seenLinkHashes.has(str(record.link_hash))) null_reasons.push('DUPLICATE_LINK_HASH')

    if (null_reasons.length > 0) {
      return {
        result: 'NULL',
        null_reasons,
        broken_at: i,
        head_link_hash: head ? str(head.link_hash) : GENESIS_LINK_HASH,
        length: records.length,
      }
    }

    seenLinkHashes.add(str(record.link_hash))
    seenSequences.add(seq)
    head = record
  }

  return {
    result: 'VALID',
    null_reasons: [],
    head_link_hash: str(head.link_hash),
    length: records.length,
  }
}

// ── headOf — the current head link of an ordered chain, or null (genesis) ─────
export function headOf(records) {
  if (!Array.isArray(records) || records.length === 0) return null
  return records[records.length - 1]
}

export const NULL_REASONS = Object.freeze([
  'MISSING_RECORD',
  'MISSING_CHAIN',
  'MISSING_PARENT',
  'PARENT_MISMATCH',
  'SEQUENCE_GAP',
  'DUPLICATE_SEQUENCE',
  'DUPLICATE_LINK_HASH',
  'MUTATED_PRIOR_LINK',
  'LINEAGE_KEY_MISMATCH',
  'LINK_HASH_MISMATCH',
])
