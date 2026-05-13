import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), 'utf8'))
}

const vectors = readJson('conformance/vectors/deterministic-legitimacy-vectors.json')
const suites = [
  readJson('conformance/suites/portability-verification.json'),
  readJson('conformance/suites/replay-neutrality-certification.json'),
  readJson('conformance/suites/exact-object-interoperability-verification.json'),
  readJson('conformance/suites/federation-boundary-verification.json'),
  readJson('conformance/suites/append-only-registry-conformance.json')
]
const runner = readFileSync(join(process.cwd(), 'conformance/runner.mjs'), 'utf8')
const readme = readFileSync(join(process.cwd(), 'conformance/README.md'), 'utf8')
const packageJson = readJson('package.json')

test('conformance architecture exists as observability-only infrastructure', () => {
  assert.match(readme, /observability-only conformance infrastructure/)
  assert.match(readme, /never calls the Worker runtime/)
  assert.match(readme, /never opens a network socket/)
  assert.match(readme, /never writes D1/)
  assert.equal(vectors.invariants.observability_only, true)
  assert.equal(vectors.invariants.runtime_mutation_capable, false)
  assert.equal(vectors.invariants.remote_evidence_local_authority, false)
  assert.equal(packageJson.scripts.conformance, 'node conformance/runner.mjs')
})

test('deterministic legitimacy vectors preserve fail-closed, replay-neutral, exact-object semantics', () => {
  const byId = new Map(vectors.vectors.map((vector) => [vector.vector_id, vector]))
  for (const id of ['legitimacy_exact_object_valid', 'legitimacy_remote_authority_claim', 'legitimacy_replay_collision', 'legitimacy_exact_object_mismatch']) {
    assert.ok(byId.has(id), `missing vector ${id}`)
    assert.match(byId.get(id).expected_sha256, /^[a-f0-9]{64}$/)
    assert.ok(byId.get(id).canonical_form.startsWith('{'))
  }
  assert.equal(byId.get('legitimacy_exact_object_valid').expected_result, 'EVIDENCE_OBSERVED')
  assert.equal(byId.get('legitimacy_remote_authority_claim').expected_result, 'NULL')
  assert.equal(byId.get('legitimacy_replay_collision').expected_result, 'NULL')
  assert.equal(byId.get('legitimacy_exact_object_mismatch').expected_result, 'NULL')
})

test('portability, replay, exact-object, federation, and append-only suites are non-authoritative', () => {
  assert.deepEqual(suites.map((suite) => suite.suite_id), [
    'portability_verification_v1',
    'replay_neutrality_certification_v1',
    'exact_object_interoperability_verification_v1',
    'federation_boundary_verification_v1',
    'append_only_registry_conformance_v1'
  ])
  for (const suite of suites) {
    assert.equal(suite.observability_only, true)
    assert.equal(suite.runtime_mutation_capable, false)
    assert.doesNotMatch(JSON.stringify(suite), /local_authority.*true|accepted_authority.*true/i)
  }
})

test('runner is read-only and incapable of runtime mutation', () => {
  assert.match(runner, /CONFORMANCE_EVIDENCE_OBSERVED/)
  assert.match(runner, /NULL/)
  assert.doesNotMatch(runner, /fetch\(|wrangler|env\.DB|\.prepare\(|\.batch\(|\.run\(/i)
  assert.doesNotMatch(runner, /writeFile|appendFile|mkdir|rm\(|unlink|rename/i)
})

test('conformance runner verifies all deterministic suites', () => {
  const output = execFileSync(process.execPath, ['conformance/runner.mjs'], { cwd: process.cwd(), encoding: 'utf8' })
  assert.match(output, /CONFORMANCE_EVIDENCE_OBSERVED/)
})
