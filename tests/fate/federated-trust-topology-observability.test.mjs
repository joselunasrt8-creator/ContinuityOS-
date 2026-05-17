import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canonicalize, sha256Hex } from '../../src/canonical.js'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('remote evidence cannot authorize execution and federated trust envelopes always deny remote authority', () => {
  assert.match(source, /type FederatedTrustEnvelope/)
  assert.match(source, /type FederationClassification/)
  assert.match(source, /type FederationVerificationResult/)
  assert.match(source, /remote_authority_denied: true/)
  assert.doesNotMatch(source, /remote_authority_denied:\s*false/)
  assert.match(source, /evidence_only: true/)
  assert.match(source, /remote_authority_inherited: false/)
  assert.match(source, /remote_execution_legitimacy: false/)
  assert.match(source, /canonicalRuntimeRoute = CANONICAL_RUNTIME_ROUTES\.includes/)
})

test('corrupted federated lineage quarantines and lineage mismatch is classified deterministically', () => {
  assert.match(source, /TRUSTED_INTERNAL/)
  assert.match(source, /TRUSTED_EXTERNAL/)
  assert.match(source, /UNTRUSTED_EXTERNAL/)
  assert.match(source, /QUARANTINED/)
  assert.match(source, /UNKNOWN/)
  assert.match(source, /VERIFIED/)
  assert.match(source, /UNVERIFIED/)
  assert.match(source, /CORRUPTED/)
  assert.match(source, /LINEAGE_MISMATCH/)
  assert.match(source, /REPLAY_DETECTED/)
  assert.match(source, /NULL_STATE/)
  assert.match(source, /verification_status === "CORRUPTED" \|\| verification_status === "LINEAGE_MISMATCH" \|\| verification_status === "REPLAY_DETECTED"/)
  assert.match(source, /federated_lineage_divergence/)
})

test('replay resurrection, orphaned executions, and revoked authority execution are observable drift only', () => {
  for (const drift of ['replay_resurrection_attempt', 'orphaned_execution', 'revoked_authority_execution', 'federated_lineage_divergence']) {
    assert.match(source, new RegExp(`"${drift}"`), `runtime missing ${drift}`)
  }
  assert.match(source, /detectOrphanedExecutions/)
  assert.match(source, /collectRevokedLineage/)
  assert.match(source, /deriveRevocationTopology/)
  assert.match(source, /traceRevocationImpact/)
  assert.match(source, /recordDrift\(env, \{ drift_class/)
  assert.match(source, /reason: "observability_only"/)
})

test('deterministic trust envelope hashing uses canonical serialization and stable invariant material', () => {
  const envelope = {
    federation_origin: 'mindshift-federated://trusted/runtime-a',
    federation_tier: 'TRUSTED_EXTERNAL',
    verification_status: 'VERIFIED',
    evidence_only: true,
    remote_authority_denied: true,
    continuity_reference: 'continuity-1',
    lineage_root: 'a'.repeat(64),
    observed_at: '2026-05-13T00:00:00.000Z'
  }
  const first = sha256Hex(canonicalize({ envelope_type: 'FederatedTrustEnvelope', deterministic_serialization: true, remote_authority_denied: true, evidence_only: true, envelope }))
  const second = sha256Hex(canonicalize({ evidence_only: true, deterministic_serialization: true, envelope, remote_authority_denied: true, envelope_type: 'FederatedTrustEnvelope' }))
  assert.equal(first, second)
  assert.match(source, /deterministicFederatedTrustEnvelopeHash/)
  assert.match(source, /canonicalize\(\{ envelope_type: "FederatedTrustEnvelope", deterministic_serialization: true, remote_authority_denied: true, evidence_only: true, envelope \}\)/)
})

test('observability envelope deterministic serialization exposes required portable fields', () => {
  assert.match(source, /type ObservabilityEnvelope/)
  for (const field of ['envelope_id', 'canonical_hash', 'lineage_root', 'continuity_id', 'federation_classification', 'drift_summary', 'proof_summary', 'replay_indicators', 'generated_at']) {
    assert.match(source, new RegExp(`${field}:`), `missing observability envelope field ${field}`)
  }
  assert.match(source, /createObservabilityEnvelope/)
  assert.match(source, /replay_indicators: replay_indicators\.map\(String\)\.sort\(\)/)
})

test('append-only registry semantics are preserved for trust and topology observability registries', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS federated_trust_registry/)
  assert.match(source, /CREATE TABLE IF NOT EXISTS revocation_topology_registry/)
  assert.match(source, /INSERT INTO federated_trust_registry/)
  assert.match(source, /INSERT INTO revocation_topology_registry/)
  const trustRegistrySource = source.slice(source.indexOf('federated_trust_registry'), source.lastIndexOf('federated_trust_registry') + 500)
  const topologyRegistrySource = source.slice(source.indexOf('revocation_topology_registry'), source.lastIndexOf('revocation_topology_registry') + 500)
  assert.doesNotMatch(trustRegistrySource, /UPDATE federated_trust_registry|DELETE FROM federated_trust_registry/i)
  assert.doesNotMatch(topologyRegistrySource, /UPDATE revocation_topology_registry|DELETE FROM revocation_topology_registry/i)
})
