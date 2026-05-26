import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationSql = readFileSync('migrations/0049_conflict_set_registry.sql', 'utf8')

// ── Schema structure ─────────────────────────────────────────────────────────

test('migration defines conflict_set_registry table', () => {
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS conflict_set_registry/)
})

test('conflict_state CHECK enforces canonical state vocabulary', () => {
  assert.match(
    migrationSql,
    /CHECK\(conflict_state IN \('OPEN','RESOLVED','SUPERSEDED','NULL'\)\)/,
  )
})

test('collapse_rule_applied CHECK enforces canonical tie-break vocabulary', () => {
  assert.match(
    migrationSql,
    /CHECK\(collapse_rule_applied IN \('RECONCILIABILITY','QUORUM_WEIGHT','CAUSAL_CLOCK','LEXICOGRAPHIC','UNRESOLVED'\)\)/,
  )
})

// ── Append-only invariants ───────────────────────────────────────────────────

test('csr_no_update trigger present and raises abort', () => {
  assert.match(migrationSql, /csr_no_update/)
  assert.match(migrationSql, /UPDATE is forbidden/)
})

test('csr_no_delete trigger present and raises abort', () => {
  assert.match(migrationSql, /csr_no_delete/)
  assert.match(migrationSql, /DELETE is forbidden/)
})

// ── Terminal state enforcement ───────────────────────────────────────────────

test('NULL conflict_state is terminal — csr_no_upgrade_from_null trigger present', () => {
  assert.match(migrationSql, /csr_no_upgrade_from_null/)
  assert.match(migrationSql, /NULL conflict_state is terminal/)
})

// ── Resolution consistency ───────────────────────────────────────────────────

test('RESOLVED state requires winner_head_hash — csr_resolved_requires_winner trigger present', () => {
  assert.match(migrationSql, /csr_resolved_requires_winner/)
  assert.match(migrationSql, /RESOLVED conflict state requires winner_head_hash/)
  assert.match(migrationSql, /RESOLVED conflict state requires collapse_rule_applied != UNRESOLVED/)
})

// ── Referential integrity ────────────────────────────────────────────────────

test('csr_supersedes_must_exist trigger enforces supersession referential integrity', () => {
  assert.match(migrationSql, /csr_supersedes_must_exist/)
  assert.match(migrationSql, /supersedes_conflict_set_id references non-existent conflict set record/)
})

test('csr_finality_class_must_exist trigger enforces finality_classification_id integrity', () => {
  assert.match(migrationSql, /csr_finality_class_must_exist/)
  assert.match(migrationSql, /finality_classification_registry/)
})

// ── Evidence-only discipline ─────────────────────────────────────────────────

test('evidence_only=1 and creates_authority=0 constraints enforced', () => {
  assert.match(migrationSql, /evidence_only\s+INTEGER.*DEFAULT 1.*CHECK\(evidence_only = 1\)/)
  assert.match(migrationSql, /creates_authority\s+INTEGER.*DEFAULT 0.*CHECK\(creates_authority = 0\)/)
})

test('raw_production_apply_path = DENIED guard present', () => {
  assert.match(migrationSql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
  assert.match(migrationSql, /raw_production_apply_path = 'DENIED'/)
})

// ── TypeScript module ────────────────────────────────────────────────────────

import {
  creates_authority,
  conflictStateFromResult,
  buildConflictSetId,
  selectWinningHead,
} from '../../src/lib/conflict-set.js'

test('conflict-set module is evidence-only (creates_authority is false)', () => {
  assert.equal(creates_authority, false)
})

test('conflictStateFromResult maps CONFLICT_NONE to null (no record needed)', () => {
  assert.equal(conflictStateFromResult('CONFLICT_NONE'), null)
})

test('conflictStateFromResult maps CONFLICT_UNRESOLVABLE to NULL (terminal)', () => {
  assert.equal(conflictStateFromResult('CONFLICT_UNRESOLVABLE'), 'NULL')
})

test('conflictStateFromResult maps detection results to OPEN', () => {
  assert.equal(conflictStateFromResult('CONFLICT_OBSERVED'), 'OPEN')
  assert.equal(conflictStateFromResult('CONFLICT_REQUIRES_RECONCILIATION'), 'OPEN')
  assert.equal(conflictStateFromResult('CONFLICT_REQUIRES_HUMAN_REVIEW'), 'OPEN')
})

test('buildConflictSetId returns deterministic csr_ prefixed id', () => {
  const id = buildConflictSetId('GLOBAL', '[]', '2026-01-01T00:00:00Z')
  assert.match(id, /^csr_[0-9a-f]{64}$/)
  // Deterministic: same inputs → same id
  assert.equal(id, buildConflictSetId('GLOBAL', '[]', '2026-01-01T00:00:00Z'))
})

test('selectWinningHead selects by reconciliability score first', () => {
  const heads = [
    { head_hash: 'aaa', reconciliability_score: 0.5, quorum_weight: 1.0, causal_clock_index: 1 },
    { head_hash: 'bbb', reconciliability_score: 0.9, quorum_weight: 0.5, causal_clock_index: 2 },
  ]
  const result = selectWinningHead(heads)
  assert.ok(result)
  assert.equal(result.winner.head_hash, 'bbb')
  assert.equal(result.collapse_rule, 'RECONCILIABILITY')
})

test('selectWinningHead falls back to quorum_weight when reconciliability ties', () => {
  const heads = [
    { head_hash: 'aaa', reconciliability_score: 0.8, quorum_weight: 0.6, causal_clock_index: 1 },
    { head_hash: 'bbb', reconciliability_score: 0.8, quorum_weight: 0.9, causal_clock_index: 2 },
  ]
  const result = selectWinningHead(heads)
  assert.ok(result)
  assert.equal(result.winner.head_hash, 'bbb')
  assert.equal(result.collapse_rule, 'QUORUM_WEIGHT')
})

test('selectWinningHead falls back to causal_clock_index (earliest wins) on double tie', () => {
  const heads = [
    { head_hash: 'aaa', reconciliability_score: 0.8, quorum_weight: 0.8, causal_clock_index: 5 },
    { head_hash: 'bbb', reconciliability_score: 0.8, quorum_weight: 0.8, causal_clock_index: 2 },
  ]
  const result = selectWinningHead(heads)
  assert.ok(result)
  assert.equal(result.winner.head_hash, 'bbb')
  assert.equal(result.collapse_rule, 'CAUSAL_CLOCK')
})

test('selectWinningHead falls back to lexicographic hash as last resort', () => {
  const heads = [
    { head_hash: 'zzz', reconciliability_score: 0.8, quorum_weight: 0.8, causal_clock_index: 1 },
    { head_hash: 'aaa', reconciliability_score: 0.8, quorum_weight: 0.8, causal_clock_index: 1 },
  ]
  const result = selectWinningHead(heads)
  assert.ok(result)
  assert.equal(result.winner.head_hash, 'aaa')
  assert.equal(result.collapse_rule, 'LEXICOGRAPHIC')
})

test('selectWinningHead returns null for empty competing_heads', () => {
  assert.equal(selectWinningHead([]), null)
})
