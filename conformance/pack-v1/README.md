# ContinuityOS MindShift — Conformance Pack v1

Stage 3 external legitimacy invariant verification pack.

---

## Purpose

This pack allows any external repository to verify compatibility with ContinuityOS
legitimacy invariants — without access to the canonical runtime.

The pack proves:

- Invalid objects fail closed (NULL — no partial results)
- Consumed nonces cannot be resurrected
- Proof state is append-only (no backwards transitions)
- Proof existence does not imply distributed finality
- Conformance classifies state; it does not create authority

---

## Invariants

```
If no valid object exists → nothing happens

validated_object == executed_object

capability ≠ authority

visibility ≠ authority

proof existence ≠ distributed finality

conformance ≠ execution authority

reconciliation ≠ authority
```

Execution is allowed only if ALL of:

```
VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID
∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE
∧ EPOCH_VALID ∧ CONVERGENCE_VALID
```

Otherwise: NULL.

---

## External install

Copy this directory into your external repository:

```bash
# From inside your repo
cp -r /path/to/mindshift-demo/conformance/pack-v1 ./conformance/pack-v1
```

Or clone just this directory via sparse checkout:

```bash
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/joselunasrt8-creator/mindshift-demo
cd mindshift-demo
git sparse-checkout set conformance/pack-v1
cp -r conformance/pack-v1 /path/to/your-repo/conformance/
```

No `npm install` required. The harness has zero external dependencies.

---

## How to run

```bash
node conformance/pack-v1/harness.mjs
```

Or from within this directory:

```bash
node harness.mjs
```

Requires Node.js 18+. No other dependencies.

---

## Expected output

A fully passing run prints:

```
=== ContinuityOS MindShift — Conformance Pack v1 ===
Stage: 3  |  Mode: Evidence-Only  |  Authority: None

Invariants:
  If no valid object exists → nothing happens
  validated_object == executed_object
  capability ≠ authority
  proof existence ≠ distributed finality
  conformance ≠ execution authority

[VALIDATOR] validator.json
  VALIDATOR-01 PASS — valid AEO: all required fields present; mutation_capable false
  VALIDATOR-02 PASS — mutated AEO: mutation_capable true; _mutation_marker present — fails closed (NULL)
  VALIDATOR-03 PASS — AEO missing governed_tool_envelope_id — fails closed (NULL)
  VALIDATOR-04 PASS — canonical hash: deterministic across two computations of the same object [sha256: ...]

[REPLAY] replay.json
  REPLAY-01 PASS — consumed nonce: replay_state CONSUMED; restoration_eligible false — any reuse returns NULL
  REPLAY-02 PASS — replay resurrection attempt: resurrection_claim true on CONSUMED nonce — NULL enforced
  REPLAY-03 PASS — unused nonce: replay_state UNUSED — eligible for first-and-only use

[PROOF] proof.json
  PROOF-01 PASS — append-only: proof state forward transitions only; backwards transitions forbidden
  PROOF-02 PASS — detached continuity: null predecessor lineage — classified DETACHED; no valid authority path
  PROOF-03 PASS — proof existence ≠ finality: local_proof_exists=true with global_quorum_attested=false — LOCAL_VALID only

[CONVERGENCE] convergence.json
  CONV-01 PASS — local-only context: quorum_size 1, result_claim LOCAL_VALID — GLOBAL_VALID is forbidden
  CONV-02 PASS — partition detected: partition_detected true — execution suspended; PARTITION_SUSPENDED
  CONV-03 PASS — conflicting proof roots: conflicting_proof_roots true — CONFLICTED classification
  CONV-04 PASS — quorum disagreement: quorum_disagree true — AMBIGUOUS; GLOBAL_VALID is forbidden
  CONV-05 PASS — settled convergence: converged and epoch_match true — CONVERGED (not GLOBAL_VALID; conformance ≠ authority)

CONFORMANCE_EVIDENCE_OBSERVED
VALIDATION_FAIL_CLOSED_CONFIRMED
REPLAY_CONSUMPTION_PRESERVED
PROOF_APPEND_ONLY_CONFIRMED
CONVERGENCE_CLASSIFICATION_CORRECT
PACK_V1_CONFORMANCE_COMPLETE

=== Summary ===
Total:  15  |  PASS: 15  |  FAIL: 0
Authority created:         false
Deployment performed:      false
Runtime mutation capable:  false
Production proof emitted:  false

CONFORMANCE_EVIDENCE_OBSERVED
```

The terminal lines `PACK_V1_CONFORMANCE_COMPLETE` and `CONFORMANCE_EVIDENCE_OBSERVED` are
the machine-readable pass signals. Exit code 0 on full pass; exit code 1 on any failure.

---

## Capture output for submission

```bash
node conformance/pack-v1/harness.mjs 2>&1 | tee conformance-pack-v1-output.txt
```

The harness also writes a structured JSON evidence file alongside itself:
`conformance/pack-v1/conformance-pack-v1-evidence.json`

---

## What this pack proves

| Claim | Verified by |
|-------|-------------|
| Invalid objects fail closed (NULL) | VALIDATOR-02, VALIDATOR-03 |
| Required field absence → NULL | VALIDATOR-03 |
| Canonical hash is deterministic | VALIDATOR-04 |
| Consumed nonce blocks reuse | REPLAY-01 |
| Resurrection attempt returns NULL | REPLAY-02 |
| Unused nonce is eligible | REPLAY-03 |
| Proof state is append-only (forward only) | PROOF-01 |
| Detached continuity classifies DETACHED | PROOF-02 |
| Local proof ≠ distributed finality | PROOF-03 |
| Single-node result is LOCAL_VALID (not GLOBAL_VALID) | CONV-01 |
| Partition suspends execution | CONV-02 |
| Conflicting roots produce CONFLICTED | CONV-03 |
| Quorum disagreement produces AMBIGUOUS | CONV-04 |
| Settled convergence classifies CONVERGED (not GLOBAL_VALID) | CONV-05 |

---

## What this pack does NOT prove

```
conformance ≠ authority
```

| Claim | Status |
|-------|--------|
| Production deployment has occurred | NOT implied |
| Authority has been granted | NOT implied |
| The system is secure in all respects | NOT implied |
| GLOBAL_VALID has been reached | NOT implied — conformance cannot grant it |
| Distributed finality has been achieved | NOT implied — proof existence ≠ finality |
| Legal or security certification | NOT implied |
| Real external adoption exists | NOT implied |
```

---

## Pack structure

```
conformance/pack-v1/
  README.md                            — this file
  harness.mjs                          — self-contained portable runner
  fixtures/
    aeo-valid.json                     — canonical valid AEO (all 5 required keys)
    aeo-mutated.json                   — mutation marker present → NULL
    aeo-missing-key.json               — missing governed_tool_envelope_id → NULL
    continuity-intact.json             — intact lineage (depth 1, ACTIVE)
    continuity-detached.json           — null predecessor → DETACHED
    replay-consumed.json               — CONSUMED nonce; restoration_eligible false
    replay-resurrection-attempt.json   — resurrection_claim true on CONSUMED → NULL
  vectors/
    validator.json                     — exact-object validation suite (4 vectors)
    replay.json                        — replay consumption suite (3 vectors)
    proof.json                         — proof append-only suite (3 vectors)
    convergence.json                   — convergence classification suite (5 vectors)
```

---

## Safety constraints

This pack:

- does not create authority
- does not perform deployment
- does not generate production proof
- does not mutate runtime state
- does not consume replay nonces
- does not widen execution eligibility
- does not require network access
- does not require the ContinuityOS runtime

All fixtures and vectors are `_non_operative: true`.
All suites are `non_operative: true, observability_only: true, runtime_mutation_capable: false`.
