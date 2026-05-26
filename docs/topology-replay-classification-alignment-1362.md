# Topology Replay-Classification Alignment (Post-#1362/#1363)

## Scope

Analyzed why these workflows remain classified as `OPEN` and/or replay-unsafe by runtime topology intelligence:

- `.github/workflows/constitutional-integrity.yml`
- `.github/workflows/governed-deploy.yml`
- `.github/workflows/prepare-governed-deploy.yml`
- `.github/workflows/sco-candidate.yml`

## 1) Current replay-classification path

Current runtime topology extraction is lexical/heuristic, not semantic.

- Topology files are crawled from fixed roots (`src`, `runtime`, `graph`, `docs`, `tests`, `.github/workflows`).
- Node typing uses substring matching (`authority`, `continuity`, `compile`, `validate`, `execute`, `proof`, `replay`, `deploy`, `workflow`, ...).
- Closure status is assigned by `classifyClosure(filePath, content)` using prioritized keyword rules:
  1. `BREAK_GLASS` if `break_glass` appears.
  2. `CLOSED` if `fail-closed`/`non-bypassability`/`cannot` appears.
  3. `OPEN` if `mutation` OR `execute` OR `deploy` appears.
  4. `CONTAINED` if `validate` OR `proof` OR `replay` appears.
  5. else `PARTIAL`.

Because `OPEN` is checked before `CONTAINED`, any workflow containing `deploy` or `execute` is structurally forced OPEN, even when replay controls exist.

## 2) Workflow replay predicate inventory

The extractor currently evaluates replay safety with:

- `replay_safe = lower.includes('replay') && (lower.includes('block') || lower.includes('reject') || lower.includes('safe'))`

This means replay visibility requires literal co-occurrence of specific words, not semantic evidence like:

- deterministic replay IDs (`*_REPLAY_ID`),
- run identity bindings (`run_id`, `run_attempt`, `sha`, `ref`),
- canonical route traversal,
- nonce usage (`invocation_nonce`),
- fail-closed shell guards.

## 3) Topology inference gaps

Observed gaps in topology intelligence:

1. **Precedence bug in closure heuristic**: `deploy`/`execute` keyword forces `OPEN` before replay/validation evidence is considered.
2. **Lexical-only replay detection**: replay protections expressed as identity construction + lineage binding are not treated as replay-safe unless specific textual tokens (`block|reject|safe`) co-occur with `replay`.
3. **No workflow-structure parsing**: no parse of `on`, `concurrency`, `permissions`, or job/step-level fail-closed guards as formal topology features.
4. **No lineage-edge inference for workflows**: extractor does not infer `/session → /continuity → /authority → /compile → /validate → /execute → /proof` from curl/call order in workflow scripts.
5. **No authority-binding recognition**: constraints such as branch/ref matching and workflow identity pinning are not promoted to closure signals.

## 4) Classification drift analysis

Drift source is **topology semantics lagging runtime/workflow semantics**, not necessarily missing replay controls.

- Workflows include explicit replay material (e.g., `DRIFT_REPLAY_ID`, `REPLAY_ID`, `PREPARE_REPLAY_ID`, `SCO_REPLAY_ID`) and multiple hard fail guards (`NULL` + exit).
- Extractor closure assignment remains dominated by `deploy`/`execute` lexical presence.

Therefore post-#1362 protections can exist yet still remain topology-classified as OPEN due to heuristic bias.

## 5) Exact surfaces keeping workflows OPEN

Exact predicate causing OPEN:

- `if (lower.includes('mutation') || lower.includes('execute') || lower.includes('deploy')) return 'OPEN'`

For the target workflows:

- `governed-deploy.yml` and `prepare-governed-deploy.yml`: contain `deploy`/`execute` strings extensively.
- `sco-candidate.yml`: contains `mutation_classes`, `runtime_mutation`, `workflow_mutation`.
- `constitutional-integrity.yml`: contains mutation/executable-route detection language (`mutation`, `app.post`, etc.).

Any of these terms is sufficient for OPEN classification regardless of replay lineage content.

## 6) Replay-lineage visibility assessment

Current status by extractor capability:

- **Observable**: only via string-token presence.
- **Reconstructable**: **No** (no semantic reconstruction of replay lineage graph).
- **Continuity-bound**: **Not inferred** for workflows even when they invoke `/continuity` and bind continuity IDs.
- **Proof-bound**: **Not inferred** as an edge/property from workflow step sequencing.

Conclusion: replay lineage appears **partially parsed but topology-invisible at semantic level**.

## 7) Canonical topology-alignment determination

Determination:

- #1362 likely advanced runtime/workflow replay legitimacy controls.
- Topology intelligence did **not** fully recognize closure because extractor semantics are too shallow.

So this is primarily **topology intelligence drift**, not proof that replay closure failed.

## 8) Minimal bounded remediation location

Canonical bounded fix location:

- `graph/runtime-topology-extractor.ts`

Specifically:

1. `classifyClosure(...)` precedence/order and rule semantics.
2. `replay_safe` predicate logic in node assembly.
3. Optional additive helper(s) for workflow semantic feature extraction (without changing runtime execution behavior).

No runtime route behavior changes are required for this alignment fix.

## 9) Which semantics are ahead

Runtime/workflow semantics are ahead of topology semantics.

- Workflows encode deterministic replay IDs, constrained dispatch context, canonical route use, and fail-closed checks.
- Extractor still applies coarse lexical OPEN logic with limited replay-safe inference.

## 10) Closure-state determination

For these four workflow surfaces under current extractor logic:

- **Status**: `OPEN` remains mechanically expected.
- **Convergence**: **partially converged** (replay controls exist, classifier under-recognizes them).
- **Topology condition**: **topology stale / semantically misclassified** relative to post-#1362 replay lineage intent.

Primary question answer:

- **#1362 may have closed substantial replay-legitimacy mechanics, but topology intelligence failed to recognize full closure due to heuristic/parser limitations.**
