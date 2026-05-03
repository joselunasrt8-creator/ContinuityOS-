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

test('runtime validate-pr authority lookup is exact (repo, branch, pr_number, workflow)', () => {
  const runtime = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(runtime, /json_extract\(constraints, '\$\.repo'\) = \?1/)
  assert.match(runtime, /json_extract\(constraints, '\$\.branch'\) = \?2/)
  assert.match(runtime, /json_extract\(scope, '\$\.pr_number'\) = \?3/)
  assert.match(runtime, /json_extract\(constraints, '\$\.workflow'\) = \?4/)
  assert.match(runtime, /CANONICAL_GOVERNED_WORKFLOW/)
})

test('runtime validate-pr fail-closed checks include repo, branch, pr_number, workflow, intent, ACTIVE status, replay', () => {
  const runtime = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(runtime, /return invalid\("repo mismatch"\)/)
  assert.match(runtime, /return invalid\("authority not found"\)/)
  assert.match(runtime, /return invalid\("authority not active"\)/)
  assert.match(runtime, /return invalid\("authority intent mismatch"\)/)
  assert.match(runtime, /String\(scope\.pr_number \|\| ""\) === pr_number/)
  assert.match(runtime, /canonicalWorkflowName\(constraints\.workflow\) === CANONICAL_GOVERNED_WORKFLOW/)
  assert.match(runtime, /return invalid\("replay detected"\)/)
  assert.match(runtime, /status: "VALID",\s*result: "VALID"/)
})
