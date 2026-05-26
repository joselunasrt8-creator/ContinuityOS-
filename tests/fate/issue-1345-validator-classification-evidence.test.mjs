import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const indexSource = readFileSync('src/index.ts', 'utf8')
const validateSection = indexSource.slice(indexSource.indexOf('pathname === "/validate"'))

// ── Import discipline ────────────────────────────────────────────────────────

test('index.ts imports classifyFromPredicates from finality-classification module', () => {
  assert.match(indexSource, /import.*classifyFromPredicates.*from.*finality-classification\.js/)
})

// ── Classification evidence in success response ───────────────────────────

test('/validate success response includes classification_evidence field', () => {
  assert.match(validateSection, /classification_evidence:/)
})

test('/validate classification_evidence includes classification field', () => {
  assert.match(validateSection, /classification: _classification/)
})

test('/validate classification_evidence includes predicate_snapshot field', () => {
  assert.match(validateSection, /predicate_snapshot: _predicate_snapshot/)
})

test('/validate classification_evidence includes topology_present field', () => {
  assert.match(validateSection, /topology_present: _topology_present/)
})

// ── Fail-closed topology discipline ─────────────────────────────────────────

test('/validate topology_present defaults to false (fail-closed pending topology infrastructure)', () => {
  assert.match(validateSection, /const _topology_present = false/)
})

test('/validate calls classifyFromPredicates with topology_present variable', () => {
  assert.match(validateSection, /classifyFromPredicates\(_predicate_snapshot, _topology_present\)/)
})

// ── Predicate snapshot discipline ───────────────────────────────────────────

test('/validate predicate_snapshot sets base predicates true on valid path', () => {
  assert.match(validateSection, /V: true, A: true, U: true, P: true, R: true/)
})

test('/validate predicate_snapshot sets distributed predicates false (not yet available)', () => {
  assert.match(validateSection, /Q: false, G: false, L: false, X: false/)
})

// ── VALID gate preservation ──────────────────────────────────────────────────

test('/validate VALID gate is preserved: status:"VALID" result:"VALID" are first fields', () => {
  assert.match(validateSection, /status:"VALID", result:"VALID", session_id, validated_object_hash, invocation_nonce, classification_evidence:/)
})

test('/validate classification_evidence is additive — status:"VALID" precedes it in source pattern', () => {
  // Full pattern verified: status/result/session fields come before classification_evidence
  assert.match(validateSection, /status:"VALID", result:"VALID", session_id, validated_object_hash, invocation_nonce, classification_evidence:/)
})

// ── PARTITION_SUSPENDED when topology absent ─────────────────────────────────

test('classifyFromPredicates returns PARTITION_SUSPENDED when topology_present=false', async () => {
  const { classifyFromPredicates } = await import('../../src/lib/finality-classification.js')
  const allBaseTrue = { V: true, A: true, U: true, P: true, R: true, T: false, C: true, Q: false, G: false, L: false, X: false }
  assert.equal(classifyFromPredicates(allBaseTrue, false), 'PARTITION_SUSPENDED')
})

test('PARTITION_SUSPENDED classification does not block VALID gate (additive evidence only)', () => {
  // The /validate route returns status:"VALID" at the same time as classification_evidence.classification="PARTITION_SUSPENDED"
  // These are independent: gate = VALID/NULL; classification = distributed finality evidence
  assert.match(validateSection, /status:"VALID".*classification_evidence/)
})
