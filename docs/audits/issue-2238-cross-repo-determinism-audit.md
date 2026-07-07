# Issue #2238 — Cross-Repository Determinism Completion Audit

## Intent

Determine whether Issue #2238 (`SYS-001 — Determinism Contract Missing (Cross-Repo System Rule)`) still represents missing runtime implementation work, or whether the remaining closure work is bounded cross-repository verification evidence.

## Scope boundary

This audit covers runtime, canonical serialization, replay, authority, proof, validation, conformance, execution surface registry, ecosystem boundary semantics, GitHub Actions, portability, federation, Merge Guard, and external repository integrations.

This audit does **not** redesign runtime architecture, introduce a parallel determinism mechanism, widen authority, add replay restoration, or mutate any execution path.

## Affected files

This audit is documentation-only. The sole intended mutation is this file:

- `docs/audits/issue-2238-cross-repo-determinism-audit.md`

## Preserved invariants

- `validated_object == executed_object`
- deterministic canonical object identity
- replay-safe execution gates
- proof lineage visibility without proof generation
- append-only lineage and registry behavior
- conformance as evidence, not authority
- portable evidence does not become portable authority
- Merge Guard determinism remains self-contained and policy-bounded

## Mutation-capable surfaces identified

The mutation-capable surfaces relevant to this audit are the existing runtime routes, CLI execution command, governed filesystem write gateway, governed GitHub issue comment demo gateway, D1-backed Worker execution path, GitHub Actions workflows, and Merge Guard action. This audit does not modify any of them.

## Replay implications

No replay state is consumed, restored, or rewritten by this audit. The remaining verification work should remain replay-neutral and evidence-only until a local repository independently admits execution under its own validation rules.

## Proof requirements

Closure of #2238 requires repository evidence for internal determinism and independent cross-repository evidence showing that the same canonical objects, replay decisions, proof projections, validation classifications, execution outcomes, conformance results, portability bundles, and Merge Guard decisions remain stable outside this repository.

## Validation requirements

Minimum validation for this audit artifact:

1. `npm run conformance`
2. `node actions/continuity-merge-guard/test.mjs`
3. `git diff --check`

## Unresolved ambiguity

The repository contains internal deterministic mechanisms and portable conformance artifacts, but this audit found **INSUFFICIENT EVIDENCE** that independent external repositories have run and published matching deterministic artifacts. That absence is a verification gap, not proof that the internal runtime lacks determinism.

---

## 1. Internal determinism audit

| Capability | Status | Repository evidence | Audit determination |
|---|---:|---|---|
| Canonical object identity | COMPLETE | `src/canonical.js` normalizes undefined/non-finite values, sorts object keys, canonicalizes arrays/objects recursively, and hashes canonical strings with SHA-256. `cli/lib/canonical.mjs` provides the Node CLI version. | Internal object identity is deterministic. |
| Deterministic hashing | COMPLETE | `hashCanonical(value)` is defined as `sha256Hex(canonicalize(value))` in both runtime and CLI canonical libraries. | Stable content hash exists internally. |
| `validated_object == executed_object` | COMPLETE | `cli/commands/validate.mjs` writes the successful embedded object into `validated_object`; `cli/commands/execute.mjs` refuses failed receipts, rechecks object hashes, and emits `executed_object` from `receipt.validated_object`. | Exact-object discipline is implemented. |
| Replay safety | COMPLETE | `cli/commands/execute.mjs` blocks receipts already marked executed and `replay_safe === false`; lineage admission tracks consumed nonces and appends nothing when eligibility is NULL. | Replay restoration is blocked by execution and lineage gates. |
| Proof lineage | COMPLETE | `cli/commands/proof.mjs` is observability-only and verifies proof shape without generating proofs; `runtime/lineage/proofChainRegistry.mjs` maintains append-only lineage links. | Proof lineage is inspectable and bounded. |
| Execution ordering | COMPLETE | The documented runtime flow is `/session → /continuity → /authority → /compile → /validate → /execute → /proof`; CLI commands separately enforce compile, validate, execute, proof boundaries. | Ordering is expressed and enforced through phase-specific objects/checks. |
| Append-only registries | COMPLETE | `runtime/lineage/proofChainRegistry.mjs` reads strict JSONL chain entries, verifies stored chain state before append, and appends nothing on NULL. Conformance checks append-only D1 trigger coverage. | Append-only behavior is implemented and conformance-checked. |
| Execution surface governance | COMPLETE | `docs/issue-2280-execution-surface-registry-audit.md` states #2280 supports deterministic surface enumeration and should not absorb #2238 semantics. Runtime/adoption registries enumerate external surfaces. | Treated as completed per instruction; no duplicate #2280 work needed. |
| Ecosystem boundary semantics | COMPLETE | Federation and portability suites require observability-only behavior, local validation, denied remote authority, and `portable_evidence_not_portable_authority`. | Boundary semantics are implemented as conformance rules. |
| Conformance enforcement | COMPLETE | `conformance/runner.mjs` verifies deterministic vector hashes, exact-object interoperability, federation boundary, portability, replay neutrality, append-only registry migration, CI/CD conformance, and Stage 2 distributed legitimacy matrix completion. | Conformance is implemented and executable. |
| CI reproducibility | PARTIAL | GitHub workflows exist for canonical conformance, runtime tests, Merge Guard, lineage eligibility observation, and merge proof. | CI wiring exists internally; cross-repo reproducibility evidence remains missing. |

### Internal audit conclusion

The repository already enforces deterministic execution internally. #2238 should not be treated as a missing runtime architecture issue. The remaining unresolved work is evidence production across repository boundaries.

---

## 2. Cross-repository determinism audit

| Cross-repository behavior | Status | Repository evidence | Missing evidence before closure |
|---|---:|---|---|
| Identical canonical hashes | PARTIAL | Deterministic legitimacy vectors include canonical forms and expected SHA-256 values; Merge Guard has a deterministic hash fixture and self-contained canonicalization. | At least one independent repository must run the same pack/action and publish matching canonical hashes for the same vectors or fixtures. |
| Identical replay behavior | PARTIAL | Conformance pack includes consumed nonce and resurrection-attempt replay checks; runtime lineage tracks consumed nonces. | External repository evidence must show replay NULL behavior matches locally without consuming or restoring local runtime state. |
| Identical proof generation/projection | PARTIAL | Proof CLI is observability-only; portability demos emit proof receipts internally; conformance pack checks append-only proof state. | External repository evidence must show matching proof projection/receipt classification. If external pack is evidence-only and does not generate production proofs, closure criteria should say “proof projection,” not “proof generation.” |
| Identical validation decisions | PARTIAL | Conformance runner verifies exact-object and federation vectors; pack-v1 validator checks valid/mutated/missing-key objects. | Independent run logs must show the same VALID/NULL classifications. |
| Identical execution outcomes | PARTIAL | Portability demos show VALID / replay-NULL / policy-NULL outcomes for filesystem write and GitHub issue comment surfaces. | Independent repository must demonstrate matching outcomes for a portable non-production or governed local surface, or explicitly mark production execution as NOT APPLICABLE. |
| Identical conformance results | PARTIAL | `conformance/pack-v1/README.md` defines external install and expected pass signals; `conformance/runner.mjs` validates internal suites. | External repository must publish `PACK_V1_CONFORMANCE_COMPLETE` and `CONFORMANCE_EVIDENCE_OBSERVED` output or equivalent structured evidence. |
| Deterministic portability bundles | PARTIAL | Demo portability docs and conformance pack provide copyable, zero-dependency external paths. | Bundle identity/hash and external run output are not yet recorded from an independent repo. |
| Deterministic Merge Guard behavior | PARTIAL | Merge Guard action has copyable self-contained canonicalization and deterministic fixture tests; action output includes `proof_hash`. | Independent repository must pin the action or copied directory and publish matching `VALID`/`NULL` decisions and canonical hashes. |
| Federation boundary behavior | PARTIAL | Federation suite requires remote authority claims to be quarantined and local validation to remain required. | Independent repository must show remote evidence is observed without becoming local execution authority. |
| External repository integration | PARTIAL | Adoption and dependency-formation docs identify candidate/external dependency signals. | **INSUFFICIENT EVIDENCE** of an unaffiliated repository publishing deterministic artifacts sufficient to close #2238. |

### Cross-repository audit conclusion

Cross-repository determinism is not missing as a mechanism; it is missing as independently published evidence. The issue has been reduced to a bounded verification problem.

---

## 3. Remaining implementation gaps

Only the following gaps are truly missing for #2238:

1. **External evidence capture gap** — No repository-local artifact records an independent external repository run with matching canonical hashes, replay classifications, proof projections, validation decisions, conformance output, portability behavior, and Merge Guard result.
2. **Closure matrix gap** — No single issue-specific closure matrix maps each #2238 claim to `COMPLETE`, `PARTIAL`, `MISSING`, or `NOT APPLICABLE` with evidence links and explicit `INSUFFICIENT EVIDENCE` entries.
3. **Candidate closure criteria gap** — Closure criteria need to distinguish internal determinism completion from cross-repository proof completion.

Not missing for #2238:

- runtime redesign
- new canonical serialization
- new hashing algorithm
- new execution ordering mechanism
- new replay subsystem
- new proof generator
- new execution surface registry work covered by #2280
- portability work covered by #2282
- federation/ecosystem boundary work covered by #2283

---

## 4. Minimal implementation plan

1. Keep this audit as the issue-compression artifact.
2. Capture one independent external repository conformance run using `conformance/pack-v1`:
   - commit hash of this repository or pack copy source
   - external repository URL/commit
   - command output containing `PACK_V1_CONFORMANCE_COMPLETE` and `CONFORMANCE_EVIDENCE_OBSERVED`
   - generated `conformance-pack-v1-evidence.json`
3. Capture one independent Merge Guard run:
   - external workflow file or pinned action reference
   - `MERGE_GUARD_PROOF.json`
   - `result`, `proof_id`, and `canonical_hash`/`proof_hash`
4. Capture one portability or non-production governed execution run, or explicitly classify production execution as `NOT APPLICABLE` if the external repository only adopts conformance/Merge Guard evidence.
5. Add the external evidence artifact under `evidence/` or `docs/audits/` without modifying runtime behavior.
6. Re-run `npm run conformance`, `node actions/continuity-merge-guard/test.mjs`, and `git diff --check`.

---

## 5. Candidate closure criteria

#2238 can close when all of the following are true:

- Internal determinism remains `COMPLETE` for canonical identity, deterministic hashing, exact-object validation/execution parity, replay safety, proof lineage, execution ordering, append-only registries, execution surface governance, ecosystem boundary semantics, conformance enforcement, and internal CI reproducibility.
- At least one independent repository publishes matching conformance evidence for deterministic vectors and replay/proof/validation classifications.
- At least one independent repository publishes deterministic Merge Guard evidence with stable canonical hash/proof hash for the same fixture or PR context.
- Any external execution/portability claim is either evidenced with deterministic VALID/NULL outcomes or explicitly marked `NOT APPLICABLE` because the external repository adopted only evidence-only conformance/Merge Guard checks.
- Remote evidence remains non-authoritative; no closure evidence claims distributed finality, portable authority, or local execution legitimacy without local validation.

---

## 6. Final recommendation

**IMPLEMENT THEN CLOSE**

Interpretation: do not implement new runtime determinism. Implement only the minimum cross-repository evidence capture needed to prove already-implemented deterministic behavior across repository boundaries, then close #2238.

If no independent external repository evidence can be produced, keep #2238 open but relabel/narrow it as a bounded cross-repository verification issue, not a missing internal determinism contract.
