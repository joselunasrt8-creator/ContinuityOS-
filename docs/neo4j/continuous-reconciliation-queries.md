# MindShift Neo4j Continuous Reconciliation Queries

**Artifact Type:** Continuous Reconciliation Query Catalog  
**Layer:** Control Graph → Integrity Monitoring → Topology Reconciliation  
**Status:** Non-Operative  
**Depends On:** `docs/neo4j/execution-legitimacy-graph-schema.md`, `docs/neo4j/node-taxonomy.md`, `docs/neo4j/query-library.md`

---

## 1. Purpose

This artifact defines continuous read-only reconciliation queries for the MindShift Neo4j Control Graph.

The purpose is to detect whether execution legitimacy topology remains intact across:

- session lineage
- continuity lineage
- authority lineage
- AEO compilation lineage
- validation lineage
- execution boundary lineage
- proof continuity
- registry persistence
- execution surface governance
- bypass-path topology

---

## 2. Boundary Rule

Continuous reconciliation is observational only.

It can detect:

```text
orphan lineage
drift
bypass risk
registry divergence
missing proof continuity
incomplete topology
```

It cannot:

```text
create authority
validate an AEO
execute an action
produce Proof-of-Transfer
repair runtime state automatically
```

---

## 3. Reconciliation Result Shape

Each query should return:

```text
finding_type
severity
status
node_id
node_label
summary
recommended_next_check
```

Canonical status values:

```text
RECONCILED
DRIFT
ORPHAN
BYPASS_RISK
INCOMPLETE_LINEAGE
UNKNOWN
```

Canonical severity values:

```text
P1 = informational
P2 = governance drift
P3 = bypass risk
P4 = execution integrity risk
```

---

## 4. Required Detection Queries

### CR-001 — Orphan Proofs

Detect Proof nodes that do not trace back to Execution.

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

### CR-002 — Orphan Executions

Detect Execution nodes that do not trace back to Validation and AEO lineage.

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
  'Check execution registry, validation registry, and boundary mapping' AS recommended_next_check;
```

---

### CR-003 — Validation Without Authority

Detect Validation nodes where no Authority lineage can be traversed.

```cypher
MATCH (v:Validation)
WHERE NOT (
  (:Authority)-[:COMPILES_TO]->(:AEO)-[:VALIDATED_BY]->(v)
)
RETURN
  'ValidationWithoutAuthority' AS finding_type,
  'P4' AS severity,
  'INCOMPLETE_LINEAGE' AS status,
  v.validation_id AS node_id,
  'Validation' AS node_label,
  'Validation lacks Authority lineage' AS summary,
  'Check Authority → AEO → Validation linkage' AS recommended_next_check;
```

---

### CR-004 — Execution Surface Without Boundary

Detect ExecutionSurface nodes that are not governed by an ExecutionBoundary.

```cypher
MATCH (s:ExecutionSurface)
WHERE s.risk_class IN ['P2', 'P3']
AND NOT ( (:ExecutionBoundary)-[:GOVERNS_SURFACE]->(s) )
RETURN
  'ExecutionSurfaceWithoutBoundary' AS finding_type,
  'P4' AS severity,
  'BYPASS_RISK' AS status,
  s.surface_id AS node_id,
  'ExecutionSurface' AS node_label,
  'High-risk execution surface lacks boundary mapping' AS summary,
  'Attach or verify ExecutionBoundary → ExecutionSurface mapping' AS recommended_next_check;
```

---

### CR-005 — Registry Divergence

Detect Registry nodes marked stale, divergent, or unknown.

```cypher
MATCH (r:Registry)
WHERE r.status IN ['STALE', 'DIVERGENT', 'UNKNOWN']
RETURN
  'RegistryDivergence' AS finding_type,
  'P3' AS severity,
  'DRIFT' AS status,
  r.registry_id AS node_id,
  'Registry' AS node_label,
  'Registry status indicates stale, divergent, or unknown topology state' AS summary,
  'Run source-to-graph synchronization and registry linkage check' AS recommended_next_check;
```

---

### CR-006 — Missing Proof Continuity

Detect Proof nodes that cannot trace back through the full canonical chain.

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
  'MissingProofContinuity' AS finding_type,
  'P4' AS severity,
  'INCOMPLETE_LINEAGE' AS status,
  p.proof_id AS node_id,
  'Proof' AS node_label,
  'Proof cannot trace back through Session → Continuity → Authority → AEO → Validation → Boundary → Execution' AS summary,
  'Check canonical lineage chain and registry persistence' AS recommended_next_check;
```

---

## 5. Aggregate Reconciliation Queries

### CR-100 — Reconciliation Finding Union

Purpose: produce one combined diagnostic stream.

```cypher
CALL {
  MATCH (p:Proof)
  WHERE NOT ( (:Execution)-[:PRODUCES_PROOF]->(p) )
  RETURN 'OrphanProof' AS finding_type, 'P4' AS severity, 'ORPHAN' AS status, p.proof_id AS node_id, 'Proof' AS node_label
  UNION ALL
  MATCH (e:Execution)
  WHERE NOT ( (:AEO)-[:VALIDATED_BY]->(:Validation)-[:REACHES_BOUNDARY]->(:ExecutionBoundary)-[:EXECUTES_AS]->(e) )
  RETURN 'OrphanExecution' AS finding_type, 'P4' AS severity, 'ORPHAN' AS status, e.execution_id AS node_id, 'Execution' AS node_label
  UNION ALL
  MATCH (v:Validation)
  WHERE NOT ( (:Authority)-[:COMPILES_TO]->(:AEO)-[:VALIDATED_BY]->(v) )
  RETURN 'ValidationWithoutAuthority' AS finding_type, 'P4' AS severity, 'INCOMPLETE_LINEAGE' AS status, v.validation_id AS node_id, 'Validation' AS node_label
  UNION ALL
  MATCH (s:ExecutionSurface)
  WHERE s.risk_class IN ['P2', 'P3'] AND NOT ( (:ExecutionBoundary)-[:GOVERNS_SURFACE]->(s) )
  RETURN 'ExecutionSurfaceWithoutBoundary' AS finding_type, 'P4' AS severity, 'BYPASS_RISK' AS status, s.surface_id AS node_id, 'ExecutionSurface' AS node_label
  UNION ALL
  MATCH (r:Registry)
  WHERE r.status IN ['STALE', 'DIVERGENT', 'UNKNOWN']
  RETURN 'RegistryDivergence' AS finding_type, 'P3' AS severity, 'DRIFT' AS status, r.registry_id AS node_id, 'Registry' AS node_label
}
RETURN finding_type, severity, status, node_id, node_label
ORDER BY severity DESC, finding_type ASC;
```

---

### CR-101 — Reconciliation Summary Counts

```cypher
CALL {
  MATCH (p:Proof)
  WHERE NOT ( (:Execution)-[:PRODUCES_PROOF]->(p) )
  RETURN 'ORPHAN' AS status, count(p) AS count
  UNION ALL
  MATCH (e:Execution)
  WHERE NOT ( (:AEO)-[:VALIDATED_BY]->(:Validation)-[:REACHES_BOUNDARY]->(:ExecutionBoundary)-[:EXECUTES_AS]->(e) )
  RETURN 'ORPHAN' AS status, count(e) AS count
  UNION ALL
  MATCH (s:ExecutionSurface)
  WHERE s.risk_class IN ['P2', 'P3'] AND NOT ( (:ExecutionBoundary)-[:GOVERNS_SURFACE]->(s) )
  RETURN 'BYPASS_RISK' AS status, count(s) AS count
  UNION ALL
  MATCH (r:Registry)
  WHERE r.status IN ['STALE', 'DIVERGENT', 'UNKNOWN']
  RETURN 'DRIFT' AS status, count(r) AS count
}
RETURN status, sum(count) AS total
ORDER BY status;
```

---

## 6. Reconciliation Interpretation

```text
No returned rows
→ topology appears reconciled for that query scope

Returned rows
→ diagnostic finding exists
→ runtime state is not automatically invalidated by graph alone
→ investigation or synchronization is required
```

Graph reconciliation findings are evidence of topology drift, not runtime execution decisions.

---

## 7. Final Compression

```text
Neo4j reconciliation does not decide legitimacy.
It detects when legitimacy topology stops matching itself.
```
