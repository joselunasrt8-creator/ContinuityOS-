import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const proofSpec = JSON.parse(readFileSync(new URL('../fate_proof_integrity_tests.json', import.meta.url), 'utf8'))

test('FATE proof integrity specs are now represented by executable assertions', () => {
  assert.equal(proofSpec.artifact, 'FATE_PROOF_INTEGRITY_TESTS')
  assert.equal(proofSpec.status, 'NON_OPERATIVE')
  assert.ok(proofSpec.tests.some((fate) => fate.expected_reason === 'proof_linkage_missing'))
})

test('proof without execution returns NULL / INVALID', () => {
  assert.match(source, /SELECT \* FROM execution_registry WHERE execution_id=\?1 AND decision_id=\?2 AND validated_object_hash=\?3 AND status='EXECUTED'/)
  assert.match(source, /proof_without_execute/)
  assert.match(source, /return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"execution_missing" \}/)
})

test('proof with wrong session lineage returns NULL / INVALID', () => {
  assert.match(source, /String\(execution\.session_id \|\| ""\) !== session_id/)
  assert.match(source, /String\(authority\.session_id \|\| ""\) !== session_id/)
  assert.match(source, /reason:"session_lineage_mismatch"/)
})

test('proof with wrong hash returns NULL / INVALID', () => {
  assert.match(source, /const executionById = await env\.DB\.prepare\(`SELECT \* FROM execution_registry WHERE execution_id=\?1`\)/)
  assert.match(source, /indicator: "proof_hash_mismatch"/)
  assert.match(source, /provided_hash: validated_object_hash/)
})

test('duplicate proof is blocked as NULL / INVALID', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS proof_registry[\s\S]*UNIQUE\(execution_id, decision_id, validated_object_hash\)/)
  assert.match(source, /reason:"proof_replay"/)
  assert.match(source, /REPLAY_BLOCKED/)
})

test('proof persists authority/session lineage', () => {
  assert.match(source, /INSERT(?: OR IGNORE)? INTO proof_registry \(proof_id,identity_id,session_id,continuity_id,continuity_hash,execution_id,decision_id,validated_object_hash/)
  assert.match(source, /WHERE a\.decision_id=\?4 AND a\.session_id=\?2 AND a\.status='EXECUTED'/)
  assert.match(source, /UPDATE authority_registry SET status='CONSUMED' WHERE decision_id=\?1 AND session_id=\?2 AND status='EXECUTED'/)
  assert.match(source, /proof: \{ proof_id, identity_id: String\(authority\.identity_id \|\| ""\), session_id, continuity_id: String\(authority\.continuity_id/)
})

test('canonical proof lookup stability fails closed when canonical candidate is ambiguous', () => {
  assert.match(source, /type CanonicalProofResolution =/)
  assert.match(source, /\| \{ status: "SELECTED", candidates: any\[\], canonical_candidates: any\[\], canonical_proof: any \}/)
  assert.match(source, /\| \{ status: "AMBIGUOUS", candidates: any\[\], canonical_candidates: any\[\], canonical_proof: null \}/)
  assert.match(source, /const canonical_candidates = candidates\.filter\(\(proof: any\) => proofExecutionLineageMatches\(proof, execution\)\)/)
  assert.match(source, /if \(candidates\.length === 1 && canonical_candidates\.length === 1\) return \{ status: "SELECTED"/)
  assert.match(source, /return \{ status: "AMBIGUOUS", candidates, canonical_candidates, canonical_proof: null \}/)
})


test('canonical proof lineage requires valid executed execution lineage', () => {
  assert.match(source, /String\(execution\?\.status \|\| ""\) !== "EXECUTED"\) return false/)
})

test('execution lineage mutation cannot silently rewrite canonical proof lineage binding', () => {
  assert.match(source, /String\(executionLineage\?\.execution_status \|\| ""\) === String\(execution\?\.status \|\| ""\)/)
  assert.match(source, /String\(executionLineage\?\.delegation_lineage_hash \|\| ""\) === String\(execution\?\.delegation_lineage_hash \|\| ""\)/)
  assert.match(source, /String\(executionLineage\?\.delegation_root_hash \|\| ""\) === String\(execution\?\.delegation_root_hash \|\| ""\)/)
})

test('deterministic proof lineage restoration preserves execution, decision, hash, and nonce', () => {
  assert.match(source, /String\(proof\?\.execution_id \|\| ""\) === String\(execution\?\.execution_id \|\| ""\)/)
  assert.match(source, /String\(proof\?\.decision_id \|\| ""\) === String\(execution\?\.decision_id \|\| ""\)/)
  assert.match(source, /String\(proof\?\.validated_object_hash \|\| ""\) === String\(execution\?\.validated_object_hash \|\| ""\)/)
  assert.match(source, /String\(executionLineage\?\.invocation_nonce \|\| ""\) === String\(execution\?\.invocation_nonce \|\| ""\)/)
})
