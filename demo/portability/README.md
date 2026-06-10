# Portability demo: governed filesystem execution

This demo is the first runnable external-developer path for the filesystem governed-execution adapter. It shows how an arbitrary model-produced agent action is admitted through the existing Worker route and classified as either:

- `EXECUTED` with a proof receipt and lineage node, or
- `NULL` with no new proof and no new lineage.

The demo does **not** introduce a new authority source, execution surface, or bypass path. It bundles `src/index.ts`, invokes `POST /gateway/tool/filesystem-write`, and supplies an in-memory D1-compatible adapter so the path can be run without Cloudflare credentials.

## Run

```bash
npm install
npm run demo
```

Optionally label the model that produced the agent action:

```bash
npm run demo -- --model gpt-example
```

The model label is included only in `agent_id` and `intent`; legitimacy is evaluated by the runtime chain, not by model identity.

## What it proves

The script executes three scenarios:

1. **VALID path** — writes `governed/filesystem-write-gateway/seed.md`, persists one proof receipt, appends one lineage node, and verifies `validated_object_hash == executed_object_hash`.
2. **Replay NULL path** — resubmits the same nonce with different content and verifies no new proof or lineage is emitted.
3. **Policy NULL path** — attempts to write `wrangler.toml` and verifies path validation fails closed with no write, proof, or lineage.

## Reading the NULL output

Both NULL scenarios print two objects:

- `agent_visible_response` — exactly what the calling agent receives:
  `{ result: "NULL", execution_performed: false, proof_emitted: false, correlation_id }`.
  This response is intentionally bounded and non-enumerating: it carries no
  `stage` or `reason`, so an agent cannot binary-search policy, authority, or
  replay boundaries via repeated NULLs.
- `operator_audit_record` — the internal diagnostic record persisted to
  `governed_filesystem_write_null_audit_registry`, resolvable by an operator
  via the same `correlation_id`. It carries `reason_class` (`REPLAY_NULL` /
  `POLICY_NULL` / `MUTATION_NULL`), `stage`, and `denial_reason`.

The demo asserts on both: the bounded shape of the agent-visible response,
and the expected `reason_class`/`stage`/`denial_reason` in the operator audit
record for the replay and policy-denial scenarios.

## Boundary notes

- The mutation-capable surface remains the existing `/gateway/tool/filesystem-write` route.
- The reference adapter is the existing filesystem-write runtime gateway and route adapter.
- The demo D1 adapter is local process state only; it is not a durable database implementation.
- The output is evidence for portability and installability planning, not a deployment approval or distributed finality proof.
