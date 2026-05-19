# ReconciliationReport FATE Hardening

## What ReconciliationReport is

`ReconciliationReport` is a deterministic, evidence-only reconciliation artifact generated from read-only traversal evidence (`deterministic_traversal_trace`, drift classifications, and reconciliation Merkle evidence). It captures:

- `traversal_id` lineage anchor identity for the traversal evidence set
- `reconciliation_merkle_root` derived from reconciliation evidence nodes
- `registry_order` and `checked_registries` for canonical registry continuity
- `drift_results` and `quarantine_candidates` as observability-only outputs

## What ReconciliationReport is not

`ReconciliationReport` is **not** an authority object, execution object, proof object, or lifecycle mutation object. It does not:

- create or consume authority
- start execution
- create proof
- mutate session/continuity/authority/validation/execution/proof lifecycle state
- inherit remote federation authority

## Read-only guarantees

- `/reconcile/report` is GET-only and observability-only.
- `/federation/reconcile/report` is GET-only and observability-only.
- Both routes return report metadata as evidence, never as mutation capability.

## Replay-neutral guarantees

The report is replay-neutral by construction:

- `replay_neutral: true`
- report identity is deterministic over canonicalized evidence material
- no replay-consumption side effects are produced

## Mutation-denial guarantees

Both report routes explicitly deny mutation capability:

- `read_only: true`
- `mutation_capable: false`
- `authority_created: false`
- `execution_started: false`
- `proof_created: false`
- `authority_consumed: false`
- `canonical_lifecycle_mutated: false`

## Relationship to future traversal hashing (Issue #527)

This FATE layer hardens report-chain continuity now while remaining compatible with future traversal hashing expansion in Issue #527. The report binds to traversal evidence (`traversal_id`, `reconciliation_merkle_root`, canonical registry ordering) so future hash material can be extended without introducing authority or mutation semantics.
