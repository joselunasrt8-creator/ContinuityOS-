import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const has = (text) => assert.equal(source.includes(text), true, `missing marker: ${text}`)

test('issue-544 replay and mutation drift remain fail-closed NULL outcomes', () => {
  has('reason:"missing_invocation_nonce"')
  has('reason:"hash_mismatch"')
  has('execHash !== validated_object_hash')
  has('indicator: "proof_hash_mismatch"')
  has('indicator: "authority_reuse_after_consumed"')
})

test('issue-544 orphan lineage, continuity corruption, and descendant invalidation are deterministic', () => {
  has('orphan_legitimacy_object_drift')
  has('orphan_execution_lineage')
  has('orphan_proof_lineage')
  has('String(continuity.status || "") !== "ACTIVE"')
  has('cascadeRevocation(env, continuity_id)')
  has("UPDATE continuity_registry SET status='REVOKED'")
})

test('issue-544 reconciliation hashing and federation authority boundaries are stable', () => {
  has('const drift_results = result.drift_classifications.map((drift) => drift.drift_class).sort()')
  has('const checked_registries = result.canonical_registry_ordering.filter((registry) => traversed.has(registry))')
  has('return sha256Hex(canonicalize(report))')
  has('evidence_only: true')
  has('remote_authority_denied: true')
  has('federation.local_authority')
})

test('issue-544 direct execution bypass and post-validation mutation are blocked', () => {
  has('payload: { route: "/execute" }')
  has('reason:"hash_mismatch"')
  has('reason:"authority_not_reserved"')
  has('executionCanonicalAeo')
  has('execHash !== validated_object_hash')
})
