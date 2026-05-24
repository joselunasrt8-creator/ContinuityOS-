import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canonicalize, hashCanonical, normalize, sha256Hex } from '../../src/canonical.js'
import { canonicalize as conformanceCanonicalize, hashCanonicalObject } from '../../runtime/legitimacy/validators/schema-validator.js'
import { canonicalize as reconciliationCanonicalize, hashCanonical as reconciliationHashCanonical, reconcileTopology } from '../../runtime/reconciliation/topology-reconciliation-engine.js'
import { canonicalizeRevocationLineage, hashRevocationLineage } from '../../src/lib/skill-provenance-revocation.js'
import { fingerprintObject } from '../../src/lib/legitimacy-governance.js'

const fixture = Object.freeze({
  b: 2,
  a: { d: undefined, c: Number.NaN },
  e: [Number.POSITIVE_INFINITY, undefined, { z: 1, y: 2 }],
})
const canonicalFixture = '{"a":{"c":null,"d":null},"b":2,"e":[null,null,{"y":2,"z":1}]}'
const canonicalFixtureHash = '6964f0df4bd17e27b6f824e8841436e4ea3aa78da7ddf299f97112686113c714'

test('canonical serialization deterministically orders keys recursively', () => {
  assert.equal(canonicalize({ b: 1, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":1}')
  assert.equal(canonicalize({ a: { c: 3, d: 4 }, b: 1 }), canonicalize({ b: 1, a: { d: 4, c: 3 } }))
})

test('canonical serialization normalizes floating point sentinels and undefined to null', () => {
  assert.equal(canonicalize({ finite: 1.25, inf: Infinity, neg_inf: -Infinity, nan: NaN, missing: undefined }), '{"finite":1.25,"inf":null,"missing":null,"nan":null,"neg_inf":null}')
  assert.deepEqual(normalize([undefined, NaN, Infinity, -Infinity]), [null, null, null, null])
})

test('canonical hash remains stable for logically equivalent objects', () => {
  assert.equal(canonicalize(fixture), canonicalFixture)
  assert.equal(sha256Hex(canonicalFixture), canonicalFixtureHash)
  assert.equal(hashCanonical(fixture), canonicalFixtureHash)
  assert.equal(hashCanonical({ e: [Infinity, undefined, { y: 2, z: 1 }], a: { c: NaN, d: undefined }, b: 2 }), canonicalFixtureHash)
})

test('runtime, reconciliation, and conformance layers share canonical serialization', () => {
  const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  assert.match(source, /function canonicalize\(v: unknown\): string/)
  assert.equal(conformanceCanonicalize(fixture), canonicalize(fixture))
  assert.equal(reconciliationCanonicalize(fixture), canonicalize(fixture))
  assert.equal(hashCanonicalObject(fixture), hashCanonical(fixture))
  assert.equal(reconciliationHashCanonical(fixture), hashCanonical(fixture))
})


test('merge-governance JavaScript consumers load the shared canonical primitive without TypeScript transpilation', () => {
  const topologySource = readFileSync(new URL('../../runtime/reconciliation/topology-reconciliation-engine.js', import.meta.url), 'utf8')
  const conformanceSource = readFileSync(new URL('../../conformance/runner.mjs', import.meta.url), 'utf8')
  assert.match(topologySource, /from '\.\.\/\.\.\/src\/canonical\.js'/)
  assert.match(conformanceSource, /from '\.\.\/src\/canonical\.js'/)
  assert.doesNotMatch(topologySource, /canonical\.ts/)
  assert.equal(typeof reconcileTopology, 'function')
})

// ── Issue #1100 parity tests: centralized canonicalization authority ───────────

const governanceObj = { z: 'beta', a: 1, m: [{ b: 2, a: 1 }, 'str'], r: true }

test('parity: canonicalizeRevocationLineage delegates to canonical.js canonicalize', () => {
  assert.equal(canonicalizeRevocationLineage(governanceObj), canonicalize(governanceObj))
  assert.equal(canonicalizeRevocationLineage([governanceObj, { x: 1 }]), canonicalize([governanceObj, { x: 1 }]))
  assert.equal(canonicalizeRevocationLineage('plain-string'), canonicalize('plain-string'))
  assert.equal(canonicalizeRevocationLineage(null), canonicalize(null))
})

test('parity: hashRevocationLineage equals hashCanonical from canonical.js', () => {
  assert.equal(hashRevocationLineage(governanceObj), hashCanonical(governanceObj))
  assert.equal(hashRevocationLineage([1, 2, 3]), hashCanonical([1, 2, 3]))
  assert.equal(hashRevocationLineage('value'), hashCanonical('value'))
})

test('parity: fingerprintObject from legitimacy-governance equals hashCanonical from canonical.js', () => {
  const clo = { object_id: 'clo-1', authority_id: 'auth-1', policy_result: 'VALID', value: 42 }
  assert.equal(fingerprintObject(clo), hashCanonical(clo))
  assert.equal(fingerprintObject(governanceObj), hashCanonical(governanceObj))
  assert.equal(fingerprintObject({ b: 2, a: 1 }), fingerprintObject({ a: 1, b: 2 }))
})

test('parity: migrated src/ modules no longer define local canonicalJson or import createHash', () => {
  const sources = [
    '../../src/governance-routing.ts',
    '../../src/distributed-topology-divergence-observer.ts',
    '../../src/distributed-topology-convergence.ts',
    '../../src/legitimacy-conflict-arbitration.ts',
    '../../src/inter-surface-coordination.ts',
    '../../src/temporal-legitimacy-replay-visualization.ts',
    '../../src/distributed-topology-visualization-projection.ts',
    '../../src/runtime/federation/reconcileFederatedLegitimacy.ts',
    '../../scripts/governed-deploy.ts',
  ]
  for (const rel of sources) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /function canonicalJson/, `${rel} still defines local canonicalJson`)
    assert.doesNotMatch(src, /createHash\(/, `${rel} still calls createHash`)
    assert.doesNotMatch(src, /function stable\(/, `${rel} still defines local stable`)
  }
})

test('parity: legitimacy-governance delegates to canonical.js without crypto dependency', () => {
  const src = readFileSync(new URL('../../src/lib/legitimacy-governance.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /crypto/, 'legitimacy-governance.js still references crypto')
  assert.doesNotMatch(src, /function stable/, 'legitimacy-governance.js still defines local stable')
  assert.match(src, /from '\.\.\/canonical\.js'/, 'legitimacy-governance.js must import from canonical.js')
})

test('parity: skill-provenance-revocation delegates to canonical.js without crypto dependency', () => {
  const src = readFileSync(new URL('../../src/lib/skill-provenance-revocation.js', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /createHash/, 'skill-provenance-revocation.js still calls createHash')
  assert.match(src, /from '\.\.\/canonical\.js'/, 'skill-provenance-revocation.js must import from canonical.js')
})

test('parity: hash output is stable across key insertion order variants', () => {
  const v1 = { session_id: 's1', intent: 'deploy', scope: { repo: 'a', branch: 'main' } }
  const v2 = { scope: { branch: 'main', repo: 'a' }, intent: 'deploy', session_id: 's1' }
  assert.equal(hashCanonical(v1), hashCanonical(v2))
  assert.equal(canonicalizeRevocationLineage(v1), canonicalizeRevocationLineage(v2))
  assert.equal(hashRevocationLineage(v1), hashRevocationLineage(v2))
  assert.equal(fingerprintObject(v1), fingerprintObject(v2))
})
