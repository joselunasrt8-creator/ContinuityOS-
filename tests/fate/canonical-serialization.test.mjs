import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canonicalize, hashCanonical, normalize, sha256Hex } from '../../src/canonical.js'
import { canonicalize as conformanceCanonicalize, hashCanonicalObject } from '../../runtime/legitimacy/validators/schema-validator.js'
import { canonicalize as reconciliationCanonicalize, hashCanonical as reconciliationHashCanonical, reconcileTopology } from '../../runtime/reconciliation/topology-reconciliation-engine.js'

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
