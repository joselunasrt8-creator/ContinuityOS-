import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('issue-871: governance observability routes are declared as GET-only evidence routes', () => {
  for (const route of [
    '/observability/governance',
    '/observability/governance/telemetry',
    '/observability/governance/metrics',
    '/observability/governance/replay-rejections',
    '/observability/governance/continuity-rejections',
    '/observability/governance/workflow-integrity-drift',
    '/observability/governance/reconciliation-failures',
  ]) {
    assert.match(source, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(source, /GOVERNANCE_OBSERVABILITY_ROUTES\.includes\(url\.pathname as any\) && request\.method !== "GET"/)
  assert.match(source, /reason: "get_only"/)
})

test('issue-871: governance observability remains non-authoritative and non-mutating', () => {
  for (const invariant of [
    'non_authoritative: true',
    'mutation_capable: false',
    'creates_authority: false',
    'influences_validator_outcome: false',
    'influences_execution_eligibility: false',
    'creates_proof_legitimacy: false',
    'mutates_runtime_lineage: false',
    'append_only_telemetry_preserved: true',
    'deterministic_metrics_preserved: true',
  ]) {
    assert.match(source, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('issue-871: required inspection surfaces are explicitly emitted', () => {
  for (const surface of [
    'telemetry_event_summaries',
    'governance_dependency_metrics',
    'replay_rejection_trends',
    'continuity_rejection_trends',
    'workflow_integrity_drift_trends',
    'reconciliation_failure_trends',
  ]) {
    assert.match(source, new RegExp(surface))
  }
})
