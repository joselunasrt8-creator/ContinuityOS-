# Repository Consolidation Audit — Post #1891 (Agent Tool Gateway Closure)

**Audit date:** 2026-06-08
**Branch:** `claude/repo-consolidation-audit-2jyqzz`
**Trigger:** First proven runtime loop closed in commit `16799d9` (#1890/#1891)
**Scope:** Whole-repo deletion/consolidation audit — classify every candidate surface as ACTIVE, SEQUENCED, or REMOVE relative to the proven loop
**Method:** Static reference tracing only — for each candidate, grep `src/`, `runtime/`, `cli/`, `scripts/`, `tests/`, `governance/**` for actual readers (imports, `readFileSync`, `existsSync`, route wiring), then check git history (one-shot batch vs. maintained)
**Determination:** A small, surgical REMOVE set (3 files); a large SEQUENCED set that must stay because tests, scripts, or governance manifests already depend on it; no `governance/**` files are proposed for edit or deletion (no GMA in scope)

---

## 1. The proven loop (the only ACTIVE-by-definition surface)

Commit `16799d9` wired the previously-isolated filesystem-write chain into one mandatory runtime path:

```
Agent request
  → captureFilesystemWriteATAO        (ATAO capture)
  → compileFilesystemWriteAEO         (AEO compile)
  → validateFilesystemAEO             (Ω-validator — VALID/NULL)
  → executeFilesystemWrite            (filesystem-write execution, exact-object boundary)
  → FilesystemWriteExecutionProof     (proof)
```

composed by `runFilesystemWriteGatewayAction` (the *only* function that can produce an `EXECUTED` filesystem-write proof) and exposed at `POST /gateway/tool/filesystem-write`.

### ACTIVE — required for the proven loop

| File / surface | Role |
|---|---|
| `src/index.ts` (route `/gateway/tool/filesystem-write`, `handleAgentToolGatewayFilesystemWrite`) | live entrypoint that invokes the gateway action |
| `src/lib/filesystem-write-runtime-gateway.ts` (`runFilesystemWriteGatewayAction`) | mandatory composition — the gate itself |
| `src/lib/filesystem-write-gateway.ts` (`captureFilesystemWriteATAO`, `compileFilesystemWriteAEO`, `executeFilesystemWrite`) | capture/compile/execute stages |
| `src/lib/filesystem-aeo-validator.ts` (`validateFilesystemAEO`) | Ω-validator stage |
| `src/lib/agent-tool-gateway.ts` (`selectAEOTemplate`, `classifyGatewayToolSurface`) | template selection / surface classification used by the route |
| `src/lib/adapter-contract.ts` | shared adapter contract type the gateway chain is built on |
| `migrations/*.sql` (object/decision/nonce/proof D1 registries — applied at bootstrap, `src/index.ts:6461`) | persistence layer the chain reads/writes |
| `runtime/MUTATION_SURFACE_EXHAUSTIVENESS.json`, `runtime/unauthorized_mutation_path_closure_audit.json`, `runtime/unauthorized_mutation_surface_inventory.json` | declared mutation-surface matrices updated *in the same PR* to keep FATE static scans exhaustive over the new route |
| `tests/issue-1890-filesystem-write-gateway-route.test.mjs`, `tests/issue-1890-filesystem-write-runtime-gateway.test.mjs` | proofs of the EXECUTED and NULL/bypass paths end to end |
| `docs/audits/agent-tool-execution-runtime-closure-audit.md` (#1888) | names the exact gap (`GAP-RT-2`) that #1890/#1891 closes — the lineage record for *why* this loop is the first proven one |

`src/lib/agent-tool-gateway.ts:interceptToolCall` remains explicitly `non_operative` (observation/proposal formation only) — it is wired in but is *not* part of the mutation-capable proven loop. It stays ACTIVE-as-library because the route depends on the module, but it is not itself a closed surface.

---

## 2. What turned out to be load-bearing (and therefore SEQUENCED, not REMOVE)

The instinct from the cleanup-target list (duplicate inventories, stale schemas, dead adapters, old audits, test fixtures) suggested a much larger deletion set. Tracing actual references shows most of these candidates are **already pinned by tests, scripts, or static governance manifests** — deleting them would either break `npm test` or mutate `governance/**` as a side effect, both of which are out of scope for this pass.

| Candidate family | Why it looked removable | Why it is NOT safely removable now | Classification |
|---|---|---|---|
| Root `EXECUTION_SURFACES.json`, `BYPASS_PATHS.json` | Look like duplicates of `governance/runtime/*` and `runtime/surfaces/*` copies; `INVENTORY_SOURCE_MAP.md` calls the root copies "ROOT_ACCUMULATION" | Read directly by `tests/runtime-governance-artifacts.test.mjs`, `tests/fate/d1-migration-governance.test.mjs`, and `src/install_base/report.mjs` (`readJson('EXECUTION_SURFACES.json')` / `readJson('BYPASS_PATHS.json')`, repo-root relative) | **SEQUENCED** (genuine duplicate-family problem — real, but resolving it means changing test expectations, which is its own bounded issue, not a deletion) |
| `aeo.json`, `decision.json` (root demo objects) | Self-described as "demo-only" / "non-operative" by `LEGACY_SURFACES.md` / `EXECUTION_SURFACE_CLASSIFICATION.md` | `tests/cicd-stage1-conformance.test.mjs:312` does `readFileSync(resolve(ROOT, 'aeo.json'))` and asserts its schema shape; `decision.json` is declared in `governance/mindshift-validation-bundle/maps/REPO_EXECUTION_MAP.json` | **SEQUENCED** |
| `runtime-topology.json` (root) | Looks like a stray generated snapshot vs. `graph/runtime-topology.sample.json` | `scripts/render-topology-graph-viewer.ts:30-31` lists it as a fallback graph-data source | **SEQUENCED** |
| `schemas/**` (25 JSON Schema files) | "Stale schemas with no runtime readers" — confirmed zero `src/` readers | Have *test* readers: `tests/fate/issue-1704-atao-structural-validation-spec.test.mjs`, `tests/conformance/schemas/continuityos-v1-schema.test.mjs`, `tests/issue-625-skill-provenance-revocation.test.mjs`, `tests/fate/federated-reconciliation*.test.mjs`, etc. | **SEQUENCED** (genuinely dead *at runtime* — CF Workers don't load JSON Schema files at request time — but alive as conformance-test fixtures; a future "promote or retire schema conformance suite" issue should own this, not a blanket delete) |
| `tests/fixtures/**`, `conformance/**` | "Test-only fixtures not used by current runtime path" — true that the #1890 gateway tests use inline `makeX()` factories and import none of these | Each fixture family is consumed by a *different*, currently-passing test suite (`execution-surface-closure.test.mjs`, `cicd-stage1-conformance.test.mjs`, `registry-lineage-migrations.test.mjs`, 16 conformance suites, etc.) | **SEQUENCED** (would require a per-suite retirement decision — out of scope for "no runtime behavior change / tests stay baseline-clean") |
| `src/lib/github-issue-comment-gateway.ts`, `cloudflare-adapter.ts`, `d1-storage-adapter.ts` | Named in the #1888 audit as "fully implemented, fail-closed, independently tested, but never invoked from `src/index.ts`" — same shape as the filesystem-write chain *before* #1890 wired it in | Each backs a real, scoped, merged issue (#1861 bounded GitHub comment gateway, #1866 adapter-governance fail-closed contract) — they are the *next* candidates for the same "wire it into a route" treatment #1890 just proved out, not dead code | **SEQUENCED** — these are exactly the surfaces a follow-up "second proven loop" issue should target |
| `archive/session/runtime_ontology_inventory.txt` | Looks like a transient scan dump, same shape as the files already deleted in `archive/DELETION_REPORT_2026-05-21.md` | Its path is enumerated inside `governance/runtime/SEMANTIC_COLLAPSE_REPORT.json` (`files_scanned`/`duplicate_mentions`), which `tests/semantic-collapse.test.mjs` **regenerates on every run** via `scripts/semantic_collapse_validator.mjs` (the `.txt` extension is in the scanner's match set, the `archive` directory is in its scan scope). Deleting the file changes the regenerated report's content — i.e. produces an uncommitted `governance/runtime/**` diff on every `npm test`, exactly the side effect #1891's own commit message had to revert to stay out of "governance_mutation classification." | **SEQUENCED** — needs a GMA-scoped pass that updates `SEMANTIC_COLLAPSE_REGISTRY.json`/report together with the deletion |
| Root one-shot audit/assessment docs (`DRIFT_ANALYSIS.md`, `LIGHTWEIGHT_REDUCTION_ASSESSMENT.md`, `LIGHTWEIGHT_CLOSURE_RECOMMENDATIONS.md`, `REPOSITORY_REDUCTION_ASSESSMENT.md`, `TOPOLOGY_COHERENCE_REVIEW.md`, `TOPOLOGY_COMPRESSION_REPORT.md`, `PRESERVATION_MANIFEST.md`, `PARTITION_FINALITY_SEMANTICS.md`, `runtime_topology_inventory.md`, `EXECUTION_SURFACE_CLASSIFICATION.md`, `LEGACY_SURFACES.md`, `AGENT_BYPASS_INVENTORY.json`, `CANONICAL_AEO_IDENTITY_SPEC.md`, `GOVERNANCE_REQUIREMENTS.json`, `ARTIFACT_INVENTORY.md`, `PHASE3_EXECUTION_SURFACE_INVENTORY.json`) | "Old audit reports superseded by recent closure work"/"docs that restate canon" — all created in a single batch commit (`61d384c`, #1795), self-described as "non-operative"/"evidence-only"/"assessment-only" | None are imported by runtime code, but each is itself a *declared path* inside other generated registries (`governance/runtime/SEMANTIC_COLLAPSE_REPORT.json`, `INVENTORY_SOURCE_MAP.md`, `runtime-topology` reconciliation maps). Deleting any of them creates the same stale-reference / regenerated-report problem as above, and several (`AGENT_BYPASS_INVENTORY.json`, `GOVERNANCE_REQUIREMENTS.json`) are cited as evidence sources by closure docs that ARE still load-bearing lineage | **SEQUENCED** — candidates for a follow-up "retire batch-#1795 snapshot docs" issue that updates the registries that enumerate them in the same PR (GMA-scoped) |
| `docs/analysis/*` (18 files), `artifacts/closure/phase-matrices/*`, `docs/audits/issue-1625-closure-audit.md`, `docs/canon/formal-cognition-lineage-canon-v1.md`, `docs/plans/openclaw-governed-envelope-v1-plan.md`, `artifacts/ISSUE_CLOSURE_UMBRELLA_NOTE.md` | Point-in-time analysis/closure snapshots tied to specific now-closed issues | Zero runtime/test references; genuinely inert prose | **SEQUENCED / archive-eligible** — safe to *move* into an index (e.g. extend `artifacts/closure/INDEX.md`) in a follow-up docs-only PR, but moving ≠ this pass's "delete only REMOVE" scope, and a wholesale prose reorganization is its own bounded change |

---

## 3. REMOVE — surgical, zero-dependency set

Three files cleared every check: no runtime reader, no test reader, no script reader, and (for two of them) the only mentions are inside *static, non-regenerated* manifests, so deleting them does not trigger a `governance/**` rewrite at test time.

| File | What it is | Evidence it's dead weight |
|---|---|---|
| `.codex` | Empty (0-byte) file at repo root | Collides with the `.codex/` *directory* ignore rule in `.gitignore` — almost certainly an accidental commit of a tool-generated path. Zero test references (`tests/fate/codex-execution-protocol.test.mjs` reads `docs/codex-execution-protocol.md`, an unrelated file, despite the name collision; no FATE test asserts on the `.codex`-mentioning prose described below). **Correction from initial pass:** there are *three* descriptive mentions, not one — `governance/mindshift-validation-bundle/maps/REPO_EXECUTION_MAP.json` (`"path": ".codex"`), `runtime/REVERSE_CLOSURE_MUTATION_MAP.json:325` (`RCM-018.current_gate` prose: "`.codex defines codex-execution-protocol`"), and `REPOSITORY_REDUCTION_ASSESSMENT.md:153` (a batch-#1795 snapshot-doc table row, already SEQUENCED above). All three are static, hand-maintained prose — none are regenerated by a script/test, and none are read by a test that asserts on the literal string, so deletion is still safe — but it leaves *two* stale runtime-governance references (not one) for the follow-up below |
| `MINDSHIFT_REPO_OBJECTS.zip` | Opaque 11.5 KB committed zip bundle at repo root | `ARTIFACT_INVENTORY.md` itself records its "lineage and regeneration path unclear." Zero runtime/test/script readers. `governance/runtime/CANONICAL_OBJECT_REGISTRY.json` already classifies it `"class": "ARCHIVED"` and separately declares a canonical archived copy at `governance/mindshift-validation-bundle/archive/MINDSHIFT_REPO_OBJECTS.zip` — **which does not exist on disk**. The root copy is therefore a stray duplicate of a phantom reference, not the canonical artifact |
| `archive/session/runtime_ontology_build.log` | 71 KB transient build/scan log from a prior audit session | `.log` extension is *not* in `scripts/semantic_collapse_validator.mjs`'s scan match set (`\.(json|md|txt|mjs|ts|js)$`), so — unlike its sibling `.txt` — deleting it cannot perturb the regenerated `SEMANTIC_COLLAPSE_REPORT.json`. Mentioned only in three of the batch-#1795 snapshot docs (`ARTIFACT_INVENTORY.md`, `LIGHTWEIGHT_REDUCTION_ASSESSMENT.md`, `LIGHTWEIGHT_CLOSURE_RECOMMENDATIONS.md`) as a descriptive listing, not a dependency |

**Known follow-up created by this deletion:** `governance/mindshift-validation-bundle/maps/REPO_EXECUTION_MAP.json`, `runtime/REVERSE_CLOSURE_MUTATION_MAP.json` (RCM-018 `current_gate`), and `governance/runtime/CANONICAL_OBJECT_REGISTRY.json` will retain stale prose/`path` references to `.codex` and `MINDSHIFT_REPO_OBJECTS.zip` respectively. Reconciling those entries requires editing `governance/**`/`runtime/**` and therefore needs a GMA — out of scope here, called out so it isn't a silent surprise. This is the same category of drift `INVENTORY_SOURCE_MAP.md` already exists to track.

---

## 4. Net effect

- **No runtime behavior change** — none of the three REMOVE files are read by `src/`, `runtime/`, `cli/`, or any test/script.
- **Tests remain baseline-clean** — verified no test asserts existence/content of any of the three files (only unrelated name-collision matches for `.codex`).
- **No `governance/**` mutation** — the deletion PR touches only the three files above; the resulting stale manifest references are documented here for a future GMA-scoped reconciliation, not edited now. **Caveat surfaced in review:** this audit document is itself a new file under `docs/`, one of `scripts/semantic_collapse_validator.mjs`'s scan scopes — running `tests/semantic-collapse.test.mjs` after this commit lands will regenerate `governance/runtime/SEMANTIC_COLLAPSE_REPORT.json` with a new entry for this file, just as it already does (on `main`, today, independent of this PR) for at least five pre-existing, untracked docs/registries — `docs/audits/agent-tool-execution-runtime-closure-audit.md` (#1888), `docs/audits/issue-1625-closure-audit.md`, `docs/phase-3-agent-gateway/PHASE_3A_AGENT_GATEWAY_SPECIFICATION.md` and `PHASE_3_LINEAGE_INDEX.md` (#1795), `docs/protocols/topology-reasoning-protocol-v1.md`, and `governance/runtime/MERGE_GOVERNANCE_RULES.json` (#1841). The report has been perpetually stale relative to the doc tree since well before this audit; this file becomes one more entry in that pre-existing list, not a newly-introduced class of drift. Reconciling it means editing `governance/runtime/SEMANTIC_COLLAPSE_REPORT.json` directly — a `governance/**` write that needs its own GMA, exactly the same class of follow-up already called out for `archive/session/runtime_ontology_inventory.txt` above.
- This audit deliberately does **not** propose deleting the much larger SEQUENCED set identified above — each of those families is either (a) actively exercised by a passing test suite, (b) the explicit "next" target of a scoped future issue (#1861/#1866-style adapters), or (c) would itself require a `governance/**` edit to retire cleanly. Treating them as REMOVE would have violated this issue's own acceptance criteria.

---

## Evidence index

- `src/index.ts:10,772-995,1224` — `runFilesystemWriteGatewayAction` import, route wiring, seed object
- `src/lib/filesystem-write-runtime-gateway.ts:1-30` — module-boundary comment naming this as "the ONLY function ... that can produce an EXECUTED filesystem-write proof"
- `tests/runtime-governance-artifacts.test.mjs:10-11`, `tests/fate/d1-migration-governance.test.mjs:15-18`, `src/install_base/report.mjs:19` — root `EXECUTION_SURFACES.json`/`BYPASS_PATHS.json` test/script readers
- `tests/cicd-stage1-conformance.test.mjs:309-333` — root `aeo.json` schema-conformance assertions
- `scripts/semantic_collapse_validator.mjs:5-6` — registry path, scan scopes (`governance/runtime`, `runtime/governance`, `docs`, `archive`) and extension match set
- `tests/semantic-collapse.test.mjs:13-15` — `execFileSync('node', ['scripts/semantic_collapse_validator.mjs'])` regenerates the report on every test run
- `governance/runtime/CANONICAL_OBJECT_REGISTRY.json:146-153` — declares both the existing root `MINDSHIFT_REPO_OBJECTS.zip` and a non-existent `governance/mindshift-validation-bundle/archive/MINDSHIFT_REPO_OBJECTS.zip` as `"class": "ARCHIVED"`
- `governance/mindshift-validation-bundle/maps/REPO_EXECUTION_MAP.json:436` — `.codex` path declaration
- `governance/runtime/RUNTIME_CONTRACTION_REGISTRY.json` + `tests/runtime-contraction.test.mjs` — the prior (2026-05-21) contraction pass and its regression guard, the precedent this audit follows
