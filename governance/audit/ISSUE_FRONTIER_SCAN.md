# Issue Frontier Scan

**Audit Date:** 2026-06-04
**Scope:** All open issues as of this date (13 issues scanned)
**Purpose:** Classify open issues as Level 1, Level 2, Research, or Documentation; identify effectively-closed issues; surface dependency ordering

---

## Classification Schema

| Level | Definition |
|---|---|
| **Level 1** | Direct enforcement blockers — gaps that allow ungoverned mutation right now |
| **Level 2** | Hardening and detection — converts informal behavior into declared enforcement |
| **Research** | Background investigation — not an active implementation target |
| **Documentation** | Invariant documentation, canonical source declaration, organizational work |
| **Effectively closed** | Already implemented but issue not formally closed |

---

## Open Issue Classification

### Level 1 — Direct Enforcement Blockers

| Issue | Title | Priority | Status |
|---|---|---|---|
| **#1831** | Governance self-mutation containment (GAP-005) | P0 | PARTIAL — GMA merge gate active; proof persistence gap remains |
| **#1832** | Eliminate Cloudflare Git Integration production bypass | P0 | OPEN — live bypass vector; account-level disable pending (not code-addressable) |
| **#1833** | Agent tool call governance binding: UNKNOWN → GOVERNED; reviewer identity validation | P1 | OPEN — 0/6 criteria met |
| **#1835** | GAP-001 closure: recursive continuity + durable nonce | P1 | OPEN — recursive ancestry already implemented; nonce gap scoped to test-only path; see architecture audit |
| **#1848** | Implement bounded Agent Tool Gateway for one mutation-capable action | P1 | OPEN — first operational step; concrete execution slice |

**Note on #1832:** This is a Cloudflare account-level administrative action. It is not code-addressable — it requires manual Cloudflare dashboard action to disable Git Integration. Cannot be closed by a code PR.

### Level 2 — Hardening and Detection

| Issue | Title | Priority | Dependency |
|---|---|---|---|
| **#1834** | GAP-004: continuous execution surface drift detection | P1 | #1837 (canonical source declaration required first) |
| **#1836** | GAP-003: cross-registry lineage reconciliation integrity | P2 | None — can start independently |
| **#1838** | Bind raw D1 migration governance classification UNKNOWN → classified | P2 | #1837 |
| **#1839** | Bind manual workflow_dispatch governance classification UNKNOWN → classified | P2 | #1837 |
| **#1840** | Wire Topology Reasoning Protocol v1 as enforced gate in mutation admission | P2 | #1752 (closed) |

### Documentation / Organization

| Issue | Title | Priority | Notes |
|---|---|---|---|
| **#1837** | Declare canonical sources for EXECUTION_SURFACES, BYPASS_PATHS, schemas | P1 | **Prerequisite for #1834, #1838, #1839**; directly tracks the drift problem identified in Execution Surface Compression audit |
| **#1846** | Constitutional Integrity Guard invariants | P2 | Documentation + possibly a minimal regression test |

### Research / Background

| Issue | Title | Status |
|---|---|---|
| **#1765** | Background Frontier — Distributed Legitimacy Convergence | Background; no implementation target |

---

## Effectively Closed (Open but Likely Implemented)

None found. All open issues have genuine remaining work.

---

## Dependency Ordering

```
Level 1 critical path:
  #1837 → #1833, #1834, #1838, #1839  (canonical source first)
  #1835 → #1831  (#1835 confirms ancestry is working; proof gap in #1831 can proceed)
  #1833 → #1848  (governance classification before operational step)

P0 issues:
  #1831 (proof persistence gap — code-addressable)
  #1832 (Git Integration disable — administrative, not code-addressable)

Standalone (no prerequisites):
  #1836 (cross-registry reconciliation)
  #1840 (topology reasoning protocol binding)
  #1846 (constitutional integrity documentation)
  #1848 (bounded gateway — can start independently of #1833 classification)
```

---

## Priority Recommendation

**Highest forward progress per unit of effort:**

1. **#1837** — Canonical source declaration for BYPASS_PATHS and EXECUTION_SURFACES. Low effort (organizational), unblocks #1834, #1838, #1839, #1833. Directly aligned with Execution Surface Compression audit findings.

2. **#1833** — Agent tool call governance binding + reviewer validation. High leverage (9/10). Two concrete code changes: `BYPASS_PATHS.json` reclassification + `conductAuthorityReview()` registry lookup.

3. **#1831 remaining** — Wire `/execute → /proof` for governance mutations. Targeted code change; completes GAP-005 closure.

4. **#1835 remaining** — After architecture audit: confirm/retire `ReplayGuard`, add acceptance tests. Smaller than the issue suggests.

5. **#1848** — First operational agent tool gateway slice. Concrete bounded implementation.

---

## Frontier Compression Summary

```
Total open issues:      13
Level 1 blockers:        5  (#1831, #1832, #1833, #1835, #1848)
Level 2 hardening:       5  (#1834, #1836, #1838, #1839, #1840)
Documentation:           2  (#1837, #1846)
Research:                1  (#1765)
Effectively closed:      0
```

**Minimum Level 1 closure set** (issues that must close for Level 1 governance to be complete):

```
#1831 — proof persistence gap
#1833 — BYPASS_PATHS classification + reviewer validation
#1835 — confirm/document that recursive ancestry is complete; close CLO nonce gap
```

**Not code-addressable:**
```
#1832 — Cloudflare Git Integration account-level disable (administrative action)
```

---

## Audit Statement

This document is a frontier scan and classification artifact only. It does not modify runtime behavior, schemas, execution semantics, or authority state.
