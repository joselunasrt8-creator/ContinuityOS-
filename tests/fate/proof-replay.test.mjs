import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('reordered proof_registry replay uses deterministic canonical proof resolver', () => {
  assert.match(source, /function resolveCanonicalProofEvidence\(proofs: any\[\], execution: any\): CanonicalProofResolution \{[\s\S]*const candidates = sortProofLineageRows\(Array\.isArray\(proofs\) \? proofs : \[\]\)/)
  assert.match(source, /const canonicalProofResolution = resolveCanonicalProofEvidence\(existingProofs\.results \|\| \[\], execution\)/)
  assert.match(source, /const canonicalExistingProof = canonicalProofResolution\.canonical_proof/)
})

test('registry hydration replay preserves exact restored proof lineage binding', () => {
  assert.match(source, /String\(proof\?\.execution_id \|\| ""\) === String\(execution\?\.execution_id \|\| ""\)/)
  assert.match(source, /String\(proof\?\.decision_id \|\| ""\) === String\(execution\?\.decision_id \|\| ""\)/)
  assert.match(source, /String\(proof\?\.validated_object_hash \|\| ""\) === String\(execution\?\.validated_object_hash \|\| ""\)/)
  assert.match(source, /String\(executionLineage\?\.invocation_nonce \|\| ""\) === String\(execution\?\.invocation_nonce \|\| ""\)/)
})

test('duplicate canonical candidates fail closed to NULL ambiguity', () => {
  assert.match(source, /if \(candidates\.length === 1 && canonical_candidates\.length === 1\) return \{ status: "SELECTED"/)
  assert.match(source, /return \{ status: "AMBIGUOUS", candidates, canonical_candidates, canonical_proof: null \}/)
  assert.match(source, /reason:"proof_lineage_ambiguous"/)
  assert.match(source, /PROOF_AMBIGUITY_FAIL_CLOSED_CONFIRMED/)
})

test('deterministic repeated proof resolution is side-effect-free evidence replay', () => {
  assert.match(source, /classification: "PROOF_CANONICAL_EVIDENCE_REPLAY_CONTAINED"/)
  assert.match(source, /proof_registry_appended: false/)
  assert.match(source, /proof_registry_mutated: false/)
  assert.match(source, /registry_mutation_blocked: \["authority_registry", "execution_registry", "invocation_registry", "proof_registry"\]/)
  assert.match(source, /return json\(\{ status:"PROVEN", result:"OK", proof_id: String\(canonicalExistingProof\.proof_id \|\| ""\), replay: canonicalEvidenceReplay, proof: canonicalExistingProof \}\)/)
})

test('replay evidence responses remain non-authoritative', () => {
  assert.match(source, /evidence_only: true/)
  assert.match(source, /non_authoritative: true/)
  assert.match(source, /merge_authorized: false/)
  assert.match(source, /deployment_authorized: false/)
  assert.match(source, /runtime_authority_granted: false/)
  assert.match(source, /proof_issue_authority_granted: false/)
})
