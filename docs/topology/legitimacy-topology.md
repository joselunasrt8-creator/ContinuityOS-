# Legitimacy Topology Visualization Layer (Issue #924)

## Purpose
This document defines a **read-only visualization layer** that compresses MindShift legitimacy topology into human-readable diagrams.

Core invariant:

`visualization = visibility, not authority`

The visualization layer is descriptive only and is intentionally non-authoritative.

## Source artifacts
This visualization derives from existing topology and runtime artifacts:
- `governance/runtime/EXECUTION_SURFACE_MAP.json`
- `governance/runtime/LINEAGE_GRAPH_INSPECTION_MODEL.json`
- `governance/runtime/NEO4J_RUNTIME_TOPOLOGY_MODEL.json`
- `docs/topology/execution-surface-map.md`
- `docs/topology/execution-surface-map.mmd`
- `docs/topology/lineage-graph-inspection.md`
- `docs/topology/lineage-traversal.mmd`
- `docs/topology/neo4j-runtime-topology.md`

## Visualization boundary
This layer may:
- observe
- aggregate
- render
- compress topology for human inspection

This layer may not:
- authorize
- validate
- execute
- create proof
- mutate runtime registries
- override runtime state

If a graph view disagrees with runtime registry state, **runtime registry state wins**.

## Canonical flow diagram
Canonical legitimacy flow:

Intent → Authority → AEO → Validator → Execution Boundary → Proof → Registry → Observability

Diagram: `docs/topology/legitimacy-flow.mmd`

## Execution boundary map
Execution surface topology:

workflow_dispatch → deploy-token authority → deploy wrapper → deployment mutation → registry write → proof / observability evidence

Blocked direct paths are explicitly shown as:
- direct deploy
- direct token use
- direct registry write
- observability mutation

Each blocked edge is labeled:

`NULL unless legitimacy-bound`

Diagram: `docs/topology/execution-boundary-map.mmd`

## Observability isolation diagram
Observability isolation rule:

`observability != authority`

Telemetry and dashboards:
- may observe
- may aggregate
- may render
- may not authorize
- may not validate
- may not execute
- may not create proof

This isolation is visualized in `docs/topology/legitimacy-flow.mmd` via explicit non-authoritative blocked relationships.

## Lineage traversal diagram
Lineage traversal path:

Authority → AEO → Validator → Execution → Proof → Continuity → Reconciliation → Observability

Existing lineage visualization reference:
- `docs/topology/lineage-traversal.mmd`

This document treats lineage traversal as read-only evidence traversal.

## Neo4j topology boundary
Neo4j boundary:

Runtime registries → derived graph projection → Neo4j inspection → visualization

Explicit invariant:

`Neo4j != runtime authority`

Neo4j topology is an inspection model that cannot create authority, cannot mutate runtime, and cannot issue execution permission.

## Mutation-surface visualization summary
Mutation-capable surfaces are partitioned as visualization classes:
- deployment surfaces
- token authority surfaces
- registry mutation surfaces
- observability write surfaces
- workflow dispatch surfaces

Each surface is tagged with closure posture:
- `OPEN`
- `MONITORED`
- `CLOSED`
- `UNKNOWN`

These tags are interpretation aids only and do not grant or deny authority by themselves.

## Misuse risks
Primary misuse risks:
- treating diagrams as authority issuers
- treating graph adjacency as execution permission
- inferring validator outcomes from visualization alone
- treating observability as a mutation-capable control plane
- treating Neo4j projection state as runtime source-of-truth

## Non-authoritative guarantees
This visualization layer guarantees:
- diagrams do not create authority
- diagrams do not validate objects
- diagrams do not execute actions
- diagrams do not create proof
- diagrams do not mutate registries
- diagrams do not override runtime state
- diagrams are derived visibility only
- if graph disagrees with runtime registry, runtime registry wins

## Bounded closure proposal
Adopt a bounded closure posture for topology readability:
- keep high-risk mutation surfaces `MONITORED`
- keep observability write surfaces `CLOSED` unless explicitly governance-bound
- classify unverified surfaces as `UNKNOWN` until reconciled
- treat `OPEN` as unresolved closure requiring explicit governance follow-up

This proposal is documentation-only and non-executing.

## Final invariant
Legitimacy visualization improves topology comprehension without mutating legitimacy.
