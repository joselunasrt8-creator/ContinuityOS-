import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationSql = readFileSync('migrations/0050_quorum_attestation_registry.sql', 'utf8')

// ── Schema structure ─────────────────────────────────────────────────────────

test('migration defines quorum_attestation_registry table', () => {
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS quorum_attestation_registry/)
})

test('attested_object_type CHECK enforces canonical object type vocabulary', () => {
  assert.match(
    migrationSql,
    /CHECK\(attested_object_type IN \('authority','aeo','execution','proof','session','continuity','validation','epoch_head','registry_head'\)\)/,
  )
})

test('quorum_threshold_fraction CHECK enforces valid fraction range', () => {
  assert.match(
    migrationSql,
    /quorum_threshold_fraction.*CHECK\(quorum_threshold_fraction > 0 AND quorum_threshold_fraction <= 1\)/,
  )
})

test('quorum_met CHECK restricts to 0 or 1', () => {
  assert.match(migrationSql, /quorum_met.*CHECK\(quorum_met IN \(0,1\)\)/)
})

// ── Append-only invariants ───────────────────────────────────────────────────

test('qar_no_update trigger present and raises abort', () => {
  assert.match(migrationSql, /qar_no_update/)
  assert.match(migrationSql, /UPDATE is forbidden/)
})

test('qar_no_delete trigger present and raises abort', () => {
  assert.match(migrationSql, /qar_no_delete/)
  assert.match(migrationSql, /DELETE is forbidden/)
})

// ── Quorum consistency enforcement ──────────────────────────────────────────

test('qar_quorum_met_consistency trigger enforces weight math', () => {
  assert.match(migrationSql, /qar_quorum_met_consistency/)
  assert.match(migrationSql, /NEW\.weight_approved < NEW\.weight_total \* NEW\.quorum_threshold_fraction/)
  assert.match(migrationSql, /quorum_met=0 inconsistent/)
})

test('qar_weight_approved_bounded trigger prevents weight_approved > weight_total', () => {
  assert.match(migrationSql, /qar_weight_approved_bounded/)
  assert.match(migrationSql, /weight_approved cannot exceed weight_total/)
})

// ── Referential integrity ────────────────────────────────────────────────────

test('qar_finality_class_must_exist trigger enforces finality_classification_id integrity', () => {
  assert.match(migrationSql, /qar_finality_class_must_exist/)
  assert.match(migrationSql, /finality_classification_registry/)
})

test('qar_conflict_set_must_exist trigger enforces conflict_set_id integrity', () => {
  assert.match(migrationSql, /qar_conflict_set_must_exist/)
  assert.match(migrationSql, /conflict_set_registry/)
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
  buildQuorumAttestationId,
  evaluateWeightedQuorum,
} from '../../src/lib/quorum-attestation.js'

test('quorum-attestation module is evidence-only (creates_authority is false)', () => {
  assert.equal(creates_authority, false)
})

test('buildQuorumAttestationId returns deterministic qar_ prefixed id', () => {
  const id = buildQuorumAttestationId('profile-1', 'abc123', '2026-01-01T00:00:00Z')
  assert.match(id, /^qar_[0-9a-f]{64}$/)
  assert.equal(id, buildQuorumAttestationId('profile-1', 'abc123', '2026-01-01T00:00:00Z'))
})

test('evaluateWeightedQuorum quorum_met=1 when weight_approved meets threshold', () => {
  const members = [
    { member_id: 'a', member_weight: 1, attested_hash: 'target', attested_at: '', signature_present: true },
    { member_id: 'b', member_weight: 1, attested_hash: 'target', attested_at: '', signature_present: true },
    { member_id: 'c', member_weight: 1, attested_hash: 'other',  attested_at: '', signature_present: true },
  ]
  const result = evaluateWeightedQuorum(members, 'target', 0.5)
  assert.equal(result.weight_total, 3)
  assert.equal(result.weight_approved, 2)
  assert.equal(result.quorum_met, 1)
})

test('evaluateWeightedQuorum quorum_met=0 when weight_approved below threshold', () => {
  const members = [
    { member_id: 'a', member_weight: 1, attested_hash: 'target', attested_at: '', signature_present: true },
    { member_id: 'b', member_weight: 1, attested_hash: 'other',  attested_at: '', signature_present: true },
    { member_id: 'c', member_weight: 1, attested_hash: 'other',  attested_at: '', signature_present: true },
  ]
  const result = evaluateWeightedQuorum(members, 'target', 0.667)
  assert.equal(result.weight_total, 3)
  assert.equal(result.weight_approved, 1)
  assert.equal(result.quorum_met, 0)
})

test('evaluateWeightedQuorum respects weighted votes (not just count)', () => {
  const members = [
    { member_id: 'a', member_weight: 10, attested_hash: 'target', attested_at: '', signature_present: true },
    { member_id: 'b', member_weight: 1,  attested_hash: 'other',  attested_at: '', signature_present: true },
    { member_id: 'c', member_weight: 1,  attested_hash: 'other',  attested_at: '', signature_present: true },
  ]
  const result = evaluateWeightedQuorum(members, 'target', 0.667)
  assert.equal(result.weight_total, 12)
  assert.equal(result.weight_approved, 10)
  assert.equal(result.quorum_met, 1)
})

test('evaluateWeightedQuorum quorum_met=0 for empty members', () => {
  const result = evaluateWeightedQuorum([], 'target', 0.667)
  assert.equal(result.weight_total, 0)
  assert.equal(result.weight_approved, 0)
  assert.equal(result.quorum_met, 0)
})
