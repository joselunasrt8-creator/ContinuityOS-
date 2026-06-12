#!/usr/bin/env node
// Live operational proof for issue #2014 (Highest-Leverage Wedge):
//
//   Agent -> proposes action -> ATAO -> Authority -> AEO -> Validator
//   -> VALID | NULL -> Execution Boundary -> Proof
//
// Unlike demo/portability/github-issue-comment-governed-execution.mjs (an
// in-memory, mock-executor portability reference), this script drives the
// SAME gateway module (src/lib/github-issue-comment-gateway.ts) against a
// REAL GitHub issue comment execution, with the actual network call
// performed out-of-band (via the GitHub MCP integration) and fed back in as
// execution evidence.
//
// Two modes:
//   plan   - capture ATAO -> compile AEO -> validate, for both the VALID
//            case (issue #2014, in authority scope) and the NULL case
//            (issue #2003, outside authority scope). Prints the exact
//            comment body to post for the VALID case and confirms the NULL
//            case never reaches the executor.
//   prove  - given real execution evidence (--comment-id, --comment-url,
//            --executed-at) for the VALID case, recompute the same AEO and
//            call executeGitHubIssueComment to emit the canonical proof
//            with validated_object_hash == executed_object_hash.
//
// No network calls are made by this script itself.

import assert from 'node:assert/strict'
import { canonicalize, sha256Hex } from '../../src/canonical.js'
import {
  captureGitHubIssueCommentATAO,
  compileGitHubIssueCommentAEO,
  computeGitHubIssueCommentAEOHash,
  executeGitHubIssueComment,
  validateGitHubIssueCommentAEO,
} from '../../src/lib/github-issue-comment-gateway.ts'

const ROUTE = 'gateway-module:github-issue-comment (live)'
const ALLOWED_OWNER = 'joselunasrt8-creator'
const ALLOWED_REPO = 'ContinuityOS-'
const ALLOWED_ISSUE_NUMBERS = [2014]
const MAX_BODY_LENGTH = 2000
const DECISION_ID = 'AUTH-github-issue-comment-live-2014-001'
const POLICY_ID = 'github-issue-comment-live-2014-policy-v1'
const TIMESTAMP = '2026-06-12T08:00:00.000Z'
const AGENT_ID = 'agent:continuityos-session-yur14k'
const SESSION_ID = 'standing-authority-operational-proof-yur14k'

const VALID_ISSUE_NUMBER = 2014
const NULL_ISSUE_NUMBER = 2003

const VALID_BODY = [
  'Governed execution proof (live) for issue #2014.',
  '',
  'This comment was posted only after `validateGitHubIssueCommentAEO` returned',
  '`VALID` for a `github_issue_comment` AEO scoped to this issue',
  '(allowed_issue_numbers = [2014]). `validated_object_hash == executed_object_hash`',
  'for the emitted proof — see `evidence/agent-execution/2014-governed-github-comment-proof.md`.',
  '',
  'NULL control: a structurally identical proposal scoped to issue #2003',
  '(outside this authority\'s allowed_issue_numbers) returned `NULL` from the',
  'same validator and posted no comment.',
].join('\n')

const NULL_BODY = [
  'NULL control attempt (must not be posted).',
  '',
  'This proposal targets issue #2003, which is outside the authority scope',
  '(allowed_issue_numbers = [2014]) bound for this live demo. The validator',
  'must return NULL and the execution boundary must never be reached.',
].join('\n')

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
  repo: `${ALLOWED_OWNER}/${ALLOWED_REPO}`,
}))}`

function makeBinding(overrides = {}) {
  return {
    decision_id: DECISION_ID,
    authority_lineage_hash: AUTHORITY_LINEAGE_HASH,
    policy_id: POLICY_ID,
    policy_hash: POLICY_HASH,
    replay_nonce: 'live-2014-wedge-proof-yur14k',
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

function makeATAOInput({ issue_number, body }) {
  return {
    agent_id: AGENT_ID,
    session_id: SESSION_ID,
    intent: `live governed execution proof for issue #2014 (target #${issue_number})`,
    owner: ALLOWED_OWNER,
    repo: ALLOWED_REPO,
    issue_number,
    body,
    timestamp: TIMESTAMP,
  }
}

function buildValid() {
  const atao = captureGitHubIssueCommentATAO(makeATAOInput({
    issue_number: VALID_ISSUE_NUMBER,
    body: VALID_BODY,
  }))
  assert.notEqual(atao, null)

  const binding = makeBinding()
  const aeo = compileGitHubIssueCommentAEO(atao, binding)
  assert.notEqual(aeo, null)

  const validatedHash = computeGitHubIssueCommentAEOHash(aeo)
  const validation = validateGitHubIssueCommentAEO(aeo, makeContext(new Set()), validatedHash)

  return { atao, aeo, validatedHash, validation }
}

function buildNull() {
  const atao = captureGitHubIssueCommentATAO(makeATAOInput({
    issue_number: NULL_ISSUE_NUMBER,
    body: NULL_BODY,
  }))
  assert.notEqual(atao, null)

  const binding = makeBinding({ replay_nonce: 'live-2014-null-control-yur14k' })
  const aeo = compileGitHubIssueCommentAEO(atao, binding)
  assert.notEqual(aeo, null)

  const validatedHash = computeGitHubIssueCommentAEOHash(aeo)
  const validation = validateGitHubIssueCommentAEO(aeo, makeContext(new Set()), validatedHash)

  return { atao, aeo, validatedHash, validation }
}

function parseArgs(argv) {
  const out = { mode: argv[0] }
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--') && argv[i + 1] !== undefined) {
      out[arg.slice(2)] = argv[i + 1]
      i += 1
    }
  }
  return out
}

function plan() {
  const valid = buildValid()
  const nul = buildNull()

  assert.equal(valid.validation, 'VALID')
  assert.equal(nul.validation, 'NULL')

  console.log(JSON.stringify({
    demo: 'github-issue-comment-live-execution-plan',
    route: ROUTE,
    valid: {
      validation: valid.validation,
      validated_object_hash: valid.validatedHash,
      target: valid.aeo.target,
      comment_body_to_post: valid.aeo.target.body,
    },
    null_control: {
      validation: nul.validation,
      validated_object_hash: nul.validatedHash,
      target: nul.aeo.target,
      execution_performed: false,
      reason: 'target issue #2003 not in scope.allowed_issue_numbers ([2014])',
    },
  }, null, 2))
}

function prove({ 'comment-id': commentId, 'comment-url': commentUrl, 'executed-at': executedAt }) {
  assert.ok(commentId, '--comment-id is required')
  assert.ok(commentUrl, '--comment-url is required')
  assert.ok(executedAt, '--executed-at is required')

  const valid = buildValid()
  assert.equal(valid.validation, 'VALID')

  const executor = (input) => ({
    comment_id: commentId,
    comment_url: commentUrl,
    executed_at: executedAt,
  })

  const proof = executeGitHubIssueComment({
    aeo: valid.aeo,
    validated_object_hash: valid.validatedHash,
    atao: valid.atao,
    executor,
    emitted_at: executedAt,
  })
  assert.notEqual(proof, null)
  assert.equal(proof.validated_object_hash, proof.executed_object_hash)

  console.log(JSON.stringify({
    demo: 'github-issue-comment-live-execution-prove',
    route: ROUTE,
    proof,
    exact_object_preserved: proof.validated_object_hash === proof.executed_object_hash,
  }, null, 2))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.mode === 'plan') return plan()
  if (args.mode === 'prove') return prove(args)
  console.error('usage: github-issue-comment-live-execution.mjs <plan|prove> [--comment-id ID --comment-url URL --executed-at TS]')
  process.exit(1)
}

main()
