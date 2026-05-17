# MindShift Neo4j Execution Legitimacy Graph Schema

**Artifact Type:** Graph Schema Specification  
**Layer:** Runtime Governance → Topology Observability → Reconciliation  
**Status:** Non-Operative  
**Scope:** Neo4j Control Graph / Execution Legitimacy Graph

---

## 1. Purpose

This document defines the first stable schema artifact for the MindShift Neo4j Control Graph.

The graph exists to make execution legitimacy traversable.

It represents:

```text
Session
→ Continuity
→ Authority
→ ATAO
→ AEO
→ Validation
→ ExecutionBoundary
→ Execution
→ Proof
→ Registry
→ Reconciliation
```

The graph is not the runtime validator. It is an observational topology layer used for lineage inspection, reconciliation, drift detection, bypass analysis, and governance visibility.

---

## 2. Boundary Rule

Graph representation is descriptive, diagnostic, and reconciliatory only.

It cannot:

- create authority
- validate an AEO
- execute an action
- produce Proof-of-Transfer
- mutate runtime legitimacy state
- substitute for the canonical runtime chain

Canonical runtime authority remains:

```text
Authority → AEO → Ω Validator → Execution Boundary → Execution → Proof
```

If runtime validation fails, graph presence does not make execution legitimate.

---

## 3. Core Topology Invariant

Every completed execution lineage should be traversable as:

```text
(:Session)
-[:HAS_CONTINUITY]->(:Continuity)
-[:AUTHORIZES]->(:Authority)
-[:COMPILES_TO]->(:AEO)
-[:VALIDATED_BY]->(:Validation)
-[:REACHES_BOUNDARY]->(:ExecutionBoundary)
-[:EXECUTES_AS]->(:Execution)
-[:PRODUCES_PROOF]->(:Proof)
-[:PERSISTS_IN]->(:Registry)
```

If any required lineage edge is missing, the topology is incomplete and should reconcile to diagnostic status rather than runtime authority.

---

## 4. Canonical Node Taxonomy

### 4.1 Session

Represents the identity/session origin for a legitimacy chain.

Required properties:

```text
session_id: string
status: ACTIVE | EXPIRED | REVOKED | UNKNOWN
created_at: ISO8601
source: string
```

Optional properties:

```text
user_id
org_id
identity_provider
expires_at
```

---

### 4.2 Continuity

Represents continuity lineage connecting session state to authority state.

Required properties:

```text
continuity_id: string
session_id: string
status: ACTIVE | EXPIRED | REVOKED | UNKNOWN
created_at: ISO8601
```

Optional properties:

```text
parent_continuity_id
revoked_at
expired_at
lineage_depth
```

---

### 4.3 Authority

Represents human or policy-originated permission.

Required properties:

```text
decision_id: string
owner: string
intent: string
scope_hash: string
status: ACTIVE | CONSUMED | EXPIRED | REVOKED | UNKNOWN
created_at: ISO8601
```

Optional properties:

```text
constraints_hash
expiry
signature_id
registry_state
```

---

### 4.4 ATAO

Represents pre-execution action capture before executable object compilation.

Required properties:

```text
atao_id: string
intent: string
risk_class: P0 | P1 | P2 | P3 | UNKNOWN
source: string
created_at: ISO8601
```

Optional properties:

```text
agent_id
session_id
tool
proposed_action_hash
scope_hash
```

---

### 4.5 AEO

Represents the exact executable object submitted for validation.

Required properties:

```text
aeo_id: string
aeo_hash: string
intent: string
scope_hash: string
target_hash: string
finality_hash: string
created_at: ISO8601
```

Optional properties:

```text
decision_id
atao_id
schema_version
canonicalization_version
```

---

### 4.6 Validation

Represents validator output for an exact AEO.

Required properties:

```text
validation_id: string
aeo_id: string
aeo_hash: string
result: VALID | NULL
validator_version: string
timestamp: ISO8601
```

Optional properties:

```text
reason_codes
policy_id
validated_object_hash
```

---

### 4.7 ExecutionBoundary

Represents the governed choke point immediately before state change.

Required properties:

```text
boundary_id: string
surface: string
boundary_type: runtime | workflow | gateway | adapter | unknown
status: ACTIVE | QUARANTINED | UNKNOWN
```

Optional properties:

```text
route
adapter
policy_id
```

---

### 4.8 Execution

Represents an observed state-changing action.

Required properties:

```text
execution_id: string
validation_id: string
aeo_hash: string
surface: string
status: SUCCESS | FAILURE | INCOMPLETE | UNKNOWN
timestamp: ISO8601
```

Optional properties:

```text
run_id
commit_sha
workflow_id
external_reference
```

---

### 4.9 Proof

Represents Proof-of-Transfer or external execution evidence.

Required properties:

```text
proof_id: string
execution_id: string
decision_id: string
proof_reference: string
status: RECORDED | MISSING | INVALID | UNKNOWN
timestamp: ISO8601
```

Optional properties:

```text
surface
result
proof_hash
registry_id
```

---

### 4.10 Registry

Represents persistence of runtime or governance truth records.

Required properties:

```text
registry_id: string
registry_type: session | continuity | authority | aeo | validation | execution | proof | governance | unknown
status: ACTIVE | STALE | DIVERGENT | UNKNOWN
updated_at: ISO8601
```

Optional properties:

```text
source_file
source_table
record_hash
```

---

### 4.11 ExecutionSurface

Represents a file, route, workflow, API, adapter, or system capable of changing state.

Required properties:

```text
surface_id: string
surface_type: workflow | api_route | database | filesystem | external_api | deploy | unknown
path_or_endpoint: string
risk_class: P0 | P1 | P2 | P3 | UNKNOWN
status: GOVERNED | UNGOVERNED | UNKNOWN
```

Optional properties:

```text
owner
last_seen_at
source_artifact
```

---

### 4.12 BypassPath

Represents a suspected or confirmed route around canonical enforcement.

Required properties:

```text
bypass_id: string
surface_id: string
severity: P1 | P2 | P3 | P4 | UNKNOWN
status: SUSPECTED | CONFIRMED | MITIGATED | FALSE_POSITIVE | UNKNOWN
created_at: ISO8601
```

Optional properties:

```text
description
detection_query
related_issue
```

---

### 4.13 Policy

Represents policy or rule evidence used for governance classification.

Required properties:

```text
policy_id: string
policy_type: validation | scope | replay | proof | continuity | governance | unknown
status: ACTIVE | DEPRECATED | UNKNOWN
version: string
```

Optional properties:

```text
source_file
rule_hash
```

---

### 4.14 PREO

Represents pull-request / review execution object governance.

Required properties:

```text
preo_id: string
preo_hash: string
pr_number: string
head_sha: string
status: VALID | NULL | STALE | UNKNOWN
created_at: ISO8601
```

Optional properties:

```text
review_id
merge_gate_status
```

---

### 4.15 SCO

Represents self-change or system-change governance object.

Required properties:

```text
sco_id: string
sco_hash: string
change_type: runtime | governance | schema | workflow | unknown
status: VALID | NULL | QUARANTINED | UNKNOWN
created_at: ISO8601
```

Optional properties:

```text
parent_sco_id
affected_surface_id
```

---

### 4.16 ReconciliationSnapshot

Represents a topology integrity snapshot.

Required properties:

```text
snapshot_id: string
snapshot_hash: string
status: RECONCILED | DRIFT | ORPHAN | BYPASS_RISK | INCOMPLETE_LINEAGE | UNKNOWN
created_at: ISO8601
```

Optional properties:

```text
query_set_version
finding_count
source_range
```

---

## 5. Canonical Relationship Taxonomy

### 5.1 HAS_CONTINUITY

```text
(:Session)-[:HAS_CONTINUITY]->(:Continuity)
```

Meaning: session state anchors continuity lineage.

---

### 5.2 AUTHORIZES

```text
(:Continuity)-[:AUTHORIZES]->(:Authority)
```

Meaning: continuity lineage supports authority existence.

---

### 5.3 CAPTURES

```text
(:Session)-[:CAPTURES]->(:ATAO)
```

Meaning: a proposed action was captured as pre-execution structure.

---

### 5.4 BINDS_TO

```text
(:ATAO)-[:BINDS_TO]->(:Authority)
```

Meaning: proposed action is bound to authority.

---

### 5.5 COMPILES_TO

```text
(:Authority)-[:COMPILES_TO]->(:AEO)
(:ATAO)-[:COMPILES_TO]->(:AEO)
```

Meaning: source legitimacy object was compiled into exact executable object.

---

### 5.6 VALIDATED_BY

```text
(:AEO)-[:VALIDATED_BY]->(:Validation)
```

Meaning: exact AEO received a validator result.

---

### 5.7 REACHES_BOUNDARY

```text
(:Validation)-[:REACHES_BOUNDARY]->(:ExecutionBoundary)
```

Meaning: a validation result reached the execution boundary.

---

### 5.8 EXECUTES_AS

```text
(:ExecutionBoundary)-[:EXECUTES_AS]->(:Execution)
```

Meaning: execution occurred through a governed boundary.

---

### 5.9 PRODUCES_PROOF

```text
(:Execution)-[:PRODUCES_PROOF]->(:Proof)
```

Meaning: execution generated external proof evidence.

---

### 5.10 PERSISTS_IN

```text
(:Proof)-[:PERSISTS_IN]->(:Registry)
(:Execution)-[:PERSISTS_IN]->(:Registry)
(:Validation)-[:PERSISTS_IN]->(:Registry)
```

Meaning: graph node is represented in a persistence registry.

---

### 5.11 REFERENCES

```text
(:Proof)-[:REFERENCES]->(:Authority)
(:Execution)-[:REFERENCES]->(:AEO)
(:Validation)-[:REFERENCES]->(:Policy)
```

Meaning: evidence or runtime node references another legitimacy object.

---

### 5.12 REVOKES

```text
(:Continuity)-[:REVOKES]->(:Authority)
(:Authority)-[:REVOKES]->(:Validation)
```

Meaning: revocation lineage affects dependent legitimacy objects.

---

### 5.13 DESCENDS_FROM

```text
(:Continuity)-[:DESCENDS_FROM]->(:Continuity)
(:SCO)-[:DESCENDS_FROM]->(:SCO)
```

Meaning: recursive ancestry relationship.

---

### 5.14 CAN_BYPASS

```text
(:BypassPath)-[:CAN_BYPASS]->(:ExecutionSurface)
```

Meaning: suspected or confirmed bypass relationship.

---

### 5.15 GOVERNS_SURFACE

```text
(:ExecutionBoundary)-[:GOVERNS_SURFACE]->(:ExecutionSurface)
```

Meaning: boundary is attached to a mutation-capable surface.

---

### 5.16 RECONCILES_WITH

```text
(:ReconciliationSnapshot)-[:RECONCILES_WITH]->(:Registry)
(:ReconciliationSnapshot)-[:RECONCILES_WITH]->(:ExecutionSurface)
```

Meaning: snapshot evaluated topology state for a registry or surface.

---

### 5.17 OBSERVES

```text
(:ReconciliationSnapshot)-[:OBSERVES]->(:Proof)
(:ReconciliationSnapshot)-[:OBSERVES]->(:Execution)
(:ReconciliationSnapshot)-[:OBSERVES]->(:BypassPath)
```

Meaning: reconciliation snapshot observed a diagnostic target.

---

## 6. Required Constraints and Indexes

Recommended Neo4j constraints:

```cypher
CREATE CONSTRAINT session_id_unique IF NOT EXISTS
FOR (n:Session) REQUIRE n.session_id IS UNIQUE;

CREATE CONSTRAINT continuity_id_unique IF NOT EXISTS
FOR (n:Continuity) REQUIRE n.continuity_id IS UNIQUE;

CREATE CONSTRAINT authority_decision_id_unique IF NOT EXISTS
FOR (n:Authority) REQUIRE n.decision_id IS UNIQUE;

CREATE CONSTRAINT atao_id_unique IF NOT EXISTS
FOR (n:ATAO) REQUIRE n.atao_id IS UNIQUE;

CREATE CONSTRAINT aeo_id_unique IF NOT EXISTS
FOR (n:AEO) REQUIRE n.aeo_id IS UNIQUE;

CREATE CONSTRAINT validation_id_unique IF NOT EXISTS
FOR (n:Validation) REQUIRE n.validation_id IS UNIQUE;

CREATE CONSTRAINT execution_id_unique IF NOT EXISTS
FOR (n:Execution) REQUIRE n.execution_id IS UNIQUE;

CREATE CONSTRAINT proof_id_unique IF NOT EXISTS
FOR (n:Proof) REQUIRE n.proof_id IS UNIQUE;

CREATE CONSTRAINT registry_id_unique IF NOT EXISTS
FOR (n:Registry) REQUIRE n.registry_id IS UNIQUE;

CREATE CONSTRAINT surface_id_unique IF NOT EXISTS
FOR (n:ExecutionSurface) REQUIRE n.surface_id IS UNIQUE;
```

Recommended indexes:

```cypher
CREATE INDEX aeo_hash_index IF NOT EXISTS
FOR (n:AEO) ON (n.aeo_hash);

CREATE INDEX validation_result_index IF NOT EXISTS
FOR (n:Validation) ON (n.result);

CREATE INDEX execution_status_index IF NOT EXISTS
FOR (n:Execution) ON (n.status);

CREATE INDEX proof_status_index IF NOT EXISTS
FOR (n:Proof) ON (n.status);

CREATE INDEX bypass_status_index IF NOT EXISTS
FOR (n:BypassPath) ON (n.status);

CREATE INDEX reconciliation_status_index IF NOT EXISTS
FOR (n:ReconciliationSnapshot) ON (n.status);
```

---

## 7. Initial Validation Queries

### 7.1 Proof without execution

```cypher
MATCH (p:Proof)
WHERE NOT ( (:Execution)-[:PRODUCES_PROOF]->(p) )
RETURN p.proof_id AS proof_id, p.status AS status;
```

### 7.2 Execution without validation lineage

```cypher
MATCH (e:Execution)
WHERE NOT (
  (:AEO)-[:VALIDATED_BY]->(:Validation)-[:REACHES_BOUNDARY]->(:ExecutionBoundary)-[:EXECUTES_AS]->(e)
)
RETURN e.execution_id AS execution_id, e.status AS status;
```

### 7.3 Validation without authority lineage

```cypher
MATCH (v:Validation)
WHERE NOT (
  (:Continuity)-[:AUTHORIZES]->(:Authority)-[:COMPILES_TO]->(:AEO)-[:VALIDATED_BY]->(v)
)
RETURN v.validation_id AS validation_id, v.result AS result;
```

### 7.4 Execution surface without boundary

```cypher
MATCH (s:ExecutionSurface)
WHERE s.risk_class IN ['P2', 'P3']
AND NOT ( (:ExecutionBoundary)-[:GOVERNS_SURFACE]->(s) )
RETURN s.surface_id AS surface_id, s.path_or_endpoint AS path_or_endpoint, s.risk_class AS risk_class;
```

### 7.5 Full proof continuity trace

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

---

## 8. Failure Classes

| Class | Meaning | Diagnostic Status |
|---|---|---|
| OrphanProof | Proof lacks execution lineage | ORPHAN |
| OrphanExecution | Execution lacks validation lineage | ORPHAN |
| AuthorityGap | Validation lacks authority ancestry | INCOMPLETE_LINEAGE |
| BoundaryGap | Execution surface lacks boundary | BYPASS_RISK |
| RegistryDivergence | Registry edge missing or stale | DRIFT |
| ProofContinuityGap | Proof cannot trace to Session | INCOMPLETE_LINEAGE |
| ReplayCluster | Duplicate object/hash lineage detected | DRIFT |
| UnknownNodeClass | Non-canonical node class observed | DRIFT |

---

## 9. Source Mapping

Initial source-to-node mapping:

| Source | Node Targets |
|---|---|
| session registry | Session |
| continuity registry | Continuity |
| authority registry | Authority |
| compiled AEO records | AEO |
| validation records | Validation |
| execution records | Execution |
| proof records | Proof |
| execution surface inventory | ExecutionSurface |
| bypass path inventory | BypassPath |
| governance bundle | Policy, PREO, SCO |
| reconciliation output | ReconciliationSnapshot |

---

## 10. Acceptance Criteria for Issue #428

This artifact satisfies the first schema baseline if:

- canonical node classes are defined
- canonical relationships are defined
- required properties exist for each node class
- constraints and indexes are proposed
- canonical traversal is declared
- failure classes are represented
- boundary rule prevents graph state from implying authority

---

## 11. Final Compression

```text
Runtime governs execution.
Neo4j proves whether the legitimacy topology stayed intact.
```
