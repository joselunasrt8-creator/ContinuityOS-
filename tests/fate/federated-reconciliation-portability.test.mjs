import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const spec = JSON.parse(readFileSync(new URL('../../governance/runtime/RECONCILIATION_VERIFICATION_SPEC.json', import.meta.url), 'utf8'))
const doc = readFileSync(new URL('../../docs/continuous-reconciliation-hardening.md', import.meta.url), 'utf8')
const reportSchema = JSON.parse(readFileSync(new URL('../../schemas/reconciliation/reconciliation-report.schema.json', import.meta.url), 'utf8'))
const envelopeSchema = JSON.parse(readFileSync(new URL('../../schemas/reconciliation/portable-reconciliation-envelope.schema.json', import.meta.url), 'utf8'))
const evidenceSchema = JSON.parse(readFileSync(new URL('../../schemas/reconciliation/federated-lineage-evidence.schema.json', import.meta.url), 'utf8'))

const expandedDrifts = [
  'foreign_ancestry_mismatch_drift',
  'scheduler_ordering_instability_drift',
  'reconciliation_report_drift',
  'portable_serialization_mismatch_drift',
  'federated_replay_discontinuity_drift',
  'deterministic_traversal_instability_drift',
  'reconciliation_payload_corruption_drift',
]


const identityHardeningFate = [
  'federated_identifier_resolution_drift',
  'federated_composite_lookup_identifier',
  'federated_missing_canonical_identifier',
  'non_deterministic_checkpoint_identity',
  'timestamp_dependent_checkpoint_identity',
]

const expandedFate = [
  'federated_lineage_divergence',
  'foreign_ancestry_mismatch',
  'scheduler_ordering_instability',
  'reconciliation_report_drift',
  'portable_serialization_mismatch',
  'federated_replay_discontinuity',
  'deterministic_traversal_instability_expanded',
  'reconciliation_payload_corruption',
]

function between(start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`)
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

const reconciliationSource = between('type ReconciliationRegistry', 'async function quarantineHistoricalProofDuplicates')

test('scheduler windows remain deterministic, bounded, read-only, and replay neutral', () => {
  assert.match(source, /const RECONCILIATION_SCHEDULER_BATCH_LIMIT = 25/)
  assert.match(reconciliationSource, /async function deterministicReconciliationSchedule/)
  assert.match(reconciliationSource, /proof_registry\.created_at ASC/)
  assert.match(reconciliationSource, /proof_registry\.decision_id ASC/)
  assert.match(reconciliationSource, /read_only: true/)
  assert.match(reconciliationSource, /replay_neutral: true/)
  assert.doesNotMatch(reconciliationSource, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bALTER\b|\.run\(|env\.DB\.batch/i)
  assert.equal(spec.continuous_reconciliation_architecture.scheduler_design.batching.batch_limit, 25)
})

test('reporting routes expose deterministic summary and drift payloads without authority', () => {
  assert.match(source, /url\.pathname === "\/reconcile\/report"/)
  assert.match(source, /url\.pathname === "\/reconcile\/drift"/)
  assert.match(reconciliationSource, /type ReconciliationSummaryObject/)
  assert.match(reconciliationSource, /reconciliation_id/)
  assert.match(reconciliationSource, /registry_integrity_summary/)
  assert.match(reconciliationSource, /portableReconciliationEnvelope/)
  assert.deepEqual(spec.reconciliation_reporting_layer.routes, ['/reconcile/schedule', '/reconcile/report', '/reconcile/drift'])
  assert.equal(spec.reconciliation_reporting_layer.mutation_policy, 'read_only_non_authoritative_fail_closed')
  for (const field of reportSchema.required) assert.ok(doc.includes('`' + field + '`'), `doc must cite report field ${field}`)
})

test('federated lineage verification is bounded and cannot inherit trust', () => {
  assert.match(reconciliationSource, /type FederatedLineageEvidence/)
  assert.match(reconciliationSource, /async function verifyFederatedLineageContinuity/)
  assert.match(reconciliationSource, /foreign_lineage_is_evidence_not_authority/)
  assert.match(reconciliationSource, /remote_replay_state_not_consumed/)
  assert.match(reconciliationSource, /bounded_federation_depth > RECONCILIATION_MAX_RECURSION_DEPTH/)
  assert.equal(spec.federated_integrity_model.canonical_federation_verification_semantics.foreign_lineage_handling, 'foreign lineage is bounded evidence and never inherited trust')
  assert.ok(doc.includes('Federated lineage verification treats remote evidence as bounded evidence, never inherited trust.'))
})

test('portability schemas preserve JCS, DSSE-compatible payloads, exact-object hashes, and content addressing', () => {
  assert.equal(envelopeSchema.properties.canonicalization.const, 'JCS')
  assert.equal(envelopeSchema.properties.dsse_payload_type.const, 'application/vnd.mindshift.reconciliation.v1+json')
  assert.ok(envelopeSchema.required.includes('content_addressed_lineage_hash'))
  assert.ok(envelopeSchema.required.includes('exact_object_hash'))
  assert.ok(evidenceSchema.required.includes('runtime_id'))
  assert.ok(evidenceSchema.required.includes('invocation_nonce'))
  assert.equal(spec.portability_layer.canonicalization, 'JCS')
  assert.match(reconciliationSource, /content_addressed_lineage_hash/)
})

test('expanded reconciliation FATE and drift taxonomy fail closed to NULL', () => {
  const fateById = new Map(spec.reconciliation_fate_matrix.map((entry) => [entry.test_id, entry]))
  for (const drift of expandedDrifts) {
    assert.ok(spec.drift_telemetry_expansion.classes.includes(drift), `spec missing ${drift}`)
    assert.match(source, new RegExp(`"${drift}"`), `runtime missing ${drift}`)
    assert.ok(doc.includes('`' + drift + '`'), `doc missing ${drift}`)
  }
  for (const fate of expandedFate) {
    assert.equal(fateById.get(fate)?.expected_result, 'NULL', `${fate} must fail closed`)
    assert.ok(doc.includes('`' + fate + '`'), `doc missing ${fate}`)
  }
})


test('portable reconciliation identity hardening preserves portability and exact-object boundaries', () => {
  assert.match(source, /function resolvedPortableIdentifiersFromCanonicalRows/)
  assert.match(source, /lookup_key is traversal-only evidence and MUST NEVER be emitted as canonical portable identity/)
  assert.match(source, /if \(!identifiers\) return null/)
  assert.equal(spec.portability_layer.portable_identifier_policy, 'portable identifiers must resolve from canonical persisted registry row fields only; lookup_key and composite traversal anchors are not portable identity material')
  assert.ok(doc.includes('Portable bundle identifiers must come from canonical persisted registry row fields only'))
  assert.ok(doc.includes('`lookup_key` and composite traversal anchors are not portable identity material'))
})

test('checkpoint portability identity is deterministic and timestamp independent', () => {
  assert.match(source, /const checkpoint_identity = \{ runtime_id, reconciliation_merkle_root, deterministic_hash, traversal_position, lineage_count, replay_snapshot_hash, drift_snapshot_hash \}/)
  assert.match(source, /created_at is observational metadata and MUST NEVER participate in checkpoint identity hashing/)
  assert.equal(spec.portability_layer.checkpoint_identity_policy, 'checkpoint_id hashes deterministic reconciliation state only; created_at is observational metadata excluded from identity')
  assert.ok(doc.includes('Checkpoint identity hashes deterministic reconciliation state only'))
})

test('portable identity hardening FATE cases remain fail-closed to NULL', () => {
  const fateById = new Map(spec.reconciliation_fate_matrix.map((entry) => [entry.test_id, entry]))
  for (const fate of identityHardeningFate) {
    assert.equal(fateById.get(fate)?.expected_result, 'NULL', `${fate} must fail closed`)
    assert.ok(doc.includes('`' + fate + '`'), `doc missing ${fate}`)
  }
})
