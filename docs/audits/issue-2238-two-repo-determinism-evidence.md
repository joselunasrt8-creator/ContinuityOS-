# Issue #2238 — Two-Repository Determinism Evidence

## Intent

Produce the requested #2238 cross-repository determinism evidence using `ContinuityOS-` as the artifact destination, without redesigning either repository, widening governance semantics, or making adoption/dependency claims.

## Scope

- Primary repository: `joselunasrt8-creator/ContinuityOS-`
- Second repository requested: `joselunasrt8-creator/continuity-merge-guard`
- Artifact destination: `docs/audits/issue-2238-two-repo-determinism-evidence.md`
- Runtime architecture changes: none
- Merge Guard redesign: none
- New governance semantics: none
- #2238/#2145 boundary: preserved; this artifact records deterministic evidence only, not adoption, dependency formation, maintainer independence, or trust-building.

## Repository access and commit SHAs

| Repository | Access result | Commit SHA | Evidence boundary |
|---|---|---:|---|
| `joselunasrt8-creator/ContinuityOS-` | Local checkout available at `/workspace/ContinuityOS-` | `ee91659964bd419d2b811cb7f90ddcf39bbdfc7e` | Primary-repo commands and fixture evaluations were executed locally. |
| `joselunasrt8-creator/continuity-merge-guard` | BLOCKED: no local sibling checkout existed, `gh` was not installed, and direct GitHub HTTPS clone/ls-remote/archive access failed with `CONNECT tunnel failed, response 403`. | `UNAVAILABLE` | Required second-repo deterministic outputs could not be observed in this session. |

## Commands run

### ContinuityOS- primary repository

| Command | Result | Notes |
|---|---:|---|
| `git rev-parse HEAD` | PASS | Returned `ee91659964bd419d2b811cb7f90ddcf39bbdfc7e`. |
| `npm run conformance` | PASS | Emitted `CONFORMANCE_EVIDENCE_OBSERVED` and `STAGE2_CONFORMANCE_MATRIX_COMPLETE`. |
| `node actions/continuity-merge-guard/test.mjs` | PASS | 16 fixtures passed; emitted `MERGE_GUARD_CONFORMANCE_COMPLETE`. |
| `git diff --check` | PASS | No whitespace errors before this evidence file was written. |
| `node --input-type=module <<'EOF' ... evaluate fixtures ... EOF` | PASS | Produced primary-repo canonical hashes, classifications, duplicate hash behavior, and canonical proof output hashes listed below. |

### continuity-merge-guard second repository

| Command | Result | Notes |
|---|---:|---|
| `gh repo clone joselunasrt8-creator/continuity-merge-guard continuity-merge-guard` | BLOCKED | `gh: command not found`. |
| `git clone https://github.com/joselunasrt8-creator/continuity-merge-guard.git continuity-merge-guard` | BLOCKED | `CONNECT tunnel failed, response 403`. |
| `git ls-remote https://github.com/joselunasrt8-creator/continuity-merge-guard.git HEAD` | BLOCKED | `CONNECT tunnel failed, response 403`. |
| `curl -I -L https://github.com/joselunasrt8-creator/continuity-merge-guard/archive/refs/heads/main.zip` | BLOCKED | `CONNECT tunnel failed, response 403`. |
| `npm test` or canonical test command in second repo | NOT RUN | Blocked by inaccessible second repository. |
| Merge Guard fixture/conformance command in second repo | NOT RUN | Blocked by inaccessible second repository. |
| `git diff --check` in second repo | NOT RUN | Blocked by inaccessible second repository. |

## Fixture evidence observed in ContinuityOS-

The primary repository already contains `actions/continuity-merge-guard/fixtures/`. The smallest deterministic fixture set needed to exercise the required comparison dimensions was:

1. `hash-determinism.json` — VALID fixture with duplicate evaluation check.
2. `agent-authored-required-human-null.json` — NULL fixture with explicit policy mismatch.

No fixture format conversion was needed for the primary repository. No shared cross-repo fixture could be installed or executed in the second repository because the second repository could not be accessed.

### Primary-repo canonical evidence table

| Fixture ID | Canonical payload hash | VALID / NULL classification | Canonical proof output hash | Duplicate / replay behavior |
|---|---|---:|---|---|
| `hash-determinism.json` | `5f1d6caca6a0363fe2c561e2c028f4909d88915395a0b12bcb85a78c10fcdb6b` | `VALID` | `9b98e220fc2fb76d88c9496f048619e6bde275fd56c28cec6f6470045443601b` | `MATCH` within primary repo: evaluating the same input twice produced the same canonical hash. |
| `agent-authored-required-human-null.json` | `6fb08d146939f9c1ed3628b7da5e79489c66eb73d4188d7ac45e2eab53ec2150` | `NULL` | `de1ff58c232632c67a40cfcb88cd64cbe1fb0266704ea1e102c351d2101a73b1` | `MATCH` within primary repo: evaluating the same input twice produced the same canonical hash. |

### Canonical payload strings observed in ContinuityOS-

| Fixture ID | Canonical payload |
|---|---|
| `hash-determinism.json` | `{"actor":"some-contributor","author_kind":"unknown","base_sha":"0123456789abcdef0123456789abcdef01234567","head_sha":"a1b2c3d4e5f60718293a4b5c6d7e8f9012345678","pr_number":"1970","repo":"joselunasrt8-creator/mindshift-demo","require_agent_authored":"false"}` |
| `agent-authored-required-human-null.json` | `{"actor":"human-contributor","author_kind":"human","base_sha":"0123456789abcdef0123456789abcdef01234567","head_sha":"c1b2c3d4e5f60718293a4b5c6d7e8f9012345678","pr_number":"2001","repo":"joselunasrt8-creator/mindshift-demo","require_agent_authored":"true"}` |

## Required cross-repository comparison matrix

| Required comparison | ContinuityOS- observed value | continuity-merge-guard observed value | Match status | Mismatches / notes |
|---|---|---|---:|---|
| Same canonical hash for shared fixture/input: `hash-determinism.json` | `5f1d6caca6a0363fe2c561e2c028f4909d88915395a0b12bcb85a78c10fcdb6b` | `UNOBSERVED` | `BLOCKED` | Cannot claim equivalence because the second repository could not be cloned or executed. |
| Same canonical hash for shared fixture/input: `agent-authored-required-human-null.json` | `6fb08d146939f9c1ed3628b7da5e79489c66eb73d4188d7ac45e2eab53ec2150` | `UNOBSERVED` | `BLOCKED` | Cannot claim equivalence because the second repository could not be cloned or executed. |
| Same VALID / NULL classification: `hash-determinism.json` | `VALID` | `UNOBSERVED` | `BLOCKED` | Cannot claim classification equivalence without second-repo execution. |
| Same VALID / NULL classification: `agent-authored-required-human-null.json` | `NULL` | `UNOBSERVED` | `BLOCKED` | Cannot claim classification equivalence without second-repo execution. |
| Same Merge Guard proof hash / canonical proof output: `hash-determinism.json` | canonical proof output hash `9b98e220fc2fb76d88c9496f048619e6bde275fd56c28cec6f6470045443601b` | `UNOBSERVED` | `BLOCKED` | Cannot claim proof-output equivalence without second-repo execution. |
| Same Merge Guard proof hash / canonical proof output: `agent-authored-required-human-null.json` | canonical proof output hash `de1ff58c232632c67a40cfcb88cd64cbe1fb0266704ea1e102c351d2101a73b1` | `UNOBSERVED` | `BLOCKED` | Cannot claim proof-output equivalence without second-repo execution. |
| Replay or duplicate behavior | Primary duplicate evaluation produced identical canonical hashes for both fixtures. | `UNOBSERVED` | `BLOCKED` | Required status cannot be `MATCH`; second repo replay/duplicate semantics were inaccessible. `NOT APPLICABLE` also cannot be asserted because the second repo contents were not observable. |

## NOT APPLICABLE rows

| Item | Status | Reason |
|---|---:|---|
| Adoption/dependency evidence | `NOT APPLICABLE` | Belongs to #2145, not #2238. |
| Independent maintainer proof | `NOT APPLICABLE` | Belongs to #2145, not #2238. |
| Runtime architecture redesign | `NOT APPLICABLE` | Explicitly out of scope and not required for deterministic evidence. |
| New governance semantics | `NOT APPLICABLE` | Explicitly out of scope. |
| Production execution outcomes | `NOT APPLICABLE` | #2238 requires deterministic evidence equivalence, not production usage. |

## Mismatches

No deterministic mismatch was observed. However, absence of the second repository evidence is not a match. The cross-repository comparison is blocked at repository access, not failed by unequal hashes or classifications.

## Final determination

**BLOCKED**

#2238 is **not READY TO CLOSE** from this run. The primary repository produced deterministic canonical hashes, `VALID` / `NULL` classifications, proof-output hashes, and duplicate-evaluation stability. The required second-repository outputs were not observable because `continuity-merge-guard` could not be accessed in this session. Under the hard rule, this artifact does not claim readiness because it does not show equivalent deterministic outputs across both repositories.

## Remaining bounded reconciliation step

Run the same fixture evaluations in an environment with access to `joselunasrt8-creator/continuity-merge-guard`, then replace each `UNOBSERVED` second-repo value with the actual output and recompute the match status. Only mark #2238 `READY TO CLOSE` if the second-repo canonical hashes, classifications, and proof outputs are equivalent for the shared fixtures, and duplicate/replay behavior is `MATCH` or explicitly `NOT APPLICABLE` based on observed second-repo contents.
