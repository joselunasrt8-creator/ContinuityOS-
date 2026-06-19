# Inventory Artifact Index

## Purpose

This index preserves discoverability for observational inventory, drift, and
reduction-assessment artifacts relocated from the repository root during the
2026-06-19 surface-area reduction. The files below are archive evidence only:
they are observational records, not authority sources, enforcement mechanisms,
schemas, validators, or execution pathways. Each was verified to have zero
references from runtime, test, workflow, or script code prior to relocation.

## Archive classification

| Relocated artifact | Former root path | Archive classification | Issue lineage | Status |
| --- | --- | --- | --- | --- |
| [`ARTIFACT_INVENTORY.md`](ARTIFACT_INVENTORY.md) | `/ARTIFACT_INVENTORY.md` | `archive/inventory/artifact-inventory` | `#1609` | Archived, non-authoritative evidence |
| [`INVENTORY_SOURCE_MAP.md`](INVENTORY_SOURCE_MAP.md) | `/INVENTORY_SOURCE_MAP.md` | `archive/inventory/source-map` | `#1609` | Archived, non-authoritative evidence |
| [`DRIFT_ANALYSIS.md`](DRIFT_ANALYSIS.md) | `/DRIFT_ANALYSIS.md` | `archive/inventory/drift-analysis` | `#1609` | Archived, non-authoritative evidence |
| [`LIGHTWEIGHT_CLOSURE_RECOMMENDATIONS.md`](LIGHTWEIGHT_CLOSURE_RECOMMENDATIONS.md) | `/LIGHTWEIGHT_CLOSURE_RECOMMENDATIONS.md` | `archive/inventory/closure-recommendations` | `#1609` | Archived, non-authoritative evidence |
| [`REPOSITORY_REDUCTION_ASSESSMENT.md`](REPOSITORY_REDUCTION_ASSESSMENT.md) | `/REPOSITORY_REDUCTION_ASSESSMENT.md` | `archive/inventory/reduction-assessment` | `#1609` | Archived, non-authoritative evidence |
| [`LIGHTWEIGHT_REDUCTION_ASSESSMENT.md`](LIGHTWEIGHT_REDUCTION_ASSESSMENT.md) | `/LIGHTWEIGHT_REDUCTION_ASSESSMENT.md` | `archive/inventory/reduction-assessment` | `#1609` | Archived, non-authoritative evidence |
| [`AGENT_BYPASS_INVENTORY.json`](AGENT_BYPASS_INVENTORY.json) | `/AGENT_BYPASS_INVENTORY.json` | `archive/inventory/bypass-inventory` | `#1609` | Archived, non-authoritative evidence (derived; not the canonical `BYPASS_PATHS.json`) |
| [`PHASE3_EXECUTION_SURFACE_INVENTORY.json`](PHASE3_EXECUTION_SURFACE_INVENTORY.json) | `/PHASE3_EXECUTION_SURFACE_INVENTORY.json` | `archive/inventory/phase-surface-inventory` | Phase 3 closure | Archived, non-authoritative phase evidence |

## Preserved separations

- Observation ≠ Authority: these files remain evidence only.
- Classification ≠ Enforcement: archive labels do not create runtime checks.
- Proposal ≠ Authority: reduction recommendations remain historical proposals.
- Capability ≠ Permission: relocation does not expand tool, API, or mutation permissions.
- Understanding ≠ Correction: inventory/drift analysis remains explanatory only.

## Not relocated (intentionally retained at root)

The canonical, code-referenced inventories were **not** moved and remain at the
repository root because runtime/workflow code consumes them:

- `BYPASS_PATHS.json` — consumed by `scripts/bypass-audit-detector.mjs` (10 refs).
- `EXECUTION_SURFACES.json` — referenced by runtime/workflow code (10 refs).

## Navigation impact

The root no longer exposes these observational inventory/assessment artifacts as
first-class navigation surfaces. They are grouped under `artifacts/inventory/`
with lineage metadata and this index as the canonical discovery path.
