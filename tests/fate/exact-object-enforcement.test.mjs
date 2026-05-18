import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('runtime persists the same validated_object_hash across validation, execution, and proof', () => {
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS validation_registry[\s\S]*validated_object_hash TEXT NOT NULL/,
    'validation registry must persist validated_object_hash',
  )

  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS execution_registry[\s\S]*validated_object_hash TEXT NOT NULL/,
    'execution registry must persist validated_object_hash',
  )

  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS proof_registry[\s\S]*validated_object_hash TEXT NOT NULL/,
    'proof registry must persist validated_object_hash',
  )
})

test('execution requires decision_id, validated_object_hash, and a VALID validation state', () => {
  assert.match(
    source,
    /if \(!decision_id\) return rejectWithTelemetry\(env, \{ status:\"NULL\", result:\"INVALID\", reason:\"missing_decision_id\" \}[\s\S]*route: \"\/execute\"/,
    'execution must require decision_id before execution lookup',
  )

  assert.match(
    source,
    /if \(!validated_object_hash\) return rejectWithTelemetry\(env, \{ status:\"NULL\", result:\"INVALID\", reason:\"missing_validated_object_hash\" \}[\s\S]*event_type: \"HASH_MISMATCH\"/,
    'execution must require validated_object_hash and classify missing hash as hash drift',
  )

  assert.match(
    source,
    /SELECT \* FROM validation_registry WHERE decision_id=\?1 AND validated_object_hash=\?2 AND invocation_nonce=\?3 AND result='VALID' AND status='VALID'/,
    'execution must look up a VALID validation record by decision_id, validated_object_hash, nonce, result, and status',
  )

  assert.match(
    source,
    /if \(!validation\) return rejectWithTelemetry\(env, \{ status:\"NULL\", result:\"INVALID\", reason:\"no_valid_validation\" \}/,
    'missing validation hash match must return NULL / INVALID with no_valid_validation',
  )

  assert.match(
    source,
    /event_type: \"HASH_MISMATCH\"[\s\S]*indicator: \"validation_hash_missing_or_mismatched\"/,
    'hash mismatch must emit HASH_MISMATCH telemetry',
  )
})

test('validation rejects mutated or non-canonical compiled AEO lineage', () => {
  assert.match(
    source,
    /SELECT \* FROM aeo_registry WHERE decision_id=\?1 AND validated_object_hash=\?2 AND status='COMPILED'/,
    'validation must bind to a compiled AEO by decision_id and validated_object_hash',
  )

  assert.match(
    source,
    /const compiledHash = compiledCanonicalAeo \? await sha256Hex\(canonicalize\(compiledCanonicalAeo\)\) : \"\"/,
    'validation must recompute the hash from the canonicalized compiled AEO',
  )

  assert.match(
    source,
    /!compiledCanonicalAeo \|\| compiledHash !== validated_object_hash \|\| compiledHash !== String\(compiled\.validated_object_hash \|\| \"\"\)[\s\S]*reason:\"hash_mismatch\"/,
    'validation must reject mutated AEO hash lineage with hash_mismatch',
  )

  assert.match(
    source,
    /String\(compiled\.continuity_id \|\| \"\"\) !== String\(authority\.continuity_id \|\| \"\"\)[\s\S]*indicator: \"non_canonical_validation_lineage\"/,
    'validation must reject non-canonical continuity lineage',
  )
})

test('execution and proof preserve exact-object hash continuity', () => {
  assert.match(
    source,
    /INSERT INTO execution_registry[\s\S]*decision_id,validated_object_hash,invocation_nonce[\s\S]*\.bind\(execution_id, authority\.session_id, decision_id, validated_object_hash, invocation_nonce/,
    'execution must persist the same validated_object_hash used for validation',
  )

  assert.match(
    source,
    /SELECT \* FROM execution_registry WHERE execution_id=\?1 AND decision_id=\?2 AND validated_object_hash=\?3 AND status='EXECUTED'/,
    'proof must load execution by execution_id, decision_id, validated_object_hash, and executed state',
  )

  assert.match(
    source,
    /INSERT INTO proof_registry[\s\S]*validated_object_hash[\s\S]*EXISTS \(SELECT 1 FROM execution_registry WHERE execution_id=\?3 AND decision_id=\?4 AND validated_object_hash=\?5/,
    'proof must persist only when the execution row has the same validated_object_hash',
  )
})

test('mutation after validation is rejected as NULL with canonical hash_mismatch semantics', () => {
  assert.match(
    source,
    /reason:\"hash_mismatch\"/,
    'mutated object hash must be rejected with hash_mismatch',
  )

  assert.doesNotMatch(
    source,
    /reason:\"wrong_hash\"|reason: \"wrong_hash\"/,
    'runtime must not drift to non-canonical wrong_hash semantics',
  )

  assert.match(
    source,
    /drift_class: \"hash_drift\"/,
    'mutated object hash must be classified as hash_drift',
  )
})


test('validate_rejects_uncompiled_hash', () => {
  assert.match(
    source,
    /if \(!compiled\) {[\s\S]*return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"hash_mismatch" \}/,
    'validate must fail-closed with hash_mismatch when decision_id + validated_object_hash has no compiled AEO row',
  )
})

test('validate_rejects_cross_context_hash', () => {
  assert.match(
    source,
    /SELECT decision_id,authority_id,continuity_id FROM aeo_registry WHERE validated_object_hash=\?1 AND status='COMPILED'/,
    'validate must detect compiled hash reused under another decision lineage',
  )

  assert.match(
    source,
    /if \(compiledForOtherLineage\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"lineage_mismatch" \}/,
    'cross-context compiled hashes must return NULL lineage_mismatch',
  )
})

test('validate_preserves_compiled_hash_path', () => {
  assert.match(
    source,
    /if \(!compiledCanonicalAeo \|\| compiledHash !== validated_object_hash \|\| compiledHash !== String\(compiled\.validated_object_hash \|\| ""\)\) return rejectWithTelemetry/,
    'validate must only pass when caller hash equals canonical compiled AEO hash',
  )

  assert.match(
    source,
    /return json\(\{ status:"VALID", result:"VALID", session_id, validated_object_hash, invocation_nonce \}\)/,
    'canonical compile→validate path must still return VALID',
  )
})

test('validation rejection does not write validation_registry', () => {
  const noCompiledStart = source.indexOf('if (!compiled) {')
  const validationInsert = source.indexOf('INSERT INTO validation_registry')
  assert.ok(noCompiledStart >= 0 && validationInsert > noCompiledStart, 'expected validate fail-closed and validation insert in source')

  const noCompiledBlock = source.slice(noCompiledStart, validationInsert)
  assert.match(noCompiledBlock, /return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"(?:lineage_mismatch|hash_mismatch)" \}/)
  assert.doesNotMatch(noCompiledBlock, /INSERT INTO validation_registry/, 'fail-closed validation rejection path must not write validation_registry')
})

test('validation rejection does not consume invocation_registry', () => {
  const invocationInsert = source.indexOf('INSERT OR IGNORE INTO invocation_registry')
  const noCompiledStart = source.indexOf('if (!compiled) {')
  assert.ok(noCompiledStart >= 0 && invocationInsert > noCompiledStart, 'expected validate fail-closed branch before nonce reservation')

  const noCompiledBlock = source.slice(noCompiledStart, invocationInsert)
  assert.match(noCompiledBlock, /return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"(?:lineage_mismatch|hash_mismatch)" \}/)
  assert.doesNotMatch(noCompiledBlock, /invocation_registry/, 'fail-closed validation rejection path must not consume invocation nonce')
})

test('execute_rejects_uncompiled_hash', () => {
  assert.match(
    source,
    /const compiled = await env\.DB\.prepare\(`SELECT canonical_aeo,validated_object_hash,continuity_id,status FROM aeo_registry WHERE decision_id=\?1 AND validated_object_hash=\?2 AND status='COMPILED'`\)\.bind\(decision_id,validated_object_hash\)\.first<any>\(\)/,
    'execute must re-bind decision_id + validated_object_hash to a COMPILED AEO row before execution',
  )

  assert.match(
    source,
    /if \(!compiled \|\| !executionCanonicalAeo \|\| execHash !== validated_object_hash \|\| execHash !== String\(compiled\.validated_object_hash \|\| ""\)\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"hash_not_compiled" \}/,
    'execute must fail closed with hash_not_compiled when hash is not a canonical compiled object',
  )
})

test('execute_rejects_unvalidated_hash', () => {
  assert.match(
    source,
    /SELECT \* FROM validation_registry WHERE decision_id=\?1 AND validated_object_hash=\?2 AND invocation_nonce=\?3 AND result='VALID' AND status='VALID'/,
    'execute must require a VALID validation_registry row for decision_id + validated_object_hash + invocation_nonce',
  )

  assert.match(
    source,
    /if \(!validation\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"no_valid_validation" \}/,
    'execute must reject unvalidated hashes with no_valid_validation',
  )
})

test('execute_rejects_cross_context_hash', () => {
  assert.match(
    source,
    /if \(String\(validation\.continuity_id \|\| ""\) !== String\(authority\.continuity_id \|\| ""\)\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"lineage_mismatch" \}/,
    'execute must reject validation rows that do not match authority continuity lineage',
  )

  assert.match(
    source,
    /if \(String\(compiled\.continuity_id \|\| ""\) !== String\(authority\.continuity_id \|\| ""\)\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"lineage_mismatch" \}/,
    'execute must reject compiled rows that do not match authority continuity lineage',
  )
})

test('execute_preserves_validated_compiled_hash_path', () => {
  assert.match(
    source,
    /INSERT INTO execution_registry[\s\S]*decision_id,validated_object_hash,invocation_nonce[\s\S]*\.bind\(execution_id, authority\.session_id, decision_id, validated_object_hash, invocation_nonce/,
    'execute must persist the same validated_object_hash that passed compiled + validation binding checks',
  )

  assert.match(
    source,
    /return json\(\{ status:"EXECUTED", session_id, execution_id \}\)/,
    'execute canonical path must still return EXECUTED without alternate response authority fields',
  )
})

test('execution rejection does not write execution_registry', () => {
  const executeStart = source.indexOf('if (url.pathname === "/execute" && request.method === "POST") {')
  const executionInsert = source.indexOf('INSERT INTO execution_registry', executeStart)
  const unvalidatedStart = source.indexOf('if (!validation) return rejectWithTelemetry', executeStart)
  assert.ok(executeStart >= 0 && unvalidatedStart > executeStart && executionInsert > unvalidatedStart, 'expected execute fail-closed branch before execution insert')

  const failClosedBlock = source.slice(unvalidatedStart, executionInsert)
  assert.match(failClosedBlock, /reason:"(?:no_valid_validation|hash_not_compiled|lineage_mismatch)"/)
  assert.doesNotMatch(failClosedBlock, /INSERT INTO execution_registry/, 'execute fail-closed rejection path must not write execution_registry')
})

test('execution rejection does not consume invocation_registry', () => {
  const executeStart = source.indexOf('if (url.pathname === "/execute" && request.method === "POST") {')
  const invocationConsume = source.indexOf("UPDATE invocation_registry SET status='EXECUTED'", executeStart)
  const uncompiledStart = source.indexOf('if (!compiled || !executionCanonicalAeo', executeStart)
  assert.ok(executeStart >= 0 && uncompiledStart > executeStart && invocationConsume > uncompiledStart, 'expected execute fail-closed compiled guard before nonce consumption')

  const failClosedBlock = source.slice(uncompiledStart, invocationConsume)
  assert.match(failClosedBlock, /reason:"(?:hash_not_compiled|lineage_mismatch)"/)
  assert.doesNotMatch(failClosedBlock, /UPDATE invocation_registry SET status='EXECUTED'/, 'execute fail-closed rejection path must not consume invocation nonce')
})

test('execution rejection does not create proof_registry entry', () => {
  const executeStart = source.indexOf('if (url.pathname === "/execute" && request.method === "POST") {')
  const proofRouteStart = source.indexOf('if (url.pathname === "/proof" && request.method === "POST") {')
  const executeBlock = source.slice(executeStart, proofRouteStart)

  assert.doesNotMatch(executeBlock, /INSERT INTO proof_registry/, 'execute rejection paths must not create proof_registry entries')
  assert.doesNotMatch(executeBlock, /UPDATE authority_registry SET status='CONSUMED'/, 'execute rejection paths must not mutate authority to proof-consumed state')
})
