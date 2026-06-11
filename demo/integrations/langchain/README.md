# LangChain integration: governed filesystem write tool

This is the reference integration for issue #1954 (Agent Runtime Integration
Through ContinuityOS Gateway). It connects [LangChain](https://www.langchain.com/)'s
tool-calling interface (`@langchain/core`) to the existing governed filesystem-write
gateway (`POST /gateway/tool/filesystem-write`) — the same route used by
[`demo/portability/filesystem-governed-execution.mjs`](../../portability/filesystem-governed-execution.mjs).

```text
LangChain agent / tool.invoke()
  -> governed_filesystem_write tool (governed-filesystem-tool.mjs)
  -> POST /gateway/tool/filesystem-write
  -> ATAO -> AEO -> Validator -> Execution Boundary -> Proof
  -> VALID (EXECUTED + proof receipt) | NULL (bounded, no execution, no proof)
```

## Files

- `governed-filesystem-tool.mjs` — `createGovernedFilesystemWriteTool(...)`, a
  `DynamicStructuredTool` (from `@langchain/core/tools`) whose `func` does
  nothing but POST to the governed gateway and return the response.
- `governed-agent-demo.mjs` — runnable demo that calls `tool.invoke(...)` for a
  VALID write, a replayed nonce (NULL), and a denied path (NULL).

## No direct mutation bypass

The tool has **no filesystem-write code of its own**. Its entire `func`
implementation is:

```js
const response = await postJson(worker, env, {
  agent_id: agentId, session_id: sessionId, intent, path, content, replay_nonce,
})
return JSON.stringify(response)
```

Every write the tool can possibly cause is a `POST /gateway/tool/filesystem-write`
call, which goes through `runFilesystemWriteGatewayAction` (ATAO -> AEO ->
Ω validator -> execution boundary -> proof) exactly as it does for the
portability demo. The tool cannot write to disk, mutate state, or emit a
proof on its own.

## Run

```bash
npm install
npm run demo:langchain
```

This runs the worker in-process (bundled via esbuild, same as the
portability demo) with an in-memory D1-compatible adapter — no Cloudflare
credentials or LLM API key required. `tool.invoke(...)` is exactly how a
LangChain `AgentExecutor` calls a tool once an LLM has selected it and
produced matching arguments; this demo calls it directly to keep the
example runnable without an LLM.

## What it proves

| Tool call | Result | Proof emitted | Lineage appended |
| --- | --- | --- | --- |
| Write to `governed/filesystem-write-gateway/seed.md` with a fresh nonce | `EXECUTED` | yes, `validated_object_hash == executed_object_hash` | yes |
| Same nonce reused | `NULL` (`REPLAY_NULL` / `REPLAY_NONCE_CONSUMED`) | no | no |
| Write to `wrangler.toml` (denied path) | `NULL` (`POLICY_NULL` / `PATH_NOT_ALLOWED`) | no | no |

As with the portability demo, the agent only ever sees the bounded NULL
shape (`{ result, execution_performed, proof_emitted, correlation_id }`);
`reason_class` / `stage` / `denial_reason` are operator-side audit detail
recoverable via `correlation_id`.

## Wiring this into a real LangChain agent

```js
import { createGovernedFilesystemWriteTool } from './governed-filesystem-tool.mjs'

const tool = createGovernedFilesystemWriteTool({ worker, env, agentId, sessionId })

// Pass `tool` into any LangChain agent/executor that accepts a tools array,
// e.g. createToolCallingAgent / AgentExecutor from `langchain`.
// The LLM selects the tool and produces { path, content, intent, replay_nonce }
// matching governedFilesystemWriteSchema; the executor calls tool.invoke(args)
// and the result above is returned to the agent as the tool observation.
```

`worker` and `env` come from `demo/lib/governed-worker-harness.mjs` for the
in-memory demo adapter, or from the deployed Worker route for a real
Cloudflare-backed gateway.
