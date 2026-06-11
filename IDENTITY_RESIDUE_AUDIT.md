# Identity Residue Audit — `mindshift-demo` references

**Issue:** #1955 (External Dependency Validation)
**Source:** `PORTFOLIO_LEVERAGE_AUDIT.md`, candidate #1
**Date:** 2026-06-11

This audit enumerates every `mindshift-demo` (and related `mindshift-demo-*`)
string in the repository and classifies it:

- **REPLACE_ON_ACTIVE_PATH** — on the path an external operator following
  `README.md` / `#1955` actually walks. Fixed in this change.
- **LEGACY_REFERENCE (deployed infra)** — matches the *real*, currently
  deployed Cloudflare Worker / D1 database names in `wrangler.toml`. Renaming
  these is a deployment-capability change (out of scope per
  `release_provenance_matrix.json` scope guard) and would break the
  governance/runtime topology docs and the `tests/fate/*` suites that assert
  on them.
- **LEGACY_REFERENCE (historical record)** — append-only/dated artifacts
  (decisions, closure audits, recorded transcripts, stage plans) that record
  what was true *at the time they were written*. Editing these would falsify
  the historical record.
- **FOLLOW_UP (secondary install paths)** — copy/paste instructions outside
  the `#1955` critical path (conformance pack adoption docs, course labs).
  Real but lower-priority than the `#1955` funnel; not blocking dependency
  proof.
- **KEEP** — `MindShift` as the canon/research-umbrella name (per
  `SECURITY.md`: "MindShift remains the canon and research umbrella") or
  schema namespace (`https://mindshift.local/...`). Not repository identity;
  not residue.

---

## REPLACE_ON_ACTIVE_PATH (fixed in this change)

| File | Before | After |
|---|---|---|
| `demo/portability/RECORDED_DEMO.md` | `git clone https://github.com/joselunasrt8-creator/mindshift-demo.git` / `cd mindshift-demo` | `git clone https://github.com/joselunasrt8-creator/ContinuityOS-.git` / `cd ContinuityOS-` |
| `demo/portability/RECORDED_DEMO.md` | `> mindshift-demo@1.0.0 demo` | `> continuityos@1.0.0 demo` (matches new `package.json` name) |
| `CANONICAL_AEO_IDENTITY_SPEC.md` | `**Repository:** joselunasrt8-creator/mindshift-demo` | `**Repository:** joselunasrt8-creator/ContinuityOS-` |
| `package.json` / `package-lock.json` | `"name": "mindshift-demo"` | `"name": "continuityos"` |

The single highest-impact item — **issue #1955's own "External Validation
Workflow" block** (`git clone` with a blank URL, `cd mindshift-demo`) — is a
GitHub issue body, not a repository file; see the companion recommendation in
`DEPENDENCY_PROOF_IMPLEMENTATION_PLAN.md` for the corrected text to post.

---

## LEGACY_REFERENCE (deployed infra) — KEEP

These all refer to the **actual deployed Cloudflare Worker** (`mindshift-demo`,
`mindshift-demo-preview`) and **D1 database** (`mindshift-demo-prod`,
`mindshift-demo-local`) named in `wrangler.toml`. Renaming requires a
coordinated Cloudflare-side rename + redeploy and is explicitly out of scope
("no deployment capability expansion"):

- `wrangler.toml` (`name`, `[env.preview].name`, `database_name`)
- `package.json` (`deploy:dry-run --name mindshift-demo`, `d1:migrate:local`)
- `governance/runtime/DEPLOYMENT_TOPOLOGY_MAP.json`
- `governance/runtime/CLOUDFLARE_AUTHORITY_CLASSIFICATION.json`
- `governance/runtime/PRODUCTION_MUTATION_CONTAINMENT.json`
- `governance/BYPASS_CAPABLE_SURFACES.json`
- `runtime/REVERSE_CLOSURE_MUTATION_MAP.json`, `runtime/residual_exploitability_report.json`
- `runtime/unauthorized_mutation_surface_inventory.json`
- `tests/fate/issue-838-runtime-sovereignty-boundary-closure.test.mjs`,
  `tests/fate/issue-584-cloudflare-authority-bypass-containment.test.mjs`,
  `tests/fate/sovereignty-boundary.test.mjs` — assert `wrangler.toml` worker
  names match the above.

## LEGACY_REFERENCE (governance scope identity) — KEEP, FLAG FOR DEDICATED PASS

`src/lib/filesystem-aeo.ts`, `src/lib/filesystem-write-route-adapter.ts`,
`runtime/aeo-governance.test.ts`, `aeo.json`, `decision.json`,
`governance/authorizations/GOVERNANCE_MUTATION_AUTHORIZATION.json`, and the
`tests/cicd-*` / `tests/fate/*` AEO-scope fixtures all bind
`repo: "mindshift-demo"` (or `"joselunasrt8-creator/mindshift-demo"`) into
**AEO/scope objects used by `governed-deploy.yml`'s authority chain**. These
are load-bearing identity strings checked by dozens of tests
(`tests/cicd-stage1-conformance.test.mjs`, `tests/cicd-replay.test.mjs`,
etc.). Changing them is a real (if mechanical) cross-cutting change with
deploy-authority implications and is **not** part of the `#1955` funnel —
an external operator never sees these. Recommended as a separate, dedicated
follow-up issue, not bundled with dependency-proof work.

## LEGACY_REFERENCE (historical record) — KEEP

Dated, append-only artifacts that are accurate *as of their date* and would
be falsified by editing:

- `governance/merge-legitimacy/CLOSURE_AUDIT_1626.md` / `.json`
- `artifacts/closure/phase-matrices/PHASE{1,2,3}_CLOSURE_MATRIX.md`
- `artifacts/REPLAY_DEATH_BOUNDARY_CANON.md`, `artifacts/TOMBSTONE_PROPAGATION_CANON.md`
- `docs/stage1-locked-surface-plan-cicd-v1.md`, `docs/stage2-*-plan-v1.md`,
  `docs/analysis/*.md`, `docs/invariant-coverage-matrix.md`,
  `docs/main-branch-protection-governance.md`,
  `docs/release-provenance-attestation-boundary.md`,
  `docs/reverse-closure-mutation-map.md`
- `governance/mindshift-validation-bundle/maps/REPO_EXECUTION_MAP.json`
  (records a specific historical archive, `mindshift-demo-main 15.zip`)
- `README.md` lines 179/185 — recorded JSON output of an actual past
  `npm run demo:portability:github` run (target repo/issue at the time)
- `actions/continuity-merge-guard/README.md:130` — a changelog note about a
  *previous* fix to this exact class of residue

## FOLLOW_UP (secondary install paths, outside #1955 critical path)

Copy/paste instructions that reference `mindshift-demo` as the clone target
or a path source, used for the *conformance pack* adoption flow (not the
`#1955` LangChain flow):

- `conformance/pack-v1/README.md` (clone URL + `cd mindshift-demo`)
- `docs/adoption/conformance-pack-v1-external-adoption.md` (clone URL + `cd mindshift-demo`)
- `docs/course/starter-repo.md`, `docs/course/conformance-badge.md`,
  `docs/course/labs/lab-5.md`, `docs/course/labs/lab-7.md` (`cp -r
  /path/to/mindshift-demo/...`)
- `demo/portability/github-issue-comment-governed-execution.mjs`:
  `ALLOWED_REPO = 'mindshift-demo'` — gates the `demo:portability:github`
  script (not part of the `demo-freshness` gate added in this change)

These are real but do not block `#1955` (which only requires `npm install &&
npm run demo:langchain`). Recommended as a follow-up sweep once `#1955`
closes.

## KEEP — canon/namespace, not repository identity

- `runtime/legitimacy/schemas/*.schema.json` — `$id:
  https://mindshift.local/...`, titles `"MindShift ... Object"` — schema
  namespace + canon vocabulary, per `SECURITY.md`: "MindShift remains the
  canon and research umbrella; ContinuityOS is the runtime substrate."
- `runtime/CATEGORY_DEFINITION.md`, `runtime/control_graph_*.ts`,
  `runtime/release_provenance_*.json` — "MindShift canonical chain",
  "MindShift authority" as governance-vocabulary terms, not a repo name.
- `package.json` keyword `"mindshift-canon"` — describes provenance, kept.
- `actions/continuity-merge-guard/fixtures/*.json` — arbitrary fixture repo
  names for the action's own unit tests; do not need to match the real repo.

---

## Summary

| Class | Count (files) | Action |
|---|---|---|
| REPLACE_ON_ACTIVE_PATH | 3 | Done in this change |
| LEGACY_REFERENCE (deployed infra) | ~10 | No action — matches real Cloudflare resources |
| LEGACY_REFERENCE (governance scope identity) | ~20 | No action here — separate dedicated issue |
| LEGACY_REFERENCE (historical record) | ~12 | No action — would falsify dated records |
| FOLLOW_UP (secondary install paths) | ~6 | Tracked, not blocking #1955 |
| KEEP (canon/namespace) | many | No action — intentional |
