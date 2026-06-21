// tests/fate/lineage-hardening.test.mjs
// FATE — runtime-hardening of the execution-lineage law (post-#2186 review).
//
// The primitive NARROWS eligibility; this hardening PROTECTS the eligibility
// EVIDENCE so eligibility can never be reconstructed from corrupted state. Each
// case proves a fail-closed boundary:
//
//   malformed registry line          -> verifyRegistryChain NULL / admitRun refuses
//   tampered replay/revocation field -> MUTATED_PRIOR_LINK (now hash-bound)
//   broken stored chain              -> admitRun refuses to append on top
//   current validated != executed    -> CURRENT_INVARIANT_BROKEN (bad carry blocked)
//   concurrent execution             -> per-registry lock (reentrant, fail-closed)

import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, readFileSync, mkdtempSync, openSync, closeSync, writeSync, existsSync } from 'node:fs'
import { tmpdir, hostname } from 'node:os'
import { join, dirname, basename } from 'node:path'

import { GENESIS_EXECUTION_STATE } from '../../runtime/lineage/executionEligibility.mjs'
import {
  admitRun,
  readEntries,
  verifyRegistryChain,
  MalformedRegistryError,
} from '../../runtime/lineage/proofChainRegistry.mjs'
import { classifyExecutionEligibility, eligibilityCarry } from '../../runtime/lineage/executionEligibility.mjs'
import { withRegistryLock, isLockHeld } from '../../runtime/lineage/registryLock.mjs'

const KEY = 'owner/repo@main'
const NOW = '2026-06-20T00:00:00Z'

function freshRegistry() {
  const dir = mkdtempSync(join(tmpdir(), 'lineage-harden-'))
  const registry = join(dir, 'execution_lineage_registry.jsonl')
  writeFileSync(registry, JSON.stringify({ _record_type: 'registry_init', registry_version: '1.0' }) + '\n')
  return registry
}

// Seed a real 2-link chain through admitRun (genesis + one inheriting run).
function seedChain(registry) {
  admitRun(registry, {
    lineage_key: KEY, continuity_id: 'c0', parent_continuity_id: '',
    parent_executed_object_hash: GENESIS_EXECUTION_STATE.executed_object_hash,
    validated_object_hash: 'obj0', executed_object_hash: 'obj0', nonce: 'n0',
  }, { now: NOW, proof_id: 'R1' })
  admitRun(registry, {
    lineage_key: KEY, continuity_id: 'c1', parent_continuity_id: 'c0',
    parent_executed_object_hash: 'obj0',
    validated_object_hash: 'obj1', executed_object_hash: 'obj1', nonce: 'n1',
  }, { now: NOW, proof_id: 'R2' })
}

// Rewrite the FIRST chained entry on disk with `mutate(entry)` applied, WITHOUT
// recomputing link_hash — i.e. tamper exactly as an attacker editing the JSONL.
function tamperFirstEntry(registry, mutate) {
  const lines = readFileSync(registry, 'utf8').split('\n')
  let done = false
  const out = lines.map((line) => {
    const t = line.trim()
    if (done || !t) return line
    let obj
    try { obj = JSON.parse(t) } catch { return line }
    if (obj._record_type !== 'execution_lineage_entry' || !obj.link_hash) return line
    done = true
    return JSON.stringify(mutate(obj))
  })
  writeFileSync(registry, out.join('\n'))
}

// ── P1.3 — replay/revocation fields are hash-bound (tamper → MUTATED_PRIOR_LINK) ─

for (const [field, value] of [
  ['nonce', 'attacker-nonce'],
  ['status', 'REVOKED'],
  ['revoked_at', '2026-01-01T00:00:00Z'],
  ['expires_at', '2000-01-01T00:00:00Z'],
]) {
  test(`hash-bound: tampering ${field} on a persisted link → verifyRegistryChain NULL (MUTATED_PRIOR_LINK)`, () => {
    const registry = freshRegistry()
    seedChain(registry)
    assert.equal(verifyRegistryChain(registry, KEY).result, 'VALID') // baseline

    tamperFirstEntry(registry, (e) => ({ ...e, [field]: value }))

    const res = verifyRegistryChain(registry, KEY)
    assert.equal(res.result, 'NULL', `${field} tamper must fail closed`)
    assert.equal(res.null_reasons.includes('MUTATED_PRIOR_LINK'), true)
    assert.equal(res.broken_at, 0) // the tampered (first) link
  })
}

// ── P1.1 — malformed registry lines fail closed (never silently skipped) ─────────

test('malformed: an unparseable registry line → verifyRegistryChain NULL (MALFORMED_REGISTRY_LINE)', () => {
  const registry = freshRegistry()
  seedChain(registry)
  writeFileSync(registry, readFileSync(registry, 'utf8') + '{ this is not json\n')

  const res = verifyRegistryChain(registry, KEY)
  assert.equal(res.result, 'NULL')
  assert.equal(res.null_reasons.includes('MALFORMED_REGISTRY_LINE'), true)
})

test('malformed: a genesis sequence_number tampered 0 -> null is MALFORMED (not VALID)', () => {
  const registry = freshRegistry()
  seedChain(registry)
  // Number(null) === 0, so a naive coercion would accept this and leave the hash
  // unchanged — it must instead fail closed on the raw non-integer value.
  tamperFirstEntry(registry, (e) => ({ ...e, sequence_number: null }))
  const res = verifyRegistryChain(registry, KEY)
  assert.equal(res.result, 'NULL')
  assert.equal(res.null_reasons.includes('MALFORMED_REGISTRY_LINE'), true)
})

test('malformed: a sequence_number tampered to "0" (string) is MALFORMED', () => {
  const registry = freshRegistry()
  seedChain(registry)
  tamperFirstEntry(registry, (e) => ({ ...e, sequence_number: '0' }))
  assert.equal(verifyRegistryChain(registry, KEY).null_reasons.includes('MALFORMED_REGISTRY_LINE'), true)
})

test('malformed: a chain-shaped line missing link_hash → verifyRegistryChain NULL', () => {
  const registry = freshRegistry()
  seedChain(registry)
  // A line that declares the chain record type but drops its link identity.
  writeFileSync(
    registry,
    readFileSync(registry, 'utf8') +
      JSON.stringify({ _record_type: 'execution_lineage_entry', lineage_key: KEY, sequence_number: 2 }) + '\n',
  )
  const res = verifyRegistryChain(registry, KEY)
  assert.equal(res.result, 'NULL')
  assert.equal(res.null_reasons.includes('MALFORMED_REGISTRY_LINE'), true)
})

test('malformed: readEntries strict throws; lenient mode skips (markers always allowed)', () => {
  const registry = freshRegistry()
  seedChain(registry)
  writeFileSync(registry, readFileSync(registry, 'utf8') + 'not-json\n')

  assert.throws(() => readEntries(registry, KEY), MalformedRegistryError)
  // Lenient skips the bad line but still yields the two good entries.
  assert.equal(readEntries(registry, KEY, { strict: false }).length, 2)
})

test('malformed: admitRun refuses to append onto a poisoned registry', () => {
  const registry = freshRegistry()
  seedChain(registry)
  writeFileSync(registry, readFileSync(registry, 'utf8') + 'CORRUPT\n')

  const before = readEntries(registry, KEY, { strict: false }).length
  const res = admitRun(registry, {
    lineage_key: KEY, continuity_id: 'c2', parent_continuity_id: 'c1',
    parent_executed_object_hash: 'obj1', validated_object_hash: 'obj2',
    executed_object_hash: 'obj2', nonce: 'n2',
  }, { now: NOW })

  assert.equal(res.appended, false)
  assert.equal(res.null_reasons.includes('STORED_CHAIN_INVALID'), true)
  assert.equal(res.null_reasons.includes('MALFORMED_REGISTRY_LINE'), true)
  assert.equal(readEntries(registry, KEY, { strict: false }).length, before) // nothing appended
})

// ── P1.2 — verify stored chain before append ─────────────────────────────────────

test('stored-chain: admitRun refuses to append on top of a tampered chain', () => {
  const registry = freshRegistry()
  seedChain(registry)
  tamperFirstEntry(registry, (e) => ({ ...e, status: 'REVOKED' })) // breaks the hash chain

  const res = admitRun(registry, {
    lineage_key: KEY, continuity_id: 'c2', parent_continuity_id: 'c1',
    parent_executed_object_hash: 'obj1', validated_object_hash: 'obj2',
    executed_object_hash: 'obj2', nonce: 'n2',
  }, { now: NOW })

  assert.equal(res.appended, false)
  assert.equal(res.null_reasons.includes('STORED_CHAIN_INVALID'), true)
  assert.equal(res.null_reasons.includes('MUTATED_PRIOR_LINK'), true)
})

// ── P2.5 — current-run invariant (validated == executed) ─────────────────────────

test('current-invariant: a run asserting executed != validated is NULL (CURRENT_INVARIANT_BROKEN)', () => {
  const prior = {
    continuity_id: 'c1', validated_object_hash: 'obj1', executed_object_hash: 'obj1',
    status: 'ACTIVE', expires_at: '2099-01-01T00:00:00Z', revoked_at: '',
  }
  const d = classifyExecutionEligibility(prior, {
    lineage_key: KEY, continuity_id: 'c2', parent_continuity_id: 'c1',
    parent_executed_object_hash: 'obj1', validated_object_hash: 'obj2',
    executed_object_hash: 'DIVERGENT', nonce: 'n2',
  }, { now: NOW })
  assert.equal(d.eligibility, 'NULL')
  assert.equal(d.null_reasons.includes('CURRENT_INVARIANT_BROKEN'), true)
})

test('current-invariant: a divergent carry can never be admitted into the registry', () => {
  const registry = freshRegistry()
  seedChain(registry)
  const res = admitRun(registry, {
    lineage_key: KEY, continuity_id: 'c2', parent_continuity_id: 'c1',
    parent_executed_object_hash: 'obj1', validated_object_hash: 'obj2',
    executed_object_hash: 'DIVERGENT', nonce: 'n2',
  }, { now: NOW })
  assert.equal(res.appended, false)
  assert.equal(res.null_reasons.includes('CURRENT_INVARIANT_BROKEN'), true)
  assert.equal(readEntries(registry, KEY).length, 2)
})

test('current-invariant: a BLANK executed hash never persists a divergent carry', () => {
  // executed_object_hash:"" with a non-blank validated hash must not seed a carry
  // whose validated != executed (eligibilityCarry coerces blank -> validated).
  const carry = eligibilityCarry({
    continuity_id: 'c2', parent_continuity_id: 'c1',
    validated_object_hash: 'obj2', executed_object_hash: '', nonce: 'n2',
  })
  assert.equal(carry.executed_object_hash, 'obj2')
  assert.equal(carry.validated_object_hash, carry.executed_object_hash)
})

// ── #4 — non-lineage proof_entry records are skipped, not flagged malformed ───────

test('proof-registry: a proof_entry log without link_hash verifies VALID (records skipped)', () => {
  // Mirror governance/merge-legitimacy/merge_proof_registry.jsonl: proof_entry
  // records that carry NO link_hash. These are not lineage links and must be
  // skipped — never MALFORMED_REGISTRY_LINE.
  const dir = mkdtempSync(join(tmpdir(), 'proof-reg-'))
  const registry = join(dir, 'merge_proof_registry.jsonl')
  writeFileSync(
    registry,
    [
      JSON.stringify({ _record_type: 'registry_init', registry_version: '1.0', artifact_id: 'merge_proof_registry' }),
      JSON.stringify({ _record_type: 'proof_entry', proof_id: 'PROOF-1712', proof_hash: 'a'.repeat(64), pr_number: 1712 }),
      JSON.stringify({ _record_type: 'proof_entry', proof_id: 'PROOF-1713', proof_hash: 'b'.repeat(64), pr_number: 1713 }),
    ].join('\n') + '\n',
  )
  const res = verifyRegistryChain(registry, undefined)
  assert.equal(res.result, 'VALID')
  assert.equal(res.null_reasons.length, 0)
  assert.equal(readEntries(registry, undefined).length, 0) // no lineage links present
})

// ── P1.4 — per-registry advisory lock (race protection) ──────────────────────────

test('lock: withRegistryLock is reentrant within a process and releases cleanly', () => {
  const registry = freshRegistry()
  const lockPath = registry + '.lock'
  assert.equal(isLockHeld(registry), false)

  const out = withRegistryLock(registry, () => {
    assert.equal(isLockHeld(registry), true)
    // Reentrant: a nested locked op (mirrors admitRun under executeGovernedRun).
    return withRegistryLock(registry, () => {
      assert.equal(existsSync(lockPath), true)
      return 'inner'
    })
  })
  assert.equal(out, 'inner')
  assert.equal(isLockHeld(registry), false)
  assert.equal(existsSync(lockPath), false) // lockfile removed on release
})

test('lock: a LIVE held lock is never stolen — second acquirer fails closed (timeout)', () => {
  const registry = freshRegistry()
  const lockPath = registry + '.lock'
  // A live holder: our own pid, written as the lockfile identity. Even though it is
  // "old", it must NOT be reclaimed by age — only a provably-dead holder is.
  const fd = openSync(lockPath, 'wx')
  writeSync(fd, JSON.stringify({ pid: process.pid, host: hostname(), at: '2000-01-01T00:00:00Z' }))
  closeSync(fd)
  try {
    assert.throws(
      () => withRegistryLock(registry, () => 'never', { timeoutMs: 80 }),
      (err) => err.code === 'REGISTRY_LOCK_TIMEOUT',
    )
    assert.equal(existsSync(lockPath), true) // the live lock survived
  } finally {
    closeSync(openSync(lockPath, 'r')) // (no-op open to assert it still exists)
  }
})

test('lock: only a PROVABLY DEAD holder is reclaimed (not age)', () => {
  const registry = freshRegistry()
  const lockPath = registry + '.lock'
  // A holder PID that does not exist on this host → provably dead → reclaimable.
  const fd = openSync(lockPath, 'wx')
  writeSync(fd, JSON.stringify({ pid: 2147483646, host: hostname(), at: '2000-01-01T00:00:00Z' }))
  closeSync(fd)

  const out = withRegistryLock(registry, () => 'reclaimed', { timeoutMs: 500 })
  assert.equal(out, 'reclaimed')
})

test('lock: different path spellings of the same registry share ONE lock (canonicalized)', () => {
  const registry = freshRegistry()
  const weird = join(dirname(registry), '.', basename(registry)) // same file, "/./"
  let observedSame = false
  withRegistryLock(registry, () => {
    observedSame = isLockHeld(weird) // a different spelling sees the same held lock
  })
  assert.equal(observedSame, true)
  assert.equal(isLockHeld(registry), false)
})

test('lock: a native async fn is refused WITHOUT running its body (never invoked)', () => {
  const registry = freshRegistry()
  let ran = false
  const asyncFn = async () => {
    ran = true // must never execute — rejection happens before invocation
    return 1
  }
  assert.throws(() => withRegistryLock(registry, asyncFn), /synchronous/)
  assert.equal(ran, false) // body never ran, so nothing leaks outside the lock
  assert.equal(isLockHeld(registry), false)
})

test('lock: dead-holder reclaim renames atomically and never leaves the canonical lock dangling', () => {
  const registry = freshRegistry()
  const lockPath = registry + '.lock'
  const fd = openSync(lockPath, 'wx')
  writeSync(fd, JSON.stringify({ pid: 2147483646, host: hostname(), at: '2000-01-01T00:00:00Z' }))
  closeSync(fd)

  let heldDuring = false
  const out = withRegistryLock(registry, () => {
    heldDuring = existsSync(lockPath) // a fresh live lock is held during the body
    return 'ok'
  })
  assert.equal(out, 'ok')
  assert.equal(heldDuring, true)
  assert.equal(existsSync(lockPath), false) // released cleanly
})
