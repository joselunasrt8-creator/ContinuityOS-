# V3 Storage Adapter Boundary — Separate Persistence from Continuity-Core Semantics

**Issue:** #1917
**Branch:** `claude/research-paper-closure-audit-auipw2`
**Spec date:** 2026-06-09
**Scope:** Storage adapter boundary classification — authority, replay, lineage, and proof
  persistence separated from continuity-core runtime semantics
**Prerequisite specs:**
- `runtime/V3_MINIMAL_CONTINUITY_CORE_SPEC.md` — kernel classification and Section 3 storage adapter table
- `runtime/V3_CONFORMANCE_SPEC.md` — TS/Rust equivalence contracts (closed by #1910 / #1915)
**Runtime changes:** None. Classification and boundary definition only.

---

## Context

#1910 established the cross-language TS/Rust conformance infrastructure.
#1912 audited closure. #1914 identified the reconciliation fixture-authority gap.
#1915 resolved that gap.

The conformance suite (#1910 / #1915) proves that continuity-core kernel behavior can
cross language boundaries. The next V3 portability blocker is persistence coupling.

The kernel boundary spec (`V3_MINIMAL_CONTINUITY_CORE_SPEC.md` Section 3) identified
storage adapters as a distinct classification but deferred the internal ownership
breakdown. This document completes that deferral.

Core principle established here:

```
continuity-core semantics ≠ storage mechanics
storage capability ≠ authority
```

The kernel computes. The storage layer persists. They are not the same surface.

---

## Invariants That Must Survive Every Storage Adapter Swap

These two invariants are frozen from V1 and must be verifiable regardless of which
storage backend is wired in:

```
If no valid object exists → nothing happens.
validated_object == executed_object.
```

A storage adapter swap that breaks either invariant is not a storage adapter swap —
it is a kernel change and is out of scope for V3.

No storage adapter may:
- Influence `VALID / NULL` classification
- Modify authority state
- Change execution eligibility
- Alter proof legitimacy
- Derive authority from persistence success or failure

---

## Registry Classification

Four registry types participate in the continuity-core execution chain. Each has a
distinct persistence contract. This section defines what the kernel requires from
each, and what the storage adapter must own without kernel involvement.

### 1. Authority Registry

**Kernel requirement:** Read-only at execution time.

The kernel reads authority to evaluate whether a given authority_id satisfies the
AEO's `validation.authority_lineage_hash`. The kernel never writes to the authority
registry during execution.

**Storage adapter ownership:**
- Authority record creation
- Authority record expiry / revocation scheduling
- Authority persistence format (row schema, column layout, index strategy)
- Cross-registry authority sync (offline only — must not block execution hot path)

**Kernel interface (read-only):**

```typescript
interface AuthorityRegistryReader {
  // Returns the authority record for a given authority_id, or null if not found.
  // Must never block on a write path or external sync.
  readAuthority(authority_id: string): AuthorityRecord | null
}

type AuthorityRecord = {
  readonly authority_id: string
  readonly lineage_hash: string        // canonical hash of authority provenance chain
  readonly valid_from: string          // ISO timestamp
  readonly valid_until: string | null  // null = no expiry defined
  readonly revoked: boolean
}
```

**What crosses the boundary:** `AuthorityRecord` (read-only value type).
**What does not cross the boundary:** database handles, connection strings,
  migration state, table schemas, row counts, index metadata.

**Forbidden cross-boundary patterns:**
- Passing `D1Database`, `SqliteDatabase`, or `PgClient` into any continuity-core function
- Reading authority inside a write transaction owned by the storage adapter
- Caching authority state in kernel-layer variables

---

### 2. Replay Registry

**Kernel requirement:** Nonce admission and consumed-nonce detection.

The kernel requires that a `replay_nonce` bound to an AEO has not been consumed by
a prior VALID execution. If the nonce is already consumed, the execution returns
NULL. If execution succeeds, the nonce is marked consumed.

The state transition is: `UNUSED → CONSUMED`. This transition is append-only — a
consumed nonce can never return to UNUSED.

**Storage adapter ownership:**
- Nonce persistence format (row schema, unique constraints, index strategy)
- Bootstrap DDL (`govern_nonce_registry` table, append-only trigger setup)
- Nonce expiry / archive policies (offline — must not block execution hot path)
- Cross-registry nonce deduplication (offline only)

**Kernel interface:**

```typescript
interface ReplayRegistryPort {
  // Returns true if the nonce has never been consumed by a VALID execution.
  // Returns false if the nonce is already consumed (replay attempt → NULL).
  // Must be called before execution; must not consume the nonce itself.
  isNonceUnused(replay_nonce: string): boolean

  // Marks the nonce as consumed. Called only after a VALID execution completes.
  // Must be idempotent: calling twice on the same nonce does not cause an error —
  // the second call is a no-op because the nonce is already consumed.
  // Must never be called on a NULL execution path.
  markNonceConsumed(replay_nonce: string, decision_id: string): void
}
```

**Append-only invariant:**
`CONSUMED` is a terminal state. The storage adapter must enforce this through
database constraints (unique index on `replay_nonce`, or append-only trigger),
not through application-level logic. The kernel does not verify the constraint
after the fact.

**What crosses the boundary:** boolean (unused check), void (mark consumed).
**What does not cross the boundary:** DDL, trigger definitions, migration state,
  nonce table row counts, expiry sweep schedules.

---

### 3. Lineage Registry

**Kernel requirement:** Hash chain verification.

The kernel verifies that each execution stage carries a canonical hash of its
parent stage. Lineage failures are not recoverable — a broken chain returns NULL.
The kernel never writes lineage records during execution; lineage is append-only
proof-of-chain, not a live-write path.

**Storage adapter ownership:**
- Lineage record persistence format
- Lineage graph storage and traversal indices
- Historical lineage archive and compaction (offline only)
- Cross-registry lineage reconciliation (offline only)

**Kernel interface (read-only at execution time):**

```typescript
interface LineageRegistryReader {
  // Returns the lineage record for a given node_id, or null if not found.
  // Orphan → null (kernel classifies as NULL execution).
  // Unknown node → null (kernel classifies as NULL execution).
  readLineageNode(node_id: string): LineageNode | null
}

type LineageNode = {
  readonly node_id: string
  readonly parent_id: string | null    // null only for the root node
  readonly canonical_hash: string      // sha256 of canonical node representation
  readonly depth: number               // chain depth from root
}

interface LineageRegistryAppender {
  // Appends a new lineage node after a VALID execution completes.
  // Must never be called on a NULL execution path.
  // node_id must be derived from the AEO hash — never generated by the storage adapter.
  appendLineageNode(node: LineageNode): void
}
```

**Append-only invariant:** Lineage nodes are never updated or deleted. The storage
adapter must enforce this through database constraints (no UPDATE / DELETE on the
lineage table). The kernel does not verify the constraint after the fact.

**What crosses the boundary:** `LineageNode` (read-only value type for reads;
  write path receives a fully-formed node from the kernel).
**What does not cross the boundary:** database handles, traversal cursors, graph
  index metadata, reconciliation schedules.

---

### 4. Proof Registry

**Kernel requirement:** Append-only proof persistence after VALID execution.

The kernel emits a proof receipt after a VALID execution. The receipt is an
immutable artifact binding the validated AEO to its execution evidence. Once
written, proof records are never updated or deleted.

**Storage adapter ownership:**
- Proof record persistence format
- Proof quarantine / archive (bootstrap-time duplicate detection — offline only)
- Proof search and retrieval indices
- Cross-registry proof reconciliation (offline only)

**Kernel interface (write-once):**

```typescript
interface ProofRegistryAppender {
  // Persists an immutable proof receipt after a VALID execution.
  // Must never be called on a NULL execution path.
  // receipt_id is pre-computed by the kernel — never generated by the storage adapter.
  // Duplicate receipt_id is a fatal integrity error: the adapter must surface it,
  // not silently drop the duplicate.
  appendProofReceipt(receipt: ProofReceipt): void
}

type ProofReceipt = {
  readonly receipt_id: string
  readonly validated_object_hash: string
  readonly executed_object_hash: string
  readonly execution_evidence_hash: string
  readonly adapter_surface: string
  readonly decision_id: string
  readonly replay_nonce: string
  readonly execution_result: "EXECUTED"
  readonly creates_authority: false
  readonly emitted_at: string
}
```

**Append-only invariant:** Proof records are never updated or deleted. The storage
adapter must enforce this through database constraints (no UPDATE / DELETE on the
proof table, or an append-only trigger). Bootstrap-time duplicate detection
(`src/index.ts` cluster 21) is a separate offline path — it must not run during
the execution hot path.

**What crosses the boundary:** `ProofReceipt` (write-once value type emitted by
  the kernel's `executeWithAdapter` boundary).
**What does not cross the boundary:** duplicate detection logic, archive schedules,
  index metadata, proof search queries.

---

## Read-Only State Interfaces Summary

At execution time, the continuity-core kernel touches storage through read-only
paths only. No kernel function called during the VALID / NULL evaluation writes
to storage except the post-VALID commit sequence.

| Registry | Execution-time access | Post-VALID commit |
|---|---|---|
| Authority | `readAuthority(id)` → read-only | None |
| Replay | `isNonceUnused(nonce)` → read-only | `markNonceConsumed(nonce, id)` |
| Lineage | `readLineageNode(id)` → read-only | `appendLineageNode(node)` |
| Proof | None | `appendProofReceipt(receipt)` |

The post-VALID commit sequence is atomic from the kernel's perspective: all four
writes (nonce mark, lineage append, proof append, evidence persist) must succeed
or the execution result is treated as indeterminate. The storage adapter owns the
transaction boundary for this commit group.

---

## Append-Only Persistence Interfaces

All storage writes across the four registries are append-only. No VALID execution
ever modifies an existing record.

```
Nonce:   UNUSED   → CONSUMED   (terminal; no reverse transition)
Lineage: new node → persisted  (no update or delete ever)
Proof:   new record → persisted (no update or delete ever)
```

These constraints must be enforced at the database layer, not the application layer.
Acceptable enforcement mechanisms:

- Unique constraint on primary key (prevents duplicate insert)
- Append-only trigger (blocks UPDATE and DELETE at the DB engine level)
- Immutable table policy (Postgres row-level security or D1 trigger equivalent)

The storage adapter is responsible for verifying that its backing store supports
one of these mechanisms and has it enabled before the runtime surface goes live.

---

## Adapter Ownership Boundaries

### D1 (Cloudflare) — Reference Adapter

The existing `src/lib/d1-storage-adapter.ts` implements the DML execution surface
for AEO-targeted D1 write operations. It is NOT the persistence boundary for the
four registries above — it is the execution surface adapter.

The D1 storage adapter must be extended or accompanied by a D1 registry adapter
that implements the four interfaces above.

| Interface | D1 implementation target |
|---|---|
| `AuthorityRegistryReader` | D1 query against `authority_registry` table |
| `ReplayRegistryPort` | D1 query + INSERT against `govern_nonce_registry` table (cluster 36) |
| `LineageRegistryReader` + `LineageRegistryAppender` | D1 query + INSERT against lineage table |
| `ProofRegistryAppender` | D1 INSERT against proof table (cluster 21 bootstrap-time dedup is offline) |

`D1Database` handle must never cross the continuity-core boundary. The D1 registry
adapter wraps the handle and exposes only the four typed interfaces above to the
kernel.

**`src/index.ts` clusters owned by D1 registry adapter:**

| Cluster | Lines | Content | Target |
|---|---|---|---|
| 16 — Schema / D1 Bootstrap | 2056–2360 | `ensureSchema`, `activateAppendOnlyRegistryEnforcement`, DDL | D1 registry adapter bootstrap |
| 21 — Proof Quarantine / Archive | 5651–5780 | Bootstrap-time duplicate proof detection | D1 registry adapter offline path |
| 36 — Govern Nonce Bootstrap | 9059–9071 | `govern_nonce_registry` DDL + migration | D1 registry adapter bootstrap |

---

### SQLite — Planned Adapter

The SQLite registry adapter implements the same four interfaces as the D1 adapter.
It wraps a SQLite connection handle and must not expose it to the kernel.

Enforcement requirements:
- `CREATE UNIQUE INDEX` on `replay_nonce` in `govern_nonce_registry`
- `CREATE TRIGGER` blocking UPDATE and DELETE on lineage and proof tables
- WAL mode required for the append-only trigger to function correctly under
  concurrent reads

Target file: `src/lib/sqlite-storage-adapter.ts` (planned; V3 step 7)

---

### Postgres — Planned Adapter

The Postgres registry adapter implements the same four interfaces. It wraps a
`PgClient` handle and must not expose it to the kernel.

Enforcement requirements:
- `UNIQUE` constraint on `replay_nonce`
- Row-level security policy or trigger blocking UPDATE and DELETE on lineage and
  proof tables
- `SERIALIZABLE` isolation for the post-VALID commit group

Target file: `src/lib/postgres-storage-adapter.ts` (planned; V3 step 7)

---

## Invariant Preservation Checklist

These checks apply at every storage adapter integration point. A storage adapter
that cannot satisfy all four is not a valid V3 storage adapter.

```
[ ] Authority registry: readAuthority() returns null (not throws) when the
    authority_id is not found. NULL execution — not a storage error.

[ ] Replay registry: isNonceUnused() returns false (not throws) when the nonce
    is already consumed. NULL execution — not a storage error.
    Verified by: conformance fixture invalid-replay.json (case: nonce reuse → NULL)

[ ] Lineage registry: readLineageNode() returns null (not throws) when the
    node_id is not found. NULL execution — not a storage error.
    Verified by: conformance fixture lineage-fixture.json (cases: orphan → NULL,
    unknown → NULL)

[ ] Proof registry: appendProofReceipt() surfaces an error (does not silently
    drop) when a duplicate receipt_id is encountered. Duplicate receipt_id is a
    fatal integrity violation, not a normal execution path.

[ ] Post-VALID commit group: all four writes (nonce consumed, lineage node,
    proof receipt, evidence persist) succeed atomically. No partial commit leaves
    the registry in a state where the nonce is consumed but no proof exists.

[ ] No D1Database / SqliteDatabase / PgClient handle appears in any file
    classified CONTINUITY-CORE in V3_MINIMAL_CONTINUITY_CORE_SPEC.md.

[ ] If no valid object exists → nothing happens.
    Verification: NULL path test returns no proof receipt; no registry write
    occurs on any NULL execution path.

[ ] validated_object == executed_object.
    Verification: AEO hash from Ω validator output matches AEO hash at execution
    boundary in every execution proof record. Storage adapter receives a
    pre-computed receipt — it never recomputes or re-derives the hash.
```

---

## What This Spec Does Not Decide

| Deferred decision | Reason |
|---|---|
| Concrete DDL for SQLite and Postgres tables | Deferred to V3 step 7 implementation |
| Connection pooling strategy for Postgres | Runtime infrastructure concern, not a kernel boundary |
| D1 query batch strategy | D1 adapter implementation concern |
| Cross-adapter migration tooling | Out of scope; belongs in a separate ops-level issue |
| Discovery adapter extraction | Separate boundary; next likely issue after #1917 |
| Root authority containment | Still open; separately tracked |
| Execution-surface classification completeness | Still open; separately tracked |

---

## File Targets

| File | Action | V3 Step |
|---|---|---|
| `src/lib/storage-adapter.ts` | Define the four typed registry interfaces as the abstract storage contract | Step 2 |
| `src/lib/d1-storage-adapter.ts` | Extend with D1 implementations of the four registry interfaces; wrap `D1Database` behind the typed interfaces | Step 2 |
| `src/lib/sqlite-storage-adapter.ts` | Implement the four registry interfaces for SQLite | Step 7 |
| `src/lib/postgres-storage-adapter.ts` | Implement the four registry interfaces for Postgres | Step 7 |

---

## Closure Condition

This spec is satisfied when:

```
1. src/lib/storage-adapter.ts exists and exports the four typed registry interfaces:
   AuthorityRegistryReader
   ReplayRegistryPort
   LineageRegistryReader + LineageRegistryAppender
   ProofRegistryAppender

2. No continuity-core file (Section 1 of V3_MINIMAL_CONTINUITY_CORE_SPEC.md) imports
   D1Database, SqliteDatabase, PgClient, or any database-specific handle.

3. The D1 registry adapter implements all four interfaces and the D1Database handle
   does not cross the continuity-core boundary.

4. The post-VALID commit group is transactional for at least one storage backend
   (D1 is the reference backend; SQLite closes step 7).

5. The two frozen invariants pass in the conformance suite with each backend:
   - NULL path: no proof receipt; no registry write.
   - VALID path: validated_object_hash == executed_object_hash in every proof record.
```

---

## V3 Sequence Position

```
#1910  TS/Rust conformance suite established
#1912  closure audit
#1914  reconciliation fixture-authority gap identified
#1915  reconciliation fixture authority completed
#1917  storage adapter boundary defined  ← this document
next   discovery adapter extraction (runtime-discovery-adapter.ts, cluster 32 first)
```

Portability proof to date:
- Kernel behavior crossing language boundaries: proven (#1910 / #1915)
- Persistence portability: boundary defined (this document)
- Discovery adapter extraction: next
