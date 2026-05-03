import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('matching workflow governed-deploy.yml maps to VALID canonical checks', () => {
  assert.match(source, /const CANONICAL_GOVERNED_WORKFLOW = "governed-deploy\.yml"/)
  assert.match(source, /canonicalWorkflowName\(constraints\.workflow\) === canonicalWorkflowName\(target\.workflow\)/)
  assert.match(source, /canonicalWorkflowName\(authorityTarget\?\.workflow\) !== CANONICAL_GOVERNED_WORKFLOW/)
})

test('mismatched workflow still fail-closed as NULL with workflow_mismatch', () => {
  assert.match(source, /return jsonResponse\(\{ status: "NULL", reason: "workflow_mismatch" \}\)/)
  assert.match(source, /if \(combined\.includes\("workflow"\)\) return "workflow_mismatch"/)
})

test('compile output and validate input agree on workflow identity', () => {
  assert.match(source, /workflow: normalizeWorkflowName\(target\.workflow \|\| CANONICAL_GOVERNED_WORKFLOW\)/)
  assert.match(source, /constraints\.workflow === CANONICAL_GOVERNED_WORKFLOW/)
})

test('execute rejects wrong workflow or action', () => {
  assert.match(source, /error: "wrong_workflow_or_action"/)
  assert.match(source, /authorityTarget\?\.action !== "deploy_production"/)
})
