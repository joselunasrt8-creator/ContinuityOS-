import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('proof registry persists lineage fields required for execution truth', () => {
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS proof_registry[\s\S]*execution_id TEXT NOT NULL[\s\S]*decision_id TEXT NOT NULL[\s\S]*validated_object_hash TEXT NOT NULL/,
    'proof_registry must bind proof to execution_id, decision_id, and validated_object_hash',
  )

  assert.match(
    source,
    /proof_registry:[\s\S]*"execution_id"[\s\S]*"decision_id"[\s\S]*"validated_object_hash"[\s\S]*"authority_lineage"[\s\S]*"execution_lineage"/,
    'schema diagnostics must require proof lineage fields',
  )
})

test('proof creation requires matching execution lineage', () => {
  assert.match(
    source,
    /SELECT \* FROM execution_registry WHERE execution_id=\?1 AND decision_id=\?2 AND validated_object_hash=\?3/,
    'proof must load execution by execution_id, decision_id, and validated_object_hash',
  )

  assert.match(
    source,
    /if \(!execution\)[\s\S]*reason:"execution_missing"/,
    'orphaned proof without matching execution must return NULL / INVALID',
  )

  assert.match(
    source,
    /drift_class: "proof_drift"[\s\S]*indicator: "proof_without_execute"/,
    'orphaned proof attempt must be classified as proof_drift',
  )
})

test('proof creation binds authority and execution lineage into persisted proof', () => {
  assert.match(
    source,
    /const authorityLineage = canonicalize\(\{[\s\S]*identity_id:[\s\S]*session_id,[\s\S]*continuity_id:[\s\S]*continuity_ancestry:[\s\S]*authority_id:/,
    'proof must construct authority lineage evidence',
  )

  assert.match(
    source,
    /const executionLineage = canonicalize\(\{[\s\S]*identity_id:[\s\S]*session_id,[\s\S]*continuity_id:[\s\S]*continuity_ancestry:[\s\S]*execution_id,/,
    'proof must construct execution lineage evidence',
  )

  assert.match(
    source,
    /INSERT INTO proof_registry[\s\S]*authority_lineage,execution_lineage[\s\S]*authorityLineage,executionLineage/,
    'proof must persist authority_lineage and execution_lineage',
  )
})

test('duplicate proof is rejected as proof replay', () => {
  assert.match(
    source,
    /CREATE TABLE IF NOT EXISTS proof_registry[\s\S]*UNIQUE\(execution_id, decision_id, validated_object_hash\)/,
    'proof registry must enforce one canonical proof per execution+decision+hash lineage',
  )

  assert.match(
    source,
    /catch \{\s*return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"proof_replay" \}/,
    'duplicate proof attempt must return NULL / INVALID proof_replay',
  )

  assert.match(
    source,
    /indicator: "duplicate_proof_or_transaction_conflict"/,
    'duplicate proof attempt must emit duplicate proof telemetry context',
  )
})

test('proof persistence emits proof telemetry', () => {
  assert.match(
    source,
    /event_type: "PROOF_PERSISTED"/,
    'successful proof persistence must emit PROOF_PERSISTED telemetry',
  )

  assert.match(
    source,
    /proof_id[\s\S]*execution_id[\s\S]*decision_id[\s\S]*validated_object_hash/,
    'proof telemetry must include proof lineage identifiers',
  )
})

test('proof_requires_matching_execution_lineage', () => {
  assert.match(
    source,
    /SELECT \* FROM execution_registry WHERE execution_id=\?1 AND decision_id=\?2 AND validated_object_hash=\?3 AND status='EXECUTED'/,
    'proof must resolve execution by exact execution_id + decision_id + validated_object_hash lineage',
  )
})

test('proof_rejects_cross_decision_execution_id', () => {
  assert.match(
    source,
    /reason:"execution_decision_mismatch"[\s\S]*indicator: "proof_execution_decision_mismatch"/,
    'proof must reject execution_id that resolves to a different decision_id',
  )
})

test('proof_rejects_missing_execution_id', () => {
  assert.match(
    source,
    /if \(!execution_id\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"missing_execution_id" \}/,
    'proof must fail closed when execution_id is missing',
  )
})

test('proof_rejects_hash_mismatch', () => {
  assert.match(
    source,
    /reason:"execution_hash_mismatch"[\s\S]*indicator: "proof_hash_mismatch"/,
    'proof must reject execution_id lineage with mismatched validated_object_hash',
  )
})

test('proof_rejection_does_not_write_proof_registry', () => {
  const proofStart = source.indexOf('if (url.pathname === "/proof" && request.method === "POST") {')
  const proofInsert = source.indexOf('INSERT INTO proof_registry', proofStart)
  const missingExecReject = source.indexOf('reason:"execution_missing"', proofStart)
  assert.ok(proofStart >= 0 && missingExecReject > proofStart && proofInsert > missingExecReject, 'expected proof lineage rejection before proof_registry insert')
  const failClosedBlock = source.slice(proofStart, proofInsert)
  assert.doesNotMatch(failClosedBlock, /INSERT INTO proof_registry/, 'proof rejection paths must not write proof_registry')
  assert.doesNotMatch(failClosedBlock, /UPDATE authority_registry SET status='CONSUMED'/, 'proof rejection paths must not consume authority')
})

test('valid_execute_proof_path_preserved', () => {
  assert.match(
    source,
    /return json\(\{ status:"EXECUTED", session_id, execution_id \}\)/,
    'execute success path must remain intact',
  )

  assert.match(
    source,
    /return json\(\{ status:"PROVEN", result:"OK", proof_id, proof:/,
    'proof success path must remain intact',
  )
})


test('duplicate proof replay returns deterministic existing proof evidence without state mutation', () => {
  assert.match(
    source,
    /SELECT \* FROM proof_registry WHERE execution_id=\?1 AND decision_id=\?2 AND validated_object_hash=\?3 ORDER BY created_at ASC, proof_id ASC LIMIT 3/,
    'proof must preflight canonical lineage duplicates before writes',
  )

  assert.match(
    source,
    /if \(proofCandidates\.length > 1 \|\| \(proofCandidates\.length === 1 && canonicalProofCandidates\.length !== 1\)\) \{[\s\S]*reason:"proof_lineage_ambiguous"/,
    'ambiguous duplicate proof lineage must fail closed',
  )

  assert.match(
    source,
    /if \(canonicalExistingProof\) \{[\s\S]*return json\(\{ status:"PROVEN", result:"OK", proof_id: String\(canonicalExistingProof\.proof_id \|\| ""\), replay: canonicalEvidenceReplay, proof: canonicalExistingProof \}\)/,
    'duplicate replay must return deterministic canonical existing proof evidence',
  )
})

test('duplicate proof preflight occurs before authority consumption mutation path', () => {
  const proofStart = source.indexOf('if (url.pathname === "/proof" && request.method === "POST") {')
  const duplicatePreflight = source.indexOf('SELECT * FROM proof_registry WHERE execution_id=?1 AND decision_id=?2 AND validated_object_hash=?3 ORDER BY created_at ASC, proof_id ASC LIMIT 3', proofStart)
  const authorityConsume = source.indexOf("UPDATE authority_registry SET status='CONSUMED'", proofStart)
  assert.ok(proofStart >= 0 && duplicatePreflight > proofStart && authorityConsume > duplicatePreflight, 'expected duplicate proof preflight before authority consumption')
})


test('proof ambiguity fail-closed binds existing proof evidence to invocation nonce', () => {
  assert.match(
    source,
    /function proofExecutionLineageMatches\(proof: any, execution: any\): boolean \{[\s\S]*executionLineage\?\.invocation_nonce[\s\S]*execution\?\.invocation_nonce/,
    'canonical existing proof evidence must match execution_id + decision_id + validated_object_hash + invocation_nonce',
  )

  assert.match(
    source,
    /const canonicalProofCandidates = proofCandidates\.filter\(\(proof: any\) => proofExecutionLineageMatches\(proof, execution\)\)/,
    'proof replay must derive canonical candidates from exact execution lineage including invocation_nonce',
  )

  assert.match(
    source,
    /classification: "PROOF_AMBIGUITY_FAIL_CLOSED_CONFIRMED"/,
    'ambiguous proof lineage telemetry must carry the requested fail-closed classification',
  )

  assert.match(
    source,
    /drift_classes: \["replay_drift", "proof_lineage_drift"\]/,
    'ambiguity telemetry must classify both replay and proof lineage drift without granting authority',
  )
})

test('proof ambiguity fail-closed returns NULL before governed mutations', () => {
  const proofStart = source.indexOf('if (url.pathname === "/proof" && request.method === "POST") {')
  const ambiguityReject = source.indexOf('PROOF_AMBIGUITY_FAIL_CLOSED_CONFIRMED', proofStart)
  const proofInsert = source.indexOf('INSERT INTO proof_registry', proofStart)
  const authorityConsume = source.indexOf("UPDATE authority_registry SET status='CONSUMED'", proofStart)
  const invocationMutation = source.indexOf('UPDATE invocation_registry', proofStart)
  const executionMutation = source.indexOf('UPDATE execution_registry', proofStart)
  assert.ok(proofStart >= 0 && ambiguityReject > proofStart, 'expected ambiguity classification inside /proof')
  assert.ok(proofInsert > ambiguityReject, 'ambiguous lineage must be rejected before proof_registry append')
  assert.ok(authorityConsume > ambiguityReject, 'ambiguous lineage must be rejected before authority consumption')
  assert.equal(invocationMutation, -1, 'proof route ambiguity handling must not mutate invocation_registry')
  assert.equal(executionMutation, -1, 'proof route ambiguity handling must not mutate execution_registry')
})
