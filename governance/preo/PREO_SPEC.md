# PREO Specification

PREO = Pull Request Review Evidence Object.

Purpose:
Convert PR review evidence into machine-readable merge legitimacy evidence.

Status:
Non-operative governance artifact.

Canonical field names:
- pull_request_id
- repository
- branch
- base_branch
- commit_sha
- changed_files
- author_identity
- reviewer_identities
- approval_state
- review_state
- status_checks
- workflow_results
- validation_result
- merge_eligibility
- validated_at

Required evidence:
- pull_request_id
- repository
- branch
- base_branch
- commit_sha
- changed_files
- author_identity
- reviewer_identities
- approval_state
- review_state
- status_checks
- workflow_results
- validation_result
- merge_eligibility
- validated_at

Canonicalization:
PREO hashing uses deterministic JSON canonicalization. Implementations MUST compute the canonical PREO hash using RFC 8785 JSON Canonicalization Scheme (JCS) semantics over the exact PREO object, except that `validation_result.validated_object_hash` MUST be excluded before canonicalization.

canonical_preo_hash =
SHA-256(
  canonical_json(
    PREO object excluding validation_result.validated_object_hash
  )
)

The `validation_result.validated_object_hash` field records the resulting `sha256:<hex>` value and MUST NOT participate in canonical PREO hash generation. This preserves exact-object discipline without recursive hash ambiguity.

Invariant:
No merge legitimacy without review evidence.

Fail-closed behavior:
Any PREO that does not conform exactly to `PREO.schema.json`, including any additional property or invalid canonical hash, is NULL / blocked.

Replay protection:
The canonical PREO hash binds the pull request, repository, branch, base branch, commit SHA, changed files, identities, review state, status checks, workflow results, validation result metadata and errors, merge eligibility, and validation timestamp. Reuse against materially different review evidence must produce a different canonical PREO hash and must not be accepted as the same evidence object.
