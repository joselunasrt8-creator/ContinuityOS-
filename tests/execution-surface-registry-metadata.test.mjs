import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const registry = JSON.parse(readFileSync(new URL('../EXECUTION_SURFACES.json', import.meta.url), 'utf8'))

const requiredMetadata = [
  'mutation_capable',
  'execution_capable',
  'deployment_capable',
  'replay_semantics',
  'authority_requirements',
  'proof_requirements',
  'validation_requirements',
  'governance_addressability',
  'evidence_only',
  'canonical_boundary_classification',
]

test('canonical execution surface registry carries required issue 2280 metadata on every surface', () => {
  assert.equal(registry.canonical_source_path, 'EXECUTION_SURFACES.json')
  assert.deepEqual(registry.issue_2280_completion_evidence.required_metadata, requiredMetadata)

  for (const surface of registry.surfaces) {
    for (const field of requiredMetadata) {
      assert.ok(Object.hasOwn(surface, field), `${surface.surface_id} missing ${field}`)
    }

    assert.equal(typeof surface.mutation_capable, 'boolean')
    assert.equal(typeof surface.execution_capable, 'boolean')
    assert.equal(typeof surface.deployment_capable, 'boolean')
    assert.equal(typeof surface.evidence_only, 'boolean')
    assert.equal(typeof surface.replay_semantics, 'string')
    assert.equal(typeof surface.governance_addressability, 'string')
    assert.equal(typeof surface.canonical_boundary_classification, 'string')
    assert.ok(Array.isArray(surface.authority_requirements))
    assert.ok(Array.isArray(surface.proof_requirements))
    assert.ok(Array.isArray(surface.validation_requirements))
  }
})

test('evidence-only execution surface inventory entries remain non-mutating and non-executable', () => {
  const evidenceOnlySurfaces = registry.surfaces.filter((surface) => surface.evidence_only)

  assert.equal(evidenceOnlySurfaces.length > 0, true)

  for (const surface of evidenceOnlySurfaces) {
    assert.equal(surface.mutation_capable, false, `${surface.surface_id} must not mutate`)
    assert.equal(surface.execution_capable, false, `${surface.surface_id} must not execute`)
    assert.equal(surface.deployment_capable, false, `${surface.surface_id} must not deploy`)
    assert.match(surface.replay_semantics, /replay-neutral/i)
  }
})
