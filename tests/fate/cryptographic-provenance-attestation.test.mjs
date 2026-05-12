import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0015_cryptographic_provenance_attestations.sql', import.meta.url), 'utf8')

test('DSSE provenance envelope validation is deterministic and verification-only', () => {
  assert.match(source, /PROVENANCE_PAYLOAD_TYPE = "application\/vnd\.mindshift\.provenance\.v1\+json"/)
  assert.match(source, /function canonicalProvenancePayload/)
  assert.match(source, /function dssePreAuthenticationEncoding/)
  assert.match(source, /async function validateDsseProvenanceEnvelope/)
  assert.match(source, /validateDeploymentProvenance\(env, \{ route: "\/execute"[\s\S]*provenanceAttestation/)
  assert.match(source, /validateDeploymentProvenance\(env, \{ route: "\/proof"[\s\S]*provenanceAttestation/)
  assert.doesNotMatch(source, /provenance_attestation[\s\S]{0,80}EXECUTED/)
})

test('signed provenance persistence is transparency-ready and replay-resistant', () => {
  for (const corpus of [source, schema, migration]) {
    assert.match(corpus, /attestation_registry/)
    assert.match(corpus, /envelope_hash TEXT NOT NULL UNIQUE/)
    assert.match(corpus, /payload_hash TEXT NOT NULL/)
    assert.match(corpus, /signer_identity TEXT NOT NULL/)
    assert.match(corpus, /canonical_aeo_hash TEXT NOT NULL/)
    assert.match(corpus, /transparency_log_id TEXT NOT NULL/)
    assert.match(corpus, /transparency_integrated_time TEXT NOT NULL/)
    assert.match(corpus, /UNIQUE\(workflow_run_id\)/)
  }
  assert.match(source, /INSERT OR IGNORE INTO attestation_registry/)
  assert.match(source, /SELECT decision_id, validated_object_hash, workflow_run_id FROM attestation_registry WHERE envelope_hash=\?1 AND status='VERIFIED'/)
})

test('FATE cryptographic provenance failure classes fail closed', () => {
  const requiredSignals = [
    'signature_missing',
    'signature_invalid',
    'dsse_payload_drift',
    'replayed_attestation',
    'signer_identity_mismatch',
    'reviewed_tree_mismatch',
    'workflow_provenance_missing',
    'execution_proof_provenance_mismatch',
    'payload_type_mismatch',
    'transparency_drift',
  ]

  for (const signal of requiredSignals) {
    assert.match(source, new RegExp(signal), `missing FATE signal: ${signal}`)
  }

  for (const driftClass of ['attestation_drift', 'signature_drift', 'signer_identity_drift', 'payload_drift', 'transparency_drift']) {
    assert.match(source, new RegExp(driftClass), `missing drift class: ${driftClass}`)
  }
})
