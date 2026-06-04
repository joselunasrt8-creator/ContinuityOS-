# continuity-core

`continuity-core` is a pure Rust crate for correctness-critical ContinuityOS primitives.
It intentionally does **not** implement an HTTP server, database layer, CLI,
deployment logic, GitHub integration, AI agent runtime, authority creation,
network calls, or runtime mutation.

## Core invariant

If no valid object exists, nothing happens.

The crate models invalid, incomplete, replayed, orphaned, ambiguous, and
malformed states as explicit `NULL`/non-success classifications instead of
fabricating successful execution, proof, replay safety, or reconciliation.

## Modules

- `canonicalization`: deterministic JSON canonical bytes/strings with stable key ordering and no lossy coercion.
- `hashing`: SHA-256 over canonical JSON bytes with lowercase hexadecimal output.
- `aeo_validation`: exact AEO validation. Missing fields, extra fields, malformed fields, authority mismatch, hash mismatch, and scope expansion return `NULL`.
- `replay`: in-memory replay classification for nonce/object-hash reuse. No replay-safe result is emitted without lineage binding.
- `proof`: proof envelope creation only from supplied execution evidence. Proof is never fabricated from absence.
- `lineage`: authority, proof, and execution lineage graph representation with parent-child traversal and orphan detection.
- `reconciliation`: conservative reconciliation classification. Convergence is not claimed unless all required evidence is complete and matching.
- `types`: strict identifiers and enums that make invalid states harder to represent.

## Validation

Run unit tests from this crate directory:

```sh
cargo test
```
