# Continuous Reconciliation Hardening

## 1. Continuous Reconciliation Architecture

Continuous reconciliation is an observability-only verifier over persisted legitimacy lineage. It does not create authority, validation, execution, proof, PREO, continuity, or replay state. The verifier traverses the canonical runtime path `/session -> /continuity -> /authority -> /compile -> /validate -> /execute -> /proof` from persisted proof roots back through exact recorded ancestry.

The scheduler is deterministic:

1. Select proof roots by `created_at ASC`, `decision_id ASC`, `execution_id ASC`, `proof_id ASC`.
2. Persist only observability/drift evidence.
3. Use cursor material composed of registry name, lookup key, timestamp, and deterministic hash evidence.
4. Restart from the last confirmed traversal position without reserving replay state.
5. Return `NULL` for any ambiguous ancestry, replay ambiguity, traversal instability, proof discontinuity, PREO mismatch, drift ambiguity, reconciliation mutation, or federation trust assumption.

Reconciliation may observe legitimacy. Reconciliation must never create legitimacy.

## 2. Reconciliation Verification Loop

| Position | Step | Read set | Required verification | Failure |
| --- | --- | --- | --- | --- |
| 1 | Select canonical roots | `proof_registry` | Stable ordering and duplicate proof lineage pre-scan. | `NULL` |
| 2 | Verify proof continuity | `proof_registry`, `execution_registry`, `validation_registry`, `authority_registry`, `aeo_registry` | `decision_id`, `execution_id`, and `validated_object_hash` equality; proof lineage fields match authority/execution rows. | `NULL` |
| 3 | Verify recursive ancestry | `continuity_registry`, `session_registry` | Explicit parent traversal reaches exactly one root; cycles, orphan parents, hash mismatches, session/identity mismatches, and depth violations fail closed. | `NULL` |
| 4 | Verify replay lineage | `invocation_registry`, `validation_registry`, `execution_registry`, `proof_registry` | Nonce equality from validation through execution; duplicate lineage replay and duplicate workflow run evidence fail closed. | `NULL` |
| 5 | Verify PREO lineage | `preo_registry`, `authority_registry`, `proof_registry` | PREO `reviewed_hash`, `reviewed_tree_hash`, `merge_commit_sha`, `authority_id`, and `continuity_id` match the exact legitimacy object. | `NULL` |
| 6 | Verify revocation propagation | `continuity_registry`, `authority_registry`, `validation_registry`, `invocation_registry` | Revoked or expired ancestors have no active/valid/reserved descendant legitimacy. | `NULL` |
| 7 | Emit evidence | `observability_registry`, `drift_registry` | Deterministic payload schema and deterministic drift classification. | `NULL` |

## 3. Drift Telemetry Expansion

Every reconciliation drift payload must include:

| Field | Meaning |
| --- | --- |
| `registry` | Registry where the divergence was observed. |
| `lookup_key` | Exact lookup key used for deterministic traversal. |
| `expected_lineage` | Canonical expected lineage object, or `null` when absence is expected. |
| `observed_lineage` | Canonical observed lineage object, or `null` when absent. |
| `drift_class` | Deterministic reconciliation drift class. |
| `reconciliation_depth` | Recursive traversal depth at detection. |
| `canonical_traversal_position` | Deterministic loop position. |
| `deterministic_hash_evidence` | Canonical SHA-256 evidence for the compared lineage material. |

Expanded reconciliation drift classes:

- `reconciliation_failure_drift`
- `recursive_ancestry_drift`
- `replay_chain_drift`
- `proof_lineage_drift`
- `preo_ancestry_drift`
- `revocation_propagation_drift`
- `duplicate_lineage_hash_drift`
- `orphan_legitimacy_object_drift`
- `federated_lineage_drift`
- `traversal_instability_drift`
- `telemetry_payload_drift`

Telemetry remains observability-only and cannot authorize, repair, reserve, revoke, or mutate legitimacy.

## 4. Federated Integrity Model

Federated lineage is portable evidence, not portable authority. A remote runtime reference is never trusted by implication. Local validation remains mandatory.

Federated reconciliation requires:

- deterministic lineage portability across runtimes;
- canonical hash stability for proof, authority, execution, replay, and PREO references;
- replay-aware federation fields: `runtime_id`, `decision_id`, `validated_object_hash`, `invocation_nonce`, `proof_id`, and `revocation_state`;
- explicit trust-boundary classification for local runtime, remote runtime reference, external authority reference, and portable proof bundle;
- revocation propagation semantics that classify remote revocation as bounded evidence until locally reconciled.

Forbidden assumptions:

- trusted federation by default;
- inferred remote legitimacy;
- bypass of local validation;
- remote proof continuity replacing local proof continuity.

## 5. Reconciliation FATE Matrix

| FATE test | Corruption injected | Expected result |
| --- | --- | --- |
| `orphan_proof_detection` | Proof exists without execution, validation, or authority ancestry. | `NULL` |
| `recursive_lineage_divergence` | Continuity parent pointer or parent hash diverges. | `NULL` |
| `replay_chain_corruption` | Invocation nonce differs between validation and execution. | `NULL` |
| `preo_ancestry_corruption` | PREO `authority_id` or `continuity_id` mismatches authority lineage. | `NULL` |
| `federated_lineage_mismatch` | Remote proof reference hash differs from local expected hash. | `NULL` |
| `duplicate_lineage_replay` | Competing proof/replay lineage uses the same `decision_id` and `validated_object_hash`. | `NULL` |
| `stale_revocation_propagation` | Descendant remains active after ancestor revocation or expiry. | `NULL` |
| `deterministic_traversal_stability` | Same registry state yields different traversal order. | `NULL` |
| `reconciliation_hash_instability` | Canonical hash re-derivation changes across passes. | `NULL` |
| `observability_payload_drift` | Telemetry omits required reconciliation payload fields. | `NULL` |

## 6. Recursive Traversal Rules

- Start from the exact persisted object under verification.
- Follow only explicit `parent_continuity_id` references.
- Never infer missing ancestry.
- Recompute canonical continuity hashes at every depth.
- Terminate only at exactly one root with no `parent_continuity_id`.
- Detect cycles and depth overflow deterministically.
- Preserve `canonical_traversal_position` and `reconciliation_depth` in drift evidence.

## 7. Replay Lineage Rules

- `validation_registry`, `invocation_registry`, `execution_registry`, and `proof_registry` must share `decision_id` and `validated_object_hash`.
- `invocation_nonce` must match from validation through execution.
- Reconciliation must not reserve, consume, or release replay state.
- Duplicate lineage hashes and duplicate `workflow_run_id` evidence classify as replay drift.
- Ambiguous replay lineage returns `NULL`.

## 8. Revocation Integrity Rules

- Revoked or expired continuity ancestors invalidate descendant legitimacy.
- Descendant authority, validation, and invocation rows must reflect ancestor revocation.
- Stale descendant `ACTIVE`, `VALID`, or `RESERVED` states classify as `revocation_propagation_drift`.
- Verification observes propagation gaps only and never auto-heals stale rows.

## 9. Observability Constraints

- Telemetry is evidence only.
- Drift rows cannot create, repair, or authorize legitimacy.
- Payloads must be deterministic except for emission timestamp.
- `expected_lineage` and `observed_lineage` must be canonicalized before hash evidence is computed.
- Ambiguous drift classification returns `NULL` rather than best-effort classification.

## 10. Failure Classification Matrix

| Condition | Drift class | Result |
| --- | --- | --- |
| Ambiguous ancestry | `recursive_ancestry_drift` | `NULL` |
| Replay ambiguity | `replay_chain_drift` | `NULL` |
| Traversal instability | `traversal_instability_drift` | `NULL` |
| Proof discontinuity | `proof_lineage_drift` | `NULL` |
| PREO mismatch | `preo_ancestry_drift` | `NULL` |
| Drift ambiguity | `reconciliation_failure_drift` | `NULL` |
| Reconciliation mutation | `telemetry_payload_drift` | `NULL` |
| Federation trust assumption | `federated_lineage_drift` | `NULL` |

## 11. Deterministic Scheduler Windows

The `/reconcile/schedule` observability route exposes a deterministic, bounded reconciliation window; the base `/reconcile` route remains a non-DB-touching NULL sentinel. It selects persisted proof roots in the canonical scheduler order and returns schedule anchors only; it never reserves replay state, never consumes authority, never mutates registries, and never triggers execution. The window identity is a SHA-256 hash over JCS-normalized anchors, batch limit, and ordering material, so replaying the same registry state yields the same schedule identity.

Scheduler invariants:

- read-only `SELECT` traversal over proof roots;
- bounded batch size of `25` anchors;
- stable ordering by `proof_registry.created_at ASC`, `proof_registry.decision_id ASC`, `proof_registry.execution_id ASC`, and `proof_registry.proof_id ASC`;
- canonical traversal sequencing through the existing recursive reconciliation substrate;
- fail-closed `NULL` status when no valid object exists.

## 12. Reconciliation Reporting Layer

The `/reconcile/report` route returns a reconciliation summary object, and `/reconcile/drift` returns only deterministic drift classifications for the same exact traversal. Both routes are read-only, non-authoritative, and fail closed. A report includes `reconciliation_id`, `reconciliation_timestamp`, `status`, `lineage_anchor`, `traversal_trace`, `drift_classifications`, `registry_lineage_anchors`, and `registry_integrity_summary`. The timestamp is evidence only and is excluded from deterministic reconciliation ID material.

Reports preserve exact-object discipline by hashing the exact canonical summary payload into a portable envelope. A report can describe lineage continuity or divergence, but it cannot repair lineage, create legitimacy, or stand in for `/validate`, `/execute`, or `/proof`.

## 13. Federation and Portability Semantics

Federated lineage verification treats remote evidence as bounded evidence, never inherited trust. Trust-domain boundaries are explicit: `local_runtime`, `foreign_runtime`, and `portable_proof_bundle`. A foreign lineage claim must include `runtime_id`, `trust_domain`, `lineage_hash`, `parent_lineage_hash`, `decision_id`, `validated_object_hash`, `invocation_nonce`, `proof_id`, and `revocation_state`. Federation recursion is bounded by the same reconciliation maximum depth, and remote replay state is isolated: it is not reserved, consumed, released, or inferred locally.

Portable reconciliation exchange uses JCS canonicalization, a DSSE-compatible payload type, and content-addressed lineage hashes. Portable structures cover reconciliation payloads, lineage evidence, drift reports, reconciliation proofs, and federated reconciliation exchange. A portable object is valid evidence only when its `exact_object_hash` matches the exact canonical payload being exchanged. Portable bundle identifiers must come from canonical persisted registry row fields only; `lookup_key` and composite traversal anchors are not portable identity material. Checkpoint identity hashes deterministic reconciliation state only; `created_at` is observational metadata excluded from identity.

Additional reconciliation drift classes:

- `foreign_ancestry_mismatch_drift`
- `scheduler_ordering_instability_drift`
- `reconciliation_report_drift`
- `portable_serialization_mismatch_drift`
- `federated_replay_discontinuity_drift`
- `deterministic_traversal_instability_drift`
- `reconciliation_payload_corruption_drift`
- `federated_identifier_resolution_drift`

Additional FATE coverage:

| FATE test | Corruption injected | Expected result |
| --- | --- | --- |
| `federated_lineage_divergence` | Foreign runtime lineage hash continuity breaks across a trust-domain boundary. | `NULL` |
| `foreign_ancestry_mismatch` | Foreign ancestry claims a local root or mismatched parent lineage. | `NULL` |
| `scheduler_ordering_instability` | The same proof window cannot be ordered by canonical scheduler keys. | `NULL` |
| `reconciliation_report_drift` | Report omits trace, anchors, deterministic ID, timestamp, or drift classification. | `NULL` |
| `portable_serialization_mismatch` | JCS canonical hash differs from portable envelope `exact_object_hash`. | `NULL` |
| `federated_replay_discontinuity` | Foreign replay tuple diverges from local decision/object/nonce lineage. | `NULL` |
| `deterministic_traversal_instability_expanded` | Canonical traversal sequence changes across equivalent inputs. | `NULL` |
| `reconciliation_payload_corruption` | Portable reconciliation payload hash or drift class is corrupted. | `NULL` |
| `federated_identifier_resolution_drift` | Portable identifier resolution cannot bind to canonical persisted row identifiers. | `NULL` |
| `federated_composite_lookup_identifier` | Composite traversal lookup key is offered as portable identity material. | `NULL` |
| `federated_missing_canonical_identifier` | Canonical persisted row identifier is absent during portable bundle emission. | `NULL` |
| `non_deterministic_checkpoint_identity` | Identical reconciliation lineage emits divergent checkpoint identity. | `NULL` |
| `timestamp_dependent_checkpoint_identity` | Checkpoint identity changes because observation timestamp changed. | `NULL` |

Expanded failure classifications:

| Condition | Drift class | Result |
| --- | --- | --- |
| Foreign ancestry mismatch | `foreign_ancestry_mismatch_drift` | `NULL` |
| Scheduler ordering instability | `scheduler_ordering_instability_drift` | `NULL` |
| Reconciliation report drift | `reconciliation_report_drift` | `NULL` |
| Portable serialization mismatch | `portable_serialization_mismatch_drift` | `NULL` |
| Federated replay discontinuity | `federated_replay_discontinuity_drift` | `NULL` |
| Deterministic traversal instability | `deterministic_traversal_instability_drift` | `NULL` |
| Reconciliation payload corruption | `reconciliation_payload_corruption_drift` | `NULL` |

## Federated revocation propagation observability

Federated revocation propagation extends reconciliation with distributed revocation awareness while preserving sovereignty: foreign evidence is not local authority. The runtime may observe, verify, classify, and emit evidence, but it does not grant authority, inherit legitimacy, consume replay state, bypass local validation, or mutate runtime legitimacy.

The observability registry is `federated_revocation_observability_registry`. Its evidence object is `FederatedRevocationEvidence` with `runtime_id`, `remote_runtime_id`, `continuity_id`, `decision_id`, `validated_object_hash`, `revocation_class`, `revocation_reason`, `lineage_hash`, `reconciliation_merkle_root`, `attestation_hash`, and `observed_at`.

Revocation evidence is `replay_neutral`, `read_only`, `mutation_capable: false`, `portable_evidence_not_portable_authority`, `deterministic_serialization`, and `exact_object_bound`. Runtime assertions keep `remote_authority_inherited: false`, `remote_execution_legitimacy: false`, and `replay_state_consumed: false`.

New drift classes are `federated_revocation_divergence_drift`, `federated_revocation_projection_drift`, `federated_revocation_replay_drift`, `federated_checkpoint_revocation_drift`, and `federated_expiration_visibility_drift`.

New FATE cases all produce `NULL`: `federated_revocation_identity_mismatch`, `federated_revocation_replay_collision`, `federated_revocation_without_lineage`, `federated_remote_revocation_authority_inference`, `federated_checkpoint_revocation_divergence`, and `federated_expired_lineage_visibility_corruption`.

Revocation envelope verification is exact-object-bound. The runtime recomputes `evidence_hash` and `envelope_hash`, requires `exact_object_bound` and `canonical_hash_locked`, and fails closed with `federated_revocation_exact_object_drift` on mismatch. Revocation evidence uses canonical persisted identifiers only; `lookup_key` remains traversal-only evidence and must not be projected into portable identity.

Additional revocation drift classes are `federated_revocation_exact_object_drift`, `federated_revocation_anchor_drift`, and `federated_identifier_resolution_drift`. Additional FATE cases producing `NULL` are `federated_revocation_envelope_hash_mismatch`, `federated_revocation_exact_object_flag_drift`, `federated_revocation_anchor_mismatch`, `federated_revocation_reconciliation_hash_as_validated_hash`, and `federated_revocation_stale_envelope_replay`.
| Federated identifier resolution failure | `federated_identifier_resolution_drift` | `NULL` |
