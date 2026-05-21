# Runtime Reference Collapse

## Canonical ownership model
Runtime governance references are collapsed into a single ownership registry at `governance/runtime/CANONICAL_RUNTIME_OWNERSHIP.json`.
Each reference class has one authoritative owner.

## Authoritative vs derived semantics
Authoritative objects may define execution/governance/authority/topology/replay/proof semantics.
Derived surfaces must retain lineage to canonical owner and are non-authoritative.

## Archive segregation semantics
Archive-classified objects are evidence-only and cannot define authority, topology, or execution semantics.

## Duplicate collapse strategy
Duplicate-prone classes (`BYPASS_PATHS`, `EXECUTION_SURFACES`, topology/reconciliation inventories) are normalized into class-based ownership with deterministic derived mappings.

## Validator drift prevention
Ownership rules separate semantic source objects from generated/derived mirrors to prevent validator drift and semantic divergence.

## Deterministic reconciliation behavior
`scripts/runtime_reference_reconciler.mjs` performs stable ordering, deterministic traversal, and fail-closed conflict detection.

## Fail-closed ownership enforcement
Conflict or ambiguity emits `FAIL_CLOSED` with deterministic evidence records; no hidden mutation is performed.

## Topology singularity rules
Topology ownership remains singular under `runtime/topology/topology_manifest.json`.
All topology derivations must point to that owner.

## Governance compression strategy
Compression is achieved by consolidating ownership while preserving existing runtime behavior and route semantics.
