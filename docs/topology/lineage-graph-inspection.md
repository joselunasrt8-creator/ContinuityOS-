# Lineage Graph Inspection

## Purpose
Define a read-only lineage graph inspection model for legitimacy traversal across authority, continuity, proof, replay, execution, deployment, reconciliation, registry, and observability artifacts.

## Canonical invariant
lineage inspection = read-only legitimacy traversal

## Non-operative boundary statement
Inspection is evidence-only topology analysis and must not become legitimacy authority.

## Lineage entity taxonomy

| lineage_type | lineage_class | authoritative | evidence_only | derived | replay_sensitive | append_only | source_of_truth |
|---|---|---:|---:|---:|---:|---:|---|
| authority_lineage | authoritative_lineage | true | false | false | true | true | authority_registry |
| proof_lineage | evidence_only_lineage | false | true | false | true | true | proof_registry |
| continuity_lineage | authoritative_lineage | true | false | false | true | true | continuity_registry |
| replay_lineage | replay_sensitive_lineage | false | true | true | true | true | invocation_registry |
| deployment_lineage | derived_lineage | false | true | true | true | true | deployment_provenance_registry |
| registry_lineage | derived_lineage | false | true | true | false | true | registry_mutation_inventory |
| observability_lineage | evidence_only_lineage | false | true | true | false | true | observability_inventory |
| reconciliation_lineage | derived_lineage | false | true | true | false | true | topology_reconciliation_registry |

## Relationship taxonomy

Canonical traversal spine:

Authority → AEO → Validator → Execution → Proof → Continuity → Reconciliation → Observability

Attached read-only lineage layers:
- deployment lineage
- registry lineage
- replay lineage

Representative relationships:
- `authority_binds_aeo`
- `aeo_validated_by_validator`
- `validator_allows_execution`
- `execution_emits_proof`
- `proof_binds_continuity`
- `proof_binds_deployment`
- `deployment_references_registry_artifacts`
- `continuity_links_reconciliation`
- `reconciliation_observed_by_observability`
- `replay_tuple_links_authority_execution_proof`

## Traversal semantics
- **Lineage ancestry traversal**: walk predecessor edges to the authority root; missing parent becomes orphan evidence.
- **Orphan lineage detection**: mark orphan when required predecessor/target is absent, malformed, or `UNKNOWN`.
- **Replay lineage traversal**: walk invocation/authority/validation/execution/proof tuple edges for reuse inspection only.
- **Continuity chain inspection**: detect continuity gaps, forks, and non-deterministic branch points.
- **Deployment provenance traversal**: bind deployment artifacts back to proof/execution/authority evidence.
- **Proof relationship traversal**: inspect proof links to execution/continuity/deployment/reconciliation; unresolved links remain `UNKNOWN`.
- **Distributed disagreement inspection**: compare reconciliation + observability evidence across domains without mutation.
- **Registry relationship traversal**: inspect append-only cross-registry lineage references.

## Orphan lineage analysis
An object is treated as orphan lineage evidence when any of the following are true:
- missing authority parent
- missing continuity predecessor
- proof without execution reference
- deployment without proof binding
- registry reference target absent
- reconciliation checkpoint without continuity anchor
- observability event without subject reference
- unknown source or target (`UNKNOWN`)

## Replay lineage analysis
Replay-sensitive inspection edges include:
- `authority_registry -> validation_registry`
- `validation_registry -> execution_registry`
- `execution_registry -> proof_registry`
- `invocation_registry -> execution_registry`
- `invocation_registry -> proof_registry`
- `continuity_registry -> execution_registry`

All replay analysis is read-only and must not mutate reuse status, replay counters, or execution eligibility.

## Distributed disagreement analysis
Disagreement inspection compares reconciliation checkpoints, observed lineage snapshots, and continuity/proof anchors for non-matching states.

Outputs are evidence classifications only (`MATCH`, `DIVERGENT`, `UNKNOWN`) and never remediation actions.

## Non-authoritative guarantees
- No runtime mutation.
- No validator mutation.
- No proof mutation.
- No execution mutation.
- No replay mutation.
- No registry rewrite.
- No schema refactor.
- No deployment mutation.
- No authority generation.
- No graph-driven execution.
- No autonomous remediation.

## Implementation boundary
This layer models traversal and inspection semantics only. It does not create authority, create legitimacy, or alter canonical runtime enforcement behavior.
