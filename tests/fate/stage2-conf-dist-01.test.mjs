import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifyFromPredicates, creates_authority } from '../../src/lib/finality-classification.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/local_valid_no_global_promotion.json', 'utf8'),
)

// ── CONF-DIST-01: LOCAL_VALID does not imply GLOBAL_VALID ──────────────────────
//
// Stage 2 invariant: local correctness ≠ distributed legitimacy coherence.
// Absent distributed predicates (Q, G, X), classification cannot exceed LOCAL_VALID
// regardless of topology visibility or epoch state.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md §14
// Anchor issue: #1340  Supporting: #1418, #1347, #1348, #1405, #1440, #1441, #1442, #1443

test('CONF-DIST-01: fixture is non-operative and classification evidence is not authority', () => {
  assert.equal(fixture._non_operative, true)
  assert.equal(creates_authority, false)
})

test('CONF-DIST-01: fixture expected outcome is LOCAL_VALID', () => {
  assert.equal(fixture.expected_classification, 'LOCAL_VALID')
  assert.ok(fixture.forbidden_classifications.includes('GLOBAL_VALID'))
})

test('CONF-DIST-01: LOCAL_VALID when Q, G, X absent — topology present, epoch valid', () => {
  const p = fixture.predicate_snapshot
  const result = classifyFromPredicates(p, fixture.topology_present, fixture.epoch_valid)
  assert.equal(result, fixture.expected_classification)
  assert.equal(result, 'LOCAL_VALID')
})

test('CONF-DIST-01: GLOBAL_VALID is not reachable from predicates with Q=false', () => {
  const p = { ...fixture.predicate_snapshot, Q: false }
  const result = classifyFromPredicates(p, true, true)
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('CONF-DIST-01: GLOBAL_VALID is not reachable from predicates with G=false', () => {
  const p = { ...fixture.predicate_snapshot, G: false }
  const result = classifyFromPredicates(p, true, true)
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('CONF-DIST-01: GLOBAL_VALID is not reachable from predicates with X=false', () => {
  const p = { ...fixture.predicate_snapshot, X: false }
  const result = classifyFromPredicates(p, true, true)
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('CONF-DIST-01: epochValid=true alone does not promote LOCAL_VALID to GLOBAL_VALID', () => {
  // epoch validity is necessary but not sufficient — convergence evidence required
  const localPredicates = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: false, G: false, L: true, X: false,
  }
  const result = classifyFromPredicates(localPredicates, true, true)
  assert.equal(result, 'LOCAL_VALID')
  assert.notEqual(result, 'GLOBAL_VALID')
  assert.notEqual(result, 'CONVERGENCE_VALID')
})

test('CONF-DIST-01: topology presence alone does not promote LOCAL_VALID to GLOBAL_VALID', () => {
  const localPredicates = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: false, G: false, L: true, X: false,
  }
  const result = classifyFromPredicates(localPredicates, true, false)
  assert.equal(result, 'LOCAL_VALID')
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('CONF-DIST-01: GLOBAL_VALID requires all of Q, G, L, X and epochValid=true', () => {
  const convergencePredicates = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  }
  const withEpoch = classifyFromPredicates(convergencePredicates, true, true)
  const withoutEpoch = classifyFromPredicates(convergencePredicates, true, false)
  assert.equal(withEpoch, 'GLOBAL_VALID')
  assert.equal(withoutEpoch, 'CONVERGENCE_VALID') // intermediate — not yet GLOBAL_VALID
})

// ── Migration 0053 structural assertions ───────────────────────────────────────

const migration0053Sql = readFileSync('migrations/0053_finality_classification_convergence_valid.sql', 'utf8')

test('CONF-DIST-01: migration 0053 adds CONVERGENCE_VALID to classification vocabulary', () => {
  assert.match(
    migration0053Sql,
    /CHECK\(classification IN \('LOCAL_VALID','CONVERGENCE_VALID','GLOBAL_VALID','AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL'\)\)/,
  )
})

test('CONF-DIST-01: migration 0053 fcr_global_valid_requires_convergence_supersession trigger present', () => {
  assert.match(migration0053Sql, /fcr_global_valid_requires_convergence_supersession/)
  assert.match(migration0053Sql, /LOCAL_VALID cannot be directly promoted to GLOBAL_VALID/)
})

test('CONF-DIST-01: migration 0053 enforces GLOBAL_VALID must supersede CONVERGENCE_VALID record', () => {
  assert.match(migration0053Sql, /GLOBAL_VALID must supersede a CONVERGENCE_VALID record/)
  assert.match(migration0053Sql, /direct promotion without convergence evidence is forbidden/)
})

test('CONF-DIST-01: migration 0053 raw_production_apply_path remains DENIED', () => {
  assert.match(migration0053Sql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
  assert.match(migration0053Sql, /raw_production_apply_path = 'DENIED'/)
})
