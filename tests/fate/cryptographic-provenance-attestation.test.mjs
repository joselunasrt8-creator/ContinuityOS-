import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { canonicalize } from '../../src/canonical.js'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0015_cryptographic_provenance_attestations.sql', import.meta.url), 'utf8')
const spec = JSON.parse(readFileSync(new URL('../../governance/runtime/CRYPTOGRAPHIC_PROVENANCE_SPEC.json', import.meta.url), 'utf8'))
const doc = readFileSync(new URL('../../docs/cryptographic-provenance-hardening.md', import.meta.url), 'utf8')
const fixtureRoot = new URL('../fixtures/provenance/', import.meta.url)
const validPayload = JSON.parse(readFileSync(new URL('valid-provenance-payload.json', fixtureRoot), 'utf8'))
const validEnvelope = JSON.parse(readFileSync(new URL('valid-dsse-envelope.json', fixtureRoot), 'utf8'))
const apiKeySignedEnvelope = JSON.parse(readFileSync(new URL('api-key-signed-dsse-envelope.json', fixtureRoot), 'utf8'))
const mutatedPayloadEnvelope = JSON.parse(readFileSync(new URL('mutated-payload-dsse-envelope.json', fixtureRoot), 'utf8'))
const provenanceFixtureSecret = 'fixture-provenance-secret'
const requestApiKey = 'test-key'

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

function dsseLengthPrefixed(bytes) {
  return Buffer.concat([Buffer.from(String(bytes.length)), Buffer.from(' '), bytes])
}

function dssePreAuthenticationEncoding(payloadType, payloadBytes) {
  return Buffer.concat([Buffer.from('DSSEv1 '), dsseLengthPrefixed(Buffer.from(payloadType)), dsseLengthPrefixed(payloadBytes)])
}

function envelopeSignature(envelope) {
  return String(envelope.signatures?.[0]?.sig || '')
}

function hmacForEnvelope(secret, envelope) {
  const payloadBytes = Buffer.from(String(envelope.payload || ''), 'base64')
  return createHmac('sha256', secret).update(dssePreAuthenticationEncoding(envelope.payloadType, payloadBytes)).digest('base64')
}

function fixtureVerifiesWith(secret, envelope) {
  return Boolean(secret) && envelopeSignature(envelope) === hmacForEnvelope(secret, envelope)
}

function sourceFiles(dirUrl) {
  return readdirSync(dirUrl, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl)
    if (entry.isDirectory()) return sourceFiles(entryUrl)
    return statSync(entryUrl).isFile() && /\.(?:ts|js)$/.test(entry.name) ? [entryUrl] : []
  })
}

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

test('fixture DSSE envelope verifies only with PROVENANCE_HMAC_SECRET material', () => {
  assert.equal(Buffer.from(validEnvelope.payload, 'base64').toString('utf8'), canonicalize(validPayload))
  assert.equal(fixtureVerifiesWith(provenanceFixtureSecret, validEnvelope), true)
  assert.equal(fixtureVerifiesWith(requestApiKey, validEnvelope), false)
  assert.equal(fixtureVerifiesWith(provenanceFixtureSecret, apiKeySignedEnvelope), false)
  assert.equal(fixtureVerifiesWith(requestApiKey, apiKeySignedEnvelope), true)
  assert.equal(fixtureVerifiesWith('', validEnvelope), false)
})

test('fixture payload mutation after signing fails DSSE verification', () => {
  assert.notEqual(Buffer.from(mutatedPayloadEnvelope.payload, 'base64').toString('utf8'), canonicalize(validPayload))
  assert.equal(envelopeSignature(mutatedPayloadEnvelope), envelopeSignature(validEnvelope))
  assert.equal(fixtureVerifiesWith(provenanceFixtureSecret, mutatedPayloadEnvelope), false)
})

test('no source path contains PROVENANCE_HMAC_SECRET API_KEY fallback expression', () => {
  for (const path of sourceFiles(new URL('../../src/', import.meta.url))) {
    const text = readFileSync(path, 'utf8')
    assert.doesNotMatch(text, /PROVENANCE_HMAC_SECRET\s*\|\|\s*env\.API_KEY/)
    assert.doesNotMatch(text, /env\.PROVENANCE_HMAC_SECRET\s*\|\|\s*env\.API_KEY/)
  }
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
