export type EconomicQuotaRecord = {
  quota_id: string
  identity_id: string
  continuity_id: string
  resource_type: string
  quota_limit: number
  quota_used: number
  quota_remaining: number
  status: 'ACTIVE' | 'EXHAUSTED' | 'REVOKED'
  created_at: string
  updated_at: string
}

export const ECONOMIC_SCHEMA_COLUMNS = {
  quota_registry: [
    'quota_id',
    'identity_id',
    'continuity_id',
    'resource_type',
    'quota_limit',
    'quota_used',
    'quota_remaining',
    'status',
    'created_at',
    'updated_at',
  ],
} as const

export const CREATE_QUOTA_REGISTRY_SQL = `
CREATE TABLE IF NOT EXISTS quota_registry (
  quota_id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  continuity_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  quota_limit INTEGER NOT NULL,
  quota_used INTEGER NOT NULL DEFAULT 0,
  quota_remaining INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(identity_id, continuity_id, resource_type)
)`

export const CREATE_QUOTA_REGISTRY_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_quota_registry_identity_continuity
ON quota_registry(identity_id, continuity_id, resource_type, status)
`

export const ECONOMIC_TELEMETRY_EVENTS = [
  'QUOTA_RESERVED',
  'QUOTA_CONSUMED',
  'QUOTA_REJECTED',
] as const

export const ECONOMIC_DRIFT_CLASS = 'economic_drift' as const

export type EconomicValidationResult =
  | { status: 'VALID'; quota: EconomicQuotaRecord }
  | { status: 'NULL'; result: 'INVALID'; reason: 'quota_missing' | 'quota_exhausted' | 'quota_inactive' }

export function validateExecutionQuota(quota: EconomicQuotaRecord | null): EconomicValidationResult {
  if (!quota) return { status: 'NULL', result: 'INVALID', reason: 'quota_missing' }
  if (quota.status !== 'ACTIVE') return { status: 'NULL', result: 'INVALID', reason: 'quota_inactive' }
  if (!Number.isFinite(quota.quota_remaining) || quota.quota_remaining <= 0) {
    return { status: 'NULL', result: 'INVALID', reason: 'quota_exhausted' }
  }
  return { status: 'VALID', quota }
}

export function consumeQuotaOnce(quota: EconomicQuotaRecord): EconomicQuotaRecord {
  const quota_used = quota.quota_used + 1
  const quota_remaining = Math.max(0, quota.quota_remaining - 1)
  return {
    ...quota,
    quota_used,
    quota_remaining,
    status: quota_remaining === 0 ? 'EXHAUSTED' : 'ACTIVE',
    updated_at: new Date().toISOString(),
  }
}

export function economicRejectionPayload(reason: string, quota: Partial<EconomicQuotaRecord> | null = null) {
  return {
    status: 'NULL',
    result: 'INVALID',
    reason,
    drift_class: ECONOMIC_DRIFT_CLASS,
    event_type: 'QUOTA_REJECTED',
    quota_id: quota?.quota_id ?? null,
    identity_id: quota?.identity_id ?? null,
    continuity_id: quota?.continuity_id ?? null,
    resource_type: quota?.resource_type ?? null,
  }
}
