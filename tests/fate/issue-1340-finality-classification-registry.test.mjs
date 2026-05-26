import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildFinClassId,
  evidenceFlagsFromPredicates,
  classifyFromPredicates,
  creates_authority,
} from '../../src/lib/finality-classification.js'

const migrationSql = readFileSync('migrations/0048_finality_classification_registry.sql', 'utf8')
const migration0053Sql = readFileSync('migrations/0053_finality_classification_convergence_valid.sql', 'utf8')

// ── Migration structural assertions ────────────────────────────────────────

test('migration defines finality_classification_registry table', () => {
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS finality_classification_registry/)
})

test('migration 0048 classification column enforces original state vocabulary', () => {
  assert.match(
    migrationSql,
    /CHECK\(classification IN \('LOCAL_VALID','GLOBAL_VALID','AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL'\)\)/,
  )
})

test('migration 0053 classification column includes CONVERGENCE_VALID in expanded vocabulary', () => {
  assert.match(
    migration0053Sql,
    /CHECK\(classification IN \('LOCAL_VALID','CONVERGENCE_VALID','GLOBAL_VALID','AMBIGUOUS','STALE_VISIBLE','PARTITION_SUSPENDED','NULL'\)\)/,
  )
})

test('migration 0053 adds GLOBAL_VALID convergence supersession guard trigger', () => {
  assert.match(migration0053Sql, /fcr_global_valid_requires_convergence_supersession/)
  assert.match(migration0053Sql, /LOCAL_VALID cannot be directly promoted to GLOBAL_VALID/)
  assert.match(migration0053Sql, /CONVERGENCE_VALID record/)
})

test('migration 0053 preserves append-only enforcement triggers', () => {
  assert.match(migration0053Sql, /fcr_no_update/)
  assert.match(migration0053Sql, /fcr_no_delete/)
  assert.match(migration0053Sql, /UPDATE is forbidden/)
  assert.match(migration0053Sql, /DELETE is forbidden/)
})

test('migration 0053 preserves NULL-is-terminal trigger', () => {
  assert.match(migration0053Sql, /fcr_no_upgrade_from_null/)
  assert.match(migration0053Sql, /NULL classification is terminal/)
})

test('migration 0053 preserves GLOBAL_VALID evidence requirement trigger', () => {
  assert.match(migration0053Sql, /fcr_global_valid_requires_evidence/)
  assert.match(migration0053Sql, /has_quorum_evidence/)
  assert.match(migration0053Sql, /has_global_consensus_evidence/)
})

test('append-only enforcement triggers are present', () => {
  assert.match(migrationSql, /fcr_no_update/)
  assert.match(migrationSql, /fcr_no_delete/)
  assert.match(migrationSql, /UPDATE is forbidden/)
  assert.match(migrationSql, /DELETE is forbidden/)
})

test('NULL is terminal — no_upgrade_from_null trigger present', () => {
  assert.match(migrationSql, /fcr_no_upgrade_from_null/)
  assert.match(migrationSql, /NULL classification is terminal/)
})

test('GLOBAL_VALID requires evidence flags — trigger present', () => {
  assert.match(migrationSql, /fcr_global_valid_requires_evidence/)
  assert.match(migrationSql, /has_quorum_evidence/)
  assert.match(migrationSql, /has_global_consensus_evidence/)
  assert.match(migrationSql, /GLOBAL_VALID classification requires has_quorum_evidence=1/)
})

test('proof linkage trigger enforces referential integrity against proof_registry', () => {
  assert.match(migrationSql, /fcr_proof_must_exist/)
  assert.match(migrationSql, /proof_registry/)
  assert.match(migrationSql, /status = 'COMPLETED'/)
})

test('raw_production_apply_path is DENIED', () => {
  assert.match(migrationSql, /raw_production_apply_path.*DEFAULT 'DENIED'/)
  assert.match(migrationSql, /raw_production_apply_path = 'DENIED'/)
})

test('supersedes_classification_id referential integrity trigger present', () => {
  assert.match(migrationSql, /fcr_supersedes_must_exist/)
  assert.match(migrationSql, /supersedes_classification_id references non-existent/)
})

test('epoch_id column is nullable forward-placeholder (no NOT NULL constraint)', () => {
  assert.match(migrationSql, /epoch_id\s+TEXT/)
  assert.doesNotMatch(migrationSql, /epoch_id\s+TEXT\s+NOT NULL/)
})

test('object_type CHECK covers all canonical object types', () => {
  assert.match(
    migrationSql,
    /object_type IN \('authority','aeo','execution','proof','session','continuity','validation'\)/,
  )
})

// ── TypeScript module — evidence-only discipline ────────────────────────────

test('finality-classification module is evidence-only (creates_authority: false)', () => {
  assert.equal(creates_authority, false)
})

// ── buildFinClassId ─────────────────────────────────────────────────────────

test('buildFinClassId returns deterministic fcr_-prefixed id', () => {
  const id1 = buildFinClassId('hash-abc', 'LOCAL_VALID', '2026-01-01T00:00:00Z')
  const id2 = buildFinClassId('hash-abc', 'LOCAL_VALID', '2026-01-01T00:00:00Z')
  assert.equal(id1, id2)
  assert.match(id1, /^fcr_[0-9a-f]{64}$/)
})

test('buildFinClassId produces distinct ids for different classifications', () => {
  const idLocal = buildFinClassId('hash-abc', 'LOCAL_VALID', '2026-01-01T00:00:00Z')
  const idGlobal = buildFinClassId('hash-abc', 'GLOBAL_VALID', '2026-01-01T00:00:00Z')
  assert.notEqual(idLocal, idGlobal)
})

// ── evidenceFlagsFromPredicates ─────────────────────────────────────────────

test('evidenceFlagsFromPredicates returns all 1 when Q/G/L/X are true', () => {
  const flags = evidenceFlagsFromPredicates({
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: true, G: true, L: true, X: true,
  })
  assert.equal(flags.has_quorum_evidence, 1)
  assert.equal(flags.has_global_consensus_evidence, 1)
  assert.equal(flags.has_lineage_freshness_evidence, 1)
  assert.equal(flags.has_cryptographic_integrity_evidence, 1)
})

test('evidenceFlagsFromPredicates returns 0 for absent distributed predicates', () => {
  const flags = evidenceFlagsFromPredicates({
    V: true, A: true, U: true, P: true, R: true, T: true, C: true,
    Q: false, G: false, L: false, X: false,
  })
  assert.equal(flags.has_quorum_evidence, 0)
  assert.equal(flags.has_global_consensus_evidence, 0)
  assert.equal(flags.has_lineage_freshness_evidence, 0)
  assert.equal(flags.has_cryptographic_integrity_evidence, 0)
})

// ── classifyFromPredicates — state machine ──────────────────────────────────

test('classifyFromPredicates: PARTITION_SUSPENDED when topology absent', () => {
  const result = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: false, G: false, L: true, X: false },
    false, // topologyPresent = false
  )
  assert.equal(result, 'PARTITION_SUSPENDED')
})

test('classifyFromPredicates: LOCAL_VALID when base predicates hold but Q/G/X absent', () => {
  const result = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: false, G: false, L: true, X: false },
    true,
  )
  assert.equal(result, 'LOCAL_VALID')
})

test('classifyFromPredicates: GLOBAL_VALID when all predicates satisfied and epoch valid', () => {
  const result = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: true, G: true, L: true, X: true },
    true,
    true, // epochValid — required for GLOBAL_VALID
  )
  assert.equal(result, 'GLOBAL_VALID')
})

// CONF-DIST-01 — local valid does not imply global valid
test('CONF-DIST-01: LOCAL_VALID cannot be promoted to GLOBAL_VALID without convergence predicates', () => {
  // Q=false, G=false, X=false — distributed predicates absent.
  // epochValid=true does not help: the ceiling is LOCAL_VALID.
  const result = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: false, G: false, L: true, X: false },
    true,
    true, // epochValid is true but Q/G/X absent — must stay LOCAL_VALID
  )
  assert.equal(result, 'LOCAL_VALID')
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('classifyFromPredicates: CONVERGENCE_VALID when convergence predicates present but epoch not confirmed', () => {
  // All distributed predicates present (Q, G, L, X) but epochValid=false.
  // Cannot yet become GLOBAL_VALID; sits at the required intermediate state.
  const result = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: true, G: true, L: true, X: true },
    true,
    false, // epochValid not confirmed — CONVERGENCE_VALID is the ceiling
  )
  assert.equal(result, 'CONVERGENCE_VALID')
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('classifyFromPredicates: CONVERGENCE_VALID is distinct from LOCAL_VALID', () => {
  const localValid = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: false, G: false, L: true, X: false },
    true, false,
  )
  const convergenceValid = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: true, G: true, L: true, X: true },
    true, false,
  )
  assert.equal(localValid, 'LOCAL_VALID')
  assert.equal(convergenceValid, 'CONVERGENCE_VALID')
  assert.notEqual(localValid, convergenceValid)
})

test('classifyFromPredicates: epochValid default is false — GLOBAL_VALID not reached without explicit confirmation', () => {
  // No epochValid argument — default must not grant GLOBAL_VALID implicitly.
  const result = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: true, G: true, L: true, X: true },
    true,
    // epochValid omitted — should default to false
  )
  assert.equal(result, 'CONVERGENCE_VALID')
  assert.notEqual(result, 'GLOBAL_VALID')
})

test('classifyFromPredicates: STALE_VISIBLE when base holds but L absent and Q/G/X absent', () => {
  const result = classifyFromPredicates(
    { V: true, A: true, U: true, P: true, R: true, T: true, C: true, Q: false, G: false, L: false, X: false },
    true,
  )
  assert.equal(result, 'STALE_VISIBLE')
})

test('classifyFromPredicates: NULL when base predicate fails', () => {
  const result = classifyFromPredicates(
    { V: false, A: true, U: true, P: true, R: true, T: true, C: true, Q: false, G: false, L: true, X: false },
    true,
  )
  assert.equal(result, 'NULL')
})

// ── Replay invariant documentation assertions ───────────────────────────────

test('migration does not contain any mechanism to reset nonce consumption', () => {
  // Classification supersession must not touch invocation_registry or reset nonces
  assert.doesNotMatch(migrationSql, /invocation_registry/)
  assert.doesNotMatch(migrationSql, /nonce/)
})

test('migration does not create any execution surface', () => {
  assert.doesNotMatch(migrationSql, /execution_registry\s*INSERT/)
  assert.doesNotMatch(migrationSql, /authority_registry\s*INSERT/)
})
