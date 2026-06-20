# ContinuityOS Merge Guard — v2 Design

Status: **Draft / proposal**. This document designs the features the
[`README.md`](./README.md) "v2 (not yet built)" section defers. It does not
change any shipped behavior; nothing here is wired in yet.

The goal of v2 is to extend the proof past *object identity* (v1) toward
*review and merge legitimacy*, **without** giving up the three properties that
make v1 installable and trustworthy:

1. **Portable / offline core.** `check.mjs`'s `evaluate()` is pure — no network,
   no GitHub API, no npm deps. The directory copies into any repo unmodified
   (see `canonical.mjs`). v2 must keep the decision core pure.
2. **Backward-compatible identity hash.** The v1 `canonical_payload`
   (`{repo, pr_number, head_sha, base_sha, actor, author_kind,
   require_agent_authored}`) and its `canonical_hash` must not change for an
   unchanged PR object. A `@v0.1.0` consumer that only reads `result` must be
   unaffected by adopting v2. This is the same discipline already used for
   attribution: metadata is recorded *alongside* the proof, never folded into
   the identity hash.
3. **Fail-closed.** Every new binding adds NULL reason codes; missing *required*
   evidence blocks merge, ambiguous evidence blocks merge, and only complete,
   matching evidence is VALID.

## Architectural principle: pure core, impure shell

v2 features (review binding, diff binding, merge-commit binding) inherently need
data v1 never touched — reviews, trees, the post-merge commit. That data can
only come from the GitHub API. The principle that keeps the core portable is the
one **attribution already follows today**: the *workflow shell* (`action.yml`
composite steps) fetches data and passes it as **plain string inputs**; the
*core* (`evaluate()`) stays a deterministic function of its inputs.

```
GitHub API (impure, in action.yml steps / caller workflow)
   │  reviews, changed-files+blob-shas, merge_commit_sha
   ▼
plain string inputs  ──►  evaluate()  (pure, deterministic, offline)
                              │
                              ▼
                    result + proof artifact
```

So no v2 feature adds a network call to `check.mjs`. Each adds (a) optional
inputs carrying already-fetched facts, (b) pure validation in `evaluate()`, and
(c) optional fetch plumbing in the bundled workflow. A consumer that does not
pass the new inputs gets exactly today's v1 behavior.

## Two evaluation planes

There are two distinct moments, and v2 respects both — the repo already models
them as two artifacts:

| Plane | When | Today | v2 adds |
|---|---|---|---|
| **Pre-merge** (`MERGE_GUARD_PROOF`) | `pull_request` opened/synchronize | identity + policy + attribution | **review binding**, **diff binding** |
| **Post-merge** (`MERGE_PROOF`) | `pull_request` closed+merged | exact-object admission, registry PR (see `merge-proof.yml`) | **portable** merge-commit binding + **registry persistence** packaged into the action |

Crucially, the heavy patterns v2 needs are **already proven** in this repo's
`merge-proof.yml`: an APPROVED review whose `commit_id == head_sha`
(review binding), `reviewed_object_hash == merged_object_hash` exact-object
admission (merge-commit binding), and append-only persistence via a
`proof-registry/*` PR (registry persistence). v2 is largely **extracting those
proven mechanisms into the portable action** so any consumer gets them, not
inventing new ones.

---

## Feature 1 — Review binding

**Claim added:** "an approving review exists for *this exact* head commit."

**New inputs** (strings; fetched by the shell, e.g. `gh api
repos/{repo}/pulls/{n}/reviews`):
- `require-approving-review`: `'true' | 'false'` (default `'false'` — off = v1).
- `reviews`: JSON array of `{state, user_login, commit_id, submitted_at}`.
  Passed as a string; `evaluate()` parses it, no network.

**Pure logic in `evaluate()`** (mirrors `merge-proof.yml` lines 83–168):
- Find the latest review with `state == APPROVED`, `user_login != actor`
  (no self-approval), and `commit_id == head_sha`.
- Present → `review_binding: BOUND`.
- An APPROVED review exists but only on an older `commit_id` → `STALE` →
  `null_reasons += REVIEW_STALE` (the "reviewed ≠ head" gap, fail-closed).
- None and `require-approving-review == 'true'` → `null_reasons += REVIEW_REQUIRED`.
- `require-approving-review == 'false'` → recorded as metadata, never blocks.

**Hash impact:** `head_sha` is *already* in the canonical payload, so binding to
it adds **no** new canonical field. `reviewer`, `reviewed_head_sha`, and
`review_binding` are recorded as **non-canonical proof fields** (like
attribution). `canonical_hash` is unchanged. ✅ backward compatible.

**New proof fields:** `review_binding`, `reviewer`, `reviewed_head_sha`,
`review_submitted_at`.

---

## Feature 2 — Diff binding

**Claim added:** bind the proof to *what changed*, not only the commit identity,
so the proof artifact names the tree it certifies.

git already binds content to `head_sha` (a commit SHA *is* a tree hash), so the
value here is **explicit, inspectable** content binding in the proof: a stable
hash over the changed file set and their blob SHAs.

**New inputs:**
- `changed-files`: newline-separated `"<path>\t<blob_sha>"` pairs, produced by
  the shell with `git diff --name-only -z` + `git ls-tree`/`rev-parse`
  (no content upload; blob SHA only).

**Pure logic:** sort by path, canonicalize the `[{path, blob_sha}]` array with
the existing `canonicalize()` from `canonical.mjs`, `sha256Hex` it →
`diff_object_hash`. Empty / absent input → `diff_object_hash: null`,
non-blocking (pure metadata).

**Hash impact:** `diff_object_hash` is a **separate** proof field. It is *not*
added to the v1 `canonical_payload` (that would break the hash). Consumers who
want it load-bearing make `diff_object_hash` presence a required output
downstream, exactly like attribution. ✅ backward compatible.

> Optional v2.1: add an opt-in `bind-diff-into-identity: 'true'` that emits a
> **second, clearly-named** hash `identity_plus_diff_hash` for consumers who
> want one combined value — still leaving `canonical_hash` untouched.

---

## Feature 3 — Automatic agent classification

**Claim added:** derive `author_kind` from trusted platform evidence instead of
the caller asserting it.

Today `author-kind` is a caller assertion (README §"What this proves" is explicit
that v1 does not detect authorship). The attribution layer (`attribution.mjs`)
*already* classifies `AGENT_AUTHORED / AGENT_ASSISTED / HUMAN_AUTHORED` from
authoritative signals (labels, PR-body block, commit trailers) and fails closed
on conflict. v2 promotes that, **opt-in**:

- New input `derive-author-kind`: `'true' | 'false'` (default `'false'`).
- When `'true'`, if the caller did not pass an explicit `author-kind`,
  `evaluate()` seeds `author_kind` from `attribution_classification`
  (`AGENT_AUTHORED|AGENT_ASSISTED → agent`, `HUMAN_AUTHORED → human`,
  `UNKNOWN → unknown`).
- An explicit caller `author-kind` that **conflicts** with an authoritative
  attribution classification → `null_reasons += AUTHOR_KIND_CONFLICT`
  (fail-closed; never silently override the human/caller).
- `actor_kind == 'bot'` from the GitHub `user.type == 'Bot'` signal is treated
  as supporting evidence, not authoritative on its own (bots ≠ agents).

**Hash impact:** `author_kind` is *already* canonical, so deriving it can change
`canonical_hash` **only when the derived value differs from what a caller would
have passed** — i.e. only when the PR object's declared authorship actually
changes. That is correct: the hash should move iff the identity-relevant input
moves. Default-off keeps v1 consumers byte-identical. ✅

---

## Feature 4 — Policy binding

**Claim added:** org-level policy packs instead of per-workflow inputs.

**Design:** an optional `policy-file` input pointing at a checked-in JSON pack:

```json
{
  "policy_id": "org-default-v1",
  "require_agent_authored": false,
  "require_approving_review": true,
  "require_diff_binding": false,
  "allowed_author_kinds": ["agent", "human"],
  "agent_lane_prefixes": ["claude/", "codex/", "cursor/", "devin/", "copilot/"]
}
```

`evaluate()` reads the pack (the shell passes its contents as a string — still
no network), and treats explicit per-workflow inputs as **overrides** of pack
defaults. The pack's own sha256 (`policy_hash`) is recorded in the proof so the
proof names the policy it was evaluated under. Conforms to the existing
governance pattern (`governance/merge-legitimacy/*.json` policy files referenced
by hash).

**Hash impact:** `policy_hash` is a non-canonical proof field; the *effects* of
the policy already flow through existing canonical fields
(`require_agent_authored`) or non-canonical bindings. ✅

---

## Feature 5 — Merge-commit binding (post-merge plane)

**Claim added:** extend the proof past merge to the resulting `merge_commit_sha`
— prove the object that merged is the object that was reviewed.

This is exactly `merge-proof.yml`'s "Verify exact-object admission" step
(`reviewed_object_hash == merged_object_hash`, lines 246–321). v2 packages a
**portable** version as a second action entrypoint:

- New file `merge-commit-check.mjs` + `action.yml` mode `phase: 'post-merge'`,
  triggered by the consumer on `pull_request: [closed]` with
  `if: github.event.pull_request.merged == true`.
- Inputs: `merge-commit-sha`, `reviewed-head-sha`, and the reconstructed
  `reviewed_object_hash` / `merged_object_hash` (computed in the shell from
  `git` over the squash/merge/rebase tree, matching the parent-count method
  detection in `merge-proof.yml` lines 277–283).
- Pure logic: `merged == reviewed` → `MERGE_BINDING: BOUND`; mismatch →
  `MERGE_BINDING_NULL`. Emits `MERGE_GUARD_MERGE_PROOF.json`.

Keeps v1's pre-merge action untouched; this is additive and separately
installable.

---

## Feature 6 — Registry persistence

**Claim added:** an append-only proof registry so proofs are durable and
auditable, not just per-run artifacts.

Reuse the **proven** mechanism in `merge-proof.yml` lines 661–784 verbatim in
spirit:
- Proof entries are appended to a `*.jsonl` ledger (see
  `governance/merge-legitimacy/merge_proof_registry.jsonl`) as
  `{_record_type: "proof_entry", proof_id, proof_hash, pr_number,
  merge_commit_sha, merged_at, appended_at}`.
- **Persistence is routed through a governed PR**, never a direct push to the
  protected branch ("proof generated ≠ proof persisted"; direct-to-main is NULL
  and non-retryable). Branch `proof-registry/<proof_id>`, idempotent on
  `proof_id` (two guards: open-PR search + `grep -F proof_id` in the ledger).

v2 packages this as an optional `persist-registry: 'true'` mode of the
post-merge action plus a documented `registry-path` input, so a consumer gets
durable proof lineage without copying the bespoke workflow. Requires a
PR-creating token input (`registry-pr-token`), matching today's
`MERGE_PROOF_PR_TOKEN`.

---

## Conformance & rollout

- **Tests:** every feature lands with fixtures in `fixtures/` and assertions in
  `test.mjs` (the harness already supports `expected_null_reasons`,
  `expected_attribution_*`, and `deterministic_hash`). New fixtures:
  `review-bound-valid`, `review-stale-null`, `review-required-missing-null`,
  `diff-binding-hash`, `author-kind-conflict-null`, `policy-pack-override`,
  `merge-binding-valid`, `merge-binding-mismatch-null`.
- **Determinism guard:** add a fixture asserting v1 `canonical_hash` for
  `valid-pr.json` is **unchanged** after each feature merges — the regression
  fence for backward compatibility.
- **Versioning** (extends README "Version reference"):
  - `@v0.4.0` — review binding + diff binding (pre-merge, default-off).
  - `@v0.5.0` — derive-author-kind + policy packs.
  - `@v0.6.0` — post-merge action: merge-commit binding + registry persistence.
  - Each tag is additive; default inputs reproduce the prior tag's behavior, so
    a load-bearing consumer can pin and upgrade deliberately.

## Non-goals (unchanged from v1 §8)

Distributed proof finality, global legitimacy convergence, multi-org authority
federation, full autonomous-org governance, complete agent safety, perfect
authorship detection. v2 widens the *wedge* (identity → review → merge), not the
claim surface.
