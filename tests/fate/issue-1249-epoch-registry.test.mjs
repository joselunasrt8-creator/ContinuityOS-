import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationSql = readFileSync('migrations/0052_epoch_registry.sql', 'utf8')

import {
  creates_authority,
  buildEpochId,
  isEpochGloballyAuthoritative,
  isEpochLocallyValid,
  isEpochTerminal,
  isEpochBlocking,
  classifyEpochFinality,
  epochFinalityToEpochValidPredicate,
  isValidEpochTransition,
} from '../../src/lib/epoch-substrate.js'

// ── Schema structure ─────────────────────────────────────────────────────────

test('migration defines epoch_registry table', () => {
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS epoch_registry/)
})

test('epoch_finality_status CHECK enforces all nine canonical epoch states', () => {
  assert.match(migrationSql, /EPOCH_LOCAL/)
  assert.match(migrationSql, /EPOCH_GLOBAL_CANDIDATE/)
  assert.match(migrationSql, /EPOCH_GLOBAL_AUTHORITATIVE/)
  assert.match(migrationSql, /EPOCH_AMBIGUOUS/)
  assert.match(migrationSql, /EPOCH_STALE_VISIBLE/)
  assert.match(migrationSql, /EPOCH_PARTITION_SUSPENDED/)
  assert.match(migrationSql, /EPOCH_CONFLICTED/)
  assert.match(migrationSql, /EPOCH_REVOKED/)
  assert.match(migrationSql, /EPOCH_NULL/)
})

test('epoch_reconciliation_frontier CHECK enforces canonical reconciliation vocabulary', () => {
  assert.match(migrationSql, /LOCAL_RECONCILED/)
  assert.match(migrationSql, /GLOBAL_RECONCILED_CANDIDATE/)
  assert.match(migrationSql, /AMBIGUOUS_RECONCILIATION/)
  assert.match(migrationSql, /AMBIGUOUS_REQUIRES_EPOCH/)
  assert.match(migrationSql, /NULL_RECONCILIATION/)
})

// ── Append-only invariants ───────────────────────────────────────────────────

test('er_no_update trigger present and raises abort', () => {
  assert.match(migrationSql, /er_no_update/)
  assert.match(migrationSql, /UPDATE is forbidden/)
})

test('er_no_delete trigger present and raises abort', () => {
  assert.match(migrationSql, /er_no_delete/)
  assert.match(migrationSql, /DELETE is forbidden/)
})

// ── Terminal state enforcement ───────────────────────────────────────────────

test('er_no_upgrade_from_null trigger enforces EPOCH_NULL is terminal', () => {
  assert.match(migrationSql, /er_no_upgrade_from_null/)
  assert.match(migrationSql, /EPOCH_NULL is terminal/)
})

// ── Referential integrity ────────────────────────────────────────────────────

test('er_supersedes_must_exist trigger enforces supersession chain integrity', () => {
  assert.match(migrationSql, /er_supersedes_must_exist/)
})

test('er_authoritative_requires_quorum trigger enforces quorum_attestation_id for EPOCH_GLOBAL_AUTHORITATIVE', () => {
  assert.match(migrationSql, /er_authoritative_requires_quorum/)
  assert.match(migrationSql, /EPOCH_GLOBAL_AUTHORITATIVE requires quorum_attestation_id/)
})

test('er_quorum_attestation_must_exist trigger enforces quorum_attestation_registry integrity', () => {
  assert.match(migrationSql, /er_quorum_attestation_must_exist/)
  assert.match(migrationSql, /quorum_attestation_registry/)
})

test('er_finality_class_must_exist trigger enforces finality_classification_registry integrity', () => {
  assert.match(migrationSql, /er_finality_class_must_exist/)
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

// ── TypeScript module: evidence-only ────────────────────────────────────────

test('epoch-substrate module is evidence-only (creates_authority is false)', () => {
  assert.equal(creates_authority, false)
})

// ── buildEpochId ─────────────────────────────────────────────────────────────

test('buildEpochId returns epoch_-prefixed sha256 hex string', () => {
  const id = buildEpochId('GLOBAL', '2026-01-01T00:00:00Z', 'initial')
  assert.match(id, /^epoch_[0-9a-f]{64}$/)
})

test('buildEpochId is deterministic', () => {
  const a = buildEpochId('GLOBAL', '2026-01-01T00:00:00Z', 'initial')
  const b = buildEpochId('GLOBAL', '2026-01-01T00:00:00Z', 'initial')
  assert.equal(a, b)
})

test('buildEpochId differs for different epoch_scope values', () => {
  const a = buildEpochId('GLOBAL', '2026-01-01T00:00:00Z', 'initial')
  const b = buildEpochId('DOMAIN:prod', '2026-01-01T00:00:00Z', 'initial')
  assert.notEqual(a, b)
})

// ── isEpochGloballyAuthoritative ─────────────────────────────────────────────

test('isEpochGloballyAuthoritative returns true only for EPOCH_GLOBAL_AUTHORITATIVE', () => {
  assert.equal(isEpochGloballyAuthoritative('EPOCH_GLOBAL_AUTHORITATIVE'), true)
  assert.equal(isEpochGloballyAuthoritative('EPOCH_LOCAL'), false)
  assert.equal(isEpochGloballyAuthoritative('EPOCH_GLOBAL_CANDIDATE'), false)
  assert.equal(isEpochGloballyAuthoritative('EPOCH_NULL'), false)
  assert.equal(isEpochGloballyAuthoritative('EPOCH_STALE_VISIBLE'), false)
})

// ── isEpochLocallyValid ───────────────────────────────────────────────────────

test('isEpochLocallyValid returns true for LOCAL, GLOBAL_CANDIDATE, GLOBAL_AUTHORITATIVE', () => {
  assert.equal(isEpochLocallyValid('EPOCH_LOCAL'), true)
  assert.equal(isEpochLocallyValid('EPOCH_GLOBAL_CANDIDATE'), true)
  assert.equal(isEpochLocallyValid('EPOCH_GLOBAL_AUTHORITATIVE'), true)
})

test('isEpochLocallyValid returns false for degraded and terminal states', () => {
  assert.equal(isEpochLocallyValid('EPOCH_AMBIGUOUS'), false)
  assert.equal(isEpochLocallyValid('EPOCH_STALE_VISIBLE'), false)
  assert.equal(isEpochLocallyValid('EPOCH_PARTITION_SUSPENDED'), false)
  assert.equal(isEpochLocallyValid('EPOCH_CONFLICTED'), false)
  assert.equal(isEpochLocallyValid('EPOCH_NULL'), false)
})

// ── isEpochTerminal ───────────────────────────────────────────────────────────

test('isEpochTerminal returns true only for EPOCH_NULL', () => {
  assert.equal(isEpochTerminal('EPOCH_NULL'), true)
  assert.equal(isEpochTerminal('EPOCH_REVOKED'), false)
  assert.equal(isEpochTerminal('EPOCH_GLOBAL_AUTHORITATIVE'), false)
})

// ── isEpochBlocking ───────────────────────────────────────────────────────────

test('isEpochBlocking returns true for all decision-blocking states', () => {
  assert.equal(isEpochBlocking('EPOCH_AMBIGUOUS'), true)
  assert.equal(isEpochBlocking('EPOCH_PARTITION_SUSPENDED'), true)
  assert.equal(isEpochBlocking('EPOCH_CONFLICTED'), true)
  assert.equal(isEpochBlocking('EPOCH_REVOKED'), true)
  assert.equal(isEpochBlocking('EPOCH_NULL'), true)
})

test('isEpochBlocking returns false for non-blocking states', () => {
  assert.equal(isEpochBlocking('EPOCH_LOCAL'), false)
  assert.equal(isEpochBlocking('EPOCH_GLOBAL_CANDIDATE'), false)
  assert.equal(isEpochBlocking('EPOCH_GLOBAL_AUTHORITATIVE'), false)
  assert.equal(isEpochBlocking('EPOCH_STALE_VISIBLE'), false)
})

// ── classifyEpochFinality ─────────────────────────────────────────────────────

test('classifyEpochFinality returns EPOCH_REVOKED when is_revoked=true (highest priority)', () => {
  assert.equal(classifyEpochFinality({ topology_present: true, quorum_met: true, revocation_live: true, has_competing_head: false, is_revoked: true }), 'EPOCH_REVOKED')
})

test('classifyEpochFinality returns EPOCH_PARTITION_SUSPENDED when topology absent (fail-closed)', () => {
  assert.equal(classifyEpochFinality({ topology_present: false, quorum_met: true, revocation_live: true, has_competing_head: false, is_revoked: false }), 'EPOCH_PARTITION_SUSPENDED')
})

test('classifyEpochFinality returns EPOCH_CONFLICTED when competing head present', () => {
  assert.equal(classifyEpochFinality({ topology_present: true, quorum_met: true, revocation_live: true, has_competing_head: true, is_revoked: false }), 'EPOCH_CONFLICTED')
})

test('classifyEpochFinality returns EPOCH_LOCAL when topology present but quorum not met', () => {
  assert.equal(classifyEpochFinality({ topology_present: true, quorum_met: false, revocation_live: true, has_competing_head: false, is_revoked: false }), 'EPOCH_LOCAL')
})

test('classifyEpochFinality returns EPOCH_STALE_VISIBLE when quorum met but revocation channel silent', () => {
  assert.equal(classifyEpochFinality({ topology_present: true, quorum_met: true, revocation_live: false, has_competing_head: false, is_revoked: false }), 'EPOCH_STALE_VISIBLE')
})

test('classifyEpochFinality returns EPOCH_GLOBAL_AUTHORITATIVE when all conditions met', () => {
  assert.equal(classifyEpochFinality({ topology_present: true, quorum_met: true, revocation_live: true, has_competing_head: false, is_revoked: false }), 'EPOCH_GLOBAL_AUTHORITATIVE')
})

test('classifyEpochFinality: EPOCH_PARTITION_SUSPENDED takes priority over competing head', () => {
  assert.equal(classifyEpochFinality({ topology_present: false, quorum_met: false, revocation_live: false, has_competing_head: true, is_revoked: false }), 'EPOCH_PARTITION_SUSPENDED')
})

// ── epochFinalityToEpochValidPredicate ────────────────────────────────────────

test('EPOCH_GLOBAL_AUTHORITATIVE satisfies EPOCH_VALID for both local and global claims', () => {
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_GLOBAL_AUTHORITATIVE', false), true)
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_GLOBAL_AUTHORITATIVE', true), true)
})

test('EPOCH_LOCAL satisfies EPOCH_VALID only for local claims', () => {
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_LOCAL', false), true)
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_LOCAL', true), false)
})

test('EPOCH_GLOBAL_CANDIDATE satisfies EPOCH_VALID only for local claims', () => {
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_GLOBAL_CANDIDATE', false), true)
  assert.equal(epochFinalityToEpochValidPredicate('EPOCH_GLOBAL_CANDIDATE', true), false)
})

test('degraded and terminal epoch states do not satisfy EPOCH_VALID', () => {
  for (const s of ['EPOCH_AMBIGUOUS', 'EPOCH_STALE_VISIBLE', 'EPOCH_PARTITION_SUSPENDED', 'EPOCH_CONFLICTED', 'EPOCH_REVOKED', 'EPOCH_NULL']) {
    assert.equal(epochFinalityToEpochValidPredicate(s, false), false, `${s} should not satisfy EPOCH_VALID`)
    assert.equal(epochFinalityToEpochValidPredicate(s, true), false, `${s} should not satisfy global EPOCH_VALID`)
  }
})

// ── isValidEpochTransition ────────────────────────────────────────────────────

test('EPOCH_NULL is terminal — no transitions permitted from NULL', () => {
  for (const to of ['EPOCH_LOCAL', 'EPOCH_GLOBAL_CANDIDATE', 'EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_NULL']) {
    assert.equal(isValidEpochTransition('EPOCH_NULL', to), false, `transition from EPOCH_NULL to ${to} must be forbidden`)
  }
})

test('EPOCH_GLOBAL_AUTHORITATIVE can transition to STALE_VISIBLE, CONFLICTED, REVOKED, AMBIGUOUS, NULL', () => {
  assert.equal(isValidEpochTransition('EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_STALE_VISIBLE'), true)
  assert.equal(isValidEpochTransition('EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_CONFLICTED'), true)
  assert.equal(isValidEpochTransition('EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_REVOKED'), true)
  assert.equal(isValidEpochTransition('EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_AMBIGUOUS'), true)
  assert.equal(isValidEpochTransition('EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_NULL'), true)
})

test('EPOCH_GLOBAL_AUTHORITATIVE cannot transition to LOCAL or GLOBAL_CANDIDATE', () => {
  assert.equal(isValidEpochTransition('EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_LOCAL'), false)
  assert.equal(isValidEpochTransition('EPOCH_GLOBAL_AUTHORITATIVE', 'EPOCH_GLOBAL_CANDIDATE'), false)
})

test('EPOCH_LOCAL can transition to GLOBAL_CANDIDATE, AMBIGUOUS, PARTITION_SUSPENDED, NULL', () => {
  assert.equal(isValidEpochTransition('EPOCH_LOCAL', 'EPOCH_GLOBAL_CANDIDATE'), true)
  assert.equal(isValidEpochTransition('EPOCH_LOCAL', 'EPOCH_AMBIGUOUS'), true)
  assert.equal(isValidEpochTransition('EPOCH_LOCAL', 'EPOCH_PARTITION_SUSPENDED'), true)
  assert.equal(isValidEpochTransition('EPOCH_LOCAL', 'EPOCH_NULL'), true)
})

test('EPOCH_REVOKED can only transition to EPOCH_NULL', () => {
  assert.equal(isValidEpochTransition('EPOCH_REVOKED', 'EPOCH_NULL'), true)
  assert.equal(isValidEpochTransition('EPOCH_REVOKED', 'EPOCH_LOCAL'), false)
  assert.equal(isValidEpochTransition('EPOCH_REVOKED', 'EPOCH_GLOBAL_AUTHORITATIVE'), false)
})

test('EPOCH_STALE_VISIBLE can recover to GLOBAL_AUTHORITATIVE or LOCAL, or degrade to NULL', () => {
  assert.equal(isValidEpochTransition('EPOCH_STALE_VISIBLE', 'EPOCH_GLOBAL_AUTHORITATIVE'), true)
  assert.equal(isValidEpochTransition('EPOCH_STALE_VISIBLE', 'EPOCH_LOCAL'), true)
  assert.equal(isValidEpochTransition('EPOCH_STALE_VISIBLE', 'EPOCH_NULL'), true)
})
