# Lab 4 — Block Invalid Mutation in CI

**Module:** 4  
**Estimated time:** 25 minutes  
**Prerequisites:** GitHub repository with Actions enabled; Lab 3 complete

---

## Goal

Trigger the governed deploy workflow without the required legitimacy inputs and observe that the CI job fails immediately with a NULL signal — before any deployment code runs.

---

## Background

The governed deploy workflow fails closed: if `decision_id`, `validated_object_hash`, or `invocation_nonce` are missing or empty, the first step exits with `exit 1` before any deployment step is reached.

This is the CI surface equivalent of the `NULL` result you observed in Lab 3.

---

## Steps

### Step 1 — Fork the repository

If you have not already forked this repository, do so now. All steps below run in your fork.

### Step 2 — Add required secrets

In your fork's Settings → Secrets and variables → Actions, add:

| Secret name | Value |
|-------------|-------|
| `MINDSHIFT_WORKER_URL` | URL of your deployed runtime (or `http://placeholder` for this lab) |
| `MINDSHIFT_API_KEY` | Your API key (or `placeholder-key` for this lab) |

For this lab, placeholder values are sufficient — we are testing the fail-closed behavior, not a real deploy.

### Step 3 — Trigger the workflow without inputs

In your fork, navigate to Actions → governed-deploy → Run workflow.

**Do not fill in any inputs.** Leave `decision_id`, `validated_object_hash`, and `invocation_nonce` empty.

Click **Run workflow**.

### Step 4 — Observe the failure

Open the running workflow job. The first step should fail immediately with:

```
NULL — Missing required variable: DECISION_ID
```

The job status should be: **failed**.

No deployment step should have run.

### Step 5 — Trigger with one missing input

Run the workflow again. Fill in `decision_id` with any string, but leave `validated_object_hash` empty.

**Expected:** workflow fails with `NULL — Missing required variable: VALIDATED_OBJECT_HASH`.

### Step 6 — Trigger with a fake but complete set of inputs

Run the workflow with:
- `decision_id`: any UUID
- `validated_object_hash`: any 64-character hex string
- `invocation_nonce`: any UUID

**Expected:** the workflow gets past the input check step but fails at the legitimacy runtime call — because no real AEO exists with those inputs. The runtime returns NULL and the workflow fails.

---

## Expected Results

| Scenario | Expected behavior |
|----------|------------------|
| Empty inputs | Fails at step 1 with NULL signal |
| One missing input | Fails at step 1 with NULL signal for that input |
| Fake but complete inputs | Gets past step 1; fails at legitimacy runtime call |

---

## What You Proved

A CI pipeline that enforces this pattern cannot be triggered into executing a deployment by simply providing credentials. It requires a real `decision_id` referencing a real authority, a real `validated_object_hash` matching a compiled AEO, and a real unused `invocation_nonce`.

The CI surface fails closed.

---

## Next

[Lab 5 — Add governed deploy to your own repo fork](lab-5.md)
