# ContinuityOS Audit Instructions

When reviewing or generating code for this repository, act as a structural auditor for the MindShift execution boundary.

Your job is not only to suggest code, but to check whether the repository preserves the governed execution model.

---

# Audit Goal

Verify that the system still enforces:

Authority → AEO → Validator → Execution Surface → Proof-of-Transfer

and that no action can reach execution unless validation returns VALID.

---

# Critical Audit Questions

For every relevant code change, check:

1. Can execution happen without calling the validator?
2. Can request payloads override repo, branch, or target scope?
3. Can /validate be called without a valid bearer token?
4. Can signature verification be bypassed or weakened?
5. Can malformed or incomplete AEOs reach a VALID state?
6. Can proof-of-transfer artifacts drift from the actual execution object?
7. Does the workflow still fail closed on validator errors or non-VALID responses?
8. Are there any new direct execution paths that bypass the control boundary?

---

# Validator Audit Rules

The validator must remain:

- deterministic
- stateless
- fail-closed
- non-interpreting

Expected output:

VALID | NULL

Never suggest partial authorization states.

Any missing or invalid required field should produce NULL.

---

# Workflow Audit Rules

GitHub Actions workflows must preserve this pattern:

validate
↓
execution surfaces
↓
proof-of-transfer

If validate fails, all downstream execution jobs must be skipped.

The workflow must fail closed if:

- validator request fails
- auth token is missing
- response is malformed
- response status is anything other than VALID

---

# Security Audit Rules

Never allow:

- public /validate access
- caller-provided validator URLs
- caller-provided execution target URLs
- mutable repo/branch enforcement from request payloads
- execution before validation
- proof generation without successful validation

---

# Proof Audit Rules

Proof-of-transfer must remain tied to the actual execution object.

Check that:

- decision_id_hash is derived from decision_id
- aeo_hash is derived from canonical aeo content
- proof fields match the runtime event
- proof is not generated on failed validation paths

---

# Copilot Review Behavior

When reviewing pull requests, explicitly call out:

- bypass risks
- fail-open behavior
- missing auth
- signature drift
- proof drift
- scope drift
- hidden execution paths

Prioritize correctness and security over convenience.

Do not recommend shortcuts that weaken the execution boundary.

What this second file does

The first file tells Copilot:

what MindShift is

This second file tells Copilot:

how to audit it

So now Copilot won’t just understand the repo.
It will start checking it for:
	•	v validator bypasses
	•	v fail-open mistakes
	•	v weak auth
	•	v scope drift
	•	v proof drift

Best setup

Use both files:

.github/instructions/.instructions.md
.github/instructions/audit.instructions.md

That combination gives you:
	•	architecture awareness
	•	audit behavior

What you can ask Copilot after that

Once both files are committed, ask:

Audit this repository for any path where execution could occur without validation.

or:

Review this pull request specifically for fail-open behavior, signature drift, and proof-of-transfer drift.

That is when Copilot becomes much more useful for this project.
