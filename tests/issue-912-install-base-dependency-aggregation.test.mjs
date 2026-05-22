import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('issue-912: install-base dependency aggregation includes remaining metrics fields', () => {
  assert.match(source, /governed_execution_total,/) 
  assert.match(source, /validated_execution_total,/) 
  assert.match(source, /blocked_execution_total: counts\.get\("invalid_execution_blocked"\) \|\| 0,/) 
  assert.match(source, /replay_rejection_total: counts\.get\("replay_rejected"\) \|\| 0,/) 
  assert.match(source, /proof_generated_total,/) 
  assert.match(source, /execution_surface_count,/) 
  assert.match(source, /cost_per_legitimate_execution: null,/) 
})

test('issue-912: proof and read-only semantics remain bounded and non-authoritative', () => {
  assert.match(source, /const proof_generated_total = counts\.get\("proof_generated"\) \|\| 0/) 
  assert.match(source, /url\.pathname === INSTALL_BASE_METRICS_ROUTE && request\.method !== "GET"/)
  assert.match(source, /route: INSTALL_BASE_METRICS_ROUTE/) 
  assert.match(source, /reason: "get_only"/) 
  assert.match(source, /read_only: true/) 
  assert.match(source, /mutation_capable: false/) 
  assert.match(source, /authority_issuance_influenced: false/) 
  assert.match(source, /validator_decisions_influenced: false/) 
  assert.match(source, /execution_eligibility_influenced: false/) 
  assert.match(source, /proof_legitimacy_influenced: false/) 
})
