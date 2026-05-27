# Issue #1516 — Distributed Replay Convergence Closure Plan

## Intent
Close the next highest-leverage distributed topology gap after partition-finality semantics by defining deterministic, topology-wide replay convergence across federated legitimacy domains.

## Scope (bounded)
This issue is limited to replay convergence semantics and evidence handling under distributed topology conditions:

1. distributed replay convergence state model
2. federated replay observation semantics
3. replay convergence downgrade classification
4. replay visibility quorum semantics
5. replay reconciliation ordering rules
6. replay conflict arbitration
7. topology partition replay handling
8. replay lineage reconciliation
9. deterministic replay convergence proofs
10. replay-safe distributed FATE coverage

Out of scope: authority widening, endpoint expansion, hidden runtime execution behavior, probabilistic replay heuristics, and performance optimization.

## Preserved invariants
- `validated_object == executed_object`
- replay eligibility remains lineage-bound
- replay state remains recursively reconcilable
- replay observation does not imply authority
- replay convergence remains topology-visible
- replay downgrade semantics fail closed
- unresolved distributed ambiguity routes to `NULL`

## Required execution gating conditions
Execution remains allowed only when:

`VALID ∧ AUTHORIZED ∧ UNUSED ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE`

Else: `NULL`

## Topology closure target
Primary closure target: deterministic replay legitimacy outcomes across federated runtimes under partition, stale lineage, delayed reconciliation, and asynchronous topology visibility.

Core problem framing:

`replay-safe locally ≠ replay-safe globally`

## Likely file surfaces
- `src/lib/replay-convergence.ts`
- `src/lib/distributed-reconciliation.ts`
- `src/lib/topology-arbitration.ts`
- `src/lib/replay-registry.ts`
- `src/routes/validate.ts`
- `src/routes/proof.ts`
- `src/types/distributed-legitimacy.ts`
- `tests/fate/distributed-replay-convergence.test.ts`

## Distributed replay runtime state model
Runtime replay classification must converge deterministically to one of:

- `REPLAY_SAFE`
- `REPLAY_CONSUMED`
- `REPLAY_DIVERGENT`
- `REPLAY_PARTITION_SUSPENDED`
- `REPLAY_RECONCILING`
- `NULL`

State transitions must be deterministic, topology-visible, and reconciliation-compatible.

## Required validator semantics
1. **Lineage binding**: replay evidence without valid continuity lineage is ineligible and must not satisfy `UNUSED`.
2. **Topology visibility quorum**: replay-safe promotion requires quorum-visible topology evidence; otherwise downgrade to `REPLAY_RECONCILING` or `REPLAY_PARTITION_SUSPENDED`.
3. **Deterministic arbitration**: contradictory replay observations across federated nodes must resolve via deterministic arbitration ordering; unresolved contradiction returns `NULL`.
4. **Downgrade safety**: once downgraded due to divergence/partition ambiguity, replay state cannot re-promote without explicit reconciliation proof continuity.
5. **Object exactness**: replay evidence hash/object mismatch against validated object returns `NULL`.
6. **Observation non-authority**: observation layers are evidence only and cannot create authority or execution validity directly.

## Proof artifacts required
Replay convergence decisions must emit deterministic proof-bearing artifacts suitable for audit/reconciliation:

- replay lineage chain hash
- topology visibility quorum witness hash/vector
- arbitration decision basis and deterministic ordering key
- reconciliation checkpoint linkage hash
- replay downgrade reason code
- canonical final replay state

## Required FATE tests
Add/extend deterministic FATE coverage for:

1. partition replay race
2. delayed replay propagation
3. federated replay disagreement
4. stale replay lineage
5. replay convergence downgrade
6. replay resurrection attempt
7. concurrent replay observation
8. orphan replay evidence
9. reconciliation after partition heal
10. topology visibility loss

Each test must assert deterministic replay state and execution eligibility routing (`allowed` vs `NULL`).

## Mandatory `NULL` conditions
Route to `NULL` when any of the following occur:

- replay state ambiguous beyond convergence threshold
- replay lineage detached from valid continuity chain
- replay evidence mutation/tampering detected
- replay visibility quorum failure
- replay arbitration contradiction unresolved deterministically
- replay object hash mismatch
- replay reconciliation non-determinism

## Mutation-capable surfaces and constraints
Mutation-capable execution semantics must remain bounded to existing canonical flow:

`/session → /continuity → /authority → /compile → /validate → /execute → /proof`

No new mutation-capable endpoints.
No hidden execution-path widening.
No bypass of topology/replay visibility gates.

## Remaining reconciliation risks after closure
Expected residual risks (non-blocking to this issue if fail-closed behavior holds):

- long-tail async lag amplification before convergence
- cross-domain clock/timing skew pressure on observation ordering
- operator misconfiguration of topology visibility inputs

These must remain observable and fail-closed rather than silently permissive.

## Exact implementation handoff prompt (bounded Codex agent)
> Implement Issue #1516 as a bounded replay-convergence closure slice.
>
> Scope only: distributed replay convergence semantics, deterministic arbitration/reconciliation linkage, replay proof artifacts, and FATE coverage.
>
> Preserve invariants:
> - validated_object == executed_object
> - replay eligibility is lineage-bound
> - observation cannot imply authority
> - unresolved ambiguity returns NULL
>
> Enforce runtime states:
> REPLAY_SAFE, REPLAY_CONSUMED, REPLAY_DIVERGENT, REPLAY_PARTITION_SUSPENDED, REPLAY_RECONCILING, NULL.
>
> Target file surfaces:
> - src/lib/replay-convergence.ts
> - src/lib/distributed-reconciliation.ts
> - src/lib/topology-arbitration.ts
> - src/lib/replay-registry.ts
> - src/routes/validate.ts
> - src/routes/proof.ts
> - src/types/distributed-legitimacy.ts
> - tests/fate/distributed-replay-convergence.test.ts
>
> Required behavior:
> 1. deterministic distributed replay state classification under partition + async visibility
> 2. topology visibility quorum gating before replay-safe promotion
> 3. deterministic replay arbitration for contradictory federated observations
> 4. replay downgrade semantics that require reconciliation proof for re-promotion
> 5. hard NULL routing on lineage detachment, hash mismatch, unresolved contradiction, or non-deterministic reconciliation
>
> Required tests:
> - partition race, delayed propagation, disagreement, stale lineage, downgrade, resurrection attempt,
>   concurrent observation, orphan evidence, post-heal reconciliation, visibility loss.
>
> Non-goals:
> - no authority widening
> - no execution surface expansion
> - no probabilistic heuristics
> - no hidden reconciliation logic
