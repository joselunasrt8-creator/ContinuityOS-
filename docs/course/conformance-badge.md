# Conformance Badge

The ContinuityOS conformance badge indicates that a repository has run the conformance suite and all checks passed at the time of the run.

---

## Badge Markup

Add to your repo's README:

```markdown
[![ContinuityOS Conformant](https://img.shields.io/badge/ContinuityOS-Conformant-4caf50?style=flat-square&logo=data:image/svg+xml;base64,...)](docs/conformance-report.json)
```

Or with a link to your conformance report:

```markdown
[![ContinuityOS Conformant](https://img.shields.io/badge/ContinuityOS-Conformant-4caf50?style=flat-square)](https://github.com/your-org/your-repo/blob/main/conformance/report.json)
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
2. Confirm 30/30 PASS
3. Commit `conformance/report.json` to your repo
4. Add the badge markup to your README
5. Submit your conformance report as part of your final project

---

## Badge Schema

The conformance report JSON schema that the badge service validates:

```json
{
  "run_id": "string",
  "timestamp": "ISO 8601 string",
  "total_checks": 30,
  "passed": "number (must equal 30 for badge)",
  "failed": "number (must equal 0 for badge)",
  "checks": [
    {
      "id": "CONF-DIST-01 through CONF-CICD-15",
      "status": "PASS | FAIL",
      "description": "string",
      "observed": "string",
      "expected": "string"
    }
  ]
}
```

---

## Keeping the Badge Current

The badge reflects a point-in-time run. Re-run the suite after any significant change to:
- The legitimacy runtime (`src/`)
- The governed deploy workflow (`.github/workflows/governed-deploy.yml`)
- The conformance suite itself (`conformance/suites/`)

Stale reports may not reflect the current state of the repo.
