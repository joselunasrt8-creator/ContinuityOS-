import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  governance_mutation_proof_creates_authority,
  governance_mutation_proof_replay_safe,
  buildGovernanceMutationProof,
  governanceMutationProofLineageHash,
  governanceMutationProofId,
} from '../src/lib/governance-mutation-proof.ts'

// ── GAP-005 closure: /execute -> /proof binding for governance mutations ──────
//
// Canonical invariant: "If no valid object exists -> nothing happens."
// Governance mutation executions must produce a governance_mutation_proof
// artifact, lineage-bound to session_id, continuity_id, decision_id,
// authority_id, gma_id, compiled_object_hash and executed_object_hash.
// Fail-closed: missing inputs, hash mismatch, invalid/mismatched authorization,
// or replay all collapse to NULL. Evidence-only — does not create authority.
//
// Anchor: GOVERNANCE_GAP_REGISTRY.md GAP-005, issue #1831

const validFixture = JSON.parse(readFileSync('tests/fixtures/governance-mutation-proof/valid_governance_mutation_proof.json', 'utf8'))
const nullFixture = JSON.parse(readFileSync('tests/fixtures/governance-mutation-proof/null_governance_mutation_proof.json', 'utf8'))

function baseInputs(overrides = {}) {
  return {
    session_id: 'sess-gap005-001',
    continuity_id: 'cont-gap005-001',
    decision_id: 'dec-gap005-001',
    authority_id: 'auth-gap005-001',
    gma_id: 'GMA-gap-005-enforcement-001',
    gma_status: 'GMA_VALID',
    gma_decision_id: 'dec-gap005-001',
    gma_continuity_id: 'cont-gap005-001',
    gma_session_id: 'sess-gap005-001',
    compiled_object_hash: 'a'.repeat(64),
    executed_object_hash: 'a'.repeat(64),
    ...overrides,
  }
}

// ── Module-level invariants ──────────────────────────────────────────────────

test('GAP-005: governance_mutation_proof_creates_authority is false', () => {
  assert.equal(governance_mutation_proof_creates_authority, false)
})

test('GAP-005: governance_mutation_proof_replay_safe is true', () => {
  assert.equal(governance_mutation_proof_replay_safe, true)
})

// ── Positive path: full lineage binding ──────────────────────────────────────

test('GAP-005 positive: valid lineage produces a GovernanceMutationProof artifact bound to all required fields', () => {
  const result = buildGovernanceMutationProof(baseInputs())
  assert.equal(result.status, 'GOVERNANCE_MUTATION_PROOF_VALID')
  assert.ok(result.proof)
  assert.equal(result.proof.object_type, 'GovernanceMutationProof')
  assert.equal(result.proof.session_id, 'sess-gap005-001')
  assert.equal(result.proof.continuity_id, 'cont-gap005-001')
  assert.equal(result.proof.decision_id, 'dec-gap005-001')
  assert.equal(result.proof.authority_id, 'auth-gap005-001')
  assert.equal(result.proof.gma_id, 'GMA-gap-005-enforcement-001')
  assert.equal(result.proof.compiled_object_hash, 'a'.repeat(64))
  assert.equal(result.proof.executed_object_hash, 'a'.repeat(64))
  assert.equal(result.proof.creates_authority, false)
  assert.equal(result.proof.replay_safe, true)
  assert.equal(result.proof.fail_closed, true)
  assert.match(result.proof.proof_id, /^GMP-[0-9a-f]{32}$/)
  assert.equal(result.proof.lineage_hash, governanceMutationProofLineageHash({
    session_id: 'sess-gap005-001',
    continuity_id: 'cont-gap005-001',
    decision_id: 'dec-gap005-001',
    authority_id: 'auth-gap005-001',
    gma_id: 'GMA-gap-005-enforcement-001',
    compiled_object_hash: 'a'.repeat(64),
    executed_object_hash: 'a'.repeat(64),
  }))
})

test('GAP-005 positive: lineage hash and proof_id are deterministic across identical lineage', () => {
  const first = buildGovernanceMutationProof(baseInputs())
  const second = buildGovernanceMutationProof(baseInputs({ seen_proof_ids: [] }))
  assert.equal(first.proof.lineage_hash, second.proof.lineage_hash)
  assert.equal(first.proof.proof_id, second.proof.proof_id)
  assert.equal(second.proof.proof_id, governanceMutationProofId(second.proof.lineage_hash))
})

test('GAP-005 positive: fixture matches a VALID governance mutation proof shape', () => {
  const result = buildGovernanceMutationProof(validFixture.inputs)
  assert.equal(result.status, 'GOVERNANCE_MUTATION_PROOF_VALID')
  assert.deepEqual(result.proof, validFixture.expected_proof)
})

// ── Negative paths: fail-closed -> NULL ──────────────────────────────────────

test('GAP-005 negative: missing proof inputs -> NULL (missing_proof_inputs)', () => {
  const result = buildGovernanceMutationProof(baseInputs({ authority_id: undefined }))
  assert.equal(result.status, 'NULL')
  assert.equal(result.reason, 'missing_proof_inputs')
  assert.equal(result.proof, undefined)
})

test('GAP-005 negative: empty-string field counts as missing -> NULL (missing_proof_inputs)', () => {
  const result = buildGovernanceMutationProof(baseInputs({ gma_id: '' }))
  assert.equal(result.status, 'NULL')
  assert.equal(result.reason, 'missing_proof_inputs')
})

test('GAP-005 negative: compiled object hash != executed object hash -> NULL (compiled_executed_hash_mismatch)', () => {
  const result = buildGovernanceMutationProof(baseInputs({ executed_object_hash: 'b'.repeat(64) }))
  assert.equal(result.status, 'NULL')
  assert.equal(result.reason, 'compiled_executed_hash_mismatch')
  assert.equal(result.proof, undefined)
})

test('GAP-005 negative: GMA status != GMA_VALID -> NULL (authorization_not_valid)', () => {
  const result = buildGovernanceMutationProof(baseInputs({ gma_status: 'GMA_EXPIRED' }))
  assert.equal(result.status, 'NULL')
  assert.equal(result.reason, 'authorization_not_valid')
  assert.equal(result.proof, undefined)
})

test('GAP-005 negative: GMA lineage mismatch (decision_id) -> NULL (authorization_lineage_mismatch)', () => {
  const result = buildGovernanceMutationProof(baseInputs({ gma_decision_id: 'dec-other-999' }))
  assert.equal(result.status, 'NULL')
  assert.equal(result.reason, 'authorization_lineage_mismatch')
  assert.equal(result.proof, undefined)
})

test('GAP-005 negative: GMA lineage mismatch (continuity_id) -> NULL (authorization_lineage_mismatch)', () => {
  const result = buildGovernanceMutationProof(baseInputs({ gma_continuity_id: 'cont-other-999' }))
  assert.equal(result.status, 'NULL')
  assert.equal(result.reason, 'authorization_lineage_mismatch')
})

test('GAP-005 negative: GMA lineage mismatch (session_id) -> NULL (authorization_lineage_mismatch)', () => {
  const result = buildGovernanceMutationProof(baseInputs({ gma_session_id: 'sess-other-999' }))
  assert.equal(result.status, 'NULL')
  assert.equal(result.reason, 'authorization_lineage_mismatch')
})

test('GAP-005 negative: replayed proof identifier -> NULL (proof_replay)', () => {
  const first = buildGovernanceMutationProof(baseInputs())
  assert.equal(first.status, 'GOVERNANCE_MUTATION_PROOF_VALID')
  const replay = buildGovernanceMutationProof(baseInputs({ seen_proof_ids: new Set([first.proof.proof_id]) }))
  assert.equal(replay.status, 'NULL')
  assert.equal(replay.reason, 'proof_replay')
  assert.equal(replay.proof, undefined)
})

test('GAP-005 negative: fixture matches a NULL governance mutation proof rejection', () => {
  const result = buildGovernanceMutationProof(nullFixture.inputs)
  assert.equal(result.status, 'NULL')
  assert.equal(result.reason, nullFixture.expected_reason)
  assert.equal(result.proof, undefined)
})

// ── Priority ordering: missing inputs checked before all other rules ─────────

test('GAP-005: missing_proof_inputs takes priority over hash mismatch and authorization checks', () => {
  const result = buildGovernanceMutationProof(baseInputs({
    session_id: undefined,
    executed_object_hash: 'b'.repeat(64),
    gma_status: 'GMA_EXPIRED',
  }))
  assert.equal(result.status, 'NULL')
  assert.equal(result.reason, 'missing_proof_inputs')
})

test('GAP-005: hash mismatch takes priority over authorization validity and lineage checks', () => {
  const result = buildGovernanceMutationProof(baseInputs({
    executed_object_hash: 'b'.repeat(64),
    gma_status: 'GMA_EXPIRED',
    gma_decision_id: 'dec-other-999',
  }))
  assert.equal(result.status, 'NULL')
  assert.equal(result.reason, 'compiled_executed_hash_mismatch')
})
