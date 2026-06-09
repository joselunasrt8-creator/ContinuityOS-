# Runtime Closure Audit — Agent Tool Execution

**Audit date:** 2026-06-08
**Branch:** `claude/agent-tool-execution-audit-XyLpy`
**Prior state:** Agent Tool Execution — TEST-LEVEL CLOSED
**Question audited:** Is there any non-test runtime gap blocking surface closure?
**Scope:** ATAO capture · AEO compile · validate · execute boundary · proof (Agent Tool Execution surface only)
**Determination:** `GAP_OPEN` — runtime enforcement absent. The proven chain is a self-reported evidence ledger; nothing in the runtime forces a real agent tool action through it.

---

## 1. What "test-level closed" actually verifies

The closure tests (`tests/issue-1624-agent-tool-call-atao-capture.test.mjs`, `tests/issue-540-atao-boundary.test.mjs`, `tests/issue-ungoverned-agent-tool-call-closure.test.mjs`, `tests/issue-1627-*`, `tests/issue-1773-*`, `tests/issue-1848-*`, `tests/issue-1866-*`) prove that **once every registry row already exists**, `/agent/tool-call` (`handleAgentToolInvocationBoundary`, `src/index.ts:268-408`) correctly:

- requires, in order: ATAO row (`status='CAPTURED'`), active session, active continuity, usable authority, hash-verified compiled AEO (`status='COMPILED'`), AEO-template selection, `VALID` validation row, `EXECUTED` execution row, and a matching proof row;
- fails closed with a specific `reason` (e.g. `atao_missing`, `validation_missing`, `proof_missing`, `compiled_aeo_hash_mismatch`, `validated_object_execution_mismatch`, `agent_tool_invocation_replay`) on any gap, mismatch, expiry, or replay; and
- enforces single-use replay protection via `UNIQUE(atao_hash, decision_id, validated_object_hash, invocation_nonce)` on `agent_tool_invocation_registry` (`src/index.ts:262`).

This is exactly what `tests/issue-ungoverned-agent-tool-call-closure.test.mjs` exercises: it pre-seeds a mock D1 with a complete row in every registry and proves the boundary will only return `PROVEN` when the chain is intact, and `NULL` with the correct reason when any link is missing or forged. That is the "proven test loop," and it is sound for what it tests.

## 2. The runtime gap: nothing makes the chain mandatory before a real tool action runs

Tracing the live runtime wiring — as opposed to the verification routes the tests target — shows that **none of the agent-tool routes execute a tool, and nothing forces a real agent tool action (filesystem write, shell command, GitHub mutation, HTTP call, deploy, etc.) through this chain before it happens**:

- `interceptToolCall` (`src/lib/agent-tool-gateway.ts:836-873`) is explicitly `non_operative`. Its own header comment (lines 1-12) states the module "owns observation artifact formation and CIP proposal formation **only**" and stops at `GovernanceProposal`. It records that a tool call was *observed*; it never gates whether the call *happens*.
- `/gateway/tool/intercept` (`src/index.ts:421-466`, `handleAgentToolGatewayIntercept`) is a passive HTTP endpoint an external caller *may* choose to POST to. There is no LangChain callback handler, tool wrapper, proxy, or middleware anywhere in the repository that forces a real tool invocation to pass through it first — a repo-wide search for interception/callback/middleware/wrapper machinery returns no operative matches outside this same library and its docstrings.
- `/agent/tool-call` (`src/index.ts:268-408`) is a **post-hoc verification endpoint**: it only checks that rows describing `PROVEN`/`EXECUTED`/`VALID`/`COMPILED` already exist and are mutually consistent. Calling it changes nothing in the outside world; *not* calling it stops nothing either.
- `/execute` (`src/index.ts:8690-8799`) writes a database row with `status='EXECUTED'` (`INSERT INTO execution_registry … VALUES (…, 'EXECUTED', …)`, lines 8787-8788) and updates lineage rows. No code path anywhere in `src/index.ts` performs an actual filesystem write, shell command, GitHub mutation, deploy, or HTTP call as a *consequence* of any of these routes.

In short: the entire ATAO→AEO→validate→execute→proof chain, as wired into the runtime, is a **self-reported evidentiary ledger**. Whoever holds the API key can write a fully-consistent `PROVEN`/`EXECUTED`/`VALID` chain describing an action that never happened — or simply perform the real-world action directly and never touch any of these routes — and the runtime cannot distinguish either case from a legitimately governed execution.

## 3. The gap is named in the spec, not hidden — and remains open

`docs/phase-3-agent-gateway/PHASE_3A_AGENT_GATEWAY_SPECIFICATION.md:87` states directly: *"`validator_bound` and `proof_generating` reflect current enforcement state: both are `false` because no OpenClaw adapter or gateway enforcement exists at classification time."* Every mutation-capable agent-tool surface in that spec's inventory — `oc-fs-write` (filesystem write), `oc-shell` (shell/exec), `oc-browser`, `oc-cron`, `oc-proc` (process control), `oc-node-rt` (node runtime), `oc-net-api` (network/API), `oc-behavioral`, `oc-session` (session spawn) — is classified `closure_state: OPEN` with the explicit annotation `"No enforcement exists"` (lines 92-101).

That same gap is structurally visible in the library code: `src/lib/filesystem-write-gateway.ts` (a complete `captureFilesystemWriteATAO → compileFilesystemWriteAEO → validateFilesystemAEO → executeFilesystemWrite` chain), `src/lib/github-issue-comment-gateway.ts`, `src/lib/filesystem-aeo-validator.ts`, `src/lib/cloudflare-adapter.ts`, and `src/lib/d1-storage-adapter.ts` are fully implemented, fail-closed, and independently unit-tested — but **none of them is imported or invoked from `src/index.ts`** (verified by a repo-wide search for their exported symbols: zero non-test references outside the library files that define them). They are wired to nothing. There is no dispatcher, no adapter table, no route connecting "an agent wants to write a file / comment on an issue / call the Cloudflare API" to its corresponding capture→compile→validate→execute→proof chain.

## 4. Secondary finding: two parallel, non-converging ATAO pipelines

Two structurally distinct ATAO-capture mechanisms exist in the live runtime and feed two different registries:

| Pipeline | Entry → formation | Registry | Consumed by |
|---|---|---|---|
| A | `/govern` → `captureAgentToolCallATAO` (`src/index.ts:183-193`) | `agent_tool_call_atao_registry` | `/agent/tool-call` ATAO check (`src/index.ts:319`) |
| B | `/gateway/tool/intercept` → `/gateway/authority/review` (APPROVED → `atao_status='FORMED'`, `src/index.ts:555-558`) | `agent_tool_atao_registry` | `/gateway/tool/compile` (`src/index.ts:706`) |

Both pipelines can independently produce rows in the shared `aeo_registry` with `status='COMPILED'` (Pipeline A via `/compile`, Pipeline B via `/gateway/tool/compile`, `src/index.ts:758`), and `/agent/tool-call` matches its compiled-AEO check generically by `decision_id`/`authority_id`/`continuity_id`/`validated_object_hash` (`src/index.ts:332`) — it does not check *which* pipeline produced the compiled AEO, and it does not require Pipeline B's `agent_tool_atao_registry`/review lineage to exist at all. Pipeline A's own ATAO check still gates `/agent/tool-call` (so this is not, on its own, a proven exploitable bypass), but it is duplicated, partially-overlapping machinery whose union has never been exercised or tested as a single closed surface — exactly the kind of topology-coherence drift that widens an audit surface rather than closing it.

## 5. Determination

**`GAP_OPEN` — runtime enforcement absent.**

The test-level proof is sound for what it tests: the verification boundary fails closed against incomplete or forged evidence chains. But "Agent Tool Execution" closure requires more than a boundary that *can* prove a chain existed after the fact — it requires that **no real tool execution can occur without that chain existing first**. No such enforcement exists:

- **GAP-RT-1 (critical):** No interception/middleware mechanism forces real agent tool calls (filesystem, shell, GitHub, HTTP, deploy, etc.) through `/gateway/tool/intercept → … → /agent/tool-call` before they execute. The chain is opt-in; an agent (or anything holding the API key) can skip it entirely.
- **GAP-RT-2 (critical):** No execution adapter is wired to a compiled/validated AEO. `/execute` only writes a ledger row; the filesystem-write, GitHub-comment, Cloudflare, and D1 capture/compile/validate/execute chains are fully implemented and tested in isolation but never invoked from the runtime. There is no live path from "AEO is VALID" to "the tool action actually happens" — which also means there is no live path that *requires* VALID before the action happens. This matches, verbatim, the `OPEN` / `"No enforcement exists"` classification already recorded in `PHASE_3A_AGENT_GATEWAY_SPECIFICATION.md`.
- **GAP-RT-3 (moderate):** Two non-converging ATAO pipelines (`agent_tool_call_atao_registry` vs. `agent_tool_atao_registry`) exist, both feeding the shared `aeo_registry`/`/agent/tool-call` surface; their interaction has not been tested as a unified boundary.

## 6. What would close this

1. **Real interception**: a LangChain callback handler / tool wrapper / proxy that makes the gateway chain (`intercept → propose → authority-review → ATAO → compile → validate → execute → proof`) a hard prerequisite to performing the actual side effect — i.e., the agent's tool executor itself refuses to run the action unless it holds a `PROVEN` result from `/agent/tool-call` (or equivalent) bound to the *exact* action about to be performed (same hash, same scope, same nonce).
2. **At least one wired adapter**: connect `/execute` (or a dedicated execution-boundary route) to a real executor — e.g. `filesystem-write-gateway.ts`'s `executeFilesystemWrite` — so a `'EXECUTED'` ledger row corresponds to an actual side effect gated on a `VALID` Ω-validator outcome, closing the gap the spec already names as `OPEN`.
3. **Pipeline convergence**: either merge the two ATAO pipelines into one, or add an explicit cross-check in `/agent/tool-call` that the compiled AEO it accepts originated from the same ATAO lineage it is validating against.

---

## Evidence index

- `src/index.ts:268-408` — `handleAgentToolInvocationBoundary` (verification-only boundary; no execution side effect)
- `src/index.ts:421-466` — `handleAgentToolGatewayIntercept` (forms observation/proposal only; explicitly non-operative)
- `src/index.ts:590-610`, `515-588` — gateway ATAO formation via authority review (`agent_tool_atao_registry`, Pipeline B)
- `src/index.ts:183-193` — `captureAgentToolCallATAO` (`agent_tool_call_atao_registry`, Pipeline A, fed from `/govern`)
- `src/index.ts:696-763` — `handleAgentToolGatewayCompile` (Pipeline B compile path into shared `aeo_registry`)
- `src/index.ts:8690-8799` — `/execute` (ledger-row write only, no side effect; `INSERT … VALUES (…, 'EXECUTED', …)`)
- `src/lib/agent-tool-gateway.ts:1-12` — module-boundary comment declaring the gateway's non-operative scope
- `docs/phase-3-agent-gateway/PHASE_3A_AGENT_GATEWAY_SPECIFICATION.md:87-101` — `OPEN` / `"No enforcement exists"` classification of every agent-tool execution surface (filesystem write, shell, browser, cron, process control, node runtime, network API, behavioral files, session spawn)
- `src/lib/filesystem-write-gateway.ts`, `src/lib/github-issue-comment-gateway.ts`, `src/lib/filesystem-aeo-validator.ts`, `src/lib/cloudflare-adapter.ts`, `src/lib/d1-storage-adapter.ts` — complete, tested, unwired capture/compile/validate/execute libraries (zero non-test references from `src/index.ts`)
- `tests/issue-ungoverned-agent-tool-call-closure.test.mjs` — representative closure test: pre-seeds every registry row in a mock D1 and proves the verification boundary fails closed on any missing/forged link (does not exercise a live execution path)
