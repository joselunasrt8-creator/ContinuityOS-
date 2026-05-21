# Passive Legitimacy Topology Ledger (PLTL/PLOL)

## Scope

PLTL/PLOL is a **passive, read-only observability projection** of canonical runtime evidence. It is not an execution surface, authority surface, validator, or reconciliation controller.

Canonical runtime remains closed to:

`/session → /continuity → /authority → /compile → /validate → /execute → /proof`

## Non-operative invariant

If no valid canonical object exists, nothing happens. PLTL/PLOL does not create, mutate, authorize, validate, execute, or prove objects.

- No POST/PATCH/PUT/DELETE semantics.
- GET/export only.
- No write-back path into runtime registries.
- No enforcement triggers.
- No graph-driven execution decisions.

## Authoritative vs derived boundaries

Authoritative legitimacy state exists only in canonical runtime objects and registries produced by the canonical route chain.

PLTL/PLOL data is derived projection only:

- Derived topology is evidentiary, never canonical truth.
- Graph consensus does not create authority.
- Telemetry does not create legitimacy.
- Reconciliation visibility does not grant reconciliation authority.

## Exact-object and validator exclusivity

Exact-object discipline and validator exclusivity remain canonical:

- `validated_object == executed_object` remains enforced only by canonical `/validate` and `/execute` flow.
- PLTL/PLOL cannot substitute, override, or synthesize validator outcomes.
- PLTL/PLOL cannot bypass or emulate `/authority` or `/validate`.

## Replay and proof containment

Replay protection and proof integrity remain canonical runtime responsibilities:

- PLTL/PLOL may display replay status and lineage evidence.
- PLTL/PLOL cannot mark objects as used/unused.
- PLTL/PLOL cannot issue, mutate, revoke, or finalize proofs.

## Drift and reconciliation semantics

Drift visualization, dependency measurement, lineage traversal, and reconciliation inspection are allowed as passive observability outputs only.

Any detected drift or reconciliation mismatch is informational unless and until canonical runtime routes process valid objects under normal governance checks.

## Fail-closed and non-bypassability guarantees

PLTL/PLOL cannot become an alternate legitimacy path.

- No alternate authority synthesis.
- No validator bypass.
- No runtime mutation from topology projections.
- No autonomous enforcement.
- No bootstrap mutation via observability.

If canonical runtime preconditions are not met, execution result remains deterministic rejection (`NULL`/`INVALID`/`BLOCKED`/`QUARANTINED`) in canonical systems; PLTL/PLOL remains read-only evidence.
