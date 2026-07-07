# Issue #2238 — Two-Repository Determinism Evidence

## Intent

Produce actual #2238 cross-repository deterministic evidence between `joselunasrt8-creator/ContinuityOS-` and `joselunasrt8-creator/continuity-merge-guard`, using `ContinuityOS-` as the artifact destination and without changing runtime architecture, Merge Guard design, or governance semantics.

## Scope and invariants

- Primary repository: `joselunasrt8-creator/ContinuityOS-`
- Second repository: `joselunasrt8-creator/continuity-merge-guard`
- Artifact destination: `docs/audits/issue-2238-two-repo-determinism-evidence.md`
- Compared surface: Merge Guard canonical PR identity evaluation and proof output.
- Runtime architecture changes: none.
- Merge Guard redesign: none.
- New governance semantics: none.
- Adoption/dependency claims: none.
- #2238/#2145 boundary: preserved; this artifact records deterministic equivalence only, not adoption, independent maintainer proof, dependency formation, or trust-building.

## Repository SHAs

| Repository | Evidence location used for this run | Commit SHA |
|---|---|---:|
| `joselunasrt8-creator/ContinuityOS-` | `/workspace/ContinuityOS-` | `8236429865e793ac7913ef1ad2396f4cd06f8f26` |
| `joselunasrt8-creator/continuity-merge-guard` | `/workspace/continuity-merge-guard`; repository head observed as GitHub commit `63d24e0` | `63d24e0dbd2aa98f05ced80fb22add1bd81fb295` |

## Commands run

### ContinuityOS- primary repository

| Command | Result | Observed output |
|---|---:|---|
| `git rev-parse HEAD` | PASS | `8236429865e793ac7913ef1ad2396f4cd06f8f26` |
| `npm run conformance` | PASS | `CONFORMANCE_EVIDENCE_OBSERVED`; `STAGE2_CONFORMANCE_MATRIX_COMPLETE` |
| `node actions/continuity-merge-guard/test.mjs` | PASS | `Total: 16  |  PASS: 16  |  FAIL: 0`; `MERGE_GUARD_CONFORMANCE_COMPLETE` |
| `git diff --check` | PASS | no whitespace errors |
| `node --input-type=module <<'EOF' ... evaluate shared fixtures in both repos ... EOF` | PASS | produced the canonical hashes, classifications, proof-output hashes, and duplicate behavior below |

### continuity-merge-guard second repository

| Command | Result | Observed output |
|---|---:|---|
| `node test.mjs` | PASS | `Total: 2  |  PASS: 2  |  FAIL: 0`; `MERGE_GUARD_CONFORMANCE_COMPLETE` |
| `git diff --check` | PASS | no whitespace errors |

`continuity-merge-guard` does not include an `npm test` script in the compared action slice. The canonical test command present and run for the second repository was `node test.mjs`.

## Shared deterministic fixtures

The repositories carry the same Merge Guard evaluator shape but fixture payloads differ by repository-local names. To avoid redesigning either system, this run used the smallest shared deterministic inputs already present in `continuity-merge-guard` and evaluated those exact inputs through both repositories' Merge Guard evaluators:

| Fixture ID | Purpose | Input summary |
|---|---|---|
| `hash-determinism.json` | VALID canonical identity and duplicate determinism | `repo=owner/repo`, `pr_number=1970`, same fixed `head_sha`, same fixed `base_sha`, `actor=some-contributor`, default `author_kind=unknown`, default `require_agent_authored=false` |
| `agent-authored-required-human-null.json` | NULL policy mismatch classification and duplicate determinism | `repo=owner/repo`, `pr_number=1970`, same fixed `head_sha`, same fixed `base_sha`, `actor=some-human`, `author_kind=human`, `require_agent_authored=true` |

## Canonical outputs

| Fixture ID | Repo | Canonical payload hash | VALID / NULL classification | Canonical proof output hash | Duplicate result |
|---|---|---|---:|---|---:|
| `hash-determinism.json` | `ContinuityOS-` | `967e780533e505a244b8876a23b124045ed0a341af90840dacc343e3b3e01eff` | `VALID` | `eea4d3d7050564524f613b42d80943a434b508a5dc7e88ebd0b7102fdbc5e3c2` | `MATCH`: evaluating the same input twice produced the same canonical hash |
| `hash-determinism.json` | `continuity-merge-guard` | `967e780533e505a244b8876a23b124045ed0a341af90840dacc343e3b3e01eff` | `VALID` | `eea4d3d7050564524f613b42d80943a434b508a5dc7e88ebd0b7102fdbc5e3c2` | `MATCH`: evaluating the same input twice produced the same canonical hash |
| `agent-authored-required-human-null.json` | `ContinuityOS-` | `a74e686b4263fdca5ac2f71100f8cfa0783d735e776e98f0ad4bfc59c52f7e0d` | `NULL` | `330a6036254b54128c5d3976005a5e77318e35524a21ccbd9f85e28c4684b7e2` | `MATCH`: evaluating the same input twice produced the same canonical hash |
| `agent-authored-required-human-null.json` | `continuity-merge-guard` | `a74e686b4263fdca5ac2f71100f8cfa0783d735e776e98f0ad4bfc59c52f7e0d` | `NULL` | `330a6036254b54128c5d3976005a5e77318e35524a21ccbd9f85e28c4684b7e2` | `MATCH`: evaluating the same input twice produced the same canonical hash |

## Canonical payload strings

| Fixture ID | Canonical payload string |
|---|---|
| `hash-determinism.json` | `{"actor":"some-contributor","author_kind":"unknown","base_sha":"0123456789abcdef0123456789abcdef01234567","head_sha":"a1b2c3d4e5f60718293a4b5c6d7e8f9012345678","pr_number":"1970","repo":"owner/repo","require_agent_authored":"false"}` |
| `agent-authored-required-human-null.json` | `{"actor":"some-human","author_kind":"human","base_sha":"0123456789abcdef0123456789abcdef01234567","head_sha":"a1b2c3d4e5f60718293a4b5c6d7e8f9012345678","pr_number":"1970","repo":"owner/repo","require_agent_authored":"true"}` |

## Required comparison matrix

| Required comparison | Fixture ID | ContinuityOS- value | continuity-merge-guard value | Match status |
|---|---|---|---|---:|
| Same canonical hash for shared fixture/input | `hash-determinism.json` | `967e780533e505a244b8876a23b124045ed0a341af90840dacc343e3b3e01eff` | `967e780533e505a244b8876a23b124045ed0a341af90840dacc343e3b3e01eff` | `MATCH` |
| Same canonical hash for shared fixture/input | `agent-authored-required-human-null.json` | `a74e686b4263fdca5ac2f71100f8cfa0783d735e776e98f0ad4bfc59c52f7e0d` | `a74e686b4263fdca5ac2f71100f8cfa0783d735e776e98f0ad4bfc59c52f7e0d` | `MATCH` |
| Same VALID / NULL classification | `hash-determinism.json` | `VALID` | `VALID` | `MATCH` |
| Same VALID / NULL classification | `agent-authored-required-human-null.json` | `NULL` | `NULL` | `MATCH` |
| Same Merge Guard proof hash / canonical proof output | `hash-determinism.json` | `eea4d3d7050564524f613b42d80943a434b508a5dc7e88ebd0b7102fdbc5e3c2` | `eea4d3d7050564524f613b42d80943a434b508a5dc7e88ebd0b7102fdbc5e3c2` | `MATCH` |
| Same Merge Guard proof hash / canonical proof output | `agent-authored-required-human-null.json` | `330a6036254b54128c5d3976005a5e77318e35524a21ccbd9f85e28c4684b7e2` | `330a6036254b54128c5d3976005a5e77318e35524a21ccbd9f85e28c4684b7e2` | `MATCH` |
| Replay or duplicate behavior | both fixtures | duplicate evaluation produced identical canonical hashes | duplicate evaluation produced identical canonical hashes | `MATCH` |

## Mismatches

None observed for the shared deterministic fixture inputs. The canonical hashes, `VALID` / `NULL` classifications, canonical proof output hashes, and duplicate behavior matched across both repositories for both fixture IDs.

## NOT APPLICABLE rows

| Item | Status | Reason |
|---|---:|---|
| Runtime replay lineage | `NOT APPLICABLE` | `continuity-merge-guard` is a Merge Guard identity/proof action and has duplicate deterministic evaluation, not runtime replay lineage consumption. |
| Adoption/dependency evidence | `NOT APPLICABLE` | Belongs to #2145, not #2238. |
| Independent maintainer proof | `NOT APPLICABLE` | Belongs to #2145, not #2238. |
| Runtime architecture redesign | `NOT APPLICABLE` | Explicitly out of scope and not required for deterministic evidence. |
| New governance semantics | `NOT APPLICABLE` | Explicitly out of scope. |
| Production execution outcomes | `NOT APPLICABLE` | #2238 requires deterministic evidence equivalence, not production usage. |

## Final determination

**READY TO CLOSE**

The evidence above shows equivalent deterministic outputs across `joselunasrt8-creator/ContinuityOS-` and `joselunasrt8-creator/continuity-merge-guard` for the smallest shared Merge Guard fixture inputs: matching canonical hashes, matching `VALID` / `NULL` classifications, matching canonical proof output hashes, and matching duplicate deterministic behavior. This determination is limited to #2238 deterministic evidence and does not make any #2145 adoption, dependency, maintainer-independence, or trust-building claim.
