/**
 * Deterministic release provenance verification script.
 * Issue #994 — RELEASE_PROVENANCE_ENFORCEMENT_V1
 *
 * Evidence only — no runtime route changes, no authority creation,
 * no deployment capability expansion, no proof behavior changes.
 *
 * Exports pure functions for classifying release targets, detecting replay
 * attempts, validating release notes, and verifying rollback lineage.
 * All functions return classification results without side effects.
 */

export const FAILURE_CLASSES = {
  RELEASE_TARGET_NOT_ON_MAIN: 'release_target_not_on_main',
  RELEASE_TARGET_MISSING_PR_PROVENANCE: 'release_target_missing_pr_provenance',
  RELEASE_STATUS_CHECKS_MISSING: 'release_status_checks_missing',
  RELEASE_TAG_ALREADY_EXISTS: 'release_tag_already_exists',
  RELEASE_TAG_OVERWRITE_ATTEMPT: 'release_tag_overwrite_attempt',
  RELEASE_NOTES_MISSING_EVIDENCE: 'release_notes_missing_evidence',
  RELEASE_ARTIFACT_HASH_MISSING: 'release_artifact_hash_missing',
  RELEASE_ARTIFACT_HASH_MISMATCH: 'release_artifact_hash_mismatch',
  RELEASE_PROVENANCE_MISSING: 'release_provenance_missing',
  RELEASE_PROVENANCE_REPLAY: 'release_provenance_replay',
  RELEASE_ATTESTATION_MISMATCH: 'release_attestation_mismatch',
  RELEASE_ADMIN_BREAK_GLASS: 'release_admin_break_glass',
  ROLLBACK_RELEASE_LINEAGE_MISSING: 'rollback_release_lineage_missing',
}

export const CLASSIFICATIONS = {
  CANONICAL_RELEASE_CANDIDATE: 'CANONICAL_RELEASE_CANDIDATE',
  NON_CANONICAL_RELEASE: 'NON_CANONICAL_RELEASE',
  BREAK_GLASS: 'BREAK_GLASS',
  NULL: 'NULL',
}

const VALID_PROVENANCE_TYPES = new Set(['DSSE', 'SLSA', 'INTERNAL', 'PENDING_EXTERNAL'])
const VALID_HASH_ALGS = new Set(['sha256', 'sha384', 'sha512'])

/**
 * Classifies a release candidate against the canonical release boundary.
 *
 * Canonical boundary (all steps required for CANONICAL_RELEASE_CANDIDATE):
 *   PR-reviewed commit → required status checks → canonical main commit
 *   → governed release tag → release notes with evidence
 *   → provenance/attestation reference → immutable artifact identity
 *
 * Returns classification, failure codes, and evidence-only invariants.
 * Never creates authority, proof, or execution capability.
 *
 * @param {object} candidate
 * @param {boolean} candidate.reachable_from_main
 * @param {boolean} [candidate.feature_branch_only]
 * @param {boolean} candidate.has_pr_provenance
 * @param {number|null} [candidate.pr_number]
 * @param {boolean} candidate.status_checks_passed
 * @param {boolean} [candidate.tag_already_exists]
 * @param {boolean} [candidate.tag_overwrite_attempt]
 * @param {boolean} candidate.release_notes_have_evidence
 * @param {string} [candidate.artifact_hash]
 * @param {string} [candidate.provenance_type]
 * @param {boolean} [candidate.is_break_glass]
 * @returns {{ classification: string, failures: string[], canonical_release_candidate: boolean, evidence_only: true, creates_authority: false, creates_execution: false }}
 */
export function classifyReleaseTarget(candidate) {
  const failures = []

  if (!candidate.reachable_from_main) {
    failures.push(FAILURE_CLASSES.RELEASE_TARGET_NOT_ON_MAIN)
  }

  if (candidate.feature_branch_only) {
    if (!failures.includes(FAILURE_CLASSES.RELEASE_TARGET_NOT_ON_MAIN)) {
      failures.push(FAILURE_CLASSES.RELEASE_TARGET_NOT_ON_MAIN)
    }
  }

  if (!candidate.has_pr_provenance || candidate.pr_number === null || candidate.pr_number === undefined) {
    failures.push(FAILURE_CLASSES.RELEASE_TARGET_MISSING_PR_PROVENANCE)
  }

  if (!candidate.status_checks_passed) {
    failures.push(FAILURE_CLASSES.RELEASE_STATUS_CHECKS_MISSING)
  }

  if (candidate.tag_already_exists) {
    failures.push(FAILURE_CLASSES.RELEASE_TAG_ALREADY_EXISTS)
  }

  if (candidate.tag_overwrite_attempt) {
    if (!failures.includes(FAILURE_CLASSES.RELEASE_TAG_OVERWRITE_ATTEMPT)) {
      failures.push(FAILURE_CLASSES.RELEASE_TAG_OVERWRITE_ATTEMPT)
    }
  }

  if (!candidate.release_notes_have_evidence) {
    failures.push(FAILURE_CLASSES.RELEASE_NOTES_MISSING_EVIDENCE)
  }

  if (!candidate.artifact_hash || candidate.artifact_hash.length === 0) {
    failures.push(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISSING)
  }

  if (!candidate.provenance_type || !VALID_PROVENANCE_TYPES.has(candidate.provenance_type)) {
    failures.push(FAILURE_CLASSES.RELEASE_PROVENANCE_MISSING)
  }

  const base = { evidence_only: true, creates_authority: false, creates_execution: false }

  if (candidate.is_break_glass) {
    return {
      ...base,
      classification: CLASSIFICATIONS.BREAK_GLASS,
      failures: [FAILURE_CLASSES.RELEASE_ADMIN_BREAK_GLASS, ...failures],
      canonical_release_candidate: false,
    }
  }

  if (failures.length > 0) {
    return {
      ...base,
      classification: CLASSIFICATIONS.NON_CANONICAL_RELEASE,
      failures,
      canonical_release_candidate: false,
    }
  }

  return {
    ...base,
    classification: CLASSIFICATIONS.CANONICAL_RELEASE_CANDIDATE,
    failures: [],
    canonical_release_candidate: true,
  }
}

/**
 * Detects replay attempts against existing registry entries.
 *
 * Replay rules enforced:
 *   RPR-001: same tag → different commit → release_tag_overwrite_attempt
 *   RPR-002: same tag → different artifact hash → release_artifact_hash_mismatch
 *   RPR-003: same commit + same tag → different artifact hash → release_artifact_hash_mismatch
 *   RPR-004: same release_id reused → release_provenance_replay
 *   RPR-005: same preo_reference + same tag → different artifact hash → release_attestation_mismatch
 *
 * @param {object[]} registryEntries
 * @param {object} newEntry
 * @returns {string[]} failure codes — empty if no replay detected
 */
export function detectReplayAttempt(registryEntries, newEntry) {
  const failures = []
  const seen = new Set()

  for (const existing of registryEntries) {
    if (existing.release_id === newEntry.release_id) {
      if (!seen.has(FAILURE_CLASSES.RELEASE_PROVENANCE_REPLAY)) {
        failures.push(FAILURE_CLASSES.RELEASE_PROVENANCE_REPLAY)
        seen.add(FAILURE_CLASSES.RELEASE_PROVENANCE_REPLAY)
      }
    }

    if (existing.release_tag === newEntry.release_tag) {
      if (existing.source_commit_sha !== newEntry.source_commit_sha) {
        if (!seen.has(FAILURE_CLASSES.RELEASE_TAG_OVERWRITE_ATTEMPT)) {
          failures.push(FAILURE_CLASSES.RELEASE_TAG_OVERWRITE_ATTEMPT)
          seen.add(FAILURE_CLASSES.RELEASE_TAG_OVERWRITE_ATTEMPT)
        }
      }

      if (existing.artifact_hash !== newEntry.artifact_hash) {
        if (!seen.has(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISMATCH)) {
          failures.push(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISMATCH)
          seen.add(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISMATCH)
        }
      }

      if (
        existing.preo_reference &&
        newEntry.preo_reference &&
        existing.preo_reference === newEntry.preo_reference &&
        existing.artifact_hash !== newEntry.artifact_hash
      ) {
        if (!seen.has(FAILURE_CLASSES.RELEASE_ATTESTATION_MISMATCH)) {
          failures.push(FAILURE_CLASSES.RELEASE_ATTESTATION_MISMATCH)
          seen.add(FAILURE_CLASSES.RELEASE_ATTESTATION_MISMATCH)
        }
      }
    }

    if (
      existing.source_commit_sha === newEntry.source_commit_sha &&
      existing.release_tag === newEntry.release_tag &&
      existing.artifact_hash !== newEntry.artifact_hash
    ) {
      if (!seen.has(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISMATCH)) {
        failures.push(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISMATCH)
        seen.add(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISMATCH)
      }
    }
  }

  return failures
}

/**
 * Validates release notes include required evidence references.
 *
 * Required references: release tag, source commit SHA (first 12 chars),
 * PR number, and at least one of: provenance, attestation, artifact hash, sha256.
 *
 * Release notes are documentation only — not proof. Passing validation
 * does not create authority or proof. Evidence binding makes notes traceable.
 *
 * @param {string} notes
 * @param {string} releaseTag
 * @param {string} commitSha
 * @param {number|string} prNumber
 * @returns {{ valid: boolean, missing_fields: string[], failure_class: string|null }}
 */
export function validateReleaseNotes(notes, releaseTag, commitSha, prNumber) {
  const missing = []

  if (!notes.includes(releaseTag)) missing.push('release_tag')
  if (!notes.includes(commitSha.substring(0, 12))) missing.push('source_commit_sha')
  if (!notes.includes(String(prNumber))) missing.push('pr_number')
  if (!/provenance|attestation|artifact.hash|sha256|sha-256/i.test(notes)) {
    missing.push('provenance_or_artifact_hash_reference')
  }

  return {
    valid: missing.length === 0,
    missing_fields: missing,
    failure_class: missing.length > 0 ? FAILURE_CLASSES.RELEASE_NOTES_MISSING_EVIDENCE : null,
  }
}

/**
 * Validates a rollback release entry has required lineage references.
 *
 * Rollback releases must preserve full provenance requirements and
 * reference the prior canonical release and target commit.
 *
 * @param {object} rollbackEntry
 * @param {string} [rollbackEntry.rollback_from_release_id]
 * @param {string} [rollbackEntry.rollback_target_commit_sha]
 * @param {string} [rollbackEntry.artifact_hash]
 * @param {string} [rollbackEntry.provenance_type]
 * @returns {{ valid: boolean, failures: string[] }}
 */
export function validateRollbackLineage(rollbackEntry) {
  const failures = []

  if (!rollbackEntry.rollback_from_release_id || rollbackEntry.rollback_from_release_id.length === 0) {
    failures.push(FAILURE_CLASSES.ROLLBACK_RELEASE_LINEAGE_MISSING)
  }

  if (!rollbackEntry.rollback_target_commit_sha || rollbackEntry.rollback_target_commit_sha.length === 0) {
    failures.push(FAILURE_CLASSES.ROLLBACK_RELEASE_LINEAGE_MISSING)
  }

  if (!rollbackEntry.artifact_hash || rollbackEntry.artifact_hash.length === 0) {
    failures.push(FAILURE_CLASSES.RELEASE_ARTIFACT_HASH_MISSING)
  }

  if (!rollbackEntry.provenance_type || !VALID_PROVENANCE_TYPES.has(rollbackEntry.provenance_type)) {
    failures.push(FAILURE_CLASSES.RELEASE_PROVENANCE_MISSING)
  }

  return {
    valid: failures.length === 0,
    failures: [...new Set(failures)],
  }
}

/**
 * Validates a release provenance registry entry against the required schema.
 * Enforces evidence-only invariants.
 *
 * @param {object} entry
 * @returns {{ valid: boolean, missing_fields: string[], violations: string[] }}
 */
export function validateProvenanceEntry(entry) {
  const REQUIRED_FIELDS = [
    'release_id',
    'release_tag',
    'source_commit_sha',
    'artifact_hash',
    'artifact_hash_alg',
    'provenance_type',
    'evidence_only',
    'creates_authority',
    'creates_execution',
    'canonical_release_candidate',
  ]

  const missing = REQUIRED_FIELDS.filter(
    (f) => entry[f] === undefined || entry[f] === null || entry[f] === '',
  )

  const violations = []

  if (entry.evidence_only !== true) {
    violations.push('evidence_only must be true')
  }
  if (entry.creates_authority !== false) {
    violations.push('creates_authority must be false')
  }
  if (entry.creates_execution !== false) {
    violations.push('creates_execution must be false')
  }

  if (entry.break_glass === true && entry.canonical_release_candidate === true) {
    violations.push('BREAK_GLASS entry cannot have canonical_release_candidate=true')
  }

  if (entry.artifact_hash_alg && !VALID_HASH_ALGS.has(entry.artifact_hash_alg)) {
    violations.push(`artifact_hash_alg "${entry.artifact_hash_alg}" is not sha256 or stronger`)
  }

  if (entry.provenance_type && !VALID_PROVENANCE_TYPES.has(entry.provenance_type)) {
    violations.push(`provenance_type "${entry.provenance_type}" must be one of DSSE|SLSA|INTERNAL|PENDING_EXTERNAL`)
  }

  return {
    valid: missing.length === 0 && violations.length === 0,
    missing_fields: missing,
    violations,
  }
}

/**
 * Verifies the full canonical release boundary for a candidate.
 *
 * Returns a deterministic classification object. The returned object
 * is evidence-only: it does not create authority, proof, or execution
 * capability. It does not create a GitHub release. It does not push tags.
 *
 * @param {object} candidate - release candidate fields
 * @param {object[]} registryEntries - existing provenance registry entries
 * @returns {{ classification: string, failures: string[], canonical_release_candidate: boolean, evidence_only: true, creates_authority: false, creates_execution: false }}
 */
export function verifyCanonicalReleaseBoundary(candidate, registryEntries = []) {
  const classificationResult = classifyReleaseTarget(candidate)

  if (classificationResult.classification === CLASSIFICATIONS.BREAK_GLASS) {
    return classificationResult
  }

  const replayFailures = detectReplayAttempt(registryEntries, {
    release_id: candidate.release_id,
    release_tag: candidate.release_tag,
    source_commit_sha: candidate.source_commit_sha,
    artifact_hash: candidate.artifact_hash,
    preo_reference: candidate.preo_reference,
  })

  if (replayFailures.length > 0) {
    return {
      classification: CLASSIFICATIONS.NON_CANONICAL_RELEASE,
      failures: [...classificationResult.failures, ...replayFailures],
      canonical_release_candidate: false,
      evidence_only: true,
      creates_authority: false,
      creates_execution: false,
    }
  }

  return classificationResult
}
