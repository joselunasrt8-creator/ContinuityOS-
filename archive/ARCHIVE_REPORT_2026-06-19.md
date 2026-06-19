# Archive Report — 2026-06-19

Light repo cleanse (classification pass). Follows the convention established in
`archive/DELETION_REPORT_2026-05-21.md`, but this is a **move (archive), not a deletion** —
history is preserved via `git mv`.

## Scope

Relocated one self-contained cluster of speculative-canon analysis documents that is
superseded by the current **Dependency Formation** phase. These docs are not referenced by
runtime code, the README, or CI, and contain no outbound relative links — making them a
low-risk archive candidate.

## Moved

From `docs/` → `archive/superseded/canon-analysis/` (19 files):

| File |
| --- |
| `CONTINUITY_EPOCH_LEGITIMACY_ANALYSIS.md` |
| `DISTRIBUTED_CONSTITUTIONAL_FINALITY_SPLIT_BRAIN_ANALYSIS.md` |
| `GLOBAL_CANONICAL_EPOCH_SUPREMACY_ANALYSIS.md` |
| `GLOBAL_CANONICAL_SETTLEMENT_FINALITY_ANALYSIS.md` |
| `GLOBAL_CANONICAL_SUPREMACY_SELECTION_CANON_ANALYSIS.md` |
| `GLOBAL_CONSTITUTIONAL_ARBITRATION_CANON_ANALYSIS.md` |
| `GLOBAL_CONSTITUTIONAL_LEGITIMACY_SINGULARITY_CANON_ANALYSIS.md` |
| `GLOBAL_CONSTITUTIONAL_ONTOLOGICAL_CLOSURE_CANON_ANALYSIS.md` |
| `GLOBAL_CONSTITUTIONAL_REALITY_COLLAPSE_CANON_ANALYSIS.md` |
| `GLOBAL_LEGITIMACY_SINGULARITY_CANON_ANALYSIS.md` |
| `GLOBAL_SETTLEMENT_FINALITY_CANON_ANALYSIS.md` |
| `UNIVERSAL_CANONICAL_IDENTITY_RESOLUTION_ANALYSIS.md` |
| `UNIVERSAL_CANONICAL_TIME_ANALYSIS.md` |
| `UNIVERSAL_CONSTITUTIONAL_MEMORY_ANALYSIS.md` |
| `UNIVERSAL_INVALIDATION_PROPAGATION_CANON_ANALYSIS.md` |
| `epoch-predicate-semantics.md` |
| `epoch-reconciliation-settlement-semantics.md` |
| `epoch-replay-convergence-semantics.md` |
| `epoch-substrate-semantics.md` |

Old path: `docs/<name>` → New path: `archive/superseded/canon-analysis/<name>`.

## Rationale

- Phase is dependency formation; the bottleneck is external adoption, not additional
  canon. These speculative analyses (epoch/finality/constitutional semantics) drove past
  exploration and no longer drive current decisions.
- Verified not load-bearing: not imported by `src/`, `runtime/`, `tests/`, `conformance/`,
  or `.github/`; not linked from `README.md`.

## Safety constraints preserved

- No runtime, schema, migration, test, conformance, or CI files touched.
- No `governance/*.json` configs imported by code touched.
- No new top-level structures created (cluster lives under the existing `archive/`).

## Known side-effect

A few documents that remain in place link *into* this cluster (e.g.
`docs/governance/issue-1332-*.md`, `docs/audits/repo-consolidation-audit-1891.md`, some
`docs/analysis/*`). Those relative links are now stale. This is cosmetic; the old→new
mapping above keeps them traceable.

## Related deliverables (same pass)

- `ROOT.md` — phase orientation.
- `docs/repo-classification.md` — four-tier ledger.
- `docs/roadmap.md` — single P0/P1/P2 board.
