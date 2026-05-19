# Install-Base Readiness Checklist for Governed GitHub Deploy

Related issues: #549, #551.

## Why this workflow exists

MindShift separates **proposal** from **legitimate execution**.

- AI and humans can propose deploy changes.
- Runtime governance decides whether a valid deploy object exists.
- If no valid object exists, runtime returns `NULL` and no state-changing deploy is admitted.
- A deploy is only complete when proof is persisted.

This prevents “proposal → direct deploy” collapse and enforces one canonical deploy path.

## Governed deploy path (first execution wedge)

This install-base wedge covers one production mutation path:

`GitHub PR/PREO -> GitHub Actions -> MindShift Runtime -> Proof`

Operationally, this means:

1. PR activity produces PREO candidate/review context.
2. A governed workflow dispatch provides bounded deploy inputs.
3. Runtime enforces authority, exact-object validation, and replay controls.
4. Proof is persisted as deploy lineage evidence.

## Canonical execution flow

The runtime execution chain is fixed:

`/authority -> /compile -> /validate -> /execute -> /proof`

### 1) `/authority`
Create bounded authority for a specific `decision_id`, scope, constraints, and expiry. Missing, expired, revoked, or mismatched authority is `NULL`.

### 2) `/compile`
Compile deterministic canonical AEO and produce `validated_object_hash` bound to the decision.

### 3) `/validate`
Check policy and object legitimacy. Only `VALID` can progress. Any mismatch or policy failure returns `NULL`.

### 4) `/execute`
Allow state-changing execution only after valid authority + valid object + nonce reservation checks. Replay indicators are blocked.

### 5) `/proof`
Persist proof bound to the executed lineage. Without proof, execution is operationally incomplete.

## Core invariants (non-negotiable)

- If no valid object exists -> nothing happens.
- `validated_object == executed_object`.
- No proof -> execution incomplete.

## Minimum required runtime chain

For governed production deploy, these runtime surfaces must be present and enforced in order:

1. `/session`
2. `/continuity`
3. `/authority`
4. `/compile`
5. `/validate`
6. `/execute`
7. `/proof`

`/session` and `/continuity` are prerequisite identity/lineage bindings used by authority and proof lineage checks.

## Minimum GitHub Actions shape

A deploy-capable workflow must be bounded like `governed-deploy.yml`:

- trigger is explicit `workflow_dispatch`
- required inputs: `decision_id`, `validated_object_hash`, `invocation_nonce`
- hard fail on missing secrets/inputs/environment binding
- call runtime endpoints in canonical order
- enforce canonical workflow identity (`governed-deploy.yml`)
- fail closed on non-canonical responses
- produce artifacts for session/continuity/authority/compile/validate/execute/proof responses

PREO-related workflow (`preo-candidate.yml`) must keep PR review context separate from execution and never bypass runtime execution boundary.

## Required proof semantics

A proof record must carry, at minimum:

- run ID (`run_id` / `workflow_run_id`)
- commit SHA (`commit_sha` / `workflow_sha` / merge SHA lineage)
- workflow identity (`workflow`)
- validated object hash (`validated_object_hash`)
- authority/decision reference (`decision_id`, authority lineage)

Proof is an append-only lineage artifact, not a best-effort log.

## Exact-object discipline

Exact-object discipline means:

`validated_object_hash == executed_object_hash`

Operationally in this runtime:

- `/compile` emits canonical `validated_object_hash`.
- `/validate` and `/execute` must use that exact hash.
- `/proof` persists lineage keyed by the same decision+object identity.
- Hash drift or lineage mismatch returns `NULL` / blocked execution.

## Replay expectations

Replay protection is expected normal behavior:

- invocation nonce reuse is blocked
- consumed/replayed authority is blocked
- duplicate workflow run lineage is blocked
- duplicate decision+object proof/attestation lineage is blocked or quarantined per registry semantics

Developers should treat replay rejection as healthy fail-closed governance behavior.

## Failure / NULL conditions

Execution must return `NULL` (or otherwise fail closed) for conditions including:

- missing authority
- expired authority
- revoked authority/continuity
- scope or constraint mismatch (repo/branch/workflow/environment)
- hash mismatch (`validated_object_hash` drift)
- replay attempt (nonce/workflow run/decision-object reuse)
- missing required proof persistence inputs
- non-canonical workflow identity for governed deploy

## Setup path for another repo/team

1. Copy and adapt governed workflows:
   - `.github/workflows/prepare-governed-deploy.yml`
   - `.github/workflows/governed-deploy.yml`
   - `.github/workflows/preo-candidate.yml`
2. Set secrets:
   - `MINDSHIFT_WORKER_URL`
   - `MINDSHIFT_API_KEY`
3. Keep canonical intent/scope bindings (`deploy_production`, repo/branch/workflow constraints).
4. Ensure runtime schema includes authority/aeo/validation/execution/proof/invocation registries and uniqueness constraints.
5. Require proof persistence as completion criteria for deploy change control.
6. Validate that direct deploy paths are blocked or excluded from production legitimacy.

## Remaining Gaps Before External Adoption

Only concrete gaps currently visible from repository/runtime surfaces:

1. **Install-base onboarding is fragmented across multiple docs/workflows.** This document closes the checklist gap, but a single externally-oriented onboarding index is still missing.
2. **Manual handoff between `prepare-governed-deploy.yml` and `governed-deploy.yml` remains operator-driven.** Inputs are printed and then dispatched manually, which is bounded but operationally heavier for new teams.
3. **Runtime route implementation is concentrated in `src/index.ts` monolith.** This is enforceable today, but increases review complexity for external adopters validating authority/validate/execute/proof semantics.
