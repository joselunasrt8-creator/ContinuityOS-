import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { canonicalize, hashCanonical, normalize, sha256Hex } from '../../src/canonical.js'
import { canonicalize as conformanceCanonicalize, hashCanonicalObject } from '../../runtime/legitimacy/validators/schema-validator.js'
import { canonicalize as reconciliationCanonicalize, hashCanonical as reconciliationHashCanonical, reconcileTopology } from '../../runtime/reconciliation/topology-reconciliation-engine.js'
import { canonicalizeRevocationLineage, hashRevocationLineage } from '../../src/lib/skill-provenance-revocation.js'
import { fingerprintObject } from '../../src/lib/legitimacy-governance.js'

const fixture = Object.freeze({
  b: 2,
  a: { d: null, c: 1.5 },
  e: [true, null, { z: 1, y: 2 }],
})
const canonicalFixture = '{"a":{"c":1.5,"d":null},"b":2,"e":[true,null,{"y":2,"z":1}]}'
const canonicalFixtureHash = createHash('sha256').update(canonicalFixture, 'utf8').digest('hex')

test('canonical serialization deterministically orders keys recursively', () => {
  assert.equal(canonicalize({ b: 1, a: { d: 4, c: 3 } }), '{"a":{"c":3,"d":4},"b":1}')
  assert.equal(canonicalize({ a: { c: 3, d: 4 }, b: 1 }), canonicalize({ b: 1, a: { d: 4, c: 3 } }))
})

test('canonical serialization rejects unsupported values instead of collapsing them to null', () => {
  assert.throws(() => canonicalize({ missing: undefined }), /Unsupported canonical value: undefined/)
  assert.throws(() => canonicalize({ nan: NaN }), /Unsupported canonical value: non-finite number/)
  assert.throws(() => canonicalize({ inf: Infinity }), /Unsupported canonical value: non-finite number/)
  assert.throws(() => normalize([undefined]), /Unsupported canonical value: undefined/)
})

test('canonical serialization rejects circular objects deterministically', () => {
  const cycle = { a: 1 }
  cycle.self = cycle
  assert.throws(() => canonicalize(cycle), /Unsupported canonical value: cycle/)
})

test('canonical hash remains stable for logically equivalent objects', () => {
  assert.equal(canonicalize(fixture), canonicalFixture)
  assert.equal(sha256Hex(canonicalFixture), canonicalFixtureHash)
  assert.equal(hashCanonical(fixture), canonicalFixtureHash)
  assert.equal(hashCanonical({ e: [true, null, { y: 2, z: 1 }], a: { c: 1.5, d: null }, b: 2 }), canonicalFixtureHash)
})

test('sha256Hex matches platform SHA-256 vectors at block boundaries', () => {
  for (const input of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(57), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(65), 'continuity-π']) {
    assert.equal(sha256Hex(input), createHash('sha256').update(input, 'utf8').digest('hex'))
  }
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
