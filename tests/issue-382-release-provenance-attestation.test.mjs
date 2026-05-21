import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const workflowSource = readFileSync(new URL('../.github/workflows/release-provenance.yml', import.meta.url), 'utf8')
const provenanceSchema = JSON.parse(readFileSync(new URL('../schemas/release_provenance_v1.json', import.meta.url), 'utf8'))
const attestationSchema = JSON.parse(readFileSync(new URL('../schemas/release_artifact_attestation_v1.json', import.meta.url), 'utf8'))

// --- Schema and DDL tests ---

test('release_provenance_registry schema has immutable append-only constraints', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS release_provenance_registry/)
  assert.match(schema, /append_only TEXT NOT NULL CHECK \(append_only='true'\)/)
  assert.match(schema, /mutable TEXT NOT NULL CHECK \(mutable='false'\)/)
  assert.match(schema, /evidence_only TEXT NOT NULL CHECK \(evidence_only='false'\)/)
  assert.match(schema, /status TEXT NOT NULL CHECK \(status IN \('PENDING','RELEASED','REJECTED','SUPERSEDED'\)\)/)
})

test('release_provenance_registry has unique constraints for tag, lineage hash, and nonce', () => {
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_release_provenance_registry_tag_unique/)
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_release_provenance_registry_lineage_unique/)
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_release_provenance_registry_nonce_unique/)
})

test('release_provenance_registry has append-only triggers preventing update and delete', () => {
  assert.match(schema, /trg_release_provenance_registry_no_update/)
  assert.match(schema, /trg_release_provenance_registry_no_delete/)
  assert.match(schema, /'release_provenance_registry is append-only'/)
})

test('release_artifact_attestation_registry schema has immutable append-only constraints', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS release_artifact_attestation_registry/)
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_release_artifact_attestation_hash_unique/)
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_release_artifact_release_artifact_unique/)
  assert.match(schema, /'release_artifact_attestation_registry is append-only'/)
})

test('release_artifact_attestation_registry requires matching release provenance via trigger', () => {
  assert.match(schema, /trg_release_artifact_attestation_requires_provenance/)
  assert.match(schema, /'release_artifact_attestation requires matching release provenance'/)
  assert.match(schema, /r\.release_id = NEW\.release_id/)
  assert.match(schema, /r\.commit_sha = NEW\.commit_sha/)
  assert.match(schema, /r\.artifact_hash = NEW\.artifact_hash/)
  assert.match(schema, /r\.release_lineage_hash = NEW\.release_lineage_hash/)
  assert.match(schema, /r\.validation_proof_id = NEW\.validation_proof_id/)
  assert.match(schema, /r\.status IN \('PENDING','RELEASED'\)/)
})

// --- Runtime route tests ---

test('release provenance and attestation routes are declared in runtime source', () => {
  assert.match(source, /RELEASE_PROVENANCE_ROUTE = "\/release\/provenance"/)
  assert.match(source, /RELEASE_ATTESTATION_ROUTE = "\/release\/attestation"/)
  assert.match(source, /RELEASE_LINEAGE_ROUTE = "\/release\/lineage"/)
  assert.match(source, /RELEASE_PROVENANCE_ROUTES = \[RELEASE_PROVENANCE_ROUTE, RELEASE_ATTESTATION_ROUTE\]/)
})

test('release lineage route is included in non-executable observability routes', () => {
  assert.match(source, /RELEASE_LINEAGE_ROUTE/)
  const nonExecBlock = source.match(/NON_EXECUTABLE_OBSERVABILITY_ROUTES = \[[\s\S]*?\] as const/)
  assert.ok(nonExecBlock, 'NON_EXECUTABLE_OBSERVABILITY_ROUTES block must exist')
  assert.match(nonExecBlock[0], /RELEASE_LINEAGE_ROUTE/)
})

test('release provenance route enforces authorization before processing', () => {
  assert.match(source, /url\.pathname === RELEASE_PROVENANCE_ROUTE && request\.method === "POST"/)
  assert.match(source, /if \(!authorized\(request, env\)\) return json\(\{ status: "NULL", reason: "unauthorized" \}, 403\)/)
})

test('replayed release nonce is rejected with deterministic reason', () => {
  assert.match(source, /reason: "replay_detected"/)
  assert.match(source, /SELECT release_id FROM release_provenance_registry WHERE invocation_nonce=\?1/)
  assert.match(source, /if \(existing_nonce\) return json\(\{ status: "NULL", reason: "replay_detected" \}, 409\)/)
})

test('duplicate release tag is rejected with deterministic reason', () => {
  assert.match(source, /reason: "release_tag_conflict"/)
  assert.match(source, /SELECT release_id FROM release_provenance_registry WHERE release_tag=\?1/)
  assert.match(source, /if \(existing_tag\) return json\(\{ status: "NULL", reason: "release_tag_conflict" \}, 409\)/)
})

test('release provenance validates proof exists in proof_registry before accepting', () => {
  assert.match(source, /SELECT proof_id, commit_sha, decision_id FROM proof_registry WHERE proof_id=\?1 AND decision_id=\?2/)
  assert.match(source, /if \(!proof\) return json\(\{ status: "NULL", reason: "proof_not_found" \}, 400\)/)
})

test('release provenance rejects commit_sha mismatch against proof lineage', () => {
  assert.match(source, /if \(String\(proof\.commit_sha \|\| ""\) !== commit_sha\) return json\(\{ status: "NULL", reason: "commit_sha_mismatch" \}, 400\)/)
})

test('release provenance computes deterministic release_lineage_hash from canonical inputs', () => {
  assert.match(source, /release_lineage_hash = await sha256Hex\(canonicalize\(\{ release_tag, commit_sha, workflow_hash, artifact_hash, validation_proof_id, decision_id \}\)\)/)
})

test('release provenance insertion uses INSERT OR IGNORE for idempotency protection', () => {
  assert.match(source, /INSERT OR IGNORE INTO release_provenance_registry/)
  assert.match(source, /if \(!insertResult\.meta\?\.changes \|\| insertResult\.meta\.changes !== 1\) return json\(\{ status: "NULL", reason: "release_provenance_conflict" \}, 409\)/)
})

test('release provenance response asserts append-only and non-mutable lineage guarantees', () => {
  assert.match(source, /status: "RELEASE_PROVENANCE_REGISTERED"/)
  assert.match(source, /append_only: true, mutable: false/)
})

test('artifact attestation rejects mismatched artifact hash against release provenance', () => {
  assert.match(source, /if \(String\(provenance\.artifact_hash \|\| ""\) !== artifact_hash\) return json\(\{ status: "NULL", reason: "artifact_hash_mismatch" \}, 400\)/)
})

test('artifact attestation rejects stale workflow hash mismatch', () => {
  assert.match(source, /if \(String\(provenance\.workflow_hash \|\| ""\) !== workflow_hash\) return json\(\{ status: "NULL", reason: "workflow_hash_mismatch" \}, 400\)/)
})

test('artifact attestation rejects mismatched commit_sha against release provenance', () => {
  assert.match(source, /if \(String\(provenance\.commit_sha \|\| ""\) !== commit_sha\) return json\(\{ status: "NULL", reason: "commit_sha_mismatch" \}, 400\)/)
})

test('artifact attestation computes deterministic attestation_hash from canonical inputs', () => {
  assert.match(source, /attestation_hash = await sha256Hex\(canonicalize\(\{ release_id, artifact_name, artifact_hash, artifact_media_type, commit_sha, workflow_hash, release_lineage_hash, validation_proof_id \}\)\)/)
})

test('artifact attestation lookup verifies release provenance status before accepting', () => {
  assert.match(source, /provenance\.status !== "PENDING" && provenance\.status !== "RELEASED"/)
  assert.match(source, /reason: "release_provenance_not_active"/)
})

test('attestation insertion uses INSERT OR IGNORE preventing duplicate attestations', () => {
  assert.match(source, /INSERT OR IGNORE INTO release_artifact_attestation_registry/)
  assert.match(source, /reason: "attestation_conflict"/)
})

test('release lineage route is read-only GET only', () => {
  assert.match(source, /url\.pathname === RELEASE_LINEAGE_ROUTE && request\.method === "GET"/)
  assert.doesNotMatch(source, /url\.pathname === RELEASE_LINEAGE_ROUTE && request\.method === "POST"/)
})

test('release lineage response includes provenance and attestations bound together', () => {
  assert.match(source, /status: "RELEASE_LINEAGE_VERIFIED"/)
  assert.match(source, /release_provenance:/)
  assert.match(source, /attestations:/)
  assert.match(source, /lineage_verified: true/)
})

test('release POST routes reject GET requests with 405', () => {
  assert.match(source, /RELEASE_PROVENANCE_ROUTES as readonly string\[\]\)\.includes\(url\.pathname\) && request\.method === "GET"/)
  assert.match(source, /reason: "post_only", allowed_methods: \["POST"\]/)
})

// --- Release schema definition tests ---

test('release_provenance_v1 schema enforces all required lineage binding fields', () => {
  const required = provenanceSchema.required
  assert.ok(required.includes('release_id'), 'release_id required')
  assert.ok(required.includes('release_tag'), 'release_tag required')
  assert.ok(required.includes('commit_sha'), 'commit_sha required')
  assert.ok(required.includes('workflow_hash'), 'workflow_hash required')
  assert.ok(required.includes('artifact_hash'), 'artifact_hash required')
  assert.ok(required.includes('validation_proof_id'), 'validation_proof_id required')
  assert.ok(required.includes('release_lineage_hash'), 'release_lineage_hash required')
  assert.ok(required.includes('decision_id'), 'decision_id required')
  assert.ok(required.includes('invocation_nonce'), 'invocation_nonce required')
})

test('release_provenance_v1 schema enforces immutability fields with const constraints', () => {
  assert.strictEqual(provenanceSchema.properties.append_only.const, 'true')
  assert.strictEqual(provenanceSchema.properties.mutable.const, 'false')
  assert.strictEqual(provenanceSchema.properties.evidence_only.const, 'false')
})

test('release_provenance_v1 schema enforces allowed status values', () => {
  assert.deepStrictEqual(provenanceSchema.properties.status.enum, ['PENDING', 'RELEASED', 'REJECTED', 'SUPERSEDED'])
})

test('release_artifact_attestation_v1 schema enforces all required attestation binding fields', () => {
  const required = attestationSchema.required
  assert.ok(required.includes('attestation_id'), 'attestation_id required')
  assert.ok(required.includes('release_id'), 'release_id required')
  assert.ok(required.includes('artifact_hash'), 'artifact_hash required')
  assert.ok(required.includes('attestation_hash'), 'attestation_hash required')
  assert.ok(required.includes('commit_sha'), 'commit_sha required')
  assert.ok(required.includes('workflow_hash'), 'workflow_hash required')
  assert.ok(required.includes('release_lineage_hash'), 'release_lineage_hash required')
  assert.ok(required.includes('validation_proof_id'), 'validation_proof_id required')
})

test('release_artifact_attestation_v1 schema enforces immutability constants', () => {
  assert.strictEqual(attestationSchema.properties.append_only.const, 'true')
  assert.strictEqual(attestationSchema.properties.mutable.const, 'false')
  assert.strictEqual(attestationSchema.properties.evidence_only.const, 'false')
})

test('release_artifact_attestation_v1 schema only allows ATTESTED/REJECTED/REVOKED status', () => {
  assert.deepStrictEqual(attestationSchema.properties.status.enum, ['ATTESTED', 'REJECTED', 'REVOKED'])
})

// --- Workflow tests ---

test('release-provenance workflow only accepts workflow_dispatch trigger', () => {
  assert.match(workflowSource, /on:\s+workflow_dispatch:/)
  assert.doesNotMatch(workflowSource, /on:\s+push:/)
  assert.doesNotMatch(workflowSource, /on:\s+pull_request:/)
})

test('release-provenance workflow enforces caller workflow self-reference guard', () => {
  assert.match(workflowSource, /CALLER_WORKFLOW_REF.*github\.workflow_ref/)
  assert.match(workflowSource, /release-provenance\.yml/)
  assert.match(workflowSource, /dispatch must enter through release-provenance\.yml/)
})

test('release-provenance workflow computes deterministic workflow hash from file content', () => {
  assert.match(workflowSource, /sha256sum .github\/workflows\/release-provenance\.yml/)
  assert.match(workflowSource, /WORKFLOW_HASH=/)
})

test('release-provenance workflow asserts replay protection inline', () => {
  assert.match(workflowSource, /replay_check\.json/)
  assert.match(workflowSource, /replay_detected/)
  assert.match(workflowSource, /replayed nonce correctly rejected/)
})

test('release-provenance workflow verifies lineage traceability after registration', () => {
  assert.match(workflowSource, /\/release\/lineage\?tag=/)
  assert.match(workflowSource, /RELEASE_LINEAGE_VERIFIED/)
  assert.match(workflowSource, /lineage commit mismatch/)
  assert.match(workflowSource, /lineage proof_id mismatch/)
})

test('release-provenance workflow creates annotated git tag with lineage metadata', () => {
  assert.match(workflowSource, /git tag -a "\$RELEASE_TAG"/)
  assert.match(workflowSource, /release_lineage_hash/)
  assert.match(workflowSource, /attestation_hash/)
  assert.match(workflowSource, /append_only: true \| mutable: false/)
})

test('release-provenance workflow uses concurrency group to prevent parallel release races', () => {
  assert.match(workflowSource, /concurrency:/)
  assert.match(workflowSource, /group: release-provenance-/)
  assert.match(workflowSource, /cancel-in-progress: false/)
})

test('release-provenance workflow hard fails on missing required secrets', () => {
  assert.match(workflowSource, /for var in RELEASE_TAG PROOF_ID DECISION_ID ARTIFACT_NAME INVOCATION_NONCE WORKER_URL API_KEY/)
  assert.match(workflowSource, /missing required variable/)
  assert.match(workflowSource, /exit 1/)
})

// --- Proof continuity binding tests ---

test('release provenance route schema initialization includes release tables in ensureSchema', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS release_provenance_registry/)
  assert.match(source, /CREATE TABLE IF NOT EXISTS release_artifact_attestation_registry/)
  assert.match(source, /trg_release_provenance_registry_no_update/)
  assert.match(source, /trg_release_artifact_attestation_requires_provenance/)
})

test('release provenance and attestation registries include in runtime table column manifest', () => {
  assert.match(source, /release_provenance_registry/)
  assert.match(source, /release_artifact_attestation_registry/)
})

test('release provenance closure: no unsigned mutable artifact path exists', () => {
  assert.doesNotMatch(source, /INSERT INTO release_provenance_registry[^I]*mutable='true'/)
  assert.doesNotMatch(source, /UPDATE release_provenance_registry/)
  assert.doesNotMatch(source, /DELETE FROM release_provenance_registry/)
})

test('release attestation closure: no mutable attestation path exists', () => {
  assert.doesNotMatch(source, /INSERT INTO release_artifact_attestation_registry[^I]*mutable='true'/)
  assert.doesNotMatch(source, /UPDATE release_artifact_attestation_registry/)
  assert.doesNotMatch(source, /DELETE FROM release_artifact_attestation_registry/)
})
