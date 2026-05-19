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

test('install-base telemetry cannot satisfy proof or authority requirements', () => {
  const report = deriveInstallBaseTelemetry()
  assert.equal(report.metrics.proof_persisted_count > 0, true)
  assert.equal(report.non_authoritative, true)
  assert.equal(report.creates_authority, false)
  assert.equal(report.creates_proof, false)
})

test('missing artifacts remain NULL-safe/UNKNOWN and do not mutate source state', () => {
  const before = readFileSync(join(process.cwd(), 'runtime/sovereignty_map.json'), 'utf8')
  const report = deriveInstallBaseTelemetry(join(process.cwd(), 'runtime'))
  assert.ok(report.metrics.install_base_artifacts_present === false || report.metrics.install_base_artifacts_present === 'UNKNOWN')
  const after = readFileSync(join(process.cwd(), 'runtime/sovereignty_map.json'), 'utf8')
  assert.equal(before, after)
})
