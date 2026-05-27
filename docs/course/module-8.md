# Module 8 — Conformance and Telemetry

**Duration:** ~1 hour  
**Lab:** [L7 — Run the full conformance suite](labs/lab-7.md), [L9 — Install-base telemetry *(optional)*](labs/lab-9.md)

---

## Learning Objectives

By the end of this module you will be able to:

1. Run `npm run conformance` and read the output report
2. Identify what each CONF-DIST check verifies
3. Describe the conformance badge and what it proves
4. Explain governed execution volume and blocked invalid execution volume
5. Instrument a basic telemetry counter in a governed repo

---

## 8.1 What Conformance Means

**Conformance** is the machine-readable verification that a repo implements the ContinuityOS legitimacy invariants correctly.

A conformant repo:
- Has a governed deploy workflow that passes all CONF-CICD checks
- Has proof emission that passes all CONF-DIST checks
- Demonstrates that a mutated object returns NULL (Lab 3 outcome)
- Has continuity lineage intact across all recorded executions

**A conformance badge is not a security guarantee.** It is evidence that the measurable invariants hold at the time the suite was run.

**Code reference:** [`conformance/runner.mjs`](../../conformance/runner.mjs), [`conformance/suites/`](../../conformance/suites/)

---

## 8.2 Running the Suite

```bash
npm run conformance
```

This runs the conformance runner against your local runtime. The runner:

1. Loads all suite files from `conformance/suites/`
2. Runs each check against the `/validate`, `/execute`, `/proof`, and other routes
3. Produces a JSON report at `conformance/report.json`
4. Prints a summary to stdout

**Output format:**

```
CONF-DIST-01: PASS  — canonical NULL result enforced
CONF-DIST-02: PASS  — hash mismatch returns NULL
CONF-DIST-03: PASS  — nonce replay returns NULL
CONF-DIST-04: PASS  — proof is append-only
CONF-DIST-05: PASS  — authority expiry returns NULL
...
CONF-CICD-01: PASS  — workflow_dispatch only
CONF-CICD-02: PASS  — decision_id required
...
Total: 30/30 PASS
```

---

## 8.3 CONF-DIST Checks

The distributed legitimacy conformance checks verify the legitimacy invariants that must hold across any deployment.

| Check | What it verifies |
|-------|-----------------|
| CONF-DIST-01 | Canonical NULL result is enforced — no partial results, no exceptions |
| CONF-DIST-02 | Hash mismatch on mutated object returns NULL |
| CONF-DIST-03 | Replay of consumed nonce returns NULL |
| CONF-DIST-04 | Proof registry is append-only — no delete or update |
| CONF-DIST-05 | Expired authority returns NULL |
| CONF-DIST-06 | Revoked authority returns NULL |
| CONF-DIST-07 | Missing authority returns NULL |
| CONF-DIST-08 | LOCAL_VALID ≠ GLOBAL_VALID — distinction is enforced |
| CONF-DIST-09 | Topology visibility check — invisible node cannot execute |
| CONF-DIST-10 | Epoch expiry returns NULL |
| CONF-DIST-11 | Reconciliation state machine transitions are valid |
| CONF-DIST-12 | Continuity lineage gap returns NULL |
| CONF-DIST-13 | Convergence predicate is enforced |
| CONF-DIST-14 | Proof does not grant authority |
| CONF-DIST-15 | Canonical serialization is deterministic |

**Code reference:** [`docs/stage2-conformance-matrix.md`](../stage2-conformance-matrix.md) — full check specifications with test vectors

---

## 8.4 The Conformance Report

After running the suite, `conformance/report.json` contains:

```json
{
  "run_id": "...",
  "timestamp": "...",
  "total_checks": 30,
  "passed": 30,
  "failed": 0,
  "checks": [
    {
      "id": "CONF-DIST-01",
      "status": "PASS",
      "description": "Canonical NULL result enforced",
      "test_vector": "...",
      "observed": "NULL",
      "expected": "NULL"
    }
  ]
}
```

This report is the artifact you submit with your final project. It is machine-readable and can be parsed by the conformance badge service.

---

## 8.5 The Conformance Badge

The conformance badge renders in your repo's README when the conformance report passes all checks.

```markdown
[![ContinuityOS Conformant](https://img.shields.io/badge/ContinuityOS-Conformant-green)](docs/course/conformance-badge.md)
```

**The badge proves:**
- The repo's governed deploy workflow passes all CONF-CICD checks
- The repo's legitimacy runtime passes all CONF-DIST checks
- The conformance suite was run at a specific timestamp

**The badge does not prove:**
- Production deployment has occurred
- Any real-world adoption exists
- The repo is secure in all respects
- Authority has been granted to anyone

**Code reference:** [`docs/course/conformance-badge.md`](conformance-badge.md)

---

## 8.6 Governed Execution Volume

**Governed execution volume** is the count of executions that passed the full legitimacy gate. It is the primary install-base metric.

```typescript
// Telemetry counter for governed executions
await telemetry.increment("governed_execution_volume", {
  decision_id,
  continuity_id,
  epoch_id
});
```

**Code reference:** [`src/telemetry.ts`](../../src/telemetry.ts), [`src/legitimacy-telemetry.ts`](../../src/legitimacy-telemetry.ts)

---

## 8.7 Blocked Invalid Execution Volume

**Blocked invalid execution volume** is the count of execution attempts that returned NULL. This is the security metric — it shows how many times the legitimacy gate prevented an unauthorized action.

```typescript
// Telemetry counter for blocked executions
await telemetry.increment("blocked_invalid_execution_volume", {
  reason: "hash_mismatch" | "nonce_consumed" | "authority_expired" | ...,
  decision_id
});
```

The ratio `governed_execution_volume / (governed_execution_volume + blocked_invalid_execution_volume)` is the legitimacy surface utilization rate.

---

## 8.8 Dependency Measurement

The install-base metric measures how many external repos depend on ContinuityOS for legitimacy-gated execution. This is measured by:

1. Governed execution events from external repos (telemetry beacons)
2. Conformance badge renders (badge service logs)
3. Fork count of the governed deploy template

These metrics are not vanity metrics. They measure whether external developers have actually moved from `prompt → execution` to `intent → legitimacy object → validated execution`.

---

## Knowledge Check

1. What does `CONF-DIST-02` verify? Write the test case it would run.
2. A repo has 100 execution attempts. 80 pass the legitimacy gate; 20 return NULL. What is the blocked invalid execution volume?
3. What does the conformance badge prove? What does it not prove?

---

## Code to Read

- [`conformance/runner.mjs`](../../conformance/runner.mjs) — conformance runner main file
- [`conformance/suites/`](../../conformance/suites/) — individual check suite files
- [`docs/stage2-conformance-matrix.md`](../stage2-conformance-matrix.md) — check specifications and test vectors
- [`src/telemetry.ts`](../../src/telemetry.ts) — telemetry client
- [`src/legitimacy-telemetry.ts`](../../src/legitimacy-telemetry.ts) — legitimacy-specific counters

---

## Course Complete

You have completed all eight modules.

**Your final project:** [Add ContinuityOS to an external repo](README.md#final-project)

Submit:
1. Link to your fork with `governed-deploy.yml` installed
2. Link to a proof row in your fork's proof log
3. Output of `npm run conformance` from your fork
4. A description of one mutation you tested that returned NULL
