# Proof-Registry Backlog Audit

**Source:** `PORTFOLIO_LEVERAGE_AUDIT.md`, candidate #2 ("Re-admit 8 stale
proof-registry PRs")
**Date:** 2026-06-11
**Method:** each PR's head branch was fetched and test-merged (locally, in a
disposable worktree, no pushes) against current `main`
(`6f99835742ae10d7b46636b97cc5876f7290b745`).

---

## Findings

All 8 open `proof-registry/*` PRs append exactly one new entry to the
append-only `governance/merge-legitimacy/merge_proof_registry.jsonl`
(`+1 line` each). None of the 8 `proof_id`s already exist in `main`'s current
registry (87 entries) — **none are duplicates, superseded, or obsolete**.
Each documents a real merge (`PR #1886`–`#1923`) whose proof was generated but
not yet persisted.

| PR | Branch | proof_id | Base sha at creation | Mergeable against current `main`? | Classification |
|---|---|---|---|---|---|
| #1887 | `proof-registry/PROOF-1886-1ed83e3e` | PROOF-1886-1ed83e3e | `1ed83e3e` (2026-06-08) | Conflict (JSONL insert position) | **needs rebase** |
| #1889 | `proof-registry/PROOF-1888-bf58bc41` | PROOF-1888-bf58bc41 | `bf58bc41` (2026-06-08) | Conflict | **needs rebase** |
| #1892 | `proof-registry/PROOF-1891-16799d98` | PROOF-1891-16799d98 | `16799d98` (2026-06-08) | Conflict | **needs rebase** |
| #1896 | `proof-registry/PROOF-1893-39813033` | PROOF-1893-39813033 | `39813033` (2026-06-08) | Conflict | **needs rebase** |
| #1898 | `proof-registry/PROOF-1897-1ef5c034` | PROOF-1897-1ef5c034 | `1ef5c034` (2026-06-09) | Conflict | **needs rebase** |
| #1900 | `proof-registry/PROOF-1899-f4800d51` | PROOF-1899-f4800d51 | `f4800d51` (2026-06-09) | Conflict | **needs rebase** |
| #1904 | `proof-registry/PROOF-1903-96bf359c` | PROOF-1903-96bf359c | `96bf359c` (2026-06-09) | Conflict | **needs rebase** |
| #1924 | `proof-registry/PROOF-1923-38686191` | PROOF-1923-38686191 | `6f99835` (2026-06-09, == current `main` HEAD) | **Clean — mergeable as-is** | **mergeable** |

Plus one non-proof-registry PR:

| PR | Branch | What it adds | Mergeable against current `main`? | Classification |
|---|---|---|---|---|
| #1880 | `claude/audit-closure-gap-005-Y6HSw` | New doc: GAP-005 closure readiness chain audit (#1833→#1834→#1831), 187 lines | **Clean — mergeable as-is** (new file, no overlap) | **mergeable** |

The "conflicts" on the 7 non-#1924 PRs are entirely mechanical: each PR's
diff inserts its `proof_entry` line at a position based on an older version
of `merge_proof_registry.jsonl`; `main` has since grown past that point
(currently 87 lines, ordered by `pr_number`). A 3-way merge collides on the
surrounding context lines. **No content conflict** — each PR's payload is a
single, unique, well-formed JSON line that belongs in the registry.

---

## Recommended merge order

1. **#1924** and **#1880** — merge as-is (clean, no rebase needed).
2. **#1887, #1889, #1892, #1896, #1898, #1900, #1904** — rebase onto `main`
   (post-#1924 merge) in `pr_number` order (1886 → 1888 → 1891 → 1893 → 1897
   → 1899 → 1903). Each rebase resolves to: re-insert the branch's single
   `proof_entry` JSON line into `merge_proof_registry.jsonl` at the position
   matching ascending `pr_number` order (consistent with how `main` already
   orders the file). Doing them in ascending order, one at a time, means each
   subsequent rebase only needs to account for the previously-admitted
   entries — the conflict is the same one-line insertion each time.

This closes the proof-registry gap completely: `merge generates proof` and
`proof is persisted` become true for all 8 historical merges, with zero new
abstractions and zero net new lines beyond the 8 entries themselves.

---

## Action taken in this change

This change does **not** merge or rebase these PRs — merging PRs and
force-pushing rebased branches are shared-state operations on `main` and on
branches this session does not own, outside the scope of the
`claude/continuityos-dependency-proof-hzu5kd` development branch. The
analysis above is provided so the merges can be executed quickly (per-PR:
checkout, rebase, resolve the single-line JSONL conflict by insertion order,
force-push, merge) — see `DEPENDENCY_PROOF_IMPLEMENTATION_PLAN.md` for the
recommended execution sequence and risk notes.
