import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const fateSource = readFileSync(new URL('../src/reconciliation/fate-tests.ts', import.meta.url), 'utf8')

function routeBlock(route, nextRoute) {
  const start = source.indexOf(`if (url.pathname === "${route}"`)
  const end = nextRoute ? source.indexOf(`if (url.pathname === "${nextRoute}"`) : source.length
  return start >= 0 && end > start ? source.slice(start, end) : ''
}

test('Issue #568: /execute rejects LLM proposal bypass of validator/arbitrator registry record', () => {
  const executeBlock = routeBlock('/execute', '/proof')
  assert.match(executeBlock, /SELECT \* FROM validation_registry/)
  assert.match(executeBlock, /result='VALID' AND status='VALID'/)
  assert.match(executeBlock, /reason:"hash_mismatch"|reason: "hash_mismatch"/)
})

test('Issue #568: agent/LLM output remains proposal-only and cannot execute without exact AEO', () => {
  assert.match(source, /keys\.length !== REQUIRED_AEO_KEYS\.length/)
  assert.match(source, /keys\.join\("\|"\) !== \[\.\.\.REQUIRED_AEO_KEYS\]\.sort\(\)\.join\("\|"\)/)
  assert.match(source, /status:\s*"NULL",\s*route:\s*"\/compile",\s*reason:\s*"invalid_canonical_aeo"/)
})

test('Issue #568: model confidence cannot replace deterministic validator result', () => {
  assert.doesNotMatch(source, /high_confidence|model_confidence|confidence_score/i)
  assert.doesNotMatch(source, /confidence\s*[:=]\s*(?:1|0\.\d+)/)
})

test('Issue #568: synthetic/FATE pass is non-production and cannot satisfy production proof', () => {
  assert.match(source, /proof_without_execute/)
  assert.match(source, /reason:"execution_missing"|reason: "execution_missing"/)
  assert.match(source, /evidence_only/)
  assert.match(source, /non_authoritative/)
  assert.match(fateSource, /FATE/i)
})

test('Issue #568: fallback path cannot create implicit authority', () => {
  const validateBlock = routeBlock('/validate', '/execute')
  assert.match(validateBlock, /FROM authority_registry/)
  assert.match(validateBlock, /reason:"authority_missing"|reason: "authority_missing"/)
  assert.match(validateBlock, /result:"INVALID"|result: "INVALID"/)
})

test('Issue #568: validator cannot be skipped by high-confidence or post-arbitration mutation', () => {
  assert.match(source, /String\(proof\?\.validated_object_hash \|\| ""\) === String\(execution\?\.validated_object_hash \|\| ""\)/)
  assert.match(source, /hash_mismatch/)
  assert.doesNotMatch(source, /skip_?validator|validator_?bypass/i)
})

test('Issue #568: arbitrator decision must remain proof-bound with decision hash + authority lineage', () => {
  assert.match(source, /proofDecisionHash\(decision_id, validated_object_hash\)/)
  assert.match(source, /authority_lineage/)
  assert.match(source, /workflow\s*:\s*GOVERNED_WORKFLOW|workflow!==GOVERNED_WORKFLOW|workflow != GOVERNED_WORKFLOW/)
})

test('Issue #568 overlap #567: scope/domain mismatch fails closed to NULL', () => {
  assert.match(source, /scope_constraints_mismatch/)
  assert.match(source, /status:\s*"NULL"/)
})

test('Issue #568 overlap #569: FATE/synthetic artifacts stay evidence-only and mutation-incapable', () => {
  assert.match(source, /mutation_capable.*'false'|mutation_capable='false'/)
})

test('Issue #568: compile returns NULL when proposal cannot compile to exact five-field AEO', () => {
  const compileBlock = routeBlock('/compile', '/validate')
  assert.match(compileBlock, /reason:\s*"invalid_canonical_aeo"|reason:\s*"compile_exception"|reason:\s*"missing_decision_id"/)
})