import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canonicalNullResult, isCanonicalNullResult, NULL_STATUS, INVALID_RESULT } from '../../src/result.ts'
import { validateLegitimacySchema } from '../../runtime/legitimacy/validators/schema-validator.js'
import { traverseCrossRegistries } from '../../runtime/reconciliation/cross-registry-reconciliation-engine.js'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

const hashA = 'a'.repeat(64)

// ── Shared primitive ────────────────────────────────────────────────────────

test('null_result_contract_is_consistent: canonicalNullResult returns status/result/reason', () => {
  const r = canonicalNullResult('hash_mismatch')
  assert.equal(r.status, NULL_STATUS)
  assert.equal(r.result, INVALID_RESULT)
  assert.equal(r.reason, 'hash_mismatch')
})

test('null_result_contract_is_consistent: NULL_STATUS and INVALID_RESULT are canonical string literals', () => {
  assert.equal(NULL_STATUS, 'NULL')
  assert.equal(INVALID_RESULT, 'INVALID')
})

test('null_result_contract_is_consistent: isCanonicalNullResult validates contract shape', () => {
  assert.equal(isCanonicalNullResult({ status: 'NULL', result: 'INVALID', reason: 'hash_mismatch' }), true)
  assert.equal(isCanonicalNullResult({ status: 'NULL', result: 'INVALID', reason: 'stale_validation' }), true)
  assert.equal(isCanonicalNullResult({ status: 'NULL' }), false, 'missing result and reason')
  assert.equal(isCanonicalNullResult({ status: 'NULL', result: 'INVALID' }), false, 'missing reason')
  assert.equal(isCanonicalNullResult({ status: 'NULL', reason: 'x' }), false, 'missing result')
  assert.equal(isCanonicalNullResult(null), false)
  assert.equal(isCanonicalNullResult(undefined), false)
  assert.equal(isCanonicalNullResult({}), false)
})

// ── Schema validator null results carry canonical fields ────────────────────

test('null_result_contract_is_consistent: validator malformed input returns canonical status/result/reason', () => {
  const r = validateLegitimacySchema('{"object_type":"Authority",')
  assert.equal(r.status, 'NULL')
  assert.equal(r.result, INVALID_RESULT)
  assert.equal(typeof r.reason, 'string')
  assert.ok(r.reason.length > 0)
})

test('null_result_contract_is_consistent: validator schema violation returns canonical result field', () => {
  const candidate = {
    object_type: 'Authority',
    authority_id: 'auth-1',
    decision_id: 'decision-1',
    owner: 'owner-1',
    identity_id: 'identity-1',
    session_id: 'session-1',
    continuity_id: 'continuity-1',
    intent: 'governed production deploy',
    scope: { environment: 'production' },
    constraints: { canonical_path: ['/authority', '/compile', '/validate', '/execute', '/proof'] },
    expiry: '2026-05-14T00:00:00.000Z',
    status: 'ACTIVE',
  }
  delete candidate.authority_id
  const r = validateLegitimacySchema(candidate)
  assert.equal(r.status, 'NULL')
  assert.equal(r.result, INVALID_RESULT, 'validator null result must include canonical result field')
  assert.equal(typeof r.reason, 'string')
  assert.ok(r.reason.length > 0, 'validator null result must include canonical reason field')
})

test('null_result_contract_is_consistent: validator null result preserves domain-specific errors array', () => {
  const r = validateLegitimacySchema({ object_type: 'Authority', hidden: true })
  assert.equal(r.status, 'NULL')
  assert.equal(r.result, INVALID_RESULT)
  assert.ok(Array.isArray(r.errors) && r.errors.length > 0, 'validator must preserve errors alongside canonical fields')
})

// ── Execute-stage canonical semantics (issue #607) ──────────────────────────

test('all_fail_closed_paths_serialize_identically: !validation uses canonical hash_mismatch', () => {
  assert.match(
    source,
    /if \(!validation\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"hash_mismatch" \}/,
    'missing validation lineage must reject with canonical hash_mismatch not missing_validation',
  )
})

test('stale_lineage_resolves_to_canonical_null', () => {
  assert.match(
    source,
    /reason:"stale_validation"[\s\S]*indicator: "stale_validation_blocked_at_execution"/,
    'stale validation lineage must emit stale_validation reason with canonical NULL/INVALID status',
  )
  assert.match(
    source,
    /status:"NULL", result:"INVALID", reason:"stale_validation"/,
    'stale validation must return canonical NULL result contract',
  )
})

test('mutated_object_rejects_with_hash_mismatch', () => {
  assert.match(
    source,
    /reason:"hash_mismatch"[\s\S]*indicator: "validated_object_execution_mismatch"/,
    'mutated execution object must be rejected with hash_mismatch',
  )
  assert.match(
    source,
    /reason:"hash_mismatch"[\s\S]*indicator: "execution_hash_mismatch"/,
    'execution hash divergence must reject with hash_mismatch',
  )
})

test('proof_persistence_blocked_after_invalid_execution', () => {
  const executeStart = source.indexOf('if (url.pathname === "/execute" && request.method === "POST") {')
  const proofStart = source.indexOf('if (url.pathname === "/proof" && request.method === "POST") {')
  assert.ok(executeStart >= 0 && proofStart > executeStart, 'execute and proof routes must exist in canonical order')
  const executeBlock = source.slice(executeStart, proofStart)
  assert.doesNotMatch(executeBlock, /INSERT INTO proof_registry/, 'execute rejection must not persist proof_registry entries')
  assert.doesNotMatch(executeBlock, /UPDATE authority_registry SET status='CONSUMED'/, 'execute rejection must not consume authority')
})

test('replay_rejection_semantics_are_deterministic', () => {
  assert.match(source, /reason:"replay_detected"/, 'duplicate execution must use canonical replay_detected')
  assert.match(source, /reason:"proof_replay"/, 'proof replay must use canonical proof_replay')
  assert.match(source, /reason:"nonce_not_reserved"/, 'nonce reuse must use canonical nonce_not_reserved')
  assert.doesNotMatch(source, /reason:"replay_attempt"/, 'non-canonical replay_attempt must not exist')
})

// ── Reconciliation preserves drift metadata with canonical NULL ─────────────

test('null_result_preserves_drift_classification: reconciliation legitimacy_status NULL with drift_classes', () => {
  const resultWithDrift = traverseCrossRegistries({
    session_registry: [],
    continuity_registry: [],
    authority_registry: [],
    aeo_registry: [],
    validation_registry: [],
    execution_registry: [
      {
        execution_id: 'exec-orphan-1',
        decision_id: 'decision-1',
        validated_object_hash: hashA,
        invocation_nonce: 'nonce-1',
        session_id: 'session-1',
        continuity_id: 'continuity-1',
        status: 'EXECUTED',
      },
    ],
    proof_registry: [],
    invocation_registry: [],
  })
  assert.equal(resultWithDrift.legitimacy_status, 'NULL', 'orphaned execution must produce NULL legitimacy')
  assert.ok(
    Array.isArray(resultWithDrift.drift_classes) && resultWithDrift.drift_classes.length > 0,
    'reconciliation NULL must preserve drift_class metadata',
  )
  assert.ok(
    Array.isArray(resultWithDrift.drift) && resultWithDrift.drift.length > 0,
    'reconciliation NULL must preserve drift entries',
  )
})

test('null_result_preserves_drift_classification: RECONCILED legitimacy is LEGITIMATE not NULL', () => {
  const clean = traverseCrossRegistries({
    session_registry: [],
    continuity_registry: [],
    authority_registry: [],
    aeo_registry: [],
    validation_registry: [],
    execution_registry: [],
    proof_registry: [],
    invocation_registry: [],
  })
  assert.equal(clean.legitimacy_status, 'LEGITIMATE', 'empty registry must produce LEGITIMATE legitimacy')
  assert.deepEqual(clean.drift_classes, [], 'LEGITIMATE result must have no drift classes')
})

// ── Valid result contract remains compatible ────────────────────────────────

test('valid_result_contract_remains_compatible: validator valid result has no result/reason fields', () => {
  const r = validateLegitimacySchema({
    object_type: 'Authority',
    authority_id: 'auth-1',
    decision_id: 'decision-1',
    owner: 'owner-1',
    identity_id: 'identity-1',
    session_id: 'session-1',
    continuity_id: 'continuity-1',
    intent: 'governed production deploy',
    scope: { environment: 'production' },
    constraints: { canonical_path: ['/authority', '/compile', '/validate', '/execute', '/proof'] },
    expiry: '2026-05-14T00:00:00.000Z',
    status: 'ACTIVE',
  })
  assert.equal(r.status, 'VALID_SCHEMA')
  assert.match(r.object_hash, /^[a-f0-9]{64}$/)
  assert.ok(r.canonicalized_object)
  assert.deepEqual(r.errors, [])
})

test('valid_result_contract_remains_compatible: execute canonical success path remains intact', () => {
  assert.match(source, /return json\(\{ status:"EXECUTED", session_id, execution_id \}\)/, 'execute success path must be unchanged')
  assert.match(source, /return json\(\{ status:"VALID", result:"VALID", session_id, validated_object_hash, invocation_nonce, classification_evidence:/, 'validate success path must include classification_evidence')
})

// ── Telemetry semantic consistency ──────────────────────────────────────────

test('telemetry_semantic_consistency: all execute hash failures emit HASH_MISMATCH event', () => {
  assert.match(
    source,
    /event_type: "HASH_MISMATCH"[\s\S]*indicator: "validation_lineage_missing_or_mismatched"/,
    'missing validation lineage must emit HASH_MISMATCH telemetry',
  )
  assert.match(
    source,
    /event_type: "HASH_MISMATCH"[\s\S]*indicator: "execution_hash_mismatch"/,
    'execution hash divergence must emit HASH_MISMATCH telemetry',
  )
  assert.match(
    source,
    /event_type: "HASH_MISMATCH"[\s\S]*indicator: "validated_object_execution_mismatch"/,
    'mutated execution object must emit HASH_MISMATCH telemetry',
  )
})

test('telemetry_semantic_consistency: replay failures emit REPLAY_BLOCKED event', () => {
  assert.match(source, /event_type: "REPLAY_BLOCKED"[\s\S]*reason:"replay_detected"/, 'duplicate execution must emit REPLAY_BLOCKED')
  assert.match(source, /event_type: "REPLAY_BLOCKED"[\s\S]*reason:"proof_replay"/, 'proof replay must emit REPLAY_BLOCKED')
})
