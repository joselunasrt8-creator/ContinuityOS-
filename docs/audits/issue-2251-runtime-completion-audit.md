# Issue #2251 Runtime Completion Audit

**Mode:** MODE B — topology / planning only.  
**Reason:** the requested Issue #2251 scope spans authority lifecycle, ATAO/AEO generation, validation, replay, policy, execution, proof, registries, merge workflow, APIs, schemas, tests, and documentation. The repository does not contain the Issue #2251 body or an acceptance-criteria list. Therefore this audit treats repository implementation as evidence and marks issue-specific acceptance criteria that cannot be traced as **INSUFFICIENT EVIDENCE** rather than inventing requirements.

## Intent

Complete a bounded evidence pass for ContinuityOS runtime completion without changing execution semantics.

## Exact scope

This audit covers existing repository evidence for:

- canonical runtime flow: `/session -> /continuity -> /authority -> /compile -> /validate -> /execute -> /proof`
- authority lifecycle and delegated authority fields
- ATAO and AEO generation surfaces
- canonical AEO validation
- replay protection and nonce consumption
- policy / projection / govern-envelope gates
- execution boundary exact-object discipline
- proof persistence
- registry append-only / uniqueness constraints
- canonical serialization and deterministic hashing
- audit / telemetry surfaces
- webhook / agent-tool support surfaces
- merge-governance workflows
- conformance and regression coverage

## Affected files

This planning slice adds only this audit document. It intentionally does **not** modify runtime code, migrations, validators, workflows, or tests.

## Preserved invariants

- `validated_object_hash == executed_object_hash` remains untouched.
- Replay state is not altered.
- Canonical serialization and hashing code are not altered.
- Runtime route acceptance semantics are not altered.
- Proof persistence semantics are not altered.
- Registry schemas and migrations are not altered.
- Merge-governance workflows are not altered.

## Mutation-capable surfaces identified

Repository evidence identifies the normal mutation-capable runtime route chain as `/session`, `/continuity`, `/authority`, `/compile`, `/validate`, `/execute`, and `/proof`. The runtime inventory also identifies governed support routes such as `/gateway/tool/intercept`, `/gateway/tool/propose`, `/gateway/authority/review`, and `/gateway/tool/compile`, and distinguishes their support-surface semantics from execution capability.

## Replay implications

No replay state is mutated by this audit. The code evidence shows replay is represented by invocation nonces, invocation/execution registries, replay registry ports, and duplicate execution checks. Remaining Issue #2251-specific replay work is **INSUFFICIENT EVIDENCE** unless mapped to a concrete test or failing criterion.

## Proof requirements

Because this is an audit-only planning slice, proof artifacts are repository evidence, tests, and this committed document. No runtime proof envelope is generated.

## Validation requirements

The minimum validation for this slice is:

1. repository status confirms only this document changed;
2. targeted test for the exact-object AEO contract still passes;
3. conformance runner still passes or reports known pre-existing failures.

## Unresolved ambiguity

The Issue #2251 acceptance criteria are not present in the repository and `gh` is unavailable in the container. This audit cannot assert issue closure. It can only classify repository-evidenced subsystem status.

---

## Runtime subsystem audit

| Subsystem | Status | Evidence | Conclusion | Remaining work |
|---|---:|---|---|---|
| Authority lifecycle | PARTIAL | `src/index.ts` has `/authority` route and authority registry columns; `/execute` checks authority/session/continuity and transitions authority to `EXECUTED`. Migrations include delegated authority columns. | Core lifecycle exists, but Issue #2251-specific lifecycle criteria are not locally available. | Trace each Issue #2251 authority criterion to route checks and tests once criteria are available. |
| ATAO generation | PARTIAL | Filesystem gateway captures ATAO before AEO compile; agent-tool gateway review can create ATAO support objects. | ATAO exists for governed filesystem/agent-tool paths, not proven exhaustive for every runtime object family. | Add criteria-specific tests only if Issue #2251 identifies unsupported ATAO families. |
| AEO generation | COMPLETE for canonical filesystem path; PARTIAL globally | `compileCanonicalAEOFromFilesystem` is the canonical filesystem projection; `/compile` persists canonical AEO hashes; template registries exist. | Canonical filesystem AEO generation is implemented. Global template/runtime completeness cannot be asserted without issue criteria. | Avoid new AEO compiler; extend existing compiler only for failing criteria. |
| Validator | COMPLETE for canonical AEO contract; PARTIAL for all policy domains | `validateAeo` enforces exact five-section shape, section authority binding, scope containment, and `validation.object_hash`. Filesystem validator runs after canonical validation in the gateway. | Core exact-object validator exists. Policy-domain coverage must be assessed per failing vector. | Generate missing vectors only for uncovered policy branches. |
| Replay engine | PARTIAL | `/validate` reserves invocation nonce; `/execute` requires reserved invocation and blocks duplicate execution; filesystem gateway checks and consumes nonce through `ReplayRegistryPort`. | Replay protection exists in normal routes and gateway. Cross-registry and distributed replay are represented, but issue-specific closure cannot be proven. | Add replay regression for each discovered bypass path; do not add parallel replay registry. |
| Policy engine | PARTIAL | `/compile`, `/validate`, and `/execute` compute/compare govern projections and gate govern-envelope lineage where required; governance policies exist under `governance/runtime`. | Policy enforcement exists but is distributed across route and governance artifacts. | Build a criteria-to-policy matrix before mutating. |
| Execution boundary | COMPLETE for canonical route and filesystem gateway; PARTIAL globally | `/execute` recomputes canonical AEO hash from persisted `canonical_aeo` and rejects mismatches; filesystem execution adapter receives the canonical hash and recomputes exact-object boundary. | Exact-object execution boundary is implemented for evidenced paths. | Add no new execution path; only tighten existing boundary if a failing test shows bypass. |
| Proof generation | PARTIAL | `/proof` requires execution id, decision id, validated hash, invocation nonce, validation lineage, and proof persistence. Filesystem gateway proof receipt asserts validated/executed hash equality. | Proof generation exists, but global proof-registry integrity has known backlog/audit artifacts. | Reconcile against `PROOF_REGISTRY_BACKLOG_AUDIT.md` before code changes. |
| Registry | PARTIAL | Runtime registry column maps exist; migrations include append-only triggers and uniqueness constraints for many registries. | Registry infrastructure is broad, but not all registries can be proven semantically closed from this audit alone. | Prioritize registries on execution/proof/replay path. |
| Hashing | COMPLETE | `src/canonical.js` implements deterministic normalization, canonical serialization, and SHA-256 hex hashing. | Core hashing primitive exists and is reused. | Add only regression vectors if Issue #2251 exposes edge cases. |
| Canonical serialization | COMPLETE | `canonicalize` sorts object keys, normalizes undefined/non-finite values to null, and recursively serializes arrays/objects. | Deterministic serialization primitive exists. | Do not fork; all new code must use existing canonicalizer. |
| Audit trail | PARTIAL | Telemetry event types include validation, replay, hash mismatch, authority consumed, proof persisted; install-base telemetry is evidence-only. Runtime audit registries exist. | Audit evidence exists, but completeness against every failure path requires criteria mapping. | Add tests for missing telemetry on concrete failing routes only. |
| Webhook processing | INSUFFICIENT EVIDENCE | GitHub issue-comment gateway and workflows exist, but Issue #2251 webhook requirements are not in repository. | Cannot classify beyond existence. | Locate exact webhook acceptance criteria before implementation. |
| Merge workflow | COMPLETE for repository-governance evidence; PARTIAL relative to Issue #2251 | Merge governance workflows enforce append-only authorization/proof registries and standing-authority derivation rules. | Merge workflow is heavily implemented, but Issue #2251 may not target merge governance. | No changes without failing merge-governance tests. |
| Runtime APIs | PARTIAL | Main canonical route chain exists; support and observability routes exist and are inventoried. | APIs exist, but issue-specific remaining API behavior is unavailable. | Map criteria to each route before mutation. |

---

## Acceptance validation matrix

Because the Issue #2251 body is unavailable locally, the acceptance criteria below are derived only from the user-provided subsystem list and repository evidence.

| Acceptance area | Status | Evidence | Runtime path / tests | Remaining work |
|---|---:|---|---|---|
| `validated_object == executed_object` | COMPLETE for normal `/execute` and filesystem gateway | `/execute` recomputes hash from persisted canonical AEO and rejects validation/execution mismatch; filesystem gateway proof states validated/executed hash equality. | `/compile -> /validate -> /execute -> /proof`; `tests/issue-1928-validate-aeo-contract.test.mjs`. | Add negative integration test only if uncovered route bypasses `/execute`. |
| Replay-safe execution | PARTIAL | Invocation nonce reservation and duplicate execution checks exist; gateway uses replay port. | `/validate`, `/execute`, filesystem gateway; conformance replay vectors. | Need end-to-end duplicate nonce route test if not already covered by existing FATE suite. |
| Canonical serialization | COMPLETE | `src/canonical.js`. | conformance canonicalization fixtures. | None unless new edge vector fails. |
| Deterministic hashing | COMPLETE | `sha256Hex(canonicalize(...))` reused by validator and route checks. | validator/conformance tests. | None unless vector missing. |
| Policy enforcement | PARTIAL | Govern projection hash checks and govern-envelope lineage gates exist. | `/compile`, `/validate`, `/execute`, `/proof`. | Criteria-specific policy coverage matrix needed. |
| Proof generation | PARTIAL | `/proof` gates execution/validation lineage and persists proof evidence. | `/proof`; proof fixtures. | Reconcile proof registry backlog before claiming complete. |
| Registry consistency | PARTIAL | Migration triggers/unique indexes, registry column map, append-only tests. | migrations, conformance append-only suite. | Audit each load-bearing registry on route chain. |
| Execution boundary integrity | COMPLETE for evidenced paths | `/execute` and filesystem gateway exact-object recomputation. | `/execute`; filesystem gateway tests. | No parallel execution implementation. |
| Audit integrity | PARTIAL | Telemetry/audit registries present. | route telemetry, install-base telemetry registry. | Missing failure-path coverage likely; add only after mapping. |
| State transitions | PARTIAL | Authority and invocation statuses transition through route chain. | `/authority`, `/validate`, `/execute`. | Need route-level transition matrix test if absent. |
| No bypass paths | PARTIAL | Bypass inventories and residual exploitability report exist. | `runtime/unauthorized_mutation_surface_inventory.json`, `runtime/residual_exploitability_report.json`. | Remaining external root-authority risks require operational controls, not runtime redesign. |
| No duplicate runtime implementations | PARTIAL | Canonical primitives exist, but repo contains JS, TS, CLI, demo, and Rust-compatible surfaces. | `src/continuity-core.js`, `continuity-core/`, CLI commands. | Produce duplicate-implementation map before refactor; do not delete without tests. |

---

## Dependency graph

Topological dependency chain for runtime completion:

1. Canonical serialization / hashing (`canonicalize`, `sha256Hex`).
2. Authority and continuity lineage state.
3. ATAO capture / support evidence.
4. AEO compilation to canonical AEO.
5. Canonical AEO validation and policy projection checks.
6. Replay reservation (`invocation_registry` / replay port).
7. Execution boundary exact-object recomputation.
8. Replay consumption / duplicate execution lock.
9. Proof generation and proof registry persistence.
10. Audit / telemetry emission.
11. Cross-registry reconciliation and conformance reporting.
12. Merge workflow proof/authorization ledgers.

Any implementation queue must follow this order; later layers must not create authority, replay eligibility, or proof acceptance for earlier layers.

---

## Remaining implementation queue (topologically sorted)

This queue is intentionally concrete but not speculative. Each item requires a failing test, explicit criterion, or evidence gap before mutation.

1. Recover Issue #2251 body and freeze an acceptance-criteria table in `docs/audits/`.
2. Map each criterion to existing files, route, migration, fixture, and test.
3. Mark criteria already closed by existing tests; do not touch those paths.
4. For each PARTIAL criterion, add the smallest failing regression/conformance vector first.
5. If a failing vector exposes a replay bypass, patch the existing replay reservation/consumption path only.
6. If a failing vector exposes exact-object drift, patch the existing canonical AEO compiler/validator/boundary only.
7. If a failing vector exposes proof mismatch, patch the existing `/proof` lineage/proof registry path only.
8. If a failing vector exposes registry inconsistency, patch the existing migration/trigger/index only.
9. If a failing vector exposes support-route authority widening, patch the existing support route classification/gate only.
10. Update documentation after behavior is validated.

---

## Missing tests to generate only after criteria mapping

- End-to-end route replay duplicate test for `/validate -> /execute` if no existing test covers duplicate `invocation_nonce` with identical `decision_id` and `validated_object_hash`.
- Negative exact-object route test where persisted `canonical_aeo` is mutated after validation and before execution, if not already covered.
- Proof rejection test for mismatched `validated_object_hash` and execution lineage, if not already covered.
- Registry append-only mutation test for any load-bearing registry not covered by conformance append-only suite.
- Support-surface non-execution test for `/gateway/tool/compile` and `/gateway/authority/review`, if not already covered.
- Audit telemetry failure-path tests for replay rejection, hash mismatch, expired authority, and proof rejection if gaps remain.

Do not duplicate tests already present under `tests/`, `tests/fate/`, `conformance/`, or `conformance/pack-v1/`.

---

## Missing documentation

- Issue #2251 acceptance-criteria traceability document with criterion IDs.
- Runtime route state-transition matrix tying `/session -> /proof` to registry state changes.
- Duplicate implementation map distinguishing canonical runtime code from CLI/demo/reference implementations.
- Proof-registry backlog reconciliation against current `/proof` behavior.
- Webhook processing acceptance map, if Issue #2251 contains webhook criteria.

---

## Runtime risk assessment

| Risk | Severity | Evidence | Mitigation |
|---|---:|---|---|
| Unknown Issue #2251 criteria | HIGH | Issue body absent locally. | Fetch issue body before claiming completion. |
| Replay bypass through non-canonical route | HIGH | Multiple support and workflow surfaces exist. | Keep support surfaces non-execution; test duplicate nonce at route boundary. |
| Exact-object drift after validation | HIGH | Runtime stores canonical AEO and recomputes at execution; drift must remain blocked. | Add/retain mutation-after-validation regression. |
| Proof registry inconsistency | MEDIUM/HIGH | Proof backlog audit exists. | Reconcile proof registry before proof-complete claim. |
| Duplicate implementation drift | MEDIUM | CLI/demo/core/runtime surfaces coexist. | Make canonical owner map before refactor. |
| External root-authority bypass | HIGH operational | Residual exploitability report identifies raw D1/deploy credential risks. | Operational controls; no runtime redesign in this issue. |

---

## Superseded work

- Broad architectural redesign is superseded by the frozen route-chain architecture.
- New replay engine is superseded by invocation registry, execution duplicate checks, and `ReplayRegistryPort`.
- New canonical serialization implementation is superseded by `src/canonical.js`.
- New canonical AEO validator is superseded by `src/continuity-core.js` and conformance fixtures.
- New proof framework is superseded by `/proof` route and proof registry lineage.

---

## Duplicate implementations to inspect before mutation

Potentially overlapping surfaces that must not be forked further:

- `src/continuity-core.js` and `continuity-core/` Rust-compatible core.
- `src/canonical.js`, `cli/lib/canonical.mjs`, and other local canonical helpers.
- Runtime route implementation in `src/index.ts` and CLI command simulations under `cli/commands/`.
- Filesystem gateway/runtime adapter path and demo portability path.
- Governance workflow proof/authorization ledgers and runtime proof registry.

Classification requires source-level comparison before any deletion or consolidation.

---

## Recommended implementation order

1. Criteria recovery and traceability table.
2. Existing-test coverage map.
3. Replay duplicate route regression.
4. Exact-object drift regression.
5. Proof lineage mismatch regression.
6. Registry append-only / uniqueness regression for load-bearing tables.
7. Minimal code patches only where those tests fail.
8. Documentation update and risk reconciliation.

## Current closure statement

Issue #2251 cannot be closed from repository evidence alone. The runtime contains substantial implementations for the frozen architecture, but the issue-specific remaining criteria are **INSUFFICIENT EVIDENCE** until the acceptance criteria are recovered and mapped to tests.
