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
// Self-contained: no external npm dependencies. canonicalize/sha256Hex are
// inlined from conformance/pack-v1/harness.mjs (same algorithm, proven
// deterministic) so this directory can be copied to any repo unmodified.

import { writeFileSync, appendFileSync } from 'node:fs'

// ─────────────────────────────────────────────────────────────────────────────
// Inline canonicalization (identical to conformance/pack-v1/harness.mjs)
// ─────────────────────────────────────────────────────────────────────────────
function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function normalize(v) {
  if (v === undefined) return null
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (Array.isArray(v)) return v.map(normalize)
  if (isObj(v)) {
    return Object.keys(v).sort().reduce((o, k) => {
      o[k] = normalize(v[k])
      return o
    }, {})
  }
  return null
}

export function canonicalize(v) {
  const n = normalize(v)
  if (Array.isArray(n)) return `[${n.map(canonicalize).join(',')}]`
  if (isObj(n)) {
    return `{${Object.keys(n).sort().map(k => `${JSON.stringify(k)}:${canonicalize(n[k])}`).join(',')}}`
  }
  return JSON.stringify(n)
}

function rightRotate(v, a) {
  return (v >>> a) | (v << (32 - a))
}

export function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input)
  const bl = bytes.length * 8
  const pl = (((bytes.length + 9 + 63) >> 6) << 6)
  const padded = new Uint8Array(pl)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(pl - 8, Math.floor(bl / 0x100000000))
  view.setUint32(pl - 4, bl >>> 0)

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]
  const w = new Array(64)

  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + s1 + ch + k[i] + w[i]) >>> 0
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (s0 + maj) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0
      d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0
  }
  return h.map(word => word.toString(16).padStart(8, '0')).join('')
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision logic — v1 identity completeness plus an optional agent-authored
// workflow policy. The policy is intentionally explicit: callers must supply
// both the author classification and whether this workflow requires agent
// authorship. There is no hidden GitHub API lookup or inferred authority.
// ─────────────────────────────────────────────────────────────────────────────
const REQUIRED_FIELDS = ['repo', 'pr_number', 'head_sha', 'base_sha', 'actor']
const AUTHOR_KINDS = ['agent', 'human', 'unknown']
const REQUIRE_AGENT_VALUES = ['true', 'false']

function normalizeString(v) {
  return typeof v === 'string' ? v.trim() : ''
}

function normalizeAuthorKind(v) {
  const authorKind = normalizeString(v).toLowerCase() || 'unknown'
  return authorKind
}

function normalizeRequireAgentAuthored(v) {
  const required = normalizeString(v).toLowerCase() || 'false'
  return required
}

export function evaluate(input) {
  const missing_fields = REQUIRED_FIELDS.filter(f => {
    const v = input[f]
    return v === undefined || v === null || v === ''
  })

  const author_kind = normalizeAuthorKind(input.author_kind)
  const require_agent_authored = normalizeRequireAgentAuthored(input.require_agent_authored)

  const invalid_fields = []
  if (!AUTHOR_KINDS.includes(author_kind)) invalid_fields.push('author_kind')
  if (!REQUIRE_AGENT_VALUES.includes(require_agent_authored)) invalid_fields.push('require_agent_authored')

  const null_reasons = []
  if (missing_fields.length > 0) null_reasons.push('MISSING_REQUIRED_FIELD')
  if (invalid_fields.length > 0) null_reasons.push('INVALID_POLICY_FIELD')

  const agent_author_required = require_agent_authored === 'true'
  if (agent_author_required && author_kind !== 'agent') {
    null_reasons.push('AGENT_AUTHOR_REQUIRED')
  }

  const canonical_payload = REQUIRED_FIELDS.reduce((o, f) => {
    o[f] = input[f] ?? null
    return o
  }, {})
  canonical_payload.author_kind = author_kind
  canonical_payload.require_agent_authored = require_agent_authored

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
    null_reasons,
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
    null_reasons: decision.null_reasons,
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
    appendFileSync(githubOutput, `result=${decision.result}\n`)
    appendFileSync(githubOutput, `proof_id=${decision.proof_id}\n`)
    appendFileSync(githubOutput, `proof_hash=${decision.canonical_hash}\n`)
    appendFileSync(githubOutput, `proof_url=${proofPath}\n`)
    appendFileSync(githubOutput, `author_kind=${decision.author_kind}\n`)
    appendFileSync(githubOutput, `null_reasons=${decision.null_reasons.join(',')}\n`)
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
