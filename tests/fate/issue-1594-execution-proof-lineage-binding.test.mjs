import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

// Criterion 6: Proof artifact fails closed on lineage mismatch
test('proof_lineage_mismatch_rejected_at_reconciliation', () => {
  assert.match(
    source,
    /if \(String\(row\.parent_execution_hash \|\| ""\) !== String\(context\.execution\.lineage_origin_hash \|\| ""\)\) return "proof_lineage_drift"/,
    'cross-registry reconciliation must reject proof whose parent_execution_hash does not match execution.lineage_origin_hash',
  )
  assert.match(
    source,
    /if \(!proofLineageOrigin\.ok\) return "proof_lineage_drift"/,
    'cross-registry reconciliation must fail closed when verifyLineageOrigin returns !ok for the proof stage',
  )
})

test('proof_lineage_mismatch_rejected_at_proof_route', () => {
  assert.match(
    source,
    /reason:"execution_hash_mismatch"[\s\S]*indicator: "proof_hash_mismatch"/,
    'proof route must reject execution whose validated_object_hash does not match the supplied hash',
  )
  assert.match(
    source,
    /reason:"session_lineage_mismatch"[\s\S]*[\s\S]*expected_session_id/,
    'proof route must reject execution whose session_id does not match the proof request',
  )
  assert.match(
    source,
    /reason:"continuity_lineage_mismatch"[\s\S]*expected_continuity_id/,
    'proof route must reject proof whose continuity_id diverges from execution continuity',
  )
})

// Criterion 7: Proof artifact fails closed on stale lineage
test('proof_fails_closed_on_stale_execution', () => {
  assert.match(
    source,
    /const PROOF_FRESHNESS_WINDOW_MS = /,
    'runtime must define a canonical proof freshness window',
  )
  assert.match(
    source,
    /reason:"proof_freshness_expired"[\s\S]*indicator: "proof_freshness_window_expired"/,
    'proof route must fail closed with proof_freshness_expired when execution falls outside the freshness window',
  )
  assert.match(
    source,
    /if \(!isFresh\(String\(execution\.created_at \|\| ""\), PROOF_FRESHNESS_WINDOW_MS\)\)/,
    'proof must evaluate execution.created_at against PROOF_FRESHNESS_WINDOW_MS before accepting the lineage',
  )
})

test('proof_fails_closed_on_stale_validation', () => {
  assert.match(
    source,
    /reason:"stale_validation"[\s\S]*indicator: "stale_validation_blocked_at_proof"/,
    'proof route must fail closed with stale_validation when validation falls outside the freshness window',
  )
})

// Criterion 9: FATE coverage for lineage failure paths — proof stage verifyLineageOrigin at reconciliation
test('reconciliation_proof_stage_uses_verifyLineageOrigin', () => {
  assert.match(
    source,
    /const proofLineageOrigin = verifyLineageOrigin\(\{[\s\S]*stage: "proof"[\s\S]*execution_hash: String\(context\.execution\.lineage_origin_hash \|\| ""\)/,
    'cross-registry reconciliation must call verifyLineageOrigin at stage="proof" binding execution.lineage_origin_hash as the execution_hash',
  )
})

test('reconciliation_proof_stage_fails_closed_on_orphan_lineage', () => {
  assert.match(
    source,
    /if \(!String\(row\.parent_execution_hash \|\| ""\)\) return "orphan_legitimacy_object_drift"/,
    'cross-registry reconciliation must fail closed when proof.parent_execution_hash is absent',
  )
  assert.match(
    source,
    /if \(!String\(row\.lineage_origin_hash \|\| ""\)\) return "orphan_legitimacy_object_drift"/,
    'cross-registry reconciliation must fail closed when proof.lineage_origin_hash is absent',
  )
})

// Full lineage chain reconstruction: decision → continuity → authority → validation → execution → proof
test('proof_registry_contains_all_lineage_binding_fields', () => {
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS proof_registry[\s\S]*execution_id TEXT NOT NULL[\s\S]*decision_id TEXT NOT NULL[\s\S]*validated_object_hash TEXT NOT NULL[\s\S]*continuity_id TEXT[\s\S]*identity_id TEXT[\s\S]*authority_lineage TEXT[\s\S]*execution_lineage TEXT[\s\S]*parent_execution_hash TEXT[\s\S]*lineage_stage TEXT[\s\S]*lineage_origin_hash TEXT/,
    'proof_registry must persist all fields required to reconstruct decision→continuity→authority→validation→execution→proof lineage',
  )
})

test('execution_lineage_carries_full_chain_identifiers', () => {
  assert.match(
    source,
    /const executionLineage = canonicalize\(\{[\s\S]*identity_id:[\s\S]*session_id,[\s\S]*continuity_id:[\s\S]*continuity_ancestry:[\s\S]*authority_id:[\s\S]*decision_id,[\s\S]*execution_id,/,
    'execution_lineage stored in proof must carry identity_id, session_id, continuity_id, authority_id, decision_id, and execution_id',
  )
})

test('authority_lineage_carries_full_chain_identifiers', () => {
  assert.match(
    source,
    /const authorityLineage = canonicalize\(\{[\s\S]*identity_id:[\s\S]*session_id,[\s\S]*continuity_id:[\s\S]*continuity_ancestry:[\s\S]*authority_id:/,
    'authority_lineage stored in proof must carry identity_id, session_id, continuity_id, and authority_id',
  )
})

// Criterion 11 invariant: validated_object == executed_object (protected at proof boundary)
test('proof_enforces_validated_object_equals_executed_object', () => {
  assert.match(
    source,
    /validated_object_equals_executed_object: true/,
    'runtime semantic invariant must declare validated_object_equals_executed_object',
  )
  assert.match(
    source,
    /if \(String\(execution\.validated_object_hash \|\| ""\) !== validated_object_hash \|\| String\(validation\?\.validated_object_hash \|\| ""\) !== validated_object_hash\)/,
    'proof route must fail closed when execution or validation validated_object_hash diverges from the proof request hash',
  )
})

// Criterion 10: validation lineage == proof lineage
test('proof_route_enforces_validation_and_execution_continuity_match', () => {
  assert.match(
    source,
    /if \(!validation \|\| String\(validation\.continuity_id \|\| ""\) !== String\(execution\.continuity_id \|\| ""\)\)/,
    'proof route must fail closed when validation.continuity_id does not equal execution.continuity_id',
  )
})
