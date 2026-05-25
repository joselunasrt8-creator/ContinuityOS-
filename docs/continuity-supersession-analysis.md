# Continuity Supersession Analysis
## Issue #1209 — SUPERSEDED Continuity Status Transition

---

## 1. Structural Baseline

### 1.1 Current Status Topology

The canonical continuity status type is defined at
`src/runtime/continuity/verifyContinuityLineage.ts:1`:

```typescript
export type ContinuityStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | string
```

The persistence schema at `schemas/continuity.schema.json:49` narrows this to:

```json
"status": { "type": "string", "enum": ["ACTIVE", "REVOKED", "EXPIRED"] }
```

`SUPERSEDED` exists only in `src/lib/skill-provenance-revocation.js:8-9`:

```javascript
const STATUSES = new Set(['ACTIVE', 'REVOKED', 'SUPERSEDED', 'EXPIRED', 'QUARANTINED']);
const FAIL_CLOSED = new Set(['REVOKED', 'SUPERSEDED', 'EXPIRED', 'QUARANTINED']);
```

This is scoped to skill-provenance revocation only. It is **not** part of the
core `ContinuityStatus` type, not part of the canonical schema, and not
evaluated by any execute, validate, or proof barrier in the main continuity
lineage path.

---

### 1.2 The Topology-Dependent Supersession Function

`resolveCurrentContinuityIdentity` (`src/index.ts:2629–2655`) determines the
current active continuity via anti-join:

```sql
SELECT c.continuity_id, c.identity_id
FROM continuity_registry c
WHERE c.session_id=?1
  AND c.identity_id=?2
  AND c.status='ACTIVE'
  AND (c.revoked_at IS NULL OR c.revoked_at='')
  AND c.expires_at>?3
  AND NOT EXISTS (
    SELECT 1 FROM continuity_registry child
    WHERE child.parent_continuity_id=c.continuity_id
      AND child.session_id=c.session_id
      AND child.identity_id=c.identity_id
      AND child.status='ACTIVE'
      AND (child.revoked_at IS NULL OR child.revoked_at='')
      AND child.expires_at>?3
  )
ORDER BY c.issued_at DESC, c.continuity_id DESC
LIMIT 1
```

This query determines "current" by the **absence** of an active child — not by
an authoritative status value on the parent. Supersession is therefore
topology-derived, not status-authoritative.

Child creation at `src/index.ts:7524` inserts with `status='ACTIVE'` and does
not atomically transition the parent:

```typescript
INSERT INTO continuity_registry (...,status,...) VALUES (...,'ACTIVE',...)
```

---

### 1.3 Execute Barrier Coverage

`verifyContinuityLineage` (`src/runtime/continuity/verifyContinuityLineage.ts:35`)
checks:

```typescript
if ((current.revoked_at || "") || current.status !== "ACTIVE")
  return { ok: false, reason: "revoked_continuity_lineage" }
```

The barrier enforces `status === "ACTIVE"` but does **not** enforce canonical
leaf status. A parent continuity with `status='ACTIVE'` and no `revoked_at`
passes the execute barrier even after a child has been created — as long as the
parent row has not been mutated.

The revocation barrier at `src/recursive-revocation-propagation.ts:291–293`:

```typescript
function isRevocationBarriered(entry: RevocationLineageEntry): boolean {
  return !isActiveStatus(entry.status) || Boolean(entry.revoked_at)
}
```

This also only guards `ACTIVE` status. A SUPERSEDED continuity would pass this
guard (non-ACTIVE), but only if the status field is already written as
`SUPERSEDED`. If the parent row remains `ACTIVE`, neither barrier catches it.

The reconciliation invariant `AUTHORITY_CONTINUITY_VALID`
(`src/reconciliation/reconciliation-invariants.ts:451–469`) queries:

```sql
WHERE continuity_registry.status = 'REVOKED'
```

This will **not** invalidate authorities bound to a SUPERSEDED continuity if
SUPERSEDED is treated as a distinct status. The invariant is not SUPERSEDED-aware.

---

## 2. Answers to Specific Questions

### Q1. Should child creation atomically transition parent ACTIVE → SUPERSEDED?

**Finding:** Currently it does not. The parent retains `status='ACTIVE'` after
child creation indefinitely.

**Analysis:** Atomic transition is required for authoritative supersession
semantics. Without it:

- The parent remains executable at any replica that has not yet received the
  child insert.
- `resolveCurrentContinuityIdentity` relies on anti-join visibility, which
  is not guaranteed to be consistent across stale replicas.
- Two write operations can independently confirm the parent as "current" in
  the window between child creation and parent status update.

Atomic transition — where the child INSERT and the parent status UPDATE occur in
a single serializable transaction — is the necessary condition for SUPERSEDED to
become an authoritative status. Without atomicity, SUPERSEDED is not achievable
as a topology-independent primitive.

---

### Q2. Must SUPERSEDED become an authoritative legitimacy state rather than a topology-derived advisory state?

**Finding:** Currently advisory — inferred from anti-join topology visibility.

**Analysis:** Yes, this is the core gap. Advisory supersession has the following
properties that are incompatible with canonical convergence:

- It is visible only to replicas that have received the child row.
- It is not persisted as a durable transition in the parent row.
- It cannot be audited independently of full topology traversal.
- It is not checkpointable — there is no hash over "this continuity was
  superseded at time T by continuity_id X."

Authoritative supersession requires:

1. `parent.status` written as `SUPERSEDED` in the same transaction as child
   creation.
2. `superseded_at` timestamp recorded on the parent row.
3. `superseded_by` (child `continuity_id`) recorded on the parent row for
   lineage auditability.
4. `SUPERSEDED` added to the canonical `ContinuityStatus` type and the
   schema enum.
5. `SUPERSEDED` added to `FAIL_CLOSED` in barrier evaluation logic — currently
   done in `skill-provenance-revocation.js` but absent from the core
   `verifyContinuityLineage` barrier.

---

### Q3. Can execute/proof/validate barriers rely solely on `continuity.status != ACTIVE` once SUPERSEDED exists?

**Finding:** No, not solely. The check `current.status !== "ACTIVE"` at
`verifyContinuityLineage.ts:35` already fails for any non-ACTIVE status,
including SUPERSEDED. So mechanically, SUPERSEDED would be barriered there.

**Analysis:** However, relying on `!= ACTIVE` is only sufficient if the status
field is authoritatively set. The problem is not the comparison logic — it is
that the status may not be set. If SUPERSEDED is introduced as an authoritative
status and the parent row is atomically updated, then:

```typescript
if (current.status !== "ACTIVE") return { ok: false, reason: "revoked_continuity_lineage" }
```

…correctly barriers a SUPERSEDED parent. The execute barrier logic does not need
modification, but it does need the status to actually be written. The failure
mode is upstream of the barrier, not in the barrier itself.

The proof barrier and reconciliation invariants are a different matter:
`AUTHORITY_CONTINUITY_VALID` checks `status = 'REVOKED'` only. It must be
updated to also reject `status = 'SUPERSEDED'`. Otherwise, authorities bound to
SUPERSEDED continuities remain valid under reconciliation invariant checks.

---

### Q4. Does supersession require recursive propagation?

**Finding:** Partially. Revocation has recursive propagation
(`src/recursive-revocation-propagation.ts:328–387`,
`src/reconciliation/reconciliation-invariants.ts:599–618`). SUPERSEDED does not.

**Analysis:** Recursive propagation of SUPERSEDED depends on whether a parent
continuity can be superseded before its child is superseded. In the typical
lineage model, a parent is superseded when a child is created, and the child
becomes the new active leaf. The child itself is not superseded until its own
child is created.

Therefore supersession propagates **forward** through lineage (parent →
SUPERSEDED when child is born), not recursively downward like revocation.
Revocation is a legitimacy invalidation and must cascade to descendants.
Supersession is a replacement event and does not itself invalidate descendants
— the child is the continuation.

However, recursive supersession is relevant in one edge case: if a continuity
tree has multiple generations (grandparent → parent → child), and the parent
is superseded, the grandparent must also be considered superseded if the child
is downstream of both. This is lineage-transitive supersession, not recursive
revocation-style propagation.

The existing recursive descent traversal at `traverseDescendantRevocation`
could be adapted for supersession lineage, but the semantics differ:
supersession is monotonic-forward (a parent can only be superseded by a child
appearing after it), while revocation is monotonic-backward (a root can revoke
all descendants).

---

### Q5. Can multiple ACTIVE sibling continuities exist safely?

**Finding:** Currently yes — there is no uniqueness constraint preventing
multiple continuities with the same `parent_continuity_id` and `status='ACTIVE'`.
`resolveCurrentContinuityIdentity` uses `ORDER BY c.issued_at DESC LIMIT 1`
as a tiebreaker, but this is non-deterministic under concurrent inserts with
identical timestamps.

**Analysis:** Multiple ACTIVE siblings are unsafe because:

- `resolveCurrentContinuityIdentity` returns exactly one via LIMIT 1, but the
  election is timestamp-ordered and not causally guaranteed under concurrent
  writes.
- Two write processes can independently read the same parent as "current" and
  each create a child, resulting in sibling continuities both claiming
  legitimacy.
- Each sibling may issue authorities independently. Authorities bound to sibling
  A are not invalidated by the existence of sibling B unless a explicit
  supersession or revocation is applied.
- Reconciliation invariant `REVOCATION_RECURSIVE` checks `child.status !=
  'REVOKED'` but does not detect sibling forks.

Under SUPERSEDED semantics, sibling forking is the primary race condition.
Authoritative supersession requires that child creation atomically transitions
the parent to SUPERSEDED **and** that only one child can claim the parent as its
`parent_continuity_id` in an ACTIVE state at any time. This requires either a
uniqueness constraint on `(parent_continuity_id, status='ACTIVE')` or a
serializable transaction that checks and transitions in a single atomic
operation.

---

### Q6. What distributed races remain after SUPERSEDED introduction?

Even with atomic SUPERSEDED transitions, the following races remain:

**R1 — Sibling creation race:**
Two writers both read the parent as ACTIVE before either has committed a child.
Both attempt to INSERT child and UPDATE parent to SUPERSEDED. If the parent
UPDATE is conditional (`WHERE status='ACTIVE'`), the second writer's update
affects 0 rows, allowing detection. But if both inserts succeed before either
UPDATE, both children exist with valid parent references, and the parent
receives two UPDATE attempts — only one succeeds. The losing child is now
orphaned with a superseded parent.

**R2 — Stale replica execution:**
A replica that has not received the parent's SUPERSEDED update still sees
`status='ACTIVE'` and resolves the parent as executable. The execute barrier
passes. The operation executes against superseded continuity.

**R3 — Authority issuance window:**
An authority can be issued against a continuity in the window between child
creation and parent SUPERSEDED commit. The authority is valid at issuance time
but references a continuity that is about to be superseded. This authority
remains valid under current `AUTHORITY_CONTINUITY_VALID` checks (which only
check REVOKED), even after the parent is marked SUPERSEDED.

**R4 — Replay window:**
A replay operation reads continuity status as ACTIVE (pre-SUPERSEDED commit)
and proceeds. By the time the replay records are persisted, the continuity is
SUPERSEDED. The replay record binds to a SUPERSEDED continuity, which is not
currently caught by replay eligibility checks.

**R5 — Cross-registry epoch divergence:**
Distributed registry views may disagree on whether the parent is SUPERSEDED
or ACTIVE depending on replication lag. The distributed quorum classifier
(`classifyDistributedQuorum` at `temporal_lineage_replay_inspector.ts:57–73`)
does not have a SUPERSEDED authority status class. SUPERSEDED continuity would
appear as PARTIAL_VISIBILITY or AMBIGUOUS rather than as a deterministic
supersession signal.

---

### Q7. Does supersession require monotonic lineage ordering?

**Finding:** Yes, and it is partially enforced. The lineage verifier traverses
parent → parent → root and the reconciliation invariants require parent
existence. However, there is no monotonic ordering constraint on creation
timestamps across parent-child pairs.

**Analysis:** Authoritative supersession requires:

- The child's `issued_at` must be strictly greater than the parent's `issued_at`.
- The parent's `superseded_at` must equal or follow the child's `issued_at`.
- The lineage hash (computed over the ordered chain) must incorporate
  timestamps to detect out-of-order insertions.

Currently `deterministicContinuityHash` at
`runtime/control_graph_continuity.ts:32–41` hashes `topologyHash` and
`reconciliationHash` but not timestamps. This means a lineage chain can be
hash-consistent even if nodes are inserted out of temporal order.

The temporal replay inspector at `temporal_lineage_replay_inspector.ts:107–109`
checks:

```typescript
if (Date.parse(replayNode.timestamp) < Date.parse(canonicalNode.timestamp)) {
  issues.push({ class: 'temporal-induced', code: 'non_monotonic_replay_timestamp', ... })
}
```

This detects replay monotonicity violations but does not enforce creation-time
monotonicity in the original lineage. Supersession requires that creation
ordering be enforced at write time, not only at replay inspection time.

---

### Q8. Should parent supersession invalidate pending authorities, delegated authorities, PREOs, proofs, and replay eligibility?

**Finding:** Current revocation cascade invalidates authorities
(`REVOCATION_CONTINUITY_CASCADE`) and upstream validations
(`REVOCATION_AUTHORITY_CASCADE`). SUPERSEDED does not trigger any cascade.

**Analysis:**

**Pending authorities:** An authority issued against a SUPERSEDED continuity
is a legitimacy gap. The current `AUTHORITY_CONTINUITY_VALID` invariant only
checks `status = 'REVOKED'`. It must be extended to include SUPERSEDED.
Authority issuance should fail if the bound continuity is SUPERSEDED at
issuance time.

**Delegated authorities:** Delegated authority records in
`delegated_authority_registry` bind to a `continuity_id` and have their own
`projection_status`. If the bound continuity becomes SUPERSEDED, the delegated
authority's validity depends on whether SUPERSEDED is treated as a legitimacy
invalidation. If supersession is a replacement (not invalidation), existing
delegated authorities may remain valid for in-flight operations but should not
be used for new issuance. This requires a grace-period or hard cutoff model.

**PREOs (Pre-Executed Objects):** Not directly visible in the analyzed files,
but by the primary invariant chain (authority → AEO → validation → execution →
proof), any AEO whose authority chain traces back to a SUPERSEDED continuity
must be evaluated as to whether the supersession occurred before or after the
AEO was created. Post-supersession AEOs are illegitimate. Pre-supersession AEOs
may remain valid depending on the grace model.

**Proofs:** The reconciliation invariant `ORPHAN_PROOF_ARCHIVED` checks
`cr.status = 'REVOKED'`. It does not check SUPERSEDED. A proof bound to a
SUPERSEDED continuity would not be archived under current invariants.

**Replay eligibility:** `validateRevokedReplayIneligibility`
(`recursive-revocation-propagation.ts:555–583`) and
`verifyReplayLineageEligibility`
(`distributed-continuity-lineage-reconciliation.ts:295–323`) both check
`isRevokedOrExpired` which only catches non-ACTIVE status or explicit
`revoked_at`. If SUPERSEDED sets `status='SUPERSEDED'` (non-ACTIVE), replay
would be ineligible. But if the status field is not yet written (topology-only
supersession), replay eligibility checks pass incorrectly.

---

### Q9. Does supersession become topology-independent canonicality compression?

**Current state:** No. Supersession is topology-derived. The "current" leaf is
compressed out of the topology via anti-join rather than by an authoritative
status change.

**With SUPERSEDED as authoritative status:** Yes, supersession becomes
topology-independent. A query for valid continuity needs only:

```sql
WHERE status = 'ACTIVE' AND revoked_at IS NULL AND expires_at > now()
```

No anti-join. No topology traversal to establish leaf status. The parent's row
encodes its own supersession state without reference to child existence. This is
canonicality compression: the legitimacy state of the parent is derivable from
the parent row alone, without traversing to children.

This is the key convergence property. It means:

- Stale replicas can correctly barrier superseded parents without needing to
  have received the child row.
- Audit and lineage verification traverse parent → root without needing to
  traverse parent → children.
- The execute barrier (`status !== 'ACTIVE'`) becomes sufficient once the
  status field is authoritative.

---

### Q10. What reconciliation semantics are required if multiple child continuities are created concurrently?

**Finding:** No current reconciliation invariant handles sibling continuity
forks.

**Analysis:** Concurrent child creation produces a fork state:

```
parent (ACTIVE → SUPERSEDED?)
├── child_A (ACTIVE, issued_at=T1)
└── child_B (ACTIVE, issued_at=T2)
```

Required reconciliation semantics:

**Election:** One child must be elected canonical. The current `ORDER BY
issued_at DESC LIMIT 1` in `resolveCurrentContinuityIdentity` provides a
tiebreaker but it is advisory and non-atomic. A canonical election requires:

- A deterministic election rule (e.g., lowest `continuity_id` lexicographically,
  or first-writer-wins via database conditional update).
- The election result must be recorded as the parent's `superseded_by` field.
- The non-elected child must be marked REVOKED or SUPERSEDED itself.

**Convergence invariant:** A new reconciliation invariant is needed:

```sql
-- Detect sibling fork: parent has more than one ACTIVE child
SELECT parent_continuity_id, COUNT(*) as child_count
FROM continuity_registry
WHERE status = 'ACTIVE'
  AND parent_continuity_id IS NOT NULL
GROUP BY parent_continuity_id
HAVING child_count > 1
```

This invariant does not currently exist. Its absence means sibling forks are
not detectable by the current reconciliation pass.

**Cross-registry behavior:** If replica A received child_A first and replica B
received child_B first, they each resolve a different "current" continuity.
The distributed convergence evaluation (`evaluateContinuityLineageConvergence`
at `distributed-continuity-lineage-reconciliation.ts:351–410`) detects that
registry hashes diverge (`CONVERGENCE_DIVERGED`) but does not identify the
specific cause as a sibling fork. A sibling-fork-specific drift class is absent
from `CONTINUITY_LINEAGE_DRIFT_CLASSES`.

---

## 3. Closure Analysis

### 3.1 What Is Closed

The following supersession-adjacent properties are structurally closed in the
current codebase:

- **Non-ACTIVE barrier:** Any continuity with `status !== 'ACTIVE'` is barriered
  at `verifyContinuityLineage.ts:35`. If SUPERSEDED status is written, the
  barrier fires without modification.
- **Append-only lineage:** All continuity records are
  `append_only: true, runtime_authority: false`. Supersession cannot erase
  prior lineage.
- **Hash integrity:** `continuity_hash` is deterministic from content.
  A SUPERSEDED parent's hash does not change when its status changes — this is
  a property of the hash function, not a gap.
- **Revocation cascade infrastructure:** The recursive revocation propagation
  infrastructure (`propagateRevocationLineage`) is capable of traversing
  descendant trees. It can be extended for supersession-triggered cascades.
- **Evidence-only boundary:** `FORBIDDEN_FIELDS` enforcement prevents
  supersession analysis from creating authority, execution, or mutation
  artifacts.

### 3.2 What Is Not Closed

The following properties remain open (not closed):

1. **SUPERSEDED not in canonical type or schema.** The `ContinuityStatus` type
   and the `continuity.schema.json` enum do not include SUPERSEDED.

2. **No atomic parent status transition on child creation.** Child creation
   (`src/index.ts:7524`) does not update parent status. The gap between child
   INSERT and parent UPDATE is a race window.

3. **No `superseded_at` or `superseded_by` fields on continuity rows.** The
   parent row cannot encode its supersession event without schema extension.

4. **No sibling fork detection invariant.** The reconciliation invariant set
   does not detect multiple ACTIVE children of the same parent.

5. **`AUTHORITY_CONTINUITY_VALID` is REVOKED-only.** Authorities bound to
   SUPERSEDED continuities are not invalidated by reconciliation.

6. **`ORPHAN_PROOF_ARCHIVED` is REVOKED-only.** Proofs bound to SUPERSEDED
   continuities are not archived by reconciliation.

7. **`classifyDistributedQuorum` has no SUPERSEDED state.** Cross-registry
   supersession disagreement is not classified as a distinct quorum outcome.

8. **No replay barrier for SUPERSEDED.** Replay eligibility checks are
   REVOKED/non-ACTIVE conditioned — they work only if SUPERSEDED is written to
   the status field.

---

## 4. Invariant Impact Assessment

| Invariant | Current Behavior | Impact Under SUPERSEDED |
|---|---|---|
| `verifyContinuityLineage` barrier | Fails for `status !== 'ACTIVE'` | Correct if SUPERSEDED is written; blind if not |
| `AUTHORITY_CONTINUITY_VALID` | Checks `status = 'REVOKED'` only | Must include `SUPERSEDED` |
| `REVOCATION_RECURSIVE` | Cascades REVOKED downward | Does not cascade SUPERSEDED — correct; supersession is upward-only |
| `REVOCATION_CONTINUITY_CASCADE` | Invalidates authorities under REVOKED | Must include authorities under SUPERSEDED |
| `ORPHAN_PROOF_ARCHIVED` | Archives proofs under REVOKED continuity | Must include SUPERSEDED |
| `resolveCurrentContinuityIdentity` | Anti-join topology traversal | Becomes redundant if SUPERSEDED is authoritative |
| `isRevocationBarriered` | `!ACTIVE \|\| revoked_at` | Already barriers non-ACTIVE; works if SUPERSEDED is written |
| `classifyDistributedQuorum` | No SUPERSEDED class | Gap: supersession quorum disagreement is AMBIGUOUS |
| `validateRevokedReplayIneligibility` | Checks `isRevocationBarriered` | Works if SUPERSEDED writes non-ACTIVE status |
| Reconciliation sibling fork detection | Absent | Must be added as new invariant |

---

## 5. Race-Condition Analysis

### Race Window 1: Child creation / parent status update non-atomicity

```
T0: Writer A reads parent as ACTIVE
T1: Writer A INSERTs child_A
T2: Writer B reads parent as ACTIVE (T1 not yet visible or no isolation)
T3: Writer A UPDATEs parent to SUPERSEDED
T4: Writer B INSERTs child_B (parent is now SUPERSEDED, but B doesn't know)
T5: Writer B UPDATEs parent to SUPERSEDED (idempotent if using conditional update)
```

Result: Two children with the same parent. Parent is SUPERSEDED. Children are
both ACTIVE. Sibling fork exists. Election required.

Mitigation: Serializable transaction wrapping child INSERT + parent UPDATE with
optimistic concurrency check (`WHERE status='ACTIVE'`). If 0 rows updated on
parent, child INSERT must be rolled back.

### Race Window 2: Stale replica execution

```
T0: Parent SUPERSEDED at primary
T1: Stale replica still sees parent as ACTIVE
T2: Execute request arrives at stale replica
T3: verifyContinuityLineage passes (status='ACTIVE' on stale view)
T4: Authority barrier passes
T5: Execution proceeds against superseded continuity
```

Result: Execution occurs against superseded continuity. Authority was valid at
issue time; execution is valid at execution time per stale replica. Convergence
of the stale replica will later show SUPERSEDED, but the execution record
exists.

Mitigation: Eventual consistency cannot prevent this race. The only mitigation
is read-your-writes or strong quorum for the execute barrier check, combined
with post-execution reconciliation that identifies executions against SUPERSEDED
continuity.

### Race Window 3: Authority issuance between child creation and parent SUPERSEDED commit

```
T0: Child INSERT committed
T1: Authority issuance reads parent as ACTIVE (pre-SUPERSEDED commit)
T2: Authority bound to parent is created
T3: Parent UPDATE to SUPERSEDED committed
```

Result: Authority bound to a continuity that becomes SUPERSEDED milliseconds
after issuance. Authority is structurally valid. `AUTHORITY_CONTINUITY_VALID`
invariant (REVOKED-only) passes. Authority remains usable.

Mitigation: Authority issuance must be included in the serializable transaction
scope. Alternatively, `AUTHORITY_CONTINUITY_VALID` must be extended to reject
SUPERSEDED.

---

## 6. Topology Convergence Analysis

### 6.1 Current State

Supersession is topology-derived. Convergence requires that all replicas agree
on child existence. This is a function of replication lag, not status semantics.
Convergence is eventual, not instantaneous.

### 6.2 Under Authoritative SUPERSEDED

Convergence becomes a function of the parent row status. Any replica that has
received the parent's SUPERSEDED update will correctly identify the continuity
as non-executable. This reduces the convergence surface from "all replicas must
agree on child existence" to "all replicas must agree on parent status."

The parent status row is a single, narrow, deterministic signal. It is easier
to replicate and verify than the anti-join result of a topology traversal.

### 6.3 Convergence Topology Under SUPERSEDED

```
Parent SUPERSEDED
  ↓ (replication)
Replica A sees SUPERSEDED → barriers execute
Replica B (stale) sees ACTIVE → permits execute (race window 2)
  ↓ (replica B receives update)
Replica B sees SUPERSEDED → barriers execute going forward
```

The convergence topology is monotonic: once a replica sees SUPERSEDED, it will
never revert to ACTIVE (append-only, no status regression). The open window is
bounded by replication lag, not by structural ambiguity.

Under advisory (topology-derived) supersession, the open window is bounded by
the anti-join query result on each replica, which depends on whether the child
row has been replicated. This is not monotonic: a replica could receive the
child, then lose it in a crash recovery scenario, and revert to seeing the parent
as the leaf. Under authoritative SUPERSEDED, the parent status is durable and
monotonic — it cannot revert.

---

## 7. Replay Implications

### 7.1 Replay Against Superseded Continuity

The replay eligibility check at `validateRevokedReplayIneligibility` checks
`isRevocationBarriered` which fires for non-ACTIVE status. If SUPERSEDED is
written as the status, replay against the superseded continuity is correctly
barriered. If SUPERSEDED is not yet written (advisory), replay is not barriered.

### 7.2 Replay of a Supersession Event

A supersession event (parent transition ACTIVE → SUPERSEDED, child creation)
must be replay-neutral: replaying the event must produce the same result. This
requires:

- The child `continuity_hash` must be deterministic from content (it is,
  per `deterministicContinuityHash`).
- The parent `superseded_at` must be deterministic from the child's
  `issued_at` (or an explicit event timestamp).
- The supersession must not be re-processable on replay — it must be
  idempotent. A replay that attempts to create the child again must detect
  the existing child and the existing SUPERSEDED parent and succeed without
  creating duplicates.

The current `continuity_hash` determinism ensures that replay of a child
creation produces the same hash. The parent status update is a mutation, which
is idempotent if conditional on `WHERE status='ACTIVE'`.

### 7.3 Epoch Implications

The temporal replay inspector checks `node.epoch !== expectedEpoch`. A
supersession event occurring at epoch N means all post-supersession operations
should reference epoch N+1 or later. If the replay inspector encounters a node
at epoch N after the supersession with the superseded parent, it will detect an
epoch disagreement (FAIL_CLOSED) if the expected epoch has advanced. This is
the correct behavior.

---

## 8. Authoritative Transition Semantics

For SUPERSEDED to become a canonical convergence primitive, the following
semantic contract is required:

### 8.1 Status Transition State Machine

```
ACTIVE → SUPERSEDED   (by child creation — one-way, atomic, permanent)
ACTIVE → REVOKED      (by explicit revocation — one-way, permanent)
ACTIVE → EXPIRED      (by time — implicit, detected at query time)
SUPERSEDED → REVOKED  (if superseded continuity must also be revoked)
SUPERSEDED → ACTIVE   (FORBIDDEN — no regression of supersession)
REVOKED → *           (FORBIDDEN — revocation is terminal)
```

### 8.2 Required Schema Fields

The `continuity_registry` table must be extended with:

- `superseded_at TEXT` — timestamp of the supersession event (nullable, set
  atomically with child creation)
- `superseded_by TEXT` — `continuity_id` of the superseding child (nullable,
  set atomically with child creation)

These fields enable:
- Temporal ordering of supersession events
- Lineage fork detection (two children claiming the same parent)
- Evidence-only audit of when and by whom supersession occurred
- Replay determinism (superseded_at is part of the event record)

### 8.3 Required Barrier Updates

1. `schemas/continuity.schema.json:49` — add `"SUPERSEDED"` to the enum.
2. `src/runtime/continuity/verifyContinuityLineage.ts:1` — add `"SUPERSEDED"`
   to `ContinuityStatus` type.
3. `src/reconciliation/reconciliation-invariants.ts:451–469` —
   `AUTHORITY_CONTINUITY_VALID` must check `status IN ('REVOKED', 'SUPERSEDED')`.
4. `src/reconciliation/reconciliation-invariants.ts:596–618` —
   `REVOCATION_RECURSIVE` does not need modification (supersession is not
   revocation-style downward cascade).
5. New invariant: sibling fork detection (parent with multiple ACTIVE children).
6. `ORPHAN_PROOF_ARCHIVED` must check SUPERSEDED in addition to REVOKED.

---

## 9. Reconciliation Implications

### 9.1 New Required Reconciliation Invariants

**SUPERSESSION_UNIQUE_CHILD:**

```sql
SELECT parent_continuity_id, COUNT(*) as child_count
FROM continuity_registry
WHERE status = 'ACTIVE'
  AND parent_continuity_id IS NOT NULL
GROUP BY parent_continuity_id
HAVING child_count > 1
```

Detects sibling fork. Failure indicates concurrent child creation without
proper serialization.

**SUPERSEDED_PARENT_HAS_ACTIVE_CHILD:**

```sql
SELECT c.continuity_id
FROM continuity_registry c
WHERE c.status = 'SUPERSEDED'
  AND NOT EXISTS (
    SELECT 1 FROM continuity_registry child
    WHERE child.parent_continuity_id = c.continuity_id
      AND child.status = 'ACTIVE'
  )
```

Detects SUPERSEDED parents without an active replacement. This indicates a
supersession was recorded without the corresponding child being persisted, or
the child was subsequently revoked without the parent being re-activated. This
is a lineage integrity gap.

**AUTHORITY_CONTINUITY_SUPERSEDED:**

```sql
SELECT ar.authority_id
FROM authority_registry ar
JOIN continuity_registry cr ON ar.continuity_id = cr.continuity_id
WHERE cr.status = 'SUPERSEDED'
  AND ar.status NOT IN ('REVOKED', 'CONSUMED')
  AND ar.created_at > cr.superseded_at
```

Detects post-supersession authority issuance. Failure indicates authorities
were issued after the bound continuity was superseded.

### 9.2 Distributed Reconciliation Under Partial Visibility

The `evaluateContinuityLineageConvergence` function detects hash divergence
across registry views but cannot distinguish sibling fork from legitimate
concurrent operations. A SUPERSEDED-aware convergence evaluation must:

1. Check that all views agree on the SUPERSEDED status of a parent.
2. Check that all views agree on which child is the canonical successor.
3. Classify disagreement as `SUPERSESSION_FORK` drift rather than generic
   `CONVERGENCE_DIVERGED`.

The `classifyDistributedQuorum` function must be extended with:
- `SUPERSESSION_CONFLICT` — some registries see parent as ACTIVE, others as
  SUPERSEDED
- `SIBLING_FORK_DETECTED` — registries agree parent is SUPERSEDED but disagree
  on which child is canonical

---

## 10. Deterministic Legitimacy Assessment

### 10.1 Current Determinism Properties

The current system is deterministic for non-supersession cases:

- `continuity_hash` is deterministic from content.
- `lineage_hash` is deterministic from the ordered chain.
- Replay neutrality is verified by hash equality across envelopes.
- Barriers are deterministic given the same input state.

The indeterminism arises specifically from topology-dependent supersession:

- `resolveCurrentContinuityIdentity` is non-deterministic under concurrent
  child creation (timestamp tiebreaker is not causally ordered).
- Anti-join visibility is non-deterministic across replicas with different
  replication states.
- The "current" continuity can differ between two simultaneous requests at
  different replicas.

### 10.2 Determinism Under Authoritative SUPERSEDED

Authoritative SUPERSEDED achieves determinism through:

- Single writer wins: the parent UPDATE conditional on `WHERE status='ACTIVE'`
  ensures exactly one child can claim the parent in a single transaction.
- The SUPERSEDED status is monotonic: once set, it cannot be unset.
- The `superseded_by` field records which child won the election, making the
  "current" continuity derivable from the parent row without topology traversal.

This is topology-independent canonicality: the current leaf of any continuity
chain is derivable by following `superseded_by` links without executing the
anti-join query. The result is deterministic regardless of replica state, as
long as the parent row has propagated.

---

## 11. Remaining Gaps

After authoritative SUPERSEDED introduction, the following structural gaps
remain:

1. **Sibling fork reconciliation:** No canonical election protocol for resolving
   sibling forks in already-forked states. If the race window was crossed before
   serialization was enforced, the fork must be detected and resolved
   out-of-band.

2. **Grace period for in-flight authorities:** Authorities issued in the window
   between child creation and parent SUPERSEDED commit. These are structurally
   valid but semantically post-supersession. A grace window cutoff policy is
   needed.

3. **Delegation chain SUPERSEDED propagation:** Delegated authority records
   bind to a `continuity_id`. If that continuity is superseded, the delegation
   chain's legitimacy for new operations is unclear. The delegated authority's
   `projection_status` does not have a SUPERSEDED state.

4. **`resolveCurrentContinuityIdentity` redundancy:** Once authoritative
   SUPERSEDED exists, the anti-join query in this function becomes a fallback
   rather than the primary mechanism. The function should be updated to
   prefer `superseded_by` navigation over anti-join when the field is present.

5. **Epoch boundary definition:** Supersession should correspond to an epoch
   boundary in the temporal replay inspector. The mapping from supersession
   event to epoch increment is not currently defined.

6. **`CLOSURE_PARTIAL_VISIBILITY` under SUPERSEDED:** The closure hardening
   result `CLOSURE_PARTIAL_VISIBILITY` fires when registry hashes disagree. If
   registries disagree on SUPERSEDED vs. ACTIVE for a parent, the result should
   be more specific than PARTIAL_VISIBILITY.

---

## 12. Closure-State Classification

| Property | State |
|---|---|
| SUPERSEDED in canonical type | **OPEN** — not in `ContinuityStatus` or schema enum |
| Atomic parent status transition | **OPEN** — child creation does not update parent |
| Execute barrier for SUPERSEDED | **CONDITIONALLY CLOSED** — fires if status written; blind if not |
| Proof barrier for SUPERSEDED | **OPEN** — `ORPHAN_PROOF_ARCHIVED` is REVOKED-only |
| Authority invalidation under SUPERSEDED | **OPEN** — `AUTHORITY_CONTINUITY_VALID` is REVOKED-only |
| Replay ineligibility under SUPERSEDED | **CONDITIONALLY CLOSED** — fires if status is non-ACTIVE |
| Sibling fork detection | **OPEN** — no reconciliation invariant exists |
| Distributed quorum for SUPERSEDED | **OPEN** — no SUPERSEDED quorum class |
| Recursive downward supersession cascade | **NOT REQUIRED** — supersession is forward-only |
| Monotonic supersession (no status regression) | **ARCHITECTURALLY CLOSED** — append-only records prevent regression |
| Hash integrity of superseded chain | **CLOSED** — continuity_hash is content-addressed, immutable |
| Lineage traversal through SUPERSEDED parent | **OPEN** — traversal stops at non-ACTIVE; chain beyond parent is not navigable via `superseded_by` |
| Topology-independent canonicality | **OPEN** — requires `superseded_by` field + atomic commit |
| Deterministic current-leaf resolution | **OPEN** — anti-join is non-deterministic under concurrency |

**Overall closure classification: OPEN — authoritative SUPERSEDED semantics are
not yet achieved. The infrastructure to close is present. The specific writes
and schema changes required are enumerated above. No existing legitimacy
invariants are weakened by introducing SUPERSEDED; the gaps are additive.**

---

*Evidence only. No execution authority changes. No mutation surface widening.
No probabilistic legitimacy decisions. All analysis routes through observed
code paths.*
