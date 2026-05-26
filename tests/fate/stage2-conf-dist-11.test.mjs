import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifyFromPredicates, creates_authority } from '../../src/lib/finality-classification.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/epoch_mismatch.json', 'utf8'),
)

// ── CONF-DIST-11: Epoch mismatch prevents CONVERGENCE_VALID ───────────────────
//
// Stage 2 invariant: epoch mismatch between a classification attempt and the
// epoch registry must prevent CONVERGENCE_VALID. A stale or blocking epoch
// forces the classification to STALE_VISIBLE or NULL, regardless of predicate quality.
//
// Key rule: STALE_VISIBLE and NULL are both non-executable states. Neither allows
// promotion to CONVERGENCE_VALID or GLOBAL_VALID. Epoch staleness is enforced at
// classification time (classifyFromPredicates) and at DB level (er_stale_downgrade
// trigger in migration 0054).
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md §14
// Anchor issue: #1418  Slice: C

test('CONF-DIST-11: fixture is non-operative and classification evidence is not authority', () => {
  assert.equal(fixture._non_operative, true)
  assert.equal(creates_authority, false)
})

test('CONF-DIST-11: fixture expected outcome is STALE_VISIBLE', () => {
  assert.equal(fixture.expected_classification, 'STALE_VISIBLE')
  assert.ok(fixture.forbidden_classifications.includes('CONVERGENCE_VALID'))
  assert.ok(fixture.forbidden_classifications.includes('GLOBAL_VALID'))
})

test('CONF-DIST-11: EPOCH_STALE_VISIBLE forces STALE_VISIBLE regardless of convergence predicates', () => {
  const p = fixture.predicate_snapshot
  const result = classifyFromPredicates(p, fixture.topology_present, fixture.epoch_status)
  assert.equal(result, fixture.expected_classification)
  assert.equal(result, 'STALE_VISIBLE')
  assert.notEqual(result, 'CONVERGENCE_VALID')
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('CONF-DIST-11: EPOCH_STALE_VISIBLE blocks CONVERGENCE_VALID even when all predicates are true', () => {
  const allTrue = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  }
  const result = classifyFromPredicates(allTrue, true, 'EPOCH_STALE_VISIBLE')
  assert.equal(result, 'STALE_VISIBLE')
  assert.notEqual(result, 'CONVERGENCE_VALID')
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('CONF-DIST-11: EPOCH_PARTITION_SUSPENDED forces PARTITION_SUSPENDED', () => {
  const allTrue = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  }
  const result = classifyFromPredicates(allTrue, true, 'EPOCH_PARTITION_SUSPENDED')
  assert.equal(result, 'PARTITION_SUSPENDED')
  assert.notEqual(result, 'CONVERGENCE_VALID')
})

test('CONF-DIST-11: EPOCH_AMBIGUOUS forces NULL (blocking epoch state)', () => {
  const allTrue = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  }
  const result = classifyFromPredicates(allTrue, true, 'EPOCH_AMBIGUOUS')
  assert.equal(result, 'NULL')
  assert.notEqual(result, 'CONVERGENCE_VALID')
})

test('CONF-DIST-11: EPOCH_CONFLICTED forces NULL (blocking epoch state)', () => {
  const allTrue = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  }
  const result = classifyFromPredicates(allTrue, true, 'EPOCH_CONFLICTED')
  assert.equal(result, 'NULL')
  assert.notEqual(result, 'CONVERGENCE_VALID')
})

test('CONF-DIST-11: EPOCH_REVOKED forces NULL (blocking epoch state)', () => {
  const allTrue = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  }
  const result = classifyFromPredicates(allTrue, true, 'EPOCH_REVOKED')
  assert.equal(result, 'NULL')
  assert.notEqual(result, 'CONVERGENCE_VALID')
})

test('CONF-DIST-11: EPOCH_NULL forces NULL (terminal blocking state)', () => {
  const allTrue = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  }
  const result = classifyFromPredicates(allTrue, true, 'EPOCH_NULL')
  assert.equal(result, 'NULL')
  assert.notEqual(result, 'CONVERGENCE_VALID')
})

test('CONF-DIST-11: EPOCH_GLOBAL_AUTHORITATIVE allows GLOBAL_VALID with full convergence predicates', () => {
  // Control: a non-blocking epoch with full predicates CAN reach GLOBAL_VALID
  const allTrue = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  }
  const result = classifyFromPredicates(allTrue, true, 'EPOCH_GLOBAL_AUTHORITATIVE')
  assert.equal(result, 'GLOBAL_VALID')
})

test('CONF-DIST-11: null epochStatus allows CONVERGENCE_VALID (epoch coupling not yet established)', () => {
  // Control: absence of epoch coupling still allows CONVERGENCE_VALID as ceiling
  const allTrue = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  }
  const result = classifyFromPredicates(allTrue, true, null)
  assert.equal(result, 'CONVERGENCE_VALID')
  assert.notEqual(result, 'GLOBAL_VALID')
})

// ── Migration 0054 structural assertions ─────────────────────────────────────

const migration0054Sql = readFileSync('migrations/0054_epoch_settlement_coupling.sql', 'utf8')

test('CONF-DIST-11: migration 0054 defines er_valid_transition_check trigger', () => {
  assert.match(migration0054Sql, /er_valid_transition_check/)
  assert.match(migration0054Sql, /isValidEpochTransition/)
  assert.match(migration0054Sql, /invalid epoch state machine transition/)
})

test('CONF-DIST-11: migration 0054 defines er_stale_downgrade trigger', () => {
  assert.match(migration0054Sql, /er_stale_downgrade/)
  assert.match(migration0054Sql, /EPOCH_STALE_VISIBLE/)
  assert.match(migration0054Sql, /EPOCH_STALE_DOWNGRADE/)
  assert.match(migration0054Sql, /STALE_VISIBLE/)
})

test('CONF-DIST-11: migration 0054 er_stale_downgrade fires AFTER INSERT', () => {
  assert.match(migration0054Sql, /AFTER INSERT ON epoch_registry/)
})

test('CONF-DIST-11: migration 0054 stale downgrade excludes already-terminal records', () => {
  assert.match(migration0054Sql, /classification NOT IN \('NULL', 'STALE_VISIBLE'\)/)
})

test('CONF-DIST-11: migration 0054 stale downgrade sets raw_production_apply_path DENIED', () => {
  assert.match(migration0054Sql, /'DENIED'/)
})

test('CONF-DIST-11: migration 0054 er_valid_transition_check covers all non-terminal epoch states', () => {
  assert.match(migration0054Sql, /EPOCH_LOCAL/)
  assert.match(migration0054Sql, /EPOCH_GLOBAL_CANDIDATE/)
  assert.match(migration0054Sql, /EPOCH_GLOBAL_AUTHORITATIVE/)
  assert.match(migration0054Sql, /EPOCH_AMBIGUOUS/)
  assert.match(migration0054Sql, /EPOCH_STALE_VISIBLE/)
  assert.match(migration0054Sql, /EPOCH_PARTITION_SUSPENDED/)
  assert.match(migration0054Sql, /EPOCH_CONFLICTED/)
  assert.match(migration0054Sql, /EPOCH_REVOKED/)
})
