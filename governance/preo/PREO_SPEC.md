# PREO Specification

PREO = Pull Request Review Evidence Object.

Purpose:
Convert PR review evidence into machine-readable merge legitimacy evidence.

Status:
Non-operative governance artifact.

Required evidence:
- pull_request_id
- branch
- commit_sha
- changed_files
- reviewer_state
- status_checks
- test_result
- validation_result
- approval_state
- merge_eligibility

Invariant:
No merge legitimacy without review evidence.
