# Module 4 — Governed CI/CD Surface

**Duration:** ~1.5 hours  
**Lab:** [L4 — Block invalid mutation in CI](labs/lab-4.md), [L5 — Add governed deploy to your own repo fork](labs/lab-5.md)  
**Assignment:** Add `governed-deploy.yml` to a public fork and link the PR.

---

## Learning Objectives

By the end of this module you will be able to:

1. Explain why `proof_required: true` is a hard gate, not a hint
2. Describe the role of `invocation_nonce` in preventing replay
3. Explain `validated_object_hash` and why it must match the compiled AEO
4. Read a governed deploy workflow and identify each legitimacy check
5. Describe what happens when the workflow runs without required inputs

---

## 4.1 The Problem with Raw Deploy Workflows

A standard GitHub Actions deploy workflow looks like this:

```yaml
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: wrangler deploy
```

This workflow:
- Runs on every push to `main`
- Has no legitimacy check
- Cannot distinguish an authorized deploy from an automated one
- Produces no proof
- Cannot be audited for legitimacy after the fact

**The problem:** the CI/CD pipeline is the most powerful mutation surface in your repo. It deploys code to production. If anything can trigger it, anything can change production.

ContinuityOS replaces this with a governed surface that refuses to execute without a valid legitimacy object.

---

## 4.2 The Governed Deploy Workflow

**Code reference:** [`.github/workflows/governed-deploy.yml`](../../.github/workflows/governed-deploy.yml)

The governed deploy workflow requires three inputs before it will run:

```yaml
on:
  workflow_dispatch:
    inputs:
      decision_id:
        required: true
        type: string
      validated_object_hash:
        required: true
        type: string
      invocation_nonce:
        required: true
        type: string
```

**`decision_id`** — the unique identifier of the decision that granted authority for this deploy. Without a `decision_id`, there is no authority binding. Execution is NULL.

**`validated_object_hash`** — the SHA-256 hash of the canonical AEO that was validated. The workflow checks that the AEO being executed at run time matches this hash exactly. Any mutation → hash mismatch → NULL.

**`invocation_nonce`** — a single-use UUID that prevents replay. Once a nonce is consumed, it cannot be used again. Any attempt to re-run the workflow with the same nonce → NULL.

---

## 4.3 workflow_dispatch Only

The workflow listens only to `workflow_dispatch`:

```yaml
on:
  workflow_dispatch:
```

This means:
- It cannot be triggered by a push
- It cannot be triggered by a pull request
- It cannot be triggered by a schedule
- It can only be triggered by an explicit invocation from an authorized source

The first step of the workflow enforces this:

```bash
if [ "${{ github.event_name }}" != "workflow_dispatch" ]; then
  echo "NULL — Only explicit invocation allowed"
  exit 1
fi
```

If somehow the event is not `workflow_dispatch`, the workflow exits with a hard fail immediately.

---

## 4.4 Hard Fail on Missing Inputs

The first job step checks every required input and secret:

```bash
for var in DECISION_ID VALIDATED_OBJECT_HASH INVOCATION_NONCE WORKER_URL API_KEY; do
  if [ -z "${!var:-}" ]; then
    echo "NULL — Missing required variable: $var"
    exit 1
  fi
done
```

If any required value is missing or empty:
- The step fails with `exit 1`
- GitHub Actions marks the entire job as failed
- No deployment code runs
- No state changes

This is the **fail-closed default** applied to CI/CD. The workflow that fails open is a vulnerability. The workflow that fails closed is a governed surface.

---

## 4.5 Canonical Workflow Binding

The workflow checks that it was invoked through the correct entry point:

```bash
case "$CALLER_WORKFLOW_REF" in
  */.github/workflows/governed-deploy.yml@*) ;;
  *)
    echo "NULL — Workflow dispatch must enter through governed-deploy.yml"
    exit 1
    ;;
esac
```

This prevents the following attack: a caller modifies a copy of the workflow, strips the legitimacy checks, then invokes it with `workflow_dispatch`. The `CALLER_WORKFLOW_REF` check ensures the execution path is the canonical one.

---

## 4.6 The Legitimacy Check Step

After input validation, the workflow calls the legitimacy runtime:

```bash
# Check legitimacy against the runtime
RESPONSE=$(curl -sf -X POST "$CLEAN_WORKER_URL/validate" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"decision_id\": \"$DECISION_ID\",
    \"validated_object_hash\": \"$VALIDATED_OBJECT_HASH\",
    \"invocation_nonce\": \"$INVOCATION_NONCE\"
  }")
```

The runtime:
1. Checks that an AEO exists in `aeo_registry` with the given `decision_id`
2. Computes the hash of that AEO and compares it to `validated_object_hash`
3. Checks that the authority is ACTIVE and not expired
4. Checks that the nonce has not been previously consumed
5. Checks all nine legitimacy predicates

If any check fails → the runtime returns NULL → the workflow step fails → no deploy runs.

---

## 4.7 proof_required: true

The AEO's `validation` block contains `proof_required: true`:

```json
{
  "validation": {
    "proof_required": true,
    "replay_nonce": "...",
    "authority_class": "DEPLOY_PRODUCTION"
  }
}
```

This flag means:
- After a successful execution, a proof artifact must be emitted
- If proof emission fails, the execution record is incomplete
- A governed deploy without a proof is a legitimacy gap

**Code reference:** [`src/lib/proof-finality-metadata.ts`](../../src/lib/proof-finality-metadata.ts)

---

## 4.8 No Concurrent Deploys

The workflow enforces serial execution via the `concurrency` key:

```yaml
concurrency:
  group: governed-deploy-production
  cancel-in-progress: false
```

`cancel-in-progress: false` means: if a governed deploy is running and another is triggered, the second one waits — it does not cancel the first. This prevents a race condition where two legitimacy-checked deploys run concurrently and interfere with each other's nonce or proof emission.

---

## 4.9 CONF-CICD Checks

The conformance suite (`npm run conformance`) includes checks specifically for the CI/CD surface:

| Check | What it verifies |
|-------|-----------------|
| CONF-CICD-01 | workflow_dispatch is the only trigger |
| CONF-CICD-02 | `decision_id` is required |
| CONF-CICD-03 | `validated_object_hash` is required |
| CONF-CICD-04 | `invocation_nonce` is required |
| CONF-CICD-05 | Hard fail on missing inputs |
| CONF-CICD-06 | Legitimacy check precedes deploy step |
| CONF-CICD-07 | Proof emission step is present |
| CONF-CICD-08 | No concurrent deploys |
| CONF-CICD-09 | Canonical workflow binding check |

If your governed deploy workflow fails any of these checks, the conformance suite fails. The badge does not render. Your repo is not governed.

---

## Knowledge Check

1. Why does the governed deploy workflow use `workflow_dispatch` instead of `on: push`?
2. What happens if `invocation_nonce` has already been used in a previous workflow run?
3. What is the purpose of `cancel-in-progress: false` in the concurrency configuration?

---

## Code to Read

- [`.github/workflows/governed-deploy.yml`](../../.github/workflows/governed-deploy.yml) — full governed deploy workflow
- [`.github/workflows/prepare-governed-deploy.yml`](../../.github/workflows/prepare-governed-deploy.yml) — the workflow that compiles and validates the AEO before triggering governed-deploy
- [`docs/governed-deploy-quickstart.md`](../governed-deploy-quickstart.md) — quickstart guide for the governed deploy path
- [`templates/governed-deploy.yml`](../../templates/governed-deploy.yml) — installable template for external repos

---

## Next

[Module 5 — Proof and Continuity](module-5.md): learn what a proof artifact contains, why proofs are append-only, and how continuity lineage chains executions together.
