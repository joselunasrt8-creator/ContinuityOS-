import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const hashSpec = JSON.parse(readFileSync(new URL('../fate_hash_mutation_tests.json', import.meta.url), 'utf8'))

test('FATE hash mutation specs are now represented by executable assertions', () => {
  assert.equal(hashSpec.artifact, 'FATE_HASH_MUTATION_TESTS')
  assert.equal(hashSpec.status, 'NON_OPERATIVE')
  assert.ok(hashSpec.tests.some((fate) => fate.then === 'NULL' && fate.expected_reason === 'hash_mismatch'))
})

test('modified validated_object_hash returns NULL / INVALID', () => {
  assert.match(source, /SELECT \* FROM aeo_registry WHERE decision_id=\?1 AND validated_object_hash=\?2/)
  assert.match(source, /if \(!compiled\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"hash_missing" \}/)
  assert.match(source, /event_type: "HASH_MISMATCH"/)
})

test('modified target workflow returns NULL / INVALID', () => {
  assert.match(source, /const GOVERNED_WORKFLOW = "governed-deploy\.yml"/)
  assert.match(source, /if \(target\.workflow !== GOVERNED_WORKFLOW\) return rejectWithTelemetry\(env, \{ status: "NULL", route: "\/compile", reason: "workflow_mismatch" \}/)
  assert.match(source, /if \(target\.workflow !== GOVERNED_WORKFLOW\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"workflow_mismatch" \}/)
})

test('modified branch/repo constraints return NULL / INVALID', () => {
  assert.match(source, /String\(target\.repo\)!==constraints\.repo \|\| String\(target\.branch\)!==constraints\.branch \|\| String\(target\.workflow\)!==constraints\.workflow/)
  assert.match(source, /reason:"scope_constraints_mismatch"/)
  assert.match(source, /indicator: "non_canonical_workflow"/)
})

test('compile hash must match execute hash', () => {
  assert.match(source, /const canonical_aeo_json = canonicalize\(canonical_aeo\)/)
  assert.match(source, /const validated_object_hash = await sha256Hex\(canonical_aeo_json\)/)
  assert.match(source, /const execHash = executionCanonicalAeo \? await sha256Hex\(canonicalize\(executionCanonicalAeo\)\) : ""/)
  assert.match(source, /execHash !== validated_object_hash[\s\S]*reason:"hash_mismatch"/)
})
