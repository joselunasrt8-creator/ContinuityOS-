import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { join } from 'node:path'

const evidence = JSON.parse(
  readFileSync(join(process.cwd(), 'evidence/dependency-formation/DEPENDENCY_FORMATION_SPINE_2013.json'), 'utf8'),
)

const registry = JSON.parse(
  readFileSync(join(process.cwd(), 'runtime/adoption/external_surface_registry.json'), 'utf8'),
)

const surface = registry.surfaces.find(
  (item) => item.surface_id === 'continuityos_merge_guard_dependency_evidence_2013',
)

test('issue #2013 dependency evidence is partial and evidence-only', () => {
  assert.equal(evidence.issue, '#2013')
  assert.equal(evidence.mode, 'evidence_only')
  assert.equal(evidence.creates_authority, false)
  assert.equal(evidence.creates_proof, false)
  assert.equal(evidence.visibility_implies_legitimacy, false)
  assert.equal(evidence.closure_status, 'PARTIAL')
  assert.match(evidence.evidence_semantics, /must_not_imply_issue_closure/)
  assert.match(evidence.remaining_closure_gap, /remains open/)
})

test('issue #2013 dependency wording avoids unvalidated formation and independence claims', () => {
  assert.equal(
    evidence.dependency_claim,
    'ContinuityOS Merge Guard records outside-runtime load-bearing dependency evidence for a repository that pins the packaged action and makes VALID/NULL a required merge check.',
  )
  assert.doesNotMatch(evidence.dependency_claim, /has formed an external workflow dependency/)
  assert.equal(evidence.provider_author_can_self_satisfy, 'unknown')
  assert.equal(evidence.independence_status, 'outside_owner_or_outside_controlled_dependency_not_established')
})

test('issue #2013 dependency evidence preserves observed load-bearing facts', () => {
  assert.equal(evidence.evidence.load_bearing_state, 'LOAD_BEARING_ACTIVE')
  assert.equal(evidence.evidence.required_merge_check.observed, true)
  assert.equal(evidence.evidence.required_merge_check.check_name, 'VALID/NULL')
  assert.equal(evidence.evidence.proof_evidence.valid_proof_observed, true)
  assert.equal(evidence.evidence.proof_evidence.null_proof_observed, true)
  assert.equal(evidence.evidence.packaged_action_pin.observed, true)
  assert.equal(evidence.evidence.packaged_action_pin.version, 'v0.1.0')
  assert.equal(evidence.evidence.external_consumer_registration.observed, true)
  assert.equal(evidence.evidence.external_consumer_registration.semantics, 'evidence_only')
})

test('external surface registry records #2013 evidence without closure implication', () => {
  assert.ok(surface, 'expected #2013 external consumer evidence surface to be registered')
  assert.equal(surface.closure_status, 'PARTIAL')
  assert.equal(surface.description, evidence.dependency_claim)
  assert.equal(surface.evidence_mode, 'evidence_only')
  assert.equal(surface.creates_authority, false)
  assert.equal(surface.creates_proof, false)
  assert.equal(surface.visibility_implies_legitimacy, false)
  assert.equal(surface.provider_author_can_self_satisfy, 'unknown')
  assert.equal(surface.independence_status, 'outside_owner_or_outside_controlled_dependency_not_established')
  assert.equal(surface.remaining_closure_gap, evidence.remaining_closure_gap)
  assert.deepEqual(surface.evidence_preserved, [
    'LOAD_BEARING_ACTIVE',
    'required_merge_check',
    'VALID_proof_evidence',
    'NULL_proof_evidence',
    'pinned_v0.1.0',
    'external_consumer_registration',
    'evidence_only_semantics',
  ])
})
