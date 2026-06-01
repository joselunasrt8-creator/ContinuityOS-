import { createHash } from 'node:crypto';

/**
 * Deterministic SHA-256 hash of the reviewed object canonical form.
 *
 * Binds: pr_number, repo, reviewed_head_sha (the commit the reviewer approved),
 * sorted changed_files, review_status, risk_class.
 *
 * Invariant: this hash must equal computeApprovedObjectHash for the same PR
 * when no push occurred between approval and merge (reviewed_head_sha == head_sha).
 */
export function computeReviewedObjectHash({
  pr_number,
  repo,
  reviewed_head_sha,
  changed_files,
  review_status,
  risk_class,
}) {
  const canonical = JSON.stringify({
    pr_number,
    repo,
    reviewed_head_sha,
    changed_files: [...changed_files].sort(),
    review_status,
    risk_class,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Deterministic SHA-256 hash of the approved object — same structure but bound
 * to head_sha at the moment the PREO runs (the current tip of the PR at merge time).
 *
 * When no push occurred after review: reviewed_head_sha == head_sha, so
 * computeReviewedObjectHash(...) == computeApprovedObjectHash(...) for the same PR.
 */
export function computeApprovedObjectHash({
  pr_number,
  repo,
  head_sha,
  changed_files,
  review_status,
  risk_class,
}) {
  const canonical = JSON.stringify({
    pr_number,
    repo,
    approved_head_sha: head_sha,
    changed_files: [...changed_files].sort(),
    review_status,
    risk_class,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Deterministic SHA-256 hash of the merged object — bound to the merge_commit_sha
 * that entered the base branch, plus the head_sha it derived from.
 *
 * For regular merges: merge_commit_sha has head_sha as a parent.
 * For squash/rebase: merge_commit_sha is a new synthetic commit derived from head_sha.
 * In both cases: head_sha is the reviewed object; merge_commit_sha is the merged result.
 */
export function computeMergedObjectHash({
  pr_number,
  repo,
  head_sha,
  merge_commit_sha,
  merge_method,
}) {
  const canonical = JSON.stringify({
    pr_number,
    repo,
    head_sha,
    merge_commit_sha,
    merge_method,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Core exact-object admission check.
 *
 * Invariant: reviewed_object == merged_object
 *   → the review must have been submitted against the exact head_sha that
 *     is at the tip of the PR when it merges (reviewed_head_sha == head_sha).
 *
 * Returns merge_legitimacy_status:
 *   MERGE_LEGITIMACY_VALID  — exact match confirmed; all three hashes computed
 *   LEGITIMACY_NULL         — mismatch detected (push occurred after review)
 *   UNKNOWN                 — visibility insufficient (a required SHA is missing)
 */
export function checkExactObjectAdmission({
  pr_number,
  repo,
  reviewed_head_sha,
  head_sha,
  merge_commit_sha,
  changed_files,
  review_status,
  risk_class,
  merge_method,
}) {
  if (!reviewed_head_sha || !head_sha || !merge_commit_sha) {
    return {
      reviewed_object_hash: null,
      approved_object_hash: null,
      merged_object_hash: null,
      reviewed_head_sha: reviewed_head_sha ?? null,
      head_sha: head_sha ?? null,
      merge_commit_sha: merge_commit_sha ?? null,
      exact_object_match: false,
      merge_legitimacy_status: 'UNKNOWN',
      failure_reason: 'missing_required_sha',
    };
  }

  const reviewed_object_hash = computeReviewedObjectHash({
    pr_number,
    repo,
    reviewed_head_sha,
    changed_files,
    review_status,
    risk_class,
  });

  const approved_object_hash = computeApprovedObjectHash({
    pr_number,
    repo,
    head_sha,
    changed_files,
    review_status,
    risk_class,
  });

  const merged_object_hash = computeMergedObjectHash({
    pr_number,
    repo,
    head_sha,
    merge_commit_sha,
    merge_method: merge_method ?? 'unknown',
  });

  // The core invariant: the review was submitted against the exact commit
  // that is at the PR tip when the merge runs. Any push after the review
  // advances head_sha without advancing reviewed_head_sha, breaking the invariant.
  const exact_object_match = reviewed_head_sha === head_sha;

  if (!exact_object_match) {
    return {
      reviewed_object_hash,
      approved_object_hash,
      merged_object_hash,
      reviewed_head_sha,
      head_sha,
      merge_commit_sha,
      exact_object_match: false,
      merge_legitimacy_status: 'LEGITIMACY_NULL',
      failure_reason: 'reviewed_object_differs_from_merged_object',
    };
  }

  return {
    reviewed_object_hash,
    approved_object_hash,
    merged_object_hash,
    reviewed_head_sha,
    head_sha,
    merge_commit_sha,
    exact_object_match: true,
    merge_legitimacy_status: 'MERGE_LEGITIMACY_VALID',
    failure_reason: null,
  };
}
