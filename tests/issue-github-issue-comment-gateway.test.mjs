// Bounded Agent Tool Gateway action: GitHub issue comment.
// Scope: ATAO capture, exact five-field AEO, VALID|NULL validator, exact-object execution proof.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gatewaySource = readFileSync(new URL('../src/lib/agent-tool-gateway.ts', import.meta.url), 'utf8')
const issueCommentSource = readFileSync(new URL('../src/lib/github-issue-comment-gateway.ts', import.meta.url), 'utf8')

const {
  captureGitHubIssueCommentATAO,
  compileGitHubIssueCommentAEO,
  computeGitHubIssueCommentAEOHash,
  executeGitHubIssueComment,
  validateGitHubIssueCommentAEO,
  GITHUB_ISSUE_COMMENT_PROOF_FIELDS,
} = await import('../src/lib/github-issue-comment-gateway.ts')

function makeATAOInput(overrides = {}) {
  return {
    agent_id: 'agent-001',
    session_id: 'session-001',
    intent: 'reply to triage question on a bounded GitHub issue',
    owner: 'example-owner',
    repo: 'example-repo',
    issue_number: 42,
    body: 'Thanks for the report. This is now queued for review.',
    timestamp: '2026-06-04T00:00:00.000Z',
    ...overrides,
  }
}

function makeBinding(overrides = {}) {
  return {
    decision_id: 'AUTH-github-comment-001',
    authority_lineage_hash: 'sha256:authority-lineage-fixture',
    policy_id: 'github-issue-comment-policy-v1',
    policy_hash: 'sha256:policy-fixture',
    replay_nonce: 'github-comment-nonce-001',
    allowed_owner: 'example-owner',
    allowed_repo: 'example-repo',
    allowed_issue_numbers: [42],
    max_body_length: 280,
    ...overrides,
  }
}

function makeContext(overrides = {}) {
  return {
    authority: {
      decision_id: 'AUTH-github-comment-001',
      authority_lineage_hash: 'sha256:authority-lineage-fixture',
      policy_id: 'github-issue-comment-policy-v1',
      policy_hash: 'sha256:policy-fixture',
      status: 'ACTIVE',
    },
    consumed_replay_nonces: new Set(),
    ...overrides,
  }
}

function makeAEO({ ataoOverrides = {}, bindingOverrides = {} } = {}) {
  const atao = captureGitHubIssueCommentATAO(makeATAOInput(ataoOverrides))
  assert.notEqual(atao, null)
  const aeo = compileGitHubIssueCommentAEO(atao, makeBinding(bindingOverrides))
  assert.notEqual(aeo, null)
  return { atao, aeo }
}

function makeExecutor(evidenceOverrides = {}) {
  const calls = []
  const executor = (input) => {
    calls.push(input)
    return {
      comment_id: 'comment-123',
      comment_url: 'https://github.com/example-owner/example-repo/issues/42#issuecomment-123',
      executed_at: '2026-06-04T00:01:00.000Z',
      ...evidenceOverrides,
    }
  }
  executor.calls = calls
  return executor
}

// ── Gateway registration bound ───────────────────────────────────────────────

test('GitHub issue comment is the only new GitHub action registered in the generic risk table', () => {
  assert.match(gatewaySource, /\["comment_issue",\s*\{ system: "github",\s*risk_class: "P2" \}\]/)
  assert.doesNotMatch(gatewaySource, /\["close_issue"/)
  assert.doesNotMatch(gatewaySource, /\["edit_issue"/)
  assert.doesNotMatch(gatewaySource, /\["delete_comment"/)
})

test('bounded module is scoped only to comment_issue and does not define other GitHub mutations', () => {
  assert.match(issueCommentSource, /Scope: one GitHub action only: comment_issue/)
  assert.doesNotMatch(issueCommentSource, /close_issue/)
  assert.doesNotMatch(issueCommentSource, /edit_issue/)
  assert.doesNotMatch(issueCommentSource, /delete_comment/)
})

// ── ATAO capture before authority/execution ──────────────────────────────────

test('ATAO captures proposed GitHub issue comment before authority or execution', () => {
  const input = makeATAOInput()
  const atao = captureGitHubIssueCommentATAO(input)
  assert.notEqual(atao, null)
  assert.equal(atao.proposed_action.system, 'github')
  assert.equal(atao.proposed_action.action, 'comment_issue')
  assert.equal(atao.proposed_action.parameters.body, input.body)
  assert.equal(atao.risk_class, 'P2')
  assert.strictEqual(atao.creates_authority, false)
  assert.strictEqual(atao.creates_execution_eligibility, false)
})

test('ATAO rejects invalid proposed issue comments', () => {
  assert.equal(captureGitHubIssueCommentATAO(null), null)
  assert.equal(captureGitHubIssueCommentATAO(makeATAOInput({ body: '' })), null)
  assert.equal(captureGitHubIssueCommentATAO(makeATAOInput({ issue_number: 0 })), null)
})

// ── AEO exact shape ──────────────────────────────────────────────────────────

test('compiled AEO contains exactly intent, scope, validation, target, finality', () => {
  const { aeo } = makeAEO()
  assert.deepEqual(Object.keys(aeo).sort(), ['finality', 'intent', 'scope', 'target', 'validation'])
})

test('AEO compilation requires authority binding and stays scoped to comment_issue', () => {
  const atao = captureGitHubIssueCommentATAO(makeATAOInput())
  assert.notEqual(atao, null)
  assert.equal(compileGitHubIssueCommentAEO(atao, null), null)
  assert.equal(compileGitHubIssueCommentAEO(atao, makeBinding({ decision_id: '' })), null)
  const aeo = compileGitHubIssueCommentAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  assert.equal(aeo.target.action, 'comment_issue')
  assert.equal(aeo.finality.proof_type, 'github_issue_comment_execution')
  assert.deepEqual(aeo.finality.proof_fields, GITHUB_ISSUE_COMMENT_PROOF_FIELDS)
})

// ── Validator VALID|NULL boundary ────────────────────────────────────────────

test('validator returns VALID for exact authorized unreplayed object', () => {
  const { aeo } = makeAEO()
  const hash = computeGitHubIssueCommentAEOHash(aeo)
  assert.equal(validateGitHubIssueCommentAEO(aeo, makeContext(), hash), 'VALID')
})

test('validator returns only VALID or NULL across valid and invalid inputs', () => {
  const { aeo } = makeAEO()
  const results = [
    validateGitHubIssueCommentAEO(aeo, makeContext()),
    validateGitHubIssueCommentAEO(null, makeContext()),
    validateGitHubIssueCommentAEO({ ...aeo, extra: true }, makeContext()),
    validateGitHubIssueCommentAEO(aeo, makeContext({ consumed_replay_nonces: new Set(['github-comment-nonce-001']) })),
  ]
  assert.deepEqual([...new Set(results)].sort(), ['NULL', 'VALID'])
})

test('invalid, replayed, mutated, missing-authority, or extra-field objects return NULL', () => {
  const { aeo } = makeAEO()
  const validatedHash = computeGitHubIssueCommentAEOHash(aeo)
  assert.equal(validateGitHubIssueCommentAEO({ ...aeo, target: { ...aeo.target, issue_number: 7 } }, makeContext()), 'NULL')
  assert.equal(validateGitHubIssueCommentAEO(aeo, makeContext({ consumed_replay_nonces: new Set(['github-comment-nonce-001']) })), 'NULL')
  assert.equal(validateGitHubIssueCommentAEO({ ...aeo, target: { ...aeo.target, body: 'mutated after validation' } }, makeContext(), validatedHash), 'NULL')
  assert.equal(validateGitHubIssueCommentAEO(aeo, null), 'NULL')
  assert.equal(validateGitHubIssueCommentAEO(aeo, makeContext({ authority: { ...makeContext().authority, status: 'REVOKED' } })), 'NULL')
  assert.equal(validateGitHubIssueCommentAEO({ ...aeo, extra_field: true }, makeContext()), 'NULL')
  assert.equal(validateGitHubIssueCommentAEO({ ...aeo, target: { ...aeo.target, extra_field: true } }, makeContext()), 'NULL')
  assert.equal(validateGitHubIssueCommentAEO({
    ...aeo,
    finality: { ...aeo.finality, proof_fields: ['comment_id'] },
  }, makeContext()), 'NULL')
})

// ── Execution proof boundary ─────────────────────────────────────────────────

test('execution proof emits only after comment execution evidence exists and proves hash equality', () => {
  const { atao, aeo } = makeAEO()
  const validatedHash = computeGitHubIssueCommentAEOHash(aeo)
  assert.equal(validateGitHubIssueCommentAEO(aeo, makeContext(), validatedHash), 'VALID')
  const executor = makeExecutor()
  const proof = executeGitHubIssueComment({
    aeo,
    validated_object_hash: validatedHash,
    validation_result: 'VALID',
    atao,
    executor,
    emitted_at: '2026-06-04T00:02:00.000Z',
  })
  assert.notEqual(proof, null)
  assert.equal(executor.calls.length, 1)
  assert.equal(proof.validated_object_hash, validatedHash)
  assert.equal(proof.executed_object_hash, validatedHash)
  assert.equal(proof.aeo_hash, validatedHash)
  assert.equal(proof.target_surface, 'github')
  assert.equal(proof.target_action, 'comment_issue')
  assert.equal(proof.comment_id, 'comment-123')
  assert.match(proof.execution_evidence_hash, /^sha256:[0-9a-f]{64}$/)
  assert.deepEqual(Object.keys(proof).sort(), [
    'aeo_hash',
    'atao_id',
    'comment_id',
    'comment_url',
    'creates_authority',
    'emitted_at',
    'executed_object_hash',
    'execution_evidence_hash',
    'execution_result',
    'issue_number',
    'owner',
    'proof_id',
    'repo',
    'target_action',
    'target_surface',
    'validated_object_hash',
  ])
})

test('execution boundary does not post unless validator result is VALID', () => {
  const { atao, aeo } = makeAEO()
  const validatedHash = computeGitHubIssueCommentAEOHash(aeo)
  const executor = makeExecutor()
  const proof = executeGitHubIssueComment({
    aeo,
    validated_object_hash: validatedHash,
    validation_result: 'NULL',
    atao,
    executor,
    emitted_at: '2026-06-04T00:02:00.000Z',
  })
  assert.equal(proof, null)
  assert.equal(executor.calls.length, 0)
})

test('proof is not emitted when executor returns no comment evidence', () => {
  const { atao, aeo } = makeAEO()
  const validatedHash = computeGitHubIssueCommentAEOHash(aeo)
  let called = false
  const proof = executeGitHubIssueComment({
    aeo,
    validated_object_hash: validatedHash,
    validation_result: 'VALID',
    atao,
    executor: () => {
      called = true
      return null
    },
    emitted_at: '2026-06-04T00:02:00.000Z',
  })
  assert.equal(called, true)
  assert.equal(proof, null)
})

test('execution boundary rejects object mutation after validation and does not call executor', () => {
  const { atao, aeo } = makeAEO()
  const validatedHash = computeGitHubIssueCommentAEOHash(aeo)
  const mutated = {
    ...aeo,
    target: {
      ...aeo.target,
      body: 'mutated after validation',
    },
  }
  const executor = makeExecutor()
  const proof = executeGitHubIssueComment({
    aeo: mutated,
    validated_object_hash: validatedHash,
    validation_result: 'VALID',
    atao,
    executor,
    emitted_at: '2026-06-04T00:02:00.000Z',
  })
  assert.equal(proof, null)
  assert.equal(executor.calls.length, 0)
})
