import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('active continuity recursively traverses ancestry to a root', () => {
  assert.match(source, /while \(current_id\)/, 'continuity validation must traverse parent links recursively')
  assert.match(source, /visited\.has\(current_id\)/, 'continuity validation must detect cycles')
  assert.match(source, /const root = ancestry\[ancestry\.length - 1\]/, 'continuity validation must terminate at a root')
  assert.match(source, /!root \|\| root\.parent_continuity_id/, 'continuity validation must reject broken lineage without a root')
})

test('invalid ancestor status and expiry recursively invalidate descendants', () => {
  assert.match(source, /WITH RECURSIVE lineage\(continuity_id\)/, 'revocation cascade must resolve descendants recursively at write time')
  assert.match(source, /cascadeExpiration\(env, current_id, now\)/, 'expired ancestors must trigger descendant expiration cascade')
  assert.match(source, /invalidateContinuityLineage[\s\S]*UPDATE continuity_registry SET status=\?2, revoked_at=COALESCE\(revoked_at, \?3\)/, 'cascade must update all invalidated continuity records')
  assert.match(source, /UPDATE invocation_registry SET status='REVOKED'[\s\S]*continuity_id IN \(SELECT continuity_id FROM lineage\)/, 'cascade must invalidate replay reservations across lineage')
})

test('continuity creation rejects orphaned parents and direct cycles', () => {
  assert.match(source, /parent_continuity_id === continuity_id/, 'direct self-parent cycles must be rejected')
  assert.match(source, /const parent = await activeContinuity\(env, parent_continuity_id, session\)/, 'parent continuity must be fully validated before child creation')
  assert.match(source, /reason: "invalid_parent_continuity"/, 'orphaned or invalid parents must fail closed')
  assert.match(source, /orphaned_continuity_prevented/, 'orphan prevention must be observable')
})

test('proof persists reconstructable continuity ancestry evidence', () => {
  assert.match(source, /continuity_ancestry: continuity\.ancestry \|\| \[\]/, 'proof lineage must include validated continuity ancestry')
  assert.match(source, /validation_id: String\(validation\.validation_id \|\| ""\)/, 'proof lineage must bind validation evidence')
  assert.match(source, /invocation_nonce: String\(execution\.invocation_nonce \|\| ""\)/, 'proof lineage must bind execution replay evidence')
})
