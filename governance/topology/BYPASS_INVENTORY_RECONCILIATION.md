# Bypass Inventory Reconciliation

## 1. Purpose

This artifact reconciles the bypass-path inventory topology for #1613 under the Phase 4 topology reconciliation work in #1606. It is a topology visibility and reconciliation artifact only: it compares inventory ownership, schema shape, duplicate semantics, and fail-closed consistency across the known bypass inventory files.

This artifact does not introduce runtime execution behavior, validator behavior, authority, proof generation, workflow execution, deployment behavior, or legitimacy-state mutation. It documents how bypass inventory entries should be made topology-visible and compared without changing any runtime path.

## 2. Canonical Owner Determination

`runtime/bypass_paths.json` is the canonical owner inventory for bypass-path topology reconciliation.

Therefore:

```text
runtime/bypass_paths.json
= canonical owner inventory
```

All specialized inventories are domain-specific projections unless proven otherwise. The canonical determination is based on these observed properties:

- It is the only audited inventory with top-level `artifact: "BYPASS_PATHS"` and an explicit `status: "NON_OPERATIVE"` declaration.
- It carries the broadest root-surface class list through `known_bypass_classes`.
- It defines root-oriented bypass entries for direct deploy, direct database write, workflow dispatch, undeclared mutation surfaces, observability escalation, branch protection bypass, and external platform root-authority escape hatches.
- It includes a `closure_verification` block that links the root inventory to unauthorized mutation surface closure, drift taxonomy, evidence-only status, and non-authoritative status.
- Its `required_response` convention consistently resolves bypass paths to `NULL`, including richer fail-closed phrases such as `ROOT_AUTHORITY_CONTAINMENT_REQUIRED -> NULL`.

The specialized inventories remain necessary topology views for runtime mutation, constitutional, delegation, distributed, federated, state, and temporal domains, but their entries reconcile to the root inventory through normalized comparison objects rather than replacing canonical ownership.

## 3. Inventory List

| Inventory path | Domain | Schema keys observed | Known bypass classes / entries | Fail-closed result field | Relationship to root inventory |
| --- | --- | --- | --- | --- | --- |
| `runtime/bypass_paths.json` | Root / canonical bypass topology | Top-level: `artifact`, `status`, `known_bypass_classes`, `required_response`, `bypass_paths`, `closure_verification`; entry: `path`, `bypass_id`, `risk`, `required_response` | `direct_deploy`, `direct_db_write`, `direct_webhook`, `direct_agent_tool_call`, `validator_request_level_approval`, `mutation_after_validation`, `proof_not_linked_to_aeo_hash`; entries include direct deploy, manual workflow dispatch, raw database write, undeclared mutation surface, unbound database write, observability escalation, root authority containment, direct push, force push, branch protection bypass | Top-level `required_response`; per-entry `required_response` | Canonical owner inventory; root topology target for specialized inventory reconciliation |
| `runtime/runtime_mutation_bypass_paths.json` | Runtime mutation | Top-level: `version`, `fail_closed_response`, `bypass_paths`; entry: `id`, `result` | `unauthorized_runtime_patch`, `validator_self_mutation`, `self_authorizing_runtime`, `policy_mutation` | Top-level `fail_closed_response`; per-entry `result` | Specialized runtime-mutation projection; reconciles to root mutation-bypass topology by normalized `canonical_id` and fail-closed result |
| `runtime/constitutional_bypass_paths.json` | Constitutional authority / hidden constitutional capability | Top-level: `status`, `hidden_constitutional_capability`, `quorum_without_constitutional_authority`, `fail_closed_response`; no `bypass_paths` array | `hidden_constitutional_capability`, `quorum_without_constitutional_authority` | Top-level named result fields and `fail_closed_response` | Specialized constitutional projection; reconciles as scalar bypass declarations normalized into comparison objects |
| `runtime/delegation_bypass_paths.json` | Delegation and delegated execution continuity | Top-level: `surface`, `fail_closed_response`, `bypass_paths`; entry: `bypass_id`, `result` | `delegated_authority_replay`, `stale_authority_continuation`, `quorum_emergent_legitimacy`, `detached_worker_execution`, `chained_delegation_escalation`, `multi_agent_authority_synthesis`, `orphan_orchestration_continuation` | Top-level `fail_closed_response`; per-entry `result` | Specialized delegation projection; reconciles delegation-specific authority-continuation bypasses into root authority / agent-tool / mutation-after-validation topology |
| `runtime/distributed_bypass_paths.json` | Distributed event and asynchronous execution | Top-level: `artifact`, `version`, `fail_closed_response`, `required_invariant`, `bypass_paths`; entry: `bypass_id`, `required_response` | `duplicate_queue_delivery`, `workflow_replay`, `fanout_divergence`, `orphan_retry_execution`, `stale_authority_reuse`, `webhook_without_continuity`, `cross_agent_lineage_drift`, `asynchronous_validator_escape`, `choreography_only_execution` | Top-level `fail_closed_response`; per-entry `required_response` | Specialized distributed projection; reconciles event/replay/lineage bypasses to root direct webhook, validator escape, proofless/authorityless mutation, and continuity topology |
| `runtime/federated_bypass_paths.json` | Federated / cross-runtime execution | Top-level: `required_invariant`, `fail_closed_response`, `bypass_paths`; entry: `bypass_id`, `class` | Entry classes: `replay`, `lineage`, `authority`, `continuity`, `consensus`, `staleness`, `escalation`, `validator` | Top-level `fail_closed_response`; no per-entry response field, so observed response inherits `NULL` | Specialized federated projection; reconciles cross-runtime quorum, lineage, authority, continuity, staleness, escalation, and validator bypasses to root bypass topology |
| `runtime/state_bypass_paths.json` | State / registry / replica consistency | Top-level: `version`, `bypass_paths`, `fail_closed_response`, `deterministic`; entry: `bypass_id`, `response` | `stale_registry_execution`, `replica_divergence_legitimacy`, `rollback_resurrection`, `cached_authority_continuation`, `partition_induced_execution_synthesis`, `validator_state_mismatch`, `proof_state_inconsistency`, `detached_snapshot_replay`, `post_validation_snapshot_mutation` | Top-level `fail_closed_response`; per-entry `response` | Specialized state projection; reconciles registry, replica, snapshot, validator-state, proof-state, and post-validation mutation bypasses into root mutation/proof/authority topology |
| `runtime/temporal_bypass_paths.json` | Temporal validity / expiry / replay | Top-level: `surface`, `bypass_paths`, `fail_closed_response`; entry: `bypass_id`, `response` | `stale_authority_continuation`, `expired_execution_continuation`, `delayed_replay_execution`, `frozen_proof_resurrection`, `asynchronous_temporal_drift`, `clock_skew_legitimacy_divergence`, `replay_after_continuity_expiration`, `indefinite_delegation_persistence`, `post_expiry_orchestration_continuation`, `time_partitioned_execution_synthesis` | Top-level `fail_closed_response`; per-entry `response` | Specialized temporal projection; reconciles time-bound authority, proof, replay, continuity-expiration, delegation-expiry, and orchestration-expiry bypasses to root topology |

## 4. Schema Mapping

Canonical comparison must normalize schema drift before inventories are compared. The canonical comparison object is:

```json
{
  "canonical_id": "<stable bypass identifier>",
  "surface_domain": "<root|runtime_mutation|constitutional|delegation|distributed|federated|state|temporal>",
  "bypass_mechanism": "<path or mechanism identifier>",
  "required_response": "<required fail-closed response>",
  "observed_response": "<observed inventory response>",
  "classification": "<root class, domain class, or inferred class>",
  "legitimacy_result": "NULL when fail-closed is preserved",
  "notes": "<risk, invariant, root relationship, or ambiguity>"
}
```

| Observed key | Observed inventory usage | Canonical comparison key mapping | Normalization rule |
| --- | --- | --- | --- |
| `id` | `runtime/runtime_mutation_bypass_paths.json` entries | `canonical_id`; also `bypass_mechanism` when no separate mechanism field exists | Treat as the stable bypass identifier. |
| `bypass_id` | Root and most specialized `bypass_paths` entries | `canonical_id`; also `bypass_mechanism` when no separate `path` exists | Treat as the stable bypass identifier. |
| `path` | Root inventory entries | `bypass_mechanism`; `canonical_id` fallback only if `bypass_id` is missing | Root path labels describe the concrete bypass mechanism. |
| `result` | Runtime mutation and delegation per-entry result | `observed_response`; also `legitimacy_result` if value is `NULL` | Compare with top-level `fail_closed_response`; fail-closed is preserved when value resolves to `NULL`. |
| `response` | State and temporal per-entry response | `observed_response`; also `legitimacy_result` if value is `NULL` | Compare with top-level `fail_closed_response`; fail-closed is preserved when value resolves to `NULL`. |
| `required_response` | Root and distributed per-entry response; root top-level response | `required_response`; also `observed_response` when it states the actual inventory response | If the value contains a phrase ending in `-> NULL` or includes `NULL/...`, normalize `legitimacy_result` to `NULL` while retaining the full phrase in `required_response`. |
| `class` | Federated per-entry class | `classification` | Domain-specific bypass class; because federated entries have no per-entry response, `observed_response` inherits top-level `fail_closed_response`. |

Additional top-level mappings:

| Top-level key | Canonical comparison use |
| --- | --- |
| `artifact` | Inventory identity / notes; may inform `surface_domain`. |
| `surface` | `surface_domain` when present. |
| `known_bypass_classes` | Root `classification` vocabulary and topology class hints. |
| `fail_closed_response` | Default `required_response`, `observed_response`, and `legitimacy_result` for entries without per-entry response fields. |
| `required_invariant` | `notes`; informs reconciliation classification but does not replace fail-closed response. |
| `risk` | `notes`; root risk context for topology visibility. |
| `status` | `notes`; does not confer authority. |
| `closure_verification` | `notes`; root closure and drift-taxonomy context. |

## 5. Duplicate Classification

The semantic duplicate scan identifies one duplicated `canonical_id` across the audited inventories:

| Duplicate semantic entry | Inventories | Classification | Domain-specific meaning | Reconciliation handling |
| --- | --- | --- | --- | --- |
| `stale_authority_continuation` | `runtime/delegation_bypass_paths.json`; `runtime/temporal_bypass_paths.json` | Intentional multi-view entry | In the delegation context, the bypass is continuation of delegated authority after the delegation should no longer authorize execution. In the temporal context, the bypass is continuation of authority after time validity, expiry, or continuity freshness has lapsed. These overlap semantically but inspect different topology dimensions: delegated authority propagation versus time-bound legitimacy. | Keep both specialized entries. Normalize both to the same `canonical_id` but distinct `surface_domain` values (`delegation` and `temporal`). Reconcile as `MULTI_VIEW_INTENTIONAL` when both preserve fail-closed `NULL`; classify as drift only if either domain omits fail-closed response or claims independent legitimacy. |

No other duplicated normalized bypass identifiers were observed across the eight audited inventories.

## 6. Reconciliation Rule

Specialized inventories reconcile into the canonical topology-visible inventory through this deterministic rule:

```text
specialized inventory entry
→ normalized canonical comparison object
→ root inventory relationship
→ fail-closed consistency check
→ topology-visible reconciliation classification
```

Detailed rule:

1. Select each inventory entry. For array-based inventories, each `bypass_paths[]` item is an entry. For scalar constitutional declarations, each non-metadata `NULL` field is treated as a bypass declaration entry.
2. Normalize the entry into a canonical comparison object using the schema mapping above.
3. Assign `surface_domain` from the inventory path or `surface` key.
4. Assign `canonical_id` from `bypass_id`, then `id`, then `path`, then the scalar field name.
5. Assign `bypass_mechanism` from `path` when present; otherwise use `canonical_id`.
6. Assign `required_response` from per-entry `required_response`, then per-entry `result` or `response`, then top-level `fail_closed_response`, then top-level `required_response`.
7. Assign `observed_response` from per-entry `result`, `response`, or `required_response`; if absent, inherit top-level `fail_closed_response` or `required_response`.
8. Normalize `legitimacy_result` to `NULL` when the response is exactly `NULL`, ends in `-> NULL`, or uses a qualified `NULL/<reason>` form.
9. Link the normalized object to `runtime/bypass_paths.json` as the canonical owner. The link may be exact (`canonical_id` exists in root) or class-based (`classification`, root `known_bypass_classes`, root drift taxonomy, or root risk context covers the mechanism).
10. Emit a topology-visible reconciliation classification:
    - `ROOT_CANONICAL_ENTRY` for root inventory entries.
    - `SPECIALIZED_PROJECTION_RECONCILED` for specialized entries with root class or risk coverage and fail-closed `NULL`.
    - `MULTI_VIEW_INTENTIONAL` for duplicate semantic entries that intentionally represent different surface domains and preserve fail-closed `NULL`.
    - One of the failure classifications below when ownership, mapping, duplicate treatment, fail-closed behavior, root relationship, or topology visibility is incomplete.

This rule preserves the canonical owner while allowing specialized inventories to remain domain-specific projections. It also prevents schema drift from becoming semantic drift by comparing normalized objects rather than raw key names.

## 7. Failure Classifications

| Failure classification | Definition | Required remediation |
| --- | --- | --- |
| `CANONICAL_OWNER_MISSING` | No inventory is explicitly declared as the root/canonical bypass inventory. | Declare a canonical owner or block closure. For this audit, `runtime/bypass_paths.json` is declared canonical. |
| `SCHEMA_MAPPING_MISSING` | An observed key or inventory shape cannot be mapped into the canonical comparison object. | Add a mapping rule before comparing or closing reconciliation. |
| `DUPLICATE_UNCLASSIFIED` | A normalized `canonical_id` appears in more than one inventory without an intentional multi-view, schema drift, duplicate drift, or unresolved ambiguity classification. | Classify the duplicate and document its domain-specific meaning. |
| `FAIL_CLOSED_MISMATCH` | A bypass entry does not resolve to `NULL`, omits an inheritable fail-closed response, or claims legitimacy instead of nullifying execution. | Treat the entry as unreconciled drift until the inventory is corrected or explicitly explained. |
| `ROOT_RELATIONSHIP_MISSING` | A specialized entry cannot be related to the canonical root inventory by exact identifier, class, root risk, or drift-taxonomy coverage. | Add a root relationship note, root class coverage, or canonical inventory entry. |
| `TOPOLOGY_RECONCILIATION_INCOMPLETE` | Inventory comparison does not produce a topology-visible classification for each root and specialized entry. | Complete normalization, root relationship assignment, fail-closed check, and reconciliation classification. |

## 8. Closure Recommendation

#1613 may close after review.

The unresolved items identified by the cooldown audit are satisfied by this artifact:

- Canonical owner inventory is explicitly declared as `runtime/bypass_paths.json`.
- Schema comparison keys are normalized through a canonical comparison object and mapping table.
- The duplicated semantic entry `stale_authority_continuation` is classified as an intentional multi-view entry across delegation and temporal domains.
- The reconciliation rule proves specialized inventories roll into a topology-visible root inventory relationship through normalized comparison, root relationship assignment, fail-closed consistency, and reconciliation classification.

No remaining blockers are identified for #1613 closure, subject to reviewer acceptance of the canonical owner declaration and duplicate classification.

## Boundary Statement

This artifact is read-only documentation/specification work. It introduces no runtime route changes, validator changes, deploy changes, workflow changes, execution behavior changes, proof generation, authority mutation, registry mutation, or legitimacy-state mutation.
