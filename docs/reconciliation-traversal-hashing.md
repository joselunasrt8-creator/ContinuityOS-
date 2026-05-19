# Reconciliation Traversal Hashing

Issue #527 adds deterministic reconciliation traversal hashing as a read-only lineage verification primitive.

## Traversal hash object

`computeTraversalHash` returns:

- `reconciliation_id`
- `lineage_root`
- `canonical_traversal_hash`
- `registry_sequence`
- `traversal_status`
- `drift_classification`
- `created_at`

If traversal is non-canonical, fail-closed returns `traversal_status: "NULL"` and `canonical_traversal_hash: null`.

## Canonical ordering

Traversal evidence is always canonicalized in this strict order:

1. `session_registry`
2. `continuity_registry`
3. `authority_registry`
4. `aeo_registry`
5. `validation_registry`
6. `execution_registry`
7. `proof_registry`
8. `preo_registry` (optional; included only when present)

Equivalent lineage inputs that differ only by input order hash identically.

## Failure classifications

Deterministic fail-closed classifications:

- `ORPHANED` for missing canonical ancestry
- `LOOP_DETECTED` for self/visited lineage loops
- `DEPTH_EXCEEDED` for recursion bound overflow
- `NONE` for canonical traversals

## Read-only boundary

Traversal hashing is evidence-only:

- no database writes
- no lineage repair
- no quarantine/authority mutation
- no execution expansion

It preserves runtime chain semantics and does not introduce an alternate execution path.
