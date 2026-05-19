# Failure-Mode Canon Coverage Audit (Issue #450)

**Classification:** `FAILURE_MODE_CANON_COVERAGE_AUDITED`  
**Primary invariant:** If no valid object exists → nothing happens.  
**Canonical route:** `/authority -> /compile -> /validate -> /execute -> /proof`

This audit maps current coverage across three dimensions:

- **FATE tests** (deterministic enforcement tests)
- **Runtime checks** (`src/index.ts` and reconciliation logic)
- **Governance/spec artifacts** (standards + governance JSON/MD)

Authoritative machine-readable source:

- `governance/runtime/FAILURE_MODE_COVERAGE_MATRIX.json`

## Coverage status definitions

- `COVERED`: runtime + test/spec evidence exists for deterministic fail-closed behavior.
- `PARTIAL`: at least one layer is covered, but canonical representation or explicit assertion is incomplete.
- `MISSING`: no sufficient deterministic coverage artifacts.
- `DUPLICATE_OR_AMBIGUOUS`: overlapping controls cannot deterministically select one canonical interpretation.
- `SUPERSEDED`: legacy failure mode replaced by stricter canonical mode.

## Canonical findings summary

- **COVERED:** 18
- **PARTIAL:** 3
- **MISSING:** 0
- **DUPLICATE_OR_AMBIGUOUS:** 0
- **SUPERSEDED:** 0

## Recent hardening reflected in matrix

The audit explicitly captures coverage attributable to recent merged hardening:

- **PR #491** — proof `decision_hash` uniqueness + replay/quarantine guards.
- **PR #514** — proof `decision_hash` migration/bootstrap sequencing.
- **PR #516** — deterministic canonical proof replay recovery coverage.
- **PR #517** — proof lineage binding to valid `EXECUTED` execution lineage.
- **PR #518** — continuity revocation cascade in proof lineage resolution.
- **PR #519** — compile-time active authority gating.

## Targeted follow-up (no broad runtime rewrites)

The audit intentionally avoids introducing new authority semantics or new execution/proof paths. Remaining gaps are narrow follow-up tasks:

1. **Registry divergence reason-code unification** (`FM-009`, PARTIAL).
2. **Cross-registry drift canonical id emission** (`FM-012`, PARTIAL).
3. **Explicit ACTIVE-validation execute-boundary FATE assertion** (`FM-015`, PARTIAL).

These are documentation/test precision improvements rather than broad runtime behavior changes.
