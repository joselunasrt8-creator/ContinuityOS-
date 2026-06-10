# Repo Deadweight Audit — Deletion Candidates (Self-Governance Hygiene Pass)

**Audit date:** 2026-06-10
**Branch:** `claude/repo-deadweight-audit-0ajww7`
**Trigger:** Self-governance hygiene pass over the current stack (Merge Guard
→ PR identity, GMA → governance/workflow mutation authorization, Filesystem/
LangChain gateway → agent execution, Proof registry → merge legitimacy).
**Scope:** Identify deletion candidates that meet *all three* of: (1) no
active check depends on it, (2) no current wedge depends on it, (3) no
invariant is weakened by removal. Focus areas: duplicate canon/docs, stale
workflows, obsolete scripts, unused proof artifacts, old research/spec files.
**Method:** Same as `docs/audits/repo-consolidation-audit-1891.md` — static
reference tracing only. For each candidate, grep `.github/workflows/`,
`scripts/`, `src/`, `tests/`, `governance/**`, `runtime/**`, `package.json`,
and `docs/**` for actual readers (imports, `readFileSync`, route wiring,
registry entries), then distinguish *static* manifest mentions from
*regenerated* registry entries (the latter create stale-diff side effects on
deletion, per #1891's `.codex` finding).
**Determination:** A small REMOVE set (3 stub files + 1 wrapper script + 1
empty placeholder dir); one initial candidate (`sandbox/distributed/*`)
reclassified to KEEP after evidence review; everything else this audit
touched was already classified by #1891 and is out of scope here.
**No files are deleted in this PR.** This is a candidate list with evidence,
per the requested "Audit repository for deadweight" prompt.

---

## 1. Relationship to #1891

`docs/audits/repo-consolidation-audit-1891.md` (2 days prior to this audit)
already ran a whole-repo deletion/consolidation audit and found that most
"looks removable" surfaces are **SEQUENCED**, not REMOVE — they're enumerated
in regenerated governance registries (`governance/runtime/SEMANTIC_COLLAPSE_REPORT.json`,
regenerated every test run by `scripts/semantic_collapse_validator.mjs`) or in
`INVENTORY_SOURCE_MAP.md`, or have live test/script readers. That audit already
covers, with concrete evidence, and this audit does **not** re-derive or
contradict:

- `artifacts/**` (closure matrices, verification reports)
- `docs/analysis/*`, `docs/canon/*`, `docs/plans/openclaw-governed-envelope-v1-plan.md`
- Root one-shot snapshot docs: `DRIFT_ANALYSIS.md`, `TOPOLOGY_COMPRESSION_REPORT.md`,
  `TOPOLOGY_COHERENCE_REVIEW.md`, `runtime_topology_inventory.md`,
  `LIGHTWEIGHT_REDUCTION_ASSESSMENT.md`, `LIGHTWEIGHT_CLOSURE_RECOMMENDATIONS.md`,
  `REPOSITORY_REDUCTION_ASSESSMENT.md`, `ARTIFACT_INVENTORY.md`,
  `PARTITION_FINALITY_SEMANTICS.md`, `EXECUTION_SURFACE_CLASSIFICATION.md`,
  `LEGACY_SURFACES.md`, `INSTALL_BASE.md`
- `schemas/**`, `tests/fixtures/**`, `conformance/**`, `fixtures/conformance/**`
- Root `EXECUTION_SURFACES.json`, `BYPASS_PATHS.json`, `aeo.json`,
  `decision.json`, `runtime-topology.json`
- `archive/session/runtime_ontology_inventory.txt` (pinned by
  `SEMANTIC_COLLAPSE_REPORT.json`'s scan scope)

For all of the above: **no new action — see #1891**.

This audit's contribution is the set of candidates **not examined** by #1891:
root-level disabled stubs, an orphaned Python wrapper, an empty placeholder
directory, and `sandbox/distributed/*`.

---

## 2. DELETE candidates

| File | What it is | Evidence of zero dependency | Known follow-up |
|---|---|---|---|
| `ingest_repo_graph.py` | 5-line wrapper: `raise SystemExit(extract_main())` around `scripts/extract_repo_graph.py` | Repo-wide grep for `ingest_repo_graph` returns **zero hits** outside the file itself — no workflow, `package.json` script (the real entry is `graph:extract` → `scripts/extract_repo_graph.py` directly), test, `src/`, or `governance/**`/`runtime/**` registry mentions it | **None** — cleanest possible removal, no stale-reference cleanup needed |
| `gateway.js` | Root stub: `throw new Error('Legacy gateway.js execution path disabled...')` | Zero references in `.github/workflows/`, `scripts/`, `src/`, `tests/`, `package.json`. Only mention is in `governance/mindshift-validation-bundle/maps/REPO_EXECUTION_MAP.json` (entry with `sha256`, `role: "runtime_or_operator_config"`, `execution_surface: false`, `mutation_capable: false`) | `REPO_EXECUTION_MAP.json` is a **static, hand-maintained** manifest (confirmed: no script or test regenerates or reads it) — same category as `.codex`/`MINDSHIFT_REPO_OBJECTS.zip` in #1891. Deletion leaves a stale entry; needs a follow-up GMA-scoped edit to `REPO_EXECUTION_MAP.json` (separate issue, out of scope here) |
| `worker.js` | Root stub: `throw new Error('Legacy worker.js execution path disabled...')` | Same as `gateway.js` — zero functional references; only appears in `REPO_EXECUTION_MAP.json` (static) | Same follow-up as `gateway.js` |
| `server.js` | Root stub: `throw new Error('Legacy server.js execution path disabled...')` | Same as `gateway.js` — zero functional references; only appears in `REPO_EXECUTION_MAP.json` (static) | Same follow-up as `gateway.js` |
| `queries/neo4j/.gitkeep` (and the now-empty `queries/neo4j/` dir) | Empty placeholder directory, single `.gitkeep` marker | Zero references in code, `.github/workflows/`, `governance/**`, `runtime/**`, or docs (the only repo hit for "neo4j" elsewhere is the unrelated `.env.neo4j` entry in `.gitignore`, and the active `graph:ingest` script targets `scripts/ingest_neo4j.py`, not this path) | None |

**Net effect of this DELETE set:** 5 filesystem entries removed across a
follow-up PR; 3 of them (`gateway.js`, `worker.js`, `server.js`) require a
paired, GMA-scoped edit to `governance/mindshift-validation-bundle/maps/REPO_EXECUTION_MAP.json`
to remove the now-stale entries — that edit is itself a governance mutation
and should be its own scoped change, not bundled silently.

---

## 3. Reclassified to KEEP (initial scan flagged these, evidence says otherwise)

| Path | Initial flag | Why it's actually KEEP |
|---|---|---|
| `sandbox/distributed/partition-sim.ts`, `replay-race.ts`, `stale-replica.ts`, `revocation-delay.ts`, `sandbox/distributed/README.md` | "Dead simulator code, no test integration" | Repo-wide grep shows these are **actively cited as evidence** in `docs/analysis/governance-settlement-convergence-analysis.md` (lines 985, 1242–1246) and `docs/stage2-distributed-legitimacy-enforcement-plan-v1.md` (lines 89, 113, 137), each tied to **OPEN** issues #1418 and #1347. These are load-bearing references for active/open work, not orphaned scaffolding |
| `registry.js`, `compile-decision.js` | "Unreferenced root stubs" | `GOVERNANCE_REQUIREMENTS.json` explicitly classifies these as demo surfaces that "must remain quarantined" — governance-pinned, not deadweight |
| `mindshift_bundle_generator.sh` | "Unreferenced shell script" | Functional Ed25519 bundle-signing script, referenced from `governance/mindshift-validation-bundle/maps/REPO_EXECUTION_MAP.json` |

---

## 4. Out of scope for a deletion list

| Item | Status | Reason |
|---|---|---|
| `governance-mutation-authorization.yml` (GAP-005) | **NARROW, not DELETE** | Per the user's own classification: active but noisy, contain/narrow. It is a required governance control (GMA), not a deadweight candidate. Reducing its noise is a separate, scoped follow-up |
| `artifacts/**`, `docs/analysis/*`, `docs/canon/*`, root snapshot/assessment docs, `schemas/**`, `tests/fixtures/**`, root JSON registries (`EXECUTION_SURFACES.json`, `BYPASS_PATHS.json`, `aeo.json`, `decision.json`, `runtime-topology.json`) | **Already classified — see #1891** | `docs/audits/repo-consolidation-audit-1891.md` §2 covers these with concrete grep/test-reader evidence; re-litigating here would duplicate that work |

---

## 5. Summary

- **0 files deleted in this PR.**
- **5 clean DELETE candidates** for a follow-up PR: `ingest_repo_graph.py`,
  `gateway.js`, `worker.js`, `server.js`, `queries/neo4j/` (incl. `.gitkeep`).
- **3 of the 5** (`gateway.js`, `worker.js`, `server.js`) require a paired
  GMA-scoped registry edit (`REPO_EXECUTION_MAP.json`) — call this out as a
  separate, scoped issue rather than bundling.
- **1 reclassification**: `sandbox/distributed/*` moves from "looks dead" to
  KEEP based on open-issue lineage (#1418, #1347).
- **No invariants weakened**: none of the DELETE candidates are referenced by
  any required check (`continuity-merge-guard.yml`, `merge-governance-check.yml`,
  `constitutional-integrity.yml`), the proof registry, or any wedge
  (Merge Guard, GMA, Filesystem/LangChain gateway).
