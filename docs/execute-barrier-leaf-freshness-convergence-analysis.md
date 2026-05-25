# Execute Barrier Leaf-Freshness Convergence Analysis

**Issue:** #1208 — Execute barrier missing canonical leaf-freshness enforcement  
**Analysis Mode:** MODE B — STRUCTURED ARTIFACT  
**Scope:** Deterministic execute-barrier convergence under concurrent child continuity creation, stale topology visibility, asynchronous lineage propagation, and supersession races.

---

## 1. Current Execute Barrier Architecture

### 1.1 Atomic Barrier — INSERT WHERE EXISTS (lines 7783–7789)

The execute barrier is implemented as a single atomic `INSERT INTO execution_registry … SELECT … WHERE EXISTS` statement in `src/index.ts`. All four conditions must hold simultaneously at the database write level:

```sql
INSERT INTO execution_registry (...)
SELECT ...
WHERE EXISTS (
  SELECT 1 FROM continuity_registry c
  WHERE c.continuity_id=?7
    AND c.status='ACTIVE'
    AND c.revoked_at IS NULL
    AND c.expires_at>?6                        -- (1) continuity liveness
)
AND EXISTS (
  SELECT 1 FROM authority_registry a
  WHERE a.decision_id=?3
    AND a.session_id=?2
    AND a.continuity_id=?7
    AND a.status IN ('RESERVED','VALIDATED')   -- (2) authority eligibility
)
AND EXISTS (
  SELECT 1 FROM validation_registry v
  WHERE v.decision_id=?3
    AND v.validated_object_hash=?4
    AND v.invocation_nonce=?5
    AND v.session_id=?2
    AND v.continuity_id=?7
    AND v.status='VALID'
    AND v.result='VALID'                       -- (3) validation existence
)
AND EXISTS (
  SELECT 1 FROM invocation_registry i
  WHERE i.decision_id=?3
    AND i.validated_object_hash=?4
    AND i.invocation_nonce=?5
    AND i.continuity_id=?7
    AND i.status='RESERVED'                    -- (4) invocation reservation
)
```

If `meta.changes !== 1` the handler rejects with `execution_blocked_by_revocation_closure_barrier` (line 7789).

### 1.2 Pre-Barrier Sequential Read Chain (lines 7711–7778)

Before the atomic write, the handler performs a multi-step advisory read chain:

| Step | Line | Operation | TOCTOU Window Opens |
|------|------|-----------|---------------------|
| 1 | 7711 | Read `validation_registry` | Yes |
| 2 | 7713 | Freshness window check (5 min) | Yes |
| 3 | 7716 | Read `session_registry` via `activeSession()` | Yes |
| 4 | 7719 | Read `invocation_registry` | Yes |
| 5 | 7721 | Read `proof_registry` for replay | Yes |
| 6 | 7723 | Read `authority_registry` | Yes |
| 7 | 7730 | `activeContinuity()` → `resolveContinuityLineage()` | Yes |
| 8 | **7732** | **`resolveCurrentContinuityIdentity()` — leaf-freshness read** | **Yes — critical** |
| 9 | 7734 | Continuity identity equality check | Yes |
| 10 | 7738–7761 | Lineage hash integrity verification | Yes |
| 11 | 7740 | `execution_registry` replay check | Yes |
| 12 | 7742 | AEO compiled hash verification | Yes |
| 13 | 7762–7765 | Delegated authority + provenance validation | Yes |
| 14 | 7783 | **ATOMIC INSERT WHERE EXISTS** | Window closes here |

### 1.3 resolveCurrentContinuityIdentity — Leaf-Freshness Query (lines 2629–2655)

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

This is the sole location where `NOT EXISTS(child)` is evaluated. It is evaluated once, as a pre-barrier sequential read, not inside the atomic barrier.

---

## 2. Authoritative Barrier Guarantees

The atomic `INSERT WHERE EXISTS` at lines 7783–7789 authoritatively guarantees **only** the following at the moment of write:

| Guarantee | Condition in Barrier | Closure State |
|-----------|---------------------|---------------|
| Continuity is ACTIVE | `c.status='ACTIVE'` | **CLOSED** |
| Continuity is not explicitly revoked | `c.revoked_at IS NULL` | **CLOSED** |
| Continuity has not expired by `expires_at` | `c.expires_at>?6` | **CLOSED** |
| Authority is RESERVED or VALIDATED | `a.status IN ('RESERVED','VALIDATED')` | **CLOSED** |
| Validation is VALID with matching fields | `v.status='VALID' AND v.result='VALID'` | **CLOSED** |
| Invocation nonce is RESERVED | `i.status='RESERVED'` | **CLOSED** |

The barrier does **not** authoritatively guarantee:

| Missing Guarantee | Reason |
|-------------------|--------|
| Continuity is the canonical leaf (no active children) | `NOT EXISTS(child)` absent from barrier |
| Continuity has not been superseded since pre-barrier read | Supersession is status-silent; parent stays `ACTIVE` |
| Executed lineage = canonical leaf lineage | Leaf identity resolved pre-barrier only |
| Anti-join freshness at execution time | Anti-join evaluated before atomic write |
| Topology-stable leaf ordering | `ORDER BY issued_at` evaluated pre-barrier |

---

## 3. Advisory-Only Freshness Paths

The following checks are advisory: they fire before the barrier, are not repeated inside the atomic write, and can become stale in the race window between their evaluation and the INSERT.

### 3.1 Leaf-Freshness (Advisory)

`resolveCurrentContinuityIdentity()` at line 7732 returns the canonical leaf at time T1. The barrier fires at time T2. Any child continuity created in (T1, T2) makes the T1 result stale.

- **Advisory vs. Authoritative:** Advisory
- **Failure Condition:** Concurrent child creation between T1 and T2
- **Barrier Coverage:** None — `NOT EXISTS(child)` not present in barrier

### 3.2 Continuity Identity Match (Advisory)

Line 7734 compares `currentContinuityIdentity.continuity_id` (from the advisory leaf read) against `authority.continuity_id`. This check is correct at T1 but not re-evaluated at T2.

- **Advisory vs. Authoritative:** Advisory
- **Failure Condition:** Supersession between T1 and T2 causes identity drift

### 3.3 Validation Freshness Window (Advisory)

Line 7713 checks `isFresh(validation.created_at, VALIDATION_FRESHNESS_WINDOW_MS)` (5-minute window). This is evaluated at T0 but the barrier does not re-verify freshness. Validation could age past the window between T0 and T2, but the barrier still fires.

- **Advisory vs. Authoritative:** Advisory
- **Failure Condition:** Validation expires between freshness check and INSERT (narrow but non-zero window)
- **Closure State:** PARTIAL — window check enforced pre-barrier, not re-checked in barrier

### 3.4 Replay Guard — proof_registry (Advisory)

Line 7721 checks `proof_registry` for existing proof with matching `decision_id + validated_object_hash`. This is a sequential read. A concurrent proof creation between T0 and T2 could produce two proof entries for the same execution.

- **Advisory vs. Authoritative:** Advisory (for proof replay)
- **Failure Condition:** Concurrent `/proof` call between advisory check and INSERT
- **Closure State:** PARTIAL — `execution_registry` unique constraint provides partial replay protection; `proof_registry` replay is advisory only

### 3.5 Authority Status Check (Advisory Pre-Read)

Line 7723 reads authority status. The barrier re-checks at T2 (CLOSED for that condition). However the pre-read at line 7723 is used for early rejection — it is redundant with the barrier for that specific condition.

- **Advisory vs. Authoritative:** Redundant advisory pre-check; barrier re-verifies

---

## 4. Execute-Time Lineage Failure Modes

### FM-1: Stale Parent Execution

**Description:** Execution proceeds against a parent continuity after a child has been created.

**Sequence:**
1. Continuity X is the canonical leaf at T1.
2. `/execute` pre-barrier reads confirm X is the leaf (T1).
3. Concurrent request creates child continuity Y with `parent_continuity_id=X` (T1.5).
4. X remains `status='ACTIVE'` — no status transition occurs.
5. `/execute` barrier fires: `c.status='ACTIVE'` → passes. No `NOT EXISTS(child)` → passes.
6. Execution inserts against X, which is no longer the canonical leaf.

**Result:** `executed_lineage ≠ canonical_leaf_lineage`

**Current Closure State:** OPEN  
**Barrier Coverage:** None  
**Replay Dependencies:** Not applicable  
**Topology Dependencies:** Concurrent child creation race  
**Supersession Dependencies:** Implicit supersession not enforced at barrier  
**Deterministic Convergence Status:** Non-deterministic  
**Required Closure:** `NOT EXISTS(child)` in atomic barrier  
**Closure Risk Level:** HIGH

---

### FM-2: Superseded Lineage Execution

**Description:** A continuity that has been logically superseded (child exists) but not explicitly revoked retains `ACTIVE` status and passes the barrier.

**Root Cause:** Supersession in this system is implicit — it is expressed only through the `NOT EXISTS(child)` guard in `resolveCurrentContinuityIdentity`. There is no `status='SUPERSEDED'` transition. A superseded continuity is indistinguishable from an active leaf at the barrier level.

**Current Closure State:** OPEN  
**Barrier Coverage:** None — `ACTIVE` check does not exclude superseded  
**Advisory vs. Authoritative:** Advisory pre-check only  
**Failure Conditions:** Child creation between leaf resolution and barrier execution  
**Deterministic Convergence Status:** Non-deterministic under concurrent continuity creation  
**Required Closure:** Either explicit `SUPERSEDED` status transition on child creation, or `NOT EXISTS(child)` in barrier  
**Closure Risk Level:** HIGH

---

### FM-3: Topology Visibility Lag

**Description:** In a distributed database environment (Cloudflare D1), a write to `continuity_registry` (creating child Y) may not be immediately visible to a concurrent read on a different connection evaluating `NOT EXISTS(child)`.

**Impact:** `resolveCurrentContinuityIdentity` may see a stale snapshot where child Y does not yet exist, even if it has been committed. This extends the effective race window beyond the application-layer TOCTOU into the database visibility layer.

**Current Closure State:** OPEN  
**Barrier Coverage:** None — barrier does not compensate for visibility lag  
**Topology Dependencies:** Yes — visibility lag affects both pre-barrier check and potential future barrier `NOT EXISTS` check  
**Deterministic Convergence Status:** Non-deterministic under stale visibility  
**Closure Risk Level:** HIGH

---

### FM-4: Stale Anti-Join Evaluation

**Description:** The anti-join `NOT EXISTS(child)` in `resolveCurrentContinuityIdentity` is evaluated at T1. The barrier fires at T2. The anti-join result is not re-evaluated at T2. Any child creation in (T1, T2) renders the anti-join result stale without the barrier detecting it.

**Current Closure State:** OPEN  
**Barrier Coverage:** None  
**Advisory vs. Authoritative:** Advisory  
**Failure Conditions:** Child continuity insertion concurrent with execute pipeline  
**Deterministic Convergence Status:** Non-deterministic  
**Required Closure:** Anti-join moved inside atomic barrier  
**Closure Risk Level:** HIGH

---

### FM-5: Lineage Fork Ambiguity

**Description:** If two child continuities are created for the same parent in rapid succession, `resolveCurrentContinuityIdentity`'s `ORDER BY c.issued_at DESC, c.continuity_id DESC LIMIT 1` tie-breaking is non-semantic (text-sorted UUID). The resulting "canonical leaf" is topology-dependent on insertion order rather than authoritative lineage ordering.

**Current Closure State:** PARTIAL — tie-breaking exists but is non-semantic  
**Barrier Coverage:** None for fork ambiguity  
**Topology Dependencies:** Yes — ordering depends on `issued_at` clock synchronization  
**Deterministic Convergence Status:** Non-deterministic under concurrent child creation  
**Closure Risk Level:** MEDIUM

---

### FM-6: Continuity Supersession Drift

**Description:** Between `/validate` and `/execute`, the continuity landscape can change. `/validate` pins a `continuity_id` and `validated_object_hash`. If a child is created after validation but before execution, the validated continuity is no longer canonical, but the validation record still bears the old `continuity_id`. The execute barrier accepts this validation as VALID.

**Current Closure State:** OPEN  
**Barrier Coverage:** Validation `status='VALID'` is checked but leaf-freshness of the validation's continuity is not  
**Failure Conditions:** Child continuity creation between `/validate` and `/execute`  
**Deterministic Convergence Status:** Non-deterministic  
**Required Closure:** Barrier must verify leaf-freshness of validation's continuity at execution time  
**Closure Risk Level:** HIGH

---

### FM-7: Non-Leaf Execution Legitimacy

**Description:** Current invariant states `ACTIVE ≠ canonical`. The barrier enforces `ACTIVE` but not `canonical`. Execution can proceed against a non-leaf ACTIVE continuity, violating the invariant.

**Current Closure State:** OPEN  
**Barrier Coverage:** `ACTIVE` enforced; `canonical` not enforced  
**Required Closure:** Leaf check in barrier  
**Closure Risk Level:** HIGH

---

## 5. Supersession Visibility Analysis

### 5.1 Supersession Semantics

Supersession in this system is **implicit and advisory**:

- There is no explicit `status='SUPERSEDED'` value in `continuity_registry`.
- A continuity is functionally "superseded" when a child with `parent_continuity_id=c.continuity_id` exists and is ACTIVE.
- The only enforcement point for this semantics is the `NOT EXISTS(child)` anti-join in `resolveCurrentContinuityIdentity` (line 2641–2649).
- Child creation does **not** trigger a parent status transition. The parent retains `status='ACTIVE'`.
- `invalidateContinuityLineage` (line 2476) propagates downward (parent → children) via recursive CTE, not upward (child creation does not affect parent).

### 5.2 Is Supersession Advisory or Authoritative?

**Supersession is advisory.** It is expressed only through the pre-barrier leaf detection query. The barrier itself does not encode supersession semantics. An explicitly superseded continuity (parent with active child) is barrier-eligible as long as it is ACTIVE.

### 5.3 Can ACTIVE Continuity Remain Executable After Supersession?

**Yes.** Under current architecture:
- Parent X: `status='ACTIVE'`, child Y exists with `parent_continuity_id=X`
- Barrier condition 1: `c.status='ACTIVE' AND c.revoked_at IS NULL AND c.expires_at>?6` → **PASSES** for X
- No barrier condition encodes `NOT EXISTS(child)`
- **X is executable** at the barrier level despite supersession

### 5.4 Does Execute Legitimacy Depend on Topology Ordering?

**Yes.** Legitimacy depends on whether the leaf-detection query's `ORDER BY issued_at DESC` reflects actual insertion order, which is clock-dependent. In distributed environments with clock skew or same-millisecond issuance, legitimacy outcome varies by topology.

---

## 6. Topology-Dependent Execution Risks

| Risk | Source | Topology Dependency | Current State |
|------|--------|---------------------|---------------|
| Leaf detection ordering non-determinism | `issued_at` tie-breaking in `resolveCurrentContinuityIdentity` | Yes — clock skew | PARTIAL |
| Concurrent child creation visibility | D1 read-after-write consistency | Yes — visibility lag | OPEN |
| Anti-join staleness | Pre-barrier read executed before atomic write | Yes — write ordering | OPEN |
| Session-level concurrency | Multiple concurrent execute pipelines for same session | Yes — distributed timing | OPEN |
| cascadeRevocation timing | Revocation write may not be visible at barrier | Yes — write propagation | PARTIAL (barrier checks independently) |

### 6.1 Critical Topology Risk: Concurrent Execute Pipelines

Two concurrent `/execute` calls for the same `decision_id` and `validated_object_hash` are blocked by:
- The `UNIQUE` constraint on `execution_registry` (provenance fields — implicit via `execution_id` or compound uniqueness)
- The replay check at line 7740 (`SELECT execution_id FROM execution_registry WHERE decision_id=?1 AND validated_object_hash=?2`)
- The invocation `status='RESERVED'` → only one INSERT can succeed (second will see `status='EXECUTED'`)

This path is **CLOSED** for same-decision replay.

### 6.2 Critical Topology Risk: Two Executions Against Different Continuities

Two execute pipelines for the **same session** but **different continuities** are not mutually exclusive at the barrier. If continuity X has been superseded but not revoked, an execute against X and an execute against child Y can both proceed. This produces:
- Two `execution_registry` rows for the same session
- Non-canonical executed lineage for the X execution
- **Topology-dependent legitimacy outcomes**

**Current Closure State:** OPEN

---

## 7. Canonical Leaf-Lineage Determinism

### 7.1 Invariant Under Analysis

> executed lineage = canonical leaf lineage

### 7.2 Current Determinism Assessment

This invariant is **not deterministically enforced** under:

| Condition | Deterministic? |
|-----------|----------------|
| Sequential execution, no concurrent child creation | Yes — pre-barrier check sufficient |
| Concurrent child creation during execute pipeline | **No** — leaf check not in barrier |
| Stale topology visibility (D1 lag) | **No** — pre-barrier read may be stale |
| Concurrent execute pipelines for same session | **No** — both may proceed against different non-leaf continuities |
| Clock-skewed leaf ordering | **Partially** — deterministic within single DB transaction, non-deterministic across distributed writes |

### 7.3 Why `ACTIVE` ≠ `canonical`

The atomic barrier enforces `c.status='ACTIVE'`. This is a necessary but not sufficient condition for canonical execution legitimacy. A canonical continuity must additionally satisfy:

```
canonical(c) ≡ ACTIVE(c) ∧ ¬∃ child where ACTIVE(child) ∧ parent(child)=c
```

The second conjunct is absent from the barrier, creating the determinism gap.

---

## 8. Required Barrier Expansions

### 8.1 Primary Required Expansion: Leaf-Freshness in Atomic Barrier

**Target:** Add `NOT EXISTS(child)` condition to the execute barrier's continuity EXISTS check.

**Current barrier condition (line 7785):**
```sql
EXISTS (
  SELECT 1 FROM continuity_registry c
  WHERE c.continuity_id=?7
    AND c.status='ACTIVE'
    AND c.revoked_at IS NULL
    AND c.expires_at>?6
)
```

**Required expanded condition:**
```sql
EXISTS (
  SELECT 1 FROM continuity_registry c
  WHERE c.continuity_id=?7
    AND c.status='ACTIVE'
    AND c.revoked_at IS NULL
    AND c.expires_at>?6
    AND NOT EXISTS (
      SELECT 1 FROM continuity_registry leaf_child
      WHERE leaf_child.parent_continuity_id=c.continuity_id
        AND leaf_child.session_id=c.session_id
        AND leaf_child.identity_id=c.identity_id
        AND leaf_child.status='ACTIVE'
        AND (leaf_child.revoked_at IS NULL OR leaf_child.revoked_at='')
        AND leaf_child.expires_at>?6
    )
)
```

This moves the anti-join from advisory pre-barrier to authoritative atomic-barrier, closing FM-1, FM-2, FM-4, FM-7.

**Advisory vs. Authoritative after expansion:** Authoritative  
**Closure Risk Level:** HIGH — must be implemented  

### 8.2 Secondary Required: Canonical Leaf Identity Binding

After expansion 8.1, the barrier implicitly verifies leaf-freshness. However the session/identity scope of the child query must match the session used in the execute pipeline. Bind `?2` (session_id) and derive identity from authority or an explicit bind parameter.

### 8.3 What May Remain Advisory

The following pre-barrier checks may remain advisory (they are defense-in-depth, not leaf-freshness convergence gaps):

- Validation freshness window check (line 7713) — narrows execution window, acceptable as advisory
- AEO compiled hash equality (lines 7742–7748) — cryptographic, not time-sensitive
- Provenance attestation (lines 7764–7775) — replay-protected by HMAC
- Delegated authority lineage (line 7762) — advisory pre-validation, acceptable

### 8.4 What Must Fail CLOSED

| Condition | Must Fail Closed |
|-----------|-----------------|
| Child continuity exists for executing continuity | **Yes** — barrier must reject |
| Continuity status not ACTIVE | **Yes** — already CLOSED |
| Invocation not RESERVED | **Yes** — already CLOSED |
| Executed lineage ≠ canonical leaf lineage | **Yes** — requires 8.1 |

### 8.5 What Must Collapse to NULL

Any execution attempt where the continuity is not the canonical leaf must collapse to `NULL` — not INVALID (which implies error), but `NULL` (no valid execution path exists). Current barrier already returns `status:"NULL"` on failure (line 7789). Semantics are correct; coverage is incomplete.

---

## 9. Deterministic Execution Convergence Gaps

| Gap | FM Reference | Root Cause | Barrier Addressable |
|-----|-------------|------------|---------------------|
| Leaf check not in atomic barrier | FM-1, FM-2, FM-4, FM-7 | `NOT EXISTS(child)` absent from INSERT WHERE EXISTS | **Yes** |
| Supersession advisory only | FM-2 | No `SUPERSEDED` status; implicit only | Yes (via barrier expansion or explicit status) |
| Stale anti-join under topology lag | FM-3 | Pre-barrier read vs. D1 visibility | Partially — barrier expansion reduces window; lag cannot be fully eliminated |
| Lineage fork ambiguity | FM-5 | Non-semantic tie-breaking | Partially — semantic ordering at child creation |
| Post-validate supersession drift | FM-6 | Child creation between `/validate` and `/execute` | **Yes** — barrier expansion closes this |
| Concurrent non-leaf execution | FM-7 | ACTIVE ≠ canonical | **Yes** — barrier expansion closes this |

---

## 10. Closure-State Classification

| Execution Lineage Path | Current Closure State | Barrier Coverage | Advisory vs. Authoritative | Failure Conditions | Replay Dependencies | Topology Dependencies | Supersession Dependencies | Deterministic Convergence | Required Closure | Closure Risk Level |
|------------------------|----------------------|------------------|----------------------------|--------------------|--------------------|-----------------------|--------------------------|--------------------------|------------------|--------------------|
| Continuity ACTIVE check | CLOSED | Full atomic | Authoritative | status ≠ ACTIVE | None | Low | None | Yes | None | N/A |
| Continuity not revoked | CLOSED | Full atomic | Authoritative | revoked_at SET | None | Low | None | Yes | None | N/A |
| Continuity not expired | CLOSED | Full atomic | Authoritative | expires_at past | None | Low | None | Yes | None | N/A |
| Authority RESERVED/VALIDATED | CLOSED | Full atomic | Authoritative | status consumed | None | Low | None | Yes | None | N/A |
| Validation VALID | CLOSED | Full atomic | Authoritative | validation revoked | None | Low | None | Yes | None | N/A |
| Invocation RESERVED | CLOSED | Full atomic | Authoritative | nonce reused | Nonce uniqueness | Low | None | Yes | None | N/A |
| **Canonical leaf (no child)** | **OPEN** | **None** | **Advisory** | **Concurrent child creation** | **None** | **High** | **High** | **No** | **Add NOT EXISTS(child) to barrier** | **HIGH** |
| **Supersession non-executable** | **OPEN** | **None** | **Advisory** | **Child created, parent stays ACTIVE** | **None** | **High** | **High** | **No** | **Barrier expansion or explicit status** | **HIGH** |
| **Anti-join freshness** | **OPEN** | **None** | **Advisory** | **Child created in T1–T2 window** | **None** | **High** | **High** | **No** | **Move anti-join into barrier** | **HIGH** |
| Post-validate lineage drift | OPEN | None | Advisory | Child created after `/validate` | None | High | High | No | Barrier leaf check | HIGH |
| Validation freshness window | PARTIAL | Pre-barrier only | Advisory | Validation ages between check and INSERT | None | Low | None | Partial | Accept as advisory | LOW |
| Execution replay protection | CLOSED | Unique constraint + barrier | Authoritative | Duplicate decision+hash | Full | Low | None | Yes | None | N/A |
| Proof replay protection | PARTIAL | Pre-barrier only | Advisory | Concurrent `/proof` race | Partial | Medium | None | Partial | Accept as advisory | LOW |
| Lineage hash integrity | CLOSED | Cryptographic | Authoritative | Hash fabrication | Full | None | None | Yes | None | N/A |
| Delegated authority lineage | CONTAINED | Pre-barrier only | Advisory | Delegation chain broken | Partial | Low | None | Partial | Accept as advisory | LOW |
| Concurrent non-leaf execution | OPEN | None | None | Two executions against superseded+leaf | None | High | High | No | Barrier expansion | HIGH |
| Topology-dependent leaf ordering | PARTIAL | Pre-barrier ORDER BY | Advisory | Clock skew on issued_at | None | High | None | Partial | Semantic child ordering | MEDIUM |

---

## 11. Highest-Leverage Closure Targets

Ordered by convergence impact:

### Target 1 — `NOT EXISTS(child)` inside atomic execute barrier
**Lines:** 7783–7789 in `src/index.ts`  
**Impact:** Closes FM-1, FM-2, FM-4, FM-6, FM-7 simultaneously  
**Mechanism:** Add `NOT EXISTS(leaf_child)` correlated subquery to the continuity `EXISTS` check inside `INSERT WHERE EXISTS`  
**Closure State Change:** OPEN → CLOSED for leaf-freshness  
**Risk:** The added subquery runs inside the same D1 transaction as the INSERT — this is the minimal required change and has no semantic side effects

### Target 2 — Explicit `SUPERSEDED` status on parent at child creation
**Lines:** `/continuity` endpoint (7383–7527)  
**Impact:** Makes supersession authoritative rather than implicit; eliminates FM-2 even if barrier expansion is delayed  
**Mechanism:** When a child continuity is inserted, update the parent's status from `ACTIVE` to `SUPERSEDED` (or equivalent non-executable terminal state)  
**Closure State Change:** OPEN → CLOSED for supersession  
**Risk:** Requires status enum expansion and downstream handling; larger blast radius than Target 1

### Target 3 — Canonical leaf pre-binding at authority issuance
**Impact:** Pin the canonical leaf at `/authority` issuance time, not at `/execute` time; validate that authority was issued against the current leaf  
**Mechanism:** Authority records the `NOT EXISTS(child)` result at issuance; execute verifies this binding  
**Closure State Change:** OPEN → CONTAINED for post-authority supersession  
**Risk:** Medium — requires authority schema extension

### Target 4 — Semantic child ordering at creation
**Lines:** 7383–7527 (`/continuity`)  
**Impact:** Closes FM-5 (lineage fork ambiguity) by replacing `issued_at` ordering with a monotonic sequence  
**Mechanism:** Add a `lineage_sequence` column to `continuity_registry`, incremented per (session_id, identity_id, parent_continuity_id)  
**Closure State Change:** PARTIAL → CLOSED for fork ambiguity  
**Risk:** Low — additive schema change

---

## 12. Canonical Next-Layer Recommendations

**These are analysis outputs only. They do not constitute implementation authorization. AI output is never authority.**

1. **Barrier expansion (Target 1) is the minimum required change.** Without it, the invariant `executed_lineage = canonical_leaf_lineage` is not deterministically enforced under any concurrent child creation scenario.

2. **Supersession must be authoritative, not advisory.** The current design where `ACTIVE` status does not distinguish "leaf ACTIVE" from "superseded ACTIVE" is a structural gap. Either the barrier encodes the distinction (Target 1) or the status transition does (Target 2). One of these two must be implemented.

3. **Topology lag cannot be eliminated but can be narrowed.** Moving the anti-join into the barrier reduces the race window to the duration of the D1 write transaction itself, which is the minimum achievable window. Topology-level visibility guarantees are outside application-layer control.

4. **The pre-barrier `resolveCurrentContinuityIdentity` check (line 7732) should be retained** after barrier expansion. It provides early rejection for the common case and reduces unnecessary barrier contention. However it must be understood as defense-in-depth, not the authoritative closure point.

5. **Proof replay advisory gap (Section 3.4) is acceptable** given that execution replay is CLOSED. A duplicate proof for the same execution produces redundant data but cannot produce unauthorized execution.

6. **Validation freshness as advisory is acceptable** at current window (5 minutes). If the window is reduced significantly, consider moving the freshness check into the barrier via a timestamp comparison in the WHERE EXISTS clause.

7. **The closure invariant to enforce at the barrier level:**

   ```
   VALID(continuity)
   ∧ ACTIVE(continuity)
   ∧ NOT_REVOKED(continuity)
   ∧ NOT_EXPIRED(continuity)
   ∧ IS_LEAF(continuity)          ← currently missing from barrier
   ∧ AUTHORIZED(authority)
   ∧ UNUSED(invocation)
   ∧ POLICY_VALID(validation)
   ∧ REPLAY_SAFE
   → EXECUTE
   Else → NULL
   ```

   The current barrier enforces all conditions except `IS_LEAF(continuity)`. That is the singular convergence gap.

---

*Analysis produced against: `src/index.ts` lines 2459–2655 (continuity resolution), 7705–7800 (/execute endpoint), `schema.sql` lines 17–31 (continuity_registry). No runtime state was mutated. No fixes were implemented. This document is analysis only.*
