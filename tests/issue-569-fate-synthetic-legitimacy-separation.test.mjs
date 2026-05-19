import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

function routeBlock(route, nextRoute) {
  const start = source.indexOf(`if (url.pathname === "${route}"`)
  const end = nextRoute ? source.indexOf(`if (url.pathname === "${nextRoute}"`) : source.length
  return start >= 0 && end > start ? source.slice(start, end) : ''
}

test('Issue #569: synthetic/FATE artifacts cannot be treated as production proof or authority', () => {
  assert.match(source, /proof_without_execute/)
  assert.match(source, /execution_missing/)
  assert.match(source, /evidence_only/)
  assert.match(source, /non_authoritative/)
  assert.match(source, /mutation_capable.*'false'|mutation_capable='false'/)
  assert.match(source, /creates_authority.*'false'|creates_authority='false'/)
})

test('Issue #569: simulated legitimacy cannot bypass execute\/proof lineage or validator result', () => {
  const executeBlock = routeBlock('/execute', '/proof')
  assert.match(executeBlock, /SELECT \* FROM validation_registry/)
  assert.match(executeBlock, /result='VALID' AND status='VALID'/)
  assert.match(source, /proofDecisionHash\(decision_id, validated_object_hash\)/)
  assert.doesNotMatch(source, /skip_?validator|validator_?bypass/i)
  assert.doesNotMatch(source, /high_confidence|model_confidence|confidence_score/i)
})

test('Issue #569: exact five-field AEO discipline remains immutable and fail-closed', () => {
  assert.match(source, /const REQUIRED_AEO_KEYS = \["intent", "scope", "validation", "target", "finality"\] as const/)
  assert.match(source, /if \(keys\.length !== REQUIRED_AEO_KEYS\.length\) return null/)
  assert.ok(source.includes('if (keys.join("|") !== [...REQUIRED_AEO_KEYS].sort().join("|")) return null'))
  assert.match(source, /Object\.freeze\(\{[\s\S]*intent: String\(input\.intent \|\| ""\),[\s\S]*scope: canonicalRecord\(input\.scope\),[\s\S]*validation: canonicalRecord\(input\.validation\),[\s\S]*target: canonicalRecord\(input\.target\),[\s\S]*finality: canonicalRecord\(input\.finality\)/)
})

test('Issue #569: virtual-to-production object\/policy parity is enforced via hash equivalence', () => {
  assert.match(source, /validated_object_hash/)
  assert.match(source, /String\(proof\?\.validated_object_hash \|\| ""\) === String\(execution\?\.validated_object_hash \|\| ""\)/)
  assert.match(source, /hash_mismatch/)
})

test('Issue #569 overlap #572 guard: no synthetic replay\/coverage route can grant execution permission', () => {
  assert.match(source, /invocation_registry/)
  assert.match(source, /invocation_nonce/)
  assert.match(source, /REPLAY_BLOCKED/)
  assert.doesNotMatch(source, /fate_replay.*execute|synthetic.*execution_permission/i)
})

test('Issue #569: no new execution routes are introduced beyond canonical runtime path', () => {
  assert.match(source, /const CANONICAL_RUNTIME_ROUTES = \["\/session", "\/continuity", "\/authority", "\/compile", "\/validate", "\/execute", "\/proof"\] as const/)
})
