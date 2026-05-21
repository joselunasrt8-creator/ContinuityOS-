# Runtime Contraction Report

## Deleted semantic domains
- Historical runtime-adjacent PDFs removed from active runtime tree.
- Generated graph exports removed from active governance/runtime surface.
- Archive snapshot and transient scan outputs removed.
- Duplicate packaged runtime kits removed.
- Non-authoritative backup residue removed.

## Removed duplicate clusters
- Runtime kit bundle duplicates removed:
  - `mindshift_runtime_draft_kit.zip`
  - `mindshift-runtime-hardening-pack.zip`

## Preserved canonical owners
- Runtime router and canonical execution path remain rooted in `src/index.ts` and canonical route modules.
- Canonical ownership registries preserved:
  - `governance/runtime/CANONICAL_OBJECT_REGISTRY.json`
  - `governance/runtime/CANONICAL_RUNTIME_OWNERSHIP.json`

## Runtime surface reduction summary
- Removed 13 non-authoritative artifacts from active tree.
- Deleted classes: generated, archive, duplicate, historical, derived backup.
- No mutation or validator route files were deleted.

## Topology compression summary
- Pruned mirrored/generated topology outputs under `graph/output/`.
- Removed stale archive topology snapshot.
- Topology authority remains singular and registry-bound.

## Governance entropy reduction summary
- Reduced non-canonical artifacts that could induce audit drift.
- Preserved deterministic fail-closed ownership checks through contraction validator.

## Authoritative ownership map
- **Authoritative runtime/validation surfaces (kept):** `src/`, `schemas/`, `migrations/`, `governance/runtime/CANONICAL_*`.
- **Non-authoritative deleted surfaces:** PDFs, zips, backup config, graph output snapshots, transient scans, archive dump.
