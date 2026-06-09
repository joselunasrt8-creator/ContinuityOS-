import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const observabilityAdapterSource = readFileSync(new URL('../src/lib/runtime-observability-adapter.ts', import.meta.url), 'utf8')
const source = `${indexSource}
${observabilityAdapterSource}`

test('issue-903: telemetry remains non-authoritative and derived from runtime outcomes', () => {
  assert.match(source, /function installBaseTelemetryTypeFromRejection/)
  assert.match(source, /await emitInstallBaseTelemetryEvidenceBestEffort\(env, \{\s*event_type: installBaseType/)
  assert.match(source, /result: "NULL"/)
  assert.match(source, /await emitInstallBaseTelemetryEvidenceBestEffort\(env, \{ event_type: "proof_generated"/)
  assert.match(source, /await emitInstallBaseTelemetryEvidenceBestEffort\(env, \{ event_type: "governed_execution_completed"/)
})

test('issue-903: proof_generated_total derives from proof_generated telemetry records', () => {
  assert.match(source, /const proof_generated_total = counts.get\("proof_generated"\) \|\| 0/)
  assert.match(source, /const executions_with_valid_proof = proof_generated_total/)
})

test('issue-903: invariant guards are preserved as required strings', () => {
  for (const required of [
    'creates_authority: false',
    'mutation_capable: false',
    'influences_validator_outcome: false',
    'influences_execution_eligibility: false',
    'creates_proof_legitimacy: false',
  ]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})
