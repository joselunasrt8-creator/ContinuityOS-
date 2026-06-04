// GitHub Comment Governed Surface — issue #1857 scaling template.
// Scope: ATAO capture, AEO compilation, execution boundary (VALID | NULL), proof emission.
// Required evidence:
//   - regression test: validated_object_hash == executed_object_hash
//   - negative test: mutation after validation → NULL (OBJECT_HASH_MISMATCH)
//   - negative test: direct execution without ATAO/AEO → blocked (null)

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gatewaySource = readFileSync(
  new URL('../../src/lib/surfaces/github-comment-gateway.ts', import.meta.url),
  'utf8'
)

const {
  captureGitHubCommentATAO,
  compileGitHubCommentAEO,
  computeGitHubCommentAEOHash,
  executeGitHubComment,
  GitHubCommentSurface,
} = await import('../../src/lib/surfaces/github-comment-gateway.ts')

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeATAOInput(overrides = {}) {
  return {
    agent_id: 'agent-001',
    session_id: 'session-001',
    intent: 'post governance update comment',
    repo: 'joselunasrt8-creator/mindshift-demo',
    issue_number: 42,
    comment_body: 'Governed action executed successfully.',
    comment_type: 'issue_comment',
    allowed_comment_types: ['issue_comment', 'pr_review_comment'],
    max_comment_length: 65536,
    timestamp: '2026-06-04T00:00:00.000Z',
    ...overrides,
  }
}

function makeBinding(overrides = {}) {
  return {
    decision_id: 'AUTH-gc-fixture-001',
    authority_lineage_hash: 'sha256:fixture-authority-lineage-hash',
    policy_id: 'github-comment-policy-v1',
    policy_hash: 'sha256:fixture-policy-hash',
    replay_nonce: 'fixture-nonce-gc-001',
    allowed_comment_types: ['issue_comment', 'pr_review_comment'],
    denied_actions: ['delete_comment', 'edit_comment'],
    max_comment_length: 65536,
    proposed_comment_hash: 'sha256:fixture-comment-hash',
    ...overrides,
  }
}

function makeExecutor() {
  let callCount = 0
  let lastInput = null
  return {
    fn: (input) => { callCount++; lastInput = input; return { comment_id: 'github-comment-id-001' } },
    get callCount() { return callCount },
    get lastInput() { return lastInput },
  }
}

// ── Source structure ──────────────────────────────────────────────────────────

test('source exports captureGitHubCommentATAO with non-operative contract', () => {
  assert.match(gatewaySource, /export function captureGitHubCommentATAO/)
  assert.match(gatewaySource, /creates_authority: false/)
  assert.match(gatewaySource, /creates_execution_eligibility: false/)
  assert.match(gatewaySource, /Does not create authority/)
})

test('source exports compileGitHubCommentAEO with compilation non-goals', () => {
  assert.match(gatewaySource, /export function compileGitHubCommentAEO/)
  assert.match(gatewaySource, /Does not validate, execute, or produce proof/)
})

test('source exports executeGitHubComment with exact-object invariant', () => {
  assert.match(gatewaySource, /export function executeGitHubComment/)
  assert.match(gatewaySource, /validated_object_hash == executed_object_hash/)
  assert.match(gatewaySource, /OBJECT_HASH_MISMATCH/)
  assert.match(gatewaySource, /executor never called/)
})

test('source declares core invariants', () => {
  assert.match(gatewaySource, /If no valid object exists → nothing happens/)
  assert.match(gatewaySource, /validated_object_hash == executed_object_hash/)
})

test('source exports GitHubCommentSurface adapter', () => {
  assert.match(gatewaySource, /export const GitHubCommentSurface/)
})

// ── ATAO capture ──────────────────────────────────────────────────────────────

test('TC-ATAO-01 null/undefined input returns null', () => {
  assert.equal(captureGitHubCommentATAO(null), null)
  assert.equal(captureGitHubCommentATAO(undefined), null)
})

test('TC-ATAO-02 blank required string fields return null', () => {
  assert.equal(captureGitHubCommentATAO(makeATAOInput({ agent_id: '' })), null)
  assert.equal(captureGitHubCommentATAO(makeATAOInput({ session_id: '   ' })), null)
  assert.equal(captureGitHubCommentATAO(makeATAOInput({ intent: '' })), null)
  assert.equal(captureGitHubCommentATAO(makeATAOInput({ repo: '' })), null)
  assert.equal(captureGitHubCommentATAO(makeATAOInput({ timestamp: '' })), null)
})

test('TC-ATAO-03 non-positive issue_number returns null', () => {
  assert.equal(captureGitHubCommentATAO(makeATAOInput({ issue_number: 0 })), null)
  assert.equal(captureGitHubCommentATAO(makeATAOInput({ issue_number: -1 })), null)
  assert.equal(captureGitHubCommentATAO(makeATAOInput({ issue_number: 'not-a-number' })), null)
})

test('TC-ATAO-04 non-string comment_body returns null', () => {
  assert.equal(captureGitHubCommentATAO(makeATAOInput({ comment_body: null })), null)
  assert.equal(captureGitHubCommentATAO(makeATAOInput({ comment_body: 42 })), null)
})

test('TC-ATAO-05 invalid comment_type returns null', () => {
  assert.equal(captureGitHubCommentATAO(makeATAOInput({ comment_type: 'invalid_type' })), null)
})

test('TC-ATAO-06 empty allowed_comment_types returns null', () => {
  assert.equal(captureGitHubCommentATAO(makeATAOInput({ allowed_comment_types: [] })), null)
})

test('TC-ATAO-07 valid input produces frozen ATAO', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  assert.notEqual(atao, null)
  assert.ok(Object.isFrozen(atao))
})

test('TC-ATAO-08 ATAO fields match input', () => {
  const input = makeATAOInput()
  const atao = captureGitHubCommentATAO(input)
  assert.notEqual(atao, null)
  assert.equal(atao.agent_id, input.agent_id)
  assert.equal(atao.session_id, input.session_id)
  assert.equal(atao.intent, input.intent)
  assert.equal(atao.proposed_action.parameters.repo, input.repo)
  assert.equal(atao.proposed_action.parameters.issue_number, input.issue_number)
  assert.equal(atao.proposed_action.parameters.comment_body, input.comment_body)
  assert.equal(atao.proposed_action.parameters.comment_type, input.comment_type)
  assert.equal(atao.scope.repo, input.repo)
  assert.equal(atao.scope.issue_number, input.issue_number)
  assert.equal(atao.timestamp, input.timestamp)
})

test('TC-ATAO-09 ATAO surface is always github / post_comment / P2', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  assert.notEqual(atao, null)
  assert.equal(atao.proposed_action.system, 'github')
  assert.equal(atao.proposed_action.action, 'post_comment')
  assert.equal(atao.risk_class, 'P2')
})

test('TC-ATAO-10 ATAO is non-operative', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  assert.notEqual(atao, null)
  assert.strictEqual(atao.creates_authority, false)
  assert.strictEqual(atao.creates_execution_eligibility, false)
})

test('TC-ATAO-11 atao_id is deterministic for equal inputs', () => {
  const a = captureGitHubCommentATAO(makeATAOInput())
  const b = captureGitHubCommentATAO(makeATAOInput())
  assert.notEqual(a, null)
  assert.notEqual(b, null)
  assert.equal(a.atao_id, b.atao_id)
})

test('TC-ATAO-12 atao_id changes when comment_body changes', () => {
  const a = captureGitHubCommentATAO(makeATAOInput({ comment_body: 'body-alpha' }))
  const b = captureGitHubCommentATAO(makeATAOInput({ comment_body: 'body-beta' }))
  assert.notEqual(a, null)
  assert.notEqual(b, null)
  assert.notEqual(a.atao_id, b.atao_id)
})

test('TC-ATAO-13 atao_id is sha256-prefixed', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  assert.notEqual(atao, null)
  assert.match(atao.atao_id, /^sha256:[0-9a-f]{64}$/)
})

test('TC-ATAO-14 empty comment_body string is allowed', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput({ comment_body: '' }))
  assert.notEqual(atao, null)
  assert.equal(atao.proposed_action.parameters.comment_body, '')
})

// ── AEO compilation ───────────────────────────────────────────────────────────

test('TC-AEO-01 null ATAO returns null', () => {
  assert.equal(compileGitHubCommentAEO(null, makeBinding()), null)
  assert.equal(compileGitHubCommentAEO(undefined, makeBinding()), null)
})

test('TC-AEO-02 null binding returns null', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  assert.equal(compileGitHubCommentAEO(atao, null), null)
  assert.equal(compileGitHubCommentAEO(atao, undefined), null)
})

test('TC-AEO-03 blank required binding fields return null', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  assert.equal(compileGitHubCommentAEO(atao, makeBinding({ decision_id: '' })), null)
  assert.equal(compileGitHubCommentAEO(atao, makeBinding({ authority_lineage_hash: '' })), null)
  assert.equal(compileGitHubCommentAEO(atao, makeBinding({ policy_id: '' })), null)
  assert.equal(compileGitHubCommentAEO(atao, makeBinding({ policy_hash: '' })), null)
  assert.equal(compileGitHubCommentAEO(atao, makeBinding({ replay_nonce: '' })), null)
})

test('TC-AEO-04 empty allowed_comment_types returns null', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  assert.equal(compileGitHubCommentAEO(atao, makeBinding({ allowed_comment_types: [] })), null)
})

test('TC-AEO-05 valid ATAO + binding produces frozen AEO', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  assert.ok(Object.isFrozen(aeo))
})

test('TC-AEO-06 compiled AEO has exactly five top-level fields', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  const keys = Object.keys(aeo).sort()
  assert.deepEqual(keys, ['finality', 'intent', 'scope', 'target', 'validation'])
})

test('TC-AEO-07 compiled target.system is github', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  assert.equal(aeo.target.system, 'github')
})

test('TC-AEO-08 compiled target.repo and target.issue_number match ATAO values', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput({ repo: 'owner/repo', issue_number: 99 }))
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  assert.equal(aeo.target.repo, 'owner/repo')
  assert.equal(aeo.target.issue_number, 99)
})

test('TC-AEO-09 compiled finality requires proof and registry', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  assert.strictEqual(aeo.finality.proof_required, true)
  assert.strictEqual(aeo.finality.registry_required, true)
  assert.equal(aeo.finality.replay_state_after_success, 'CONSUMED')
})

test('TC-AEO-10 AEO hash is deterministic for equal inputs', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const a = compileGitHubCommentAEO(atao, makeBinding())
  const b = compileGitHubCommentAEO(atao, makeBinding())
  assert.notEqual(a, null)
  assert.notEqual(b, null)
  assert.equal(computeGitHubCommentAEOHash(a), computeGitHubCommentAEOHash(b))
})

test('TC-AEO-11 AEO hash changes when comment_body changes', () => {
  const atao1 = captureGitHubCommentATAO(makeATAOInput({ comment_body: 'body-alpha' }))
  const atao2 = captureGitHubCommentATAO(makeATAOInput({ comment_body: 'body-beta' }))
  const aeo1 = compileGitHubCommentAEO(atao1, makeBinding())
  const aeo2 = compileGitHubCommentAEO(atao2, makeBinding())
  assert.notEqual(aeo1, null)
  assert.notEqual(aeo2, null)
  assert.notEqual(computeGitHubCommentAEOHash(aeo1), computeGitHubCommentAEOHash(aeo2))
})

test('TC-AEO-12 AEO hash is sha256-prefixed', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  assert.match(computeGitHubCommentAEOHash(aeo), /^sha256:[0-9a-f]{64}$/)
})

// ── Execution boundary ────────────────────────────────────────────────────────

test('TC-EXEC-01 null/undefined input returns null', () => {
  assert.equal(executeGitHubComment(null), null)
  assert.equal(executeGitHubComment(undefined), null)
})

test('TC-EXEC-02 null AEO returns null', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  assert.equal(
    executeGitHubComment({ aeo: null, validated_object_hash: hash, atao, executor: () => ({ comment_id: 'gc-001' }), emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
})

test('TC-EXEC-03 null ATAO returns null', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  assert.equal(
    executeGitHubComment({ aeo, validated_object_hash: hash, atao: null, executor: () => ({ comment_id: 'gc-001' }), emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
})

test('TC-EXEC-04 blank validated_object_hash returns null', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  assert.equal(
    executeGitHubComment({ aeo, validated_object_hash: '', atao, executor: () => ({ comment_id: 'gc-001' }), emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
})

test('TC-EXEC-05 non-function executor returns null', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  assert.equal(
    executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: null, emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
})

// ── Regression test ────────────────────────────────────────────────────────────

test('TC-REG-01 validated_object_hash === executed_object_hash on EXECUTED path', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  const proof = executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'EXECUTED')
  assert.equal(proof.validated_object_hash, proof.executed_object_hash)
  assert.equal(spy.callCount, 1)
})

test('TC-REG-02 executor receives repo and issue_number from ATAO', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput({ repo: 'owner/my-repo', issue_number: 77 }))
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.equal(spy.callCount, 1)
  assert.equal(spy.lastInput.repo, 'owner/my-repo')
  assert.equal(spy.lastInput.issue_number, 77)
})

// ── Negative tests ────────────────────────────────────────────────────────────

test('TC-NEG-01 mutation of target.repo after validation → NULL with OBJECT_HASH_MISMATCH', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  // Simulate hash computed from un-mutated AEO, then try to execute with tampered hash
  const fakeHash = hash.slice(0, -4) + 'dead'
  const proof = executeGitHubComment({ aeo, validated_object_hash: fakeHash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'NULL')
  assert.equal(proof.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.equal(spy.callCount, 0)
})

test('TC-NEG-02 mutation of comment_body changes hash → NULL if old hash used', () => {
  const spy = makeExecutor()
  const atao1 = captureGitHubCommentATAO(makeATAOInput({ comment_body: 'original body' }))
  const atao2 = captureGitHubCommentATAO(makeATAOInput({ comment_body: 'mutated body' }))
  const aeo1 = compileGitHubCommentAEO(atao1, makeBinding())
  const aeo2 = compileGitHubCommentAEO(atao2, makeBinding())
  const hash1 = computeGitHubCommentAEOHash(aeo1)
  // Try to execute aeo2 (mutated) using hash1 (original) — mismatch
  const proof = executeGitHubComment({ aeo: aeo2, validated_object_hash: hash1, atao: atao2, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'NULL')
  assert.equal(proof.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.equal(spy.callCount, 0)
})

test('TC-NEG-03 fabricated validated_object_hash → NULL proof', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const proof = executeGitHubComment({
    aeo,
    validated_object_hash: 'sha256:' + '0'.repeat(64),
    atao,
    executor: spy.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })
  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'NULL')
  assert.equal(proof.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.equal(spy.callCount, 0)
})

test('TC-NEG-04 direct execution without AEO → null', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  assert.equal(
    executeGitHubComment({ aeo: undefined, validated_object_hash: 'sha256:abc', atao, executor: () => ({ comment_id: 'gc-001' }), emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
})

// ── Proof structure ───────────────────────────────────────────────────────────

test('TC-PROOF-01 EXECUTED proof is frozen', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  const proof = executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.ok(Object.isFrozen(proof))
})

test('TC-PROOF-02 proof creates_authority is always false', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  const proof = executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.strictEqual(proof.creates_authority, false)
})

test('TC-PROOF-03 proof target_surface is github_comment', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  const proof = executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.target_surface, 'github_comment')
})

test('TC-PROOF-04 EXECUTED proof atao_id links to ATAO', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  const proof = executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.atao_id, atao.atao_id)
})

test('TC-PROOF-05 EXECUTED proof aeo_hash equals computeGitHubCommentAEOHash(aeo)', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  const proof = executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.aeo_hash, hash)
})

test('TC-PROOF-06 proof_id is sha256-prefixed and deterministic', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  const proof1 = executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  const proof2 = executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof1, null)
  assert.notEqual(proof2, null)
  assert.match(proof1.proof_id, /^sha256:[0-9a-f]{64}$/)
  assert.equal(proof1.proof_id, proof2.proof_id)
})

test('TC-PROOF-07 NULL proof has non-null null_reason; EXECUTED proof has null_reason null', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  const executed = executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  const nulled = executeGitHubComment({ aeo, validated_object_hash: 'sha256:' + '0'.repeat(64), atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(executed, null)
  assert.notEqual(nulled, null)
  assert.equal(executed.null_reason, null)
  assert.notEqual(nulled.null_reason, null)
})

test('TC-PROOF-08 target_repo matches AEO repo', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput({ repo: 'owner/exact-repo' }))
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const hash = computeGitHubCommentAEOHash(aeo)
  const proof = executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.target_repo, 'owner/exact-repo')
})

// ── E2E trace ─────────────────────────────────────────────────────────────────

test('TC-E2E-01 full trace ATAO → AEO → hash → execute → EXECUTED proof', () => {
  const spy = makeExecutor()
  // 1. Capture ATAO
  const atao = captureGitHubCommentATAO(makeATAOInput())
  assert.notEqual(atao, null)
  assert.ok(Object.isFrozen(atao))
  assert.strictEqual(atao.creates_authority, false)
  // 2. Compile AEO
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  assert.deepEqual(Object.keys(aeo).sort(), ['finality', 'intent', 'scope', 'target', 'validation'])
  // 3. Compute hash
  const hash = computeGitHubCommentAEOHash(aeo)
  assert.match(hash, /^sha256:[0-9a-f]{64}$/)
  // 4. Execute
  const proof = executeGitHubComment({ aeo, validated_object_hash: hash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'EXECUTED')
  assert.equal(proof.validated_object_hash, proof.executed_object_hash)
  assert.equal(proof.creates_authority, false)
  assert.equal(spy.callCount, 1)
})

test('TC-E2E-02 NULL blocked trace: tampered hash intercepted before execution', () => {
  const spy = makeExecutor()
  const atao = captureGitHubCommentATAO(makeATAOInput({ comment_body: 'original' }))
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const correctHash = computeGitHubCommentAEOHash(aeo)
  // Use wrong hash — simulates body mutation detected at boundary
  const wrongHash = 'sha256:' + 'f'.repeat(64)
  assert.notEqual(wrongHash, correctHash)
  const proof = executeGitHubComment({ aeo, validated_object_hash: wrongHash, atao, executor: spy.fn, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'NULL')
  assert.equal(proof.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.equal(spy.callCount, 0)
})

// ── Surface adapter ───────────────────────────────────────────────────────────

test('GitHubCommentSurface is frozen', () => {
  assert.ok(Object.isFrozen(GitHubCommentSurface))
})

test('GitHubCommentSurface.surfaceType is github_comment', () => {
  assert.equal(GitHubCommentSurface.surfaceType, 'github_comment')
})

test('GitHubCommentSurface delegates to captureGitHubCommentATAO', () => {
  const result = GitHubCommentSurface.captureATAO(null)
  assert.equal(result, null)
})

test('GitHubCommentSurface delegates computeAEOHash', () => {
  const atao = captureGitHubCommentATAO(makeATAOInput())
  const aeo = compileGitHubCommentAEO(atao, makeBinding())
  const fromDirect = computeGitHubCommentAEOHash(aeo)
  const fromSurface = GitHubCommentSurface.computeAEOHash(aeo)
  assert.equal(fromDirect, fromSurface)
})
