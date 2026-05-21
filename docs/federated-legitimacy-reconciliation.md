# Federated Legitimacy Reconciliation

## Federation model
MindShift federation reconciliation is **read-only** and **evidence-only**. Remote nodes provide comparative snapshots only; they cannot mutate local runtime state.

## Trust assumptions
Each federated node declares:
- `node_id`
- `governance_version`
- `schema_version`
- `canonical_hash_algorithm`
- `trust_classification`
- `federation_mode`

Allowed federation modes:
- `OBSERVE_ONLY`
- `RECONCILE_ONLY`

Forbidden federation modes:
- `REMOTE_EXECUTION`
- `REMOTE_AUTHORITY`
- `REMOTE_PROOF_ISSUANCE`

## Evidence-only semantics
Federation evidence is comparison material and **never authority**.
Reconciliation output is read-only and preserves:
- `evidence_only: true`
- `read_only: true`
- `mutation_capable: false`
- `creates_authority: false`
- `creates_proof: false`
- `remote_execution_legitimacy: false`

## Drift classes
- `FEDERATION_PROOF_DIVERGENCE`
- `FEDERATION_LINEAGE_DIVERGENCE`
- `FEDERATION_CONTINUITY_MISMATCH`
- `FEDERATION_REPLAY_DIVERGENCE`
- `FEDERATION_ORPHAN_PROOF`
- `FEDERATION_TOPOLOGY_MISMATCH`
- `FEDERATION_SCHEMA_MISMATCH`
- `FEDERATION_UNKNOWN_NODE`
- `FEDERATION_UNTRUSTED_NODE`
- `FEDERATION_NON_CANONICAL_HASH`

## Reconciliation topology
Comparison checks:
- lineage continuity equivalence
- proof ancestry equivalence
- validation equivalence
- replay lineage equivalence
- governance topology equivalence
- divergence/orphaning/drift classification

## Non-authority guarantee
External federation evidence does not grant local authority and does not grant execution permission.

## Canonical runtime preservation
Canonical runtime chain remains unchanged:
`/session` → `/continuity` → `/authority` → `/compile` → `/validate` → `/execute` → `/proof`


## Canonical federation literals (deterministic parity)
- `runtime_id`
- `portable_identifier == canonical_persisted_identifier`
- `created_at` is observational metadata only

## Portable legitimacy bundle fields
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

## Remote runtime classifications
- `LOCAL_RUNTIME`
- `FEDERATED_RUNTIME`
- `EXTERNAL_REFERENCE`
- `UNTRUSTED_RUNTIME`
- `PORTABLE_EVIDENCE_ONLY`

## Forbidden semantics
The following semantics are forbidden and must never be present:
- `inferred_legitimacy`
- `remote_replay_trust`
- `implicit_authority`
- `remote_execution_inheritance`
- `mutation_capable_reconciliation`
- `alternate_execution_path`

## Federated drift taxonomy
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

## FATE cases (all fail closed to NULL)
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

## Federated revocation evidence fields
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

## Federated revocation drift taxonomy
- `federated_revocation_divergence_drift`
- `federated_revocation_projection_drift`
- `federated_revocation_replay_drift`
- `federated_checkpoint_revocation_drift`
- `federated_expiration_visibility_drift`
- `federated_revocation_exact_object_drift`
- `federated_revocation_anchor_drift`

## Federated revocation FATE cases (all fail closed to NULL)
- `federated_revocation_identity_mismatch`
- `federated_revocation_replay_collision`
- `federated_revocation_without_lineage`
- `federated_remote_revocation_authority_inference`
- `federated_checkpoint_revocation_divergence`
- `federated_expired_lineage_visibility_corruption`
- `federated_revocation_envelope_hash_mismatch`
- `federated_revocation_exact_object_flag_drift`
- `federated_revocation_anchor_mismatch`
- `federated_revocation_reconciliation_hash_as_validated_hash`
- `federated_revocation_stale_envelope_replay`
