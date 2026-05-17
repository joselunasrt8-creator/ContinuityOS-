# MindShift Control Graph Bootstrap

Status: Non-Operative  
Layer: Repo Topology → Neo4j Observability → Legitimacy Traversal → Reconciliation Visualization

## Purpose

This document explains how to bootstrap the MindShift Control Graph from repository files into a machine-queryable observability graph.

The Control Graph is not runtime authority.

It exists to make legitimacy topology visible.

Core invariant:

```text
Neo4j visibility
≠ runtime authority
```

and:

```text
observability
≠ validation
```

## Pipeline

```text
repo extraction
→ graph JSON
→ Neo4j ingestion
→ runtime topology graph
→ legitimacy traversal
→ reconciliation visualization
```

## Boundary

The graph stack must not:

- create authority
- validate AEOs
- execute runtime actions
- generate proof
- mutate canonical registries
- deploy infrastructure
- imply that reality changed

All state-changing actions still require:

```text
Authority
→ ATAO
→ AEO
→ Ω Validator
→ Execution Boundary
→ Proof
→ Registry
```

## Artifacts

| Artifact | Role |
|---|---|
| `docs/control-graph-taxonomy.md` | Defines node classes, edge classes, ingestion targets, and invariants. |
| `scripts/extract_repo_graph.py` | Extracts repo-local topology into deterministic graph JSON. |
| `graph/repo_graph.json` | Generated graph object fixture/output. |
| `scripts/ingest_neo4j.py` | Ingests graph JSON into Neo4j as observability-only graph state. |
| `graph/runtime-topology.cypher` | Queries runtime topology and graph structure. |
| `graph/legitimacy-traversals.cypher` | Queries legitimacy relationships and possible gaps. |
| `graph/reconciliation-views.cypher` | Queries proof, registry, continuity, and reconciliation visibility. |

## Step 1 — Extract repo graph

Run:

```bash
python3 scripts/extract_repo_graph.py
```

Expected output:

```text
graph/repo_graph.json
```

The extractor scans repo-local files only.

It should emit metadata similar to:

```json
{
  "mode": "observability_only",
  "runtime_authority": false,
  "network_calls": false,
  "runtime_mutation": false
}
```

## Step 2 — Inspect generated graph JSON

Run:

```bash
python3 scripts/extract_repo_graph.py --stdout
```

Review:

- `metadata.mode`
- `metadata.runtime_authority`
- `nodes[]`
- `edges[]`

Required invariant:

```text
metadata.mode == observability_only
metadata.runtime_authority == false
```

## Step 3 — Configure Neo4j connection

Required environment variables:

```bash
export NEO4J_URI="neo4j+s://<your-instance>.databases.neo4j.io"
export NEO4J_USERNAME="neo4j"
export NEO4J_PASSWORD="<password>"
```

Install dependency if needed:

```bash
python3 -m pip install neo4j
```

## Step 4 — Ingest graph into Neo4j

Run:

```bash
python3 scripts/ingest_neo4j.py --graph graph/repo_graph.json
```

Expected terminal output:

```text
ingested <nodes> nodes and <edges> edges into Neo4j
mode=observability_only
runtime_authority=false
```

## Step 5 — Run runtime topology queries

Open Neo4j Browser or another Cypher client.

Load queries from:

```text
graph/runtime-topology.cypher
```

Primary query surfaces:

- repository containment topology
- runtime route declarations
- execution surface inventory
- workflow topology
- proof surface topology
- registry surface inventory
- governance object inventory
- bypass-path observation
- FATE/test coverage topology
- observability boundary audit

## Step 6 — Run legitimacy traversal queries

Load:

```text
graph/legitimacy-traversals.cypher
```

Primary query surfaces:

- authority references
- AEO/exact-object references
- validation references
- execution references
- proof references
- validation/proof gaps
- execution-without-validation gaps
- governance coverage gaps
- bypass adjacency
- reconciliation references

## Step 7 — Run reconciliation views

Load:

```text
graph/reconciliation-views.cypher
```

Primary query surfaces:

- proof coherence
- registry coherence
- execution-without-reconciliation visibility
- bypass-without-reconciliation visibility
- canonical chain coverage
- reconciliation blind spots
- FATE reconciliation coverage
- reconciliation-ready surfaces

Expanded invariant:

```text
all persisted legitimacy lineage
must remain recursively reconcilable
```

## Merge order

Recommended merge sequence:

```text
1. taxonomy baseline
2. extractor
3. Neo4j ingestion
4. runtime topology queries
5. legitimacy traversal queries
6. reconciliation views
7. bootstrap documentation
```

## Failure interpretation

If a query shows a possible gap, that is not proof of runtime failure.

It means:

```text
observed topology
requires review
```

A graph result is evidence for investigation, not runtime authority.

## Canonical distinctions

```text
query result
≠ proof
```

```text
graph node
≠ valid object
```

```text
Neo4j edge
≠ authority binding
```

```text
observability gap
≠ runtime mutation
```

## Final compression

```text
Control Graph
= machine-queryable legitimacy visibility

MindShift Boundary
= runtime existence permission
```
