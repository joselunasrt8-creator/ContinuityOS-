# Recursive Reconciliation Traversal Engine

## Objective

The recursive reconciliation traversal engine is the first executable reconciliation substrate for persisted MindShift legitimacy lineage. It is deterministic, bounded, replay-neutral, read-only, and fail-closed. It observes persisted legitimacy; it never creates legitimacy.

## Canonical Registry Ordering

Traversal order is fixed and must not be reordered by callers, runtime timing, scheduler concurrency, or registry availability:

1. `session_registry`
2. `continuity_registry`
3. `authority_registry`
4. `aeo_registry`
5. `validation_registry`
6. `execution_registry`
7. `proof_registry`
8. `invocation_registry`
9. `preo_registry`

This preserves the required dependency ordering: reconciliation determinism before federation, and reconciliation determinism before portability.

## Read-Only Boundary

The traversal engine performs deterministic `SELECT` reads only. It must not:

- mutate legitimacy state
- reserve or consume replay state
- consume authority
- generate proofs
- write drift rows
- write telemetry rows
- repair or infer missing ancestry
- alter registries

Drift results are returned as read-only reconciliation result objects so a later observability scheduler can emit telemetry without giving traversal authority to mutate runtime state.

## Recursive Integrity Checks

Every persisted lineage walk validates that:

- parent lineage exists
- parent lineage is valid
- continuity hashes re-derive from canonical continuity material
- duplicate lineage hashes are detected
- revocation state is coherently propagated
- replay nonce lineage matches validation and execution lineage
- proof lineage matches authority, execution, continuity, and exact-object evidence
- PREO ancestry matches authority, continuity, and exact-object review lineage

Any unresolved, ambiguous, stale, or divergent condition returns fail-closed reconciliation output.

## Reconciliation Result Objects

The engine returns one of three result classes:

- `VALID_RECONCILIATION`
- `INVALID_RECONCILIATION`
- `NULL`

Every result includes:

- `canonical_registry_ordering`
- `deterministic_traversal_trace`
- `lineage_anchor`
- `drift_classifications`
- `recursion_depth`

Invalid reconciliation carries a deterministic drift payload with:

- `drift_id`
- `drift_class`
- `lineage_anchor`
- `registry_origin`
- `detected_at`
- `severity`
- `deterministic_trace`

Traversal trace entries may also carry `canonical_identifiers` extracted from persisted row fields. These identifiers are read-only evidence for portable reconciliation; they do not replace `lookup_key`, do not alter traversal ordering, and do not create authority.

## Drift Classification Coverage

The traversal engine classifies the first fail-closed drift deterministically:

- `orphan_legitimacy_object_drift`
- `recursive_ancestry_drift`
- `replay_chain_drift`
- `proof_lineage_drift`
- `duplicate_lineage_hash_drift`
- `preo_ancestry_drift`
- `revocation_propagation_drift`
- `traversal_instability_drift`

Federated lineage and reporting APIs remain future phases and must consume this deterministic traversal substrate rather than bypassing it.

## Recursive revocation lineage observability

Recursive reconciliation now exposes federated revocation lineage as observability-only evidence. `FederatedRevocationEvidence` is hashed deterministically and bound to the reconciliation Merkle root, attestation hash, and lineage hash. Remote revocation evidence can narrow acceptance and trigger reconciliation, but local validation remains sovereign and replay state remains local.

Revocation-aware reconciliation adds deterministic classes `federated_revocation_divergence_drift`, `federated_revocation_projection_drift`, `federated_revocation_replay_drift`, `federated_checkpoint_revocation_drift`, and `federated_expiration_visibility_drift`. These classes preserve recursive lineage integrity and return `NULL` for identity mismatch, replay collision, missing lineage, checkpoint divergence, or expiration visibility corruption.

Revocation `validated_object_hash` anchoring is separate from reconciliation traversal evidence: the validated object hash comes only from persisted validation, AEO, or proof legitimacy lineage, while `reconciliation_merkle_root` remains traversal evidence. This preserves exact-object lineage continuity.

Exact-object envelope drift is classified as `federated_revocation_exact_object_drift`; validated-object anchor drift is classified as `federated_revocation_anchor_drift`.
