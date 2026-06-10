#!/usr/bin/env node
// Portability demo: governed GitHub issue comment execution.
//
// This demo proves the second-mutation-surface portability hypothesis: the
// same execution contract (ATAO -> AEO -> Omega validator -> execution
// boundary -> proof) used by the filesystem-write gateway
// (demo/portability/filesystem-governed-execution.mjs) also holds for a
// structurally different surface: an external GitHub API mutation
// (creating an issue comment).
//
// This is intentionally gateway-module-level, not a new HTTP route or
// execution surface: it calls src/lib/github-issue-comment-gateway.ts
// directly (capture -> compile -> validate -> execute) with a mock
// executor, mirroring the filesystem demo's reproducible, credential-free,
// in-memory pattern. No network calls are made.

import assert from 'node:assert/strict'
import { canonicalize, sha256Hex } from '../../src/canonical.js'
import {
  captureGitHubIssueCommentATAO,
  compileGitHubIssueCommentAEO,
  computeGitHubIssueCommentAEOHash,
  executeGitHubIssueComment,
  validateGitHubIssueCommentAEO,
} from '../../src/lib/github-issue-comment-gateway.ts'

const ROUTE = 'gateway-module:github-issue-comment'
const DECISION_ID = 'AUTH-github-issue-comment-gateway-001'
const POLICY_ID = 'github-issue-comment-gateway-policy-v1'
const ALLOWED_OWNER = 'joselunasrt8-creator'
const ALLOWED_REPO = 'mindshift-demo'
const ALLOWED_ISSUE_NUMBERS = [1954]
const MAX_BODY_LENGTH = 280
const DEFAULT_MODEL = 'any-model'

function parseArgs(argv) {
  const out = { model: DEFAULT_MODEL }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--model' && argv[i + 1]) {
      out.model = argv[i + 1]
      i += 1
    } else if (arg.startsWith('--model=')) {
      out.model = arg.slice('--model='.length)
    } else if (!arg.startsWith('-') && out.model === DEFAULT_MODEL) {
      out.model = arg
    }
  }
  return out
}

const POLICY_BODY = Object.freeze({
  policy_id: POLICY_ID,
  allowed_owner: ALLOWED_OWNER,
  allowed_repo: ALLOWED_REPO,
  allowed_issue_numbers: ALLOWED_ISSUE_NUMBERS,
  max_body_length: MAX_BODY_LENGTH,
})

const POLICY_HASH = `sha256:${sha256Hex(canonicalize(POLICY_BODY))}`
const AUTHORITY_LINEAGE_HASH = `sha256:${sha256Hex(canonicalize({
  decision_id: DECISION_ID,
  surface: 'github_issue_comment',
  scope: 'repository',
}))}`

function makeBinding(overrides = {}) {
  return {
    decision_id: DECISION_ID,
    authority_lineage_hash: AUTHORITY_LINEAGE_HASH,
    policy_id: POLICY_ID,
    policy_hash: POLICY_HASH,
    replay_nonce: 'portable-demo-github-comment-nonce',
    allowed_owner: ALLOWED_OWNER,
    allowed_repo: ALLOWED_REPO,
    allowed_issue_numbers: ALLOWED_ISSUE_NUMBERS,
    max_body_length: MAX_BODY_LENGTH,
    ...overrides,
  }
}

function makeContext(consumedReplayNonces) {
  return {
    authority: {
      decision_id: DECISION_ID,
      authority_lineage_hash: AUTHORITY_LINEAGE_HASH,
      policy_id: POLICY_ID,
      policy_hash: POLICY_HASH,
      status: 'ACTIVE',
    },
    consumed_replay_nonces: consumedReplayNonces,
  }
}

function makeExecutor() {
  const calls = []
  const executor = (input) => {
    calls.push(input)
    return {
      comment_id: 'demo-comment-0001',
      comment_url: `https://github.com/${input.owner}/${input.repo}/issues/${input.issue_number}#issuecomment-demo-0001`,
      executed_at: '2026-06-10T00:00:00.000Z',
    }
  }
  executor.calls = calls
  return executor
}

function makeATAOInput({ model, body, issue_number = ALLOWED_ISSUE_NUMBERS[0] }) {
  return {
    agent_id: `model:${model}`,
    session_id: 'portable-demo-session',
    intent: `portable demo issue comment emitted by ${model}`,
    owner: ALLOWED_OWNER,
    repo: ALLOWED_REPO,
    issue_number,
    body,
    timestamp: '2026-06-10T00:00:00.000Z',
  }
}

function runValid({ model, consumedReplayNonces }) {
  const atao = captureGitHubIssueCommentATAO(makeATAOInput({
    model,
    body: `Portable governed execution demo from ${model}.`,
  }))
  assert.notEqual(atao, null)

  const binding = makeBinding()
  const aeo = compileGitHubIssueCommentAEO(atao, binding)
  assert.notEqual(aeo, null)

  const validatedHash = computeGitHubIssueCommentAEOHash(aeo)
  const validation = validateGitHubIssueCommentAEO(aeo, makeContext(consumedReplayNonces), validatedHash)
  assert.equal(validation, 'VALID')

  const executor = makeExecutor()
  const proof = executeGitHubIssueComment({
    aeo,
    validated_object_hash: validatedHash,
    atao,
    executor,
    emitted_at: '2026-06-10T00:00:01.000Z',
  })
  assert.notEqual(proof, null)
  assert.equal(proof.validated_object_hash, proof.executed_object_hash)
  assert.equal(executor.calls.length, 1)

  consumedReplayNonces.add(binding.replay_nonce)

  return {
    status: 'EXECUTED',
    target_owner: aeo.target.owner,
    target_repo: aeo.target.repo,
    target_issue_number: aeo.target.issue_number,
    proof_id: proof.proof_id,
    validated_object_hash: proof.validated_object_hash,
    executed_object_hash: proof.executed_object_hash,
    exact_object_preserved: proof.validated_object_hash === proof.executed_object_hash,
    comment_id: proof.comment_id,
    comment_url: proof.comment_url,
    executor_calls: executor.calls.length,
  }
}

function runReplayNull({ model, consumedReplayNonces }) {
  const atao = captureGitHubIssueCommentATAO(makeATAOInput({
    model,
    body: `Replay attempt from ${model}; this comment must not be posted.`,
  }))
  assert.notEqual(atao, null)

  // Same replay_nonce as the VALID scenario: it has already been consumed.
  const binding = makeBinding()
  const aeo = compileGitHubIssueCommentAEO(atao, binding)
  assert.notEqual(aeo, null)

  const validatedHash = computeGitHubIssueCommentAEOHash(aeo)
  const validation = validateGitHubIssueCommentAEO(aeo, makeContext(consumedReplayNonces), validatedHash)
  assert.equal(validation, 'NULL')

  const executor = makeExecutor()
  // A real gateway would refuse to call execute() once the validator returns
  // NULL; calling it here only demonstrates that no proof results.
  const proof = validation === 'VALID'
    ? executeGitHubIssueComment({ aeo, validated_object_hash: validatedHash, atao, executor, emitted_at: '2026-06-10T00:00:02.000Z' })
    : null

  return {
    result: 'NULL',
    reason_class: 'REPLAY_NULL',
    validation_result: validation,
    execution_performed: false,
    executor_calls: executor.calls.length,
    proof_emitted: proof !== null,
  }
}

function runPolicyNull({ model, consumedReplayNonces }) {
  const deniedIssueNumber = 99999
  const atao = captureGitHubIssueCommentATAO(makeATAOInput({
    model,
    body: `Out-of-policy comment attempt from ${model}.`,
    issue_number: deniedIssueNumber,
  }))
  assert.notEqual(atao, null)

  const binding = makeBinding({ replay_nonce: 'portable-demo-github-comment-policy-nonce' })
  const aeo = compileGitHubIssueCommentAEO(atao, binding)
  assert.notEqual(aeo, null)

  const validatedHash = computeGitHubIssueCommentAEOHash(aeo)
  const validation = validateGitHubIssueCommentAEO(aeo, makeContext(consumedReplayNonces), validatedHash)
  assert.equal(validation, 'NULL')

  const executor = makeExecutor()
  const proof = validation === 'VALID'
    ? executeGitHubIssueComment({ aeo, validated_object_hash: validatedHash, atao, executor, emitted_at: '2026-06-10T00:00:02.000Z' })
    : null

  return {
    result: 'NULL',
    reason_class: 'POLICY_NULL',
    denial_reason: 'ISSUE_NOT_ALLOWED',
    validation_result: validation,
    execution_performed: false,
    executor_calls: executor.calls.length,
    proof_emitted: proof !== null,
  }
}

function main() {
  const { model } = parseArgs(process.argv.slice(2))
  const consumedReplayNonces = new Set()

  const valid = runValid({ model, consumedReplayNonces })
  const nullReplay = runReplayNull({ model, consumedReplayNonces })
  const nullPolicy = runPolicyNull({ model, consumedReplayNonces })

  const output = {
    demo: 'github-issue-comment-governed-execution-reference-adapter',
    model_input: model,
    route: ROUTE,
    invariant: 'validated_object_hash == executed_object_hash; NULL emits no proof',
    valid,
    null_replay: nullReplay,
    null_policy: nullPolicy,
  }

  console.log(JSON.stringify(output, null, 2))
}

main()
