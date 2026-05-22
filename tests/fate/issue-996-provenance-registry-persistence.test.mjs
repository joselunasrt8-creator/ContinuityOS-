/**
 * Issue #996 — RELEASE_PROVENANCE_REGISTRY_PERSISTENCE_V1
 *
 * FATE tests proving deterministic registry persistence.
 *
 * Verifies:
 *   1.  valid provenance entry appends deterministically
 *   2.  registry hash is deterministic
 *   3.  same input produces same registry hash
 *   4.  mutated provenance entry fails equivalence check
 *   5.  duplicate release_id is rejected
 *   6.  same tag different commit is rejected
 *   7.  same tag different artifact hash is rejected
 *   8.  same preo_reference different artifact hash is rejected
 *   9.  BREAK_GLASS canonicalization is rejected
 *   10. registry remains evidence-only
 *   11. registry cannot create authority
 *   12. registry cannot create proof
 *   13. registry cannot execute
 *   14. workflow does not auto-commit registry updates
 *   15. proposed registry patch can be generated as audit artifact
 *
 * Plus:
 *   - append-release-provenance.mjs exists and exports required functions
 *   - release_provenance_registry.json has required persistence fields
 *   - All 7 registry failure classes are defined
 *   - Existing #994 tests remain unaffected (non-regression)
 *
 * Evidence only — no runtime route changes, no authority creation,
 * no deployment capability expansion, no proof behavior changes.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

function readText(path) {
  return readFileSync(join(root, path), 'utf8')
}

import {
  REGISTRY_FAILURE_CLASSES,
  canonicalJson,
  computeRegistryHash,
  validateRegistryHash,
  validateEntryForAppend,
  detectRegistryReplayConflict,
  verifyProvenanceEquivalence,
  appendProvenanceEntry,
} from '../../scripts/append-release-provenance.mjs'

const REQUIRED_REGISTRY_FAILURE_CLASSES = [
  'release_registry_entry_invalid',
  'release_registry_hash_mismatch',
  'release_registry_replay_conflict',
  'release_registry_mutation_after_generation',
  'release_registry_break_glass_canonicalization',
  'release_registry_append_non_deterministic',
  'release_registry_unknown_provenance_type',
]

function makeValidEntry(overrides = {}) {
  return {
    release_id: 'RPROV-20260522-9960001',
    release_tag: 'v1.0.0',
    source_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    artifact_hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    artifact_hash_alg: 'sha256',
    pr_number: 995,
    status_check_refs: [],
    preo_reference: 'PREO-995-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sco_reference: 'SCO-995-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    provenance_type: 'INTERNAL',
    classification: 'CANONICAL_RELEASE_CANDIDATE',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    canonical_release_candidate: true,
    break_glass: false,
    break_glass_justification: null,
    workflow_run_id: '12345678901',
    workflow_ref: 'refs/workflows/governed-release.yml@refs/heads/main',
    generated_at: '2026-05-22T10:00:00Z',
    issue: '994',
    ...overrides,
  }
}

function makeEmptyRegistry() {
  const entries = []
  return {
    artifact: 'RELEASE_PROVENANCE_REGISTRY',
    schema_version: 2,
    issue: '994',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    registry_hash_alg: 'sha256',
    registry_hash: computeRegistryHash(entries, 'sha256'),
    entry_count: 0,
    entries,
  }
}

// ── artifact and export presence ────────────────────────────────────────────

test('issue #996: append-release-provenance.mjs exists in scripts/', () => {
  assert.ok(
    existsSync(join(root, 'scripts/append-release-provenance.mjs')),
    'scripts/append-release-provenance.mjs must exist',
  )
})

test('issue #996: append-release-provenance.mjs exports all required functions', () => {
  assert.ok(typeof REGISTRY_FAILURE_CLASSES === 'object', 'must export REGISTRY_FAILURE_CLASSES')
  assert.ok(typeof canonicalJson === 'function', 'must export canonicalJson')
  assert.ok(typeof computeRegistryHash === 'function', 'must export computeRegistryHash')
  assert.ok(typeof validateRegistryHash === 'function', 'must export validateRegistryHash')
  assert.ok(typeof validateEntryForAppend === 'function', 'must export validateEntryForAppend')
  assert.ok(typeof detectRegistryReplayConflict === 'function', 'must export detectRegistryReplayConflict')
  assert.ok(typeof verifyProvenanceEquivalence === 'function', 'must export verifyProvenanceEquivalence')
  assert.ok(typeof appendProvenanceEntry === 'function', 'must export appendProvenanceEntry')
})

test('issue #996: REGISTRY_FAILURE_CLASSES exports all 7 required failure class values', () => {
  for (const cls of REQUIRED_REGISTRY_FAILURE_CLASSES) {
    const found = Object.values(REGISTRY_FAILURE_CLASSES).includes(cls)
    assert.ok(found, `REGISTRY_FAILURE_CLASSES must include value "${cls}"`)
  }
})

test('issue #996: release_provenance_registry.json has persistence fields (hash, entry_count)', () => {
  const registry = readJson('runtime/release_provenance_registry.json')
  assert.equal(typeof registry.registry_hash_alg, 'string', 'registry_hash_alg must be present')
  assert.equal(typeof registry.registry_hash, 'string', 'registry_hash must be present')
  assert.equal(typeof registry.entry_count, 'number', 'entry_count must be present')
  assert.ok(registry.registry_hash.length > 0, 'registry_hash must be non-empty')
  assert.equal(registry.registry_hash_alg, 'sha256', 'registry_hash_alg must be sha256')
})

test('issue #996: release_provenance_registry.json stored hash validates correctly', () => {
  const registry = readJson('runtime/release_provenance_registry.json')
  const result = validateRegistryHash(registry)
  assert.equal(result.valid, true, `registry hash must validate: ${JSON.stringify(result)}`)
  assert.equal(result.failure_class, null)
})

// ── FATE test 1: valid provenance entry appends deterministically ─────────────

test('FATE #996-1: valid provenance entry appends deterministically', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()

  const updated = appendProvenanceEntry(registry, entry)

  assert.equal(updated.entry_count, 1)
  assert.equal(updated.entries.length, 1)
  assert.deepEqual(updated.entries[0], entry)
  assert.ok(typeof updated.registry_hash === 'string')
  assert.ok(updated.registry_hash.length > 0)
  assert.notEqual(updated.registry_hash, registry.registry_hash, 'hash must change after append')
})

test('FATE #996-1b: appending same entry twice produces same hash each time', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()

  const updated1 = appendProvenanceEntry(registry, entry)

  const registry2 = makeEmptyRegistry()
  const updated2 = appendProvenanceEntry(registry2, entry)

  assert.equal(updated1.registry_hash, updated2.registry_hash, 'same input must produce same hash')
  assert.equal(updated1.entry_count, updated2.entry_count)
})

// ── FATE test 2: registry hash is deterministic ──────────────────────────────

test('FATE #996-2: registry hash is deterministic — same entries produce same hash', () => {
  const entries = [makeValidEntry()]
  const hash1 = computeRegistryHash(entries, 'sha256')
  const hash2 = computeRegistryHash(entries, 'sha256')
  assert.equal(hash1, hash2, 'computeRegistryHash must be deterministic')
})

test('FATE #996-2b: registry hash is stable under canonical serialization — key order does not matter', () => {
  const entry1 = makeValidEntry()
  // Same entry with different key insertion order
  const entry2 = {
    workflow_run_id: entry1.workflow_run_id,
    release_id: entry1.release_id,
    artifact_hash: entry1.artifact_hash,
    ...entry1,
  }

  const hash1 = computeRegistryHash([entry1], 'sha256')
  const hash2 = computeRegistryHash([entry2], 'sha256')
  assert.equal(hash1, hash2, 'hash must be stable under different key ordering')
})

// ── FATE test 3: same input produces same registry hash ──────────────────────

test('FATE #996-3: same input always produces same registry hash', () => {
  const entry = makeValidEntry()
  const entries = [entry]
  const results = Array.from({ length: 5 }, () => computeRegistryHash(entries, 'sha256'))
  const unique = new Set(results)
  assert.equal(unique.size, 1, 'computeRegistryHash must always return the same value for identical inputs')
})

test('FATE #996-3b: entry insertion order does not affect registry hash', () => {
  const entryA = makeValidEntry({ release_id: 'RPROV-20260522-AAA', release_tag: 'v1.0.0' })
  const entryB = makeValidEntry({ release_id: 'RPROV-20260522-BBB', release_tag: 'v2.0.0',
    source_commit_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    artifact_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb001',
    preo_reference: 'PREO-995-bbb', sco_reference: 'SCO-995-bbb' })

  const hash_ab = computeRegistryHash([entryA, entryB], 'sha256')
  const hash_ba = computeRegistryHash([entryB, entryA], 'sha256')
  assert.equal(hash_ab, hash_ba, 'hash must be identical regardless of entry order (sorted by release_id for hashing)')
})

// ── FATE test 4: mutated provenance entry fails equivalence check ─────────────

test('FATE #996-4: mutated artifact_hash fails equivalence check', () => {
  const generated = makeValidEntry()
  const mutated = { ...generated, artifact_hash: 'mutated-hash-0000000000000000000000000000000000000000' }

  const result = verifyProvenanceEquivalence(generated, mutated)
  assert.equal(result.equivalent, false)
  assert.equal(result.failure_class, REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_MUTATION_AFTER_GENERATION)
})

test('FATE #996-4b: mutated classification fails equivalence check', () => {
  const generated = makeValidEntry()
  const mutated = { ...generated, classification: 'NON_CANONICAL_RELEASE', canonical_release_candidate: false }

  const result = verifyProvenanceEquivalence(generated, mutated)
  assert.equal(result.equivalent, false)
  assert.equal(result.failure_class, REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_MUTATION_AFTER_GENERATION)
})

test('FATE #996-4c: identical entry passes equivalence check', () => {
  const generated = makeValidEntry()
  const appended = { ...generated }

  const result = verifyProvenanceEquivalence(generated, appended)
  assert.equal(result.equivalent, true)
  assert.equal(result.failure_class, null)
})

test('FATE #996-4d: appended entry in registry equals generated entry after successful append', () => {
  const registry = makeEmptyRegistry()
  const generated = makeValidEntry()

  const updated = appendProvenanceEntry(registry, generated)
  const appended = updated.entries[updated.entries.length - 1]

  const result = verifyProvenanceEquivalence(generated, appended)
  assert.equal(result.equivalent, true, 'appended entry must equal generated entry')
})

// ── FATE test 5: duplicate release_id is rejected ─────────────────────────────

test('FATE #996-5: duplicate release_id → release_registry_replay_conflict', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()
  const updatedOnce = appendProvenanceEntry(registry, entry)

  const duplicate = makeValidEntry({
    release_tag: 'v2.0.0',
    source_commit_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    artifact_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb001',
    preo_reference: 'PREO-996-bbb',
    sco_reference: 'SCO-996-bbb',
  })

  assert.throws(
    () => appendProvenanceEntry(updatedOnce, duplicate),
    (err) => {
      assert.ok(err.message.includes(REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT))
      return true
    },
  )
})

test('FATE #996-5b: detectRegistryReplayConflict same release_id → conflict', () => {
  const existing = [makeValidEntry()]
  const newEntry = makeValidEntry({ release_tag: 'v2.0.0', source_commit_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })

  const conflicts = detectRegistryReplayConflict(existing, newEntry)
  assert.ok(conflicts.length > 0)
  assert.ok(conflicts.some((c) => c.failure_class === REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT))
  assert.ok(conflicts.some((c) => c.detail.includes(existing[0].release_id)))
})

// ── FATE test 6: same tag different commit is rejected ───────────────────────

test('FATE #996-6: same tag + different commit → release_registry_replay_conflict', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()
  const updated = appendProvenanceEntry(registry, entry)

  const conflict = makeValidEntry({
    release_id: 'RPROV-20260522-9960002',
    release_tag: 'v1.0.0',
    source_commit_sha: 'dddddddddddddddddddddddddddddddddddddddd',
    artifact_hash: 'ddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd001',
    preo_reference: 'PREO-996-ddd',
    sco_reference: 'SCO-996-ddd',
  })

  assert.throws(
    () => appendProvenanceEntry(updated, conflict),
    (err) => {
      assert.ok(err.message.includes(REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT))
      return true
    },
  )
})

test('FATE #996-6b: detectRegistryReplayConflict same tag different commit → conflict with tag detail', () => {
  const existing = [makeValidEntry()]
  const newEntry = makeValidEntry({
    release_id: 'RPROV-20260522-9960099',
    source_commit_sha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    artifact_hash: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee001',
    preo_reference: 'PREO-996-eee',
    sco_reference: 'SCO-996-eee',
  })

  const conflicts = detectRegistryReplayConflict(existing, newEntry)
  assert.ok(conflicts.some((c) => c.detail.includes('v1.0.0')))
})

// ── FATE test 7: same tag different artifact hash is rejected ─────────────────

test('FATE #996-7: same tag + different artifact hash → release_registry_replay_conflict', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()
  const updated = appendProvenanceEntry(registry, entry)

  const conflict = makeValidEntry({
    release_id: 'RPROV-20260522-9960003',
    artifact_hash: 'fff0000fff0000fff0000fff0000fff0000fff0000fff0000fff0000fff00001',
  })

  assert.throws(
    () => appendProvenanceEntry(updated, conflict),
    (err) => {
      assert.ok(err.message.includes(REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT))
      return true
    },
  )
})

test('FATE #996-7b: same commit + same tag + different artifact hash → replay conflict', () => {
  const existing = [makeValidEntry()]
  const newEntry = makeValidEntry({
    release_id: 'RPROV-20260522-9960098',
    artifact_hash: 'fff1111fff1111fff1111fff1111fff1111fff1111fff1111fff1111fff11112',
  })

  const conflicts = detectRegistryReplayConflict(existing, newEntry)
  assert.ok(conflicts.length > 0)
  assert.ok(conflicts.every((c) => c.failure_class === REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT))
})

// ── FATE test 8: same preo_reference different artifact hash is rejected ──────

test('FATE #996-8: same preo_reference + same tag + different artifact hash → release_registry_replay_conflict', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()
  const updated = appendProvenanceEntry(registry, entry)

  const conflict = makeValidEntry({
    release_id: 'RPROV-20260522-9960004',
    artifact_hash: 'ccc0000ccc0000ccc0000ccc0000ccc0000ccc0000ccc0000ccc0000ccc00003',
  })

  assert.throws(
    () => appendProvenanceEntry(updated, conflict),
    (err) => {
      assert.ok(err.message.includes(REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT))
      return true
    },
  )
})

test('FATE #996-8b: detectRegistryReplayConflict same preo_reference + tag + different hash → conflict', () => {
  const sharedPreo = 'PREO-995-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const existing = [makeValidEntry({ preo_reference: sharedPreo })]
  const newEntry = makeValidEntry({
    release_id: 'RPROV-20260522-9960097',
    artifact_hash: 'ccc1111ccc1111ccc1111ccc1111ccc1111ccc1111ccc1111ccc1111ccc11114',
    preo_reference: sharedPreo,
  })

  const conflicts = detectRegistryReplayConflict(existing, newEntry)
  assert.ok(conflicts.some((c) =>
    c.failure_class === REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT &&
    c.detail.includes(sharedPreo),
  ))
})

// ── FATE test 9: BREAK_GLASS canonicalization is rejected ────────────────────

test('FATE #996-9: BREAK_GLASS entry with canonical_release_candidate=true is rejected', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry({
    classification: 'BREAK_GLASS',
    break_glass: true,
    break_glass_justification: 'emergency hotfix',
    canonical_release_candidate: true,
  })

  assert.throws(
    () => appendProvenanceEntry(registry, entry),
    (err) => {
      assert.ok(
        err.message.includes(REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_BREAK_GLASS_CANONICALIZATION),
        `expected break_glass_canonicalization failure, got: ${err.message}`,
      )
      return true
    },
  )
})

test('FATE #996-9b: validateEntryForAppend rejects BREAK_GLASS with canonical_release_candidate=true', () => {
  const entry = makeValidEntry({
    break_glass: true,
    canonical_release_candidate: true,
  })

  const result = validateEntryForAppend(entry)
  assert.equal(result.valid, false)
  assert.ok(result.failures.some(
    (f) => f.failure_class === REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_BREAK_GLASS_CANONICALIZATION,
  ))
})

test('FATE #996-9c: BREAK_GLASS with canonical_release_candidate=false is accepted by validator', () => {
  const entry = makeValidEntry({
    classification: 'BREAK_GLASS',
    break_glass: true,
    break_glass_justification: 'emergency access',
    canonical_release_candidate: false,
  })

  const result = validateEntryForAppend(entry)
  const bgFailures = result.failures.filter(
    (f) => f.failure_class === REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_BREAK_GLASS_CANONICALIZATION,
  )
  assert.equal(bgFailures.length, 0, 'BREAK_GLASS with canonical=false must not trigger canonicalization failure')
})

test('FATE #996-9d: BREAK_GLASS must never be normalized to canonical_release_candidate=true in registry', () => {
  const registry = readJson('runtime/release_provenance_registry.json')
  for (const entry of registry.entries) {
    if (entry.break_glass === true) {
      assert.equal(
        entry.canonical_release_candidate,
        false,
        `BREAK_GLASS entry ${entry.release_id} must never have canonical_release_candidate=true`,
      )
    }
  }
})

// ── FATE test 10: registry remains evidence-only ─────────────────────────────

test('FATE #996-10: registry remains evidence-only — evidence_only=true at schema level', () => {
  const registry = readJson('runtime/release_provenance_registry.json')
  assert.equal(registry.evidence_only, true)
})

test('FATE #996-10b: validateEntryForAppend rejects evidence_only=false', () => {
  const entry = makeValidEntry({ evidence_only: false })
  const result = validateEntryForAppend(entry)
  assert.equal(result.valid, false)
  assert.ok(result.failures.some(
    (f) => f.failure_class === REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_ENTRY_INVALID &&
           f.detail.includes('evidence_only'),
  ))
})

test('FATE #996-10c: appendProvenanceEntry result preserves evidence_only=true from registry', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()
  const updated = appendProvenanceEntry(registry, entry)
  assert.equal(updated.evidence_only, registry.evidence_only)
})

test('FATE #996-10d: appended entry retains evidence_only=true', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()
  const updated = appendProvenanceEntry(registry, entry)
  assert.equal(updated.entries[0].evidence_only, true)
})

// ── FATE test 11: registry cannot create authority ───────────────────────────

test('FATE #996-11: registry cannot create authority — creates_authority=false at schema level', () => {
  const registry = readJson('runtime/release_provenance_registry.json')
  assert.equal(registry.creates_authority, false)
})

test('FATE #996-11b: validateEntryForAppend rejects creates_authority=true', () => {
  const entry = makeValidEntry({ creates_authority: true })
  const result = validateEntryForAppend(entry)
  assert.equal(result.valid, false)
  assert.ok(result.failures.some(
    (f) => f.failure_class === REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_ENTRY_INVALID &&
           f.detail.includes('creates_authority'),
  ))
})

test('FATE #996-11c: appendProvenanceEntry preserves creates_authority=false from registry', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()
  const updated = appendProvenanceEntry(registry, entry)
  assert.equal(updated.creates_authority, false)
})

test('FATE #996-11d: appended entry has creates_authority=false', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()
  const updated = appendProvenanceEntry(registry, entry)
  assert.equal(updated.entries[0].creates_authority, false)
})

// ── FATE test 12: registry cannot create proof ───────────────────────────────

test('FATE #996-12: appendProvenanceEntry result contains no proof fields', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()
  const updated = appendProvenanceEntry(registry, entry)
  assert.ok(!('proof_id' in updated), 'registry must not contain proof_id')
  assert.ok(!('proof_binding_hash' in updated), 'registry must not contain proof_binding_hash')
  assert.ok(!('execution_id' in updated), 'registry must not contain execution_id')
})

test('FATE #996-12b: appended entry contains no proof fields', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()
  const updated = appendProvenanceEntry(registry, entry)
  const appended = updated.entries[0]
  assert.ok(!('proof_id' in appended), 'appended entry must not contain proof_id')
  assert.ok(!('proof_binding_hash' in appended), 'appended entry must not contain proof_binding_hash')
})

test('FATE #996-12c: registry governance_invariants confirm RPEI-001 (evidence-only, no authority)', () => {
  const registry = readJson('runtime/release_provenance_registry.json')
  const rpei001 = registry.governance_invariants.find((i) => i.invariant_id === 'RPEI-001')
  assert.ok(rpei001, 'RPEI-001 must be present in registry governance_invariants')
  assert.equal(rpei001.evidence_only, true)
  assert.equal(rpei001.creates_authority, false)
  assert.equal(rpei001.creates_execution, false)
})

// ── FATE test 13: registry cannot execute ────────────────────────────────────

test('FATE #996-13: registry cannot execute — creates_execution=false at schema level', () => {
  const registry = readJson('runtime/release_provenance_registry.json')
  assert.equal(registry.creates_execution, false)
})

test('FATE #996-13b: validateEntryForAppend rejects creates_execution=true', () => {
  const entry = makeValidEntry({ creates_execution: true })
  const result = validateEntryForAppend(entry)
  assert.equal(result.valid, false)
  assert.ok(result.failures.some(
    (f) => f.failure_class === REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_ENTRY_INVALID &&
           f.detail.includes('creates_execution'),
  ))
})

test('FATE #996-13c: appendProvenanceEntry result has creates_execution=false', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()
  const updated = appendProvenanceEntry(registry, entry)
  assert.equal(updated.creates_execution, false)
})

// ── FATE test 14: workflow does not auto-commit registry updates ──────────────

test('FATE #996-14: governed-release.yml does not auto-commit registry to main', () => {
  const content = readText('.github/workflows/governed-release.yml')
  assert.ok(
    !content.includes('git commit') && !content.includes('git push'),
    'governed-release.yml must not contain git commit or git push operations',
  )
})

test('FATE #996-14b: governed-release.yml does not create GitHub release, push tags, or publish packages', () => {
  const content = readText('.github/workflows/governed-release.yml')
  assert.ok(!content.includes('gh release create'), 'must not create GitHub release')
  assert.ok(!content.includes('git tag') || content.includes('git ls-remote --tags'),
    'must not create git tags (checking for tags in ls-remote for verification is allowed)',
  )
  assert.ok(!content.includes('npm publish'), 'must not publish npm package')
  assert.ok(!content.includes('wrangler deploy') || !content.includes('governed-release'),
    'must not invoke wrangler deploy in governed-release workflow',
  )
})

test('FATE #996-14c: governed-release.yml references evidence-only and no-auto-commit constraints', () => {
  const content = readText('.github/workflows/governed-release.yml')
  assert.ok(
    content.includes('never modified by this workflow') || content.includes('NEVER modified'),
    'governed-release.yml must document that the registry is never auto-modified',
  )
})

// ── FATE test 15: proposed registry patch can be generated as audit artifact ──

test('FATE #996-15: governed-release.yml includes proposed registry patch generation step', () => {
  const content = readText('.github/workflows/governed-release.yml')
  assert.ok(
    content.includes('proposed-registry-patch'),
    'governed-release.yml must include proposed-registry-patch generation',
  )
})

test('FATE #996-15b: governed-release.yml uploads proposed registry patch as audit artifact', () => {
  const content = readText('.github/workflows/governed-release.yml')
  assert.ok(
    content.includes('PROPOSED_REGISTRY_PATCH') || content.includes('proposed-registry-patch.json'),
    'governed-release.yml must upload proposed-registry-patch as artifact',
  )
  assert.ok(
    content.includes('upload-artifact'),
    'governed-release.yml must use upload-artifact for proposed patch',
  )
})

test('FATE #996-15c: append-release-provenance.mjs can generate a proposed patch for an empty registry', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()

  const proposed = appendProvenanceEntry(registry, entry)

  assert.equal(proposed.entry_count, 1)
  assert.ok(typeof proposed.registry_hash === 'string')
  assert.ok(proposed.registry_hash.length === 64, 'SHA-256 hash must be 64 hex chars')
  assert.notEqual(proposed.registry_hash, registry.registry_hash)

  const hashCheck = validateRegistryHash(proposed)
  assert.equal(hashCheck.valid, true, 'proposed patch hash must validate')
})

// ── additional invariants ────────────────────────────────────────────────────

test('FATE #996: canonicalJson is deterministic for same input', () => {
  const obj = { z: 1, a: 2, m: [3, 2, 1] }
  const c1 = canonicalJson(obj)
  const c2 = canonicalJson(obj)
  assert.equal(c1, c2)
  assert.ok(c1.startsWith('{"a":'), 'canonical JSON must sort keys alphabetically')
})

test('FATE #996: validateEntryForAppend rejects unknown provenance_type', () => {
  const entry = makeValidEntry({ provenance_type: 'UNKNOWN_TYPE' })
  const result = validateEntryForAppend(entry)
  assert.equal(result.valid, false)
  assert.ok(result.failures.some(
    (f) => f.failure_class === REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_UNKNOWN_PROVENANCE_TYPE,
  ))
})

test('FATE #996: validateEntryForAppend accepts all valid provenance types', () => {
  for (const type of ['DSSE', 'SLSA', 'INTERNAL', 'PENDING_EXTERNAL']) {
    const entry = makeValidEntry({ provenance_type: type })
    const result = validateEntryForAppend(entry)
    const unknownFailures = result.failures.filter(
      (f) => f.failure_class === REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_UNKNOWN_PROVENANCE_TYPE,
    )
    assert.equal(unknownFailures.length, 0, `provenance_type "${type}" must be accepted`)
  }
})

test('FATE #996: appendProvenanceEntry rejects entry with missing required fields', () => {
  const registry = makeEmptyRegistry()
  const entry = makeValidEntry()
  delete entry.artifact_hash

  assert.throws(
    () => appendProvenanceEntry(registry, entry),
    (err) => {
      assert.ok(err.message.includes(REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_ENTRY_INVALID))
      return true
    },
  )
})

test('FATE #996: multi-entry append builds correct sequential hash chain', () => {
  const registry = makeEmptyRegistry()

  const entry1 = makeValidEntry({ release_id: 'RPROV-20260522-CHAIN-001', release_tag: 'v1.0.0' })
  const after1 = appendProvenanceEntry(registry, entry1)

  const entry2 = makeValidEntry({
    release_id: 'RPROV-20260522-CHAIN-002',
    release_tag: 'v1.1.0',
    source_commit_sha: 'cccccccccccccccccccccccccccccccccccccccc',
    artifact_hash: 'ccc0000ccc0000ccc0000ccc0000ccc0000ccc0000ccc0000ccc0000ccc00005',
    preo_reference: 'PREO-996-ccc',
    sco_reference: 'SCO-996-ccc',
  })
  const after2 = appendProvenanceEntry(after1, entry2)

  assert.equal(after2.entry_count, 2)
  assert.notEqual(after2.registry_hash, after1.registry_hash)
  assert.equal(validateRegistryHash(after2).valid, true)
  assert.equal(validateRegistryHash(after1).valid, true)
})

test('FATE #996: appendProvenanceEntry rejects corrupted registry hash', () => {
  const registry = makeEmptyRegistry()
  const entry1 = makeValidEntry({ release_id: 'RPROV-20260522-CORRUPT-001', release_tag: 'v1.0.0' })
  const updated = appendProvenanceEntry(registry, entry1)

  const corrupted = {
    ...updated,
    registry_hash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  }

  const entry2 = makeValidEntry({
    release_id: 'RPROV-20260522-CORRUPT-002',
    release_tag: 'v2.0.0',
    source_commit_sha: 'dddddddddddddddddddddddddddddddddddddddd',
    artifact_hash: 'ddd0000ddd0000ddd0000ddd0000ddd0000ddd0000ddd0000ddd0000ddd00006',
    preo_reference: 'PREO-996-ddd',
    sco_reference: 'SCO-996-ddd',
  })

  assert.throws(
    () => appendProvenanceEntry(corrupted, entry2),
    (err) => {
      assert.ok(err.message.includes(REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_HASH_MISMATCH))
      return true
    },
  )
})

// ── non-regression ──────────────────────────────────────────────────────────

test('FATE #996 non-regression: release_provenance_registry.json retains issue #994 structure', () => {
  const registry = readJson('runtime/release_provenance_registry.json')
  assert.equal(registry.artifact, 'RELEASE_PROVENANCE_REGISTRY')
  assert.equal(registry.issue, '994')
  assert.ok(registry.schema_version >= 1)
  assert.ok(Array.isArray(registry.entries))
  assert.ok(Array.isArray(registry.replay_prevention_rules))
  assert.ok(registry.replay_prevention_rules.length >= 5)
  assert.equal(registry.evidence_only, true)
  assert.equal(registry.creates_authority, false)
  assert.equal(registry.creates_execution, false)
})

test('FATE #996 non-regression: tests/fate/issue-994-release-provenance-enforcement.test.mjs is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-994-release-provenance-enforcement.test.mjs')),
    '#994 FATE test file must remain present',
  )
})

test('FATE #996 non-regression: scripts/verify-release-provenance.mjs is present and unmodified in exports', async () => {
  const mod = await import('../../scripts/verify-release-provenance.mjs')
  assert.ok(typeof mod.classifyReleaseTarget === 'function')
  assert.ok(typeof mod.detectReplayAttempt === 'function')
  assert.ok(typeof mod.verifyCanonicalReleaseBoundary === 'function')
  assert.ok(typeof mod.FAILURE_CLASSES === 'object')
  assert.ok(typeof mod.CLASSIFICATIONS === 'object')
})
