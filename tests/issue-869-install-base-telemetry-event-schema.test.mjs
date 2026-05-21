import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../migrations/0044_install_base_telemetry_registry.sql', import.meta.url), 'utf8')

const CANONICAL_TYPES = [
  'governed_execution_attempted',
  'governed_execution_completed',
  'invalid_execution_blocked',
  'replay_rejected',
  'continuity_rejected',
  'workflow_integrity_drift',
  'reconciliation_failure_detected',
  'proof_generated',
  'proof_rejected',
]

test('issue-869: canonical install-base telemetry event types are deterministic and evidence-only', () => {
  for (const eventType of CANONICAL_TYPES) {
    assert.match(source, new RegExp(`'${eventType}'`))
    assert.match(migration, new RegExp(`'${eventType}'`))
  }
  assert.match(source, /type InstallBaseTelemetryEventType =/)
  assert.match(source, /emitInstallBaseTelemetryEvidence/)
  assert.match(source, /telemetry: "evidence_only"/)
  assert.match(source, /non_authoritative: true/)
  assert.match(source, /append_only: true/)
})

test('issue-869: install-base telemetry is persisted separately and append-only', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS install_base_telemetry_registry/)
  assert.match(source, /CREATE TABLE IF NOT EXISTS install_base_telemetry_registry/)
  assert.doesNotMatch(migration, /FOREIGN KEY \(authority_id\) REFERENCES authority_registry/)
  assert.doesNotMatch(migration, /FOREIGN KEY \(proof_id\) REFERENCES proof_registry/)
  for (const guard of [
    "CHECK (evidence_only='true')",
    "CHECK (non_authoritative='true')",
    "CHECK (append_only='true')",
    'trg_install_base_telemetry_registry_no_update',
    'trg_install_base_telemetry_registry_no_delete',
  ]) {
    assert.match(migration, new RegExp(guard.replace(/[()]/g, '\\$&')))
  }
})

test('issue-869: telemetry cannot become authority/proof and fail-closed mismatch exists', () => {
  assert.match(source, /lineage_origin_match TEXT NOT NULL CHECK \(lineage_origin_match IN \('MATCH','MISMATCH','UNKNOWN'\)\)/)
  assert.match(source, /evidence_only TEXT NOT NULL CHECK \(evidence_only='true'\)/)
  assert.match(source, /non_authoritative TEXT NOT NULL CHECK \(non_authoritative='true'\)/)
  assert.match(source, /append_only TEXT NOT NULL CHECK \(append_only='true'\)/)
})
