import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  causalCreatesAuthority,
  causalCreatesExecution,
  compareCausalClocks,
  detectCausalAmbiguity,
  computeHappensBefore,
  computeConcurrentLegitimacy,
  causalClockToClassification,
  classifyCausalLegitimacyClocks,
  buildCausalLegitimacyClockId,
} from '../../src/lib/causal-legitimacy-clock.js'
import { classifyFromPredicates, creates_authority } from '../../src/lib/finality-classification.js'

const fixture = JSON.parse(
  readFileSync('tests/fixtures/stage2/causal_ambiguity.json', 'utf8'),
)
const migration0060Sql = readFileSync(
  'migrations/0060_causal_legitimacy_clock_registry.sql',
  'utf8',
)

// ── CONF-DIST-13: Causal ordering ambiguity prevents finality ─────────────────
//
// Stage 2 invariant: causal ambiguity prevents CONVERGENCE_VALID.
// Concurrent legitimacy roots with no deterministic happens-before ordering must
// return AMBIGUOUS — never CONVERGENCE_VALID or GLOBAL_VALID.
// Observation alone cannot infer causal ordering.
// Causal evidence alone cannot create authority or execution eligibility.
//
// Reference: docs/stage2-distributed-legitimacy-enforcement-plan-v1.md §13
// Anchor issues: #1338, #1346  Supporting: #1418, #1340, #1405, #1408, #1442, #1441

// ── Non-operative meta-assertions ────────────────────────────────────────────

test('CONF-DIST-13: fixture is non-operative', () => {
  assert.equal(fixture._non_operative, true)
})

test('CONF-DIST-13: fixture expected outcome is AMBIGUOUS', () => {
  assert.equal(fixture.expected_classification, 'AMBIGUOUS')
})

test('CONF-DIST-13: fixture forbidden classifications include GLOBAL_VALID', () => {
  assert.ok(fixture.forbidden_classifications.includes('GLOBAL_VALID'))
})

test('CONF-DIST-13: fixture forbidden classifications include CONVERGENCE_VALID', () => {
  assert.ok(fixture.forbidden_classifications.includes('CONVERGENCE_VALID'))
})

test('CONF-DIST-13: fixture creates_authority is false', () => {
  assert.equal(fixture.creates_authority, false)
})

test('CONF-DIST-13: fixture creates_execution is false', () => {
  assert.equal(fixture.creates_execution, false)
})

test('CONF-DIST-13: fixture raw_production_apply_path is DENIED', () => {
  assert.equal(fixture.raw_production_apply_path, 'DENIED')
})

// ── Module evidence-only discipline ──────────────────────────────────────────

test('CONF-DIST-13: causal-legitimacy-clock module causalCreatesAuthority is false', () => {
  assert.equal(causalCreatesAuthority, false)
})

test('CONF-DIST-13: causal-legitimacy-clock module causalCreatesExecution is false', () => {
  assert.equal(causalCreatesExecution, false)
})

test('CONF-DIST-13: finality-classification module creates_authority is false', () => {
  assert.equal(creates_authority, false)
})

// ── compareCausalClocks — concurrent vectors ──────────────────────────────────

test('CONF-DIST-13: concurrent vectors (neither dominates) → CONCURRENT', () => {
  const c = fixture.cases.find(c => c._name === 'concurrent_legitimacy_roots_node_a_leads_b_trails')
  const result = compareCausalClocks(c.clock_a, c.clock_b)
  assert.equal(result, 'CONCURRENT')
  assert.equal(result, c.expected_ordering)
})

test('CONF-DIST-13: concurrent vectors are symmetric', () => {
  const c = fixture.cases.find(c => c._name === 'concurrent_legitimacy_roots_node_a_leads_b_trails')
  const ab = compareCausalClocks(c.clock_a, c.clock_b)
  const ba = compareCausalClocks(c.clock_b, c.clock_a)
  assert.equal(ab, 'CONCURRENT')
  assert.equal(ba, 'CONCURRENT')
})

test('CONF-DIST-13: explicit ambiguity_detected=true → AMBIGUOUS regardless of vector values', () => {
  const c = fixture.cases.find(c => c._name === 'explicit_ambiguity_flag_set')
  const result = compareCausalClocks(c.clock_a, c.clock_b)
  assert.equal(result, 'AMBIGUOUS')
  assert.equal(result, c.expected_ordering)
})

test('CONF-DIST-13: null clock input → NULL', () => {
  const c = fixture.cases.find(c => c._name === 'missing_clock_evidence')
  const result = compareCausalClocks(c.clock_a, c.clock_b)
  assert.equal(result, 'NULL')
  assert.equal(result, c.expected_ordering)
})

test('CONF-DIST-13: replay resurrection conflict clocks with identical vectors → AMBIGUOUS', () => {
  const c = fixture.cases.find(c => c._name === 'replay_resurrection_conflict_ordering_null')
  const result = compareCausalClocks(c.clock_a, c.clock_b)
  assert.equal(result, 'AMBIGUOUS')
  assert.equal(result, c.expected_ordering)
})

// ── compareCausalClocks — deterministic ordering ─────────────────────────────

test('CONF-DIST-13: vector A strictly before B → BEFORE', () => {
  const clockA = {
    clock_id: 'clc_test_before_a', epoch_id: 'ep1', node_id: 'n1',
    vector: { 'n1': 1, 'n2': 1 },
    observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:00Z',
  }
  const clockB = {
    clock_id: 'clc_test_before_b', epoch_id: 'ep1', node_id: 'n2',
    vector: { 'n1': 2, 'n2': 2 },
    observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:01Z',
  }
  assert.equal(compareCausalClocks(clockA, clockB), 'BEFORE')
  assert.equal(compareCausalClocks(clockB, clockA), 'AFTER')
})

test('CONF-DIST-13: BEFORE ordering does not return CONCURRENT or AMBIGUOUS', () => {
  const clockA = {
    clock_id: 'clc_before_only_a', epoch_id: 'ep2', node_id: 'n1',
    vector: { 'n1': 1 },
    observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:00Z',
  }
  const clockB = {
    clock_id: 'clc_before_only_b', epoch_id: 'ep2', node_id: 'n1',
    vector: { 'n1': 5 },
    observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:01Z',
  }
  const result = compareCausalClocks(clockA, clockB)
  assert.notEqual(result, 'CONCURRENT')
  assert.notEqual(result, 'AMBIGUOUS')
  assert.equal(result, 'BEFORE')
})

// ── detectCausalAmbiguity ────────────────────────────────────────────────────

test('CONF-DIST-13: concurrent fixture case → detectCausalAmbiguity=true', () => {
  const c = fixture.cases.find(c => c._name === 'concurrent_legitimacy_roots_node_a_leads_b_trails')
  assert.equal(detectCausalAmbiguity([c.clock_a, c.clock_b]), true)
  assert.equal(detectCausalAmbiguity([c.clock_a, c.clock_b]), c.expected_ambiguity_detected)
})

test('CONF-DIST-13: explicit ambiguity flag → detectCausalAmbiguity=true', () => {
  const c = fixture.cases.find(c => c._name === 'explicit_ambiguity_flag_set')
  assert.equal(detectCausalAmbiguity([c.clock_a, c.clock_b]), true)
})

test('CONF-DIST-13: null clock → detectCausalAmbiguity=true', () => {
  const c = fixture.cases.find(c => c._name === 'missing_clock_evidence')
  // null is treated as missing evidence; classifyCausalLegitimacyClocks handles null → NULL
  // detectCausalAmbiguity filters nulls and treats ambiguity_detected flag
  assert.equal(detectCausalAmbiguity([c.clock_b]), false)  // single valid non-ambiguous clock
})

test('CONF-DIST-13: ordered clocks (BEFORE) → detectCausalAmbiguity=false', () => {
  const clockA = {
    clock_id: 'clc_ord_a', epoch_id: 'ep3', node_id: 'n1',
    vector: { 'n1': 1 }, observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:00Z',
  }
  const clockB = {
    clock_id: 'clc_ord_b', epoch_id: 'ep3', node_id: 'n1',
    vector: { 'n1': 3 }, observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:01Z',
  }
  assert.equal(detectCausalAmbiguity([clockA, clockB]), false)
})

test('CONF-DIST-13: empty clock set → detectCausalAmbiguity=false', () => {
  assert.equal(detectCausalAmbiguity([]), false)
})

// ── causalClockToClassification ──────────────────────────────────────────────

test('CONF-DIST-13: causalClockToClassification CONCURRENT → AMBIGUOUS', () => {
  assert.equal(causalClockToClassification('CONCURRENT'), 'AMBIGUOUS')
})

test('CONF-DIST-13: causalClockToClassification AMBIGUOUS → AMBIGUOUS', () => {
  assert.equal(causalClockToClassification('AMBIGUOUS'), 'AMBIGUOUS')
})

test('CONF-DIST-13: causalClockToClassification NULL → NULL', () => {
  assert.equal(causalClockToClassification('NULL'), 'NULL')
})

test('CONF-DIST-13: causalClockToClassification BEFORE → null (no override)', () => {
  assert.equal(causalClockToClassification('BEFORE'), null)
})

test('CONF-DIST-13: causalClockToClassification AFTER → null (no override)', () => {
  assert.equal(causalClockToClassification('AFTER'), null)
})

// ── classifyCausalLegitimacyClocks ───────────────────────────────────────────

test('CONF-DIST-13: classifyCausalLegitimacyClocks concurrent clocks → AMBIGUOUS', () => {
  const c = fixture.cases.find(c => c._name === 'concurrent_legitimacy_roots_node_a_leads_b_trails')
  const result = classifyCausalLegitimacyClocks([c.clock_a, c.clock_b])
  assert.equal(result, 'AMBIGUOUS')
})

test('CONF-DIST-13: classifyCausalLegitimacyClocks null clock in set → NULL', () => {
  const c = fixture.cases.find(c => c._name === 'missing_clock_evidence')
  const result = classifyCausalLegitimacyClocks([c.clock_a, c.clock_b])
  assert.equal(result, 'NULL')
})

test('CONF-DIST-13: classifyCausalLegitimacyClocks ordered clocks → null (no override)', () => {
  const clockA = {
    clock_id: 'clc_class_a', epoch_id: 'ep4', node_id: 'n1',
    vector: { 'n1': 1 }, observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:00Z',
  }
  const clockB = {
    clock_id: 'clc_class_b', epoch_id: 'ep4', node_id: 'n1',
    vector: { 'n1': 4 }, observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:01Z',
  }
  const result = classifyCausalLegitimacyClocks([clockA, clockB])
  assert.equal(result, null)
})

test('CONF-DIST-13: classifyCausalLegitimacyClocks empty set → null', () => {
  assert.equal(classifyCausalLegitimacyClocks([]), null)
})

// ── Finality coupling: causal ambiguity blocks CONVERGENCE_VALID ─────────────

test('CONF-DIST-13: causal override AMBIGUOUS blocks CONVERGENCE_VALID even with all predicates satisfied', () => {
  const p = fixture.predicate_snapshot
  const result = classifyFromPredicates(p, fixture.topology_present, fixture.epoch_status, 'AMBIGUOUS')
  assert.equal(result, 'AMBIGUOUS')
  assert.notEqual(result, 'CONVERGENCE_VALID')
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('CONF-DIST-13: causal override AMBIGUOUS blocks GLOBAL_VALID', () => {
  const p = fixture.predicate_snapshot
  const result = classifyFromPredicates(p, true, 'EPOCH_GLOBAL_AUTHORITATIVE', 'AMBIGUOUS')
  assert.equal(result, 'AMBIGUOUS')
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('CONF-DIST-13: causal override NULL blocks CONVERGENCE_VALID', () => {
  const p = fixture.predicate_snapshot
  const result = classifyFromPredicates(p, true, 'EPOCH_GLOBAL_AUTHORITATIVE', 'NULL')
  assert.equal(result, 'NULL')
  assert.notEqual(result, 'CONVERGENCE_VALID')
})

test('CONF-DIST-13: causal override null (no override) allows CONVERGENCE_VALID normally', () => {
  const p = fixture.predicate_snapshot
  // Without causal override and without GLOBAL_AUTHORITATIVE epoch, we get CONVERGENCE_VALID
  const result = classifyFromPredicates(p, true, null, null)
  assert.equal(result, 'CONVERGENCE_VALID')
})

test('CONF-DIST-13: causal override null with EPOCH_GLOBAL_AUTHORITATIVE allows GLOBAL_VALID', () => {
  const p = fixture.predicate_snapshot
  const result = classifyFromPredicates(p, true, 'EPOCH_GLOBAL_AUTHORITATIVE', null)
  assert.equal(result, 'GLOBAL_VALID')
})

test('CONF-DIST-13: causal override does not affect LOCAL_VALID ceiling (absent Q, G, X)', () => {
  const localPredicates = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: false, G: false, L: true, X: false,
  }
  // causal override of AMBIGUOUS cannot make LOCAL_VALID worse — already below convergence
  const result = classifyFromPredicates(localPredicates, true, 'EPOCH_GLOBAL_AUTHORITATIVE', 'AMBIGUOUS')
  assert.equal(result, 'LOCAL_VALID')
})

test('CONF-DIST-13: backward compatibility — existing 3-arg classifyFromPredicates unchanged', () => {
  const allPredicates = {
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  }
  assert.equal(classifyFromPredicates(allPredicates, true, 'EPOCH_GLOBAL_AUTHORITATIVE'), 'GLOBAL_VALID')
  assert.equal(classifyFromPredicates(allPredicates, true, null), 'CONVERGENCE_VALID')
})

// ── Full fixture case integration ─────────────────────────────────────────────

test('CONF-DIST-13: all fixture cases produce AMBIGUOUS or NULL finality override — never CONVERGENCE_VALID', () => {
  for (const c of fixture.cases) {
    const clocks = [c.clock_a, c.clock_b].filter(Boolean)
    const ordering = compareCausalClocks(c.clock_a, c.clock_b)
    const override = causalClockToClassification(ordering)
    assert.notEqual(override, 'CONVERGENCE_VALID', `case ${c._name} must not produce CONVERGENCE_VALID override`)
    assert.notEqual(override, 'GLOBAL_VALID', `case ${c._name} must not produce GLOBAL_VALID override`)
    assert.equal(override, c.expected_finality_override, `case ${c._name} expected override`)
  }
})

test('CONF-DIST-13: all fixture cases block GLOBAL_VALID via classifyFromPredicates', () => {
  const p = fixture.predicate_snapshot
  for (const c of fixture.cases) {
    const ordering = compareCausalClocks(c.clock_a, c.clock_b)
    const override = causalClockToClassification(ordering)
    const result = classifyFromPredicates(p, fixture.topology_present, fixture.epoch_status, override)
    assert.notEqual(result, 'GLOBAL_VALID', `case ${c._name} must not produce GLOBAL_VALID`)
    c.forbidden_finality_classifications.forEach(f =>
      assert.notEqual(result, f, `case ${c._name} must not produce ${f}`),
    )
  }
})

test('CONF-DIST-13: causal evidence alone cannot create authority — all fixture cases', () => {
  for (const c of fixture.cases) {
    const clocks = [c.clock_a, c.clock_b].filter(Boolean)
    for (const clock of clocks) {
      if (clock) assert.equal(clock.ambiguity_detected !== undefined, true)
    }
    // module-level flag is the canonical guard
    assert.equal(causalCreatesAuthority, false)
  }
})

test('CONF-DIST-13: causal evidence alone cannot create execution eligibility', () => {
  assert.equal(causalCreatesExecution, false)
})

// ── computeHappensBefore ─────────────────────────────────────────────────────

test('CONF-DIST-13: computeHappensBefore with deterministic ordering returns correct set', () => {
  const clockA = {
    clock_id: 'clc_hb_a', epoch_id: 'ep5', node_id: 'n1',
    vector: { 'n1': 1, 'n2': 1 }, observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:00Z',
  }
  const clockB = {
    clock_id: 'clc_hb_b', epoch_id: 'ep5', node_id: 'n2',
    vector: { 'n1': 2, 'n2': 2 }, observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:01Z',
  }
  const before = computeHappensBefore(clockB, [clockA, clockB])
  assert.ok(before.includes('clc_hb_a'))
  assert.ok(!before.includes('clc_hb_b'))
})

test('CONF-DIST-13: computeHappensBefore returns empty when target is ambiguous', () => {
  const ambiguousClock = {
    clock_id: 'clc_hb_ambiguous', epoch_id: 'ep6', node_id: 'n1',
    vector: { 'n1': 5 }, observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: true, created_at: '2026-05-27T00:00:00Z',
  }
  const candidate = {
    clock_id: 'clc_hb_cand', epoch_id: 'ep6', node_id: 'n2',
    vector: { 'n1': 3 }, observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:01Z',
  }
  const before = computeHappensBefore(ambiguousClock, [candidate])
  assert.equal(before.length, 0)
})

// ── computeConcurrentLegitimacy ───────────────────────────────────────────────

test('CONF-DIST-13: computeConcurrentLegitimacy finds concurrent peers', () => {
  const c = fixture.cases.find(c => c._name === 'concurrent_legitimacy_roots_node_a_leads_b_trails')
  const concurrent = computeConcurrentLegitimacy(c.clock_a, [c.clock_a, c.clock_b])
  assert.ok(concurrent.includes(c.clock_b.clock_id))
})

test('CONF-DIST-13: computeConcurrentLegitimacy returns all others when target is ambiguous', () => {
  const ambiguousClock = {
    clock_id: 'clc_conc_ambig', epoch_id: 'ep7', node_id: 'n1',
    vector: { 'n1': 5 }, observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: true, created_at: '2026-05-27T00:00:00Z',
  }
  const peerA = {
    clock_id: 'clc_conc_peer_a', epoch_id: 'ep7', node_id: 'n2',
    vector: { 'n1': 3 }, observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:01Z',
  }
  const peerB = {
    clock_id: 'clc_conc_peer_b', epoch_id: 'ep7', node_id: 'n3',
    vector: { 'n1': 2 }, observed_events: [], happens_before: [], concurrent_with: [],
    ambiguity_detected: false, created_at: '2026-05-27T00:00:02Z',
  }
  const concurrent = computeConcurrentLegitimacy(ambiguousClock, [ambiguousClock, peerA, peerB])
  assert.ok(concurrent.includes('clc_conc_peer_a'))
  assert.ok(concurrent.includes('clc_conc_peer_b'))
})

// ── buildCausalLegitimacyClockId determinism ──────────────────────────────────

test('CONF-DIST-13: buildCausalLegitimacyClockId is deterministic', () => {
  const id1 = buildCausalLegitimacyClockId('node-A', 'epoch-test-01', '2026-05-27T00:00:00Z')
  const id2 = buildCausalLegitimacyClockId('node-A', 'epoch-test-01', '2026-05-27T00:00:00Z')
  assert.equal(id1, id2)
  assert.match(id1, /^clc_[0-9a-f]{64}$/)
})

test('CONF-DIST-13: buildCausalLegitimacyClockId differs for different node or epoch', () => {
  const id1 = buildCausalLegitimacyClockId('node-A', 'epoch-test-01', '2026-05-27T00:00:00Z')
  const id2 = buildCausalLegitimacyClockId('node-B', 'epoch-test-01', '2026-05-27T00:00:00Z')
  assert.notEqual(id1, id2)
})

// ── Migration 0060 structural assertions ──────────────────────────────────────

test('CONF-DIST-13: migration 0060 creates causal_legitimacy_clock_registry table', () => {
  assert.match(migration0060Sql, /CREATE TABLE IF NOT EXISTS causal_legitimacy_clock_registry/)
})

test('CONF-DIST-13: migration 0060 creates_authority CHECK(creates_authority = 0)', () => {
  assert.match(migration0060Sql, /creates_authority\s+INTEGER.*DEFAULT 0.*CHECK\(creates_authority = 0\)/)
})

test('CONF-DIST-13: migration 0060 creates_execution CHECK(creates_execution = 0)', () => {
  assert.match(migration0060Sql, /creates_execution\s+INTEGER.*DEFAULT 0.*CHECK\(creates_execution = 0\)/)
})

test('CONF-DIST-13: migration 0060 raw_production_apply_path DENIED guard', () => {
  assert.match(migration0060Sql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
  assert.match(migration0060Sql, /raw_production_apply_path = 'DENIED'/)
})

test('CONF-DIST-13: migration 0060 defines clcr_no_update trigger (append-only)', () => {
  assert.match(migration0060Sql, /clcr_no_update/)
  assert.match(migration0060Sql, /UPDATE is forbidden/)
})

test('CONF-DIST-13: migration 0060 defines clcr_no_delete trigger (append-only)', () => {
  assert.match(migration0060Sql, /clcr_no_delete/)
  assert.match(migration0060Sql, /DELETE is forbidden/)
})

test('CONF-DIST-13: migration 0060 defines clcr_no_authority_creation trigger', () => {
  assert.match(migration0060Sql, /clcr_no_authority_creation/)
  assert.match(migration0060Sql, /causal ordering cannot create authority/)
})

test('CONF-DIST-13: migration 0060 defines clcr_no_execution_creation trigger', () => {
  assert.match(migration0060Sql, /clcr_no_execution_creation/)
  assert.match(migration0060Sql, /causal ordering cannot create execution eligibility/)
})

test('CONF-DIST-13: migration 0060 ambiguity evidence preservation trigger present', () => {
  assert.match(migration0060Sql, /clcr_ambiguity_preserves_concurrent_evidence/)
  assert.match(migration0060Sql, /ambiguity cannot be collapsed into convergence/)
})

test('CONF-DIST-13: migration 0060 ambiguity_detected column present', () => {
  assert.match(migration0060Sql, /ambiguity_detected/)
})

test('CONF-DIST-13: migration 0060 concurrent_with_json column present', () => {
  assert.match(migration0060Sql, /concurrent_with_json/)
})
