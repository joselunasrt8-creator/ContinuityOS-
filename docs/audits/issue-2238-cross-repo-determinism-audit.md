# Issue #2238 — Cross-Repository Determinism Completion Audit

## Intent

Determine whether Issue #2238 (`SYS-001 — Determinism Contract Missing (Cross-Repo System Rule)`) still represents missing runtime implementation work, or whether the remaining closure work is bounded cross-repository verification evidence.

## Scope boundary

This audit covers runtime, canonical serialization, replay, authority, proof, validation, conformance, execution surface registry, ecosystem boundary semantics, GitHub Actions, portability, federation, and Merge Guard. Cross-repository scope is limited to deterministic evidence equivalence, not adoption or dependency formation.

This audit does **not** redesign runtime architecture, introduce a parallel determinism mechanism, widen authority, add replay restoration, or mutate any execution path.

## Affected files

This audit is documentation-only. The sole intended mutation is this file:

- `docs/audits/issue-2238-cross-repo-determinism-audit.md`

## Preserved invariants

- `validated_object == executed_object`
- deterministic canonical object identity
- replay-safe execution gates where lineage/runtime enforcement applies
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

Closure of #2238 requires repository evidence for internal determinism and cross-repository evidence showing that two repositories independently execute the same deterministic artifacts and produce equivalent deterministic evidence. Repository ownership, maintainer independence, adoption status, dependency formation, trust-building, and real-world usage are out of scope for #2238 and remain Issue #2145 concerns.

## Validation requirements

Minimum validation for this audit artifact:

1. `npm run conformance`
2. `node actions/continuity-merge-guard/test.mjs`
3. `git diff --check`

## Unresolved ambiguity

The repository contains internal deterministic mechanisms and portable conformance artifacts, but this audit found **INSUFFICIENT EVIDENCE** that a second repository has executed the same deterministic artifacts and produced equivalent deterministic evidence. That absence is a verification gap, not proof that the internal runtime lacks determinism, and it is not an adoption/dependency-formation gap.

---

## 1. Internal determinism audit

| Capability | Status | Repository evidence | Audit determination |
|---|---:|---|---|
| Canonical object identity | COMPLETE | `src/canonical.js` normalizes undefined/non-finite values, sorts object keys, canonicalizes arrays/objects recursively, and hashes canonical strings with SHA-256. `cli/lib/canonical.mjs` provides the Node CLI version. | Internal object identity is deterministic. |
| Deterministic hashing | COMPLETE | `hashCanonical(value)` is defined as `sha256Hex(canonicalize(value))` in both runtime and CLI canonical libraries. | Stable content hash exists internally. |
| `validated_object == executed_object` | PARTIAL | `cli/commands/validate.mjs` writes the successful embedded object into `validated_object`; `cli/commands/execute.mjs` refuses failed receipts and, when `--object <compiled-file>` is supplied, rechecks the compiled object hash before emitting `executed_object` from `receipt.validated_object`. | Exact-object discipline is implemented for the compiled-object cross-check path, but the default receipt-only CLI path is not classified COMPLETE unless it re-hashes `receipt.validated_object` against `receipt.object_hash`. |
| Replay safety | PARTIAL | Lineage admission tracks consumed nonces and appends nothing when eligibility is NULL; `cli/commands/execute.mjs` blocks receipts already marked executed and `replay_safe === false`. | Replay safety is COMPLETE for lineage-gated/runtime-enforced surfaces. No-lineage CLI/adapter replay remains PARTIAL because a receipt-only path does not itself provide durable lineage consumption. |
| Proof lineage | COMPLETE | `cli/commands/proof.mjs` is observability-only and verifies proof shape without generating proofs; `runtime/lineage/proofChainRegistry.mjs` maintains append-only lineage links. | Proof lineage is inspectable and bounded. |
| Execution ordering | COMPLETE | The documented runtime flow is `/session → /continuity → /authority → /compile → /validate → /execute → /proof`; CLI commands separately enforce compile, validate, execute, proof boundaries. | Ordering is expressed and enforced through phase-specific objects/checks. |
| Append-only registries | COMPLETE | `runtime/lineage/proofChainRegistry.mjs` reads strict JSONL chain entries, verifies stored chain state before append, and appends nothing on NULL. Conformance checks append-only D1 trigger coverage. | Append-only behavior is implemented and conformance-checked. |
| Execution surface governance | COMPLETE | `docs/issue-2280-execution-surface-registry-audit.md` states #2280 supports deterministic surface enumeration and should not absorb #2238 semantics. Runtime/adoption registries enumerate external surfaces. | Treated as completed per instruction; no duplicate #2280 work needed. |
| Ecosystem boundary semantics | PARTIAL | Federation and portability suite descriptors require observability-only behavior, local validation, denied remote authority, and `portable_evidence_not_portable_authority`. | Boundary semantics are specified as deterministic conformance descriptors, but declared portability/federation checks must not be described as fully enforced unless the runner evaluates the relevant semantics. |
| Conformance enforcement | PARTIAL | `conformance/runner.mjs` verifies deterministic vector hashes, selected expected-result/hash-equality checks, append-only registry migration coverage, CI/CD conformance descriptors, and Stage 2 distributed legitimacy matrix completion. | Conformance is implemented and executable for the checks the runner actually evaluates; declared-but-unevaluated portability/federation semantics are descriptors, not enforced evidence. |
| CI reproducibility | PARTIAL | GitHub workflows exist for canonical conformance, runtime tests, Merge Guard, lineage eligibility observation, and merge proof. | CI wiring exists internally; cross-repo reproducibility evidence remains missing. |

### Internal audit conclusion

The repository already contains deterministic internal mechanisms, with COMPLETE evidence for canonical identity/hashing and lineage-gated/runtime-enforced replay surfaces, and PARTIAL evidence for default receipt-only CLI exact-object/replay paths and declared-but-unevaluated conformance semantics. #2238 should not be treated as a missing runtime architecture issue. The remaining unresolved work is deterministic evidence production across repository boundaries.

---

## 2. Cross-repository determinism audit

| Cross-repository behavior | Status | Repository evidence | Missing evidence before closure |
|---|---:|---|---|
| Identical canonical hashes for the same deterministic vectors | PARTIAL | Deterministic legitimacy vectors include canonical forms and expected SHA-256 values; Merge Guard has a deterministic hash fixture and self-contained canonicalization. | Populate evidence from two repositories showing the same vector IDs or fixture names produce identical canonical hashes. |
| Identical `VALID`/`NULL` validation classifications | PARTIAL | Conformance runner verifies deterministic vector hashes and selected expected-result/hash-equality checks; pack-v1 validator checks valid/mutated/missing-key objects. | Populate evidence from two repositories showing the same deterministic artifacts produce identical validation classifications from evaluated checks, not merely declared suite descriptors. |
| Identical replay decision for a representative replay vector | PARTIAL | Conformance pack includes consumed nonce and resurrection-attempt replay checks; runtime lineage tracks consumed nonces. | Populate evidence from two repositories showing the same representative replay vector produces the same replay decision without consuming or restoring runtime state. |
| Identical Merge Guard or conformance proof hash for the same fixture | PARTIAL | Merge Guard action has copyable self-contained canonicalization and deterministic fixture tests; action output includes `proof_hash`; conformance vectors contain expected hashes. | Populate evidence from two repositories showing the same fixture produces the same Merge Guard `proof_hash` or conformance proof/evidence hash. |
| Identical proof generation/projection beyond deterministic proof/evidence hash | NOT APPLICABLE | Proof CLI is observability-only; conformance evidence is sufficient for #2238 when hash equivalence is shown. | Not required by #2238. |
| Identical execution outcomes | NOT APPLICABLE | Portability demos show internal VALID / replay-NULL / policy-NULL behavior, but #2238 closure is deterministic evidence equivalence, not production usage. | Not required by #2238 unless the issue is explicitly revised. |
| Deterministic portability bundles | NOT APPLICABLE | Demo portability docs and conformance pack provide copyable paths, but bundle adoption is not a #2238 closure condition. | Not required by #2238; keep portability/adoption expansion outside this issue. |
| Federation boundary behavior beyond deterministic validation classification | NOT APPLICABLE | Federation suite descriptors state that remote authority claims are quarantined and local validation remains required. | Not required by #2238 beyond deterministic `VALID`/`NULL` evidence from evaluated checks. |
| External repository adoption, dependency formation, independent maintainer proof, trust-building, or real-world usage | NOT APPLICABLE | These are dependency/adoption concerns, not determinism measurements. | Belongs to Issue #2145, not #2238. |

### Cross-repository audit conclusion

Cross-repository determinism is not missing as a mechanism; it is missing as populated two-repository deterministic evidence. The issue has been reduced to a bounded verification problem. Repository ownership is irrelevant; equivalence of deterministic outputs is the measurement.

---

## 3. Remaining implementation gaps

Only the following gaps are truly missing for #2238:

1. **Two-repository evidence population gap** — No repository-local artifact records two repositories executing the same deterministic artifacts and producing equivalent deterministic evidence.
2. **Evidence population gap, not matrix creation gap** — This document already contains an Internal Determinism Matrix and a Cross-Repository Determinism Matrix. The remaining gap is population of external evidence, not creation of another matrix.
3. **Candidate closure criteria gap** — Closure criteria need to distinguish internal determinism completion from deterministic cross-repository evidence equivalence, while excluding adoption, dependency formation, trust-building, independent maintainer proof, and real-world usage.

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
2. Execute the same deterministic vector/fixture set in this repository and one second repository, regardless of repository ownership.
3. Record the minimum deterministic evidence from both repositories:
   - identical canonical hashes for the same deterministic vectors
   - identical `VALID`/`NULL` validation classifications
   - identical replay decision for one representative replay vector
   - identical Merge Guard or conformance proof hash for the same fixture
4. Mark execution outcomes, portability bundles, federation behavior, adoption signals, and dependency formation as `NOT APPLICABLE` unless #2238 explicitly requires them.
5. Add the two-repository deterministic evidence artifact under `evidence/` or `docs/audits/` without modifying runtime behavior.
6. Re-run `npm run conformance`, `node actions/continuity-merge-guard/test.mjs`, and `git diff --check`.

---

## 5. Candidate closure criteria

#2238 can close when all of the following are true:

- Internal determinism remains accurately classified: canonical identity and deterministic hashing COMPLETE; lineage-gated/runtime replay COMPLETE; default receipt-only CLI exact-object/replay paths PARTIAL unless strengthened by re-hashing/lineage evidence; declared-but-unevaluated portability/federation conformance semantics are not counted as enforced evidence.
- Two repositories independently execute the same deterministic artifacts and produce equivalent deterministic evidence; repository ownership is irrelevant.
- The two-repository evidence contains identical canonical hashes for the same deterministic vectors.
- The two-repository evidence contains identical `VALID`/`NULL` validation classifications.
- The two-repository evidence contains an identical replay decision for a representative replay vector.
- The two-repository evidence contains an identical Merge Guard or conformance proof hash for the same fixture.
- Execution outcomes, portability bundles, federation behavior, adoption signals, dependency formation, trust-building, independent maintainer proof, and real-world usage remain `NOT APPLICABLE` for #2238 unless a future issue revision explicitly adds them.
- Remote evidence remains non-authoritative; no closure evidence claims distributed finality, portable authority, or local execution legitimacy without local validation.

---

## 6. Final recommendation

**IMPLEMENT THEN CLOSE**

Interpretation: do not implement new runtime determinism. Populate only the minimum two-repository deterministic evidence needed to prove already-implemented deterministic behavior across repository boundaries, then close #2238.

If two-repository deterministic evidence cannot be produced yet, keep #2238 open as a bounded cross-repository verification issue. Do not expand #2238 into Issue #2145 dependency formation, adoption, independent maintainer, trust-building, or real-world usage work.
