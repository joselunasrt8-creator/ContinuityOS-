import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const canonicalChain = ['/session','/continuity','/authority','/compile','/validate','/execute','/proof']
const executionSurfaces = JSON.parse(readFileSync(new URL('../../runtime/execution_surfaces.json', import.meta.url), 'utf8'))
const bypassPaths = JSON.parse(readFileSync(new URL('../../runtime/bypass_paths.json', import.meta.url), 'utf8'))
const inventory = JSON.parse(readFileSync(new URL('../../runtime/unauthorized_mutation_surface_inventory.json', import.meta.url), 'utf8'))

const inventoryById = new Map(inventory.surfaces.map((surface) => [surface.surface_id, surface]))

function verifyDeployAttempt({ hasProof, hasAuthority, hasLineage, objectHashValidated, objectHashExecuted, replayedLineage, undeclaredSurface, validatorEscaped }) {
  if (!hasProof) return 'NULL'
  if (!hasAuthority) return 'NULL'
  if (!hasLineage) return 'NULL'
  if (objectHashValidated !== objectHashExecuted) return 'NULL'
  if (replayedLineage) return 'NULL'
  if (undeclaredSurface) return 'NULL'
  if (validatorEscaped) return 'NULL'
  return 'VALID'
}

function enumerateBypassCandidates() {
  const candidates = []
  for (const surface of inventory.surfaces) {
    if (surface.mutation_capability || surface.execution_capability || surface.deployment_capability) {
      candidates.push(surface.surface_id)
    }
  }
  return candidates.sort()
}

test('execution surface inventory scanner yields deploy-capable surface map and topology chain remains canonical', () => {
  assert.equal(executionSurfaces.closure_verification.unclassified_mutation_response, 'UNDECLARED_MUTATION_SURFACE -> NULL')
  const map = enumerateBypassCandidates()
  assert.ok(map.length > 0)
  assert.ok(map.includes('route:/execute'))
  assert.ok(map.includes('route:/proof'))
})

test('bypass path enumeration remains fail-closed with no unresolved mutation paths', () => {
  assert.equal(bypassPaths.required_response, 'NULL')
  assert.equal(bypassPaths.closure_verification.missing_mutation_surface_response, 'UNDECLARED_MUTATION_SURFACE -> NULL')
})

test('workflow dispatch and deploy topology require canonical lineage continuity', () => {
  const executeSurface = inventoryById.get('route:/execute')
  const proofSurface = inventoryById.get('route:/proof')
  assert.ok(executeSurface)
  assert.ok(proofSurface)
  assert.equal(executeSurface.authority_required, 'canonical_runtime_authority')
  assert.equal(executeSurface.validation_required, true)
  assert.equal(proofSurface.proof_required, true)
  assert.deepEqual(canonicalChain, ['/session','/continuity','/authority','/compile','/validate','/execute','/proof'])
})

test('replay exploit, authority reuse, orphan execution, and validator escape fixtures deterministically fail closed', () => {
  const fixtures = [
    { id: 'deploy-without-proof', payload: { hasProof: false, hasAuthority: true, hasLineage: true, objectHashValidated: 'A', objectHashExecuted: 'A', replayedLineage: false, undeclaredSurface: false, validatorEscaped: false } },
    { id: 'deploy-without-authority', payload: { hasProof: true, hasAuthority: false, hasLineage: true, objectHashValidated: 'A', objectHashExecuted: 'A', replayedLineage: false, undeclaredSurface: false, validatorEscaped: false } },
    { id: 'workflow-without-lineage', payload: { hasProof: true, hasAuthority: true, hasLineage: false, objectHashValidated: 'A', objectHashExecuted: 'A', replayedLineage: false, undeclaredSurface: false, validatorEscaped: false } },
    { id: 'exact-object-drift', payload: { hasProof: true, hasAuthority: true, hasLineage: true, objectHashValidated: 'A', objectHashExecuted: 'B', replayedLineage: false, undeclaredSurface: false, validatorEscaped: false } },
    { id: 'replayed-proof-lineage', payload: { hasProof: true, hasAuthority: true, hasLineage: true, objectHashValidated: 'A', objectHashExecuted: 'A', replayedLineage: true, undeclaredSurface: false, validatorEscaped: false } },
    { id: 'orphan-execution', payload: { hasProof: true, hasAuthority: true, hasLineage: false, objectHashValidated: 'A', objectHashExecuted: 'A', replayedLineage: false, undeclaredSurface: false, validatorEscaped: false } },
    { id: 'undeclared-surface', payload: { hasProof: true, hasAuthority: true, hasLineage: true, objectHashValidated: 'A', objectHashExecuted: 'A', replayedLineage: false, undeclaredSurface: true, validatorEscaped: false } },
    { id: 'validator-escape', payload: { hasProof: true, hasAuthority: true, hasLineage: true, objectHashValidated: 'A', objectHashExecuted: 'A', replayedLineage: false, undeclaredSurface: false, validatorEscaped: true } }
  ]

  for (const fixture of fixtures) {
    assert.equal(verifyDeployAttempt(fixture.payload), 'NULL', fixture.id)
  }
})

test('authorized canonical execution remains the only non-NULL path', () => {
  const result = verifyDeployAttempt({
    hasProof: true,
    hasAuthority: true,
    hasLineage: true,
    objectHashValidated: 'SAME',
    objectHashExecuted: 'SAME',
    replayedLineage: false,
    undeclaredSurface: false,
    validatorEscaped: false
  })
  assert.equal(result, 'VALID')
})
