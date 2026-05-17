# MindShift Neo4j Query Library

**Artifact Type:** Cypher Query Catalog  
**Layer:** Control Graph → Lineage Traversal → Diagnostic Reconciliation  
**Status:** Non-Operative  
**Depends On:** `docs/neo4j/execution-legitimacy-graph-schema.md`, `docs/neo4j/node-taxonomy.md`

---

## 1. Purpose

This document defines the initial read-only Cypher query library for the MindShift Control Graph / Execution Legitimacy Graph.

The query library supports:

- canonical lifecycle traversal
- orphan detection
- replay detection
- bypass-path discovery
- drift diagnostics
- proof continuity tracing
- reconciliation readiness

---

## 2. Boundary Rule

These queries are observational and diagnostic only.

They cannot:

- create authority
- validate an AEO
- execute an action
- produce Proof-of-Transfer
- mutate runtime state
- convert graph presence into legitimacy

Query output is evidence for inspection, not execution authority.

---

## 3. Query Output Shape

Each diagnostic query should return:

```text
finding_type
severity
status
node_id
node_label
summary
recommended_next_check
```

Recommended status values:

```text
RECONCILED
DRIFT
ORPHAN
BYPASS_RISK
INCOMPLETE_LINEAGE
UNKNOWN
```

Recommended severity values:

```text
P1 informational
P2 governance drift
P3 bypass risk
P4 execution integrity risk
```

---

## 4. Canonical Lifecycle Traversal

### QL-001 — Full proof lineage path

Purpose: trace completed legitimacy lineage from Session to Proof.

```cypher
MATCH path =
  (:Session)-[:HAS_CONTINUITY]->(:Continuity)
  -[:AUTHORIZES]->(:Authority)
  -[:COMPILES_TO]->(:AEO)
  -[:VALIDATED_BY]->(:Validation)
  -[:REACHES_BOUNDARY]->(:ExecutionBoundary)
  -[:EXECUTES_AS]->(:Execution)
  -[:PRODUCES_PROOF]->(:Proof)
RETURN path;
```

Expected result: complete traversable canonical runtime path.

---

### QL-002 — Authority to proof lineage by decision ID

Parameter:

```text
$decision_id
```

```cypher
MATCH path =
  (a:Authority {decision_id: $decision_id})
  -[:COMPILES_TO]->(:AEO)
  -[:VALIDATED_BY]->(:Validation)
  -[:REACHES_BOUNDARY]->(:ExecutionBoundary)
  -[:EXECUTES_AS]->(:Execution)
  -[:PRODUCES_PROOF]->(:Proof)
RETURN path;
```

Expected result: all proof paths for a specific authority.

---

## 5. Orphan Detection

### QL-010 — Proof without execution

```cypher
MATCH (p:Proof)
WHERE NOT ( (:Execution)-[:PRODUCES_PROOF]->(p) )
RETURN
  'OrphanProof' AS finding_type,
  'P4' AS severity,
  'ORPHAN' AS status,
  p.proof_id AS node_id,
  'Proof' AS node_label,
  'Proof node lacks incoming Execution lineage' AS summary,
  'Check proof registry and execution registry linkage' AS recommended_next_check;
```

---

### QL-011 — Execution without validation lineage

```cypher
MATCH (e:Execution)
WHERE NOT (
  (:AEO)-[:VALIDATED_BY]->(:Validation)-[:REACHES_BOUNDARY]->(:ExecutionBoundary)-[:EXECUTES_AS]->(e)
)
RETURN
  'OrphanExecution' AS finding_type,
  'P4' AS severity,
  'ORPHAN' AS status,
  e.execution_id AS node_id,
  'Execution' AS node_label,
  'Execution lacks AEO → Validation → Boundary lineage' AS summary,
  'Check execution registry and validation registry linkage' AS recommended_next_check;
```

---

### QL-012 — Validation without authority lineage

```cypher
MATCH (v:Validation)
WHERE NOT (
  (:Authority)-[:COMPILES_TO]->(:AEO)-[:VALIDATED_BY]->(v)
)
RETURN
  'AuthorityGap' AS finding_type,
  'P3' AS severity,
  'INCOMPLETE_LINEAGE' AS status,
  v.validation_id AS node_id,
  'Validation' AS node_label,
  'Validation lacks Authority ancestry' AS summary,
  'Check compiled AEO and authority registry linkage' AS recommended_next_check;
```

---

### QL-013 — AEO without authority or ATAO source

```cypher
MATCH (a:AEO)
WHERE NOT ( (:Authority)-[:COMPILES_TO]->(a) )
  AND NOT ( (:ATAO)-[:COMPILES_TO]->(a) )
RETURN
  'AEOSourceGap' AS finding_type,
  'P3' AS severity,
  'INCOMPLETE_LINEAGE' AS status,
  a.aeo_id AS node_id,
  'AEO' AS node_label,
  'AEO lacks Authority or ATAO compilation source' AS summary,
  'Check compiler source mapping' AS recommended_next_check;
```

---

## 6. Replay Detection

### QL-020 — Duplicate AEO hash cluster

```cypher
MATCH (a:AEO)
WITH a.aeo_hash AS hash, collect(a) AS nodes, count(a) AS count
WHERE count > 1
RETURN
  'ReplayCluster' AS finding_type,
  'P3' AS severity,
  'DRIFT' AS status,
  hash AS node_id,
  'AEO' AS node_label,
  'Multiple AEO nodes share same hash' AS summary,
  count AS duplicate_count,
  [n IN nodes | n.aeo_id] AS aeo_ids,
  'Check replay policy and canonicalization source' AS recommended_next_check;
```

---

### QL-021 — Authority reused after consumed state

```cypher
MATCH (auth:Authority)-[:COMPILES_TO]->(a:AEO)
WITH auth, count(a) AS compiled_count
WHERE auth.status = 'CONSUMED' AND compiled_count > 1
RETURN
  'ConsumedAuthorityReuse' AS finding_type,
  'P4' AS severity,
  'DRIFT' AS status,
  auth.decision_id AS node_id,
  'Authority' AS node_label,
  'Consumed authority appears linked to multiple AEO compilations' AS summary,
  compiled_count AS compiled_count,
  'Check replay and authority lifecycle enforcement' AS recommended_next_check;
```

---

## 7. Bypass Path Detection

### QL-030 — High-risk execution surface without boundary

```cypher
MATCH (s:ExecutionSurface)
WHERE s.risk_class IN ['P2', 'P3']
AND NOT ( (:ExecutionBoundary)-[:GOVERNS_SURFACE]->(s) )
RETURN
  'BoundaryGap' AS finding_type,
  'P4' AS severity,
  'BYPASS_RISK' AS status,
  s.surface_id AS node_id,
  'ExecutionSurface' AS node_label,
  'High-risk execution surface lacks governing boundary' AS summary,
  s.path_or_endpoint AS surface,
  'Attach or verify ExecutionBoundary mapping' AS recommended_next_check;
```

---

### QL-031 — Confirmed bypass path still active

```cypher
MATCH (b:BypassPath)-[:CAN_BYPASS]->(s:ExecutionSurface)
WHERE b.status = 'CONFIRMED'
RETURN
  'ConfirmedBypassPath' AS finding_type,
  'P4' AS severity,
  'BYPASS_RISK' AS status,
  b.bypass_id AS node_id,
  'BypassPath' AS node_label,
  'Confirmed bypass path remains represented in topology' AS summary,
  s.surface_id AS surface_id,
  s.path_or_endpoint AS surface,
  'Mitigate bypass or mark false positive with evidence' AS recommended_next_check;
```

---

## 8. Drift Diagnostics

### QL-040 — Registry node marked divergent or stale

```cypher
MATCH (r:Registry)
WHERE r.status IN ['STALE', 'DIVERGENT']
RETURN
  'RegistryDivergence' AS finding_type,
  'P3' AS severity,
  'DRIFT' AS status,
  r.registry_id AS node_id,
  'Registry' AS node_label,
  'Registry is stale or divergent' AS summary,
  r.registry_type AS registry_type,
  'Run source-to-graph synchronization check' AS recommended_next_check;
```

---

### QL-041 — Unknown quarantined node class

```cypher
MATCH (u:UnknownGraphObject)
RETURN
  'UnknownNodeClass' AS finding_type,
  'P2' AS severity,
  'DRIFT' AS status,
  u.unknown_id AS node_id,
  'UnknownGraphObject' AS node_label,
  'Unknown graph object is quarantined' AS summary,
  u.observed_label AS observed_label,
  'Classify node or update taxonomy' AS recommended_next_check;
```

---

## 9. Proof Continuity

### QL-050 — Proof cannot trace to session

```cypher
MATCH (p:Proof)
WHERE NOT (
  (:Session)-[:HAS_CONTINUITY]->(:Continuity)
  -[:AUTHORIZES]->(:Authority)
  -[:COMPILES_TO]->(:AEO)
  -[:VALIDATED_BY]->(:Validation)
  -[:REACHES_BOUNDARY]->(:ExecutionBoundary)
  -[:EXECUTES_AS]->(:Execution)
  -[:PRODUCES_PROOF]->(p)
)
RETURN
  'ProofContinuityGap' AS finding_type,
  'P4' AS severity,
  'INCOMPLETE_LINEAGE' AS status,
  p.proof_id AS node_id,
  'Proof' AS node_label,
  'Proof cannot trace backward to Session lineage' AS summary,
  'Check Session → Continuity → Authority → AEO → Validation → Execution lineage' AS recommended_next_check;
```

---

## 10. Reconciliation Snapshot Queries

### QL-060 — Latest reconciliation snapshot status

```cypher
MATCH (s:ReconciliationSnapshot)
RETURN s
ORDER BY s.created_at DESC
LIMIT 1;
```

---

### QL-061 — Non-reconciled snapshots

```cypher
MATCH (s:ReconciliationSnapshot)
WHERE s.status <> 'RECONCILED'
RETURN
  'ReconciliationDrift' AS finding_type,
  'P3' AS severity,
  s.status AS status,
  s.snapshot_id AS node_id,
  'ReconciliationSnapshot' AS node_label,
  'Reconciliation snapshot is not reconciled' AS summary,
  s.finding_count AS finding_count,
  'Inspect observed drift targets' AS recommended_next_check
ORDER BY s.created_at DESC;
```

---

## 11. Final Compression

```text
Queries do not govern execution.
Queries reveal whether the topology still reflects governed execution.
```
