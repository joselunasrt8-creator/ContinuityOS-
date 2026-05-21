import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
const governedDeployWorkflow = readFileSync(new URL('../../.github/workflows/governed-deploy.yml', import.meta.url), 'utf8')
const workflowDir = new URL('../../.github/workflows/', import.meta.url)

test('package deploy script remains disabled', () => {
  assert.match(packageJson.scripts.deploy, /Direct deploy disabled/)
  assert.match(packageJson.scripts.deploy, /exit 1/)
})

test('workflows do not call stale endpoints', () => {
  assert.doesNotMatch(governedDeployWorkflow, /validate-pr/)
  assert.doesNotMatch(governedDeployWorkflow, /\/validate-pr\b/)
  assert.match(governedDeployWorkflow, /\/validate/)
  assert.match(governedDeployWorkflow, /\/execute/)
  assert.match(governedDeployWorkflow, /\/proof/)
})

test('no direct deploy workflow bypass exists', () => {
  const directDeployWorkflow = join(workflowDir.pathname, 'deploy.yml')
  assert.equal(existsSync(directDeployWorkflow), false)
  assert.doesNotMatch(governedDeployWorkflow, /^\s*wrangler deploy\b/m)
  assert.match(governedDeployWorkflow, /"\$PROOF_STATUS" != "PROVEN"/)
})

test('no /execute path works without prior /validate evidence', () => {
  assert.match(source, /SELECT \* FROM validation_registry WHERE decision_id=\?1 AND validated_object_hash=\?2 AND invocation_nonce=\?3 AND result='VALID'/)
  assert.match(source, /if \(!validation\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"missing_validation" \}/)
  assert.match(source, /indicator: "validation_lineage_missing_or_mismatched"/)
})
