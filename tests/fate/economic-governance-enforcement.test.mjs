import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CREATE_QUOTA_REGISTRY_SQL,
  CREATE_QUOTA_REGISTRY_INDEX_SQL,
  ECONOMIC_DRIFT_CLASS,
  ECONOMIC_TELEMETRY_EVENTS,
  validateExecutionQuota,
  consumeQuotaOnce,
  economicRejectionPayload,
} from '../../src/economic-governance.ts'

test('quota registry persists economic legitimacy fields', () => {
  assert.match(CREATE_QUOTA_REGISTRY_SQL, /CREATE TABLE IF NOT EXISTS quota_registry/i)
  assert.match(CREATE_QUOTA_REGISTRY_SQL, /quota_limit INTEGER NOT NULL/i)
  assert.match(CREATE_QUOTA_REGISTRY_SQL, /quota_remaining INTEGER NOT NULL/i)
  assert.match(CREATE_QUOTA_REGISTRY_SQL, /UNIQUE\(identity_id, continuity_id, resource_type\)/i)
  assert.match(CREATE_QUOTA_REGISTRY_INDEX_SQL, /idx_quota_registry_identity_continuity/i)
})

test('valid quota permits execution legitimacy', () => {
  const result = validateExecutionQuota({
    quota_id: 'q1',
    identity_id: 'id1',
    continuity_id: 'c1',
    resource_type: 'execution',
    quota_limit: 5,
    quota_used: 1,
    quota_remaining: 4,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })

  assert.equal(result.status, 'VALID')
})

test('economically invalid execution fails closed', () => {
  const exhausted = validateExecutionQuota({
    quota_id: 'q2',
    identity_id: 'id1',
    continuity_id: 'c1',
    resource_type: 'execution',
    quota_limit: 1,
    quota_used: 1,
    quota_remaining: 0,
    status: 'EXHAUSTED',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })

  assert.deepEqual(exhausted, {
    status: 'NULL',
    result: 'INVALID',
    reason: 'quota_inactive',
  })
})

test('quota decrement occurs exactly once after successful execution', () => {
  const updated = consumeQuotaOnce({
    quota_id: 'q3',
    identity_id: 'id1',
    continuity_id: 'c1',
    resource_type: 'execution',
    quota_limit: 2,
    quota_used: 0,
    quota_remaining: 2,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })

  assert.equal(updated.quota_used, 1)
  assert.equal(updated.quota_remaining, 1)
  assert.equal(updated.status, 'ACTIVE')
})

test('quota exhaustion transitions to EXHAUSTED state', () => {
  const updated = consumeQuotaOnce({
    quota_id: 'q4',
    identity_id: 'id1',
    continuity_id: 'c1',
    resource_type: 'execution',
    quota_limit: 1,
    quota_used: 0,
    quota_remaining: 1,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  })

  assert.equal(updated.quota_remaining, 0)
  assert.equal(updated.status, 'EXHAUSTED')
})

test('economic rejection emits economic drift telemetry context', () => {
  assert.ok(ECONOMIC_TELEMETRY_EVENTS.includes('QUOTA_REJECTED'))
  assert.equal(ECONOMIC_DRIFT_CLASS, 'economic_drift')

  const payload = economicRejectionPayload('quota_exhausted', {
    quota_id: 'q5',
    identity_id: 'id1',
    continuity_id: 'c1',
    resource_type: 'execution',
  })

  assert.equal(payload.status, 'NULL')
  assert.equal(payload.reason, 'quota_exhausted')
  assert.equal(payload.drift_class, 'economic_drift')
  assert.equal(payload.event_type, 'QUOTA_REJECTED')
})
