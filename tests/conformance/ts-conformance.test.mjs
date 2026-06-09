/**
 * V3 Conformance Suite — TypeScript/JavaScript side
 *
 * Proves that the TypeScript continuity-core primitives in src/continuity-core.js
 * produce the same canonical forms, hashes, classifications, and proof envelopes
 * as the Rust continuity-core crate for every fixture in fixtures/conformance/.
 *
 * Fixtures own the expected values.  No implementation owns the truth.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

import { canonicalize, sha256Hex } from '../../src/canonical.js'
import {
  validateAeo,
  createLineageGraph,
  buildProofEnvelope,
  classifyReconciliation,
  createReplayRegistry,
} from '../../src/continuity-core.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const fixturesDir = join(root, 'fixtures', 'conformance')

function loadFixture(filename) {
  return JSON.parse(readFileSync(join(fixturesDir, filename), 'utf8'))
}

// ─── 1. Canonicalization ──────────────────────────────────────────────────────

test('Canonicalization fixtures', async (t) => {
  const fixtures = loadFixture('canonicalization-fixtures.json')
  for (const fixture of fixtures) {
    await t.test(fixture.id, () => {
      const canonical = canonicalize(fixture.input)
      assert.equal(canonical, fixture.expected_canonical, `canonical mismatch for ${fixture.id}`)

      const hash = sha256Hex(canonical)
      assert.equal(hash, fixture.expected_hash, `hash mismatch for ${fixture.id}`)
    })
  }
})

// ─── 2. Identity hashing — reordered keys produce the same hash ───────────────

test('Hashing: reordered keys produce identical canonical form and hash', () => {
  const a = canonicalize({ b: 2, a: 1 })
  const b = canonicalize({ a: 1, b: 2 })
  assert.equal(a, b)
  assert.equal(sha256Hex(a), sha256Hex(b))
})

// ─── 3. AEO validation ────────────────────────────────────────────────────────

test('AEO: valid fixture classifies VALID', () => {
  const { aeo, context, expected_decision } = loadFixture('aeo-valid.json')
  assert.equal(validateAeo(aeo, context), expected_decision)
})

test('AEO: invalid-missing-field classifies NULL', () => {
  const { aeo, context, expected_decision } = loadFixture('invalid-missing-field.json')
  assert.equal(validateAeo(aeo, context), expected_decision)
})

test('AEO: invalid-extra-field classifies NULL', () => {
  const { aeo, context, expected_decision } = loadFixture('invalid-extra-field.json')
  assert.equal(validateAeo(aeo, context), expected_decision)
})

test('AEO: invalid-hash classifies NULL', () => {
  const { aeo, context, expected_decision } = loadFixture('invalid-hash.json')
  assert.equal(validateAeo(aeo, context), expected_decision)
})

test('AEO: invalid-authority classifies NULL', () => {
  const { aeo, context, expected_decision } = loadFixture('invalid-authority.json')
  assert.equal(validateAeo(aeo, context), expected_decision)
})

test('AEO: invalid-scope-overflow classifies NULL', () => {
  const { aeo, context, expected_decision } = loadFixture('invalid-scope-overflow.json')
  assert.equal(validateAeo(aeo, context), expected_decision)
})

// ─── 4. NULL classification invariant ────────────────────────────────────────

test('NULL invariant: mutating a valid AEO post-validation produces NULL', () => {
  const { aeo, context } = loadFixture('aeo-valid.json')
  assert.equal(validateAeo(aeo, context), 'VALID')

  const mutated = JSON.parse(JSON.stringify(aeo))
  mutated.target.action = 'action:read'
  assert.equal(validateAeo(mutated, context), 'NULL')
})

// ─── 5. Lineage verification ──────────────────────────────────────────────────

test('Lineage fixtures', async (t) => {
  const { cases } = loadFixture('lineage-fixture.json')
  for (const c of cases) {
    await t.test(c.id, () => {
      const graph = createLineageGraph()
      for (const node of c.graph) {
        graph.insert(node)
      }
      const state = graph.classifyAsValidation(c.classify_id)
      assert.equal(state, c.expected_state, `lineage mismatch for ${c.id}`)
    })
  }
})

// ─── 6. Proof envelope ────────────────────────────────────────────────────────

test('Proof envelope fixtures', async (t) => {
  const { cases } = loadFixture('proof-fixture.json')
  for (const c of cases) {
    await t.test(c.id, () => {
      const envelope = buildProofEnvelope(c.proof_id, c.evidence)
      const hasEnvelope = envelope !== null
      assert.equal(hasEnvelope, c.expected_has_envelope, `envelope presence mismatch for ${c.id}`)

      if (c.expected_has_envelope && envelope) {
        assert.equal(
          envelope.evidence_hash,
          c.expected_evidence_hash,
          `evidence_hash mismatch for ${c.id}`
        )
        assert.equal(envelope.proof_id, c.proof_id)
        assert.equal(envelope.execution_id, c.evidence.execution_id)
        assert.equal(envelope.decision_id, c.evidence.decision_id)
        assert.equal(envelope.aeo_hash, c.evidence.aeo_hash)
      }
    })
  }
})

// ─── 7. Replay classification and NULL on reuse ───────────────────────────────

test('Replay fixtures', async (t) => {
  const { cases } = loadFixture('invalid-replay.json')
  for (const c of cases) {
    await t.test(c.id, () => {
      const registry = createReplayRegistry()
      for (const prior of c.prior_admits ?? []) {
        registry.admit(prior.nonce, prior.object_hash, prior.lineage_binding)
      }

      if ('expected_admit_state' in c) {
        const result = registry.admit(c.nonce, c.object_hash, c.lineage_binding)
        assert.equal(result, c.expected_admit_state, `admit mismatch for ${c.id}`)
      }
      if ('expected_classify_state' in c) {
        const result = registry.classify(c.nonce, c.object_hash, c.lineage_binding)
        assert.equal(result, c.expected_classify_state, `classify mismatch for ${c.id}`)
      }
    })
  }
})

// ─── 8. Reconciliation ───────────────────────────────────────────────────────

test('Reconciliation fixtures', async (t) => {
  const { cases } = loadFixture('reconciliation-fixtures.json')
  for (const c of cases) {
    await t.test(c.id, () => {
      const result = classifyReconciliation(c.evidence)
      assert.equal(result, c.expected_state, `reconciliation mismatch for ${c.id}`)
    })
  }
})

// ─── 9. Proof chain — complete governed execution (VALID path + NULL path) ────
//
// Proves the two core invariants:
//   validated_object == executed_object
//     (aeo_hash in proof must equal validation.object_hash in the AEO)
//   If no valid object exists → nothing happens
//     (NULL validation produces no proof envelope)

test('Proof chain: VALID path produces proof with matching aeo_hash', () => {
  const fixture = loadFixture('proof-chain.json')
  const { aeo, context, expected_validation, execution_evidence, expected_proof } = fixture

  const decision = validateAeo(aeo, context)
  assert.equal(decision, expected_validation)

  const envelope = buildProofEnvelope(
    'proof-chain-1',
    {
      ...execution_evidence,
      aeo_hash: aeo.validation.object_hash,
    }
  )

  assert.equal(envelope !== null, expected_proof.has_envelope)
  assert.equal(envelope.aeo_hash, expected_proof.aeo_hash,
    'aeo_hash in proof must equal validation.object_hash — validated_object == executed_object')
  assert.equal(envelope.evidence_hash, expected_proof.evidence_hash)
})

test('Proof chain: NULL path produces no proof envelope', () => {
  const fixture = loadFixture('proof-chain.json')
  const { aeo, context, null_path } = fixture

  const mutated = JSON.parse(JSON.stringify(aeo))
  mutated.target.action = null_path.mutated_aeo_target_action

  const decision = validateAeo(mutated, context)
  assert.equal(decision, null_path.expected_validation)

  const envelope = buildProofEnvelope('proof-chain-null', null)
  assert.equal(envelope !== null, null_path.expected_proof_has_envelope)
})
