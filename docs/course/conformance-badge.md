# Conformance Badge

The ContinuityOS conformance badge indicates that a repository has run the conformance suite and all checks passed at the time of the run.

---

## Badge Markup

Add to your repo's README:

```markdown
[![ContinuityOS Conformant](https://img.shields.io/badge/ContinuityOS-Conformant-4caf50?style=flat-square&logo=data:image/svg+xml;base64,...)](docs/conformance-report.json)
```

Or with a link to your conformance output file:

```markdown
[![ContinuityOS Conformant](https://img.shields.io/badge/ContinuityOS-Conformant-4caf50?style=flat-square)](https://github.com/your-org/your-repo/blob/main/conformance-output.txt)
```

---

## What the Badge Proves

| Claim | Status |
|-------|--------|
| Governed deploy workflow is installed | ✓ Verified by CONF-CICD checks |
| Hash mismatch returns NULL | ✓ Verified by CONF-DIST-02 |
| Nonce replay returns NULL | ✓ Verified by CONF-DIST-03 |
| Proof registry is append-only | ✓ Verified by CONF-DIST-04 |
| All 30 checks pass | ✓ Verified at time of run |

## What the Badge Does Not Prove

| Claim | Status |
|-------|--------|
| Production deployment has occurred | ✗ Not implied |
| Real-world adoption exists | ✗ Not implied |
| The system is secure in all respects | ✗ Not implied |
| Authority has been granted | ✗ Not implied |
| Compliance with any legal standard | ✗ Not implied |

---

## Earning the Badge

1. Run `npm run conformance` against your runtime
2. Confirm the output ends with `STAGE2_CONFORMANCE_MATRIX_COMPLETE`
3. Capture and commit the output: `npm run conformance 2>&1 | tee conformance-output.txt`
4. Add the badge markup to your README (link to `conformance-output.txt`)
5. Submit `conformance-output.txt` as part of your final project

---

## Conformance Evidence Format

The runner prints structured lines to stdout. A passing run contains:

```
CONFORMANCE_EVIDENCE_OBSERVED
STAGE2_CONF_DIST_COVERAGE: CONF-DIST-01, CONF-DIST-02, ... CONF-DIST-15 — all IMPLEMENTED
CONFORMANCE_EVIDENCE_OBSERVED
STAGE2_CONFORMANCE_MATRIX_COMPLETE
```

The `STAGE2_CONFORMANCE_MATRIX_COMPLETE` line is the machine-readable pass signal.
Any assertion failure causes a non-zero exit and prints the failing check.

---

## Keeping the Badge Current

The badge reflects a point-in-time run. Re-run the suite after any significant change to:
- The legitimacy runtime (`src/`)
- The governed deploy workflow (`.github/workflows/governed-deploy.yml`)
- The conformance suite itself (`conformance/suites/`)

Stale reports may not reflect the current state of the repo.
