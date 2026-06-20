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
import { writeFileSync, readFileSync, mkdtempSync, openSync, closeSync, utimesSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GENESIS_EXECUTION_STATE } from '../../runtime/lineage/executionEligibility.mjs'
import {
  admitRun,
  readEntries,
  verifyRegistryChain,
  MalformedRegistryError,
} from '../../runtime/lineage/proofChainRegistry.mjs'
import { classifyExecutionEligibility } from '../../runtime/lineage/executionEligibility.mjs'
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

test('lock: a held lock excludes another acquirer (fail-closed timeout)', () => {
  const registry = freshRegistry()
  const lockPath = registry + '.lock'
  const fd = openSync(lockPath, 'wx') // simulate a live holder in another process
  try {
    assert.throws(
      () => withRegistryLock(registry, () => 'never', { timeoutMs: 80, staleMs: 60_000 }),
      (err) => err.code === 'REGISTRY_LOCK_TIMEOUT',
    )
  } finally {
    closeSync(fd)
  }
})

test('lock: an abandoned (stale) lock is reclaimed', () => {
  const registry = freshRegistry()
  const lockPath = registry + '.lock'
  closeSync(openSync(lockPath, 'wx'))
  const past = new Date(Date.now() - 120_000)
  utimesSync(lockPath, past, past) // age it beyond staleMs

  const out = withRegistryLock(registry, () => 'reclaimed', { timeoutMs: 500, staleMs: 1_000 })
  assert.equal(out, 'reclaimed')
})
