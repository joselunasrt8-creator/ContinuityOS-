import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const registry = JSON.parse(readFileSync(new URL('../runtime/adoption/external_surface_registry.json', import.meta.url), 'utf8'))
const spine = JSON.parse(readFileSync(new URL('../evidence/dependency-formation/DEPENDENCY_FORMATION_SPINE_2013.json', import.meta.url), 'utf8'))

const surface = registry.surfaces.find(
  (s) => s.surface_id === 'continuityos_sandbox_merge_guard_required_check',
)

test('issue-2013: dependency formation spine is evidence-only and non-authoritative', () => {
  assert.equal(spine.object_type, 'DependencyFormationSpine')
  assert.equal(spine.issue_id, 2013)
  assert.equal(spine.mode, 'evidence_only')
  assert.equal(spine.creates_authority, false)
  assert.equal(spine.mutates_runtime_state, false)
  assert.equal(spine.visibility_implies_legitimacy, false)
})

test('issue-2013: external consumer is registered as a load-bearing dependency surface', () => {
  assert.ok(surface, 'expected continuityos-sandbox Merge Guard surface in adoption registry')
  assert.equal(surface.external_dependency, true)
  assert.equal(surface.consumer_repo, 'joselunasrt8-creator/continuityos-sandbox')
  assert.equal(surface.provider_action_ref, 'v0.1.0')
  assert.notEqual(surface.provider_action_ref, 'main')
  assert.equal(surface.required_status_check, 'merge-guard')
  assert.equal(surface.dependency_state, 'LOAD_BEARING_ACTIVE')
  assert.equal(surface.closure_status, 'CLOSED')
})

test('issue-2013: dependency proof requires both VALID and NULL paths plus proof artifact', () => {
  assert.equal(spine.evidence_requirements.valid_path_observed, true)
  assert.equal(spine.evidence_requirements.null_path_observed, true)
  assert.equal(spine.evidence_requirements.proof_artifact_observed, true)
  assert.deepEqual(spine.provider_surface.result_domain, ['VALID', 'NULL'])
  assert.equal(spine.provider_surface.proof_artifact, 'MERGE_GUARD_PROOF.json')
})

test('issue-2013: registry surface reconciles to the dependency spine evidence object', () => {
  assert.equal(surface.source_path, 'evidence/dependency-formation/DEPENDENCY_FORMATION_SPINE_2013.json')
  assert.equal(spine.reconciliation.registry_surface_id, surface.surface_id)
  assert.deepEqual(surface.canonical_chain_stages, ['/validate', '/proof'])
  assert.ok(surface.evidence_paths.includes('EXTERNAL_DEPENDENCY_PROOF.md'))
})

test('issue-2013: dependency spine preserves exact-object, fail-closed, replay-safe invariants', () => {
  assert.match(spine.preserved_invariants.validated_object_equals_executed_object, /same canonical PR identity object/)
  assert.match(spine.preserved_invariants.fail_closed, /return NULL/)
  assert.match(spine.preserved_invariants.replay_safe, /deterministic for the same input/)
})
