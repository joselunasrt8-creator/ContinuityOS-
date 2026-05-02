import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflowPath = '.github/workflows/mindshift-validate-pr.yml'
const source = readFileSync(workflowPath, 'utf8')

test('workflow ensures authority before validate-pr', () => {
  const authorityStep = source.indexOf('ENSURE PR AUTHORITY — Fail closed')
  const validateStep = source.indexOf('VALIDATE PR — Fail closed')

  assert.ok(authorityStep > -1, 'authority step should exist')
  assert.ok(validateStep > -1, 'validate-pr step should exist')
  assert.ok(authorityStep < validateStep, 'authority step must run before validate-pr')
})

test('workflow calls /authority with merge_pull_request intent', () => {
  assert.match(source, /-X POST "\$CLEAN_WORKER_URL\/authority"/)
  assert.match(source, /intent: "merge_pull_request"/)
  assert.match(source, /workflow: "governed-deploy\.yml"/)
  assert.match(source, /max_executions: 1/)
})

test('workflow still calls /validate-pr and remains fail-closed', () => {
  assert.match(source, /-X POST "\$CLEAN_WORKER_URL\/validate-pr"/)
  assert.match(source, /NULL — PR authority endpoint error/)
  assert.match(source, /NULL — Invalid PR authority response/)
  assert.match(source, /NULL — PR validation endpoint error/)
  assert.match(source, /NULL — PR validation failed/)
})
