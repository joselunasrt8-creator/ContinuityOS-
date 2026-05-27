import assert from 'node:assert/strict'
import { canonicalize, sha256Hex } from '../src/canonical.js'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const NULL_STATUS = 'NULL'
const INVALID_RESULT = 'INVALID'

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'))
}

function getPath(source, path) {
  return path.split('.').reduce((value, segment) => (value == null ? undefined : value[segment]), source)
}

function failClosed(reason) {
  const error = new Error(`${NULL_STATUS}: ${reason}`)
  error.conformance_status = NULL_STATUS
  error.result = INVALID_RESULT
  error.reason = reason
  throw error
}

function verifyVectorHashes(bundle) {
  assert.equal(bundle.invariants.fail_closed, true)
  assert.equal(bundle.invariants.non_authoritative, true)
  assert.equal(bundle.invariants.replay_neutral, true)
  assert.equal(bundle.invariants.append_only, true)
  assert.equal(bundle.invariants.exact_object_preserving, true)
  assert.equal(bundle.invariants.observability_only, true)
  assert.equal(bundle.invariants.runtime_mutation_capable, false)
  assert.equal(bundle.invariants.remote_evidence_local_authority, false)

  for (const vector of bundle.vectors) {
    const canonical = canonicalize(vector.object)
    if (canonical !== vector.canonical_form) failClosed(`canonical drift for ${vector.vector_id}`)
    if (sha256Hex(canonical) !== vector.expected_sha256) failClosed(`hash drift for ${vector.vector_id}`)
    if (vector.object.mutation_capable === true) assert.equal(vector.expected_result, NULL_STATUS)
    if (vector.object.remote_execution_legitimacy === true) assert.equal(vector.expected_result, NULL_STATUS)
    if (vector.object.remote_authority_inherited === true) assert.equal(vector.expected_result, NULL_STATUS)
    if (Array.isArray(vector.object.replay_indicators) && vector.object.replay_indicators.length > 0) assert.equal(vector.expected_result, NULL_STATUS)
    if (vector.object.validated_object_hash !== vector.object.executed_object_hash) assert.equal(vector.expected_result, NULL_STATUS)
  }
}

function verifySuites(bundle, suites) {
  const vectorById = new Map(bundle.vectors.map((vector) => [vector.vector_id, vector]))
  for (const suite of suites) {
    assert.equal(suite.observability_only, true, `${suite.suite_id} must be observability-only`)
    assert.equal(suite.runtime_mutation_capable, false, `${suite.suite_id} must be incapable of runtime mutation`)
    for (const check of suite.checks || []) {
      for (const vectorId of check.vector_ids || []) {
        const vector = vectorById.get(vectorId)
        if (!vector) failClosed(`missing vector ${vectorId}`)
        if (check.expected_result) assert.equal(vector.expected_result, check.expected_result)
        if (check.kind === 'hash_equality') assert.equal(getPath(vector, check.left), getPath(vector, check.right))
        if (check.kind === 'hash_inequality_fails_closed') assert.notEqual(getPath(vector, check.left), getPath(vector, check.right))
      }
    }
  }
}

function verifyAppendOnlyMigration(suite) {
  const migration = readFileSync(join(root, 'migrations/0018_distributed_legitimacy_interoperability.sql'), 'utf8')
  for (const registry of suite.registries) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${registry.name}`))
    for (const column of registry.required_columns) assert.match(migration, new RegExp(`\\b${column}\\b`))
    for (const trigger of registry.required_triggers) assert.match(migration, new RegExp(trigger))
  }
  assert.match(migration, /BEFORE UPDATE ON distributed_legitimacy_registry/)
  assert.match(migration, /BEFORE DELETE ON distributed_legitimacy_registry/)
  assert.match(migration, /BEFORE UPDATE ON federated_checkpoint_registry/)
  assert.match(migration, /BEFORE DELETE ON federated_checkpoint_registry/)
}

const STAGE2_CHECK_IDS = [
const CONF_DIST_CHECK_IDS = [
  'CONF-DIST-01', 'CONF-DIST-02', 'CONF-DIST-03', 'CONF-DIST-04', 'CONF-DIST-05',
  'CONF-DIST-06', 'CONF-DIST-07', 'CONF-DIST-08', 'CONF-DIST-09', 'CONF-DIST-10',
  'CONF-DIST-11', 'CONF-DIST-12', 'CONF-DIST-13', 'CONF-DIST-14', 'CONF-DIST-15',
]

function verifyStage2Suite(suite) {
  assert.equal(suite.non_operative, true, `${suite.suite_id} must be non_operative`)
  assert.equal(suite.observability_only, true, `${suite.suite_id} must be observability_only`)
  assert.equal(suite.runtime_mutation_capable, false, `${suite.suite_id} must be incapable of runtime mutation`)
  assert.equal(suite.stage, 2, `${suite.suite_id} must be stage 2`)
  assert.equal(suite.raw_production_apply_path, 'DENIED', `${suite.suite_id} raw_production_apply_path must be DENIED`)

  const presentIds = new Set(suite.checks.map((c) => c.check_id))
  for (const id of STAGE2_CHECK_IDS) {
    if (!presentIds.has(id)) failClosed(`stage2 suite missing check ${id}`)
  }
  assert.equal(suite.checks.length, 15, 'stage2 suite must have exactly 15 checks')

  for (const check of suite.checks) {
    if (check.status !== 'IMPLEMENTED') failClosed(`${check.check_id} status must be IMPLEMENTED, got: ${check.status}`)
    if (!check.fixture) failClosed(`${check.check_id} missing fixture path`)
    if (!check.test) failClosed(`${check.check_id} missing test path`)
    if (!check.expected_result) failClosed(`${check.check_id} missing expected_result`)
    if (!check.required_module) failClosed(`${check.check_id} missing required_module`)
    if (!existsSync(join(root, check.fixture))) failClosed(`${check.check_id} fixture not found: ${check.fixture}`)
    if (!existsSync(join(root, check.test))) failClosed(`${check.check_id} test not found: ${check.test}`)
    if (!check.forbidden_results || check.forbidden_results.length === 0) failClosed(`${check.check_id} must declare forbidden_results`)
    if (!check.forbidden_results.includes('GLOBAL_VALID')) failClosed(`${check.check_id} must forbid GLOBAL_VALID`)
// Verifies the Stage 2 distributed legitimacy conformance suite descriptor.
// Read-only: only reads files and asserts structural invariants.
// Does not invoke runtime, does not mutate state, does not consume replay.
function verifyStage2ConformanceSuite(suite) {
  // Suite-level invariants
  assert.equal(suite.non_operative, true, `${suite.suite_id} must be non-operative`)
  assert.equal(suite.runtime_mutation_capable, false, `${suite.suite_id} must not mutate runtime`)
  assert.equal(suite.replay_neutral, true, `${suite.suite_id} must be replay-neutral`)
  assert.equal(suite.raw_production_apply_path, 'DENIED', `${suite.suite_id} raw_production_apply_path must be DENIED`)

  // All 15 CONF-DIST checks must be present
  const presentIds = new Set(suite.checks.map((c) => c.check_id))
  for (const id of CONF_DIST_CHECK_IDS) {
    if (!presentIds.has(id)) failClosed(`stage2 conformance matrix missing required check ${id}`)
  }
  assert.equal(suite.checks.length, CONF_DIST_CHECK_IDS.length, 'stage2 suite must have exactly 15 checks')

  for (const check of suite.checks) {
    // Required fields
    if (!check.check_id) failClosed('stage2 check missing check_id')
    if (!check.label) failClosed(`${check.check_id} missing label`)
    if (!check.description) failClosed(`${check.check_id} missing description`)
    if (!check.expected_result) failClosed(`${check.check_id} missing expected_result`)
    if (!check.required_module) failClosed(`${check.check_id} missing required_module`)

    // All checks must be fully implemented
    if (check.status !== 'IMPLEMENTED') {
      failClosed(`${check.check_id} status is '${check.status}' — must be IMPLEMENTED`)
    }

    // GLOBAL_VALID must never be an expected_result: conformance classifies; it does not create authority
    if (check.expected_result === 'GLOBAL_VALID') {
      failClosed(`${check.check_id} expected_result is GLOBAL_VALID — conformance cannot create distributed authority`)
    }

    // expected_result must not appear in forbidden_results (no self-contradiction)
    if (Array.isArray(check.forbidden_results) && check.forbidden_results.includes(check.expected_result)) {
      failClosed(`${check.check_id} expected_result '${check.expected_result}' is in forbidden_results — contradicted`)
    }

    // Fixture must exist and declare itself non-operative
    if (check.fixture) {
      const fixtureData = JSON.parse(readFileSync(join(root, check.fixture), 'utf8'))
      if (fixtureData._non_operative !== true) {
        failClosed(`${check.check_id} fixture ${check.fixture} missing _non_operative: true`)
      }
    }

    // FATE test file must exist
    if (check.test) {
      readFileSync(join(root, check.test), 'utf8')
    }

    // Required runtime module must exist
    readFileSync(join(root, check.required_module), 'utf8')

    // Required migration must exist when specified
    if (check.required_migration) {
      readFileSync(join(root, check.required_migration), 'utf8')
    }
  }
}

function verifyStage2MatrixSummary(summary, suite) {
  assert.equal(summary.status, 'COMPLETE', 'stage2 matrix summary status must be COMPLETE')
  assert.equal(summary.non_operative, true, 'stage2 matrix summary must be non-operative')
  assert.equal(summary.raw_production_apply_path, 'DENIED', 'stage2 matrix summary raw_production_apply_path must be DENIED')
  assert.equal(summary.invariants.authority_created, false, 'stage2 matrix must not create authority')
  assert.equal(summary.invariants.execution_eligibility_expanded, false, 'stage2 matrix must not expand execution eligibility')
  assert.equal(summary.invariants.replay_restoration_paths_introduced, false, 'stage2 matrix must not introduce replay restoration paths')
  assert.equal(summary.summary.total_checks, 15, 'stage2 matrix summary must cover 15 checks')
  assert.equal(summary.summary.implemented, 15, 'stage2 matrix summary must have 15 implemented checks')
  assert.equal(summary.summary.passing, 15, 'stage2 matrix summary must have 15 passing checks')
  assert.equal(summary.summary.stage1_regressions, 0, 'stage2 matrix summary must have 0 Stage 1 regressions')

  // Cross-check matrix entries against the suite
  const summaryIds = new Set(summary.matrix.map((e) => e.check_id))
  const suiteIds = new Set(suite.checks.map((c) => c.check_id))
  for (const id of CONF_DIST_CHECK_IDS) {
    if (!summaryIds.has(id)) failClosed(`stage2 matrix summary missing entry for ${id}`)
    if (!suiteIds.has(id)) failClosed(`stage2 conformance suite missing check ${id}`)
  }

  // Every matrix entry must report PASS and must not expect GLOBAL_VALID
  for (const entry of summary.matrix) {
    if (entry.status !== 'PASS') failClosed(`stage2 matrix entry ${entry.check_id} status is '${entry.status}' — must be PASS`)
    if (entry.expected === 'GLOBAL_VALID') failClosed(`${entry.check_id} matrix entry expects GLOBAL_VALID — authority creation forbidden`)
  }
}

try {
  const bundle = readJson('conformance/vectors/deterministic-legitimacy-vectors.json')
  const suites = [
    readJson('conformance/suites/portability-verification.json'),
    readJson('conformance/suites/replay-neutrality-certification.json'),
    readJson('conformance/suites/exact-object-interoperability-verification.json'),
    readJson('conformance/suites/federation-boundary-verification.json'),
    readJson('conformance/suites/append-only-registry-conformance.json')
  ]

  verifyVectorHashes(bundle)
  verifySuites(bundle, suites)
  verifyAppendOnlyMigration(suites.at(-1))

  const stage2Suite = readJson('conformance/suites/stage2-distributed-legitimacy-conformance.json')
  verifyStage2Suite(stage2Suite)

  console.log('CONFORMANCE_EVIDENCE_OBSERVED')
  console.log(`STAGE2_CONF_DIST_COVERAGE: ${STAGE2_CHECK_IDS.join(', ')} — all IMPLEMENTED`)
  verifyStage2ConformanceSuite(stage2Suite)

  const stage2MatrixSummary = readJson('conformance/stage2-matrix-summary.json')
  verifyStage2MatrixSummary(stage2MatrixSummary, stage2Suite)

  console.log('CONFORMANCE_EVIDENCE_OBSERVED')
  console.log('STAGE2_CONFORMANCE_MATRIX_COMPLETE')
} catch (error) {
  console.error(error?.conformance_status || NULL_STATUS, error?.message || error)
  process.exitCode = 1
}
