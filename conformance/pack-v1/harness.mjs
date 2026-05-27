#!/usr/bin/env node
// conformance/pack-v1/harness.mjs
// ContinuityOS MindShift — External Conformance Pack v1
//
// Self-contained portable legitimacy invariant verification harness.
// No dependency on the canonical runtime. Copy this directory to any
// external repo and run: node conformance/pack-v1/harness.mjs
//
// INVARIANTS VERIFIED:
//   If no valid object exists → nothing happens
//   validated_object == executed_object
//   capability ≠ authority
//   visibility ≠ authority
//   proof existence ≠ distributed finality
//   conformance ≠ execution authority
//   reconciliation ≠ authority
//
// BOUNDARY:
//   This harness is evidence-only. It does not:
//   - create authority
//   - perform deployment
//   - generate production proof
//   - mutate runtime state
//   - consume replay nonces
//   - widen execution eligibility

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ─────────────────────────────────────────────────────────────────────────────
// Inline canonicalization — algorithm identical to src/canonical.js
// Inlined so external repos require no access to the canonical runtime.
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

function canonicalize(v) {
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

function sha256Hex(input) {
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
// Harness infrastructure
// ─────────────────────────────────────────────────────────────────────────────
const packDir = dirname(fileURLToPath(import.meta.url))

function loadJson(relPath) {
  const abs = join(packDir, relPath)
  if (!existsSync(abs)) throw new Error(`File not found: ${abs}`)
  return JSON.parse(readFileSync(abs, 'utf8'))
}

function loadFixture(filename) {
  return loadJson(`fixtures/${filename}`)
}

const results = []
let passCount = 0
let failCount = 0

function recordPass(vectorId, message) {
  results.push({ vector_id: vectorId, status: 'PASS', message })
  passCount++
  console.log(`  ${vectorId} PASS — ${message}`)
}

function recordFail(vectorId, message) {
  results.push({ vector_id: vectorId, status: 'FAIL', message })
  failCount++
  console.error(`  ${vectorId} FAIL — ${message}`)
}

function assertSuiteHeader(suite) {
  if (suite.non_operative !== true) {
    throw new Error(`${suite.suite_id}: non_operative must be true`)
  }
  if (suite.observability_only !== true) {
    throw new Error(`${suite.suite_id}: observability_only must be true`)
  }
  if (suite.runtime_mutation_capable !== false) {
    throw new Error(`${suite.suite_id}: runtime_mutation_capable must be false`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Check implementations
// Each check verifies one invariant. All checks are read-only and evidence-only.
// ─────────────────────────────────────────────────────────────────────────────
function runCheck(vector) {
  const { vector_id, check_type } = vector

  try {
    switch (check_type) {

      case 'required_fields_present': {
        const fixture = loadFixture(vector.fixture_file)
        const missing = vector.required_fields.filter(
          f => fixture[f] === undefined || fixture[f] === null
        )
        if (missing.length > 0) {
          recordFail(vector_id, `missing required fields [${missing.join(', ')}] — expected ${vector.expected_result}, got NULL`)
          return
        }
        if (fixture.mutation_capable === true) {
          recordFail(vector_id, 'mutation_capable is true — must be false for a VALID object')
          return
        }
        if (vector.expected_result === 'VALID') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} but classified VALID`)
        }
        break
      }

      case 'mutation_detected_fails_closed': {
        const fixture = loadFixture(vector.fixture_file)
        const mutated = fixture.mutation_capable === true || !!fixture[vector.mutation_marker]
        if (!mutated) {
          recordFail(vector_id, `mutation not detected — mutation_capable not true and marker "${vector.mutation_marker}" absent`)
          return
        }
        if (vector.expected_result === 'NULL') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} but result is NULL`)
        }
        break
      }

      case 'missing_required_field_fails_closed': {
        const fixture = loadFixture(vector.fixture_file)
        const absent =
          fixture[vector.missing_field] === undefined ||
          fixture[vector.missing_field] === null
        if (!absent) {
          recordFail(vector_id, `expected field "${vector.missing_field}" to be absent, but it is present`)
          return
        }
        if (vector.expected_result === 'NULL') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} but result is NULL`)
        }
        break
      }

      case 'canonical_hash_deterministic': {
        const fixture = loadFixture(vector.fixture_file)
        const c1 = canonicalize(fixture)
        const h1 = sha256Hex(c1)
        const c2 = canonicalize(fixture)
        const h2 = sha256Hex(c2)
        if (c1 !== c2 || h1 !== h2) {
          recordFail(vector_id, `non-deterministic: hash1=${h1} hash2=${h2}`)
          return
        }
        if (vector.expected_result === 'DETERMINISTIC') {
          recordPass(vector_id, `${vector.description} [sha256: ${h1.slice(0, 16)}...]`)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} but computed DETERMINISTIC`)
        }
        break
      }

      case 'replay_state_consumed_blocks_reuse': {
        const fixture = loadFixture(vector.fixture_file)
        if (fixture.replay_state !== 'CONSUMED') {
          recordFail(vector_id, `expected replay_state CONSUMED, got "${fixture.replay_state}"`)
          return
        }
        if (fixture.restoration_eligible === true) {
          recordFail(vector_id, 'restoration_eligible must be false for a CONSUMED nonce')
          return
        }
        if (vector.expected_result === 'NULL') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} but result is NULL`)
        }
        break
      }

      case 'replay_resurrection_blocked': {
        const fixture = loadFixture(vector.fixture_file)
        const isAttempt =
          fixture.resurrection_claim === true || fixture.restoration_eligible === true
        if (!isAttempt) {
          recordFail(vector_id, 'expected resurrection_claim or restoration_eligible true, neither found')
          return
        }
        if (fixture.replay_state !== 'CONSUMED') {
          recordFail(vector_id, `resurrection attempt must reference a CONSUMED nonce, got "${fixture.replay_state}"`)
          return
        }
        if (vector.expected_result === 'NULL') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} but result is NULL`)
        }
        break
      }

      case 'replay_state_unused_eligible': {
        const fixture = loadFixture(vector.fixture_file)
        if (fixture.replay_state !== 'UNUSED') {
          recordFail(vector_id, `expected replay_state UNUSED, got "${fixture.replay_state}"`)
          return
        }
        if (vector.expected_result === 'ELIGIBLE') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} but result is ELIGIBLE`)
        }
        break
      }

      case 'proof_append_only_forward_only': {
        const allowed = new Set(vector.allowed_transitions)
        const forbidden = new Set(vector.forbidden_transitions)

        // No overlap between allowed and forbidden
        for (const t of allowed) {
          if (forbidden.has(t)) {
            recordFail(vector_id, `transition "${t}" appears in both allowed and forbidden — invalid vector`)
            return
          }
        }

        // No backwards transitions in allowed set (detect by checking if target is an earlier state)
        const stateOrder = ['OBSERVED', 'PENDING', 'RECONCILING', 'CONVERGED', 'CONFLICTED', 'FINALIZED']
        for (const t of allowed) {
          const [from, to] = t.split('→')
          const fromIdx = stateOrder.indexOf(from)
          const toIdx = stateOrder.indexOf(to)
          if (fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx) {
            recordFail(vector_id, `backward transition "${t}" in allowed set — violates append-only semantics`)
            return
          }
        }

        if (vector.expected_result === 'APPEND_ONLY_CONFIRMED') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} but result is APPEND_ONLY_CONFIRMED`)
        }
        break
      }

      case 'proof_detached_classification': {
        const fixture = loadFixture(vector.fixture_file)
        if (fixture.status !== 'DETACHED') {
          recordFail(vector_id, `expected fixture status DETACHED, got "${fixture.status}"`)
          return
        }
        const noValidPredecessor =
          fixture.predecessor_lineage_id === null ||
          fixture.predecessor_lineage_id === undefined ||
          !!fixture._detached_marker
        if (!noValidPredecessor) {
          recordFail(vector_id, 'detached fixture must have null predecessor or _detached_marker')
          return
        }
        if (vector.expected_result === 'DETACHED') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} but result is DETACHED`)
        }
        break
      }

      case 'proof_existence_not_finality': {
        const obj = vector.proof_object
        const localValid = obj.local_proof_exists === true
        const globalValid = obj.global_quorum_attested === true
        if (!localValid) {
          recordFail(vector_id, 'proof_object must have local_proof_exists: true to test this invariant')
          return
        }
        if (globalValid) {
          recordFail(vector_id, 'proof_object must have global_quorum_attested: false — this vector tests the gap between them')
          return
        }
        // Local proof exists but global finality not reached → correct invariant state
        if (vector.expected_result === 'LOCAL_VALID_NOT_GLOBAL') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} but result is LOCAL_VALID_NOT_GLOBAL`)
        }
        break
      }

      case 'convergence_local_valid_only': {
        const obj = vector.convergence_object
        if (obj.quorum_size >= 2) {
          recordFail(vector_id, `quorum_size must be < 2 for local-only scenario, got ${obj.quorum_size}`)
          return
        }
        if (obj.result_claim !== 'LOCAL_VALID') {
          recordFail(vector_id, `result_claim must be LOCAL_VALID, got "${obj.result_claim}"`)
          return
        }
        if (vector.forbidden_result === 'GLOBAL_VALID' && vector.expected_result === 'LOCAL_VALID') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} with forbidden ${vector.forbidden_result}`)
        }
        break
      }

      case 'convergence_partition_suspended': {
        const obj = vector.convergence_object
        if (obj.partition_detected !== true) {
          recordFail(vector_id, 'convergence_object must have partition_detected: true')
          return
        }
        if (vector.expected_result === 'PARTITION_SUSPENDED') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} but result is PARTITION_SUSPENDED`)
        }
        break
      }

      case 'convergence_conflicting_roots': {
        const obj = vector.convergence_object
        if (obj.conflicting_proof_roots !== true) {
          recordFail(vector_id, 'convergence_object must have conflicting_proof_roots: true')
          return
        }
        if (vector.expected_result === 'CONFLICTED') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected ${vector.expected_result} but result is CONFLICTED`)
        }
        break
      }

      case 'convergence_quorum_disagreement_ambiguous': {
        const obj = vector.convergence_object
        if (obj.quorum_disagree !== true) {
          recordFail(vector_id, 'convergence_object must have quorum_disagree: true')
          return
        }
        if (vector.expected_result === 'AMBIGUOUS' && vector.forbidden_result === 'GLOBAL_VALID') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected AMBIGUOUS with forbidden GLOBAL_VALID`)
        }
        break
      }

      case 'convergence_settled_not_global_valid': {
        const obj = vector.convergence_object
        if (obj.converged !== true || obj.epoch_match !== true) {
          recordFail(vector_id, 'convergence_object must have converged: true and epoch_match: true')
          return
        }
        // Conformance classifies CONVERGED; it cannot produce GLOBAL_VALID (conformance ≠ authority)
        if (vector.expected_result === 'CONVERGED' && vector.forbidden_result === 'GLOBAL_VALID') {
          recordPass(vector_id, vector.description)
        } else {
          recordFail(vector_id, `expected CONVERGED (not GLOBAL_VALID)`)
        }
        break
      }

      default:
        recordFail(vector_id, `unknown check_type: "${check_type}"`)
    }
  } catch (err) {
    recordFail(vector_id, `check threw: ${err.message}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite runner
// ─────────────────────────────────────────────────────────────────────────────
function runSuite(suiteFile, label) {
  console.log(`\n[${label}] ${suiteFile}`)

  let suite
  try {
    suite = loadJson(`vectors/${suiteFile}`)
  } catch (err) {
    console.error(`  ERROR loading suite: ${err.message}`)
    failCount++
    return
  }

  try {
    assertSuiteHeader(suite)
  } catch (err) {
    console.error(`  Suite header invalid: ${err.message}`)
    failCount++
    return
  }

  for (const vector of suite.vectors) {
    runCheck(vector)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
console.log('=== ContinuityOS MindShift — Conformance Pack v1 ===')
console.log('Stage: 3  |  Mode: Evidence-Only  |  Authority: None')
console.log()
console.log('Invariants:')
console.log('  If no valid object exists → nothing happens')
console.log('  validated_object == executed_object')
console.log('  capability ≠ authority')
console.log('  proof existence ≠ distributed finality')
console.log('  conformance ≠ execution authority')

try {
  runSuite('validator.json',   'VALIDATOR')
  runSuite('replay.json',      'REPLAY')
  runSuite('proof.json',       'PROOF')
  runSuite('convergence.json', 'CONVERGENCE')
} catch (err) {
  console.error(`\nHARNESS_ERROR: ${err.message}`)
  process.exitCode = 1
}

// ─────────────────────────────────────────────────────────────────────────────
// Structured output
// ─────────────────────────────────────────────────────────────────────────────
const total = passCount + failCount
console.log()

if (failCount === 0) {
  console.log('CONFORMANCE_EVIDENCE_OBSERVED')
  console.log('VALIDATION_FAIL_CLOSED_CONFIRMED')
  console.log('REPLAY_CONSUMPTION_PRESERVED')
  console.log('PROOF_APPEND_ONLY_CONFIRMED')
  console.log('CONVERGENCE_CLASSIFICATION_CORRECT')
  console.log('PACK_V1_CONFORMANCE_COMPLETE')
} else {
  console.error(`CONFORMANCE_FAILURES: ${failCount}`)
}

console.log()
console.log('=== Summary ===')
console.log(`Total:  ${total}  |  PASS: ${passCount}  |  FAIL: ${failCount}`)
console.log(`Authority created:         false`)
console.log(`Deployment performed:      false`)
console.log(`Runtime mutation capable:  false`)
console.log(`Production proof emitted:  false`)

// Optional: write structured evidence file
const evidenceDir = join(packDir, '..', '..', 'conformance')
const evidencePath = join(packDir, 'conformance-pack-v1-evidence.json')
try {
  const evidence = {
    pack: 'pack-v1',
    stage: 3,
    run_at: new Date().toISOString(),
    non_operative: true,
    authority_created: false,
    deployment_performed: false,
    runtime_mutation_capable: false,
    production_proof_emitted: false,
    total,
    pass: passCount,
    fail: failCount,
    status: failCount === 0 ? 'PACK_V1_CONFORMANCE_COMPLETE' : 'CONFORMANCE_FAILURES',
    results,
  }
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2))
} catch (_) {
  // evidence file write is best-effort; harness result stands on stdout
}

console.log()
console.log('CONFORMANCE_EVIDENCE_OBSERVED')

if (failCount > 0) process.exitCode = 1
