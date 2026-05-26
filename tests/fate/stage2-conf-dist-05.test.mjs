import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  creates_authority,
  conflictSetCreatesAuthority,
  settlementRestoresReplay,
  detectConflictSet,
  classifyConflictSet,
  buildConflictEnvelopeId,
} from '../../src/lib/conflict-set.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/conflicting_proof_roots.json', 'utf8'),
)
const migration0057Sql = readFileSync(
  'migrations/0057_conflict_set_envelope_settlement.sql',
  'utf8',
)

// ── CONF-DIST-05: Conflicting proof roots create CONFLICTED ───────────────────
//
// Stage 2 invariant: two or more proofs claiming the same execution surface
// with different roots must produce CONFLICTED classification.
// conflict_set ≠ authority — detection does not grant execution eligibility.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md
// Anchor issue: #1348  Supporting: #1441, #1418, #1442

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-05: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-05: conflict-set module creates_authority is false', () => {
  assert.equal(creates_authority, false)
})

test('CONF-DIST-05: conflictSetCreatesAuthority is false', () => {
  assert.equal(conflictSetCreatesAuthority, false)
})

test('CONF-DIST-05: settlementRestoresReplay is false', () => {
  assert.equal(settlementRestoresReplay, false)
})

test('CONF-DIST-05: fixture expected classification is CONFLICTED', () => {
  assert.equal(fixture.expected_classification, 'CONFLICTED')
  assert.ok(fixture.forbidden_classifications.includes('GLOBAL_VALID'))
  assert.ok(fixture.forbidden_classifications.includes('SETTLED'))
  assert.ok(fixture.forbidden_classifications.includes('NULL'))
})

test('CONF-DIST-05: fixture has two competing roots', () => {
  assert.equal(fixture.competing_roots.length, 2)
})

// ── Core invariant: 2+ competing roots → CONFLICTED ──────────────────────────

test('CONF-DIST-05: detectConflictSet returns CONFLICTED for two competing roots', () => {
  const envelope = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  assert.equal(envelope.settlement_state, 'CONFLICTED')
  assert.equal(envelope.settlement_state, fixture.expected_classification)
})

test('CONF-DIST-05: CONFLICTED envelope creates_authority is false', () => {
  const envelope = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  assert.equal(envelope.creates_authority, false)
})

test('CONF-DIST-05: CONFLICTED envelope restores_replay is false', () => {
  const envelope = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  assert.equal(envelope.restores_replay, false)
})

test('CONF-DIST-05: CONFLICTED envelope preserves all competing roots', () => {
  const envelope = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  assert.equal(envelope.competing_roots.length, 2)
  const hashes = envelope.competing_roots.map((r) => r.root_hash)
  assert.ok(hashes.includes(fixture.competing_roots[0].root_hash))
  assert.ok(hashes.includes(fixture.competing_roots[1].root_hash))
})

test('CONF-DIST-05: CONFLICTED envelope has no winning_root (not yet settled)', () => {
  const envelope = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  assert.equal(envelope.winning_root, undefined)
})

test('CONF-DIST-05: CONFLICTED envelope has empty losing_roots (settlement not yet occurred)', () => {
  const envelope = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  assert.equal(envelope.losing_roots.length, 0)
})

test('CONF-DIST-05: classifyConflictSet returns CONFLICTED for detected envelope', () => {
  const envelope = detectConflictSet({
    competing_roots: fixture.competing_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  assert.equal(classifyConflictSet(envelope), 'CONFLICTED')
})

// ── Boundary cases ────────────────────────────────────────────────────────────

test('CONF-DIST-05: single root → DETECTING (not CONFLICTED)', () => {
  const envelope = detectConflictSet({
    competing_roots: [fixture.competing_roots[0]],
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  assert.equal(envelope.settlement_state, 'DETECTING')
  assert.notEqual(envelope.settlement_state, 'CONFLICTED')
})

test('CONF-DIST-05: empty roots → NULL (not CONFLICTED)', () => {
  const envelope = detectConflictSet({
    competing_roots: [],
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  assert.equal(envelope.settlement_state, 'NULL')
  assert.notEqual(envelope.settlement_state, 'CONFLICTED')
})

test('CONF-DIST-05: three competing roots also produce CONFLICTED', () => {
  const three_roots = [
    ...fixture.competing_roots,
    {
      root_hash: 'root_ccc000000000000000000000000000000000000000000000000000000000000',
      proof_id: 'proof_ccc_001',
      validator_attestations: [],
      causal_clock: { index: 3, partition_id: 'shard_gamma' },
      branch_evidence: {},
    },
  ]
  const envelope = detectConflictSet({
    competing_roots: three_roots,
    epoch_id: fixture.epoch_id,
    detected_at: fixture.detected_at,
  })
  assert.equal(envelope.settlement_state, 'CONFLICTED')
})

// ── Determinism ───────────────────────────────────────────────────────────────

test('CONF-DIST-05: buildConflictEnvelopeId is deterministic and returns cse_ prefix', () => {
  const root_hashes = fixture.competing_roots.map((r) => r.root_hash)
  const id1 = buildConflictEnvelopeId(root_hashes, fixture.epoch_id, fixture.detected_at)
  const id2 = buildConflictEnvelopeId(root_hashes, fixture.epoch_id, fixture.detected_at)
  assert.match(id1, /^cse_[0-9a-f]{64}$/)
  assert.equal(id1, id2)
})

test('CONF-DIST-05: buildConflictEnvelopeId is root-order-independent', () => {
  const hashes = fixture.competing_roots.map((r) => r.root_hash)
  const reversed = [...hashes].reverse()
  const id1 = buildConflictEnvelopeId(hashes, fixture.epoch_id, fixture.detected_at)
  const id2 = buildConflictEnvelopeId(reversed, fixture.epoch_id, fixture.detected_at)
  assert.equal(id1, id2)
})

// ── Migration 0057 structural assertions ──────────────────────────────────────

test('CONF-DIST-05: migration 0057 defines conflict_set_envelope_registry table', () => {
  assert.match(migration0057Sql, /CREATE TABLE IF NOT EXISTS conflict_set_envelope_registry/)
})

test('CONF-DIST-05: migration 0057 settlement_state CHECK includes CONFLICTED', () => {
  assert.match(
    migration0057Sql,
    /CHECK\(settlement_state IN \('DETECTING','CONFLICTED','SETTLEMENT_CANDIDATE','SETTLED','UNSETTLEABLE','NULL'\)\)/,
  )
})

test('CONF-DIST-05: migration 0057 is append-only (no UPDATE, no DELETE)', () => {
  assert.match(migration0057Sql, /cse_no_update/)
  assert.match(migration0057Sql, /UPDATE is forbidden/)
  assert.match(migration0057Sql, /cse_no_delete/)
  assert.match(migration0057Sql, /DELETE is forbidden/)
})

test('CONF-DIST-05: migration 0057 creates_authority=0 enforced', () => {
  assert.match(migration0057Sql, /creates_authority\s+INTEGER.*DEFAULT 0.*CHECK\(creates_authority = 0\)/)
})

test('CONF-DIST-05: migration 0057 restores_replay=0 enforced', () => {
  assert.match(migration0057Sql, /restores_replay\s+INTEGER.*DEFAULT 0.*CHECK\(restores_replay = 0\)/)
})

test('CONF-DIST-05: migration 0057 raw_production_apply_path DENIED guard present', () => {
  assert.match(migration0057Sql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
  assert.match(migration0057Sql, /raw_production_apply_path = 'DENIED'/)
})

test('CONF-DIST-05: migration 0057 cse_settled_requires_winner trigger present', () => {
  assert.match(migration0057Sql, /cse_settled_requires_winner/)
  assert.match(migration0057Sql, /SETTLED conflict_set_envelope requires winning_root/)
})

test('CONF-DIST-05: migration 0057 cse_unsettleable_no_winner trigger present', () => {
  assert.match(migration0057Sql, /cse_unsettleable_no_winner/)
  assert.match(migration0057Sql, /UNSETTLEABLE or NULL conflict_set_envelope must not have winning_root/)
})
