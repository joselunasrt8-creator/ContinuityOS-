import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('continuity registry persists identity and lineage binding fields', () => {
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS continuity_registry[\s\S]*continuity_id TEXT PRIMARY KEY[\s\S]*identity_id TEXT NOT NULL[\s\S]*session_id TEXT NOT NULL[\s\S]*parent_continuity_id TEXT[\s\S]*continuity_hash TEXT NOT NULL[\s\S]*canonical_continuity TEXT NOT NULL[\s\S]*status TEXT NOT NULL/,
    'continuity_registry must persist continuity identity, session, lineage, hash, canonical body, and status',
  )

  assert.match(
    source,
    /continuity_registry:[\s\S]*"continuity_id"[\s\S]*"identity_id"[\s\S]*"session_id"[\s\S]*"parent_continuity_id"[\s\S]*"continuity_hash"[\s\S]*"canonical_continuity"[\s\S]*"status"/,
    'schema diagnostics must require continuity lineage columns',
  )
})

test('active continuity validates identity, session, status, expiry, and hash continuity', () => {
  assert.match(
    source,
    /async function activeContinuity[\s\S]*SELECT \* FROM continuity_registry WHERE continuity_id=\?1/,
    'activeContinuity must load the requested continuity record',
  )

  assert.match(
    source,
    /String\(continuity\.status \|\| ""\) !== "ACTIVE"[\s\S]*cascadeRevocation/,
    'inactive continuity must fail closed and trigger revocation cascade',
  )

  assert.match(
    source,
    /String\(continuity\.session_id \|\| ""\) !== String\(session\.session_id \|\| ""\)/,
    'continuity session_id must match the active session',
  )

  assert.match(
    source,
    /String\(continuity\.identity_id \|\| ""\) !== String\(session\.identity_id \|\| ""\)/,
    'continuity identity_id must match the active session identity',
  )

  assert.match(
    source,
    /actualHash !== String\(continuity\.continuity_hash \|\| ""\)[\s\S]*actualHash !== String\(canonical\.continuity_hash \|\| ""\)/,
    'continuity hash must match both persisted and canonical continuity hashes',
  )
})

test('recursive ancestor ACTIVE enforcement closes revoked ancestor descendants to NULL', () => {
  assert.match(
    source,
    /let parentId = canonical\.parent_continuity_id[\s\S]*while \(parentId\)[\s\S]*String\(parent\.status \|\| ""\) !== "ACTIVE"[\s\S]*cascadeRevocation\(env, parentId[\s\S]*"revoked_ancestor_continuity"/,
    'activeContinuity must recursively walk ancestors and cascade descendants when any ancestor is not ACTIVE',
  )

  assert.match(
    source,
    /if \(!parent\) return rejectWithTelemetry\(env, \{ status: "NULL", reason: "revoked_ancestor_continuity" \}[\s\S]*route: "\/continuity"[\s\S]*drift_class: "authority_drift"/,
    'child continuity creation must reject revoked ancestors as NULL authority drift',
  )
})

test('authority issuance requires recursively valid ACTIVE continuity lineage', () => {
  assert.match(
    source,
    /if \(!continuity_id\) return rejectWithTelemetry\(env, \{ status: "NULL", reason: "missing_continuity_id" \}/,
    'authority issuance must reject missing continuity_id',
  )

  assert.match(
    source,
    /const continuity = await activeContinuity\(env, continuity_id, session, decision_id\)/,
    'authority issuance must validate active continuity before authority creation',
  )

  assert.match(
    source,
    /const reason = await continuityRejectionReason\(env, continuity_id, "invalid_continuity_ancestry"\)[\s\S]*route: "\/authority"[\s\S]*indicator: reason[\s\S]*drift_class: "authority_drift"/,
    'invalid or revoked ancestry must return canonical NULL reason before authority exists',
  )

  assert.match(
    source,
    /INSERT INTO authority_registry[\s\S]*continuity_id[\s\S]*identity_id/,
    'authority registry must persist continuity_id and identity_id lineage',
  )
})

test('validation, execution, and proof reject revoked lineage before legitimacy advances', () => {
  assert.match(
    source,
    /route: "\/validate"[\s\S]*const reason = await continuityRejectionReason\(env, String\(authority\.continuity_id \|\| ""\), "invalid_continuity_ancestry"\)[\s\S]*reason \}[\s\S]*drift_class: "authority_drift"/,
    'validation must become NULL when authority continuity lineage is revoked',
  )

  assert.match(
    source,
    /route: "\/execute"[\s\S]*const reason = await continuityRejectionReason\(env, String\(authority\.continuity_id \|\| ""\), "invalid_continuity_ancestry"\)[\s\S]*reason \}[\s\S]*drift_class: "authority_drift"/,
    'execution must become NULL when authority continuity lineage is revoked',
  )

  assert.match(
    source,
    /const proofContinuity = await activeContinuity\(env, String\(proofAuthority\.continuity_id \|\| ""\), proofSession, String\(decision_id \|\| ""\)\)[\s\S]*const reason = await continuityRejectionReason[\s\S]*route: "\/proof"/,
    'proof must preflight recursive active lineage before proof persistence can run',
  )
})

test('execution and proof preserve continuity lineage', () => {
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS execution_registry[\s\S]*continuity_id TEXT/,
    'execution_registry must persist continuity_id',
  )

  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS proof_registry[\s\S]*continuity_id TEXT[\s\S]*continuity_hash TEXT[\s\S]*identity_id TEXT[\s\S]*authority_lineage TEXT[\s\S]*execution_lineage TEXT/,
    'proof_registry must persist continuity lineage, identity, authority lineage, and execution lineage',
  )

  assert.match(
    source,
    /INSERT INTO execution_registry[\s\S]*continuity_id\) VALUES[\s\S]*\.bind\(execution_id, authority\.session_id, decision_id, validated_object_hash, invocation_nonce, new Date\(\)\.toISOString\(\), String\(authority\.continuity_id \|\| ""\)\)/,
    'execution must persist authority continuity_id into execution lineage',
  )

  assert.match(
    source,
    /INSERT INTO proof_registry[\s\S]*continuity_id,continuity_hash[\s\S]*authority_lineage,execution_lineage/,
    'proof must persist continuity and lineage fields',
  )
})

test('recursive descendant invalidation revokes continuity, authority, validation, and invocation state', () => {
  assert.match(
    source,
    /async function cascadeRevocation[\s\S]*WITH RECURSIVE descendants[\s\S]*UPDATE continuity_registry SET status='REVOKED'/,
    'continuity revocation must recursively mark descendants revoked',
  )

  assert.match(
    source,
    /async function cascadeRevocation[\s\S]*UPDATE authority_registry SET status='REVOKED'[\s\S]*status IN \('ACTIVE','VALIDATED','RESERVED','EXECUTED'\)/,
    'continuity revocation must revoke dependent authorities including executed-but-unproven authority',
  )

  assert.match(
    source,
    /UPDATE validation_registry SET status='REVOKED', result='INVALID', reason='revoked_continuity_lineage'/,
    'continuity revocation must invalidate dependent validations with canonical revoked lineage reason',
  )

  assert.match(
    source,
    /UPDATE invocation_registry SET status='REVOKED'[\s\S]*status='RESERVED'/,
    'continuity revocation must revoke reserved invocations to block replay on revoked descendants',
  )
})

test('recursive revoked lineage replay blocking uses canonical rejection reasons', () => {
  assert.match(source, /"revoked_ancestor_continuity"/, 'revoked ancestor reason must be available')
  assert.match(source, /"revoked_continuity_lineage"/, 'revoked continuity lineage reason must be available')
  assert.match(source, /"invalid_continuity_ancestry"/, 'invalid ancestry reason must be available')

  assert.match(
    source,
    /async function continuityRejectionReason[\s\S]*WITH RECURSIVE lineage[\s\S]*return Number\(row\.depth \|\| 0\) === 0 \? "revoked_continuity_lineage" : "revoked_ancestor_continuity"/,
    'lineage rejection classifier must distinguish revoked descendants from revoked ancestors',
  )
})

test('recursive revocation telemetry classifies authority drift', () => {
  assert.match(source, /event_type: "VALIDATION_REJECTED"[\s\S]*drift_class: "authority_drift"/, 'revoked lineage rejections must emit authority drift')
  assert.match(source, /event_type: "CONTINUITY_REVOKED"/, 'recursive continuity revocation must emit continuity telemetry')
  assert.match(source, /event_type: "AUTHORITY_REVOKED"/, 'recursive authority revocation must emit authority telemetry')
})

test('continuity creation emits telemetry and invalid continuity fails closed', () => {
  assert.match(source, /event_type: "CONTINUITY_CREATED"/, 'continuity creation must emit telemetry')

  assert.match(
    source,
    /drift_class: "authority_drift"/,
    'continuity legitimacy failures must be classified as authority drift',
  )

  assert.match(
    source,
    /scope_expansion_detected/,
    'recursive continuity scope expansion must fail closed',
  )

  assert.match(
    source,
    /if \(!Object\.prototype\.hasOwnProperty\.call\(parentScope, key\)\)[\s\S]*rejectWithTelemetry\([\s\S]*env,[\s\S]*\{ status: "NULL", reason: "scope_expansion_detected" \}[\s\S]*indicator: "recursive_scope_expansion_detected"/,
    'additive child continuity scope keys must fail closed as recursive scope expansion',
  )

  assert.match(
    source,
    /canonicalize\(parentScope\[key\]\) !== canonicalize\(value\)[\s\S]*rejectWithTelemetry\([\s\S]*env,[\s\S]*\{ status: "NULL", reason: "scope_expansion_detected" \}[\s\S]*indicator: "recursive_scope_expansion_detected"/,
    'conflicting inherited child continuity scope values must fail closed as recursive scope expansion',
  )
})

test('continuity scope subset semantics permit equal and narrowed scopes only', () => {
  assert.match(
    source,
    /const parentScope =[\s\S]*canonicalRecord\(parent\.canonical\.scope\)[\s\S]*const childScope = canonicalRecord\(requestedScope\)/,
    'parent and child continuity scopes must be canonicalized before subset comparison',
  )

  assert.match(
    source,
    /for \(const \[key, value\] of Object\.entries\(childScope\)\)[\s\S]*Object\.prototype\.hasOwnProperty\.call\(parentScope, key\)[\s\S]*canonicalize\(parentScope\[key\]\) !== canonicalize\(value\)[\s\S]*const material: any = continuityHashMaterial/,
    'equal inherited scope keys pass through to deterministic continuity hashing',
  )

  assert.doesNotMatch(
    source,
    /for \(const \[key, value\] of Object\.entries\(parentScope\)\)/,
    'narrowed child scope may omit parent keys without being rejected as expansion',
  )

  assert.match(
    source,
    /if \(parent_continuity_id\)[\s\S]*const parent = await activeContinuity\(env, parent_continuity_id, session\)[\s\S]*for \(const \[key, value\] of Object\.entries\(childScope\)\)/,
    'recursive descendants are constrained by their active parent scope and cannot re-expand omitted ancestor dimensions',
  )
})
