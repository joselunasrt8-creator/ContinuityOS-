import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationSql = readFileSync('migrations/0051_revocation_liveness_registry.sql', 'utf8')

// ── Schema structure ─────────────────────────────────────────────────────────

test('migration defines revocation_liveness_registry table', () => {
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS revocation_liveness_registry/)
})

test('channel_type CHECK enforces canonical type vocabulary', () => {
  assert.match(
    migrationSql,
    /CHECK\(channel_type IN \('authority','continuity','proof','epoch','session','validation'\)\)/,
  )
})

test('within_sla CHECK restricts to 0 or 1', () => {
  assert.match(migrationSql, /within_sla.*CHECK\(within_sla IN \(0,1\)\)/)
})

test('max_allowed_silence_ms CHECK enforces positive policy threshold', () => {
  assert.match(migrationSql, /max_allowed_silence_ms.*CHECK\(max_allowed_silence_ms > 0\)/)
})

test('observed_silence_ms CHECK enforces non-negative value', () => {
  assert.match(migrationSql, /observed_silence_ms.*CHECK\(observed_silence_ms >= 0\)/)
})

// ── Append-only invariants ───────────────────────────────────────────────────

test('rlr_no_update trigger present and raises abort', () => {
  assert.match(migrationSql, /rlr_no_update/)
  assert.match(migrationSql, /UPDATE is forbidden/)
})

test('rlr_no_delete trigger present and raises abort', () => {
  assert.match(migrationSql, /rlr_no_delete/)
  assert.match(migrationSql, /DELETE is forbidden/)
})

// ── SLA consistency enforcement ──────────────────────────────────────────────

test('rlr_within_sla_consistency trigger enforces silence math', () => {
  assert.match(migrationSql, /rlr_within_sla_consistency/)
  assert.match(migrationSql, /within_sla=1 inconsistent: observed_silence_ms exceeds max_allowed_silence_ms/)
  assert.match(migrationSql, /within_sla=0 inconsistent: observed_silence_ms is within max_allowed_silence_ms/)
})

// ── Referential integrity ────────────────────────────────────────────────────

test('rlr_finality_class_must_exist trigger enforces finality_classification_id integrity', () => {
  assert.match(migrationSql, /rlr_finality_class_must_exist/)
  assert.match(migrationSql, /finality_classification_registry/)
})

test('rlr_quorum_attestation_must_exist trigger enforces quorum_attestation_id integrity', () => {
  assert.match(migrationSql, /rlr_quorum_attestation_must_exist/)
  assert.match(migrationSql, /quorum_attestation_registry/)
})

// ── Evidence-only discipline ─────────────────────────────────────────────────

test('evidence_only=1 and creates_authority=0 constraints enforced', () => {
  assert.match(migrationSql, /evidence_only\s+INTEGER.*DEFAULT 1.*CHECK\(evidence_only = 1\)/)
  assert.match(migrationSql, /creates_authority\s+INTEGER.*DEFAULT 0.*CHECK\(creates_authority = 0\)/)
})

test('replay_neutral=1 constraint enforced', () => {
  assert.match(migrationSql, /replay_neutral\s+INTEGER.*DEFAULT 1.*CHECK\(replay_neutral = 1\)/)
})

test('raw_production_apply_path = DENIED guard present', () => {
  assert.match(migrationSql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
  assert.match(migrationSql, /raw_production_apply_path = 'DENIED'/)
})

// ── TypeScript module ────────────────────────────────────────────────────────

import {
  creates_authority,
  buildRevocationLivenessId,
  evaluateLiveness,
  evaluateLPredicate,
} from '../../src/lib/revocation-liveness.js'

test('revocation-liveness module is evidence-only (creates_authority is false)', () => {
  assert.equal(creates_authority, false)
})

test('buildRevocationLivenessId returns deterministic rlr_ prefixed id', () => {
  const id = buildRevocationLivenessId('ch-1', '2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z')
  assert.match(id, /^rlr_[0-9a-f]{64}$/)
  assert.equal(id, buildRevocationLivenessId('ch-1', '2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z'))
})

test('evaluateLiveness within_sla=1 when silence is within threshold', () => {
  const last_observed_at = new Date(Date.now() - 5_000).toISOString()
  const result = evaluateLiveness(last_observed_at, 60_000)
  assert.equal(result.within_sla, 1)
  assert.ok(result.observed_silence_ms < 60_000)
})

test('evaluateLiveness within_sla=0 when silence exceeds threshold', () => {
  const last_observed_at = new Date(Date.now() - 120_000).toISOString()
  const result = evaluateLiveness(last_observed_at, 60_000)
  assert.equal(result.within_sla, 0)
  assert.ok(result.observed_silence_ms >= 60_000)
})

test('evaluateLiveness within_sla=0 for unparseable timestamp', () => {
  const result = evaluateLiveness('not-a-date', 60_000)
  assert.equal(result.within_sla, 0)
})

test('evaluateLiveness uses injectable now_ms for deterministic testing', () => {
  const base = 1_000_000
  const result = evaluateLiveness(new Date(base - 30_000).toISOString(), 60_000, base)
  assert.equal(result.within_sla, 1)
  assert.equal(result.observed_silence_ms, 30_000)
})

test('evaluateLPredicate returns true only when all channels are within SLA', () => {
  assert.equal(evaluateLPredicate([{ within_sla: 1 }, { within_sla: 1 }]), true)
  assert.equal(evaluateLPredicate([{ within_sla: 1 }, { within_sla: 0 }]), false)
  assert.equal(evaluateLPredicate([{ within_sla: 0 }]), false)
})

test('evaluateLPredicate returns false for empty channel set (no liveness evidence)', () => {
  assert.equal(evaluateLPredicate([]), false)
})
