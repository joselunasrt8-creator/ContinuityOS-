# MindShift Neo4j Node Taxonomy

**Artifact Type:** Node Taxonomy Specification  
**Layer:** Runtime Governance → Topology Observability → Reconciliation  
**Status:** Non-Operative  
**Source Schema:** `docs/neo4j/execution-legitimacy-graph-schema.md`

---

## 1. Purpose

This artifact defines the stable node taxonomy for the MindShift Control Graph / Execution Legitimacy Graph.

It standardizes:

- canonical node labels
- required identity fields
- source artifact mappings
- quarantine handling
- naming conventions
- deprecation rules

The taxonomy exists so graph ingestion, query libraries, reconciliation jobs, and dashboards operate over the same node language.

---

## 2. Boundary Rule

Graph nodes are descriptive and reconciliatory only.

A node cannot:

- create authority
- validate an AEO
- execute an action
- produce Proof-of-Transfer
- mutate runtime legitimacy state
- replace runtime registries

Runtime legitimacy remains governed by:

```text
Authority → AEO → Ω Validator → Execution Boundary → Execution → Proof
```

---

## 3. Canonical Naming Conventions

### 3.1 Labels

Use PascalCase labels:

```text
Session
Continuity
Authority
ATAO
AEO
Validation
ExecutionBoundary
Execution
Proof
Registry
ExecutionSurface
BypassPath
Policy
PREO
SCO
ReconciliationSnapshot
```

### 3.2 IDs

Each node must have exactly one canonical stable ID field.

Format:

```text
<label_lowercase>_id
```

Exceptions:

```text
Authority → decision_id
AEO → aeo_id plus aeo_hash
PREO → preo_id plus preo_hash
SCO → sco_id plus sco_hash
```

### 3.3 Hashes

Hash fields identify exact-object or snapshot identity.

Hash fields must not be treated as authority by themselves.

---

## 4. Canonical Node Classes

| Label | Stable ID | Source Mapping | Purpose |
|---|---|---|---|
| Session | session_id | session registry | Identity/session origin |
| Continuity | continuity_id | continuity registry | Continuity lineage |
| Authority | decision_id | authority registry | Permission source |
| ATAO | atao_id | agent/tool capture artifacts | Pre-execution action capture |
| AEO | aeo_id | compiled AEO records | Exact executable object |
| Validation | validation_id | validation registry | Validator result |
| ExecutionBoundary | boundary_id | runtime gateway/workflow map | Pre-state-change choke point |
| Execution | execution_id | execution registry | Observed state change |
| Proof | proof_id | proof registry | External execution evidence |
| Registry | registry_id | runtime/governance registries | Persistence layer |
| ExecutionSurface | surface_id | execution surface inventory | Mutation-capable surface |
| BypassPath | bypass_id | bypass path inventory | Suspected/confirmed bypass |
| Policy | policy_id | governance bundle / policy files | Rule evidence |
| PREO | preo_id | PR governance artifacts | Review/merge legitimacy object |
| SCO | sco_id | system-change artifacts | Runtime/governance mutation object |
| ReconciliationSnapshot | snapshot_id | reconciliation output | Topology integrity snapshot |

---

## 5. Required Properties by Label

### Session

```text
session_id
status
created_at
source
```

### Continuity

```text
continuity_id
session_id
status
created_at
```

### Authority

```text
decision_id
owner
intent
scope_hash
status
created_at
```

### ATAO

```text
atao_id
intent
risk_class
source
created_at
```

### AEO

```text
aeo_id
aeo_hash
intent
scope_hash
target_hash
finality_hash
created_at
```

### Validation

```text
validation_id
aeo_id
aeo_hash
result
validator_version
timestamp
```

### ExecutionBoundary

```text
boundary_id
surface
boundary_type
status
```

### Execution

```text
execution_id
validation_id
aeo_hash
surface
status
timestamp
```

### Proof

```text
proof_id
execution_id
decision_id
proof_reference
status
timestamp
```

### Registry

```text
registry_id
registry_type
status
updated_at
```

### ExecutionSurface

```text
surface_id
surface_type
path_or_endpoint
risk_class
status
```

### BypassPath

```text
bypass_id
surface_id
severity
status
created_at
```

### Policy

```text
policy_id
policy_type
status
version
```

### PREO

```text
preo_id
preo_hash
pr_number
head_sha
status
created_at
```

### SCO

```text
sco_id
sco_hash
change_type
status
created_at
```

### ReconciliationSnapshot

```text
snapshot_id
snapshot_hash
status
created_at
```

---

## 6. Optional Property Rules

Optional properties may be added only if they preserve deterministic interpretation.

Allowed optional property categories:

```text
source metadata
lineage references
timestamps
hashes
status reasons
issue references
workflow references
registry references
```

Forbidden optional property categories:

```text
implicit authority
unbounded execution instruction
runtime command payload without boundary
ambiguous approval text
human-memory-only legitimacy claims
```

---

## 7. Unknown Node Quarantine

Any ingested node that does not match the canonical taxonomy must be classified as:

```text
:UnknownGraphObject
```

Required properties:

```text
unknown_id
observed_label
source
created_at
quarantine_reason
status = QUARANTINED
```

Unknown nodes must not be connected into canonical runtime lineage until classified.

Allowed relationship:

```text
(:ReconciliationSnapshot)-[:OBSERVES]->(:UnknownGraphObject)
```

Forbidden relationships:

```text
(:UnknownGraphObject)-[:AUTHORIZES]->(:Authority)
(:UnknownGraphObject)-[:COMPILES_TO]->(:AEO)
(:UnknownGraphObject)-[:VALIDATED_BY]->(:Validation)
(:UnknownGraphObject)-[:EXECUTES_AS]->(:Execution)
(:UnknownGraphObject)-[:PRODUCES_PROOF]->(:Proof)
```

---

## 8. Deprecation Rules

Node labels may not be silently renamed or removed.

Deprecation process:

```text
1. mark old label as DEPRECATED in taxonomy
2. define replacement label
3. add migration mapping
4. preserve old ID field
5. add reconciliation query for mixed-label drift
6. remove only after migration proof exists
```

Deprecated nodes must remain observable until lineage migration is complete.

---

## 9. Canonical Traversal Support

The taxonomy must support this full traversal:

```text
Session
→ Continuity
→ Authority
→ AEO
→ Validation
→ ExecutionBoundary
→ Execution
→ Proof
→ Registry
```

With optional pre-execution capture:

```text
Session
→ ATAO
→ Authority
→ AEO
```

And governance expansion:

```text
PREO
SCO
Policy
ReconciliationSnapshot
ExecutionSurface
BypassPath
```

---

## 10. Source-to-Node Mapping Rules

| Source Type | Node Label |
|---|---|
| session registry entry | Session |
| continuity registry entry | Continuity |
| authority registry entry | Authority |
| ATAO capture record | ATAO |
| compiled AEO record | AEO |
| validation result | Validation |
| execution gateway/boundary config | ExecutionBoundary |
| execution event | Execution |
| proof ledger entry | Proof |
| registry table/file | Registry |
| execution surface JSON | ExecutionSurface |
| bypass path JSON | BypassPath |
| policy/governance file | Policy |
| pull request execution object | PREO |
| system change object | SCO |
| reconciliation output | ReconciliationSnapshot |

---

## 11. Status Vocabulary

Canonical status values should use bounded enums.

General:

```text
ACTIVE
EXPIRED
REVOKED
CONSUMED
UNKNOWN
```

Validation:

```text
VALID
NULL
```

Execution:

```text
SUCCESS
FAILURE
INCOMPLETE
UNKNOWN
```

Proof:

```text
RECORDED
MISSING
INVALID
UNKNOWN
```

Reconciliation:

```text
RECONCILED
DRIFT
ORPHAN
BYPASS_RISK
INCOMPLETE_LINEAGE
UNKNOWN
```

Quarantine:

```text
QUARANTINED
```

---

## 12. Acceptance Criteria

This taxonomy is valid when:

- every canonical node label has a stable ID field
- every label maps to a source artifact or runtime registry
- unknown node classes are quarantined
- deprecation requires explicit migration mapping
- traversal from Session to Proof is supported
- graph nodes do not imply authority or execution legitimacy

---

## 13. Final Compression

```text
The node taxonomy makes legitimacy objects nameable.
The graph schema makes them traversable.
Reconciliation determines whether topology stayed intact.
```
