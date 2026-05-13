# Distributed Legitimacy Conformance

This directory contains observability-only conformance infrastructure for distributed legitimacy interoperability. It is intentionally outside the canonical runtime path and cannot authorize, execute, persist, consume replay state, or mutate registry state.

## Architecture

The conformance architecture is a read-only verification harness:

1. `vectors/deterministic-legitimacy-vectors.json` defines deterministic legitimacy objects and their expected canonical hashes.
2. `suites/*.json` defines verification suites for portability, replay neutrality, exact-object preservation, federation boundaries, and append-only registries.
3. `runner.mjs` re-derives vector canonical forms and hashes, inspects suite invariants, and exits non-zero on any mismatch.

The runner never calls the Worker runtime, never opens a network socket, never writes D1, and never emits authority objects. Its only output is local process status and console observations.

## Preserved invariants

- **Fail-closed:** any vector hash mismatch, missing suite invariant, forbidden authority claim, or registry conformance failure causes `NULL` conformance status and a non-zero process exit.
- **Non-authoritative:** remote evidence is evaluated only as evidence. It never becomes local authority and never satisfies `/authority`, `/compile`, `/validate`, `/execute`, or `/proof`.
- **Replay-neutral:** replay vectors certify detection without consuming or reserving local invocation state.
- **Append-only:** registry conformance verifies update/delete blockers and evidence-only columns for distributed legitimacy stores.
- **Exact-object preserving:** interoperability vectors require `validated_object_hash == executed_object_hash`; mismatches fail closed.
- **Runtime mutation incapable:** suites are JSON evidence and the runner performs no runtime mutation operations.

## Execution surface touched

Conformance touches only the local test surface: `node conformance/runner.mjs`. It does not add routes, deployments, database writes, background jobs, webhooks, or hidden automation.

## Replay, proof, and bypass implications

- Replay implication: replay attempts are observed and certified as `NULL`; the harness does not mark nonces consumed.
- Proof implication: conformance can verify proof lineage fields and exact-object hashes, but does not create proof records.
- Bypass implication: conformance is incapable of replacing canonical runtime validation. A successful conformance run is not a deploy approval, execution credential, proof, or authority grant.

## Required flow preservation

Conformance observes the canonical path:

`proposal → structure → validation → authority → execution boundary → proof`

It never collapses proposal into execution and never routes around `/authority → /compile → /validate → /execute → /proof`.
