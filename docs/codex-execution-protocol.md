# Codex Execution Protocol

This document defines the repository governance protocol for Codex-assisted closure work.
It is a non-runtime governance artifact: it does not create authority, does not execute deployments, and does not modify canonical runtime routes.

## Core invariant

If no valid object exists → nothing happens.

Codex work must preserve MindShift's bounded execution model:

proposal → structure → validation → authority → execution boundary → proof

The canonical runtime path remains:

/authority → /compile → /validate → /execute → /proof

## Unit of work discipline

Every Codex implementation must follow this closure invariant:

one issue → one branch → one PR → one invariant → one FATE expansion

Codex must not bundle unrelated cleanup, opportunistic refactors, route changes, schema behavior changes, or runtime logic changes into a closure PR.

## Branch and PR boundary

For each issue, Codex must:

1. Work on exactly one issue-scoped branch.
2. Open exactly one issue-scoped PR.
3. State the invariant protected by the PR.
4. State the execution surface touched.
5. State replay implications.
6. State proof implications.
7. State bypass implications.
8. Identify tests added or updated, including the required FATE/static expansion.
9. List follow-up gaps only as separate issue candidates, not bundled changes.

## Runtime non-interference

Documentation-only protocol work must not modify runtime logic, canonical routes, authority behavior, proof behavior, replay behavior, validator behavior, reconciliation behavior, or schema behavior.

Codex must treat the following as protected unless the issue explicitly scopes them:

- canonical routes
- authority lifecycle
- exact-object validation
- replay protection
- proof persistence
- reconciliation semantics
- validator behavior
- schema behavior
- production deploy boundaries

## Exact object discipline

Codex must preserve:

validated_object == executed_object

No patch may create a path where a validated object can be mutated before execution.
No patch may introduce implicit authority.
No patch may create an alternate execution route.

## Fail-closed behavior

Invalid, missing, replayed, malformed, unauthorized, or mismatched objects must resolve to NULL or blocked execution.
Codex must not introduce fail-open fallback behavior.

## Deterministic FATE coverage

Each closure PR must add or update deterministic coverage that proves the invariant exists.
For governance-documentation work, static FATE coverage is sufficient when it verifies the required protocol language and PR-template checklist without exercising runtime behavior.

## PR closure checklist

Every Codex PR must report:

- changed files
- tests added or updated
- invariant protected
- execution surface touched
- replay implications
- proof implications
- bypass implications
- verification commands and results
- follow-up gaps as separate issue candidates

## Non-authority statement

This protocol governs repository contribution behavior only.
It does not grant runtime authority, deploy authority, database authority, or production execution rights.
