# Conformance Badges

These badges represent observable conformance evidence from the pack-v1 harness.

## Available Badges

| Badge | Meaning | What it is NOT |
|-------|---------|----------------|
| `PASS` | All pack-v1 vectors passed in the last CI run | Not a runtime safety guarantee |
| `OBSERVATIONAL` | Harness is evidence-only, non-operative | Not a legitimacy claim |
| `NON-OPERATIVE` | No deployment, authority, or mutation occurred | Not an execution permit |

## Governance Boundary

```text
badge presence  ≠  execution permission
badge PASS      ≠  authority issuance
badge PASS      ≠  runtime legitimacy
badge PASS      ≠  certification
```

Badges reflect CI-observable harness output only.
They do not confer authority, legitimacy, or execution eligibility.

## Badge Text (plain text, CI-copyable)

```
[CONFORMANCE: PASS]       non-operative · evidence-only · pack-v1
[CONFORMANCE: OBSERVATIONAL] visibility ≠ legitimacy
[CONFORMANCE: NON-OPERATIVE] no authority created · no deployment performed
```
