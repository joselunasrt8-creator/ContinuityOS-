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
test('recursive continuity depth enforcement fails closed', () => {
  assert.match(
    source,
    /SYSTEM_MAX_CONTINUITY_DEPTH/,
    'system continuity depth ceiling must exist',
  )

  assert.match(
    source,
    /ancestry\.length > SYSTEM_MAX_CONTINUITY_DEPTH/,
    'ancestry traversal must fail closed on system depth overflow',
  )

  assert.match(
    source,
    /Number\.isFinite\(configuredMaxDepth\)/,
    'configured continuity max_depth must be validated',
  )

  assert.match(
    source,
    /ancestry\.length > configuredMaxDepth/,
    'configured continuity max_depth overflow must fail closed',
  )

  assert.match(
    source,
    /cascadeRevocation\(env, continuity_id\)/,
    'depth overflow must revoke recursive continuity lineage',
  )
})

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


test('recursive continuity depth overflow fails closed', () => {
  assert.match(
    source,
    /const SYSTEM_MAX_CONTINUITY_DEPTH = 32/,
    'runtime must define a canonical continuity recursion ceiling',
  )

  assert.match(
    source,
    /ancestry\.push\(\{ \.\.\.ancestor, canonical: ancestorCanonical \}\)[\s\S]*if \(ancestry\.length > SYSTEM_MAX_CONTINUITY_DEPTH\) \{[\s\S]*await cascadeRevocation\(env, continuity_id\)[\s\S]*return null/,
    'system depth overflow must revoke lineage and return NULL',
  )

  assert.match(
    source,
    /const configuredMaxDepth = Number\(requestedCanonical\?\.constraints\?\.max_depth\)/,
    'activeContinuity must extract canonical continuity max_depth constraints',
  )

  assert.match(
    source,
    /Number\.isFinite\(configuredMaxDepth\)[\s\S]*configuredMaxDepth >= 0[\s\S]*ancestry\.length > configuredMaxDepth[\s\S]*await cascadeRevocation\(env, continuity_id\)[\s\S]*return null/,
    'canonical max_depth overflow must revoke lineage and return NULL',
  )

  assert.match(
    source,
    /while \(current_id\)[\s\S]*visited\.has\(current_id\)[\s\S]*await cascadeRevocation\(env, continuity_id\)[\s\S]*return null[\s\S]*return \{ \.\.\.lineage\.requestedContinuity, canonical: lineage\.requestedCanonical, ancestry: lineage\.ancestry \}/,
    'recursive lineage traversal must retain cycle fail-closed behavior and only return validated ancestry',
  )
})

test('authority issuance requires valid continuity lineage', () => {
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
    /if \(!continuity\) return rejectWithTelemetry\(env, \{ status: "NULL", reason: "invalid_continuity" \}/,
    'invalid continuity must return NULL before authority exists',
  )

  assert.match(
    source,
    /INSERT INTO authority_registry[\s\S]*continuity_id[\s\S]*identity_id/,
    'authority registry must persist continuity_id and identity_id lineage',
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
    /INSERT INTO execution_registry[\s\S]*continuity_id[\s\S]*\.bind\(execution_id, authority\.session_id, decision_id, validated_object_hash, invocation_nonce, new Date\(\)\.toISOString\(\), String\(authority\.continuity_id \|\| ""\)[\s\S]*provenance\.workflow_sha[\s\S]*\)/,
    'execution must persist authority continuity_id into execution lineage',
  )

  assert.match(
    source,
    /INSERT INTO proof_registry[\s\S]*identity_id,session_id,continuity_id,continuity_hash[\s\S]*authority_lineage,execution_lineage/,
    'proof must persist continuity and lineage fields',
  )
})

test('revocation propagates through continuity, authority, validation, and invocation state', () => {
  assert.match(
    source,
    /async function invalidateContinuityLineage[\s\S]*UPDATE continuity_registry SET status=\?\$\{ids\.length \+ 1\}/,
    /async function invalidateContinuityLineage[\s\S]*UPDATE continuity_registry SET status='REVOKED'/,
    'continuity revocation must mark continuity records revoked',
  )

  assert.match(
    source,
    /async function invalidateContinuityLineage[\s\S]*UPDATE authority_registry SET status='REVOKED'/,
    'continuity revocation must revoke dependent authorities',
  )

  assert.match(
    source,
    /async function invalidateContinuityLineage[\s\S]*UPDATE validation_registry SET status='REVOKED', result='INVALID', reason=\?\$\{ids\.length \+ 1\}/,
    /async function invalidateContinuityLineage[\s\S]*UPDATE validation_registry SET status='REVOKED', result='INVALID', reason='continuity_revoked'/,
    'continuity revocation must invalidate dependent validations',
  )

  assert.match(
    source,
    /async function invalidateContinuityLineage[\s\S]*UPDATE invocation_registry SET status='REVOKED'/,
    'continuity revocation must revoke reserved invocations',
  )
})

test('continuity creation emits telemetry and invalid continuity fails closed', () => {
  assert.match(source, /event_type: "CONTINUITY_CREATED"/, 'continuity creation must emit telemetry')

  assert.match(
    source,
    /reason: "invalid_continuity"/,
    'invalid continuity must be represented as a fail-closed rejection reason',
  )

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

  assert.match(
    source,
    /payload: \{[\s\S]*route: "\/continuity",[\s\S]*continuity_id,[\s\S]*parent_continuity_id,[\s\S]*indicator: "recursive_scope_expansion_detected"[\s\S]*\},[\s\S]*drift_class: "authority_drift"/,
    'recursive continuity scope expansion must emit required authority drift telemetry shape',
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
