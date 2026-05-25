# `/validate` Lineage Freshness Convergence Analysis

**Issue:** #1211  
**Branch:** `claude/validate-lineage-freshness-3AJxf`  
**Scope:** Static analysis only — no code changes, no runtime mutation

---

## 1. Execution Flow Map

The `/validate` handler (`src/index.ts:7647–7703`) executes in this strict sequence:

```
1.  Input parsing and presence checks                    (lines 7648–7651)
2.  authority_registry lookup by decision_id             (line 7652)
3.  Authority expiry / revocation / status checks        (lines 7654–7656)
4.  activeSession()                                      (line 7657)
5.  session_id / identity_id binding checks              (lines 7659, 7665)
6.  activeContinuity(authority.continuity_id)            (line 7660)
    → full resolveContinuityLineage() traversal
    → confirms ACTIVE status + unrevoked + unexpired
    → verifies hash integrity up the ancestor chain
    → confirms decision_id in authority_chain
7.  resolveCurrentContinuityIdentity()   ←── ADVISORY    (line 7662)
    → NOT EXISTS child subquery snapshot
    → returns leaf continuity_id at read time
8.  Leaf-freshness check: leaf == authority.continuity_id (line 7664)
    ↑ ADVISORY: non-atomic with step 10 below
9.  AEO hash integrity checks                            (lines 7666–7691)
10. INSERT OR IGNORE into invocation_registry            (line 7692)
    → replay reservation
    → PRIMARY KEY: (decision_id, validated_object_hash, invocation_nonce)
11. Validation lineage hash computation                  (lines 7694–7697)
12. INSERT into validation_registry                      (line 7698)
13. UPDATE authority_registry SET status='RESERVED'      (line 7699)
14. Return VALID                                         (line 7702)
```

Steps 8 and 10 are **not atomic**. The race window is the gap between them.

---

## 2. Structural Definitions

### "Supersession" (implicit)

The system has **no `SUPERSEDED` status**. Continuity supersession is encoded
entirely by the existence of a child row:

```sql
-- continuity_registry
parent_continuity_id TEXT   -- NULL for root; non-NULL creates parent/child binding
status TEXT                 -- only 'ACTIVE' or 'REVOKED'
```

A parent continuity remains `ACTIVE` after a child is created. The leaf is
identified solely by the advisory NOT EXISTS subquery inside
`resolveCurrentContinuityIdentity()`.

### `resolveCurrentContinuityIdentity()` (advisory snapshot)

```typescript
// src/index.ts:2633–2651
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

This is a **correlated subquery snapshot**. Its result is only valid at the
instant of the read. No locking. No atomicity with subsequent writes.

### `invocation_registry` schema (no epoch binding)

```sql
-- schema.sql:203–211
CREATE TABLE IF NOT EXISTS invocation_registry (
  decision_id             TEXT NOT NULL,
  validated_object_hash   TEXT NOT NULL,
  invocation_nonce        TEXT NOT NULL,
  continuity_id           TEXT,
  status                  TEXT NOT NULL,
  created_at              TEXT NOT NULL,
  PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce)
);
```

No leaf-freshness marker. No continuity epoch. No `superseded_at` or
`leaf_at_reservation` field. The reservation encodes continuity association but
not continuity topology position at reservation time.

---

## 3. Race Condition Analysis

### The Race Window

```
Thread A: /validate
Thread B: /continuity (creates child of authority.continuity_id)

Timeline:
  T0  A: resolveCurrentContinuityIdentity() → returns parent (it is leaf)
  T1  A: leaf check passes (line 7664) ✓
  T2  B: INSERT INTO continuity_registry (child, parent=authority.continuity_id)
  T3  A: INSERT OR IGNORE INTO invocation_registry → SUCCEEDS
  T4  A: INSERT INTO validation_registry → SUCCEEDS
  T5  A: UPDATE authority_registry SET status='RESERVED' → SUCCEEDS
  T6  A: returns VALID
```

At T6, `/validate` has returned `VALID`. But the authority is now bound to a
**non-leaf continuity**. The invocation is **reserved but execution-dead**.

### Race Survivability at `/execute`

At `/execute` (lines 7730–7734), the same pair of checks runs again:

```typescript
const continuity = await activeContinuity(env, String(authority.continuity_id), ...)
// passes — parent is still ACTIVE (not revoked)

const currentContinuityIdentity = await resolveCurrentContinuityIdentity(env, session)
// returns child (new leaf)

if (currentContinuityIdentity.continuity_id !== authority.continuity_id)
  return rejectWithTelemetry(...reason:"continuity_identity_mismatch"...)
// BLOCKS — child_id !== parent_id
```

**The execution barrier at `/execute` prevents actual execution of the stale
reservation.** However:

- The `invocation_registry` entry remains `RESERVED` indefinitely.
- The `validation_registry` entry remains `VALID`.
- The `authority_registry` entry remains `RESERVED`.
- No cleanup, revocation, or reconciliation is triggered.

These dead records accumulate. There is no reconciliation path.

### Atomic Execution Barrier

The final safety layer at `/execute` (lines 7783–7788) uses a conditional
INSERT with four EXISTS guards:

```sql
INSERT INTO execution_registry (...)
SELECT ...
WHERE EXISTS (SELECT 1 FROM continuity_registry c
              WHERE c.continuity_id=?7 AND c.status='ACTIVE' ...)
  AND EXISTS (SELECT 1 FROM authority_registry a WHERE ...)
  AND EXISTS (SELECT 1 FROM validation_registry v WHERE ...)
  AND EXISTS (SELECT 1 FROM invocation_registry i
              WHERE i.continuity_id=?7 AND i.status='RESERVED')
```

This guard checks `c.status='ACTIVE'` — not leaf status. If the parent
continuity is still ACTIVE (not revoked), this guard passes. The
`continuity_identity_mismatch` check at line 7734 is what actually blocks
execution, not this atomic barrier. The barrier is not leaf-aware.

---

## 4. Answers to Specific Questions

**Q1. Can `/validate` safely authorize invocation reservation against a
continuity that becomes superseded mid-flight?**

No. The advisory leaf check (line 7664) and the replay reservation INSERT (line
7692) are not atomic. A child continuity created in the gap produces a reserved
invocation that is permanently unreachable for execution. The reservation
succeeds; the execution is blocked; no cleanup occurs.

---

**Q2. Does invocation reservation currently bind canonical lineage or merely
ACTIVE lineage?**

Merely ACTIVE lineage. The `continuity_id` column in `invocation_registry`
records which continuity was associated at reservation time, but there is no
leaf-freshness marker. The reservation does not encode "this continuity was the
leaf at reservation time." Any ACTIVE continuity — parent or leaf — satisfies
the existing binding.

---

**Q3. Must leaf-freshness validation move fully inside authoritative replay
reservation semantics?**

Yes, to achieve convergence-stability. The advisory check would need to become
a conditional predicate on the reservation INSERT itself — for example:

```sql
INSERT OR IGNORE INTO invocation_registry (...)
SELECT ?1, ?2, ?3, ?4, 'RESERVED', ?5
WHERE NOT EXISTS (
  SELECT 1 FROM continuity_registry child
  WHERE child.parent_continuity_id = ?4
    AND child.status = 'ACTIVE'
    AND child.revoked_at IS NULL
    AND child.expires_at > ?5
)
```

Only then is the leaf check and the reservation atomically coupled. Until then,
the gap exists.

---

**Q4. Is the current advisory anti-join structurally sufficient under
distributed topology lag?**

No. The NOT EXISTS subquery in `resolveCurrentContinuityIdentity()` is a
snapshot read. Under read-replica or distributed-node lag, a replica that has
not yet replicated the child continuity insertion would return the parent as the
current leaf. The advisory check passes on the stale read. The reservation
INSERT proceeds against the authoritative node. The reservation is dead by the
time it reaches `/execute`.

This is a topology-dependent legitimacy outcome: the result of `/validate`
varies depending on which replica serves the leaf-freshness read.

---

**Q5. Can stale replicas authorize validation reservation after child continuity
creation?**

Yes. If `resolveCurrentContinuityIdentity()` is served by a replica that lags
behind the authoritative node by even one transaction (the child INSERT), the
advisory check returns the parent as the leaf. Validation proceeds to
reservation. The reservation is topologically inconsistent with the authoritative
state at the moment of INSERT.

The invocation_registry INSERT itself is atomic (INSERT OR IGNORE), but its
predicate does not include leaf-freshness. So the INSERT succeeds against a
stale read basis.

---

**Q6. Should replay reservation include continuity epoch semantics?**

A continuity epoch or leaf-at-reservation marker would provide three benefits:

1. **Reconciliation detection**: Any reservation made against a non-current leaf
   can be identified and cleaned up without re-traversing the live topology.
2. **Topology-independence**: Downstream consumers of `invocation_registry`
   could verify leaf freshness from stored state rather than re-querying
   `continuity_registry`.
3. **Audit clarity**: The `invocation_registry` would self-describe whether it
   was reserved against the canonical leaf.

Without epoch semantics, the registry is silent on whether a given reservation
was topologically valid at reservation time.

---

**Q7. Can replay uniqueness remain deterministic if continuity supersession
races occur concurrently?**

Nonce uniqueness is deterministic — the INSERT OR IGNORE on
`(decision_id, validated_object_hash, invocation_nonce)` is atomic and
collision-free.

**Reservation validity** is not deterministic. Two concurrent `/validate`
requests with different continuity contexts (one with the parent, one with a
newly created child) could each independently pass the advisory leaf check and
each independently succeed at INSERT (assuming different nonces). The topology
view at each INSERT moment may differ across replicas. The resulting reservations
may have different topological validity even though nonce uniqueness is
preserved.

---

**Q8. Does validation legitimacy require canonical leaf continuity or merely
non-revoked continuity?**

Currently: non-revoked ACTIVE continuity. `activeContinuity()` checks
`status='ACTIVE'`, `revoked_at IS NULL`, and `expires_at > now`. Leaf status is
checked only by `resolveCurrentContinuityIdentity()`, which is advisory.

For canonical validation legitimacy — where "valid" means "this invocation can
proceed to execution against the authoritative continuity" — leaf continuity is
required. Non-revoked ACTIVE status is necessary but not sufficient under
supersession.

---

**Q9. Should validation against a superseded continuity collapse to NULL or
remain historically valid?**

The current system collapses to NULL at `/execute` (via
`continuity_identity_mismatch`), not at `/validate`. This deferred collapse
means `/validate` returns `VALID` for invocations that will never execute.

For deterministic legitimacy, the collapse should be immediate at `/validate`.
The current deferred-collapse model produces ambiguous `VALID` responses that
require downstream re-evaluation to determine actual executability.

---

**Q10. What reconciliation semantics are required if validation reservation and
child continuity creation race concurrently?**

The dead reservation state produced by the race requires a reconciliation path.
Without one, `invocation_registry`, `validation_registry`, and
`authority_registry` accumulate unreachable RESERVED/VALID records.

Required reconciliation semantics:

1. **Detection**: Identify RESERVED invocations whose `continuity_id` is no
   longer the leaf (i.e., a child ACTIVE continuity exists for that
   `continuity_id`).
2. **Disposition**: Mark such invocations as STALE or REVOKED, cascade to the
   associated validation and authority records.
3. **Trigger**: Either at child-continuity creation time (cascade revocation of
   all RESERVED invocations on the parent) or via a background reconciliation
   sweep with bounded TTL.

Currently, neither trigger exists. `cascadeRevocation()` is called only on
REVOKED continuity status, not on child-creation supersession.

---

**Q11. Does SUPERSEDED status eliminate the need for advisory anti-join
freshness checks?**

Yes, conditionally. If an explicit `SUPERSEDED` status were set atomically when
a child continuity is created, any replica could evaluate leaf status from a
simple `status='ACTIVE'` check on the specific continuity row — no correlated
subquery required. The NOT EXISTS anti-join would become redundant.

This would require the child-creation path to atomically transition
`parent.status = 'SUPERSEDED'` in the same write as the child INSERT. That
transition would be topology-visible and replica-propagated, making leaf state
authoritative rather than advisory.

Under the current schema (no SUPERSEDED status, no atomic transition), the
anti-join is the only available mechanism and it carries the replica-lag
vulnerability described above.

---

**Q12. Can invocation reservation become topology-independent once supersession
is authoritative?**

Yes. If supersession status is authoritative (explicit SUPERSEDED flag set
atomically at child-creation), the reservation INSERT can include a WHERE
predicate on the continuity row's status directly:

```sql
INSERT OR IGNORE INTO invocation_registry (...)
SELECT ...
WHERE EXISTS (
  SELECT 1 FROM continuity_registry c
  WHERE c.continuity_id = ?4
    AND c.status = 'ACTIVE'        -- not SUPERSEDED, not REVOKED
    AND c.revoked_at IS NULL
    AND c.expires_at > now
)
```

Any replica would evaluate this deterministically from the propagated
`status='SUPERSEDED'` row without re-querying child relationships. The
reservation outcome would be topology-independent.

---

## 5. Closure Analysis

### Replay Convergence Assessment

| Property | Current State |
|---|---|
| Nonce uniqueness | **Deterministic** — INSERT OR IGNORE on composite PK |
| Reservation validity under supersession | **Non-deterministic** — advisory gap |
| Execution-block under supersession | **Effective** — /execute re-checks leaf |
| Dead-reservation cleanup | **Absent** — no reconciliation path |
| Validation return value under stale leaf | **Misleading** — returns VALID |

### Race Condition Summary

| Race | Outcome | Recovery |
|---|---|---|
| Child created between leaf-check and INSERT | Dead RESERVED entry | None |
| Stale replica serves leaf-check | Dead RESERVED entry | None |
| Two concurrent /validate on same authority | Second blocked by RESERVED status | Clean |
| /validate races /continuity on same session | Dead RESERVED + VALID validation | None |

### Topology Convergence Analysis

The current topology is **convergent under single-node conditions**. Under
distributed conditions with read-replica lag, it is **divergent at the
advisory check boundary**. The atomic execution barrier at `/execute` provides
downstream convergence but does not prevent accumulation of dead-state records.

### Supersession Survivability Analysis

The system **survives supersession at execution** — the `/execute`
`continuity_identity_mismatch` check is structurally sound. It does **not
survive supersession at validation** — `/validate` can return VALID for
invocations that are already execution-dead at return time.

### Invocation Reservation Implications

The invocation reservation is:
- Topologically correct when leaf-check and INSERT are atomic
- Topologically unreliable when a race occupies the gap between them
- Unrecoverable once reserved against a superseded continuity
- Silent on leaf freshness (no epoch, no leaf-at-reservation marker)

### Deterministic Legitimacy Assessment

`/validate` is currently **legitimacy-convergent under sequential conditions**
and **legitimacy-divergent under concurrent supersession**.

The VALID/AUTHORIZED/UNUSED/POLICY_VALID invariant holds at the moment of
return but is not guaranteed to hold forward. A returned `VALID` is a snapshot
assertion, not a topology-stable claim.

---

## 6. Remaining Gaps

1. **No atomic leaf-freshness in reservation**: The leaf check and the
   reservation INSERT are not coupled. A conditional INSERT would close this gap.

2. **No SUPERSEDED status**: Without an explicit supersession state, leaf
   detection requires a correlated subquery that is vulnerable to replica lag.

3. **No dead-reservation reconciliation**: RESERVED invocations against
   superseded continuities accumulate without cleanup. `cascadeRevocation()`
   does not trigger on child-creation.

4. **No continuity epoch in invocation_registry**: Reservations cannot be
   self-audited for leaf freshness post-hoc. Reconciliation requires a live
   topology query.

5. **replay_epoch is stored but not validated**: The `execution_snapshot_registry`
   stores a caller-supplied `replay_epoch` (`src/index.ts:1173`) but no validation
   logic binds it to continuity topology. It is an inert field.

6. **Deferred collapse semantics**: `/validate` returns VALID for invocations
   that will be rejected at `/execute`. The system provides no signal at
   validation time that the returned VALID is execution-dead.

---

## 7. Closure-State Classification

| Dimension | Classification |
|---|---|
| Replay determinism | **Closed** (nonce uniqueness) |
| Leaf-freshness atomicity | **Open** (advisory gap) |
| Supersession survivability at /execute | **Closed** (mismatch check) |
| Supersession survivability at /validate | **Open** (deferred collapse) |
| Dead-reservation reconciliation | **Open** (no path) |
| Distributed topology convergence | **Open** (replica lag vulnerability) |
| Epoch / leaf-marker encoding | **Open** (absent) |
| Delegated lineage leaf-freshness | **Open** (not re-verified at delegation check) |
| Overall closure state | **Partially closed — execution safe, validation advisory** |

---

*This document is a static analysis. No code was modified. No runtime behavior
was altered. No legitimacy state was invented.*
