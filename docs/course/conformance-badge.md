# Conformance Badge

The ContinuityOS conformance badge indicates that a repository has run the conformance
pack and all checks passed at the time of the run.

```
badge = compatibility evidence only
badge ≠ authority
badge ≠ security certification
badge ≠ distributed finality
```

---

## Badge Markup

Add to your repo's README, linking to your captured evidence file:

```markdown
[![ContinuityOS Conformant](https://img.shields.io/badge/ContinuityOS-Conformant-4caf50?style=flat-square)](https://github.com/your-org/your-repo/blob/main/conformance-pack-v1-output.txt)
```

---

## What the Badge Proves

| Claim | Verified by |
|-------|-------------|
| Invalid objects fail closed (NULL) | VALIDATOR-02, VALIDATOR-03 |
| Required field absence → NULL | VALIDATOR-03 |
| Canonical hash is deterministic | VALIDATOR-04 |
| Consumed nonce blocks all reuse | REPLAY-01 |
| Resurrection attempt returns NULL | REPLAY-02 |
| Proof state is append-only | PROOF-01 |
| Proof existence ≠ distributed finality | PROOF-03 |
| Single-node result is LOCAL_VALID only | CONV-01 |
| Partition suspends execution | CONV-02 |
| Quorum disagreement produces AMBIGUOUS | CONV-04 |
| Conformance classifies, not authorizes | CONV-05 |

## What the Badge Does NOT Prove

| Claim | Status |
|-------|--------|
| Production deployment has occurred | NOT implied |
| Authority has been granted | NOT implied |
| The system is secure in all respects | NOT implied |
| GLOBAL_VALID has been reached | NOT implied |
| Distributed finality has been achieved | NOT implied |
| Compliance with any legal standard | NOT implied |
| Real-world external adoption exists | NOT implied |

---

## Earning the Badge — Path A: External Pack (no runtime required)

1. Install the pack into your repo:

   ```bash
   cp -r /path/to/mindshift-demo/conformance/pack-v1 ./conformance/pack-v1
   ```

2. Run the harness:

   ```bash
   node conformance/pack-v1/harness.mjs 2>&1 | tee conformance-pack-v1-output.txt
   ```

3. Confirm the output ends with `PACK_V1_CONFORMANCE_COMPLETE`

4. Add the badge markup to your README (link to `conformance-pack-v1-output.txt`)

5. Submit `conformance-pack-v1-output.txt` as part of your final project

See [`conformance/pack-v1/README.md`](../../../conformance/pack-v1/README.md) for full
installation and usage instructions.

---

## Earning the Badge — Path B: Canonical Suite (live runtime required)

1. Run `npm run conformance` against your runtime
2. Confirm the output ends with `STAGE2_CONFORMANCE_MATRIX_COMPLETE`
3. Capture and commit the output: `npm run conformance 2>&1 | tee conformance-output.txt`
4. Add the badge markup to your README (link to `conformance-output.txt`)
5. Submit `conformance-output.txt` as part of your final project

---

## Pack v1 Evidence Format

A passing pack-v1 run contains these terminal lines:

```
CONFORMANCE_EVIDENCE_OBSERVED
VALIDATION_FAIL_CLOSED_CONFIRMED
REPLAY_CONSUMPTION_PRESERVED
PROOF_APPEND_ONLY_CONFIRMED
CONVERGENCE_CLASSIFICATION_CORRECT
PACK_V1_CONFORMANCE_COMPLETE
```

`PACK_V1_CONFORMANCE_COMPLETE` is the machine-readable pass signal.
Exit code 0 = all 15 checks pass. Exit code 1 = at least one failure.

A structured JSON evidence file is also written to:
`conformance/pack-v1/conformance-pack-v1-evidence.json`

---

## Canonical Suite Evidence Format

```
CONFORMANCE_EVIDENCE_OBSERVED
STAGE2_CONF_DIST_COVERAGE: CONF-DIST-01, ... CONF-DIST-15 — all IMPLEMENTED
CONFORMANCE_EVIDENCE_OBSERVED
STAGE2_CONFORMANCE_MATRIX_COMPLETE
```

---

## Keeping the Badge Current

The badge reflects a point-in-time run. Re-run after any significant change to:
- Your governed deploy workflow (`.github/workflows/governed-deploy.yml`)
- The legitimacy runtime (`src/`)
- The conformance pack or suite (`conformance/`)

Stale evidence may not reflect the current state of your repo.
