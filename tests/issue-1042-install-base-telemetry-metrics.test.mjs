import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const observabilityAdapterSource = readFileSync(new URL('../src/lib/runtime-observability-adapter.ts', import.meta.url), 'utf8')
const source = `${indexSource}
${observabilityAdapterSource}`
const telemetryModule = readFileSync(new URL('../src/telemetry.ts', import.meta.url), 'utf8')

// ── Telemetry module existence and isolation ──────────────────────────────────

test('issue-1042: telemetry module exists as a standalone file', () => {
  assert.ok(telemetryModule.length > 0, 'src/telemetry.ts must exist and be non-empty')
})

test('issue-1042: telemetry module declares all 7 required canonical counter names', () => {
  assert.match(telemetryModule, /governed_execution_total/)
  assert.match(telemetryModule, /blocked_execution_total/)
  assert.match(telemetryModule, /proof_generated_total/)
  assert.match(telemetryModule, /replay_rejected_total/)
  assert.match(telemetryModule, /continuity_revocation_total/)
  assert.match(telemetryModule, /reconciliation_failure_total/)
  assert.match(telemetryModule, /execution_surface_count/)
})

test('issue-1042: telemetry module classification declares creates_authority false', () => {
  assert.match(telemetryModule, /creates_authority: false/)
})

test('issue-1042: telemetry module classification declares validates_objects false', () => {
  assert.match(telemetryModule, /validates_objects: false/)
})

test('issue-1042: telemetry module classification declares executes_actions false', () => {
  assert.match(telemetryModule, /executes_actions: false/)
})

test('issue-1042: telemetry module classification declares creates_proof false', () => {
  assert.match(telemetryModule, /creates_proof: false/)
})

test('issue-1042: telemetry module classification declares mutates_registries false', () => {
  assert.match(telemetryModule, /mutates_registries: false/)
})

test('issue-1042: telemetry module classification declares repairs_failures false', () => {
  assert.match(telemetryModule, /repairs_failures: false/)
})

test('issue-1042: telemetry module classification declares turns_failed_executions_valid false', () => {
  assert.match(telemetryModule, /turns_failed_executions_valid: false/)
})

test('issue-1042: telemetry module declares read_only: true and non_authoritative: true', () => {
  assert.match(telemetryModule, /read_only: true/)
  assert.match(telemetryModule, /non_authoritative: true/)
  assert.match(telemetryModule, /evidence_only: true/)
})

test('issue-1042: telemetry module exports readInstallBaseCounters as pure read function without DB writes', () => {
  assert.match(telemetryModule, /export function readInstallBaseCounters/)
  assert.doesNotMatch(telemetryModule, /INSERT/)
  assert.doesNotMatch(telemetryModule, /UPDATE/)
  assert.doesNotMatch(telemetryModule, /DELETE/)
})

test('issue-1042: telemetry module does not reference authoritative registries', () => {
  assert.doesNotMatch(telemetryModule, /authority_registry/)
  assert.doesNotMatch(telemetryModule, /validation_registry/)
  assert.doesNotMatch(telemetryModule, /execution_registry/)
  assert.doesNotMatch(telemetryModule, /proof_registry/)
})

test('issue-1042: telemetry module exports TELEMETRY_ROUTE as /metrics', () => {
  assert.match(telemetryModule, /TELEMETRY_ROUTE = "\/metrics"/)
})

// ── /metrics route in src/index.ts ───────────────────────────────────────────

test('issue-1042: /metrics route constant is declared in src/index.ts', () => {
  assert.match(source, /TELEMETRY_ROUTE = "\/metrics"/)
})

test('issue-1042: /metrics endpoint is GET-only (non-GET method returns 405)', () => {
  assert.match(source, /url\.pathname === TELEMETRY_ROUTE && request\.method !== "GET"/)
})

test('issue-1042: /metrics 405 response declares creates_authority false', () => {
  assert.match(source, /url\.pathname === TELEMETRY_ROUTE && request\.method !== "GET".*creates_authority: false/)
})

test('issue-1042: /metrics endpoint declares all 7 canonical counter names mapping to install_base_telemetry_registry events', () => {
  assert.match(source, /governed_execution_total: telemetryCounts\.get\("governed_execution_completed"\)/)
  assert.match(source, /blocked_execution_total: telemetryCounts\.get\("invalid_execution_blocked"\)/)
  assert.match(source, /proof_generated_total: telemetryCounts\.get\("proof_generated"\)/)
  assert.match(source, /replay_rejected_total: telemetryCounts\.get\("replay_rejected"\)/)
  assert.match(source, /continuity_revocation_total: telemetryCounts\.get\("revocation_propagation_observed"\)/)
  assert.match(source, /reconciliation_failure_total: telemetryCounts\.get\("reconciliation_failure_detected"\)/)
  assert.match(source, /execution_surface_count: telemetryCounts\.get\("execution_surface_observed"\)/)
})

test('issue-1042: /metrics endpoint response declares all isolation invariants', () => {
  assert.match(source, /executes_actions: false/)
  assert.match(source, /creates_proof: false/)
  assert.match(source, /mutates_registries: false/)
  assert.match(source, /repairs_failures: false/)
  assert.match(source, /turns_failed_executions_valid: false/)
})

test('issue-1042: installBaseGovernanceMetrics includes all 3 new canonical counter names', () => {
  assert.match(source, /replay_rejected_total: counts\.get\("replay_rejected"\) \|\| 0/)
  assert.match(source, /continuity_revocation_total: counts\.get\("revocation_propagation_observed"\) \|\| 0/)
  assert.match(source, /reconciliation_failure_total: counts\.get\("reconciliation_failure_detected"\) \|\| 0/)
})

// ── Telemetry cannot create authority ────────────────────────────────────────

test('issue-1042: telemetry cannot create authority — /metrics handler does not INSERT into authority_registry', () => {
  const metricsHandlerMatch = source.match(/url\.pathname === TELEMETRY_ROUTE && request\.method === "GET"[\s\S]*?(?=\n    if \(url\.pathname|$)/)
  assert.ok(metricsHandlerMatch, 'TELEMETRY_ROUTE handler must be present')
  const handlerBlock = metricsHandlerMatch[0]
  assert.doesNotMatch(handlerBlock, /INSERT INTO authority_registry/)
  assert.doesNotMatch(handlerBlock, /UPDATE authority_registry/)
})

test('issue-1042: telemetry cannot validate objects — /metrics handler does not INSERT into validation_registry', () => {
  const metricsHandlerMatch = source.match(/url\.pathname === TELEMETRY_ROUTE && request\.method === "GET"[\s\S]*?(?=\n    if \(url\.pathname|$)/)
  assert.ok(metricsHandlerMatch)
  const handlerBlock = metricsHandlerMatch[0]
  assert.doesNotMatch(handlerBlock, /INSERT INTO validation_registry/)
  assert.doesNotMatch(handlerBlock, /UPDATE validation_registry/)
})

test('issue-1042: telemetry cannot execute actions — /metrics handler does not INSERT into execution_registry', () => {
  const metricsHandlerMatch = source.match(/url\.pathname === TELEMETRY_ROUTE && request\.method === "GET"[\s\S]*?(?=\n    if \(url\.pathname|$)/)
  assert.ok(metricsHandlerMatch)
  const handlerBlock = metricsHandlerMatch[0]
  assert.doesNotMatch(handlerBlock, /INSERT INTO execution_registry/)
  assert.doesNotMatch(handlerBlock, /UPDATE execution_registry/)
})

test('issue-1042: telemetry cannot create proof — /metrics handler does not INSERT into proof_registry', () => {
  const metricsHandlerMatch = source.match(/url\.pathname === TELEMETRY_ROUTE && request\.method === "GET"[\s\S]*?(?=\n    if \(url\.pathname|$)/)
  assert.ok(metricsHandlerMatch)
  const handlerBlock = metricsHandlerMatch[0]
  assert.doesNotMatch(handlerBlock, /INSERT INTO proof_registry/)
  assert.doesNotMatch(handlerBlock, /UPDATE proof_registry/)
})

test('issue-1042: telemetry cannot mutate AEO registry — /metrics handler does not INSERT into aeo_registry', () => {
  const metricsHandlerMatch = source.match(/url\.pathname === TELEMETRY_ROUTE && request\.method === "GET"[\s\S]*?(?=\n    if \(url\.pathname|$)/)
  assert.ok(metricsHandlerMatch)
  const handlerBlock = metricsHandlerMatch[0]
  assert.doesNotMatch(handlerBlock, /INSERT INTO aeo_registry/)
  assert.doesNotMatch(handlerBlock, /UPDATE aeo_registry/)
})

test('issue-1042: telemetry cannot repair failures — /metrics GET handler only SELECTs from install_base_telemetry_registry', () => {
  // Target the GET handler block specifically (the second TELEMETRY_ROUTE occurrence)
  const getHandlerMatch = source.match(/url\.pathname === TELEMETRY_ROUTE && request\.method === "GET"[\s\S]*?(?=\n    if \(url\.pathname|$)/)
  assert.ok(getHandlerMatch, 'TELEMETRY_ROUTE GET handler must be present')
  const handlerBlock = getHandlerMatch[0]
  // Must read from install_base_telemetry_registry
  assert.match(handlerBlock, /SELECT event_type, COUNT\(\*\) AS count FROM install_base_telemetry_registry/)
  // Must not write to any table
  assert.doesNotMatch(handlerBlock, /INSERT INTO/)
  assert.doesNotMatch(handlerBlock, /UPDATE /)
  assert.doesNotMatch(handlerBlock, /DELETE FROM/)
})

test('issue-1042: telemetry cannot turn failed executions valid — /metrics response carries status NULL not VALID/EXECUTED/PROVEN', () => {
  const metricsHandlerMatch = source.match(/url\.pathname === TELEMETRY_ROUTE && request\.method === "GET"[\s\S]*?(?=\n    if \(url\.pathname|$)/)
  assert.ok(metricsHandlerMatch)
  const handlerBlock = metricsHandlerMatch[0]
  // /metrics must emit status: "NULL" — never VALID, EXECUTED, or PROVEN
  assert.match(handlerBlock, /status: "NULL"/)
  assert.doesNotMatch(handlerBlock, /status: "VALID"/)
  assert.doesNotMatch(handlerBlock, /status: "EXECUTED"/)
  assert.doesNotMatch(handlerBlock, /status: "PROVEN"/)
  assert.doesNotMatch(handlerBlock, /status: "AUTHORIZED"/)
  // Isolation declaration must be present
  assert.match(handlerBlock, /turns_failed_executions_valid: false/)
})

// ── Invariant observability ───────────────────────────────────────────────────

test('issue-1042: telemetry observes canonical invariant via governed_execution_completed event — not by satisfying it', () => {
  // The canonical invariant (VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID) is satisfied in /execute.
  // Telemetry counts events emitted after the invariant is satisfied — it does not satisfy it.
  assert.match(source, /governed_execution_total: telemetryCounts\.get\("governed_execution_completed"\)/)
  // The invariant gate lives in /execute, not in the /metrics handler
  assert.match(source, /url\.pathname === "\/execute"/)
})

test('issue-1042: /metrics route is included in NON_EXECUTABLE_OBSERVABILITY_ROUTES', () => {
  assert.match(source, /TELEMETRY_ROUTE,\s*\n\s*\.\.\.GOVERNANCE_OBSERVABILITY_ROUTES|INSTALL_BASE_METRICS_ROUTE,\s*\n\s*TELEMETRY_ROUTE/)
})

test('issue-1042: telemetry module readInstallBaseCounters maps counters to correct install_base_telemetry_registry event types', () => {
  assert.match(telemetryModule, /governed_execution_total.*governed_execution_completed/)
  assert.match(telemetryModule, /blocked_execution_total.*invalid_execution_blocked/)
  assert.match(telemetryModule, /proof_generated_total.*proof_generated/)
  assert.match(telemetryModule, /replay_rejected_total.*replay_rejected/)
  assert.match(telemetryModule, /continuity_revocation_total.*revocation_propagation_observed/)
  assert.match(telemetryModule, /reconciliation_failure_total.*reconciliation_failure_detected/)
  assert.match(telemetryModule, /execution_surface_count.*execution_surface_observed/)
})
