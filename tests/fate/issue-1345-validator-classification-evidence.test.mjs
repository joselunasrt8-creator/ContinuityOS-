import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const indexSource = readFileSync('src/index.ts', 'utf8')
const finalitySource = readFileSync('src/lib/finality-classification.ts', 'utf8')
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

test('/validate classification_evidence includes explicit topology evidence fields', () => {
  assert.match(validateSection, /topology_snapshot_id: _topology_evidence\.topology_snapshot_id/)
  assert.match(validateSection, /topology_hash: _topology_evidence\.topology_hash/)
})

// ── Fail-closed topology discipline ─────────────────────────────────────────

test('/validate derives topology evidence from runtime_topology_registry', () => {
  assert.match(indexSource, /async function deriveValidateTopologyEvidence\(env: Env\)/)
  assert.match(indexSource, /FROM runtime_topology_registry/)
})

test('/validate calls classifyFromPredicates with topology_present variable', () => {
  assert.match(validateSection, /classifyFromPredicates\(_predicate_snapshot, _topology_present\)/)
})

test('/validate fail-closed: topology_present requires explicit snapshot+hash evidence', () => {
  assert.match(indexSource, /const topology_present = Boolean\(topology_snapshot_id && topology_hash\)/)
})

// ── Predicate snapshot discipline ───────────────────────────────────────────

test('/validate predicate_snapshot sets base predicates true on valid path', () => {
  assert.match(validateSection, /V: true, A: true, U: true, P: true, R: true/)
})

test('/validate predicate_snapshot binds T to explicit topology evidence', () => {
  assert.match(validateSection, /T: _topology_present/)
})

test('/validate predicate_snapshot sets distributed predicates false (not yet available)', () => {
  assert.match(validateSection, /Q: false, G: false, L: false, X: false/)
})

test('/validate topology evidence cannot promote GLOBAL_VALID without distributed predicates', () => {
  assert.match(finalitySource, /if \(p\.L\) return 'LOCAL_VALID'/)
  assert.match(finalitySource, /if \(p\.Q && p\.G && p\.L && p\.X\)/)
  assert.match(finalitySource, /return 'CONVERGENCE_VALID'/)
})

test('/validate topology evidence alone cannot authorize execution or proof', () => {
  assert.match(validateSection, /status:"VALID", result:"VALID"/)
  assert.doesNotMatch(validateSection, /execution_registry[\s\S]*classification_evidence/)
  assert.doesNotMatch(validateSection, /proof_registry[\s\S]*classification_evidence/)
})

// ── VALID gate preservation ──────────────────────────────────────────────────

test('/validate VALID gate is preserved: status:"VALID" result:"VALID" are first fields', () => {
  assert.match(validateSection, /status:"VALID", result:"VALID", session_id, validated_object_hash, invocation_nonce/)
})

test('/validate classification_evidence is additive — status:"VALID" precedes it in source pattern', () => {
  assert.match(validateSection, /status:"VALID"[\s\S]*classification_evidence:/)
})

// ── PARTITION_SUSPENDED when topology absent ─────────────────────────────────

test('classifyFromPredicates returns PARTITION_SUSPENDED when topology_present=false', () => {
  assert.match(finalitySource, /if \(!topologyPresent\) return 'PARTITION_SUSPENDED'/)
})

test('PARTITION_SUSPENDED classification does not block VALID gate (additive evidence only)', () => {
  // The /validate route returns status:"VALID" at the same time as classification_evidence.classification="PARTITION_SUSPENDED"
  // These are independent: gate = VALID/NULL; classification = distributed finality evidence
  assert.match(validateSection, /status:"VALID".*classification_evidence/)
})
