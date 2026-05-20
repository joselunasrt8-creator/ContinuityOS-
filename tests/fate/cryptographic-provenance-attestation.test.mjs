import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0015_cryptographic_provenance_attestations.sql', import.meta.url), 'utf8')
const spec = JSON.parse(readFileSync(new URL('../../governance/runtime/CRYPTOGRAPHIC_PROVENANCE_SPEC.json', import.meta.url), 'utf8'))
const doc = readFileSync(new URL('../../docs/cryptographic-provenance-hardening.md', import.meta.url), 'utf8')

const expandedDrifts = [
  'attestation_drift',
  'signature_drift',
  'signer_identity_drift',
  'payload_drift',
  'transparency_drift'
]

const fateCases = [
  'invalid_signature',
  'signer_mismatch',
  'payload_drift',
  'transparency_proof_absence',
  'replayed_attestation',
  'workflow_replay_collision',
  'canonical_payload_instability',
  'federated_attestation_ambiguity',
  'remote_legitimacy_inference',
  'reconciliation_compatibility'
]

test('DSSE provenance verification is exact-object HMAC evidence only', () => {
  assert.match(source, /const PROVENANCE_PAYLOAD_TYPE = "application\/vnd\.mindshift\.cryptographic-provenance\.v1\+json"/)
  assert.match(source, /function canonicalProvenancePayload/)
  assert.match(source, /function dssePreAuthenticationEncoding/)
  assert.match(source, /async function validateDsseProvenanceEnvelope/)
  assert.match(source, /async function hmacSha256/)
  assert.match(source, /function constantTimeEqual/)
  assert.match(source, /if \(payloadJson !== canonicalPayloadString\) return null/)
  assert.match(source, /canonical_aeo_hash: context\.canonical_aeo_hash/)
  assert.equal(spec.canonical_position, 'attestation evidence is verification evidence, not authority')
})

test('provenance HMAC verification does not fall back to API authentication secret', () => {
  const executeBlock = source.slice(source.indexOf('if (url.pathname === "/execute"'), source.indexOf('if (url.pathname === "/proof"'))
  const proofBlock = source.slice(source.indexOf('if (url.pathname === "/proof"'), source.lastIndexOf('return json({ status: "NULL", reason: "not_found" }'))
  assert.match(executeBlock, /hmac_secret: String\(env\.PROVENANCE_HMAC_SECRET \|\| ""\)/)
  assert.match(proofBlock, /hmac_secret: String\(env\.PROVENANCE_HMAC_SECRET \|\| ""\)/)
  assert.doesNotMatch(executeBlock, /hmac_secret:[\s\S]*env\.API_KEY/)
  assert.doesNotMatch(proofBlock, /hmac_secret:[\s\S]*env\.API_KEY/)
  assert.match(source, /if \(!context\.hmac_secret\) return null/)
})

test('attestation registry preserves replay uniqueness without authority expansion', () => {
  for (const field of ['attestation_id', 'envelope_hash', 'payload_hash', 'payload_type', 'signer_identity', 'decision_id', 'validated_object_hash', 'workflow_run_id', 'workflow_sha', 'canonical_aeo_hash', 'transparency_log_id', 'transparency_integrated_time', 'status', 'created_at']) {
    assert.match(schema, new RegExp(`${field} TEXT`), `schema must include ${field}`)
    assert.match(migration, new RegExp(`${field} TEXT`), `migration must include ${field}`)
  }
  assert.match(migration, /UNIQUE\(envelope_hash\)/)
  assert.match(migration, /UNIQUE\(workflow_run_id\)/)
  assert.match(migration, /UNIQUE\(decision_id, validated_object_hash\)/)
  assert.match(source, /SELECT attestation_id,envelope_hash,workflow_run_id,decision_id,validated_object_hash,signer_identity,status FROM attestation_registry WHERE envelope_hash=\?1 OR workflow_run_id=\?2 OR \(decision_id=\?3 AND validated_object_hash=\?4\)/)
})

test('expanded drift taxonomy preserves existing reconciliation drift classes', () => {
  for (const drift of expandedDrifts) assert.match(source, new RegExp(`"${drift}"`), `runtime missing ${drift}`)
  for (const drift of ['recursive_ancestry_drift', 'federated_lineage_drift', 'replay_chain_drift', 'preo_ancestry_drift', 'revocation_propagation_drift']) {
    assert.match(source, new RegExp(`"${drift}"`), `reconciliation drift missing ${drift}`)
  }
  assert.deepEqual(spec.drift_taxonomy_expansion, expandedDrifts)
})

test('execution and proof integration remains validation-first and proof-persisted', () => {
  const executeBlock = source.slice(source.indexOf('if (url.pathname === "/execute"'), source.indexOf('if (url.pathname === "/proof"'))
  assert.ok(executeBlock.indexOf('SELECT * FROM validation_registry') < executeBlock.indexOf('validateRequestProvenanceAttestation'))
  assert.ok(executeBlock.indexOf('validateDeploymentProvenance') < executeBlock.indexOf('validateRequestProvenanceAttestation'))
  assert.ok(executeBlock.indexOf('validateRequestProvenanceAttestation') < executeBlock.indexOf('INSERT INTO execution_registry'))
  const proofBlock = source.slice(source.indexOf('if (url.pathname === "/proof"'), source.lastIndexOf('return json({ status: "NULL", reason: "not_found" }'))
  assert.ok(proofBlock.indexOf('validateDeploymentProvenance') < proofBlock.indexOf('validateRequestProvenanceAttestation'))
  assert.ok(proofBlock.indexOf('INSERT INTO proof_registry') < proofBlock.indexOf('INSERT INTO attestation_registry'))
})

test('federation, replay, and observability constraints fail closed to NULL', () => {
  assert.match(source, /ambiguous_lineage/)
  assert.match(source, /remote_legitimacy/)
  assert.match(source, /local_authority/)
  assert.match(source, /reason: "replayed_attestation"/)
  assert.match(source, /reason: "observability_only"/)
  assert.ok(doc.includes('Remote signatures do not imply local authority, local validation, or execution legitimacy.'))
  assert.equal(spec.federation_constraints.remote_signatures_create_authority, false)
  assert.equal(spec.replay_guarantees.ambiguous_signer_lineage, 'NULL')
})

test('cryptographic provenance FATE matrix is deterministic fail-closed', () => {
  const byId = new Map(spec.fate_coverage.map((entry) => [entry.test_id, entry]))
  for (const fate of fateCases) {
    assert.equal(byId.get(fate)?.expected_result, 'NULL', `${fate} must fail closed`)
    assert.ok(doc.includes('`' + fate + '`'), `doc missing ${fate}`)
  }
})
