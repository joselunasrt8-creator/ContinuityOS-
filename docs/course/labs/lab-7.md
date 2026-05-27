# Lab 7 — Run the Full Conformance Suite

**Module:** 8  
**Estimated time:** 20 minutes  
**Prerequisites:** Runtime running locally; Lab 6 complete

---

## Goal

Run the ContinuityOS conformance suite against your local runtime and produce a passing conformance report.

---

## Background

The conformance suite (`conformance/runner.mjs`) runs all CONF-CICD and CONF-DIST checks against a live runtime. Each check submits a test vector and verifies the expected response.

**Code reference:** [`conformance/runner.mjs`](../../../conformance/runner.mjs)

---

## Setup

Ensure the runtime is running:

```bash
npm run dev
```

---

## Steps

### Step 1 — Run the suite

```bash
npm run conformance
```

Or, to run against an explicit URL:

```bash
WORKER_URL=http://localhost:8787 API_KEY=your-api-key npm run conformance
```

### Step 2 — Read the output

The suite prints a line per check:

```
CONF-DIST-01: PASS  — canonical NULL result enforced
CONF-DIST-02: PASS  — hash mismatch returns NULL
...
Total: 30/30 PASS
```

If any check fails, it prints the expected vs. observed values:

```
CONF-DIST-03: FAIL
  expected: {"status":"NULL"}
  observed: {"status":"VALID"}
```

### Step 3 — Read the JSON report

```bash
cat conformance/report.json | jq '{total: .total_checks, passed: .passed, failed: .failed}'
```

### Step 4 — Identify a failing check (if any)

If any check fails, read its description in [`docs/stage2-conformance-matrix.md`](../../stage2-conformance-matrix.md) to understand what it tests.

Common failures and their causes:

| Failure | Likely cause |
|---------|-------------|
| CONF-DIST-02 fails | Hash comparison not implemented correctly |
| CONF-DIST-03 fails | Nonce replay not rejected |
| CONF-DIST-04 fails | Proof registry allows updates |
| CONF-CICD-01 fails | Workflow trigger is not `workflow_dispatch` only |

### Step 5 — Save the report

Copy `conformance/report.json` to your fork or lab submission location. This is the artifact you submit with your final project.

---

## Expected Results

```
Total: 30/30 PASS
```

All checks pass on a correctly configured runtime.

---

## What You Proved

Your local runtime enforces all 30 legitimacy conformance checks. The report is the machine-readable evidence you will reference in your final project.

---

## Next

[Lab 8 — Agent gateway integration *(optional)*](lab-8.md) or skip to [Final Project](../README.md#final-project).
