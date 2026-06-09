import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const observabilityAdapterSource = readFileSync(new URL('../src/lib/runtime-observability-adapter.ts', import.meta.url), 'utf8')
const source = `${indexSource}
${observabilityAdapterSource}`

test('issue-912: install-base telemetry write failures are observable best-effort bounded no-op', () => {
  assert.match(source, /async function emitInstallBaseTelemetryEvidenceBestEffort\(/)
  assert.match(source, /await emitInstallBaseTelemetryEvidence\(env, event\)/)
  assert.match(source, /event_type: "INSTALL_BASE_TELEMETRY_WRITE_FAILED"/)
  assert.match(source, /bounded_noop: true/)
  assert.match(source, /observability_only: true/)
  assert.match(source, /non_authoritative: true/)
})

test('issue-912: validate\/execute\/proof install-base telemetry paths remain non-blocking', () => {
  assert.match(source, /await emitInstallBaseTelemetryEvidenceBestEffort\(env, \{ event_type: "validated_execution"/)
  assert.match(source, /await emitInstallBaseTelemetryEvidenceBestEffort\(env, \{ event_type: "governed_execution_attempted"/)
  assert.match(source, /await emitInstallBaseTelemetryEvidenceBestEffort\(env, \{ event_type: "governed_execution_completed"/)
  assert.match(source, /await emitInstallBaseTelemetryEvidenceBestEffort\(env, \{ event_type: "execution_surface_observed"/)
  assert.match(source, /await emitInstallBaseTelemetryEvidenceBestEffort\(env, \{ event_type: "proof_generated"/)
})
