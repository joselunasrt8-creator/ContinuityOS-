# Agent Identity — Phase 1 Implementation Notes

Operationalizes the first slice of `AGENT_ATTRIBUTION_SPEC.json` (#2003): it
closes **Unknown Actor → Attributed Actor** on the CI / Merge Guard plane. It
does not claim dependency formation and does not claim Maintainer Trust was
achieved.

## AC1 — Source-grounded topology preservation

This change is **attribution on the CI plane** and nothing more:

- **It is not an execution surface.** The only execution surfaces are the worker
  runtime route `/execute` (`src/index.ts`, `execution_surface: "deploy_runtime"`)
  and the GitHub merge itself. Attribution adds neither.
- **It does not alter deployment runtime.** No change to `/execute`, no new
  runtime route, no `governed-deploy` change.
- **It does not convert mutation into execution.** Mutation remains an authority
  classification (GMA / Standing Authority) of a merge, not an execution surface.
- **Attribution is not authority.** Classifying a PR as `AGENT_AUTHORED` grants
  no merge permission; it is descriptive metadata recorded on the proof, exactly
  as `AGENT_ATTRIBUTION_SPEC.json` requires (`proof_recording.binding_statement`).
- **The canonical object-identity hash is unchanged.** Attribution is recorded
  alongside the proof and never enters `canonical_payload`, so `canonical_hash`
  is byte-identical and `continuity-merge-guard@v0.1.0` consumers are unaffected.

## Phase 1 gate policy (the binding the spec deferred)

`AGENT_ATTRIBUTION_SPEC.json` left the merge-effect of each classification to a
policy artifact (`policy_binding_note`). Phase 1 binds the minimal,
non-overclaiming policy in the Merge Guard:

| Attribution status | Cause | Phase 1 effect |
|---|---|---|
| `identity_present` | ≥1 authoritative signal agrees, or an observed bot account | continue (recorded, non-blocking) |
| `identity_missing` | no authoritative signal (heuristic-only resolves here per spec) | **non-blocking** — ordinary human PRs are NOT blocked |
| `identity_ambiguous` | conflicting authoritative signals | **NULL** — could create false legitimacy, so fail closed |

Classification itself follows the spec verbatim: only AUTHORITATIVE signals
(`pr_label`, `pr_body_metadata_block`, `commit_trailer`) decide the class;
SUPPORTING (`github_actor_or_bot_account`) and HEURISTIC
(`branch_naming_convention`) signals corroborate or are recorded as context but
never produce `AGENT_AUTHORED` on their own; conflict → `UNKNOWN`.

## Where it lives

- `actions/continuity-merge-guard/attribution.mjs` — extraction + classification.
- `actions/continuity-merge-guard/canonical.mjs` — shared deterministic
  canonicalize / sha256 (extracted verbatim; same algorithm as before).
- `actions/continuity-merge-guard/check.mjs` — records `actor_attribution`,
  `attribution_classification`, `attribution_status`, `attribution_evidence_hash`
  in `MERGE_GUARD_PROOF.json`; adds `ATTRIBUTION_AMBIGUOUS` to `null_reasons`
  only on conflict.
- `action.yml` / `continuity-merge-guard.yml` — optional metadata inputs
  (`pr-author`, `head-ref`, `pr-body`, `pr-labels`, `commit-trailers`,
  `operator-id`), all backward-compatible.

## Out of scope (not implemented)

Deployment guard, `/execute` changes, new runtime routes, new authority classes,
multi-agent coordination, enterprise approval chains, cognition governance,
distributed legitimacy, new proof-registry architecture. The post-merge
canonical proof in `merge-proof.yml` is **not** modified — enriching its
append-only `canonical_payload` with attribution is a deliberate future step
(see remaining gaps in the implementation report).
