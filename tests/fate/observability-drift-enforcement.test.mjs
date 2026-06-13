import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const observabilityAdapterSource = readFileSync(new URL('../../src/lib/runtime-observability-adapter.ts', import.meta.url), 'utf8')

test('runtime persists observability events with legitimacy references', () => {
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS observability_registry[\s\S]*event_id TEXT PRIMARY KEY[\s\S]*event_type TEXT NOT NULL[\s\S]*decision_id TEXT[\s\S]*authority_id TEXT[\s\S]*execution_id TEXT[\s\S]*proof_id TEXT[\s\S]*severity TEXT NOT NULL[\s\S]*payload TEXT NOT NULL/,
    'observability_registry must persist event identity, references, severity, and payload',
  )

  assert.match(
    observabilityAdapterSource,
    /async function emitTelemetry[\s\S]*INSERT INTO observability_registry[\s\S]*event_id,event_type,decision_id,authority_id,execution_id,proof_id,severity,payload,created_at/,
    'emitTelemetry must persist observability events with legitimacy references',
  )
})

test('runtime persists drift events with required drift classification', () => {
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS drift_registry[\s\S]*drift_id TEXT PRIMARY KEY[\s\S]*drift_class TEXT NOT NULL[\s\S]*severity TEXT NOT NULL[\s\S]*decision_id TEXT[\s\S]*execution_id TEXT[\s\S]*payload TEXT NOT NULL[\s\S]*detected_by TEXT NOT NULL[\s\S]*resolution_status TEXT NOT NULL/,
    'drift_registry must persist drift class, severity, references, payload, detector, and resolution status',
  )

  assert.match(
    observabilityAdapterSource,
    /async function recordDrift[\s\S]*INSERT INTO drift_registry[\s\S]*drift_id,drift_class,severity,decision_id,execution_id,payload,detected_by,resolution_status,created_at/,
    'recordDrift must persist drift events with required classifications',
  )
})

test('rejection path emits telemetry and drift records together', () => {
  assert.match(
    source,
    /async function rejectWithTelemetry[\s\S]*if \(telemetry\.event_type\)[\s\S]*await emitTelemetry/,
    'rejectWithTelemetry must emit observability telemetry when an event_type is provided',
  )

  assert.match(
    source,
    /async function rejectWithTelemetry[\s\S]*if \(telemetry\.drift_class\)[\s\S]*await recordDrift/,
    'rejectWithTelemetry must persist drift evidence when a drift_class is provided',
  )
})

test('runtime classifies core legitimacy drift types', () => {
  assert.match(source, /type DriftClass = [\s\S]*"authority_drift"/, 'authority drift must be classified')
  assert.match(source, /type DriftClass = [\s\S]*"hash_drift"/, 'hash drift must be classified')
  assert.match(source, /type DriftClass = [\s\S]*"execution_drift"/, 'execution drift must be classified')
  assert.match(source, /type DriftClass = [\s\S]*"proof_drift"/, 'proof drift must be classified')
  assert.match(source, /type DriftClass = [\s\S]*"replay_drift"/, 'replay drift must be classified')
  assert.match(source, /type DriftClass = [\s\S]*"registry_drift"/, 'registry drift must be classified')
})

test('runtime emits telemetry for core legitimacy transitions and failures', () => {
  assert.match(source, /event_type: "REPLAY_BLOCKED"/, 'replay blocking must emit telemetry')
  assert.match(source, /event_type: "HASH_MISMATCH"/, 'hash mismatch must emit telemetry')
  assert.match(source, /event_type: "PROOF_PERSISTED"/, 'proof persistence must emit telemetry')
  assert.match(source, /event_type: "AUTHORITY_CONSUMED"/, 'authority consumption must emit telemetry')
  assert.match(source, /event_type: "VALIDATION_REJECTED"/, 'validation rejection must emit telemetry')
})

test('silent invalid route drift is rejected and classified', () => {
  assert.match(
    source,
    /if \(request\.method === "POST" && !canonicalRuntimeRoute\)[\s\S]*recordDrift\(env, \{ drift_class: "registry_drift"[\s\S]*indicator: "invalid_route_invocation"/,
    'invalid mutation route attempts must create registry_drift evidence',
  )

  assert.match(
    source,
    /return json\(\{ status: "NULL", reason: "not_found" \}, 404\)/,
    'invalid mutation route attempts must fail closed as NULL',
  )
})
