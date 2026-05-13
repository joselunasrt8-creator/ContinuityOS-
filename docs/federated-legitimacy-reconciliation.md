# Federated Legitimacy Reconciliation

MindShift federation reconciliation is observability-only infrastructure. It verifies and classifies portable evidence from another runtime, but it never creates local execution legitimacy.

## Preserved invariants

- If lineage cannot be recursively reconciled across runtimes, legitimacy integrity is `NULL`.
- Portable evidence is not portable authority.
- Remote proof is not local execution legitimacy.
- Local validation, replay checks, continuity lineage, PREO lineage, and proof verification remain mandatory.
- Federation reconciliation is outside the canonical execution path: `/session` → `/continuity` → `/authority` → `/compile` → `/validate` → `/execute` → `/proof`.

## Observability-only routes

The federation routes are GET-only and read-only:

- `GET /federation/reconcile`
- `GET /federation/reconcile/report`
- `GET /federation/reconcile/drift`
- `GET /federation/reconcile/checkpoint`

They do not mutate legitimacy, create authority, reserve replay state, consume replay state, repair drift, or infer legitimacy.

## PortableLegitimacyBundle

`PortableLegitimacyBundle` is a deterministic, exact-object-bound evidence object with these required fields:

- `runtime_id`
- `reconciliation_id`
- `decision_id`
- `validated_object_hash`
- `proof_id`
- `execution_id`
- `invocation_nonce`
- `continuity_id`
- `authority_lineage_hash`
- `proof_lineage_hash`
- `replay_lineage_hash`
- `preo_lineage_hash`
- `attestation_hash`
- `reconciliation_merkle_root`
- `federation_boundary`
- `emitted_at`

The bundle uses canonical serialization and deterministic ordering only. It is replay-neutral and bound to the exact validated object hash.

Portable identifiers (`decision_id`, `execution_id`, `proof_id`, `continuity_id`, `invocation_nonce`, and `validated_object_hash`) must resolve only from canonical persisted registry row fields observed during deterministic traversal. `lookup_key` is a traversal helper only and MUST NEVER be emitted as canonical portable identity. If canonical row identifiers cannot be deterministically resolved, bundle emission fails closed to `NULL` with `federated_identifier_resolution_drift`; portable_identifier == canonical_persisted_identifier.

## Runtime classification

Remote runtimes are classified as:

- `LOCAL_RUNTIME`
- `FEDERATED_RUNTIME`
- `EXTERNAL_REFERENCE`
- `UNTRUSTED_RUNTIME`
- `PORTABLE_EVIDENCE_ONLY`

Trust classification is not authority. Remote evidence can only narrow acceptance; it cannot grant legitimacy.

## Verification algorithm

`verifyFederatedLegitimacyBundle()` fails closed to `NULL` for ambiguity or mismatch. Verification includes canonical payload equality, DSSE envelope verification, attestation replay indicators, reconciliation Merkle verification, runtime continuity, decision continuity, exact object hash equality, invocation nonce continuity, proof continuity, PREO continuity, and continuity ancestry anchoring.

Forbidden outcomes are inferred legitimacy, remote replay trust, implicit authority, and remote execution inheritance.

## Reconciliation Merkle evidence

The deterministic reconciliation tree is:

`session` → `continuity` → `authority` → `AEO` → `validation` → `execution` → `proof` → `attestation` → `PREO`

Each node is canonically serialized and hashed with its traversal position and parent hash. Any mismatch returns `NULL`.

## Deterministic checkpoints

`ReconciliationCheckpoint` contains `checkpoint_id`, `runtime_id`, `reconciliation_merkle_root`, `traversal_position`, `deterministic_hash`, `lineage_count`, `replay_snapshot_hash`, `drift_snapshot_hash`, and `created_at`.

Checkpoints are deterministic, append-only evidence. Checkpoint identity derives only from `runtime_id`, `reconciliation_merkle_root`, `deterministic_hash`, `traversal_position`, `lineage_count`, `replay_snapshot_hash`, and `drift_snapshot_hash`; `created_at` is observational metadata only and never participates in checkpoint identity hashing. Same lineage state therefore yields the same checkpoint identity, while a different observation time alone is not a different checkpoint. They are not rollback overwrites and they do not mutate legitimacy.

## Federated drift taxonomy

The federated drift classes are:

- `federated_checkpoint_drift`
- `federated_merkle_drift`
- `federated_bundle_drift`
- `federated_attestation_drift`
- `federated_reconciliation_drift`
- `federated_runtime_divergence_drift`
- `federated_replay_drift`
- `federated_preo_drift`
- `federated_continuity_drift`
- `federated_exact_object_drift`
- `federated_identifier_resolution_drift`

All existing drift classes remain preserved.

## FATE coverage

The fail-closed FATE cases are:

- `federated_merkle_mismatch`
- `federated_checkpoint_divergence`
- `federated_replay_collision`
- `federated_exact_object_divergence`
- `federated_attestation_replay`
- `federated_runtime_identity_drift`
- `federated_preo_divergence`
- `federated_continuity_divergence`
- `federated_bundle_payload_drift`
- `remote_authority_inference`
- `remote_execution_legitimacy_inference`
- `non_deterministic_reconciliation_order`
- `federated_identifier_resolution_drift`
- `federated_composite_lookup_identifier`
- `federated_missing_canonical_identifier`
- `non_deterministic_checkpoint_identity`
- `timestamp_dependent_checkpoint_identity`

Every failure returns `NULL`.

## Forbidden semantics labels

The implementation explicitly rejects `inferred_legitimacy`, `remote_replay_trust`, `implicit_authority`, `remote_execution_inheritance`, `mutation_capable_reconciliation`, and `alternate_execution_path`.

## Federated revocation propagation observability

`FederatedRevocationEvidence` extends reconciliation with deterministic cross-runtime revocation awareness while preserving the invariant that foreign evidence is not local authority. The evidence object contains:

- `runtime_id`
- `remote_runtime_id`
- `continuity_id`
- `decision_id`
- `validated_object_hash`
- `revocation_class`
- `revocation_reason`
- `lineage_hash`
- `reconciliation_merkle_root`
- `attestation_hash`
- `observed_at`

The object is `replay_neutral: true`, `read_only: true`, `mutation_capable: false`, deterministic-serialization only, exact-object-bound, and explicitly marked `portable_evidence_not_portable_authority`. Revocation evidence identity hashes canonical lineage fields only; `observed_at`, `emitted_at`, and `created_at` are metadata excluded from deterministic evidence identity, `revocation_id`, and replay-neutral equivalence.

Remote revocation evidence envelopes are exact-object verified by comparing supplied `evidence_hash`, `exact_object_hash`, and `envelope_hash` against recomputed canonical hashes with `canonical_hash_locked: true`. Remote revocation evidence may narrow acceptance, emit drift evidence, trigger reconciliation, and emit observability telemetry. It must not change local authority, invalidate local replay state, consume invocation lineage, mutate local legitimacy, or bypass local validation. Revocation reconciliation therefore remains replay-neutral and GET-only.

## `federated_revocation_registry`

`federated_revocation_registry` is an append-only observability-only revocation evidence index. Its required fields are:

- `revocation_id`
- `runtime_id`
- `remote_runtime_id`
- `continuity_id`
- `decision_id`
- `validated_object_hash`
- `revocation_class`
- `lineage_hash`
- `reconciliation_merkle_root`
- `evidence_hash`
- `verification_status`
- `drift_class`
- `created_at`

Federation routes project registry entries as evidence envelopes only; they do not persist during GET reconciliation and do not mutate legitimacy. `revocation_id` excludes `observed_at`, `emitted_at`, and `created_at`; timestamps remain append-only observational metadata.

## Revocation-aware reconciliation flow

All federated revocation reconciliation follows:

`deterministic traversal` → `revocation evidence resolution` → `drift augmentation` → `normalized federation response`

Raw traversal output is never returned as the federation response. Revocation anchors derive only from canonical persisted registry row identifiers and canonical legitimacy lineage; `lookup_key` and composite traversal selectors are never portable revocation identity material. Revocation checkpoints derive identity only from deterministic reconciliation state; `created_at` remains append-only observational metadata and is excluded from checkpoint identity.

## Revocation drift taxonomy

The revocation-aware federated drift classes are:

- `federated_revocation_divergence_drift`
- `federated_revocation_projection_drift`
- `federated_revocation_exact_object_drift`
- `federated_revocation_anchor_drift`
- `federated_revocation_replay_drift`
- `federated_checkpoint_revocation_drift`
- `federated_expiration_visibility_drift`

## Revocation FATE coverage

The revocation fail-closed FATE cases are:

- `federated_revocation_identity_mismatch`
- `federated_revocation_replay_collision`
- `federated_revocation_without_lineage`
- `federated_remote_revocation_authority_inference`
- `federated_checkpoint_revocation_divergence`
- `federated_expired_lineage_visibility_corruption`
- `federated_revocation_exact_object_drift`
- `federated_revocation_anchor_drift`

Every case returns `NULL`.

## Governance position

The architecture remains observability federation, not authority federation: distributed legitimacy awareness WITHOUT distributed authority collapse.
