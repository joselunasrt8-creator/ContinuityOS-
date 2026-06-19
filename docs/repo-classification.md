# Repo Classification Ledger

> Load-bearing ledger for `ContinuityOS-`. Classifies the repository at the
> directory/cluster level into four tiers so navigation stays cheap and drift is
> visible. Updated during the 2026-06-19 light cleanse pass.
>
> Principle: **classify aggressively, move conservatively.** Labeling something
> `ARCHIVED` here does not mean it has been relocated — see the ARCHIVED tier for what
> was physically moved versus what is merely flagged for a future pass
> ("Understanding ≠ Correction").

## Tiers

### LOAD_BEARING
The running system. Moving or breaking any of these breaks runtime, CI, or deploys. Do not touch casually.

| Surface | Why |
| --- | --- |
| `src/` | Cloudflare Worker runtime; `src/index.ts` is the wrangler entry |
| `runtime/` | Runtime governance: control graph, reconciliation, federation, discovery |
| `cli/` | `mindshift` CLI executable (`bin` in `package.json`) |
| `continuity-core/` | Rust FFI: proof, lineage, hashing, replay |
| `schema.sql`, `migrations/` | D1 schema + migrations applied in CI; validated by tests |
| `tests/`, `conformance/` | CI gates (`npm test`, conformance harness) |
| Code-imported `governance/*.json` | e.g. `governance/merge-legitimacy/MERGE_ACTOR_REGISTRY.json` and the `governance/runtime/*` configs read by `runtime-discovery-adapter.ts`. These are imported by runtime code — not docs |
| `.github/workflows/` | Required CI/deploy gates |
| `package.json`, `wrangler.toml`, `tsconfig.json`, `Dockerfile` | Build/run config |

### SUPPORTING
Drives current decisions and onboarding. Not executed, but actively load-bearing for the dependency-formation phase.

| Surface | Why |
| --- | --- |
| `README.md`, `QUICKSTART.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`, `CODEOWNERS` | Project entry + policy |
| `docs/product/` | Positioning + pilot funnel (active adoption work) |
| `docs/strategy/`, `docs/dependency-formation/` | Current thesis (the phase that defines the roadmap) |
| `docs/protocols/`, `docs/canon/`, `standards/` | Current canonical protocols/standards |
| `schemas/` | Schema definitions referenced across surfaces |
| `docs/governance/` + active governance specs | Observation-vs-authority boundary and current rules |
| `artifacts/` | Formalized canon + closure evidence (e.g. `artifacts/closure/`) |
| `sandbox/` | On the active Research→Demo→Sandbox→Pilot→Dependency path / P0 work — no longer experimental |
| `ROOT.md`, `docs/roadmap.md`, this file | Navigation layer |

### EXPERIMENTAL
Useful, exploratory, or observational. Safe to iterate on; not a dependency of the spine.

| Surface | Why |
| --- | --- |
| `demo/` | Demonstration scripts (not production) |
| `graph/` | One-time graph ingestion/extraction |
| `telemetry/` | Append-only telemetry pipeline |
| `queries/` | Neo4j query scratch |
| `research/` | Research notes (`PILOT_QUALIFICATION.md`, `TIER1_PILOTS.md`) |

### ARCHIVED

**Physically moved this pass** (see [`/archive/ARCHIVE_REPORT_2026-06-19.md`](../archive/ARCHIVE_REPORT_2026-06-19.md)):

- `archive/superseded/canon-analysis/` — 19-file speculative-canon cluster
  (`GLOBAL_*`, `UNIVERSAL_*`, `DISTRIBUTED_CONSTITUTIONAL_*`,
  `CONTINUITY_EPOCH_LEGITIMACY_*`, `epoch-*-semantics`). Superseded by the
  dependency-formation phase; not runtime-, README-, or CI-referenced.

**Flagged for a future pass (labeled, NOT moved):**

- Root meta / reduction-assessment docs: `LIGHTWEIGHT_REDUCTION_ASSESSMENT.md`,
  `LIGHTWEIGHT_CLOSURE_RECOMMENDATIONS.md`, `REPOSITORY_REDUCTION_ASSESSMENT.md`,
  `DRIFT_ANALYSIS.md`, `TOPOLOGY_COHERENCE_REVIEW.md`, `TOPOLOGY_COMPRESSION_REPORT.md`.
- Completed audits/inventories: `IDENTITY_RESIDUE_AUDIT.md`,
  `PROOF_REGISTRY_BACKLOG_AUDIT.md`, `PORTFOLIO_LEVERAGE_AUDIT.md`,
  `ARTIFACT_INVENTORY.md`, `INVENTORY_SOURCE_MAP.md`,
  `PHASE3_EXECUTION_SURFACE_INVENTORY.json`.

These stay in place for now to keep this pass conservative; revisit once dependency
formation is proven.

## Archive taxonomy (convention for future passes)

When relocating, use these subfolders under the existing `archive/`:

- `archive/historical/` — completed phase/closure artifacts, dated session logs.
- `archive/superseded/` — old canon variants and analysis replaced by current thesis.
- `archive/research-raw/` — duplicated/raw research exports.

Always pair a move with a dated report under `archive/` (see existing
`archive/DELETION_REPORT_2026-05-21.md` and `archive/ARCHIVE_REPORT_2026-06-19.md`).
