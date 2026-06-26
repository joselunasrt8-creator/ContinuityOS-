#!/usr/bin/env node
// actions/continuity-merge-guard/check.mjs
// ContinuityOS Merge Guard — v1
//
// Smallest-release legitimacy check for a pull request:
//
//   canonical payload {repo, pr_number, head_sha, base_sha, actor, author_kind, require_agent_authored}
//     -> canonicalize -> sha256
//     -> VALID  (identity complete, policy satisfied)
//        | NULL (missing identity, invalid policy input, or policy mismatch; fail-closed)
//     -> proof artifact (MERGE_GUARD_PROOF.json)
//
// A descriptive Agent Identity attribution object (Phase 1) is computed
// alongside the decision and recorded in the proof WITHOUT entering the
// canonical object-identity payload — attribution is metadata, not identity,
// so the canonical_hash is unchanged and backward-compatible. See
// attribution.mjs and governance/merge-legitimacy/AGENT_ATTRIBUTION_SPEC.json.
//
// Self-contained: no external npm dependencies. canonicalize/sha256Hex live in
// canonical.mjs (same algorithm as conformance/pack-v1/harness.mjs, proven
// deterministic); the whole directory is copyable to any repo unmodified.

import { writeFileSync, appendFileSync } from 'node:fs'
import { canonicalize, sha256Hex } from './canonical.mjs'
import { classifyAttribution } from './attribution.mjs'

export { canonicalize, sha256Hex }

// ─────────────────────────────────────────────────────────────────────────────
// Decision logic — v1 identity completeness plus an optional agent-authored
// workflow policy. The policy is intentionally explicit: callers must supply
// both the author classification and whether this workflow requires agent
// authorship. There is no hidden GitHub API lookup or inferred authority.
// ─────────────────────────────────────────────────────────────────────────────
const REQUIRED_FIELDS = ['repo', 'pr_number', 'head_sha', 'base_sha', 'actor']
const AUTHOR_KINDS = ['agent', 'human', 'unknown']
const REQUIRE_AGENT_VALUES = ['true', 'false']
const REQUIRE_DIFF_VALUES = ['true', 'false']
const REQUIRE_REVIEW_VALUES = ['true', 'false']
const REQUIRE_MERGE_COMMIT_VALUES = ['true', 'false']
const SHA256_BINDING_RE = /^sha256:[0-9a-f]{64}$/
const GIT_SHA_RE = /^[0-9a-f]{40}$/

function normalizeString(v) {
  return typeof v === 'string' ? v.trim() : ''
}

export function formatGitHubOutputRecord(name, value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid GitHub output name: ${name}`)
  }

  const text = value === undefined || value === null ? '' : String(value)
  let delimiter = `MERGE_GUARD_OUTPUT_${sha256Hex(`${name}\0${text}`).slice(0, 16)}`
  let suffix = 0
  while (text.split(/\r?\n/).includes(delimiter)) {
    suffix++
    delimiter = `MERGE_GUARD_OUTPUT_${sha256Hex(`${name}\0${suffix}\0${text}`).slice(0, 16)}`
  }

  return `${name}<<${delimiter}\n${text}\n${delimiter}\n`
}

function normalizeAuthorKind(v) {
  const authorKind = normalizeString(v).toLowerCase() || 'unknown'
  return authorKind
}

function normalizeRequireAgentAuthored(v) {
  const required = normalizeString(v).toLowerCase() || 'false'
  return required
}

function normalizeRequireDiffBinding(v) {
  const required = normalizeString(v).toLowerCase() || 'false'
  return required
}

function normalizeRequireReviewBinding(v) {
  const required = normalizeString(v).toLowerCase() || 'false'
  return required
}

function normalizeRequireMergeCommitBinding(v) {
  const required = normalizeString(v).toLowerCase() || 'false'
  return required
}

function normalizeChangedFilesHash(v) {
  return normalizeString(v).toLowerCase()
}

function normalizeChangedFilesCount(v) {
  return normalizeString(v)
}

function normalizeReviewState(v) {
  return normalizeString(v).toUpperCase()
}

function normalizeReviewCommitSha(v) {
  return normalizeString(v).toLowerCase()
}

function normalizeReviewAuthor(v) {
  return normalizeString(v)
}

function normalizeMergeCommitSha(v) {
  return normalizeString(v).toLowerCase()
}

function normalizeMergedAt(v) {
  return normalizeString(v)
}

function isNonNegativeIntegerString(v) {
  return /^(0|[1-9][0-9]*)$/.test(v)
}

export function evaluate(input) {
  const missing_fields = REQUIRED_FIELDS.filter(f => {
    const v = input[f]
    return v === undefined || v === null || v === ''
  })

  const author_kind = normalizeAuthorKind(input.author_kind)
  const require_agent_authored = normalizeRequireAgentAuthored(input.require_agent_authored)
  const require_diff_binding = normalizeRequireDiffBinding(input.require_diff_binding)
  const changed_files_hash = normalizeChangedFilesHash(input.changed_files_hash)
  const changed_files_count = normalizeChangedFilesCount(input.changed_files_count)
  const require_review_binding = normalizeRequireReviewBinding(input.require_review_binding)
  const review_state = normalizeReviewState(input.review_state)
  const review_commit_sha = normalizeReviewCommitSha(input.review_commit_sha)
  const review_author = normalizeReviewAuthor(input.review_author)
  const require_merge_commit_binding = normalizeRequireMergeCommitBinding(input.require_merge_commit_binding)
  const merge_commit_sha = normalizeMergeCommitSha(input.merge_commit_sha)
  const merged_at = normalizeMergedAt(input.merged_at)

  const invalid_fields = []
  if (!AUTHOR_KINDS.includes(author_kind)) invalid_fields.push('author_kind')
  if (!REQUIRE_AGENT_VALUES.includes(require_agent_authored)) invalid_fields.push('require_agent_authored')
  if (!REQUIRE_DIFF_VALUES.includes(require_diff_binding)) invalid_fields.push('require_diff_binding')
  if (!REQUIRE_REVIEW_VALUES.includes(require_review_binding)) invalid_fields.push('require_review_binding')
  if (!REQUIRE_MERGE_COMMIT_VALUES.includes(require_merge_commit_binding)) invalid_fields.push('require_merge_commit_binding')

  const null_reasons = []
  if (missing_fields.length > 0) null_reasons.push('MISSING_REQUIRED_FIELD')
  if (invalid_fields.length > 0) null_reasons.push('INVALID_POLICY_FIELD')

  const agent_author_required = require_agent_authored === 'true'
  if (agent_author_required && author_kind !== 'agent') {
    null_reasons.push('AGENT_AUTHOR_REQUIRED')
  }

  const diff_binding_required = require_diff_binding === 'true'
  const diff_binding_supplied = changed_files_hash !== '' || changed_files_count !== ''
  const diff_binding = {
    changed_files_hash: changed_files_hash || null,
    changed_files_count: changed_files_count === '' ? null : Number(changed_files_count),
    binding_mode: 'caller_supplied_v1',
  }
  if (diff_binding_required && !diff_binding_supplied) {
    null_reasons.push('DIFF_BINDING_REQUIRED')
  }
  if ((diff_binding_required || diff_binding_supplied) && !SHA256_BINDING_RE.test(changed_files_hash)) {
    null_reasons.push('INVALID_DIFF_BINDING')
    if (!invalid_fields.includes('changed_files_hash')) invalid_fields.push('changed_files_hash')
  }
  if ((diff_binding_required || diff_binding_supplied) && !isNonNegativeIntegerString(changed_files_count)) {
    if (!null_reasons.includes('INVALID_DIFF_BINDING')) null_reasons.push('INVALID_DIFF_BINDING')
    if (!invalid_fields.includes('changed_files_count')) invalid_fields.push('changed_files_count')
  }

  const review_binding_required = require_review_binding === 'true'
  const review_binding_supplied = review_state !== '' || review_commit_sha !== '' || review_author !== ''
  const review_binding = {
    review_state: review_state || null,
    review_commit_sha: review_commit_sha || null,
    review_author: review_author || null,
    binding_mode: 'caller_supplied_v1',
  }
  if (review_binding_required && !review_binding_supplied) {
    null_reasons.push('REVIEW_BINDING_REQUIRED')
  }
  if ((review_binding_required || review_binding_supplied) && review_state !== 'APPROVED') {
    null_reasons.push('REVIEW_APPROVAL_REQUIRED')
    if (!invalid_fields.includes('review_state')) invalid_fields.push('review_state')
  }
  if ((review_binding_required || review_binding_supplied) && !GIT_SHA_RE.test(review_commit_sha)) {
    if (!null_reasons.includes('INVALID_REVIEW_BINDING')) null_reasons.push('INVALID_REVIEW_BINDING')
    if (!invalid_fields.includes('review_commit_sha')) invalid_fields.push('review_commit_sha')
  }
  if ((review_binding_required || review_binding_supplied) && GIT_SHA_RE.test(review_commit_sha) && review_commit_sha !== normalizeReviewCommitSha(input.head_sha)) {
    null_reasons.push('REVIEW_COMMIT_MISMATCH')
  }

  const merge_commit_binding_required = require_merge_commit_binding === 'true'
  const merge_commit_binding_supplied = merge_commit_sha !== '' || merged_at !== ''
  const merge_commit_binding = {
    merge_commit_sha: merge_commit_sha || null,
    merged_at: merged_at || null,
    binding_mode: 'caller_supplied_post_merge_v1',
  }
  if (merge_commit_binding_required && !merge_commit_binding_supplied) {
    null_reasons.push('MERGE_COMMIT_BINDING_REQUIRED')
  }
  if ((merge_commit_binding_required || merge_commit_binding_supplied) && !GIT_SHA_RE.test(merge_commit_sha)) {
    null_reasons.push('INVALID_MERGE_COMMIT_BINDING')
    if (!invalid_fields.includes('merge_commit_sha')) invalid_fields.push('merge_commit_sha')
  }
  if ((merge_commit_binding_required || merge_commit_binding_supplied) && merged_at === '') {
    if (!null_reasons.includes('INVALID_MERGE_COMMIT_BINDING')) null_reasons.push('INVALID_MERGE_COMMIT_BINDING')
    if (!invalid_fields.includes('merged_at')) invalid_fields.push('merged_at')
  }

  // Agent Identity (Phase 1): descriptive attribution, computed from available
  // PR/workflow metadata. Gate policy:
  //   identity_present   -> continue
  //   identity_missing   -> non-blocking (ordinary human PRs are NOT blocked)
  //   identity_ambiguous -> NULL (conflicting attribution could create false legitimacy)
  const attribution = classifyAttribution({
    actor: input.actor,
    pr_author: input.pr_author ?? input.actor,
    head_ref: input.head_ref,
    pr_body: input.pr_body,
    pr_labels: input.pr_labels,
    commit_trailers: input.commit_trailers,
    operator_id: input.operator_id,
  })
  if (attribution.attribution_status === 'identity_ambiguous') {
    null_reasons.push('ATTRIBUTION_AMBIGUOUS')
  }

  // Canonical object-identity payload is intentionally UNCHANGED — attribution
  // is recorded separately and never alters the identity hash.
  const canonical_payload = REQUIRED_FIELDS.reduce((o, f) => {
    o[f] = input[f] ?? null
    return o
  }, {})
  canonical_payload.author_kind = author_kind
  canonical_payload.require_agent_authored = require_agent_authored
  if (diff_binding_required || diff_binding_supplied) {
    canonical_payload.require_diff_binding = require_diff_binding
    canonical_payload.diff_binding = diff_binding
  }
  if (review_binding_required || review_binding_supplied) {
    canonical_payload.require_review_binding = require_review_binding
    canonical_payload.review_binding = review_binding
  }
  if (merge_commit_binding_required || merge_commit_binding_supplied) {
    canonical_payload.require_merge_commit_binding = require_merge_commit_binding
    canonical_payload.merge_commit_binding = merge_commit_binding
  }

  const canonical_hash = sha256Hex(canonicalize(canonical_payload))
  const result = null_reasons.length === 0 ? 'VALID' : 'NULL'

  const head_sha = input.head_sha ?? ''
  const proof_id = `MERGE_GUARD-${input.pr_number ?? 'unknown'}-${head_sha.slice(0, 8) || 'unknown'}`

  return {
    proof_id,
    repo: input.repo ?? null,
    canonical_payload,
    canonical_hash,
    result,
    missing_fields,
    invalid_fields,
    author_kind,
    require_agent_authored,
    agent_author_required,
    require_diff_binding,
    diff_binding_required,
    diff_binding,
    require_review_binding,
    review_binding_required,
    review_binding,
    require_merge_commit_binding,
    merge_commit_binding_required,
    merge_commit_binding,
    null_reasons,
    actor_attribution: attribution.actor_attribution,
    attribution_classification: attribution.attribution_classification,
    attribution_status: attribution.attribution_status,
    attribution_evidence_hash: attribution.attribution_evidence_hash,
    record_type: 'MERGE_GUARD_PROOF',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entrypoint — reads PR context from environment, writes proof artifact,
// sets GitHub Action outputs, and exits non-zero on NULL.
// ─────────────────────────────────────────────────────────────────────────────
function main() {
  const input = {
    repo: process.env.MERGE_GUARD_REPO || '',
    pr_number: process.env.MERGE_GUARD_PR_NUMBER || '',
    head_sha: process.env.MERGE_GUARD_HEAD_SHA || '',
    base_sha: process.env.MERGE_GUARD_BASE_SHA || '',
    actor: process.env.MERGE_GUARD_ACTOR || '',
    author_kind: process.env.MERGE_GUARD_AUTHOR_KIND || '',
    require_agent_authored: process.env.MERGE_GUARD_REQUIRE_AGENT_AUTHORED || '',
    pr_author: process.env.MERGE_GUARD_PR_AUTHOR || '',
    head_ref: process.env.MERGE_GUARD_HEAD_REF || '',
    pr_body: process.env.MERGE_GUARD_PR_BODY || '',
    pr_labels: process.env.MERGE_GUARD_PR_LABELS || '',
    commit_trailers: process.env.MERGE_GUARD_COMMIT_TRAILERS || '',
    operator_id: process.env.MERGE_GUARD_OPERATOR_ID || '',
    require_diff_binding: process.env.MERGE_GUARD_REQUIRE_DIFF_BINDING || '',
    changed_files_hash: process.env.MERGE_GUARD_CHANGED_FILES_HASH || '',
    changed_files_count: process.env.MERGE_GUARD_CHANGED_FILES_COUNT || '',
    require_review_binding: process.env.MERGE_GUARD_REQUIRE_REVIEW_BINDING || '',
    review_state: process.env.MERGE_GUARD_REVIEW_STATE || '',
    review_commit_sha: process.env.MERGE_GUARD_REVIEW_COMMIT_SHA || '',
    review_author: process.env.MERGE_GUARD_REVIEW_AUTHOR || '',
    require_merge_commit_binding: process.env.MERGE_GUARD_REQUIRE_MERGE_COMMIT_BINDING || '',
    merge_commit_sha: process.env.MERGE_GUARD_MERGE_COMMIT_SHA || '',
    merged_at: process.env.MERGE_GUARD_MERGED_AT || '',
  }

  const decision = evaluate(input)
  const generated_at = new Date().toISOString()

  const proof = {
    proof_id: decision.proof_id,
    repo: decision.repo,
    canonical_payload: decision.canonical_payload,
    canonical_hash: decision.canonical_hash,
    result: decision.result,
    missing_fields: decision.missing_fields,
    invalid_fields: decision.invalid_fields,
    author_kind: decision.author_kind,
    require_agent_authored: decision.require_agent_authored,
    agent_author_required: decision.agent_author_required,
    require_diff_binding: decision.require_diff_binding,
    diff_binding_required: decision.diff_binding_required,
    diff_binding: decision.diff_binding,
    require_review_binding: decision.require_review_binding,
    review_binding_required: decision.review_binding_required,
    review_binding: decision.review_binding,
    require_merge_commit_binding: decision.require_merge_commit_binding,
    merge_commit_binding_required: decision.merge_commit_binding_required,
    merge_commit_binding: decision.merge_commit_binding,
    null_reasons: decision.null_reasons,
    actor_attribution: decision.actor_attribution,
    attribution_classification: decision.attribution_classification,
    attribution_status: decision.attribution_status,
    attribution_evidence_hash: decision.attribution_evidence_hash,
    generated_at,
    record_type: decision.record_type,
  }

  const proofPath = 'MERGE_GUARD_PROOF.json'
  writeFileSync(proofPath, JSON.stringify(proof, null, 2))

  console.log(`ContinuityOS Merge Guard — result=${decision.result}`)
  console.log(`proof_id=${decision.proof_id}`)
  console.log(`canonical_hash=${decision.canonical_hash}`)
  console.log(`author_kind=${decision.author_kind}`)
  console.log(`require_agent_authored=${decision.require_agent_authored}`)
  console.log(`require_diff_binding=${decision.require_diff_binding}`)
  console.log(`diff_binding_required=${decision.diff_binding_required}`)
  console.log(`changed_files_hash=${decision.diff_binding.changed_files_hash || ''}`)
  console.log(`changed_files_count=${decision.diff_binding.changed_files_count ?? ''}`)
  console.log(`require_review_binding=${decision.require_review_binding}`)
  console.log(`review_binding_required=${decision.review_binding_required}`)
  console.log(`review_state=${decision.review_binding.review_state || ''}`)
  console.log(`review_commit_sha=${decision.review_binding.review_commit_sha || ''}`)
  console.log(`review_author=${decision.review_binding.review_author || ''}`)
  console.log(`require_merge_commit_binding=${decision.require_merge_commit_binding}`)
  console.log(`merge_commit_binding_required=${decision.merge_commit_binding_required}`)
  console.log(`merge_commit_sha=${decision.merge_commit_binding.merge_commit_sha || ''}`)
  console.log(`merged_at=${decision.merge_commit_binding.merged_at || ''}`)
  console.log(`attribution_status=${decision.attribution_status}`)
  console.log(`attribution_classification=${decision.attribution_classification}`)
  console.log(`actor_kind=${decision.actor_attribution.actor_kind}`)
  if (decision.missing_fields.length > 0) {
    console.log(`missing_fields=${decision.missing_fields.join(',')}`)
  }
  if (decision.invalid_fields.length > 0) {
    console.log(`invalid_fields=${decision.invalid_fields.join(',')}`)
  }
  if (decision.null_reasons.length > 0) {
    console.log(`null_reasons=${decision.null_reasons.join(',')}`)
  }

  const githubOutput = process.env.GITHUB_OUTPUT
  if (githubOutput) {
    const outputs = {
      result: decision.result,
      proof_id: decision.proof_id,
      proof_hash: decision.canonical_hash,
      proof_url: proofPath,
      author_kind: decision.author_kind,
      null_reasons: decision.null_reasons.join(','),
      require_diff_binding: decision.require_diff_binding,
      changed_files_hash: decision.diff_binding.changed_files_hash || '',
      changed_files_count: decision.diff_binding.changed_files_count ?? '',
      require_review_binding: decision.require_review_binding,
      review_state: decision.review_binding.review_state || '',
      review_commit_sha: decision.review_binding.review_commit_sha || '',
      review_author: decision.review_binding.review_author || '',
      require_merge_commit_binding: decision.require_merge_commit_binding,
      merge_commit_sha: decision.merge_commit_binding.merge_commit_sha || '',
      merged_at: decision.merge_commit_binding.merged_at || '',
      attribution_status: decision.attribution_status,
      attribution_classification: decision.attribution_classification,
      actor_kind: decision.actor_attribution.actor_kind,
      attribution_evidence_hash: decision.attribution_evidence_hash,
    }
    for (const [name, value] of Object.entries(outputs)) {
      appendFileSync(githubOutput, formatGitHubOutputRecord(name, value))
    }
  }

  const githubStepSummary = process.env.GITHUB_STEP_SUMMARY
  if (githubStepSummary) {
    const lines = [
      '### ContinuityOS Merge Guard',
      '',
      `result: \`${decision.result}\``,
      `proof_id: \`${decision.proof_id}\``,
      `proof_hash: \`${decision.canonical_hash}\``,
      `author_kind: \`${decision.author_kind}\``,
      `require_agent_authored: \`${decision.require_agent_authored}\``,
      `require_diff_binding: \`${decision.require_diff_binding}\``,
      `diff_binding_required: \`${decision.diff_binding_required}\``,
      `changed_files_hash: \`${decision.diff_binding.changed_files_hash || 'none'}\``,
      `changed_files_count: \`${decision.diff_binding.changed_files_count ?? 'none'}\``,
      `require_review_binding: \`${decision.require_review_binding}\``,
      `review_binding_required: \`${decision.review_binding_required}\``,
      `review_state: \`${decision.review_binding.review_state || 'none'}\``,
      `review_commit_sha: \`${decision.review_binding.review_commit_sha || 'none'}\``,
      `review_author: \`${decision.review_binding.review_author || 'none'}\``,
      `require_merge_commit_binding: \`${decision.require_merge_commit_binding}\``,
      `merge_commit_binding_required: \`${decision.merge_commit_binding_required}\``,
      `merge_commit_sha: \`${decision.merge_commit_binding.merge_commit_sha || 'none'}\``,
      `merged_at: \`${decision.merge_commit_binding.merged_at || 'none'}\``,
      `attribution_status: \`${decision.attribution_status}\``,
      `attribution_classification: \`${decision.attribution_classification}\``,
      `actor_kind: \`${decision.actor_attribution.actor_kind}\``,
      `null_reasons: \`${decision.null_reasons.join(',') || 'none'}\``,
      '',
      '```json',
      JSON.stringify(proof, null, 2),
      '```',
      '',
    ].join('\n')
    appendFileSync(githubStepSummary, lines)
  }

  if (decision.result !== 'VALID') {
    console.error(`NULL — ${decision.null_reasons.join(', ') || 'policy_not_satisfied'}`)
    process.exitCode = 1
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  main()
}
