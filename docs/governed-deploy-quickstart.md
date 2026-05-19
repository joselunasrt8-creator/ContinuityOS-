# Governed Deploy Quickstart (Install-Base Wedge)

This quickstart makes governed deploy the default developer workflow by treating install base as a workflow dependency:

**developer wants to deploy**
→ **/authority**
→ **/compile exact AEO**
→ **/validate**
→ **/execute through boundary**
→ **/proof persists**

If no valid object exists, nothing happens.

---

## Why this is the default path

Governed deploy is the only operational path that preserves:

- exact-object discipline (`validated_object == executed_object`)
- fail-closed behavior (`NULL` blocks execution)
- replay protection (single-use invocation/authority semantics)
- proof persistence (append-only deployment lineage)

`npm run deploy` is intentionally blocked as a convenience guard; governed deploy is enforced by runtime boundary checks, validation, replay controls, and proof requirements.

---

## Canonical sequence (developer runbook)

Use the runtime in this exact order for any deployment-capable mutation:

1. **Authority** — `POST /authority`
   - obtain bounded authority for the deploy decision
2. **Compile** — `POST /compile`
   - compile deterministic canonical AEO
   - capture `decision_id` + `validated_object_hash`
3. **Validate** — `POST /validate`
   - must return `status="VALID"` and `result="VALID"`
4. **Execute** — `POST /execute`
   - executes only through governed boundary
   - governed production workflow target is `governed-deploy.yml`
5. **Proof** — `POST /proof`
   - persists proof tied to the execution lineage

Do not reorder these steps. Do not skip steps.

---

## VALID path vs NULL path

### VALID path

A deploy proceeds only when validation is explicitly successful:

- `POST /validate` returns `VALID | VALID`
- `validated_object_hash` from compile is unchanged
- authority, session, continuity, and invocation lineage checks hold
- execution is admitted at boundary
- proof is persisted

### NULL path (fail-closed)

Any invalid condition yields `status="NULL"` and blocks state change, including (non-exhaustive):

- invalid authority/session/continuity
- hash mismatch between compiled and provided object
- replay indicators (nonce/authority/proof reuse)
- lineage mismatch between authority/validation/execution/proof
- revoked continuity

`NULL` is the expected safety outcome for ambiguous, stale, or replayed requests.

---

## Proof lookup

After successful `POST /proof`, lookup uses stable lineage keys:

- `proof_id` (canonical proof record id)
- `decision_id`
- `execution_id`
- `validated_object_hash`
- `decision_hash` (canonical uniqueness anchor)

Operationally, this means a developer can verify deploy legitimacy by checking proof lineage, not by trusting an external deploy side effect.

---

## Replay behavior (what developers should expect)

Replay attempts are blocked. Typical outcomes:

- reused invocation nonce → blocked
- reused authority after consumption → blocked
- duplicate/ambiguous proof lineage → blocked (`NULL`)
- duplicate proof creation for same decision hash → blocked

Replay rejection is part of normal operation, not an outage.

---

## Why direct deploy is not the governed path

Direct deploy shortcuts (CLI-first deploys, raw workflow dispatches, or ad-hoc mutation paths) are not governed because they can bypass one or more required controls:

- authority binding
- exact-object compile/validate equivalence
- replay checks
- proof persistence

MindShift deploy legitimacy requires the full `/authority → /compile → /validate → /execute → /proof` chain. Anything else is non-governed and should be treated as blocked/invalid for production mutation.

---

## Install-base wedge checklist

Use this as the repeatable default for every developer deploy request:

- [ ] I requested authority before compiling.
- [ ] I compiled canonical AEO and recorded `validated_object_hash`.
- [ ] Validation returned `VALID | VALID`.
- [ ] Execution occurred only via `/execute` governed boundary.
- [ ] Proof persisted via `/proof` and is queryable by lineage keys.
- [ ] Any replay-like retry returned `NULL` (expected fail-closed behavior).
