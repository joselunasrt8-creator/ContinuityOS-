import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0031_continuous_fate_registry.sql', import.meta.url), 'utf8')

const requiredRoutes = ['/fate/continuous', '/fate/stress', '/fate/drift', '/fate/checkpoint', '/fate/topology']
const requiredObjects = ['ContinuousFATEEnvelope', 'FATEStressScenario', 'ReplayMutationVector', 'SovereigntyEscapeProbe', 'GovernanceDriftReplayObject', 'RuntimeStressCheckpoint']
const requiredRuntimeFields = ['continuous_fate_id', 'stress_window_id', 'deterministic_stress_hash', 'topology_stability_hash', 'drift_survivability_state', 'replay_mutation_vector_hash', 'governance_replay_checkpoint', 'runtime_stress_depth']
const requiredDriftClasses = ['continuous_fate_divergence', 'replay_mutation_survival', 'sovereignty_escape_detected', 'runtime_stress_instability', 'governance_replay_divergence', 'reconciliation_corruption_detected', 'topology_instability_detected', 'deterministic_stress_hash_mismatch', 'continuous_fate_checkpoint_instability', 'recursive_drift_accumulation']
const requiredStressClasses = ['replay_resurrection_attempts', 'hidden_route_emergence', 'governance_mutation_replay', 'recursive_lineage_corruption', 'topology_instability', 'reconciliation_corruption', 'delegated_replay_resurrection', 'authority_fragmentation', 'proof_discontinuity', 'federation_drift_accumulation']

test('continuous FATE canonical objects and runtime fields are represented exactly', () => {
  for (const objectName of requiredObjects) assert.match(source, new RegExp(`type ${objectName} =`), `missing canonical object ${objectName}`)
  for (const field of requiredRuntimeFields) assert.match(source, new RegExp(`${field}:`), `missing runtime field ${field}`)
  assert.match(source, /object_type: "ContinuousFATEEnvelope"/)
  assert.match(source, /drift_survivability_state: "SURVIVED" \| "FAIL_CLOSED" \| "NULL"/)
})

test('continuous FATE routes are GET-only, observability-only, and non-authoritative', () => {
  for (const route of requiredRoutes) assert.match(source, new RegExp(route.replaceAll('/', '\\/')), `missing route ${route}`)
  assert.match(source, /CONTINUOUS_FATE_ROUTES\.includes\(url\.pathname as any\) && request\.method !== "GET"/)
  assert.match(source, /reason: "get_only", \.\.\.continuousFateFlags\(\)/)
  assert.match(source, /authoritative: false/)
  assert.match(source, /mutation_capable: false/)
  assert.match(source, /creates_authority: false/)
  assert.match(source, /execution_started: false/)
  assert.match(source, /replay_consumed: false/)
})

test('drift taxonomy and deterministic stress matrix cover all survivability failures', () => {
  for (const driftClass of requiredDriftClasses) assert.match(source, new RegExp(`"${driftClass}"`), `missing drift class ${driftClass}`)
  for (const stressClass of requiredStressClasses) assert.match(source, new RegExp(`"${stressClass}"`), `missing stress class ${stressClass}`)
  assert.match(source, /deterministic_stress_replay_ordering: true/)
  assert.match(source, /bounded_recursive_stress_depth: CONTINUOUS_FATE_MAX_STRESS_DEPTH/)
  assert.match(source, /fail_closed_instability_classification: true/)
  assert.match(source, /expected_result: "NULL"/)
})

test('continuous FATE registry is append-only with deterministic replay-neutral indexes', () => {
  assert.match(source, /continuous_fate_registry: \[/)
  assert.match(source, /CREATE TABLE IF NOT EXISTS continuous_fate_registry/)
  assert.match(source, /INSERT OR IGNORE INTO continuous_fate_registry/)
  assert.match(source, /idx_continuous_fate_registry_checkpoint_unique/)
  assert.match(source, /idx_continuous_fate_registry_deterministic/)
  assert.match(source, /idx_continuous_fate_registry_replay_checkpoint/)
  assert.match(source, /trg_continuous_fate_registry_no_update/)
  assert.match(source, /trg_continuous_fate_registry_no_delete/)
  assert.match(migration, /CHECK \(evidence_only='true'\)/)
  assert.match(migration, /CHECK \(replay_neutral='true'\)/)
  assert.match(migration, /CHECK \(mutation_capable='false'\)/)
  assert.match(migration, /CHECK \(replay_consumed='false'\)/)
})

test('stress verification stays replay-neutral and preserves sovereignty containment', () => {
  assert.match(source, /exact_object_mutation_verification: true/)
  assert.match(source, /sovereignty_containment_verified: envelope\.sovereignty_escape_probes\.every/)
  assert.match(source, /reconciliation_survivability_verification: true/)
  assert.match(source, /hidden_route_emergence: false/)
  assert.match(source, /replay_consumed: false/)
  const routeBlock = source.slice(source.indexOf('if (CONTINUOUS_FATE_ROUTES.includes(url.pathname as any)'), source.indexOf('if (DELEGATION_OBSERVABILITY_ROUTES.includes(url.pathname as any)'))
  assert.doesNotMatch(routeBlock, /request\.method === "POST"[\s\S]*appendContinuousFATEObservation/)
})
