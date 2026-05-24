import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  CANONICAL_DRIFT,
  CANONICAL_AUTHORITY_INVENTORY,
  detectDuplicateSerializationSurfaces,
  validateSerializationParity,
  verifyCanonicalEquivalence,
  enforceHashAuthority,
  auditReconciliationSerializationEquivalence,
  validateTopologyCheckpointEquivalence,
  validateReplayParity,
  verifyProofEquivalence,
  verifyFederationEquivalence,
  lookupCanonicalAuthority,
  verifyAuthorityInventoryConformance,
} from '../../src/canonical-authority.js'

import { hashCanonical, canonicalize } from '../../src/canonical.js'

// ── Canonical Drift Taxonomy ───────────────────────────────────────────────

test('canonical drift taxonomy is complete and frozen', () => {
  assert.ok(Object.isFrozen(CANONICAL_DRIFT))
  assert.equal(typeof CANONICAL_DRIFT.SERIALIZATION_DIVERGENCE, 'string')
  assert.equal(typeof CANONICAL_DRIFT.HASH_SURFACE_DUPLICATION, 'string')
  assert.equal(typeof CANONICAL_DRIFT.REPLAY_UNSAFE_SERIALIZATION, 'string')
  assert.equal(typeof CANONICAL_DRIFT.TOPOLOGY_CHECKPOINT_MISMATCH, 'string')
  assert.equal(typeof CANONICAL_DRIFT.RECONCILIATION_PARITY_FAILURE, 'string')
  assert.equal(typeof CANONICAL_DRIFT.FOREIGN_HASH_AUTHORITY, 'string')
  assert.equal(typeof CANONICAL_DRIFT.PROOF_EQUIVALENCE_DRIFT, 'string')
  assert.equal(typeof CANONICAL_DRIFT.FEDERATION_EQUIVALENCE_COLLAPSE, 'string')
  assert.equal(typeof CANONICAL_DRIFT.MUTATION_AFTER_VALIDATION, 'string')
  assert.equal(typeof CANONICAL_DRIFT.CANONICAL_FORM_WIDENING, 'string')
})

// ── Authority Inventory ────────────────────────────────────────────────────

test('canonical authority inventory is frozen and non-empty', () => {
  assert.ok(Object.isFrozen(CANONICAL_AUTHORITY_INVENTORY))
  assert.ok(CANONICAL_AUTHORITY_INVENTORY.length > 0)
})

test('exactly one module carries canonical authority', () => {
  const authorities = CANONICAL_AUTHORITY_INVENTORY.filter((e) => e.authority)
  assert.equal(authorities.length, 1)
  assert.equal(authorities[0].module, 'src/canonical.js')
})

test('all non-authority modules delegate to src/canonical.js', () => {
  for (const entry of CANONICAL_AUTHORITY_INVENTORY) {
    if (!entry.authority) {
      assert.equal(entry.delegates_to, 'src/canonical.js', `${entry.module} must delegate to src/canonical.js`)
    }
  }
})

test('authority inventory conformance check passes', () => {
  const result = verifyAuthorityInventoryConformance()
  assert.equal(result.conformant, true)
  assert.equal(result.status, 'VALID')
  assert.equal(result.authority_module, 'src/canonical.js')
  assert.equal(result.fail_closed, false)
})

test('lookupCanonicalAuthority returns correct entry for known module', () => {
  const entry = lookupCanonicalAuthority('src/canonical.js')
  assert.ok(entry)
  assert.equal(entry.authority, true)
})

test('lookupCanonicalAuthority returns null for unknown module', () => {
  assert.equal(lookupCanonicalAuthority('runtime/unknown-engine.mjs'), null)
})

// ── Duplicate Serialization Surface Detection ──────────────────────────────

test('duplicate serialization surface detection finds identical surfaces', () => {
  const surface = { route: '/execute', method: 'POST', classification: 'EXECUTION_CAPABLE' }
  const result = detectDuplicateSerializationSurfaces([surface, surface])
  assert.equal(result.status, 'NULL')
  assert.equal(result.fail_closed, true)
  assert.equal(result.drift_class, CANONICAL_DRIFT.HASH_SURFACE_DUPLICATION)
  assert.equal(result.duplicates.length, 1)
})

test('duplicate detection passes for distinct surfaces', () => {
  const a = { route: '/compile', method: 'POST' }
  const b = { route: '/execute', method: 'POST' }
  const result = detectDuplicateSerializationSurfaces([a, b])
  assert.equal(result.status, 'VALID')
  assert.equal(result.fail_closed, false)
  assert.equal(result.duplicates.length, 0)
})

test('duplicate detection fails closed on non-array input', () => {
  const result = detectDuplicateSerializationSurfaces(null)
  assert.equal(result.status, 'NULL')
  assert.equal(result.fail_closed, true)
})

test('duplicate detection is replay-safe', () => {
  const surfaces = [{ a: 1 }, { b: 2 }]
  const r1 = detectDuplicateSerializationSurfaces(surfaces)
  const r2 = detectDuplicateSerializationSurfaces(surfaces)
  assert.equal(r1.status, r2.status)
})

// ── Serialization Parity Validation ───────────────────────────────────────

test('serialization parity validates equivalent objects regardless of key order', () => {
  const result = validateSerializationParity({ b: 2, a: 1 }, { a: 1, b: 2 })
  assert.equal(result.equivalent, true)
  assert.equal(result.fail_closed, false)
  assert.equal(result.drift_class, null)
  assert.equal(result.replay_safe, true)
})

test('serialization parity detects divergent canonical forms', () => {
  const result = validateSerializationParity({ a: 1 }, { a: 2 })
  assert.equal(result.equivalent, false)
  assert.equal(result.fail_closed, true)
  assert.equal(result.drift_class, CANONICAL_DRIFT.SERIALIZATION_DIVERGENCE)
})

test('serialization parity exposes canonical strings for inspection', () => {
  const result = validateSerializationParity({ x: 1 }, { x: 1 })
  assert.equal(result.canonical_a, canonicalize({ x: 1 }))
  assert.equal(result.canonical_b, canonicalize({ x: 1 }))
})

// ── Canonical Equivalence Verification ────────────────────────────────────

test('canonical equivalence passes for logically identical objects', () => {
  const obj = { z: 3, a: 1, m: [{ b: 2, a: 1 }] }
  const reordered = { a: 1, z: 3, m: [{ a: 1, b: 2 }] }
  const result = verifyCanonicalEquivalence(obj, reordered)
  assert.equal(result.equivalent, true)
  assert.equal(result.status, 'VALID')
  assert.equal(result.fail_closed, false)
})

test('canonical equivalence fails closed on divergent objects', () => {
  const result = verifyCanonicalEquivalence({ a: 1 }, { a: 2 })
  assert.equal(result.equivalent, false)
  assert.equal(result.status, 'NULL')
  assert.equal(result.fail_closed, true)
})

test('canonical equivalence exposes both hashes', () => {
  const a = { x: 1 }
  const b = { y: 2 }
  const result = verifyCanonicalEquivalence(a, b)
  assert.equal(result.hash_a, hashCanonical(a))
  assert.equal(result.hash_b, hashCanonical(b))
})

// ── Hash Authority Enforcement ─────────────────────────────────────────────

test('hash authority enforcement passes for correct expected hash', () => {
  const value = { session_id: 's1', intent: 'compile' }
  const expected = hashCanonical(value)
  const result = enforceHashAuthority(value, expected)
  assert.equal(result.valid, true)
  assert.equal(result.status, 'VALID')
  assert.equal(result.authority, 'src/canonical.js')
  assert.equal(result.fail_closed, false)
})

test('hash authority enforcement fails closed on mismatched hash', () => {
  const result = enforceHashAuthority({ a: 1 }, 'a'.repeat(64))
  assert.equal(result.valid, false)
  assert.equal(result.status, 'NULL')
  assert.equal(result.fail_closed, true)
  assert.equal(result.drift_class, CANONICAL_DRIFT.SERIALIZATION_DIVERGENCE)
})

test('hash authority enforcement rejects malformed expected hash', () => {
  const result = enforceHashAuthority({ a: 1 }, 'tooshort')
  assert.equal(result.valid, false)
  assert.equal(result.fail_closed, true)
  assert.equal(result.drift_class, CANONICAL_DRIFT.FOREIGN_HASH_AUTHORITY)
})

// ── Reconciliation Serialization Equivalence Auditing ─────────────────────

test('reconciliation audit passes for equivalent reconciliation objects', () => {
  const r = { topology_hash: 'abc', status: 'VALID', drift: [] }
  const result = auditReconciliationSerializationEquivalence([r, r, r])
  assert.equal(result.equivalent, true)
  assert.equal(result.status, 'VALID')
  assert.equal(result.divergent_count, 0)
  assert.equal(result.replay_safe, true)
})

test('reconciliation audit fails closed on divergent reconciliations', () => {
  const r1 = { topology_hash: 'abc', status: 'VALID' }
  const r2 = { topology_hash: 'def', status: 'VALID' }
  const result = auditReconciliationSerializationEquivalence([r1, r2])
  assert.equal(result.equivalent, false)
  assert.equal(result.status, 'NULL')
  assert.equal(result.divergent_count, 1)
  assert.equal(result.drift_class, CANONICAL_DRIFT.RECONCILIATION_PARITY_FAILURE)
})

test('reconciliation audit fails closed on empty input', () => {
  const result = auditReconciliationSerializationEquivalence([])
  assert.equal(result.status, 'NULL')
  assert.equal(result.fail_closed, true)
})

test('reconciliation audit is order-invariant across key insertion', () => {
  const r1 = { status: 'VALID', topology_hash: 'abc' }
  const r2 = { topology_hash: 'abc', status: 'VALID' }
  const result = auditReconciliationSerializationEquivalence([r1, r2])
  assert.equal(result.equivalent, true)
})

// ── Topology Checkpoint Equivalence Validation ─────────────────────────────

test('topology checkpoint equivalence passes for identical checkpoints', () => {
  const cp = { topology_hash: 'a'.repeat(64), replay_neutral: true }
  const result = validateTopologyCheckpointEquivalence(cp, cp)
  assert.equal(result.equivalent, true)
  assert.equal(result.status, 'VALID')
  assert.equal(result.topology_visible, true)
})

test('topology checkpoint equivalence fails closed for divergent checkpoints', () => {
  const a = { topology_hash: 'a'.repeat(64) }
  const b = { topology_hash: 'b'.repeat(64) }
  const result = validateTopologyCheckpointEquivalence(a, b)
  assert.equal(result.equivalent, false)
  assert.equal(result.status, 'NULL')
  assert.equal(result.drift_class, CANONICAL_DRIFT.TOPOLOGY_CHECKPOINT_MISMATCH)
  assert.equal(result.fail_closed, true)
})

test('topology checkpoint equivalence fails closed on null input', () => {
  const result = validateTopologyCheckpointEquivalence(null, { topology_hash: 'x' })
  assert.equal(result.status, 'NULL')
  assert.equal(result.fail_closed, true)
})

test('topology checkpoint equivalence is key-order invariant', () => {
  const a = { z: 3, a: 1 }
  const b = { a: 1, z: 3 }
  const result = validateTopologyCheckpointEquivalence(a, b)
  assert.equal(result.equivalent, true)
})

// ── Replay Parity Validation ───────────────────────────────────────────────

test('replay parity validates identical replay surfaces', () => {
  const surface = { session_id: 's1', traversal_hash: 'h1', replay_neutral: true }
  const result = validateReplayParity(surface, surface)
  assert.equal(result.parity, true)
  assert.equal(result.status, 'VALID')
  assert.equal(result.replay_safe, true)
})

test('replay parity fails closed on divergent replay surfaces', () => {
  const a = { session_id: 's1', traversal_hash: 'h1' }
  const b = { session_id: 's1', traversal_hash: 'h2' }
  const result = validateReplayParity(a, b)
  assert.equal(result.parity, false)
  assert.equal(result.status, 'NULL')
  assert.equal(result.drift_class, CANONICAL_DRIFT.REPLAY_UNSAFE_SERIALIZATION)
})

test('replay parity fails closed on null input', () => {
  const result = validateReplayParity(null, { session_id: 's1' })
  assert.equal(result.status, 'NULL')
  assert.equal(result.fail_closed, true)
})

// ── Proof Equivalence ─────────────────────────────────────────────────────

test('proof equivalence passes for identical proof objects', () => {
  const proof = { proof_id: 'p1', execution_id: 'e1', decision_id: 'd1' }
  const result = verifyProofEquivalence([proof, proof, proof])
  assert.equal(result.equivalent, true)
  assert.equal(result.status, 'VALID')
  assert.equal(result.replay_safe, true)
})

test('proof equivalence fails closed for divergent proofs', () => {
  const p1 = { proof_id: 'p1' }
  const p2 = { proof_id: 'p2' }
  const result = verifyProofEquivalence([p1, p2])
  assert.equal(result.equivalent, false)
  assert.equal(result.status, 'NULL')
  assert.equal(result.drift_class, CANONICAL_DRIFT.PROOF_EQUIVALENCE_DRIFT)
})

test('proof equivalence fails closed with fewer than two proofs', () => {
  const result = verifyProofEquivalence([{ proof_id: 'p1' }])
  assert.equal(result.status, 'NULL')
  assert.equal(result.fail_closed, true)
})

test('proof equivalence is key-order invariant', () => {
  const p1 = { b: 2, a: 1, c: 'x' }
  const p2 = { a: 1, c: 'x', b: 2 }
  const result = verifyProofEquivalence([p1, p2])
  assert.equal(result.equivalent, true)
})

// ── Federation Equivalence ─────────────────────────────────────────────────

test('federation equivalence passes for identical runtime representations', () => {
  const runtime = { runtime_id: 'r1', topology_hash: 'h1' }
  const result = verifyFederationEquivalence(runtime, runtime)
  assert.equal(result.equivalent, true)
  assert.equal(result.status, 'VALID')
  assert.equal(result.topology_visible, true)
})

test('federation equivalence fails closed for divergent runtimes', () => {
  const local = { runtime_id: 'r1', topology_hash: 'h1' }
  const remote = { runtime_id: 'r2', topology_hash: 'h2' }
  const result = verifyFederationEquivalence(local, remote)
  assert.equal(result.equivalent, false)
  assert.equal(result.status, 'NULL')
  assert.equal(result.drift_class, CANONICAL_DRIFT.FEDERATION_EQUIVALENCE_COLLAPSE)
})

test('federation equivalence fails closed on null input', () => {
  const result = verifyFederationEquivalence(null, { runtime_id: 'r1' })
  assert.equal(result.status, 'NULL')
  assert.equal(result.fail_closed, true)
})

// ── Cross-authority import validation ─────────────────────────────────────

test('consolidated runtime engines import canonical.js not crypto', () => {
  const engineSources = [
    '../../runtime/recursive_drift_propagation_engine.mjs',
    '../../runtime/federated_sovereignty_drift_coordinator.mjs',
    '../../runtime/portable_legitimacy_bundle_generator.mjs',
    '../../runtime/continuous_reconciliation_orchestrator.mjs',
    '../../runtime/topology_lineage_registry.mjs',
    '../../runtime/recursive_quarantine_orchestrator.mjs',
    '../../runtime/surface_inventory_reconciler.mjs',
  ]
  for (const rel of engineSources) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /import crypto from "node:crypto"/, `${rel} still imports node:crypto`)
    assert.doesNotMatch(src, /createHash\(/, `${rel} still calls createHash`)
    assert.doesNotMatch(src, /function canonicalize\b/, `${rel} still defines local canonicalize`)
    assert.doesNotMatch(src, /function hashCanonical\b/, `${rel} still defines local hashCanonical`)
  }
})

test('consolidated runtime engines delegate to src/canonical.js', () => {
  const delegatingEngines = [
    { rel: '../../runtime/recursive_drift_propagation_engine.mjs', pattern: /from '\.\.\/src\/canonical\.js'/ },
    { rel: '../../runtime/federated_sovereignty_drift_coordinator.mjs', pattern: /from '\.\.\/src\/canonical\.js'/ },
    { rel: '../../runtime/portable_legitimacy_bundle_generator.mjs', pattern: /from '\.\.\/src\/canonical\.js'/ },
    { rel: '../../runtime/continuous_reconciliation_orchestrator.mjs', pattern: /from '\.\.\/src\/canonical\.js'/ },
    { rel: '../../runtime/topology_lineage_registry.mjs', pattern: /from '\.\.\/src\/canonical\.js'/ },
    { rel: '../../runtime/recursive_quarantine_orchestrator.mjs', pattern: /from '\.\.\/src\/canonical\.js'/ },
    { rel: '../../runtime/surface_inventory_reconciler.mjs', pattern: /from '\.\.\/src\/canonical\.js'/ },
  ]
  for (const { rel, pattern } of delegatingEngines) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8')
    assert.match(src, pattern, `${rel} does not import from src/canonical.js`)
  }
})

test('canonical-authority.js does not define local SHA or JSON.stringify hash', () => {
  const src = readFileSync(new URL('../../src/canonical-authority.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /createHash\(/, 'canonical-authority.js calls createHash')
  assert.doesNotMatch(src, /function sha256/, 'canonical-authority.js defines local sha256')
  assert.doesNotMatch(src, /import crypto/, 'canonical-authority.js imports crypto')
})
