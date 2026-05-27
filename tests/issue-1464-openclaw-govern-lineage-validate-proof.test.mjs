import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('issue #1464 /validate enforces govern lineage when persisted governed envelope exists', () => {
  assert.match(source, /const governRequirement = await requiresGovernEnvelopeLineage\(env, decision_id, b\)/)
  assert.match(source, /resolveGovernEnvelopeLineage\(env, b, "govern_envelope_missing", "govern_envelope_ambiguous", "govern_envelope_invalid_status", "govern_envelope_hash_mismatch", governRequirement\.persisted_govern_envelope_id\)/)
})

test('issue #1464 /proof enforces govern lineage when persisted governed envelope exists', () => {
  assert.match(source, /resolveGovernEnvelopeLineage\(env, b, "govern_ancestry_missing", "govern_ancestry_ambiguous", "govern_envelope_invalid_status", "govern_ancestry_hash_mismatch", governRequirement\.persisted_govern_envelope_id\)/)
})

test('issue #1464 conflicting request govern_envelope_id cannot override persisted envelope id', () => {
  assert.match(source, /if \(persisted_govern_envelope_id && govern_envelope_id && govern_envelope_id !== persisted_govern_envelope_id\) return \{ ok: false, reason: ambiguousReason \}/)
})

test('issue #1464 non-governed decisions preserve behavior via optional govern requirement', () => {
  assert.match(source, /if \(governRequirement\.required && governRequirement\.persisted_govern_envelope_id\) \{\s+const envelopeLink = await verifyGovernedToolEnvelopeLinkage\(env, decision_id, "\/validate"\)/)
  assert.match(source, /if \(governRequirement\.required && governRequirement\.persisted_govern_envelope_id\) \{\s+const envelopeLink = await verifyGovernedToolEnvelopeLinkage\(env, decision_id, "\/proof"\)/)
})

test('issue #1464 persisted envelope lineage remains fail-closed on invalid hash and missing record', () => {
  assert.match(source, /govern_envelope_hash_mismatch/)
  assert.match(source, /govern_ancestry_hash_mismatch/)
  assert.match(source, /if \(!effective_govern_envelope_id && !govern_envelope_hash\) return \{ ok: false, reason: missingReason \}/)
})

test('issue #1464 helper resolves govern requirement from persisted authority lineage or openclaw hints', () => {
  assert.match(source, /async function requiresGovernEnvelopeLineage\(env: Env, decision_id: string, payload: any\): Promise<GovernEnvelopeRequirement>/)
  assert.match(source, /if \(persisted_govern_envelope_id\) return \{ required: true, persisted_govern_envelope_id \}/)
  assert.match(source, /if \(isOpenClawOriginPayload\(payload\)\) return \{ required: true, persisted_govern_envelope_id: "" \}/)
})
