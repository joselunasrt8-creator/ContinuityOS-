#!/usr/bin/env node
// actions/continuity-merge-guard/test.mjs
// Deterministic conformance test for the Merge Guard decision logic.
// No network, no GitHub API — runs evaluate() directly against fixtures.

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluate, formatGitHubOutputRecord } from './check.mjs'

const dir = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(dir, 'fixtures')

let passCount = 0
let failCount = 0

function recordPass(name, message) {
  passCount++
  console.log(`  ${name} PASS — ${message}`)
}

function recordFail(name, message) {
  failCount++
  console.error(`  ${name} FAIL — ${message}`)
}


function parseSingleGitHubOutputRecord(record) {
  const lines = record.split('\n')
  const headerMatch = lines[0].match(/^([A-Za-z_][A-Za-z0-9_]*)<<(.+)$/)
  if (!headerMatch) return null
  const [, name, delimiter] = headerMatch
  const endIndex = lines.indexOf(delimiter, 1)
  if (endIndex === -1) return null
  return {
    name,
    value: lines.slice(1, endIndex).join('\n'),
    trailing: lines.slice(endIndex + 1).filter(Boolean),
  }
}

function runGitHubOutputEscapingGuard() {
  const callerSuppliedOutputNames = [
    'changed_files_hash',
    'changed_files_count',
    'review_state',
    'review_commit_sha',
    'review_author',
    'merge_commit_sha',
    'merged_at',
  ]
  const injectedValue = 'maintainer-login\nspoofed_output=spoofed-value\nanother<<EOF\nspoofed\nEOF'

  for (const outputName of callerSuppliedOutputNames) {
    const record = formatGitHubOutputRecord(outputName, injectedValue)
    const parsed = parseSingleGitHubOutputRecord(record)
    if (!parsed) {
      recordFail('GITHUB_OUTPUT_ESCAPING', `${outputName} was not emitted as a multiline GitHub output record`)
      return
    }
    if (parsed.name !== outputName) {
      recordFail('GITHUB_OUTPUT_ESCAPING', `expected output ${outputName}, got ${parsed.name}`)
      return
    }
    if (parsed.value !== injectedValue) {
      recordFail('GITHUB_OUTPUT_ESCAPING', `${outputName} did not preserve the caller-supplied value inside the output frame`)
      return
    }
    if (parsed.trailing.length > 0) {
      recordFail('GITHUB_OUTPUT_ESCAPING', `${outputName} emitted trailing records outside the output frame: ${parsed.trailing.join(',')}`)
      return
    }
    if (record.startsWith(`${outputName}=${injectedValue}`)) {
      recordFail('GITHUB_OUTPUT_ESCAPING', `${outputName} used unsafe name=value output framing`)
      return
    }
  }

  recordPass('GITHUB_OUTPUT_ESCAPING', 'caller-supplied multiline output values are delimiter-framed for every caller-supplied output')
}

console.log('=== ContinuityOS Merge Guard — conformance test ===\n')

for (const file of readdirSync(fixturesDir).sort()) {
  if (!file.endsWith('.json')) continue
  const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'))
  const decision = evaluate(fixture.input)

  if (decision.result !== fixture.expected_result) {
    recordFail(file, `expected result ${fixture.expected_result}, got ${decision.result}`)
    continue
  }

  const missingMatch =
    JSON.stringify(decision.missing_fields) === JSON.stringify(fixture.expected_missing_fields)
  if (!missingMatch) {
    recordFail(file, `expected missing_fields ${JSON.stringify(fixture.expected_missing_fields)}, got ${JSON.stringify(decision.missing_fields)}`)
    continue
  }

  if ('expected_invalid_fields' in fixture) {
    const invalidMatch =
      JSON.stringify(decision.invalid_fields) === JSON.stringify(fixture.expected_invalid_fields)
    if (!invalidMatch) {
      recordFail(file, `expected invalid_fields ${JSON.stringify(fixture.expected_invalid_fields)}, got ${JSON.stringify(decision.invalid_fields)}`)
      continue
    }
  }

  if ('expected_null_reasons' in fixture) {
    const nullReasonsMatch =
      JSON.stringify(decision.null_reasons) === JSON.stringify(fixture.expected_null_reasons)
    if (!nullReasonsMatch) {
      recordFail(file, `expected null_reasons ${JSON.stringify(fixture.expected_null_reasons)}, got ${JSON.stringify(decision.null_reasons)}`)
      continue
    }
  }

  if (fixture.expected_author_kind && decision.author_kind !== fixture.expected_author_kind) {
    recordFail(file, `expected author_kind ${fixture.expected_author_kind}, got ${decision.author_kind}`)
    continue
  }

  if (fixture.expected_require_agent_authored && decision.require_agent_authored !== fixture.expected_require_agent_authored) {
    recordFail(file, `expected require_agent_authored ${fixture.expected_require_agent_authored}, got ${decision.require_agent_authored}`)
    continue
  }

  if (fixture.expected_require_diff_binding && decision.require_diff_binding !== fixture.expected_require_diff_binding) {
    recordFail(file, `expected require_diff_binding ${fixture.expected_require_diff_binding}, got ${decision.require_diff_binding}`)
    continue
  }

  if ('expected_diff_binding_required' in fixture && decision.diff_binding_required !== fixture.expected_diff_binding_required) {
    recordFail(file, `expected diff_binding_required ${fixture.expected_diff_binding_required}, got ${decision.diff_binding_required}`)
    continue
  }

  if (fixture.expected_changed_files_hash && decision.diff_binding.changed_files_hash !== fixture.expected_changed_files_hash) {
    recordFail(file, `expected changed_files_hash ${fixture.expected_changed_files_hash}, got ${decision.diff_binding.changed_files_hash}`)
    continue
  }

  if ('expected_changed_files_count' in fixture && decision.diff_binding.changed_files_count !== fixture.expected_changed_files_count) {
    recordFail(file, `expected changed_files_count ${fixture.expected_changed_files_count}, got ${decision.diff_binding.changed_files_count}`)
    continue
  }

  if (fixture.expected_require_review_binding && decision.require_review_binding !== fixture.expected_require_review_binding) {
    recordFail(file, `expected require_review_binding ${fixture.expected_require_review_binding}, got ${decision.require_review_binding}`)
    continue
  }

  if ('expected_review_binding_required' in fixture && decision.review_binding_required !== fixture.expected_review_binding_required) {
    recordFail(file, `expected review_binding_required ${fixture.expected_review_binding_required}, got ${decision.review_binding_required}`)
    continue
  }

  if (fixture.expected_review_state && decision.review_binding.review_state !== fixture.expected_review_state) {
    recordFail(file, `expected review_state ${fixture.expected_review_state}, got ${decision.review_binding.review_state}`)
    continue
  }

  if (fixture.expected_review_commit_sha && decision.review_binding.review_commit_sha !== fixture.expected_review_commit_sha) {
    recordFail(file, `expected review_commit_sha ${fixture.expected_review_commit_sha}, got ${decision.review_binding.review_commit_sha}`)
    continue
  }

  if (fixture.expected_review_author && decision.review_binding.review_author !== fixture.expected_review_author) {
    recordFail(file, `expected review_author ${fixture.expected_review_author}, got ${decision.review_binding.review_author}`)
    continue
  }

  if (fixture.expected_require_merge_commit_binding && decision.require_merge_commit_binding !== fixture.expected_require_merge_commit_binding) {
    recordFail(file, `expected require_merge_commit_binding ${fixture.expected_require_merge_commit_binding}, got ${decision.require_merge_commit_binding}`)
    continue
  }

  if ('expected_merge_commit_binding_required' in fixture && decision.merge_commit_binding_required !== fixture.expected_merge_commit_binding_required) {
    recordFail(file, `expected merge_commit_binding_required ${fixture.expected_merge_commit_binding_required}, got ${decision.merge_commit_binding_required}`)
    continue
  }

  if (fixture.expected_merge_commit_sha && decision.merge_commit_binding.merge_commit_sha !== fixture.expected_merge_commit_sha) {
    recordFail(file, `expected merge_commit_sha ${fixture.expected_merge_commit_sha}, got ${decision.merge_commit_binding.merge_commit_sha}`)
    continue
  }

  if (fixture.expected_merged_at && decision.merge_commit_binding.merged_at !== fixture.expected_merged_at) {
    recordFail(file, `expected merged_at ${fixture.expected_merged_at}, got ${decision.merge_commit_binding.merged_at}`)
    continue
  }

  // Agent Identity (Phase 1) — every decision must carry a well-formed
  // attribution object recorded for the proof.
  const attr = decision.actor_attribution
  const ATTR_KEYS = ['actor_kind', 'actor_id', 'operator_id', 'attribution_source', 'confidence', 'evidence']
  const attrShapeOk = attr && typeof attr === 'object' &&
    ATTR_KEYS.every(k => k in attr) && Array.isArray(attr.evidence)
  if (!attrShapeOk) {
    recordFail(file, `missing/malformed actor_attribution object`)
    continue
  }
  if (!/^[0-9a-f]{64}$/.test(decision.attribution_evidence_hash || '')) {
    recordFail(file, `attribution_evidence_hash is not a sha256 hex: ${decision.attribution_evidence_hash}`)
    continue
  }

  if (fixture.expected_attribution_status && decision.attribution_status !== fixture.expected_attribution_status) {
    recordFail(file, `expected attribution_status ${fixture.expected_attribution_status}, got ${decision.attribution_status}`)
    continue
  }

  if (fixture.expected_actor_kind && attr.actor_kind !== fixture.expected_actor_kind) {
    recordFail(file, `expected actor_kind ${fixture.expected_actor_kind}, got ${attr.actor_kind}`)
    continue
  }

  if (fixture.expected_attribution_classification && decision.attribution_classification !== fixture.expected_attribution_classification) {
    recordFail(file, `expected attribution_classification ${fixture.expected_attribution_classification}, got ${decision.attribution_classification}`)
    continue
  }

  if (fixture.check_type === 'deterministic_hash') {
    const decisionAgain = evaluate(fixture.input)
    if (decision.canonical_hash !== decisionAgain.canonical_hash) {
      recordFail(file, `canonical_hash not deterministic: ${decision.canonical_hash} vs ${decisionAgain.canonical_hash}`)
      continue
    }
    recordPass(file, `${fixture.description} [sha256: ${decision.canonical_hash.slice(0, 16)}...]`)
    continue
  }

  recordPass(file, fixture.description)
}

runGitHubOutputEscapingGuard()

const total = passCount + failCount
console.log(`\nTotal: ${total}  |  PASS: ${passCount}  |  FAIL: ${failCount}`)

if (failCount > 0) {
  process.exitCode = 1
} else {
  console.log('MERGE_GUARD_CONFORMANCE_COMPLETE')
}
