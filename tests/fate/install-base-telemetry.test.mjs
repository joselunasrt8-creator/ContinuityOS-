import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deriveInstallBaseTelemetry } from '../../src/install_base/report.mjs'

function readJson(path) {
  return JSON.parse(readFileSync(join(process.cwd(), path), 'utf8'))
}

test('install-base telemetry derives deterministic metrics with stable hash', () => {
  const a = deriveInstallBaseTelemetry()
  const b = deriveInstallBaseTelemetry()
  assert.deepEqual(a, b)
  assert.match(a.report_hash, /^[a-f0-9]{64}$/)
})

test('install-base telemetry snapshot is stable and read-only', () => {
  const derived = deriveInstallBaseTelemetry()
  const persisted = readJson('runtime/install_base/install_base_metrics.json')
  assert.deepEqual(derived, persisted)
  assert.equal(derived.read_only, true)
  assert.equal(derived.non_authoritative, true)
  assert.equal(derived.creates_authority, false)
  assert.equal(derived.creates_proof, false)
})

test('telemetry boundary invariants remain fail-closed and non-authoritative', () => {
  const report = deriveInstallBaseTelemetry()
  assert.equal(report.constraints.telemetry_cannot_authorize_execution, true)
  assert.equal(report.constraints.telemetry_cannot_become_proof, true)
  assert.equal(report.constraints.fail_closed_semantics_preserved, true)
  assert.equal(report.constraints.exact_object_enforcement_preserved, true)
})

test('required install-base categories and classifications are present', () => {
  const report = deriveInstallBaseTelemetry()
  assert.ok(report.categories.runtime_dependency)
  assert.ok(report.categories.workflow_dependency)
  assert.ok(report.categories.ecosystem_dependency)
  assert.ok(report.classifications.GOVERNED_EXECUTION_DEPENDENCY >= 0)
  assert.ok(report.classifications.WORKFLOW_GOVERNANCE_DEPENDENCY >= 0)
  assert.ok(report.classifications.FEDERATION_EVIDENCE_DEPENDENCY >= 0)
})

test('missing artifacts remain NULL-safe/UNKNOWN and do not mutate source state', () => {
  const before = readFileSync(join(process.cwd(), 'runtime/sovereignty_map.json'), 'utf8')
  const report = deriveInstallBaseTelemetry(join(process.cwd(), 'runtime'))
  assert.equal(report.metrics.install_base_artifacts_present, false)
  const after = readFileSync(join(process.cwd(), 'runtime/sovereignty_map.json'), 'utf8')
  assert.equal(before, after)
})
