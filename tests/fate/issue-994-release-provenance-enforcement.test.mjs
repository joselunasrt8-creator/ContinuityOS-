/**
 * Issue #994 — RELEASE_PROVENANCE_ENFORCEMENT_V1
 *
 * FATE tests proving deterministic release enforcement.
 *
 * Verifies:
 *   1.  release target must be reachable from main
 *   2.  feature-branch-only commit cannot become canonical release
 *   3.  missing PR provenance prevents canonical release
 *   4.  missing status check evidence prevents canonical release
 *   5.  tag overwrite attempt is rejected or classified non-canonical
 *   6.  release notes without evidence are non-canonical
 *   7.  missing artifact hash prevents canonical release
 *   8.  artifact hash mismatch prevents canonical release
 *   9.  provenance replay is rejected
 *   10. attestation mismatch is rejected
 *   11. release provenance remains evidence-only
 *   12. release provenance cannot create authority
 *   13. release provenance cannot create proof
 *   14. release provenance cannot execute
 *   15. BREAK_GLASS admin path is classified but not normalized
 *   16. rollback release without lineage is rejected or non-canonical
 *
 * Plus:
 *   - governed-release.yml exists and satisfies governed/canonical/provenance content requirements
 *   - release_provenance_registry.json exists with required structure
 *   - verify-release-provenance.mjs exports required functions and failure classes
 *   - All 13 required failure classes are defined
 *   - Evidence-only invariants hold for all registry entries
 *   - PR #993 classification layer is unchanged (non-regression)
 *
 * Evidence only — no runtime route changes, no validator changes, no proof
 * behavior changes, no execution path expansion, no authority creation,
 * no deployment capability expansion.
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
  classifyReleaseTarget,
  detectReplayAttempt,
  validateReleaseNotes,
  validateRollbackLineage,
  validateProvenanceEntry,
  verifyCanonicalReleaseBoundary,
  FAILURE_CLASSES,
  CLASSIFICATIONS,
} from '../../scripts/verify-release-provenance.mjs'

const REQUIRED_FAILURE_CLASSES = [
  'release_target_not_on_main',
  'release_target_missing_pr_provenance',
  'release_status_checks_missing',
  'release_tag_already_exists',
  'release_tag_overwrite_attempt',
  'release_notes_missing_evidence',
  'release_artifact_hash_missing',
  'release_artifact_hash_mismatch',
  'release_provenance_missing',
  'release_provenance_replay',
  'release_attestation_mismatch',
  'release_admin_break_glass',
  'rollback_release_lineage_missing',
]

const CANONICAL_CANDIDATE = {
  reachable_from_main: true,
  feature_branch_only: false,
  has_pr_provenance: true,
  pr_number: 993,
  status_checks_passed: true,
  tag_already_exists: false,
  tag_overwrite_attempt: false,
  release_notes_have_evidence: true,
  artifact_hash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
  provenance_type: 'INTERNAL',
  is_break_glass: false,
  release_id: 'RPROV-20260522-9940001',
  release_tag: 'v1.0.0',
  source_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  preo_reference: 'PREO-993-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
}

// ── artifact presence ───────────────────────────────────────────────────────

test('issue #994: governed-release.yml exists in .github/workflows/', () => {
  assert.ok(
    existsSync(join(root, '.github/workflows/governed-release.yml')),
    '.github/workflows/governed-release.yml must exist',
  )
})

test('issue #994: governed-release.yml references governed/canonical/provenance — RPM-014', () => {
  const content = readText('.github/workflows/governed-release.yml')
  assert.ok(
    content.includes('governed') || content.includes('canonical') || content.includes('provenance'),
    'governed-release.yml must reference governed/canonical/provenance — RPM-014 EVIDENCE_ONLY',
  )
})

test('issue #994: governed-release.yml declares workflow_dispatch only — no automatic triggers', () => {
  const content = readText('.github/workflows/governed-release.yml')
  assert.ok(content.includes('workflow_dispatch'), 'governed-release.yml must use workflow_dispatch')
  assert.ok(!content.includes('on:\n  push:') && !content.includes('on:\n  schedule:'),
    'governed-release.yml must not have push or schedule triggers',
  )
})

test('issue #994: governed-release.yml verifies commit reachability from main', () => {
  const content = readText('.github/workflows/governed-release.yml')
  assert.ok(
    content.includes('release_target_not_on_main') || content.includes('merge-base') || content.includes('reachable'),
    'governed-release.yml must verify commit reachability from main',
  )
})

test('issue #994: governed-release.yml rejects existing release tags', () => {
  const content = readText('.github/workflows/governed-release.yml')
  assert.ok(
    content.includes('release_tag_already_exists') || content.includes('TAG_DOES_NOT_EXIST'),
    'governed-release.yml must reject existing release tags',
  )
})

test('issue #994: governed-release.yml generates artifact hash', () => {
  const content = readText('.github/workflows/governed-release.yml')
  assert.ok(
    content.includes('sha256sum') || content.includes('artifact_hash') || content.includes('ARTIFACT_HASH'),
    'governed-release.yml must generate artifact hash',
  )
})

test('issue #994: governed-release.yml emits evidence_only=true and creates_authority=false in provenance object', () => {
  const content = readText('.github/workflows/governed-release.yml')
  assert.ok(content.includes('evidence_only: true'), 'governed-release.yml must set evidence_only: true')
  assert.ok(content.includes('creates_authority: false'), 'governed-release.yml must set creates_authority: false')
})

test('issue #994: release_provenance_registry.json exists with required structure', () => {
  assert.ok(
    existsSync(join(root, 'runtime/release_provenance_registry.json')),
    'runtime/release_provenance_registry.json must exist',
  )
  const registry = readJson('runtime/release_provenance_registry.json')
  assert.equal(registry.artifact, 'RELEASE_PROVENANCE_REGISTRY')
  assert.equal(registry.issue, '994')
  assert.ok(registry.schema_version >= 1)
  assert.ok(Array.isArray(registry.entries), 'registry must have entries array')
  assert.ok(Array.isArray(registry.replay_prevention_rules), 'registry must have replay_prevention_rules')
  assert.ok(registry.replay_prevention_rules.length >= 5, 'at least 5 replay prevention rules required')
  assert.equal(registry.evidence_only, true)
  assert.equal(registry.creates_authority, false)
  assert.equal(registry.creates_execution, false)
})

test('issue #994: release_provenance_registry.json declares all 13 required failure classes', () => {
  const registry = readJson('runtime/release_provenance_registry.json')
  const declared = registry.required_failure_classes
  assert.ok(Array.isArray(declared), 'required_failure_classes must be an array')
  for (const cls of REQUIRED_FAILURE_CLASSES) {
    assert.ok(declared.includes(cls), `registry must declare failure class "${cls}"`)
  }
})

test('issue #994: verify-release-provenance.mjs exports all required functions and constants', () => {
  assert.ok(typeof classifyReleaseTarget === 'function', 'must export classifyReleaseTarget')
  assert.ok(typeof detectReplayAttempt === 'function', 'must export detectReplayAttempt')
  assert.ok(typeof validateReleaseNotes === 'function', 'must export validateReleaseNotes')
  assert.ok(typeof validateRollbackLineage === 'function', 'must export validateRollbackLineage')
  assert.ok(typeof validateProvenanceEntry === 'function', 'must export validateProvenanceEntry')
  assert.ok(typeof verifyCanonicalReleaseBoundary === 'function', 'must export verifyCanonicalReleaseBoundary')
  assert.ok(typeof FAILURE_CLASSES === 'object', 'must export FAILURE_CLASSES')
  assert.ok(typeof CLASSIFICATIONS === 'object', 'must export CLASSIFICATIONS')
})

test('issue #994: FAILURE_CLASSES exports all 13 required failure class values', () => {
  for (const cls of REQUIRED_FAILURE_CLASSES) {
    const key = cls.toUpperCase().replace(/-/g, '_')
    const found = Object.values(FAILURE_CLASSES).includes(cls)
    assert.ok(found, `FAILURE_CLASSES must include value "${cls}"`)
  }
})

// ── FATE test 1: release target must be reachable from main ─────────────────

test('FATE #994-1: release target not reachable from main → NON_CANONICAL_RELEASE + release_target_not_on_main', () => {
  const result = classifyReleaseTarget({
    ...CANONICAL_CANDIDATE,
    reachable_from_main: false,
    feature_branch_only: false,
  })
  assert.equal(result.classification, CLASSIFICATIONS.NON_CANONICAL_RELEASE)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_TARGET_NOT_ON_MAIN))
  assert.equal(result.canonical_release_candidate, false)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
})

// ── FATE test 2: feature-branch-only commit cannot become canonical release ──

test('FATE #994-2: feature-branch-only commit → NON_CANONICAL_RELEASE + release_target_not_on_main', () => {
  const result = classifyReleaseTarget({
    ...CANONICAL_CANDIDATE,
    reachable_from_main: true,
    feature_branch_only: true,
  })
  assert.equal(result.classification, CLASSIFICATIONS.NON_CANONICAL_RELEASE)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_TARGET_NOT_ON_MAIN))
  assert.equal(result.canonical_release_candidate, false)
})

test('FATE #994-2b: feature-branch-only with reachable_from_main=false → combined release_target_not_on_main (deduplicated)', () => {
  const result = classifyReleaseTarget({
    ...CANONICAL_CANDIDATE,
    reachable_from_main: false,
    feature_branch_only: true,
  })
  assert.equal(result.classification, CLASSIFICATIONS.NON_CANONICAL_RELEASE)
  const targetNotOnMainCount = result.failures.filter((f) => f === FAILURE_CLASSES.RELEASE_TARGET_NOT_ON_MAIN).length
  assert.equal(targetNotOnMainCount, 1, 'release_target_not_on_main should not be duplicated')
})

// ── FATE test 3: missing PR provenance prevents canonical release ────────────

test('FATE #994-3: missing PR provenance (has_pr_provenance=false) → NON_CANONICAL_RELEASE', () => {
  const result = classifyReleaseTarget({
    ...CANONICAL_CANDIDATE,
    has_pr_provenance: false,
  })
  assert.equal(result.classification, CLASSIFICATIONS.NON_CANONICAL_RELEASE)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_TARGET_MISSING_PR_PROVENANCE))
  assert.equal(result.canonical_release_candidate, false)
})

test('FATE #994-3b: null pr_number → NON_CANONICAL_RELEASE + release_target_missing_pr_provenance', () => {
  const result = classifyReleaseTarget({
    ...CANONICAL_CANDIDATE,
    has_pr_provenance: true,
    pr_number: null,
  })
  assert.equal(result.classification, CLASSIFICATIONS.NON_CANONICAL_RELEASE)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_TARGET_MISSING_PR_PROVENANCE))
  assert.equal(result.canonical_release_candidate, false)
})

// ── FATE test 4: missing status check evidence prevents canonical release ────

test('FATE #994-4: status_checks_passed=false → NON_CANONICAL_RELEASE + release_status_checks_missing', () => {
  const result = classifyReleaseTarget({
    ...CANONICAL_CANDIDATE,
    status_checks_passed: false,
  })
  assert.equal(result.classification, CLASSIFICATIONS.NON_CANONICAL_RELEASE)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_STATUS_CHECKS_MISSING))
  assert.equal(result.canonical_release_candidate, false)
})

// ── FATE test 5: tag overwrite attempt is rejected or classified non-canonical

test('FATE #994-5: tag_already_exists=true → NON_CANONICAL_RELEASE + release_tag_already_exists', () => {
  const result = classifyReleaseTarget({
    ...CANONICAL_CANDIDATE,
    tag_already_exists: true,
    tag_overwrite_attempt: false,
  })
  assert.equal(result.classification, CLASSIFICATIONS.NON_CANONICAL_RELEASE)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_TAG_ALREADY_EXISTS))
  assert.equal(result.canonical_release_candidate, false)
})

test('FATE #994-5b: tag_overwrite_attempt=true → NON_CANONICAL_RELEASE + release_tag_overwrite_attempt', () => {
  const result = classifyReleaseTarget({
    ...CANONICAL_CANDIDATE,
    tag_already_exists: true,
    tag_overwrite_attempt: true,
  })
  assert.equal(result.classification, CLASSIFICATIONS.NON_CANONICAL_RELEASE)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_TAG_OVERWRITE_ATTEMPT))
  assert.equal(result.canonical_release_candidate, false)
})

test('FATE #994-5c: detectReplayAttempt same tag + different commit → release_tag_overwrite_attempt', () => {
  const existing = [
    {
      release_id: 'RPROV-20260522-0001',
      release_tag: 'v1.0.0',
      source_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      artifact_hash: 'hash-aaa',
      preo_reference: 'PREO-993-aaa',
    },
  ]
  const newEntry = {
    release_id: 'RPROV-20260522-0002',
    release_tag: 'v1.0.0',
    source_commit_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    artifact_hash: 'hash-bbb',
    preo_reference: 'PREO-994-bbb',
  }
  const failures = detectReplayAttempt(existing, newEntry)
  assert.ok(failures.includes(FAILURE_CLASSES.RELEASE_TAG_OVERWRITE_ATTEMPT))
})

// ── FATE test 6: release notes without evidence are non-canonical ────────────

test('FATE #994-6: release_notes_have_evidence=false → NON_CANONICAL_RELEASE + release_notes_missing_evidence', () => {
  const result = classifyReleaseTarget({
    ...CANONICAL_CANDIDATE,
    release_notes_have_evidence: false,
  })
  assert.equal(result.classification, CLASSIFICATIONS.NON_CANONICAL_RELEASE)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_NOTES_MISSING_EVIDENCE))
  assert.equal(result.canonical_release_candidate, false)
})

test('FATE #994-6b: validateReleaseNotes with missing tag → release_notes_missing_evidence', () => {
  const result = validateReleaseNotes(
    'PR #993 merged commit aaaaaaaaaaaaa sha256: abc123',
    'v1.0.0',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    993,
  )
  assert.equal(result.valid, false)
  assert.ok(result.missing_fields.includes('release_tag'))
  assert.equal(result.failure_class, FAILURE_CLASSES.RELEASE_NOTES_MISSING_EVIDENCE)
})

test('FATE #994-6c: validateReleaseNotes with missing PR number → release_notes_missing_evidence', () => {
  const result = validateReleaseNotes(
    'Release v1.0.0 commit aaaaaaaaaaaaa sha256: abc123',
    'v1.0.0',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    993,
  )
  assert.equal(result.valid, false)
  assert.ok(result.missing_fields.includes('pr_number'))
})

test('FATE #994-6d: validateReleaseNotes with all required fields → valid', () => {
  const notes = 'Release v1.0.0 from commit aaaaaaaaaaaaa PR #993 sha256: abc123def456'
  const result = validateReleaseNotes(
    notes,
    'v1.0.0',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    993,
  )
  assert.equal(result.valid, true)
  assert.deepEqual(result.missing_fields, [])
  assert.equal(result.failure_class, null)
})

test('FATE #994-6e: release notes without provenance/attestation/hash reference → missing provenance_or_artifact_hash_reference', () => {
  const result = validateReleaseNotes(
    'Release v1.0.0 from commit aaaaaaaaaaaaa PR #993',
    'v1.0.0',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    993,
  )
  assert.equal(result.valid, false)
  assert.ok(result.missing_fields.includes('provenance_or_artifact_hash_reference'))
})

// ── FATE test 7: missing artifact hash prevents canonical release ─────────────

test('FATE #994-7: empty artifact_hash → NON_CANONICAL_RELEASE + release_artifact_hash_missing', () => {
  const result = classifyReleaseTarget({
    ...CANONICAL_CANDIDATE,
    artifact_hash: '',
  })
  assert.equal(result.classification, CLASSIFICATIONS.NON_CANONICAL_RELEASE)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISSING))
  assert.equal(result.canonical_release_candidate, false)
})

test('FATE #994-7b: undefined artifact_hash → NON_CANONICAL_RELEASE + release_artifact_hash_missing', () => {
  const candidate = { ...CANONICAL_CANDIDATE }
  delete candidate.artifact_hash
  const result = classifyReleaseTarget(candidate)
  assert.equal(result.classification, CLASSIFICATIONS.NON_CANONICAL_RELEASE)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISSING))
})

// ── FATE test 8: artifact hash mismatch prevents canonical release ────────────

test('FATE #994-8: detectReplayAttempt same tag + different artifact hash → release_artifact_hash_mismatch', () => {
  const existing = [
    {
      release_id: 'RPROV-20260522-0010',
      release_tag: 'v1.0.0',
      source_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      artifact_hash: 'original-hash-aaa',
      preo_reference: 'PREO-993-aaa',
    },
  ]
  const newEntry = {
    release_id: 'RPROV-20260522-0011',
    release_tag: 'v1.0.0',
    source_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    artifact_hash: 'different-hash-bbb',
    preo_reference: 'PREO-994-bbb',
  }
  const failures = detectReplayAttempt(existing, newEntry)
  assert.ok(failures.includes(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISMATCH))
})

test('FATE #994-8b: same commit + same tag + different artifact hash → release_artifact_hash_mismatch', () => {
  const existing = [
    {
      release_id: 'RPROV-20260522-0020',
      release_tag: 'v2.0.0',
      source_commit_sha: 'cccccccccccccccccccccccccccccccccccccccc',
      artifact_hash: 'hash-original',
      preo_reference: 'PREO-993-ccc',
    },
  ]
  const newEntry = {
    release_id: 'RPROV-20260522-0021',
    release_tag: 'v2.0.0',
    source_commit_sha: 'cccccccccccccccccccccccccccccccccccccccc',
    artifact_hash: 'hash-rebuilt-drift',
    preo_reference: 'PREO-994-ccc',
  }
  const failures = detectReplayAttempt(existing, newEntry)
  assert.ok(failures.includes(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISMATCH))
})

// ── FATE test 9: provenance replay is rejected ───────────────────────────────

test('FATE #994-9: detectReplayAttempt same release_id → release_provenance_replay', () => {
  const existing = [
    {
      release_id: 'RPROV-20260522-REPLAY-001',
      release_tag: 'v3.0.0',
      source_commit_sha: 'dddddddddddddddddddddddddddddddddddddddd',
      artifact_hash: 'hash-original',
      preo_reference: 'PREO-993-ddd',
    },
  ]
  const newEntry = {
    release_id: 'RPROV-20260522-REPLAY-001',
    release_tag: 'v3.0.1',
    source_commit_sha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    artifact_hash: 'hash-new',
    preo_reference: 'PREO-994-eee',
  }
  const failures = detectReplayAttempt(existing, newEntry)
  assert.ok(failures.includes(FAILURE_CLASSES.RELEASE_PROVENANCE_REPLAY))
})

test('FATE #994-9b: verifyCanonicalReleaseBoundary with replay → NON_CANONICAL_RELEASE', () => {
  const existing = [
    {
      release_id: 'RPROV-REPLAY-EXISTING',
      release_tag: 'v4.0.0',
      source_commit_sha: 'ffffffffffffffffffffffffffffffffffffffff',
      artifact_hash: 'hash-fff',
      preo_reference: 'PREO-993-fff',
    },
  ]
  const result = verifyCanonicalReleaseBoundary(
    {
      ...CANONICAL_CANDIDATE,
      release_id: 'RPROV-REPLAY-EXISTING',
      release_tag: 'v4.0.0',
      source_commit_sha: 'ffffffffffffffffffffffffffffffffffffffff',
      artifact_hash: 'hash-fff',
      preo_reference: 'PREO-993-fff',
    },
    existing,
  )
  assert.equal(result.classification, CLASSIFICATIONS.NON_CANONICAL_RELEASE)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_PROVENANCE_REPLAY))
  assert.equal(result.canonical_release_candidate, false)
})

// ── FATE test 10: attestation mismatch is rejected ───────────────────────────

test('FATE #994-10: same preo_reference + same tag + different artifact hash → release_attestation_mismatch', () => {
  const existing = [
    {
      release_id: 'RPROV-20260522-ATT-001',
      release_tag: 'v5.0.0',
      source_commit_sha: '1111111111111111111111111111111111111111',
      artifact_hash: 'attested-hash-original',
      preo_reference: 'PREO-993-shared-ref',
    },
  ]
  const newEntry = {
    release_id: 'RPROV-20260522-ATT-002',
    release_tag: 'v5.0.0',
    source_commit_sha: '1111111111111111111111111111111111111111',
    artifact_hash: 'attested-hash-tampered',
    preo_reference: 'PREO-993-shared-ref',
  }
  const failures = detectReplayAttempt(existing, newEntry)
  assert.ok(failures.includes(FAILURE_CLASSES.RELEASE_ATTESTATION_MISMATCH))
})

test('FATE #994-10b: different tags with same preo_reference but different hashes — no attestation_mismatch (different releases)', () => {
  const existing = [
    {
      release_id: 'RPROV-20260522-ATT-003',
      release_tag: 'v6.0.0',
      source_commit_sha: '2222222222222222222222222222222222222222',
      artifact_hash: 'hash-v6',
      preo_reference: 'PREO-993-shared',
    },
  ]
  const newEntry = {
    release_id: 'RPROV-20260522-ATT-004',
    release_tag: 'v6.1.0',
    source_commit_sha: '3333333333333333333333333333333333333333',
    artifact_hash: 'hash-v61',
    preo_reference: 'PREO-994-shared',
  }
  const failures = detectReplayAttempt(existing, newEntry)
  assert.ok(!failures.includes(FAILURE_CLASSES.RELEASE_ATTESTATION_MISMATCH),
    'different release tags should not trigger attestation mismatch',
  )
})

// ── FATE test 11: release provenance remains evidence-only ───────────────────

test('FATE #994-11: classifyReleaseTarget always sets evidence_only=true regardless of classification', () => {
  const cases = [
    { ...CANONICAL_CANDIDATE },
    { ...CANONICAL_CANDIDATE, reachable_from_main: false },
    { ...CANONICAL_CANDIDATE, is_break_glass: true },
    { ...CANONICAL_CANDIDATE, has_pr_provenance: false, status_checks_passed: false },
  ]
  for (const candidate of cases) {
    const result = classifyReleaseTarget(candidate)
    assert.equal(result.evidence_only, true, `evidence_only must be true for classification ${result.classification}`)
  }
})

test('FATE #994-11b: validateProvenanceEntry rejects evidence_only=false', () => {
  const entry = {
    release_id: 'RPROV-20260522-EV-001',
    release_tag: 'v7.0.0',
    source_commit_sha: '4444444444444444444444444444444444444444',
    artifact_hash: 'hash-444',
    artifact_hash_alg: 'sha256',
    provenance_type: 'INTERNAL',
    evidence_only: false,
    creates_authority: false,
    creates_execution: false,
    canonical_release_candidate: false,
  }
  const result = validateProvenanceEntry(entry)
  assert.equal(result.valid, false)
  assert.ok(result.violations.some((v) => v.includes('evidence_only')))
})

// ── FATE test 12: release provenance cannot create authority ─────────────────

test('FATE #994-12: classifyReleaseTarget always sets creates_authority=false', () => {
  const cases = [
    { ...CANONICAL_CANDIDATE },
    { ...CANONICAL_CANDIDATE, reachable_from_main: false },
    { ...CANONICAL_CANDIDATE, is_break_glass: true },
  ]
  for (const candidate of cases) {
    const result = classifyReleaseTarget(candidate)
    assert.equal(result.creates_authority, false, `creates_authority must be false for ${result.classification}`)
  }
})

test('FATE #994-12b: validateProvenanceEntry rejects creates_authority=true', () => {
  const entry = {
    release_id: 'RPROV-20260522-AUTH-001',
    release_tag: 'v8.0.0',
    source_commit_sha: '5555555555555555555555555555555555555555',
    artifact_hash: 'hash-555',
    artifact_hash_alg: 'sha256',
    provenance_type: 'INTERNAL',
    evidence_only: true,
    creates_authority: true,
    creates_execution: false,
    canonical_release_candidate: false,
  }
  const result = validateProvenanceEntry(entry)
  assert.equal(result.valid, false)
  assert.ok(result.violations.some((v) => v.includes('creates_authority')))
})

test('FATE #994-12c: release_provenance_registry.json has creates_authority=false at schema level', () => {
  const registry = readJson('runtime/release_provenance_registry.json')
  assert.equal(registry.creates_authority, false)
  assert.equal(registry.evidence_only, true)
})

// ── FATE test 13: release provenance cannot create proof ────────────────────

test('FATE #994-13: classifyReleaseTarget result is evidence-only — provenance is not proof', () => {
  const result = classifyReleaseTarget(CANONICAL_CANDIDATE)
  assert.equal(result.classification, CLASSIFICATIONS.CANONICAL_RELEASE_CANDIDATE)
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
  // Canonical release candidate classification does not contain proof fields
  assert.ok(!('proof_id' in result), 'classification result must not contain proof_id')
  assert.ok(!('proof_binding_hash' in result), 'classification result must not contain proof_binding_hash')
  assert.ok(!('execution_id' in result), 'classification result must not contain execution_id')
})

test('FATE #994-13b: release_provenance_matrix.json invariant RPI-004 confirms release notes ≠ proof', () => {
  const matrix = readJson('runtime/release_provenance_matrix.json')
  const rpi004 = matrix.governance_invariants.find((i) => i.invariant_id === 'RPI-004')
  assert.ok(rpi004, 'RPI-004 must be present in release_provenance_matrix')
  assert.match(rpi004.statement.toLowerCase(), /release notes|notes.*proof/)
  assert.equal(rpi004.verified, true)
})

test('FATE #994-13c: release_provenance_matrix.json invariant RPI-007 confirms provenance is evidence-only', () => {
  const matrix = readJson('runtime/release_provenance_matrix.json')
  const rpi007 = matrix.governance_invariants.find((i) => i.invariant_id === 'RPI-007')
  assert.ok(rpi007, 'RPI-007 must be present')
  assert.match(rpi007.statement.toLowerCase(), /evidence.only|provenance.*evidence/)
  assert.equal(rpi007.verified, true)
})

// ── FATE test 14: release provenance cannot execute ──────────────────────────

test('FATE #994-14: classifyReleaseTarget always sets creates_execution=false', () => {
  const cases = [
    { ...CANONICAL_CANDIDATE },
    { ...CANONICAL_CANDIDATE, reachable_from_main: false },
    { ...CANONICAL_CANDIDATE, is_break_glass: true },
    { ...CANONICAL_CANDIDATE, has_pr_provenance: false },
  ]
  for (const candidate of cases) {
    const result = classifyReleaseTarget(candidate)
    assert.equal(result.creates_execution, false, `creates_execution must be false for ${result.classification}`)
  }
})

test('FATE #994-14b: validateProvenanceEntry rejects creates_execution=true', () => {
  const entry = {
    release_id: 'RPROV-20260522-EXEC-001',
    release_tag: 'v9.0.0',
    source_commit_sha: '6666666666666666666666666666666666666666',
    artifact_hash: 'hash-666',
    artifact_hash_alg: 'sha256',
    provenance_type: 'INTERNAL',
    evidence_only: true,
    creates_authority: false,
    creates_execution: true,
    canonical_release_candidate: false,
  }
  const result = validateProvenanceEntry(entry)
  assert.equal(result.valid, false)
  assert.ok(result.violations.some((v) => v.includes('creates_execution')))
})

test('FATE #994-14c: governed-release.yml declares creates_execution: false in provenance object', () => {
  const content = readText('.github/workflows/governed-release.yml')
  assert.ok(content.includes('creates_execution: false'), 'governed-release.yml must set creates_execution: false')
})

// ── FATE test 15: BREAK_GLASS admin path is classified but not normalized ────

test('FATE #994-15: is_break_glass=true → BREAK_GLASS classification, canonical_release_candidate=false', () => {
  const result = classifyReleaseTarget({
    ...CANONICAL_CANDIDATE,
    is_break_glass: true,
  })
  assert.equal(result.classification, CLASSIFICATIONS.BREAK_GLASS)
  assert.equal(result.canonical_release_candidate, false)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_ADMIN_BREAK_GLASS))
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
})

test('FATE #994-15b: BREAK_GLASS with all other checks passing is still BREAK_GLASS — never normalized', () => {
  const result = classifyReleaseTarget({
    reachable_from_main: true,
    feature_branch_only: false,
    has_pr_provenance: true,
    pr_number: 993,
    status_checks_passed: true,
    tag_already_exists: false,
    tag_overwrite_attempt: false,
    release_notes_have_evidence: true,
    artifact_hash: 'abc123',
    provenance_type: 'INTERNAL',
    is_break_glass: true,
  })
  assert.equal(result.classification, CLASSIFICATIONS.BREAK_GLASS)
  assert.equal(result.canonical_release_candidate, false,
    'BREAK_GLASS must never have canonical_release_candidate=true even if all other checks pass',
  )
})

test('FATE #994-15c: validateProvenanceEntry rejects BREAK_GLASS entry with canonical_release_candidate=true', () => {
  const entry = {
    release_id: 'RPROV-20260522-BG-001',
    release_tag: 'v10.0.0',
    source_commit_sha: '7777777777777777777777777777777777777777',
    artifact_hash: 'hash-777',
    artifact_hash_alg: 'sha256',
    provenance_type: 'INTERNAL',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    canonical_release_candidate: true,
    break_glass: true,
  }
  const result = validateProvenanceEntry(entry)
  assert.equal(result.valid, false)
  assert.ok(result.violations.some((v) => v.includes('BREAK_GLASS')))
})

test('FATE #994-15d: BREAK_GLASS classification references RPI-008 invariant', () => {
  const matrix = readJson('runtime/release_provenance_matrix.json')
  const rpi008 = matrix.governance_invariants.find((i) => i.invariant_id === 'RPI-008')
  assert.ok(rpi008, 'RPI-008 must be present')
  assert.match(rpi008.statement.toLowerCase(), /break.glass|break_glass/)
  assert.equal(rpi008.verified, true)
  const adminPath = matrix.provenance_paths.find((p) => p.path_name === 'admin_root_release_bypass')
  assert.ok(adminPath)
  assert.equal(adminPath.classification, 'BREAK_GLASS')
  assert.equal(adminPath.creates_release_legitimacy, false)
  assert.equal(adminPath.non_normal_execution, true)
})

// ── FATE test 16: rollback release without lineage is rejected or non-canonical

test('FATE #994-16: rollback entry missing rollback_from_release_id → rollback_release_lineage_missing', () => {
  const result = validateRollbackLineage({
    rollback_target_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    artifact_hash: 'hash-rollback',
    provenance_type: 'INTERNAL',
  })
  assert.equal(result.valid, false)
  assert.ok(result.failures.includes(FAILURE_CLASSES.ROLLBACK_RELEASE_LINEAGE_MISSING))
})

test('FATE #994-16b: rollback entry missing rollback_target_commit_sha → rollback_release_lineage_missing', () => {
  const result = validateRollbackLineage({
    rollback_from_release_id: 'RPROV-20260522-0001',
    artifact_hash: 'hash-rollback',
    provenance_type: 'INTERNAL',
  })
  assert.equal(result.valid, false)
  assert.ok(result.failures.includes(FAILURE_CLASSES.ROLLBACK_RELEASE_LINEAGE_MISSING))
})

test('FATE #994-16c: rollback entry missing artifact_hash → release_artifact_hash_missing', () => {
  const result = validateRollbackLineage({
    rollback_from_release_id: 'RPROV-20260522-0001',
    rollback_target_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    provenance_type: 'INTERNAL',
  })
  assert.equal(result.valid, false)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISSING))
})

test('FATE #994-16d: rollback entry missing provenance_type → release_provenance_missing', () => {
  const result = validateRollbackLineage({
    rollback_from_release_id: 'RPROV-20260522-0001',
    rollback_target_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    artifact_hash: 'hash-rollback',
  })
  assert.equal(result.valid, false)
  assert.ok(result.failures.includes(FAILURE_CLASSES.RELEASE_PROVENANCE_MISSING))
})

test('FATE #994-16e: valid rollback entry with all required lineage fields → valid', () => {
  const result = validateRollbackLineage({
    rollback_from_release_id: 'RPROV-20260522-0001',
    rollback_target_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    artifact_hash: 'hash-rollback-valid',
    provenance_type: 'INTERNAL',
  })
  assert.equal(result.valid, true)
  assert.deepEqual(result.failures, [])
})

// ── Canonical release boundary — happy path ──────────────────────────────────

test('FATE #994: full canonical boundary satisfied → CANONICAL_RELEASE_CANDIDATE', () => {
  const result = classifyReleaseTarget(CANONICAL_CANDIDATE)
  assert.equal(result.classification, CLASSIFICATIONS.CANONICAL_RELEASE_CANDIDATE)
  assert.equal(result.canonical_release_candidate, true)
  assert.deepEqual(result.failures, [])
  assert.equal(result.evidence_only, true)
  assert.equal(result.creates_authority, false)
  assert.equal(result.creates_execution, false)
})

test('FATE #994: verifyCanonicalReleaseBoundary with clean registry → CANONICAL_RELEASE_CANDIDATE', () => {
  const result = verifyCanonicalReleaseBoundary(CANONICAL_CANDIDATE, [])
  assert.equal(result.classification, CLASSIFICATIONS.CANONICAL_RELEASE_CANDIDATE)
  assert.equal(result.canonical_release_candidate, true)
  assert.equal(result.evidence_only, true)
})

// ── validateProvenanceEntry — valid entry ────────────────────────────────────

test('FATE #994: validateProvenanceEntry accepts a complete, valid, evidence-only entry', () => {
  const entry = {
    release_id: 'RPROV-20260522-VALID-001',
    release_tag: 'v1.0.0',
    source_commit_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    artifact_hash: 'abc123def456abc123def456abc123def456abc1',
    artifact_hash_alg: 'sha256',
    provenance_type: 'INTERNAL',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    canonical_release_candidate: true,
    break_glass: false,
  }
  const result = validateProvenanceEntry(entry)
  assert.equal(result.valid, true)
  assert.deepEqual(result.missing_fields, [])
  assert.deepEqual(result.violations, [])
})

// ── Non-regression: existing #382 classification layer unchanged ─────────────

test('FATE #994 non-regression: release_provenance_matrix.json (PR #993) is structurally intact', () => {
  const matrix = readJson('runtime/release_provenance_matrix.json')
  assert.equal(matrix.artifact, 'RELEASE_PROVENANCE_MATRIX')
  assert.equal(matrix.issue, '382')
  assert.ok(matrix.provenance_paths.length >= 20)
  assert.ok(matrix.governance_invariants.length >= 10)
  assert.equal(matrix.summary.canonical_release_paths_currently_satisfiable, 0)
})

test('FATE #994 non-regression: no provenance path in PR #993 matrix claims creates_authority=true for non-BREAK_GLASS paths', () => {
  const matrix = readJson('runtime/release_provenance_matrix.json')
  const nonBg = matrix.provenance_paths.filter((p) => p.classification !== 'BREAK_GLASS')
  for (const path of nonBg) {
    assert.equal(path.creates_authority, false, `${path.path_id} must not claim creates_authority=true`)
  }
})

test('FATE #994 non-regression: existing tests/fate/issue-382-release-provenance-attestation.test.mjs is present', () => {
  assert.ok(
    existsSync(join(root, 'tests/fate/issue-382-release-provenance-attestation.test.mjs')),
    'PR #993 FATE test file must remain present — non-regression',
  )
})
