# Reconciliation Traversal Hashing

Issue #527 adds a deterministic traversal identity layer on top of the existing `ReconciliationReport` substrate.

## Purpose

Traversal hashing is evidence-only and read-only. It canonically fingerprints deterministic lineage traversal so:

- equivalent lineage evidence yields the same `traversal_hash`;
- lineage drift changes hash material;
- missing or looping lineage remains fail-closed through existing drift classification paths.

## Boundaries

Traversal hashing does **not**:

- grant authority;
- execute actions;
- mutate proof semantics;
- repair lineage;
- introduce alternate execution surfaces.

## Canonical hash binding

`traversal_hash` binds to canonicalized material:

- `traversal_id`
- `lineage_anchor`
- canonical `registry_order`
- canonicalized `checked_registries`
- sorted `drift_classes`
- `reconciliation_merkle_root`
- continuity projections for proof/execution/validation identifiers when available

This keeps hashing deterministic, replay-neutral, non-authoritative, and drift-sensitive.

## Determinism rules

1. Traversal evidence is re-ordered by canonical registry order before hashing.
2. Drift classes are sorted before hashing.
3. Hash continuity material is bound only from observed canonical identifiers.
4. Missing lineage and recursive lineage loops are classified fail-closed and are not repaired in traversal hashing.
