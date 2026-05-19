# Governed Deploy Quickstart (Install-Base Wedge)

This quickstart makes governed deploy the default developer workflow for install base:

**developer wants to deploy**
→ **/authority**
→ **/compile exact AEO**
→ **/validate**
→ **/execute through boundary**
→ **/proof persists**

If no valid object exists, nothing happens.

---

## Scope and invariants

This runbook does **not** add new deploy paths or authority semantics.
It uses the existing canonical runtime path only:

`/authority → /compile → /validate → /execute → /proof`

Preserved invariants:

- exact object discipline (`validated_object == executed_object`)
- fail-closed behavior (`NULL` blocks execution)
- replay resistance (single-use authority/invocation semantics)
- proof persistence (append-only lineage evidence)

---

## Canonical developer workflow (repeatable)

Use this sequence for any deploy-capable mutation.

1. **Request authority**: `POST /authority`
2. **Compile deterministic AEO**: `POST /compile`
   - record `decision_id`
   - record `validated_object_hash`
3. **Validate exact object**: `POST /validate`
   - must return `status="VALID"` and `result="VALID"`
4. **Execute via boundary**: `POST /execute`
   - production target remains `governed-deploy.yml`
5. **Persist proof**: `POST /proof`
   - proof anchors execution and object lineage

Do not reorder or skip steps.

---

## VALID path vs NULL path

### VALID path (expected success)

A governed deploy proceeds only if:

- authority/session/continuity checks pass
- compile output hash remains unchanged through validation/execution
- validation returns `VALID | VALID`
- execution is admitted through `/execute`
- proof persistence succeeds

### NULL path (expected fail-closed safety)

Runtime returns `status="NULL"` (and blocks mutation) when any guard fails, including:

- missing/expired/revoked authority or broken lineage
- `validated_object_hash` mismatch
- replay signal (reused nonce, reused consumed authority, duplicate lineage)
- execution attempt without prior `VALID`
- proof write that is orphaned or inconsistent with execution lineage

`NULL` is the correct safety outcome for ambiguity, staleness, replay, and bypass attempts.

---

## Proof lookup (operational verification)

After `POST /proof` succeeds, verify deploy legitimacy using persisted lineage keys:

- `proof_id`
- `execution_id`
- `decision_id`
- `validated_object_hash`
- `decision_hash`

Proof lookup confirms that the executed deploy came from the exact validated object and canonical path.

---

## Replay behavior (developer expectations)

Replay protection is active by design:

- replaying consumed authority is rejected
- replaying invocation nonce is rejected
- replaying identical execution lineage is rejected
- duplicate or ambiguous proof lineage is rejected

Expected outcome for replay attempts: `NULL` / blocked execution.

---

## Why direct deploy is not governed deploy

Direct deploy paths (for example ad-hoc CLI deploy, raw dispatch, or mutation outside the canonical runtime sequence) are not governed because they can skip one or more required controls:

- no bounded `/authority`
- no exact `/compile` object anchoring
- no strict `/validate` gate
- no canonical `/execute` boundary admission
- no guaranteed `/proof` persistence

`npm run deploy` remains blocked as a convenience guard, while the true lock is runtime governance enforcement.

---

## Install-base wedge checklist

Use this checklist on every deploy request:

- [ ] Authority issued via `/authority`.
- [ ] AEO compiled via `/compile` and `validated_object_hash` recorded.
- [ ] Validation returned `VALID | VALID`.
- [ ] Execution occurred only through `/execute` boundary.
- [ ] Proof persisted via `/proof` and is queryable by lineage keys.
- [ ] Replay-like retries returned `NULL` (expected fail-closed behavior).
