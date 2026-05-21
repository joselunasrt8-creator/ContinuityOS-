import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const registry = JSON.parse(readFileSync(new URL('../governance/runtime/EXECUTION_SURFACE_CLOSURE_REGISTRY.json', import.meta.url), 'utf8'))
const report = JSON.parse(readFileSync(new URL('../governance/runtime/EXECUTION_SURFACE_CLOSURE_REPORT.json', import.meta.url), 'utf8'))

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/execution-surface/${name}.json`, import.meta.url), 'utf8'))

function evaluateExecutionSurfaceAttempt(input) {
  if (input.undeclared_surface) return 'NULL'
  if (input.replayed_nonce) return 'NULL'
  if (input.has_proof === false) return 'NULL'
  if (input.validator_escaped) return 'NULL'
  if (input.validated_object_hash && input.executed_object_hash && input.validated_object_hash !== input.executed_object_hash) return 'NULL'
  if (input.has_lineage === false) return 'NULL'
  if (input.workflow_dispatch_mutation && input.has_validation === false) return 'NULL'
  return 'VALID'
}

test('undeclared mutation surfaces fail closed', () => {
  assert.equal(evaluateExecutionSurfaceAttempt(fixture('undeclared_execution_surface')), 'NULL')
})

test('replay attempts fail closed', () => {
  assert.equal(evaluateExecutionSurfaceAttempt(fixture('replayed_execution_nonce')), 'NULL')
})

test('proofless execution fails closed', () => {
  assert.equal(evaluateExecutionSurfaceAttempt(fixture('proofless_execution_attempt')), 'NULL')
})

test('validator escape attempts fail closed', () => {
  assert.equal(evaluateExecutionSurfaceAttempt(fixture('validator_escape_attempt')), 'NULL')
})

test('post-validation mutation invalidates execution', () => {
  assert.equal(evaluateExecutionSurfaceAttempt(fixture('mutated_validated_object')), 'NULL')
})

test('orphan execution cannot reconcile', () => {
  assert.equal(evaluateExecutionSurfaceAttempt(fixture('orphan_execution_attempt')), 'NULL')
})

test('workflow bypass paths cannot authorize execution', () => {
  assert.equal(evaluateExecutionSurfaceAttempt(fixture('workflow_dispatch_bypass')), 'NULL')
})

test('authoritative execution ownership remains singular', () => {
  assert.deepEqual(report.conflicting_authoritative_ownership, [])
  assert.equal(report.required_response === 'NULL', false)
  assert.deepEqual(registry.canonical_execution_chain, ['/session','/continuity','/authority','/compile','/validate','/execute','/proof'])
})
