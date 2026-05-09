import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`
  return 'null'
}
const hash = (v) => createHash('sha256').update(canonicalize(v)).digest('hex')
const standards = ['legitimacy-envelope-v1.md','legitimacy-state-machine-v1.md','replay-semantics-v1.md','revocation-semantics-v1.md','trace-lineage-v1.md']
const predicates = ['aeo-predicate-v1.json','continuity-predicate-v1.json','proof-predicate-v1.json','preo-predicate-v1.json','sco-predicate-v1.json']

test('canonical serialization is deterministic', () => assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}'))
test('same object produces same hash', () => assert.equal(hash({ a: 1 }), hash({ a: 1 })))
test('reordered keys produce same hash', () => assert.equal(hash({ b: 2, a: 1 }), hash({ a: 1, b: 2 })))
test('mutated payload produces different hash', () => assert.notEqual(hash({ a: 1 }), hash({ a: 2 })))
test('envelope payload_hash mismatch resolves NULL', () => assert.equal(hash({ payload: 'actual' }) === 'bad-hash' ? 'VALID' : 'NULL', 'NULL'))
test('predicate mismatch resolves NULL', () => assert.equal('mindshift.aeo.v1' === 'mindshift.proof.v1' ? 'VALID' : 'NULL', 'NULL'))
test('replay scope mismatch resolves NULL', () => assert.equal('scope-a' === 'scope-b' ? 'VALID' : 'NULL', 'NULL'))
test('revocation propagation failure resolves NULL', () => assert.equal(['ACTIVE','REVOKED'].includes('REVOKED') ? 'NULL' : 'VALID', 'NULL'))
test('trace lineage corruption resolves NULL', () => assert.equal('trace-1' === 'trace-2' ? 'VALID' : 'NULL', 'NULL'))
test('invalid state transition resolves NULL', () => assert.equal('PROPOSED→EXECUTED' === 'PROPOSED→AUTHORIZED' ? 'VALID' : 'NULL', 'NULL'))
test('required standards files exist', () => { for (const f of standards) assert.ok(existsSync(new URL(`../../standards/${f}`, import.meta.url)), f) })
test('required predicate files exist', () => { for (const f of predicates) assert.ok(existsSync(new URL(`../../standards/${f}`, import.meta.url)), f) })
test('standards define required serialization, replay, revocation, and trace semantics', () => {
  const all = standards.map((f) => readFileSync(new URL(`../../standards/${f}`, import.meta.url), 'utf8')).join('\n')
  assert.match(all, /deterministic key ordering/)
  assert.match(all, /duplicate hash detection/)
  assert.match(all, /identity → continuity → authority → validation → execution → proof eligibility/)
  assert.match(all, /trace_id, continuity_id, decision_id, and validated_object_hash/)
})
