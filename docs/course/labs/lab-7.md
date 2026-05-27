# Lab 7 — Run the Conformance Suite

**Module:** 8  
**Estimated time:** 25 minutes  
**Prerequisites:** Lab 6 complete

---

## Goal

Verify your repository's compatibility with ContinuityOS legitimacy invariants by running
the external conformance pack — no live runtime required — then optionally run the full
canonical suite against a live runtime if you have one available.

---

## Part A — External Conformance Pack v1 (no runtime required)

The pack verifies 15 invariant checks across four suites: exact-object validation, replay
consumption, proof append-only semantics, and convergence classification.

**Code reference:** [`conformance/pack-v1/harness.mjs`](../../../conformance/pack-v1/harness.mjs)

### Step 1 — Install the pack into your starter repo

Copy the pack directory into your repo:

```bash
cp -r /path/to/mindshift-demo/conformance/pack-v1 ./conformance/pack-v1
```

Or if working inside the canonical repo directly, it is already present.

### Step 2 — Run the harness

```bash
node conformance/pack-v1/harness.mjs
```

No `npm install` needed. The harness has zero external dependencies and embeds the
canonical serialization algorithm.

### Step 3 — Read the output

A passing run prints a result per check, then five terminal signals:

```
CONFORMANCE_EVIDENCE_OBSERVED
VALIDATION_FAIL_CLOSED_CONFIRMED
REPLAY_CONSUMPTION_PRESERVED
PROOF_APPEND_ONLY_CONFIRMED
CONVERGENCE_CLASSIFICATION_CORRECT
PACK_V1_CONFORMANCE_COMPLETE
```

The `PACK_V1_CONFORMANCE_COMPLETE` line is the machine-readable pass signal.
Exit code 0 = all pass. Exit code 1 = at least one failure.

### Step 4 — Capture output for submission

```bash
node conformance/pack-v1/harness.mjs 2>&1 | tee conformance-pack-v1-output.txt
```

The harness also writes a structured JSON evidence file:
`conformance/pack-v1/conformance-pack-v1-evidence.json`

Include either file in your submission. The evidence file is the adoption artifact that
proves your repo ran the pack.

### Step 5 — Understand what the pack proves

| Invariant verified | Checked by |
|--------------------|------------|
| Invalid objects fail closed (NULL) | VALIDATOR-02, VALIDATOR-03 |
| Canonical hash is deterministic | VALIDATOR-04 |
| Consumed nonce blocks all reuse | REPLAY-01, REPLAY-02 |
| Proof state is append-only | PROOF-01 |
| Proof existence ≠ distributed finality | PROOF-03 |
| Conformance ≠ execution authority | CONV-01 through CONV-05 |

**The pack does not prove:**

- Production deployment has occurred
- Authority has been granted
- GLOBAL_VALID has been reached
- Distributed finality exists

```
conformance ≠ authority
proof existence ≠ distributed finality
```

---

## Part B — Canonical Suite (live runtime required)

If you have the ContinuityOS runtime running locally, run the full Stage 2 suite:

### Step 1 — Start the runtime

```bash
npm run dev
```

### Step 2 — Run the canonical conformance suite

```bash
npm run conformance
```

### Step 3 — Read the output

```
CONFORMANCE_EVIDENCE_OBSERVED
STAGE2_CONF_DIST_COVERAGE: CONF-DIST-01, ... CONF-DIST-15 — all IMPLEMENTED
CONFORMANCE_EVIDENCE_OBSERVED
STAGE2_CONFORMANCE_MATRIX_COMPLETE
```

The `STAGE2_CONFORMANCE_MATRIX_COMPLETE` line confirms all 15 CONF-DIST checks pass.

### Step 4 — Capture output for submission

```bash
npm run conformance 2>&1 | tee conformance-output.txt
```

### Step 5 — Identify a failing check (if any)

Read its description in [`docs/stage2-conformance-matrix.md`](../../stage2-conformance-matrix.md).

Common failures:

| Failure | Likely cause |
|---------|-------------|
| CONF-DIST-02 fails | Hash comparison not implemented correctly |
| CONF-DIST-03 fails | Nonce replay not rejected |
| CONF-DIST-04 fails | Proof registry allows updates |

---

## Expected Results

**Part A (pack-v1):**
```
Total:  15  |  PASS: 15  |  FAIL: 0
PACK_V1_CONFORMANCE_COMPLETE
```

**Part B (canonical, if available):**
```
STAGE2_CONFORMANCE_MATRIX_COMPLETE
```

---

## What You Proved

Running Part A proves your repo enforces all 15 Stage 3 legitimacy invariants without
requiring a live runtime. This is the external conformance artifact referenced by the
[conformance badge](../conformance-badge.md).

---

## Next

[Lab 8 — Agent gateway integration *(optional)*](lab-8.md) or skip to [Final Project](../README.md#final-project).
