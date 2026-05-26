# Runtime Topology Inventory

This document is a static topology inventory generated from repository structure and text-pattern classification only.
It is observational and non-authoritative.

## Coverage
- Routes: `src/routes/**`, `src/index.ts`
- Registries: files containing `registry`
- Validators: files containing `validate`/`validator`
- Execution surfaces: files containing `execute`/`deploy`/mutation semantics
- Proof writers: files containing `proof`
- Replay surfaces: files containing `replay`
- Continuity references: files containing `continuity`
- Authority references: files containing `authority`
- Reconciliation modules: files containing `reconciliation`
- Finality/partition modules: files containing `finality` or `partition`

## Closure status model
- OPEN
- PARTIAL
- CONTAINED
- CLOSED
- BREAK_GLASS

## Inventory summary
Generated output is committed at:
- `graph/runtime-topology.sample.json`

The sample includes per-surface closure status and edge relation evidence.

## Canonical constraints preserved
- topology extraction ≠ legitimacy validation
- graph observation ≠ execution permission
- visibility ≠ authority
- no runtime mutation performed
