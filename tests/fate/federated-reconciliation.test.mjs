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
  'non_deterministic_reconciliation_order',
  'federated_identifier_resolution_drift',
  'federated_composite_lookup_identifier',
  'federated_missing_canonical_identifier',
  'non_deterministic_checkpoint_identity',
  'timestamp_dependent_checkpoint_identity'
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
  'federated_exact_object_drift',
  'federated_identifier_resolution_drift'
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

test('portable bundle identifiers resolve only from canonical persisted row identifiers', () => {
  const bundleStart = source.indexOf('async function portableLegitimacyBundleFromResult')
  const bundleEnd = source.indexOf('async function verifyFederatedProofEnvelope')
  assert.ok(bundleStart > -1 && bundleEnd > bundleStart)
  const bundleFunction = source.slice(bundleStart, bundleEnd)

  assert.match(source, /type CanonicalReconciliationIdentifiers/)
  assert.match(source, /function canonicalIdentifiersFromReconciliationRow/)
  assert.match(source, /function resolvedPortableIdentifiersFromCanonicalRows/)
  assert.match(source, /canonical_identifiers: row \? canonicalIdentifiersFromReconciliationRow\(registry, row\) : undefined/)
  assert.match(source, /lookup_key is traversal-only evidence and MUST NEVER be emitted as canonical portable identity/)
  assert.match(source, /if \(!identifiers\) return null/)
  assert.doesNotMatch(bundleFunction, /lookup_key/)
  assert.doesNotMatch(bundleFunction, /split\(":"\)/)
  assert.doesNotMatch(bundleFunction, /proof-observed|nonce-observed/)
  assert.ok(spec.federated_drift_taxonomy.includes('federated_identifier_resolution_drift'))
  assert.match(source, /async function federatedIdentifierResolutionDrift/)
  assert.match(source, /reconciliationDriftId\("federated_identifier_resolution_drift"/)
  assert.match(source, /federatedDriftClassificationsAfterPortableBundleResolution\(result, bundle\)/)
  assert.match(source, /reconciliationStatusAfterPortableBundleResolution\(result, bundle\)/)
  assert.ok(doc.includes('portable_identifier == canonical_persisted_identifier'))
})

test('identifier resolution FATE cases fail closed to NULL', () => {
  const fateById = new Map(spec.fate_matrix.map((entry) => [entry.test_id, entry.expected_result]))
  for (const fate of ['federated_composite_lookup_identifier', 'federated_missing_canonical_identifier']) {
    assert.equal(fateById.get(fate), 'NULL')
    assert.ok(doc.includes('`' + fate + '`'))
  }
})

test('checkpoint identity excludes created_at and uses deterministic reconciliation state only', () => {
  const checkpointStart = source.indexOf('async function deterministicReconciliationCheckpoint')
  const checkpointEnd = source.indexOf('function canonicalIdentifiersForRegistry')
  assert.ok(checkpointStart > -1 && checkpointEnd > checkpointStart)
  const checkpointFunction = source.slice(checkpointStart, checkpointEnd)
  const identityMatch = checkpointFunction.match(/const checkpoint_identity = \{([^}]+)\}/)
  assert.ok(identityMatch, 'checkpoint identity object missing')
  const identityFields = identityMatch[1]

  for (const field of ['runtime_id', 'reconciliation_merkle_root', 'deterministic_hash', 'traversal_position', 'lineage_count', 'replay_snapshot_hash', 'drift_snapshot_hash']) {
    assert.match(identityFields, new RegExp(`\\b${field}\\b`), `checkpoint identity missing ${field}`)
  }
  assert.doesNotMatch(identityFields, /created_at/)
  assert.match(checkpointFunction, /created_at is observational metadata and MUST NEVER participate in checkpoint identity hashing/)
  assert.match(doc, /`created_at` is observational metadata only/)
})

test('checkpoint determinism FATE cases fail closed to NULL', () => {
  const fateById = new Map(spec.fate_matrix.map((entry) => [entry.test_id, entry.expected_result]))
  for (const fate of ['non_deterministic_checkpoint_identity', 'timestamp_dependent_checkpoint_identity']) {
    assert.equal(fateById.get(fate), 'NULL')
    assert.ok(doc.includes('`' + fate + '`'))
  }
})

test('federated revocation evidence is observability-only, exact-object-bound, and replay neutral', () => {
  const revocationSchema = JSON.parse(readFileSync(new URL('../../schemas/federation/federated-revocation-evidence.schema.json', import.meta.url), 'utf8'))
  for (const field of spec.federated_revocation_evidence.required_fields) {
    assert.ok(revocationSchema.required.includes(field), `revocation schema missing ${field}`)
    assert.ok(doc.includes('`' + field + '`'), `revocation doc missing ${field}`)
  }
  assert.equal(spec.federated_revocation_evidence.replay_neutral, true)
  assert.equal(spec.federated_revocation_evidence.read_only, true)
  assert.equal(spec.federated_revocation_evidence.mutation_capable, false)
  assert.equal(spec.federated_revocation_evidence.exact_object_bound, true)
  assert.match(source, /type FederatedRevocationEvidence = \{[\s\S]*runtime_id: string[\s\S]*remote_runtime_id: string[\s\S]*observed_at: string[\s\S]*\}/)
  assert.match(source, /portable_evidence_not_portable_authority/)
  assert.match(source, /remote_authority_inherited: false/)
  assert.match(source, /remote_execution_legitimacy: false/)
  assert.match(source, /replay_state_consumed: false/)
  assert.match(source, /replay_neutral: true/)
  assert.doesNotMatch(source, /remote.*revoke.*local.*authority/)
})

test('federated revocation registry and drift/FATE extensions fail closed', () => {
  const registryFields = ['revocation_id','runtime_id','remote_runtime_id','continuity_id','decision_id','validated_object_hash','revocation_class','lineage_hash','reconciliation_merkle_root','evidence_hash','verification_status','drift_class','created_at']
  for (const field of registryFields) {
    assert.ok(spec.federated_revocation_registry.columns.includes(field), `registry missing ${field}`)
    assert.match(source, new RegExp(field), `source missing ${field}`)
    assert.ok(doc.includes('`' + field + '`'), `doc missing ${field}`)
  }
  const revocationDrifts = ['federated_revocation_divergence_drift','federated_revocation_projection_drift','federated_revocation_exact_object_drift','federated_revocation_anchor_drift','federated_revocation_replay_drift','federated_checkpoint_revocation_drift','federated_expiration_visibility_drift']
  for (const drift of revocationDrifts) {
    assert.ok(spec.federated_drift_taxonomy.includes(drift), `spec missing ${drift}`)
    assert.match(source, new RegExp(`"${drift}"`), `source missing ${drift}`)
    assert.ok(doc.includes('`' + drift + '`'), `doc missing ${drift}`)
  }
  const fateById = new Map(spec.fate_matrix.map((entry) => [entry.test_id, entry.expected_result]))
  for (const fate of ['federated_revocation_identity_mismatch','federated_revocation_replay_collision','federated_revocation_without_lineage','federated_remote_revocation_authority_inference','federated_checkpoint_revocation_divergence','federated_expired_lineage_visibility_corruption','federated_revocation_exact_object_drift','federated_revocation_anchor_drift']) {
    assert.equal(fateById.get(fate), 'NULL', `${fate} must fail closed`)
    assert.ok(doc.includes('`' + fate + '`'), `doc missing ${fate}`)
  }
})

test('federated revocation reconciliation follows normalized flow and deterministic checkpoint identity', () => {
  assert.match(source, /async function normalizedFederatedReconciliationResponse/)
  assert.match(source, /deterministic traversal -> revocation evidence resolution -> drift augmentation -> normalized federation response/)
  assert.match(source, /federatedRevocationEvidenceFromResult/)
  assert.match(source, /revocationAwareFederatedDriftAugmentation/)
  assert.match(source, /federated_revocation_checkpoint/)
  assert.match(source, /async function deterministicRevocationEvidenceHash/)
  assert.match(source, /created_at is observational metadata and MUST NEVER participate in checkpoint identity hashing/)
  assert.deepEqual(spec.revocation_reconciliation_flow, ['deterministic traversal','revocation evidence resolution','drift augmentation','normalized federation response'])
})

test('revocation evidence identity excludes timestamps and validates exact object envelopes', () => {
  const identityStart = source.indexOf('function canonicalRevocationEvidenceIdentity')
  const identityEnd = source.indexOf('async function deterministicRevocationEvidenceHash')
  assert.ok(identityStart > -1 && identityEnd > identityStart)
  const identityFunction = source.slice(identityStart, identityEnd)
  assert.match(identityFunction, /observed_at is append-only observational metadata and MUST NEVER participate in revocation evidence identity/)
  assert.doesNotMatch(identityFunction, /observed_at:/)
  assert.match(source, /async function exactRevocationEvidenceObjectHash/)
  assert.match(source, /canonical_hash_locked: true/)
  assert.match(source, /supplied vs recomputed envelope verification preserves exact-object revocation envelope validation/)
  assert.match(source, /String\(envelope\.evidence_hash \|\| ""\) !== recomputed_evidence_hash/)
  assert.match(source, /String\(envelope\.exact_object_hash \|\| ""\) !== recomputed_exact_object_hash/)
  assert.match(source, /String\(envelope\.envelope_hash \|\| ""\) !== recomputed_envelope_hash/)
  assert.equal(spec.federated_revocation_evidence.identity_policy, 'revocation evidence identity hashes canonical lineage fields only; observed_at, emitted_at, and created_at are metadata excluded from deterministic identity')
})

test('revocation anchors derive from canonical lineage only and never lookup selectors', () => {
  const anchorStart = source.indexOf('function canonicalRevocationAnchorFromCanonicalRows')
  const anchorEnd = source.indexOf('async function canonicalRevocationAnchorHash')
  assert.ok(anchorStart > -1 && anchorEnd > anchorStart)
  const anchorFunction = source.slice(anchorStart, anchorEnd)
  assert.match(anchorFunction, /canonical_identifiers/)
  assert.match(anchorFunction, /canonical_identity/)
  assert.match(anchorFunction, /canonicalIdentifiersForRegistry/)
  assert.match(anchorFunction, /Canonical revocation anchors derive only from persisted registry row identifiers/)
  assert.doesNotMatch(anchorFunction, /lookup_key:/)
  assert.doesNotMatch(anchorFunction, /split\(":"\)/)
  assert.match(source, /federated_revocation_anchor_drift/)
  assert.match(source, /federated_revocation_exact_object_drift/)
  assert.equal(spec.federated_revocation_evidence.canonical_anchor_policy, 'revocation anchors derive only from canonical persisted registry row identifiers; lookup_key and composite traversal selectors are never identity material')
})
