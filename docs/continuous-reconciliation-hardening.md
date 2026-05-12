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
