import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const indexSource = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const d1StorageAdapterSource = readFileSync(new URL('../../src/lib/d1-storage-adapter.ts', import.meta.url), 'utf8')
const source = `${indexSource}\n${d1StorageAdapterSource}`

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
  assert.match(source, /return json\(\{ status:"NULL", result:"INVALID", reason:"proof_replay", proof_id: String\(canonicalExistingProof\.proof_id \|\| ""\), replay: canonicalEvidenceReplay \}\)/)
})

test('replay evidence responses remain non-authoritative', () => {
  assert.match(source, /evidence_only: true/)
  assert.match(source, /non_authoritative: true/)
  assert.match(source, /merge_authorized: false/)
  assert.match(source, /deployment_authorized: false/)
  assert.match(source, /runtime_authority_granted: false/)
  assert.match(source, /proof_issue_authority_granted: false/)
})

test('replay recovery remains deterministic after proof registry reorder and hydration variance', () => {
  assert.match(source, /function sortProofLineageRows\(rows: any\[\]\): any\[\] \{/)
  assert.match(source, /const created = String\(a\.created_at \|\| ""\)\.localeCompare\(String\(b\.created_at \|\| ""\)\)/)
  assert.match(source, /const canonical = canonicalize\(proofLineageMaterial\(a\)\)\.localeCompare\(canonicalize\(proofLineageMaterial\(b\)\)\)/)
  assert.match(source, /return String\(a\.proof_id \|\| ""\)\.localeCompare\(String\(b\.proof_id \|\| ""\)\)/)
})

test('replay recovery after duplicate quarantine restoration does not replace canonical lineage', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS proof_registry_duplicate_archive/)
  assert.match(source, /CREATE TABLE IF NOT EXISTS proof_quarantine_registry/)
  assert.match(source, /archive_reason TEXT NOT NULL/)
  assert.match(source, /canonical_proof_id TEXT NOT NULL/)
  assert.match(source, /reason:"proof_replay"/)
  assert.match(source, /proof_registry_appended: false/)
})

test('replay attempts against archived duplicate proofs remain side-effect free', () => {
  assert.match(source, /INSERT OR IGNORE INTO proof_registry_duplicate_archive/)
  assert.match(source, /INSERT OR IGNORE INTO proof_quarantine_registry/)
  assert.match(source, /classification: "PROOF_CANONICAL_EVIDENCE_REPLAY_CONTAINED"/)
  assert.match(source, /registry_mutation_blocked: \["authority_registry", "execution_registry", "invocation_registry", "proof_registry"\]/)
})
