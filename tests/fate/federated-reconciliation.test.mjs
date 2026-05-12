import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const spec = JSON.parse(readFileSync(new URL('../../governance/runtime/FEDERATED_RECONCILIATION_SPEC.json', import.meta.url), 'utf8'))
const bundleSchema = JSON.parse(readFileSync(new URL('../../schemas/federation/portable-legitimacy-bundle.schema.json', import.meta.url), 'utf8'))
const envelopeSchema = JSON.parse(readFileSync(new URL('../../schemas/federation/federated-proof-envelope.schema.json', import.meta.url), 'utf8'))
const checkpointSchema = JSON.parse(readFileSync(new URL('../../schemas/federation/reconciliation-checkpoint.schema.json', import.meta.url), 'utf8'))
const doc = readFileSync(new URL('../../docs/federated-legitimacy-reconciliation.md', import.meta.url), 'utf8')

const fateCases = [
  'federated_merkle_mismatch',
  'federated_checkpoint_divergence',
  'federated_replay_collision',
  'federated_exact_object_divergence',
  'federated_attestation_replay',
  'federated_runtime_identity_drift',
  'federated_preo_divergence',
  'federated_continuity_divergence',
  'federated_bundle_payload_drift',
  'remote_authority_inference',
  'remote_execution_legitimacy_inference',
  'non_deterministic_reconciliation_order'
]

const driftClasses = [
  'federated_checkpoint_drift',
  'federated_merkle_drift',
  'federated_bundle_drift',
  'federated_attestation_drift',
  'federated_reconciliation_drift',
  'federated_runtime_divergence_drift',
  'federated_replay_drift',
  'federated_preo_drift',
  'federated_continuity_drift',
  'federated_exact_object_drift'
]

test('federation routes are observability-only and outside execution authority', () => {
  for (const route of ['/federation/reconcile', '/federation/reconcile/report', '/federation/reconcile/drift', '/federation/reconcile/checkpoint']) {
    assert.match(source, new RegExp(`url\\.pathname === "${route.replaceAll('/', '\\/')}" && request\\.method === "GET"`))
    assert.ok(spec.required_routes.includes(`GET ${route}`))
  }
  assert.deepEqual(spec.canonical_runtime_position.execution_path, ['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof'])
  assert.equal(spec.route_semantics.read_only, true)
  assert.equal(spec.route_semantics.creates_authority, false)
  assert.equal(spec.route_semantics.consumes_replay_state, false)
  assert.match(source, /remote_execution_legitimacy: false/)
  assert.match(source, /replay_neutral: true/)
})

test('portable legitimacy bundle schema is exact-object-bound and complete', () => {
  for (const field of spec.portable_legitimacy_bundle.required_fields) {
    assert.ok(bundleSchema.required.includes(field), `schema missing ${field}`)
    assert.ok(doc.includes('`' + field + '`'), `doc missing ${field}`)
  }
  assert.equal(bundleSchema.properties.federation_boundary.const, 'portable_evidence_not_portable_authority')
  assert.equal(spec.portable_legitimacy_bundle.replay_neutral, true)
  assert.equal(spec.portable_legitimacy_bundle.exact_object_bound, true)
  assert.equal(envelopeSchema.properties.payloadType.const, 'application/vnd.mindshift.federated-reconciliation.v1+json')
})

test('runtime classifications preserve bounded trust semantics', () => {
  for (const classification of ['LOCAL_RUNTIME', 'FEDERATED_RUNTIME', 'EXTERNAL_REFERENCE', 'UNTRUSTED_RUNTIME', 'PORTABLE_EVIDENCE_ONLY']) {
    assert.ok(spec.remote_runtime_classification.includes(classification))
    assert.match(source, new RegExp(`"${classification}"`))
    assert.ok(doc.includes('`' + classification + '`'))
  }
  assert.match(source, /function classifyRemoteRuntime/)
  assert.match(source, /remote_evidence_can_narrow_acceptance_only/)
  assert.equal(spec.bounded_federation_trust_semantics.remote_evidence_can_grant_legitimacy, false)
})

test('federated verification fails closed without remote authority inheritance', () => {
  assert.match(source, /async function verifyFederatedLegitimacyBundle/)
  assert.match(source, /canonicalize\(payload\) !== canonicalize\(bundle\)/)
  assert.match(source, /verifyFederatedProofEnvelope/)
  assert.match(source, /federated_exact_object_drift/)
  assert.match(source, /federated_replay_drift/)
  assert.match(source, /remote_authority_inherited: false/)
  assert.match(source, /remote_execution_legitimacy: false/)
  assert.match(source, /replay_state_consumed: false/)
  for (const forbidden of spec.forbidden_semantics) assert.ok(doc.includes(forbidden) || source.includes(forbidden))
})

test('reconciliation merkle layer and checkpoint are deterministic', () => {
  assert.deepEqual(spec.reconciliation_merkle_layer.layers, ['session', 'continuity', 'authority', 'AEO', 'validation', 'execution', 'proof', 'attestation', 'PREO'])
  assert.match(source, /const RECONCILIATION_MERKLE_LAYERS/)
  assert.match(source, /async function reconciliationMerkleEvidence/)
  assert.match(source, /async function deterministicReconciliationCheckpoint/)
  for (const field of checkpointSchema.required) assert.ok(source.includes(field), `runtime missing checkpoint field ${field}`)
  assert.equal(spec.checkpoint.append_only, true)
  assert.equal(spec.checkpoint.rollback_overwrite, false)
})

test('federated drift taxonomy and FATE cases fail closed to NULL', () => {
  const fateById = new Map(spec.fate_matrix.map((entry) => [entry.test_id, entry.expected_result]))
  for (const drift of driftClasses) {
    assert.ok(spec.federated_drift_taxonomy.includes(drift))
    assert.match(source, new RegExp(`"${drift}"`))
    assert.ok(doc.includes('`' + drift + '`'))
  }
  for (const fate of fateCases) {
    assert.equal(fateById.get(fate), 'NULL')
    assert.ok(doc.includes('`' + fate + '`'))
  }
})
