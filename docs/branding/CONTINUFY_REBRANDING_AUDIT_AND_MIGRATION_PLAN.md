# Continufy Ecosystem — Branding Audit & Migration Plan

> **Status:** Analysis & planning artifact only. This document **executes no
> changes**, renames no repositories, and modifies no existing files. It is the
> deliverable for the rebranding audit task.
>
> **Date:** 2026-06-20
> **Scope:** `joselunasrt8-creator/ContinuityOS-` and
> `joselunasrt8-creator/continuityos-sandbox`
> **Author:** Rebranding audit agent
>
> **Companion priors (read these first — this plan extends, does not replace, them):**
> - [`IDENTITY_RESIDUE_AUDIT.md`](../../IDENTITY_RESIDUE_AUDIT.md) — `mindshift-demo` residue classification
> - [`docs/continuityos-rebrand.md`](../continuityos-rebrand.md) — MindShift→ContinuityOS runtime rebrand (Stages 1–3)
> - [`docs/continuityos-namespace-plan.md`](../continuityos-namespace-plan.md) — `@continuityos/*` package namespace plan
> - [`docs/repo-classification.md`](../repo-classification.md) — LOAD_BEARING / SUPPORTING / EXPERIMENTAL / ARCHIVED tiers

---

## Executive Summary

The ecosystem already executed one identity migration (**MindShift → ContinuityOS**
at the runtime/product layer) and documented it carefully. This task adds a
**third, net-new layer — `Continufy`, the company / parent brand** — to produce
a clean three-tier hierarchy:

```
MindShift     →  Research & Cognition Infrastructure   (canon / research umbrella)
Continufy     →  Company / Parent Brand                (NET-NEW — 0 occurrences today)
ContinuityOS  →  Trusted Action Platform / Product     (runtime substrate)
```

**The single most important finding:** `Continufy` appears **nowhere** in either
repository (0 matches across all code, docs, manifests, workflows, and metadata).
This is therefore **not a find-and-replace migration** — it is an **additive
brand-introduction** exercise. There is almost no "old company name" to retire,
because the company layer never existed; today the *product* name (ContinuityOS)
and the *research* name (MindShift) are doing double duty as the de-facto
top-level identity.

Consequences that make this migration **low-risk if scoped correctly**:

1. **No destructive product rename is required.** ContinuityOS stays ContinuityOS
   (product). MindShift stays MindShift (research). We are *inserting a parent*,
   not relabeling a child.
2. **The high-risk surfaces are deploy-coupled, not brand-coupled.** The genuinely
   dangerous strings (`mindshift-demo` Cloudflare Worker/D1 names, AEO scope
   identity `repo: "mindshift-demo"`, action tag `@v0.1.0`) are *infrastructure*
   identifiers, already classified KEEP/out-of-scope by `IDENTITY_RESIDUE_AUDIT.md`.
   The Continufy rollout must **not** touch them.
3. **The company brand needs a home.** There is no `continufy` repo, no website,
   no domain. The first concrete artifacts are an *attribution line* ("ContinuityOS
   is a Continufy product, built on MindShift research") and, later, dedicated
   company repos.

**Recommended posture:** introduce `Continufy` as an **attribution / governance
layer** in documentation prose first (Phase 1), defer all repository creation and
any rename to explicit governance approval, and **never** bundle company-brand
prose changes with the deploy-coupled infrastructure strings.

---

## 1. Current Brand Inventory

Method: `ripgrep` across both working trees plus GitHub repo metadata. Counts are
file-level occurrences; exact line citations live in the companion priors where
already enumerated.

| Current Reference | Representative Location(s) | Purpose | Recommended Replacement |
|---|---|---|---|
| **MindShift** (canon/research) | `docs/glossary.md` ("MindShift Glossary"), `SECURITY.md` ("MindShift remains the canon and research umbrella"), `AGENTS.md` ("MindShift is a Cloudflare Worker…"), `mindshift/`, `governance/mindshift-validation-bundle/`, `runtime/legitimacy/schemas/*` (`$id: https://mindshift.local/...`, titles `"MindShift … Object"`) | Research/canon umbrella + schema namespace | **Leave Unchanged** (research layer). Optionally add Continufy attribution prose, not a rename. |
| **MindShift** (repo description) | GitHub: `ContinuityOS-` description = `"MindShift execution boundary demo"` | Repo-level positioning string | **ContinuityOS** product description + Continufy attribution (Phase 2). |
| **ContinuityOS** (product/runtime) | `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `package.json` (`"name":"continuityos"`, `"description"`), `docs/**`, `actions/continuity-merge-guard/**` | Product / runtime platform identity | **Leave Unchanged** as product; add "a Continufy product" attribution where a parent-brand line is appropriate. |
| **ContinuityOS-** (repo slug, trailing hyphen) | Repo name `joselunasrt8-creator/ContinuityOS-`; clone URLs in `README.md:61`, `IDENTITY_RESIDUE_AUDIT.md:37`, sandbox `index.html:195`, sandbox `README.md:4` | Canonical source repo URL (load-bearing link target) | **Leave Unchanged initially** (renaming breaks every inbound link + the action ref `joselunasrt8-creator/ContinuityOS-/actions/...@v0.1.0`). Candidate for a *future* GitHub auto-redirecting rename to drop the trailing `-` — High Risk, separate PR. |
| **continuityos-sandbox** | Repo name; `README.md:1`, `index.html:196`, cross-links in `LOAD_BEARING_READINESS.md`, `VALIDATION.md` | External adoption-proof repo | **Leave Unchanged** (product-layer adoption surface; name is consistent with product). |
| **continuityos.cloud** | **Not present** (0 matches) | (intended marketing domain) | **N/A today** — reserve `continufy.com` / `continuityos.*` as a Phase 3 decision; do not introduce a dead domain. |
| **Continufy** | **Not present** (0 matches) | Company / parent brand | **Introduce** (additive) as attribution prose, then company repos. |
| "legitimacy infrastructure" | `README.md:294` ("ContinuityOS is distributed legitimacy infrastructure…"), `SECURITY.md:17`, `docs/**` | Product positioning tagline | **Leave Unchanged** (canonical product positioning; not a brand token). |
| Governance terminology (AEO, ATAO, PREO, SCO, Ω/Omega Validator, Proof-of-Transfer, authority, continuity, reconciliation, registry, replay) | `docs/glossary.md`, `schemas/**`, `governance/**`, all `tests/**` | Canonical protocol vocabulary | **Leave Unchanged** — explicitly protected by `continuityos-rebrand.md §4`. Non-negotiable. |
| Company references (ownership) | `CODEOWNERS` ("MindShift repository ownership boundary"), `* @joselunasrt8-creator` | Ownership/authority boundary | **Leave Unchanged** (governance artifact). Optionally reword comment to "Continufy / ContinuityOS ownership boundary" in Phase 2 — cosmetic only, never the `@owner` line. |
| Deployed infra identifiers (`mindshift-demo`, `mindshift-demo-prod`, `mindshift-demo-preview`, `mindshift-demo-local`) | `wrangler.toml`, `package.json` scripts, `governance/runtime/*.json`, `tests/fate/*` | Real Cloudflare Worker/D1 names | **Leave Unchanged** — KEEP per `IDENTITY_RESIDUE_AUDIT.md` (deploy-capability change, test-asserted). **Out of scope for branding.** |

**Search surfaces covered:** READMEs ✓ · documentation (`docs/**`) ✓ · GitHub Actions
(`.github/workflows/**`, `actions/**`) ✓ · workflow display names ✓ · package
manifests (`package.json`, `Cargo.toml`, `wrangler.toml`) ✓ · website asset
(`continuityos-sandbox/index.html`) ✓ · governance docs (`governance/**`,
`CODEOWNERS`, `SECURITY.md`) ✓ · marketing/positioning (`docs/product/**`,
`docs/course/**`) ✓ · GitHub metadata (repo descriptions, issue counts) ✓.
**Issues/Discussions:** `ContinuityOS-` has 8 open issues, `continuityos-sandbox`
has 4; **Discussions are disabled** on both repos and **GitHub Pages is not
enabled** — so there is no live discussion/website surface to migrate.

---

## 2. Brand Classification

Each material reference class, mapped to its layer and target disposition.

| Reference Class | Layer | Becomes |
|---|---|---|
| `MindShift` canon, glossary, schema `$id`, validation bundle | **Research Layer** | **MindShift** (unchanged) |
| `MindShift execution boundary demo` (repo description) | Historical / Product Reference | **ContinuityOS** (+ Continufy attribution) |
| `ContinuityOS` runtime, product positioning, README | **Product Layer** | **ContinuityOS** (unchanged) |
| `continuity-merge-guard` action + workflows | **Product Layer** (Infrastructure Reference) | **ContinuityOS** (unchanged — see Risk §5) |
| `continuityos-sandbox` adoption repo | **Product Layer** | **ContinuityOS** (unchanged) |
| AEO/ATAO/PREO/SCO/Ω, authority, replay, proof | **Governance Reference** | **Leave Unchanged** (protected canon) |
| `mindshift-demo*` Worker/D1/AEO-scope strings | **Infrastructure Reference** | **Leave Unchanged** (deploy-coupled) |
| Dated audits, closure matrices, recorded transcripts | **Historical Reference** | **Leave Unchanged** (editing falsifies record) |
| `CODEOWNERS`, ownership boundary, `LICENSE`, `SECURITY.md` reporting | **Governance Reference** | **Leave Unchanged** (cosmetic comment reword only, Phase 2) |
| Company/parent identity (today: implicit) | **Company Layer** | **Continufy** (NET-NEW, additive) |

**Disposition tally:** the overwhelming majority of occurrences are **Leave
Unchanged** (research canon, protected vocabulary, deploy infra, historical
records). The *active* work is a small set of **additive** Continufy attribution
lines plus repo-description and metadata updates.

---

## 3. Repository Mapping

### Current state (2 repos)

| Current Name | Layer | Description | Discussions/Pages |
|---|---|---|---|
| `joselunasrt8-creator/ContinuityOS-` | Product (source) | "MindShift execution boundary demo" | off / off |
| `joselunasrt8-creator/continuityos-sandbox` | Product (adoption proof) | (none) | off / off |

### Proposed target structure

Per the task's target structure, mapped against migration risk. **None of these
should be created or renamed in this pass** — this is the recommended end-state.

| Current Name | Recommended Name | Migration Risk | External Link Impact | Dependency Impact |
|---|---|---|---|---|
| `ContinuityOS-` | `continuityos` (drop trailing `-`) | **High** | High — every clone URL, the action ref `…/ContinuityOS-/actions/continuity-merge-guard@v0.1.0`, sandbox links. GitHub auto-redirects old paths, but the action `uses:` ref and `@v0.1.0` tag must be re-validated. | High — sandbox + external consumers pin the action by this exact path. |
| `continuityos-sandbox` | `continuityos-sandbox` (keep) | Low | Low | Low |
| *(none)* | **`continufy`** (company root) | Low (net-new) | None (no inbound links yet) | None |
| *(none)* | **`continufy-brand`** (brand assets) | Low (net-new) | None | None |
| *(none)* | **`continufy-website`** (company site) | Low (net-new) | None | None |
| `mindshift/` dir → *(future)* | **`mindshift`** / **`mindshift-research`** repos | Medium | Medium — `https://mindshift.local/...` schema `$id`s are canonical and must not change even if a repo is created | Medium — schema `$id` URIs are referenced by validators; a repo named `mindshift` must not be conflated with the `mindshift.local` namespace |

**Key mapping judgments:**

- **Do not split MindShift out of `ContinuityOS-` yet.** The `mindshift/` directory,
  `governance/mindshift-validation-bundle/`, and `runtime/legitimacy/schemas`
  (`$id: https://mindshift.local/...`) are load-bearing *inside* the product repo.
  Creating a `mindshift-research` repo is a research-layer reorg that should follow
  the company-brand introduction, not lead it.
- **`continufy` repos are greenfield** — zero risk, but also zero urgency. Create
  them only when there is actual company-level content (brand guidelines, website)
  to host. An empty `continufy` repo adds navigation cost for no adoption benefit
  (violates the repo's own "classify aggressively, move conservatively" principle).
- **The trailing-hyphen rename (`ContinuityOS-` → `continuityos`) is the only
  genuinely risky rename** and is *not required* by the Continufy hierarchy. Treat
  it as an independent, optional cleanup with its own go/no-go.

---

## 4. Documentation Migration Plan

### Phase 1 — Low-risk documentation updates (attribution prose)

Introduce the Continufy parent-brand line where a top-level identity statement
already exists. Additive only; no token removal.

Exact files:
- `README.md` — add one attribution line under `# Positioning` (e.g. *"ContinuityOS
  is a Continufy product. MindShift is the research canon it derives from."*).
- `SECURITY.md` — extend the existing "MindShift remains the canon…" couplet with
  the company line.
- `docs/continuityos-rebrand.md` — add a §"Company layer (Continufy)" note so the
  three-tier hierarchy is documented in the canonical rebrand doc.
- `docs/glossary.md` — add `Continufy`, `MindShift`, `ContinuityOS` brand-hierarchy
  entries (definitional, non-operative).
- This file (`docs/branding/…`) — the audit/plan of record.

### Phase 2 — Repository descriptions & metadata

- `ContinuityOS-` GitHub **description**: change `"MindShift execution boundary
  demo"` → e.g. `"ContinuityOS — trusted action platform. A Continufy product,
  built on MindShift research."` (metadata only; no file change, no rename).
- `continuityos-sandbox` GitHub **description**: add one (currently empty) — e.g.
  `"External adoption proof for ContinuityOS (a Continufy product)."`
- `CODEOWNERS` header comment + `.github/` templates: optional cosmetic reword of
  the "MindShift repository ownership boundary" comment to name Continufy as the
  owning company. **Never** touch the `* @joselunasrt8-creator` line.
- `AGENTS.md` project-overview sentence: optional clarification that MindShift is
  the research canon and ContinuityOS the product, under Continufy.

### Phase 3 — Website / domain alignment

- `continuityos-sandbox/index.html` — the only website asset. Add a small footer
  attribution ("A Continufy product"); keep the product `<h1>ContinuityOS Sandbox</h1>`.
- **Domain:** no domain exists today. Decide whether the company domain is
  `continufy.com` (recommended) with `continuityos` as a product path/subdomain.
  Do **not** introduce `continuityos.cloud` or any domain string into code until a
  domain is actually registered and pointed — a dead domain is worse than none.
- GitHub Pages is currently off; enabling a company site is a `continufy-website`
  concern (Phase 3+), not a change to existing repos.

### Phase 4 — External-facing positioning

- Tag/release notes, course landing pages (`docs/course/landing-page.md`,
  `docs/course/README.md`), and pilot/product docs (`docs/product/**`): adopt the
  "Continufy → ContinuityOS → (built on) MindShift" framing in *new* prose. Leave
  dated/historical course modules unchanged.
- Action marketplace / `actions/continuity-merge-guard/README.md`: add company
  attribution; **do not** rename the action or its `uses:` path.

---

## 5. Risk Analysis

| Surface | Item | Classification | Why |
|---|---|---|---|
| **Broken links** | Clone URLs / repo links to `ContinuityOS-` (README, sandbox, IDENTITY_RESIDUE_AUDIT) | **Safe** if no rename; **High Risk** if `ContinuityOS-` renamed | GitHub redirects help, but the action `uses:` ref is exact-path. |
| **GitHub Actions** | `actions/continuity-merge-guard` + 3 sandbox workflows + 15 source workflows | **Requires Review** | Display names contain `continuity-*`; renaming the action breaks `@v0.1.0` consumers. Branding prose in workflow comments is Safe; identifiers are not. |
| **Package references** | `package.json` `"name":"continuityos"`, `bin.mindshift`, `@continuityos/*` plan | **Requires Review** | Product name is fine. The `bin: "mindshift"` CLI name and `@continuityos/*` namespace are governed separately (`continuityos-namespace-plan.md`). Do not add `@continufy/*`. |
| **Badge references** | `badges/README.md`, conformance badges | **Safe** | Text badges only; no brand token, no external shields URL. |
| **Cross-repo dependencies** | sandbox → `…/ContinuityOS-/actions/...@v0.1.0` | **High Risk** (only if renamed) | The entire adoption proof hinges on this pinned path. |
| **Workflow references** | `continuity-merge-guard.yml`, `continuity-agent-attribution-gate.yml` | **Requires Review** | Required status checks keyed by job/check name; renaming a check silently un-gates `main`. |
| **Domain references** | none today | **Safe** | Nothing to break; risk is *introducing* a dead domain. |
| **Deploy infra** | `mindshift-demo*` Worker/D1, AEO scope `repo:"mindshift-demo"` | **High Risk** — leave alone | Test-asserted (`tests/fate/*`), deploy-coupled; already KEEP per `IDENTITY_RESIDUE_AUDIT.md`. **Explicitly excluded from branding.** |
| **Historical record** | dated audits, closure matrices, recorded `npm run demo` transcripts | **High Risk to edit** | Editing falsifies append-only governance lineage. Leave verbatim. |
| **Schema namespace** | `https://mindshift.local/...` `$id`, `"MindShift … Object"` titles | **High Risk to edit** | Canonical validator identifiers; changing them is a semantic change, not branding. |

**Net risk posture:** Phases 1–2 (attribution prose + metadata) are **Safe /
Requires light Review**. All **High Risk** items are either explicitly out of scope
(deploy infra, historical record, schema namespace) or optional future work (the
`ContinuityOS-` rename). The Continufy introduction can be done **with zero
High-Risk changes**.

---

## 6. Final Recommendation

### Recommended naming hierarchy

```
Continufy        →  Company / parent brand          (the org / owning entity)
 ├─ MindShift    →  Research & cognition canon       (research layer — unchanged)
 └─ ContinuityOS →  Trusted action platform/product  (product layer — unchanged)
       ├─ ContinuityOS- (source repo)
       └─ continuityos-sandbox (adoption proof)
```

Canonical attribution string (reusable):
> **ContinuityOS is a Continufy product, built on MindShift research.**

### Recommended migration order

1. **Phase 1 — attribution prose** (this PR): add the Continufy line to `README.md`,
   `SECURITY.md`, `docs/continuityos-rebrand.md`, `docs/glossary.md`. Land this audit.
2. **Phase 2 — metadata**: update both repo descriptions; optional CODEOWNERS/AGENTS
   comment rewording.
3. **Phase 3 — website/domain**: footer attribution in `index.html`; decide domain
   (`continufy.com`) before writing any domain string.
4. **Phase 4 — external positioning**: new course/product/landing prose; action
   README attribution.
5. **Deferred (separate go/no-go, governance approval required):** create `continufy`,
   `continufy-brand`, `continufy-website` repos *when there is content*; optionally
   rename `ContinuityOS-` → `continuityos`; optionally extract `mindshift-research`.

### Files to update first

- `docs/branding/CONTINUFY_REBRANDING_AUDIT_AND_MIGRATION_PLAN.md` (this file)
- `README.md` (single attribution line under `# Positioning`)
- `SECURITY.md` (extend the MindShift/ContinuityOS couplet)
- `docs/continuityos-rebrand.md` (add Company-layer section)
- `docs/glossary.md` (brand-hierarchy entries)

### Files to avoid changing initially

- `wrangler.toml`, `package.json` deploy scripts, `governance/runtime/*.json`,
  `tests/fate/*` — deploy-coupled `mindshift-demo*` identifiers.
- `runtime/legitimacy/schemas/*`, any `https://mindshift.local/...` `$id`.
- All dated audits / closure matrices / recorded transcripts (historical record).
- `CODEOWNERS` `@owner` line; the action path and `@v0.1.0` tag; required-check
  names in workflows.
- Protected canon vocabulary (AEO/ATAO/PREO/SCO/Ω, authority, replay, proof, …).

### Estimated migration effort

| Phase | Effort | Risk |
|---|---|---|
| Phase 1 (prose + this audit) | ~1–2 hrs, single PR, ~5 files | Safe |
| Phase 2 (metadata) | ~30 min, no code | Safe |
| Phase 3 (website/domain) | ~1 hr file + external domain decision | Safe (file) / Requires decision (domain) |
| Phase 4 (positioning) | ~2–3 hrs, new prose | Safe |
| Deferred (repos/renames) | Multi-day, coordinated | High — separate governance approval |

**Total for the safe, additive Continufy introduction (Phases 1–4): ≈ 1 day**,
zero High-Risk changes, fully reversible.

---

## Constraints honored

- **Preserve historical context** — all dated/append-only artifacts: Leave Unchanged.
- **Preserve governance artifacts** — CODEOWNERS authority line, LICENSE, SECURITY
  reporting, protected vocabulary: Leave Unchanged.
- **Preserve proof lineage references** — recorded transcripts, proof receipts,
  `mindshift.local` schema `$id`s, closure matrices: Leave Unchanged.
- **Avoid unnecessary churn** — Continufy is introduced additively; ContinuityOS and
  MindShift are *not* renamed; no repo is created/renamed in this pass.
- **Prefer minimal-change migration paths** — attribution prose + metadata first;
  every High-Risk item deferred behind explicit governance approval.

## Recommended First PR

**Title:** `docs: introduce Continufy company layer (audit + attribution prose)`

**Contents (additive only):**
1. This audit at `docs/branding/CONTINUFY_REBRANDING_AUDIT_AND_MIGRATION_PLAN.md`.
2. One attribution line in `README.md` under `# Positioning`.
3. One company-layer line in `SECURITY.md`.
4. A `## Company layer (Continufy)` section in `docs/continuityos-rebrand.md`.
5. `Continufy` / brand-hierarchy entries in `docs/glossary.md`.

**Explicitly NOT in the first PR:** no repo creation, no rename, no `wrangler.toml`/
`package.json`/schema/test edits, no domain strings, no workflow/action identifier
changes. This keeps the first PR **Safe**, reviewable, and reversible.
