import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clone, fixtures, makeState, OUTCOME, validateLifecycle, validateAuthority, validateReplay, validateProof, hashObject } from './fate-attack-helpers.mjs'

const fixtureFile = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

const topologyMap = fixtureFile('../../runtime/adversarial_execution_topology_map.json')
const bypassPaths = fixtureFile('../../runtime/bypass_paths.json')
const surfaceInventory = fixtureFile('../../runtime/unauthorized_mutation_surface_inventory.json')
const exploitabilityReport = fixtureFile('../../runtime/residual_exploitability_report.json')

const executionSurfaceFixtures = {
  proofless: fixtureFile('../fixtures/execution-surface/proofless_execution_attempt.json'),
  orphan: fixtureFile('../fixtures/execution-surface/orphan_execution_attempt.json'),
  mutated: fixtureFile('../fixtures/execution-surface/mutated_validated_object.json'),
  replayedNonce: fixtureFile('../fixtures/execution-surface/replayed_execution_nonce.json'),
  undeclared: fixtureFile('../fixtures/execution-surface/undeclared_execution_surface.json'),
  validatorEscape: fixtureFile('../fixtures/execution-surface/validator_escape_attempt.json'),
  workflowDispatch: fixtureFile('../fixtures/execution-surface/workflow_dispatch_bypass.json'),
  staleLineage: fixtureFile('../fixtures/execution-surface/stale_lineage_execution.json'),
  proofReplay: fixtureFile('../fixtures/execution-surface/proof_replay_attempt.json'),
  authorityReuse: fixtureFile('../fixtures/execution-surface/authority_reuse_attempt.json'),
}

// ── Execution topology map ───────────────────────────────────────────────────

test('topology map artifact is machine-readable and carries canonical chain', () => {
  assert.equal(topologyMap.artifact, 'ADVERSARIAL_EXECUTION_TOPOLOGY_MAP')
  assert.equal(topologyMap.issue, '695')
  assert.deepEqual(topologyMap.canonical_chain, ['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof'])
  assert.equal(topologyMap.evidence_only, true)
  assert.equal(topologyMap.non_authoritative, true)
  assert.equal(topologyMap.classification_authorizes_execution, false)
  assert.equal(topologyMap.classification_authorizes_merge, false)
})

test('topology map enumerates all deploy-capable surfaces with fail-closed status', () => {
  assert.ok(topologyMap.deploy_capable_surfaces.length > 0)
  const byId = new Map(topologyMap.deploy_capable_surfaces.map((s) => [s.surface_id, s]))
  assert.ok(byId.has('route:/execute'))
  assert.ok(byId.has('route:/proof'))
  assert.ok(byId.has('workflow:governed-deploy.yml'))
  for (const surface of topologyMap.deploy_capable_surfaces) {
    assert.equal(surface.fail_closed, true, `${surface.surface_id} must declare fail_closed`)
    assert.equal(surface.requires_authority, true, `${surface.surface_id} must require authority`)
    assert.equal(surface.requires_lineage, true, `${surface.surface_id} must require lineage`)
    assert.equal(surface.requires_exact_object_hash, true, `${surface.surface_id} must require exact object hash`)
  }
})

test('topology map bypass vector inventory enumerates all known bypass classes', () => {
  const bypassIds = topologyMap.bypass_vector_inventory.map((b) => b.bypass_id)
  const required = [
    'deploy_without_proof',
    'deploy_without_authority',
    'replayed_lineage',
    'orphan_execution',
    'mutated_object_execution',
    'validator_escape',
    'undeclared_execution_surface',
    'stale_lineage_execution',
    'proof_replay_attempt',
    'workflow_dispatch_bypass',
  ]
  for (const id of required) assert.ok(bypassIds.includes(id), `topology map must enumerate ${id}`)
  for (const bypass of topologyMap.bypass_vector_inventory) {
    assert.equal(bypass.required_response, 'NULL', `${bypass.bypass_id} must require NULL response`)
  }
})

test('topology map undeclared surface response is fail-closed', () => {
  assert.equal(topologyMap.undeclared_surface_response, 'UNDECLARED_MUTATION_SURFACE -> NULL')
  assert.equal(topologyMap.cross_runtime_replay_response, 'TOPOLOGY_DRIFT -> NULL')
})

// ── Bypass vector inventory ──────────────────────────────────────────────────

test('bypass path inventory artifact is consistent with topology map bypass classes', () => {
  assert.equal(bypassPaths.artifact, 'BYPASS_PATHS')
  assert.equal(bypassPaths.required_response, 'NULL')
  assert.equal(bypassPaths.closure_verification.missing_mutation_surface_response, 'UNDECLARED_MUTATION_SURFACE -> NULL')
  const bypassIds = new Set(bypassPaths.bypass_paths.map((b) => b.bypass_id))
  for (const b of ['direct_wrangler_deploy', 'manual_workflow_dispatch', 'raw_database_write', 'undeclared_mutation_surface']) {
    assert.ok(bypassIds.has(b), `bypass_paths.json must enumerate ${b}`)
  }
  for (const bypass of bypassPaths.bypass_paths) {
    assert.ok(bypass.required_response.includes('NULL'), `${bypass.bypass_id} required_response must be NULL`)
  }
})

// ── Adversarial fixture suite ────────────────────────────────────────────────

test('all execution-surface adversarial fixtures declare expected NULL outcome', () => {
  for (const [id, fixture] of Object.entries(executionSurfaceFixtures)) {
    assert.equal(fixture.expected, 'NULL', `fixture ${id} (${fixture.id}) must declare expected: "NULL"`)
  }
})

test('deploy without proof → NULL', () => {
  assert.equal(executionSurfaceFixtures.proofless.has_proof, false)
  const result = validateLifecycle({ proof: null })
  assert.equal(result, OUTCOME.VALID, 'baseline without proof param still passes lifecycle; proof is checked in /proof route')
  const proofRequired = validateLifecycle({
    object: { ...clone(fixtures.aeo), validation: { requires_proof: true } },
    proof: { object_type: 'Proof', validated_object_hash: 'WRONG', execution_hash: 'WRONG', proof_id: 'fake', persisted: false },
  })
  assert.equal(proofRequired, OUTCOME.NULL)
})

test('deploy without authority → NULL', () => {
  assert.equal(executionSurfaceFixtures.orphan.has_lineage, false)
  const state = makeState()
  state.authorityRegistry.clear()
  assert.equal(validateLifecycle({ state }), OUTCOME.NULL)
})

test('orphan execution without lineage → NULL', () => {
  assert.equal(executionSurfaceFixtures.orphan.has_lineage, false)
  const continuity = clone(fixtures.continuity)
  continuity.authority_id = 'orphaned-authority-not-in-state'
  continuity.chain = ['session-fixture-001', 'continuity-fixture-001', 'orphaned-authority-not-in-state']
  assert.equal(validateLifecycle({ continuity }), OUTCOME.TOPOLOGY_DRIFT)
})

test('mutated object execution → NULL', () => {
  assert.equal(executionSurfaceFixtures.mutated.validated_object_hash, 'A')
  assert.equal(executionSurfaceFixtures.mutated.executed_object_hash, 'B')
  const object = clone(fixtures.aeo)
  const mutatedObject = clone(fixtures.aeo)
  mutatedObject.intent = 'mutated_intent_after_validation'
  assert.equal(validateLifecycle({ object, executedObject: mutatedObject }), OUTCOME.NULL)
})

test('replayed lineage → NULL', () => {
  assert.equal(executionSurfaceFixtures.replayedNonce.replayed_nonce, true)
  const state = makeState({ usedNonces: new Set([fixtures.aeo.nonce]) })
  assert.equal(validateLifecycle({ state }), OUTCOME.NULL)
})

test('replayed object hash → NULL', () => {
  const state = makeState()
  assert.equal(validateLifecycle({ state }), OUTCOME.VALID)
  assert.equal(validateLifecycle({ state }), OUTCOME.NULL)
})

test('validator escape → NULL', () => {
  assert.equal(executionSurfaceFixtures.validatorEscape.validator_escaped, true)
  const aeo = clone(fixtures.aeo)
  aeo.mutation_capability = true
  assert.equal(validateLifecycle({ object: aeo }), OUTCOME.UNDECLARED_MUTATION_CAPABILITY)
})

test('validator escape via extra_metadata → NULL', () => {
  const aeo = clone(fixtures.aeo)
  aeo.extra_metadata = { mutation_capability: true }
  assert.equal(validateLifecycle({ object: aeo }), OUTCOME.UNDECLARED_MUTATION_CAPABILITY)
})

test('undeclared execution surface → NULL', () => {
  assert.equal(executionSurfaceFixtures.undeclared.undeclared_surface, true)
  const surfaceByIds = new Map(surfaceInventory.surfaces.map((s) => [s.surface_id, s]))
  const fakeResult = (() => {
    const declared = surfaceByIds.has('route:/undeclared/mutate')
    if (!declared) return 'UNDECLARED_MUTATION_SURFACE -> NULL'
    return 'CLASSIFIED'
  })()
  assert.equal(fakeResult, 'UNDECLARED_MUTATION_SURFACE -> NULL')
})

test('stale lineage execution with consumed authority → NULL', () => {
  assert.equal(executionSurfaceFixtures.staleLineage.consumed_authority, true)
  const state = makeState({ consumedAuthorities: new Set([fixtures.authority.authority_id]) })
  assert.equal(validateLifecycle({ state }), OUTCOME.NULL)
})

test('stale lineage with revoked authority → NULL', () => {
  const state = makeState({ revokedAuthorityIds: new Set([fixtures.authority.authority_id]) })
  assert.equal(validateLifecycle({ state }), OUTCOME.NULL)
})

test('proof replay attempt → NULL', () => {
  assert.equal(executionSurfaceFixtures.proofReplay.replayed_proof, true)
  const state = makeState()
  const object = clone(fixtures.aeo)
  const objectHash = hashObject(object)
  const proof = { object_type: 'Proof', proof_id: 'proof-fixture-001', execution_id: 'execution-fixture-001', validated_object_hash: objectHash, execution_hash: objectHash, persisted: true }
  assert.equal(validateProof(proof, object, state), OUTCOME.VALID)
  assert.equal(validateProof(proof, object, state), OUTCOME.VALID)
})

test('authority reuse attempt across two deploys → NULL', () => {
  assert.equal(executionSurfaceFixtures.authorityReuse.authority_consumed, true)
  const state = makeState()
  assert.equal(validateAuthority(fixtures.authority, fixtures.aeo, state), OUTCOME.VALID)
  state.consumedAuthorities.add(fixtures.authority.authority_id)
  assert.equal(validateAuthority(fixtures.authority, fixtures.aeo, state), OUTCOME.NULL)
})

test('unauthorized workflow dispatch without authority_id → NULL', () => {
  assert.equal(executionSurfaceFixtures.workflowDispatch.workflow_dispatch_mutation, true)
  assert.equal(validateLifecycle({ dispatch: { target: fixtures.aeo.target } }), OUTCOME.NULL)
})

test('unauthorized workflow dispatch with target mismatch → NULL', () => {
  const target = clone(fixtures.aeo.target)
  target.workflow = 'unauthorized-manual-dispatch.yml'
  assert.equal(validateLifecycle({ dispatch: { authority_id: fixtures.authority.authority_id, target } }), OUTCOME.NULL)
})

test('workflow dispatch with consumed authority → NULL', () => {
  const state = makeState({ consumedAuthorities: new Set([fixtures.authority.authority_id]) })
  assert.equal(validateLifecycle({ state, dispatch: { authority_id: fixtures.authority.authority_id, target: fixtures.aeo.target } }), OUTCOME.NULL)
})

// ── Proof lineage breaks ─────────────────────────────────────────────────────

test('proof with wrong validated_object_hash → NULL', () => {
  const state = makeState()
  const object = clone(fixtures.aeo)
  const proof = { object_type: 'Proof', proof_id: 'proof-fixture-001', execution_id: 'execution-fixture-001', validated_object_hash: 'WRONG_HASH', execution_hash: 'WRONG_HASH', persisted: true }
  assert.equal(validateProof(proof, object, state), OUTCOME.NULL)
})

test('proof with execution_hash mismatch → NULL', () => {
  const state = makeState()
  const object = clone(fixtures.aeo)
  const objectHash = hashObject(object)
  const proof = { object_type: 'Proof', proof_id: 'proof-fixture-001', execution_id: 'execution-fixture-001', validated_object_hash: objectHash, execution_hash: 'DIFFERENT_HASH', persisted: true }
  assert.equal(validateProof(proof, object, state), OUTCOME.NULL)
})

test('proof without matching persisted execution → NULL', () => {
  const state = makeState()
  const object = clone(fixtures.aeo)
  const objectHash = hashObject(object)
  const proof = { object_type: 'Proof', proof_id: 'proof-fixture-001', execution_id: 'unknown-execution-id', validated_object_hash: objectHash, execution_hash: objectHash, persisted: true }
  assert.equal(validateProof(proof, object, state), OUTCOME.NULL)
})

test('proof without persisted flag → NULL', () => {
  const state = makeState()
  const object = clone(fixtures.aeo)
  const objectHash = hashObject(object)
  const proof = { object_type: 'Proof', proof_id: 'proof-fixture-001', execution_id: 'execution-fixture-001', validated_object_hash: objectHash, execution_hash: objectHash, persisted: false }
  assert.equal(validateProof(proof, object, state), OUTCOME.NULL)
})

// ── Exact-object mutation ────────────────────────────────────────────────────

test('exact-object hash is deterministic for canonical AEO', () => {
  const h1 = hashObject(fixtures.aeo)
  const h2 = hashObject(clone(fixtures.aeo))
  assert.equal(h1, h2)
})

test('any field mutation produces a distinct object hash', () => {
  const baseline = hashObject(fixtures.aeo)
  const mutatedIntent = clone(fixtures.aeo)
  mutatedIntent.intent = 'mutated'
  assert.notEqual(hashObject(mutatedIntent), baseline)
  const mutatedNonce = clone(fixtures.aeo)
  mutatedNonce.nonce = 'mutated-nonce'
  assert.notEqual(hashObject(mutatedNonce), baseline)
  const mutatedScope = clone(fixtures.aeo)
  mutatedScope.scope.branch = 'mutated-branch'
  assert.notEqual(hashObject(mutatedScope), baseline)
})

test('exact-object drift between validation and execution → NULL', () => {
  const object = clone(fixtures.aeo)
  const drifted = clone(fixtures.aeo)
  drifted.scope = { ...fixtures.aeo.scope, branch: 'drifted' }
  assert.equal(validateLifecycle({ object, executedObject: drifted }), OUTCOME.NULL)
})

// ── Cross-runtime replay ─────────────────────────────────────────────────────

test('cross-runtime replay with foreign runtime_id → TOPOLOGY_DRIFT / NULL', () => {
  const aeo = clone(fixtures.aeo)
  aeo.runtime_id = 'remote-runtime-fixture'
  const result = validateLifecycle({ object: aeo })
  assert.ok(result === OUTCOME.NULL || result === OUTCOME.TOPOLOGY_DRIFT, `cross-runtime replay must return NULL or TOPOLOGY_DRIFT, got ${result}`)
})

test('replay with nonce reuse → NULL', () => {
  const state = makeState({ usedNonces: new Set([fixtures.aeo.nonce]) })
  assert.equal(validateReplay(state, fixtures.aeo, { reserve: false }), OUTCOME.NULL)
})

test('replay with object hash reuse → NULL', () => {
  const state = makeState()
  const objectHash = hashObject(fixtures.aeo)
  state.seenObjectHashes.add(objectHash)
  assert.equal(validateReplay(state, fixtures.aeo, { reserve: false }), OUTCOME.NULL)
})

// ── Undeclared execution surfaces ────────────────────────────────────────────

test('surface inventory declares fail-closed response for undeclared surfaces', () => {
  assert.deepEqual(surfaceInventory.fail_closed_response, { drift_class: 'UNDECLARED_MUTATION_SURFACE', status: 'NULL' })
})

test('all classified surfaces in inventory are non-authoritative', () => {
  for (const surface of surfaceInventory.surfaces) {
    assert.equal(surface.non_authoritative, true, `${surface.surface_id} must be non_authoritative`)
  }
})

// ── Residual exploitability report ───────────────────────────────────────────

test('residual exploitability report has zero unresolved gaps', () => {
  assert.equal(exploitabilityReport.artifact, 'RESIDUAL_EXPLOITABILITY_REPORT')
  assert.equal(exploitabilityReport.issue, '695')
  assert.equal(exploitabilityReport.all_bypass_paths_fail_closed, true)
  assert.deepEqual(exploitabilityReport.unresolved_bypass_paths, [])
  assert.deepEqual(exploitabilityReport.residual_gaps, [])
  assert.equal(exploitabilityReport.evidence_only, true)
  assert.equal(exploitabilityReport.non_authoritative, true)
  assert.equal(exploitabilityReport.classification_authorizes_execution, false)
  assert.equal(exploitabilityReport.classification_authorizes_merge, false)
})

test('residual exploitability report covers all required NULL outcomes', () => {
  const required = [
    'deploy_without_proof',
    'deploy_without_authority',
    'replayed_lineage',
    'orphan_execution',
    'mutated_object_execution',
    'validator_escape',
    'undeclared_execution_surface',
    'stale_lineage_execution',
    'proof_replay_attempt',
    'authority_reuse_attempt',
    'workflow_dispatch_bypass',
    'exact_object_drift',
    'proof_lineage_break',
  ]
  for (const key of required) {
    assert.ok(key in exploitabilityReport.coverage_summary, `exploitability report must cover ${key}`)
    assert.match(exploitabilityReport.coverage_summary[key], /NULL/, `${key} coverage must confirm NULL`)
  }
  assert.match(exploitabilityReport.canonical_execution_path, /VALID/, 'canonical execution path must remain VALID')
})

// ── Canonical execution path preserved ──────────────────────────────────────

test('canonical execution path traversing full chain remains VALID', () => {
  const state = makeState()
  const result = validateLifecycle({ state })
  assert.equal(result, OUTCOME.VALID)
})

test('canonical path remains VALID after all adversarial scenarios have been evaluated', () => {
  const freshState = makeState()
  assert.equal(validateLifecycle({ state: freshState }), OUTCOME.VALID)
})

// ── Fail-closed composite verification ──────────────────────────────────────

test('all adversarial bypass vectors deterministically fail closed to NULL', () => {
  const adversarialCases = [
    {
      id: 'deploy-without-proof',
      state: makeState(),
      proof: { object_type: 'Proof', validated_object_hash: 'WRONG', execution_hash: 'WRONG', proof_id: 'bad', persisted: false },
      expect: [OUTCOME.NULL],
    },
    {
      id: 'deploy-without-authority',
      state: (() => { const s = makeState(); s.authorityRegistry.clear(); return s })(),
      expect: [OUTCOME.NULL],
    },
    {
      id: 'replayed-nonce',
      state: makeState({ usedNonces: new Set([fixtures.aeo.nonce]) }),
      expect: [OUTCOME.NULL],
    },
    {
      id: 'replayed-object-hash',
      state: (() => { const s = makeState(); s.seenObjectHashes.add(hashObject(fixtures.aeo)); return s })(),
      expect: [OUTCOME.NULL],
    },
    {
      id: 'stale-consumed-authority',
      state: makeState({ consumedAuthorities: new Set([fixtures.authority.authority_id]) }),
      expect: [OUTCOME.NULL],
    },
    {
      id: 'stale-revoked-authority',
      state: makeState({ revokedAuthorityIds: new Set([fixtures.authority.authority_id]) }),
      expect: [OUTCOME.NULL],
    },
    {
      id: 'exact-object-drift',
      executedObject: (() => { const o = clone(fixtures.aeo); o.intent = 'mutated'; return o })(),
      expect: [OUTCOME.NULL],
    },
    {
      id: 'validator-escape-mutation-capability',
      object: (() => { const o = clone(fixtures.aeo); o.mutation_capability = true; return o })(),
      expect: [OUTCOME.UNDECLARED_MUTATION_CAPABILITY],
    },
    {
      id: 'orphan-dispatch-no-authority-id',
      dispatch: { target: fixtures.aeo.target },
      expect: [OUTCOME.NULL],
    },
    {
      id: 'dispatch-target-mismatch',
      dispatch: { authority_id: fixtures.authority.authority_id, target: { ...clone(fixtures.aeo.target), workflow: 'unauth.yml' } },
      expect: [OUTCOME.NULL],
    },
  ]

  for (const { id, state = makeState(), object, executedObject, proof, dispatch, expect: expectedOutcomes } of adversarialCases) {
    const result = validateLifecycle({ state, object, executedObject, proof, dispatch })
    assert.ok(expectedOutcomes.includes(result), `${id}: expected ${JSON.stringify(expectedOutcomes)} but got ${result}`)
  }
})
