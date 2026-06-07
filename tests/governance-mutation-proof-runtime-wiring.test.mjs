import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// ── GAP-005 closure: verifies the /execute -> /proof binding for governance
// mutations is actually wired into the runtime /proof handler in src/index.ts,
// not just implemented as a standalone pure module.
//
// Anchor: GOVERNANCE_GAP_REGISTRY.md GAP-005, issue #1831

const source = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../migrations/0071_governance_mutation_proof_registry.sql', import.meta.url), 'utf8')

test('GAP-005: /proof imports the governance mutation proof builder', () => {
  assert.match(source, /import \{ buildGovernanceMutationProof \} from "\.\/lib\/governance-mutation-proof\.ts"/)
})

test('GAP-005: /proof preserves the canonical PROVEN return prefix and appends governance_mutation_proof', () => {
  // Critical: must not alter the regex matched by tests/fate/proof-lineage-enforcement.test.mjs
  assert.match(source, /return json\(\{ status:"PROVEN", result:"OK", proof_id, proof:/)
  assert.match(source, /governance_mutation_proof: governanceMutationProof \?/)
})

test('GAP-005: governance mutation proof emission only runs after authority consumption succeeds', () => {
  const authorityConsumedIdx = source.indexOf('event_type: "AUTHORITY_CONSUMED"')
  const gmaDetectionIdx = source.indexOf('b.governance_mutation_authorization')
  const finalReturnIdx = source.lastIndexOf('return json({ status:"PROVEN", result:"OK", proof_id, proof:')
  assert.ok(authorityConsumedIdx > -1 && gmaDetectionIdx > -1 && finalReturnIdx > -1)
  assert.ok(gmaDetectionIdx > authorityConsumedIdx, 'governance mutation proof detection must occur after authority consumption telemetry')
  assert.ok(finalReturnIdx > gmaDetectionIdx, 'final response must be returned after governance mutation proof handling')
})

test('GAP-005: governance mutation proof is fail-closed — built via buildGovernanceMutationProof with full lineage inputs', () => {
  assert.match(source, /governanceMutationProof = buildGovernanceMutationProof\(\{/)
  assert.match(source, /compiled_object_hash: proofHash,/)
  assert.match(source, /executed_object_hash: String\(execution\.validated_object_hash \|\| ""\),/)
  assert.match(source, /seen_proof_ids/)
})

test('GAP-005: replay of an existing governance mutation proof lineage collapses to NULL', () => {
  assert.match(source, /governanceMutationProof = \{ status: "NULL", reason: "proof_replay" \}/)
})

test('GAP-005: persistence target is governance_mutation_proof_registry, bound to the underlying execution proof_id', () => {
  assert.match(source, /INSERT OR IGNORE INTO governance_mutation_proof_registry \(proof_id,lineage_hash,session_id,continuity_id,decision_id,authority_id,gma_id,compiled_object_hash,executed_object_hash,execution_proof_id,created_at\)/)
})

test('GAP-005: governance_mutation_proof_registry table is created in ensureSchema with replay/lineage triggers', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS governance_mutation_proof_registry \(proof_id TEXT PRIMARY KEY, lineage_hash TEXT NOT NULL, session_id TEXT NOT NULL, continuity_id TEXT NOT NULL, decision_id TEXT NOT NULL, authority_id TEXT NOT NULL, gma_id TEXT NOT NULL, compiled_object_hash TEXT NOT NULL, executed_object_hash TEXT NOT NULL, execution_proof_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE\(lineage_hash\), UNIQUE\(execution_proof_id\)\)/)
  assert.match(source, /trg_governance_mutation_proof_requires_hash_match/)
  assert.match(source, /trg_governance_mutation_proof_requires_valid_proof/)
})

test('GAP-005: schema.sql declares governance_mutation_proof_registry bound to proof_registry lineage', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS governance_mutation_proof_registry/)
  assert.match(schema, /trg_governance_mutation_proof_requires_hash_match/)
  assert.match(schema, /trg_governance_mutation_proof_requires_valid_proof/)
  assert.match(schema, /FROM proof_registry p\s+WHERE p\.proof_id = NEW\.execution_proof_id/)
})

test('GAP-005: migration 0071 adds the governance_mutation_proof_registry persistence layer', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS governance_mutation_proof_registry/)
  assert.match(migration, /UNIQUE\(lineage_hash\)/)
  assert.match(migration, /UNIQUE\(execution_proof_id\)/)
  assert.match(migration, /#1831/)
})
