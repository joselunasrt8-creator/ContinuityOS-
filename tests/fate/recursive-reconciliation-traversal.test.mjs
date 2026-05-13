import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const doc = readFileSync(new URL('../../docs/recursive-reconciliation-traversal.md', import.meta.url), 'utf8')

const requiredOrder = [
  'session_registry',
  'continuity_registry',
  'authority_registry',
  'aeo_registry',
  'validation_registry',
  'execution_registry',
  'proof_registry',
  'invocation_registry',
  'preo_registry',
]

const requiredDrifts = [
  'orphan_legitimacy_object_drift',
  'recursive_ancestry_drift',
  'replay_chain_drift',
  'proof_lineage_drift',
  'duplicate_lineage_hash_drift',
  'preo_ancestry_drift',
  'revocation_propagation_drift',
  'traversal_instability_drift',
]

function between(start, end) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex)
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`)
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

const traversalSource = between('type ReconciliationRegistry', 'async function quarantineHistoricalProofDuplicates')

test('recursive reconciliation traversal preserves canonical registry ordering', () => {
  const orderBlock = source.match(/const CANONICAL_RECONCILIATION_REGISTRY_ORDER = \[[\s\S]*?\] as const/)?.[0] ?? ''
  let lastIndex = -1
  for (const registry of requiredOrder) {
    const nextIndex = orderBlock.indexOf(`"${registry}"`)
    assert.ok(nextIndex > lastIndex, `${registry} must appear in canonical order`)
    assert.ok(doc.includes(`\`${registry}\``), `${registry} must be documented`)
    lastIndex = nextIndex
  }
})

test('traversal substrate is read-only and replay-neutral', () => {
  assert.match(traversalSource, /async function deterministicRecursiveReconciliationTraversal/)
  assert.doesNotMatch(traversalSource, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bALTER\b|\.run\(|env\.DB\.batch/i)
  assert.doesNotMatch(traversalSource, /cascadeRevocation|cascadeExpiration|invalidateContinuityLineage|emitTelemetry|recordDrift/)
  assert.match(doc, /performs deterministic `SELECT` reads only/i)
  assert.match(doc, /never creates legitimacy/i)
})

test('traversal is bounded and fail-closed', () => {
  assert.match(source, /const RECONCILIATION_MAX_RECURSION_DEPTH = SYSTEM_MAX_CONTINUITY_DEPTH/)
  assert.match(source, /if \(trace\.length >= RECONCILIATION_MAX_RECURSION_DEPTH\) return reconciliationInvalid\("traversal_instability_drift"/)
  assert.match(source, /if \(depth > RECONCILIATION_MAX_RECURSION_DEPTH\) return "traversal_instability_drift"/)
  assert.match(source, /if \(rows\.length === 0\) return reconciliationInvalid\("orphan_legitimacy_object_drift"/)
  assert.match(source, /if \(rows\.length > 1\) return reconciliationInvalid\("traversal_instability_drift"/)
})

test('reconciliation result objects expose trace, anchor, drift, recursion depth, and status classes', () => {
  for (const resultClass of ['VALID_RECONCILIATION', 'INVALID_RECONCILIATION', 'NULL']) {
    assert.match(traversalSource, new RegExp(`"${resultClass}"`), `missing result class ${resultClass}`)
    assert.ok(doc.includes(`\`${resultClass}\``), `${resultClass} must be documented`)
  }
  for (const field of ['deterministic_traversal_trace', 'lineage_anchor', 'drift_classifications', 'recursion_depth', 'canonical_registry_ordering']) {
    assert.match(traversalSource, new RegExp(field), `missing result field ${field}`)
    assert.ok(doc.includes(`\`${field}\``), `${field} must be documented`)
  }
})

test('recursive integrity verification covers ancestry, replay, proof, PREO, revocation, duplicate hash, and instability drift', () => {
  for (const drift of requiredDrifts) {
    assert.match(traversalSource, new RegExp(`"${drift}"`), `traversal must classify ${drift}`)
    assert.ok(doc.includes(`\`${drift}\``), `${drift} must be documented`)
  }
  assert.match(traversalSource, /verifyContinuityAncestryReadOnly/)
  assert.match(traversalSource, /continuityHash\(canonical\)/)
  assert.match(traversalSource, /SELECT continuity_id FROM continuity_registry WHERE continuity_hash=\?1/)
  assert.match(traversalSource, /String\(row\.invocation_nonce \|\| ""\) !== String\(context\.validation\.invocation_nonce \|\| ""\)/)
  assert.match(traversalSource, /JSON\.parse\(String\(row\.authority_lineage/)
  assert.match(traversalSource, /String\(row\.reviewed_hash \|\| ""\) !== String\(context\.aeo\.validated_object_hash \|\| ""\)/)
})

test('recursive revocation lineage observability is deterministic and replay-neutral', () => {
  assert.match(traversalSource, /federatedRevocationEvidenceFromResult/)
  assert.match(traversalSource, /resolveCanonicalPortableIdentifiers\(result\)/)
  assert.match(traversalSource, /validated_object_hash: object_hash/)
  assert.match(traversalSource, /revocation_snapshot_hash/)
  assert.match(traversalSource, /replay_neutral: true/)
  assert.match(traversalSource, /remote_authority_inherited: false/)
  assert.match(traversalSource, /replay_state_consumed: false/)
  assert.doesNotMatch(source, /remote.*revoke.*local.*authority/)
  for (const drift of ['federated_revocation_divergence_drift', 'federated_revocation_replay_drift', 'federated_expiration_visibility_drift', 'federated_revocation_exact_object_drift', 'federated_revocation_anchor_drift']) {
    assert.match(traversalSource, new RegExp(`"${drift}"`), `traversal source missing ${drift}`)
    assert.ok(doc.includes('`' + drift + '`'), `doc missing ${drift}`)
  }
})

test('canonical identifier extraction is row-payload-only and preserves traversal determinism', () => {
  assert.match(traversalSource, /type CanonicalReconciliationIdentifiers/)
  assert.match(traversalSource, /canonical_identifiers\?: CanonicalReconciliationIdentifiers/)
  assert.match(traversalSource, /canonical_identifiers: row \? canonicalIdentifiersFromReconciliationRow\(registry, row\) : undefined/)
  assert.match(traversalSource, /function canonicalIdentifiersFromReconciliationRow/)
  assert.doesNotMatch(traversalSource, /canonical_identifiers: .*lookup_key/)
  assert.ok(doc.includes('`canonical_identifiers`'))
  assert.ok(doc.includes('do not alter traversal ordering'))
})
