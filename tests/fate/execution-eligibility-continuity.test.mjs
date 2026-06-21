// tests/fate/execution-eligibility-continuity.test.mjs
// FATE — Execution-Eligibility Continuity Gate (the runtime lineage primitive).
//
// Proves: a current run is ELIGIBLE to execute ONLY IF it inherits the verified
// terminal state of the prior run on the same lineage —
//     validated_object(N-1) -> executed_object(N) -> proof(N)
// and is NULL (fail-closed) on every broken inheritance. Plus the Primitive-Gate
// properties: NULL-default, creates no authority, narrows only.

import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  GENESIS_EXECUTION_STATE,
  classifyExecutionEligibility,
  eligibilityCarry,
  ELIGIBILITY_NULL_REASONS,
} from '../../runtime/lineage/executionEligibility.mjs'
import {
  admitRun,
  headCarry,
  verifyRegistryChain,
  readEntries,
} from '../../runtime/lineage/proofChainRegistry.mjs'

const KEY = 'owner/repo@main'
const FUTURE = '2099-01-01T00:00:00Z'

// A prior carry (terminal state of run N-1) that is a legitimate base to inherit.
function priorCarry(over = {}) {
  return {
    continuity_id: 'c1',
    validated_object_hash: 'obj1',
    executed_object_hash: 'obj1', // validated == executed held last run
    proof_hash: 'p1',
    status: 'ACTIVE',
    expires_at: FUTURE,
    revoked_at: '',
    ...over,
  }
}

// A current candidate (run N) that correctly inherits priorCarry().
function current(over = {}) {
  return {
    lineage_key: KEY,
    continuity_id: 'c2',
    parent_continuity_id: 'c1', // inherits prior continuity head
    parent_executed_object_hash: 'obj1', // inherits prior executed object
    validated_object_hash: 'obj2',
    executed_object_hash: 'obj2',
    nonce: 'n2',
    ...over,
  }
}

test('ELIGIBLE: a run that inherits the prior executed object + continuity head', () => {
  const d = classifyExecutionEligibility(priorCarry(), current(), { now: '2026-06-20T00:00:00Z' })
  assert.equal(d.eligibility, 'ELIGIBLE')
  assert.deepEqual(d.null_reasons, [])
  assert.equal(d.creates_authority, false)
  assert.equal(d.widens_eligibility, false)
})

test('genesis root: first run must inherit GENESIS_EXECUTION_STATE, not invent a parent', () => {
  const root = {
    lineage_key: KEY,
    continuity_id: 'c0',
    parent_continuity_id: '',
    parent_executed_object_hash: GENESIS_EXECUTION_STATE.executed_object_hash,
    validated_object_hash: 'obj0',
    executed_object_hash: 'obj0',
    nonce: 'n0',
  }
  assert.equal(classifyExecutionEligibility(null, root, { now: '2026-06-20T00:00:00Z' }).eligibility, 'ELIGIBLE')
  // A root that fabricates a parent executed object is NULL.
  const fabricated = { ...root, parent_executed_object_hash: 'fabricated' }
  assert.equal(classifyExecutionEligibility(null, fabricated).eligibility, 'NULL')
})

// ── Fail-closed: one NULL per inheritance predicate ──────────────────────────

test('NULL — UNVALIDATED_CURRENT: no validated object → nothing happens', () => {
  const d = classifyExecutionEligibility(priorCarry(), current({ validated_object_hash: '' }))
  assert.equal(d.eligibility, 'NULL')
  assert.equal(d.null_reasons.includes('UNVALIDATED_CURRENT'), true)
})

test('NULL — PRIOR_INVARIANT_BROKEN: last run had validated != executed', () => {
  const d = classifyExecutionEligibility(priorCarry({ executed_object_hash: 'mismatch' }), current({ parent_executed_object_hash: 'mismatch' }))
  assert.equal(d.null_reasons.includes('PRIOR_INVARIANT_BROKEN'), true)
})

test('NULL — UNINHERITED_EXECUTED_STATE: current does not inherit prior executed object', () => {
  const d = classifyExecutionEligibility(priorCarry(), current({ parent_executed_object_hash: 'somethingelse' }))
  assert.equal(d.eligibility, 'NULL')
  assert.equal(d.null_reasons.includes('UNINHERITED_EXECUTED_STATE'), true)
})

test('NULL — BROKEN_CONTINUITY: current does not inherit the continuity head', () => {
  const d = classifyExecutionEligibility(priorCarry(), current({ parent_continuity_id: 'cX' }))
  assert.equal(d.null_reasons.includes('BROKEN_CONTINUITY'), true)
})

test('NULL — REVOKED_LINEAGE: prior lineage revoked', () => {
  const d = classifyExecutionEligibility(priorCarry({ revoked_at: '2026-01-01T00:00:00Z' }), current())
  assert.equal(d.null_reasons.includes('REVOKED_LINEAGE'), true)
})

test('NULL — EXPIRED_LINEAGE: prior lineage expired before now', () => {
  const d = classifyExecutionEligibility(priorCarry({ expires_at: '2000-01-01T00:00:00Z' }), current(), { now: '2026-06-20T00:00:00Z' })
  assert.equal(d.null_reasons.includes('EXPIRED_LINEAGE'), true)
})

test('NULL — REPLAYED_NONCE: nonce already consumed (no replay restoration)', () => {
  const d = classifyExecutionEligibility(priorCarry(), current({ nonce: 'used' }), { consumed_nonces: ['used'] })
  assert.equal(d.null_reasons.includes('REPLAYED_NONCE'), true)
})

// ── Primitive-Gate properties (docs/stage2-primitive-packaging-plan-v1.md §13) ─

test('Primitive Gate: default is NULL and the gate creates no authority', () => {
  const d = classifyExecutionEligibility(priorCarry(), {}) // empty current
  assert.equal(d.eligibility, 'NULL')
  assert.equal(d.creates_authority, false)
})

test('Primitive Gate: NARROWS ONLY — every single broken predicate stays NULL', () => {
  // Each mutation breaks exactly one predicate; none may yield ELIGIBLE.
  const breakers = [
    current({ validated_object_hash: '' }),
    current({ parent_executed_object_hash: 'x' }),
    current({ parent_continuity_id: 'x' }),
  ]
  for (const c of breakers) {
    assert.equal(classifyExecutionEligibility(priorCarry(), c).eligibility, 'NULL')
  }
  // and a broken prior, independent of current:
  assert.equal(classifyExecutionEligibility(priorCarry({ status: 'REVOKED' }), current()).eligibility, 'NULL')
  assert.equal(classifyExecutionEligibility(priorCarry({ revoked_at: 'x' }), current()).eligibility, 'NULL')
})

test('all declared NULL reasons are reachable through the gate', () => {
  // Trip everything at once; the union must cover the declared reason set.
  const allBroken = classifyExecutionEligibility(
    priorCarry({ executed_object_hash: 'mm', revoked_at: 'x', expires_at: '2000-01-01T00:00:00Z' }),
    { lineage_key: KEY, validated_object_hash: '', executed_object_hash: 'divergent', parent_executed_object_hash: 'no', parent_continuity_id: 'no', nonce: 'used' },
    { now: '2026-06-20T00:00:00Z', consumed_nonces: ['used'] },
  )
  for (const reason of ELIGIBILITY_NULL_REASONS) {
    assert.equal(allBroken.null_reasons.includes(reason), true, `missing reason ${reason}`)
  }
})

// ── Cross-run continuity through the git-committed JSONL registry ─────────────

function freshRegistry() {
  const dir = mkdtempSync(join(tmpdir(), 'exec-lineage-'))
  const registry = join(dir, 'execution_lineage_registry.jsonl')
  writeFileSync(registry, JSON.stringify({ _record_type: 'registry_init', registry_version: '1.0' }) + '\n')
  return registry
}

test('admitRun across runs: run N is eligible only by inheriting run N-1 persisted carry', () => {
  const registry = freshRegistry()

  // Run 1 — genesis root.
  const r1 = admitRun(registry, {
    lineage_key: KEY,
    continuity_id: 'c0',
    parent_continuity_id: '',
    parent_executed_object_hash: GENESIS_EXECUTION_STATE.executed_object_hash,
    validated_object_hash: 'obj0',
    executed_object_hash: 'obj0',
    nonce: 'n0',
  }, { now: '2026-06-20T00:00:00Z', proof_id: 'R1' })
  assert.equal(r1.eligibility, 'ELIGIBLE')
  assert.equal(r1.appended, true)

  // Run 2 — a SEPARATE invocation reading prior state purely from disk.
  const prior = headCarry(registry, KEY)
  assert.equal(prior.executed_object_hash, 'obj0') // inherited across runs
  const r2 = admitRun(registry, {
    lineage_key: KEY,
    continuity_id: 'c1',
    parent_continuity_id: 'c0', // inherits the head continuity
    parent_executed_object_hash: 'obj0', // inherits the head executed object
    validated_object_hash: 'obj1',
    executed_object_hash: 'obj1',
    nonce: 'n1',
  }, { now: '2026-06-20T00:01:00Z', proof_id: 'R2' })
  assert.equal(r2.eligibility, 'ELIGIBLE')
  assert.equal(r2.appended, true)

  assert.equal(readEntries(registry, KEY).length, 2)
  assert.equal(verifyRegistryChain(registry, KEY).result, 'VALID')
})

test('admitRun fail-closed: a run that ignores the head is refused and NOT appended', () => {
  const registry = freshRegistry()
  admitRun(registry, {
    lineage_key: KEY,
    continuity_id: 'c0',
    parent_continuity_id: '',
    parent_executed_object_hash: GENESIS_EXECUTION_STATE.executed_object_hash,
    validated_object_hash: 'obj0',
    executed_object_hash: 'obj0',
    nonce: 'n0',
  }, { now: '2026-06-20T00:00:00Z', proof_id: 'R1' })

  const bad = admitRun(registry, {
    lineage_key: KEY,
    continuity_id: 'c1',
    parent_continuity_id: 'c0',
    parent_executed_object_hash: 'WRONG', // does not inherit obj0
    validated_object_hash: 'obj1',
    executed_object_hash: 'obj1',
    nonce: 'n1',
  }, { now: '2026-06-20T00:01:00Z' })

  assert.equal(bad.eligibility, 'NULL')
  assert.equal(bad.appended, false)
  assert.equal(bad.null_reasons.includes('UNINHERITED_EXECUTED_STATE'), true)
  assert.equal(readEntries(registry, KEY).length, 1) // nothing appended
})

test('admitRun replay: a consumed nonce can never re-admit', () => {
  const registry = freshRegistry()
  admitRun(registry, {
    lineage_key: KEY, continuity_id: 'c0', parent_continuity_id: '',
    parent_executed_object_hash: GENESIS_EXECUTION_STATE.executed_object_hash,
    validated_object_hash: 'obj0', executed_object_hash: 'obj0', nonce: 'n0',
  }, { now: '2026-06-20T00:00:00Z' })

  // Reusing nonce n0 on the next run is refused.
  const replay = admitRun(registry, {
    lineage_key: KEY, continuity_id: 'c1', parent_continuity_id: 'c0',
    parent_executed_object_hash: 'obj0', validated_object_hash: 'obj1',
    executed_object_hash: 'obj1', nonce: 'n0',
  }, { now: '2026-06-20T00:01:00Z' })
  assert.equal(replay.appended, false)
  assert.equal(replay.null_reasons.includes('REPLAYED_NONCE'), true)
})

test('eligibilityCarry records terminal state and grants nothing on its own', () => {
  const c = eligibilityCarry(current())
  assert.equal(c.executed_object_hash, 'obj2')
  assert.equal('creates_authority' in c, false) // it is data, not authority
})
