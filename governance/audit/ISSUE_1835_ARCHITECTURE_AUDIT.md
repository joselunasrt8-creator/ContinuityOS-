# Issue #1835 — Architecture Audit
# Recursive Continuity + Durable Nonce

**Audit Date:** 2026-06-04
**Issue:** #1835 — GAP-001 closure: enforce recursive continuity lineage validation and durable nonce persistence before authority execution eligibility

---

## Executive Summary

Issue #1835 identifies two gaps: (1) non-recursive ancestry traversal, and (2) non-durable replay guard. This audit finds that **Gap 1 is already implemented** in the production runtime. Gap 2 is real but scoped to a non-production code path. The correct implementation target is narrower than the issue suggests.

---

## Question 1: How Many Ancestry Checks Are Single-Hop Today?

**Answer: Zero.** The production ancestry traversal is fully recursive.

`resolveContinuityLineage()` at `src/index.ts:3349–3434` is a `while (current_id)` loop that:

1. Detects cycles via a `visited` Set (`if (visited.has(current_id)) → cascadeRevocation → return null`)
2. Enforces a depth limit via `SYSTEM_MAX_CONTINUITY_DEPTH` and `configuredMaxDepth`
3. Validates each ancestor node: status ACTIVE, session match, identity match, expiry check, hash verification, canonical parent binding
4. Cascades revocation or expiration on any failure (`cascadeRevocation(env, continuity_id)`)
5. Terminates only when `current_id` is null (reached root with no parent pointer)
6. Verifies that the final root has no `parent_continuity_id` (line 3432)

The separate `src/continuity-lineage-closure-hardening.ts` (`traverseContinuityAncestry`) is a pure evidence-only module used for reconciliation audits — it does not gate production execution.

**Status:** GAP-001 ancestry traversal is implemented. The issue's characterization of "validates the immediate parent but does not traverse the full recursive ancestry" describes a historical state, not the current codebase.

---

## Question 2: Where Is Nonce State Stored?

**Two separate nonce systems exist:**

### System A — Production execution nonce (D1, durable)

**Location:** `src/index.ts:2067`
```sql
CREATE TABLE IF NOT EXISTS invocation_registry (
  decision_id TEXT NOT NULL,
  validated_object_hash TEXT NOT NULL,
  invocation_nonce TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  continuity_id TEXT,
  PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce)
)
```

Replay detection at `src/index.ts` — `INSERT OR IGNORE` on invocation_registry; if `meta.changes !== 1` → replay detected → NULL.

**Used by:** `/validate`, `/execute`, `/proof`, `captureAgentToolCallATAO()`, agent_tool_invocation_registry

**Durability:** D1 — survives process restart

### System B — CLO replay guard (in-memory, non-durable)

**Location:** `src/lib/legitimacy-governance.js:78–87`
```js
export class ReplayGuard {
  #used = new Set();
  consume(id, fingerprint) {
    const token = `${id}:${fingerprint}`;
    if (this.#used.has(token)) return nullResult("replay_detected");
    this.#used.add(token);
    return { ok: true, state: "VALID" };
  }
}
```

**Used by:** `tests/legitimacy-governance-layer.test.mjs` only — NOT imported in any production source file.

**Durability:** None — in-memory Set, lost on process termination. Since Cloudflare Workers have no persistent memory across requests, each invocation starts with an empty Set regardless.

### The `replay_checkpoint_registry` Table

**Finding: This table does NOT exist in `schema.sql`.** The issue states it "already exists in `schema.sql` but is not used as the backing store." This is incorrect. No table named `replay_checkpoint_registry` appears in the schema or migrations. The D1 backing store for the production execution path is `invocation_registry`.

---

## Question 3: What Survives Restart?

| Surface | Survives restart | Mechanism |
|---|---|---|
| `invocation_registry` (production nonce) | **YES** | D1 database write |
| `agent_tool_invocation_registry` (ATAO nonce) | **YES** | D1 database write — `UNIQUE(atao_hash, decision_id, validated_object_hash, invocation_nonce)` |
| `ReplayGuard.#used` (CLO guard) | **NO** | In-memory Set — but test-only, not on production path |
| `continuity_registry` ancestry state | **YES** | D1 database |

---

## Question 4: What Does Replay Eligibility Actually Depend On?

**For production execution path:**

```
invocation_nonce ∈ (decision_id, validated_object_hash, invocation_nonce) PK
→ INSERT OR IGNORE
→ meta.changes === 0 → REPLAY_DETECTED → NULL
```

Full chain:
1. `/validate` — writes nonce to `validation_registry` with status VALID
2. `/execute` — checks validation row exists with matching nonce; writes to `execution_registry` and `invocation_registry`; `INSERT OR IGNORE` on `invocation_registry` gives 0 changes if nonce was consumed → NULL
3. `/proof` — checks execution row and validation row exist; proof recorded in `proof_registry`

**For agent tool invocation path:**

```
UNIQUE(atao_hash, decision_id, validated_object_hash, invocation_nonce)
→ INSERT OR IGNORE on agent_tool_invocation_registry
→ meta.changes !== 1 → agentToolInvocationNull("agent_tool_invocation_replay", ...) → NULL
```

---

## Implementation Plan

### Scope Correction

The actual implementation targets for #1835 are narrower than the issue describes:

| Item | Status | Action |
|---|---|---|
| Multi-hop ancestry traversal | **Already implemented** | Document and mark resolved |
| Production execution replay (D1) | **Already implemented** | Document and mark resolved |
| `ReplayGuard` durability | Gap exists but **test-only** | Wire `ReplayGuard` to D1 OR retire it |
| `replay_checkpoint_registry` table | **Does not exist** | Create in schema + migration if CLO path needs it, OR remove reference from issue |
| GAP-001 registry update | Pending | Update GAP-001 status in GOVERNANCE_GAP_REGISTRY.md |

### Recommended Implementation Path

**Phase A — Documentation (no code change):** Confirm existing multi-hop ancestry and D1 nonce as satisfying the intent of #1835 for the production path. Update GAP-001 to PARTIAL with remaining gap scoped to CLO validation layer.

**Phase B — CLO Replay Hardening (if CLO path requires it):**
1. Add `replay_checkpoint_registry` table to `schema.sql` and a migration
2. Wire `legitimacy-governance.js` to use D1 as backing store — replace in-memory `ReplayGuard.#used` with D1 lookup
3. OR: retire `ReplayGuard` and move CLO replay protection to `invocation_registry` (preferred — single replay surface)

**Phase C — Tests:**
- Replay invalidation (already partially covered by existing fate tests)
- Cross-restart replay attempt (verify D1 invocation_registry rejects on second process)
- Recursive ancestry traversal (add depth-N test with revoked ancestor mid-chain)
- Orphan rejection test (continuity_id with no registry entry → NULL)

---

## Dependency Map

```
#1835 (GAP-001 closure)
├── resolveContinuityLineage() — src/index.ts:3349 [ALREADY COMPLETE]
│   ├── continuity_registry (D1)
│   ├── session_registry (D1)
│   └── cascadeRevocation() / cascadeExpiration()
├── invocation_registry (D1 nonce) — src/index.ts:2067 [ALREADY COMPLETE]
│   └── PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce)
├── ReplayGuard (CLO nonce) — src/lib/legitimacy-governance.js:78 [PARTIAL — test-only]
│   └── replay_checkpoint_registry (schema.sql) [DOES NOT EXIST]
└── #1831 (GAP-005) — governance mutation ancestry validation depends on GAP-001 being closed
```

---

## Acceptance Tests

The following tests satisfy #1835 acceptance criteria against current implementation:

| Test | Mechanism | Expected result |
|---|---|---|
| `replay_invalidation` | Submit identical (decision_id, validated_object_hash, invocation_nonce) twice to /execute | Second call returns REPLAY_DETECTED → NULL |
| `recursive_ancestry_traversal` | Create 3-depth continuity chain (C1→C2→C3), REVOKE C1 (root), attempt /execute with authority bound to C3 | cascadeRevocation propagates; authority not found → NULL |
| `orphan_rejection` | Create authority with continuity_id not present in continuity_registry | resolveContinuityLineage returns null → authority not found → NULL |
| `revocation_propagation` | Create 2-depth chain (C1→C2), REVOKE C1, attempt /execute bound to C2 | C2's parent C1 is REVOKED; cascadeRevocation(C1) revokes C2 descendants; NULL |
| `cross_restart_replay` | Record invocation_nonce in D1 invocation_registry; destroy in-memory state; attempt same nonce via new request | D1 lookup rejects nonce; NULL |
| `depth_limit_enforcement` | Create continuity chain at depth SYSTEM_MAX_CONTINUITY_DEPTH + 1 | resolveContinuityLineage returns null at depth limit; cascadeRevocation triggers |

---

## GAP-001 Closure Recommendation

GAP-001 current status: **OPEN**

Based on this audit:
- Production ancestry traversal: **complete** (multi-hop with full enforcement)
- Production nonce durability: **complete** (D1 invocation_registry)
- CLO replay path: **partial** (ReplayGuard is test-only; not on production path)

**Recommended GAP-001 status: PARTIAL**

Remaining closure: retire or D1-back `ReplayGuard` in `legitimacy-governance.js`; confirm or create `replay_checkpoint_registry` or redirect to `invocation_registry`; add acceptance tests above; update GAP-001 in registry.

---

## Audit Statement

This document is an audit and architecture artifact only. It does not modify runtime behavior, schemas, execution semantics, or authority state.
