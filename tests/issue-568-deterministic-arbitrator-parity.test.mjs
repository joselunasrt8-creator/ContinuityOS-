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

test('Issue #568: /execute requires validator/arbitrator output from validation_registry', () => {
  const executeBlock = routeBlock('/execute', '/proof')
  assert.match(executeBlock, /SELECT \* FROM validation_registry/)
  assert.match(executeBlock, /status='VALID'/)
  assert.match(executeBlock, /reason:"hash_mismatch"|reason: "hash_mismatch"/)
})

test('Issue #568: high confidence cannot replace validator result', () => {
  assert.doesNotMatch(source, /confidence\s*[:=]\s*(?:1|0\.\d+)/)
  assert.doesNotMatch(source, /high_confidence|model_confidence|confidence_score/i)
})

test('Issue #568: proposal cannot be treated as executable without exact AEO compile', () => {
  assert.match(source, /keys\.length !== REQUIRED_AEO_KEYS\.length/)
  assert.match(source, /keys\.join\("\|"\) !== \[\.\.\.REQUIRED_AEO_KEYS\]\.sort\(\)\.join\("\|"\)/)
})

test('Issue #568: synthetic/FATE artifacts are non-production and cannot satisfy proof execution contract', () => {
  assert.match(source, /proof_without_execute/)
  assert.match(source, /reason:"execution_missing"|reason: "execution_missing"/)
  assert.match(fateSource, /FATE/i)
})

test('Issue #568: fallback path cannot create implicit authority', () => {
  const validateBlock = routeBlock('/validate', '/execute')
  assert.match(validateBlock, /FROM authority_registry/)
  assert.match(validateBlock, /reason:"authority_missing"|reason: "authority_missing"/)
  assert.match(validateBlock, /result:"INVALID"|result: "INVALID"/)
})

test('Issue #568: post-arbitration mutation is blocked by hash binding before execute/proof', () => {
  assert.match(source, /String\(proof\?\.validated_object_hash \|\| ""\) === String\(execution\?\.validated_object_hash \|\| ""\)/)
  assert.match(source, /hash_mismatch/)
})

test('Issue #568: arbitrator decision/proof binding includes decision_hash and authority_lineage', () => {
  assert.match(source, /proofDecisionHash\(decision_id, validated_object_hash\)/)
  assert.match(source, /authority_lineage/)
  assert.match(source, /workflow\s*:\s*GOVERNED_WORKFLOW|workflow!==GOVERNED_WORKFLOW|workflow != GOVERNED_WORKFLOW/)
})

test('Issue #568 overlap #567: scope/domain mismatch fails closed to NULL', () => {
  assert.match(source, /scope_constraints_mismatch/)
  assert.match(source, /status:\s*"NULL"/)
})

test('Issue #568 overlap #569: FATE/simulated artifacts remain evidence-only and non-authoritative', () => {
  assert.match(source, /evidence_only/)
  assert.match(source, /non_authoritative/)
  assert.match(source, /mutation_capable.*'false'|mutation_capable='false'/)
})

test('Issue #568: compile must return NULL when proposal does not compile to exact five-field AEO', () => {
  const compileBlock = routeBlock('/compile', '/validate')
  assert.match(compileBlock, /reason:\s*"invalid_aeo"|reason:\s*"compile_exception"|reason:\s*"missing_decision_id"/)
})
