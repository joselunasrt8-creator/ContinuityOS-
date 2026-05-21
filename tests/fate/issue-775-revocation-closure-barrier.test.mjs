import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/index.ts', 'utf8')

test('revocation closure uses recursive lineage barrier updates', () => {
  assert.match(source, /WITH RECURSIVE lineage\(continuity_id\)/, 'revocation closure must compute descendants recursively at write time')
  assert.match(source, /UPDATE continuity_registry SET status=\?2, revoked_at=COALESCE\(revoked_at, \?3\)[\s\S]*continuity_id IN \(SELECT continuity_id FROM lineage\)/, 'continuity revocation write must be lineage-scoped at final write boundary')
  assert.match(source, /UPDATE authority_registry SET status='REVOKED'[\s\S]*continuity_id IN \(SELECT continuity_id FROM lineage\)/, 'authority revocation must be lineage-scoped at final write boundary')
})

test('execute persistence enforces final write-time revocation barrier', () => {
  assert.match(source, /INSERT INTO execution_registry[\s\S]*SELECT \?1,\?2,\?3,\?4,\?5,'EXECUTED'/, 'execute must persist via guarded INSERT..SELECT boundary')
  assert.match(source, /EXISTS \(SELECT 1 FROM continuity_registry c WHERE c\.continuity_id=\?7 AND c\.status='ACTIVE' AND c\.revoked_at IS NULL/, 'execute final write must require active non-revoked continuity')
  assert.match(source, /if \(\(executionWrite\.meta\?\.changes \|\| 0\) !== 1\) return rejectWithTelemetry[\s\S]*reason:\"revoked_continuity\"/, 'execute must fail closed when revocation barrier blocks final write')
})

test('proof persistence preserves final write-time active lineage barrier', () => {
  assert.match(source, /INSERT OR IGNORE INTO proof_registry[\s\S]*WHERE a\.decision_id=\?4[\s\S]*a\.status='EXECUTED' AND c\.status='ACTIVE' AND c\.expires_at>\?13/, 'proof final write must require active continuity and executed authority at write boundary')
})
