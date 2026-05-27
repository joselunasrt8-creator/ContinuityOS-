# Issue #1515 — Partition-Finality Closure: Deterministic Split-Brain Collapse, Epoch-Ordered Settlement, Replay-Safe NULL Routing

## Intent
Define the next bounded implementation slice to close topology issue **partition-finality semantics** without widening authority or endpoint scope.

## Scope (bounded)
- Partition-finality classifier/state model.
- Replay convergence binding to finality eligibility.
- Reconciliation determinism for unresolved epoch conflict.
- Schema evidence extensions for checkpoint/report lineage.
- Deterministic FATE tests for split-brain + epoch + replay heal cases.

## Canonical invariants preserved
- `validated_object == executed_object`.
- Mutation-capable execution remains bound to `/session → /continuity → /authority → /compile → /validate → /execute → /proof`.
- Ambiguity and unresolved distributed conflicts fail closed (`NULL`).
- Evidence-only topology surfaces do not create authority.

## Topology closure status
- Single-node canonical execution flow is structurally present.
- Distributed settlement semantics remain open for split-brain collapse and epoch-ordered finality.
- Replay/reconciliation classifiers exist but require hard binding to execution eligibility in distributed ambiguity states.

## Highest-leverage missing issue
**Partition-finality semantics closure** across split-brain detection, epoch tie-break determinism, and replay-safe convergence on heal.

## Likely file surfaces
- `src/lib/finality-classification.ts`
- `src/lib/replay-convergence.ts`
- `src/lib/reconciliation-determinism.ts`
- `src/runtime-topology-intelligence.ts`
- `schemas/federation/reconciliation-checkpoint.schema.json`
- `schemas/reconciliation/reconciliation-report.schema.json`
- `tests/fate/issue-1348-reconciliation-determinism.test.mjs`
- `tests/fate/issue-1347-replay-convergence.test.mjs`
- `tests/fate/stage2-conf-dist-11.test.mjs`
- `tests/fate/federated-reconciliation.test.mjs`

## Required schema additions
Add or extend partition-finality evidence with:
- `partition_epoch_id`
- `finality_state`: `LOCAL_TENTATIVE | PARTITIONED | CONFLICTED | QUARANTINED | SETTLEMENT_PENDING | SETTLED_NULL | SETTLED_GLOBAL`
- `quorum_vector_hash`
- `split_brain_detected`
- `settlement_basis`: `QUORUM | EPOCH_ORDER | REPLAY_COLLAPSE | MANUAL_NULL`
- `losing_branch_hashes[]`
- `replay_collapse_proof_hash`
- `topology_visibility_class`
- `deterministic_tiebreak_key`

## Required validator semantics
1. No topology visibility implies no global finality promotion.
2. Split-brain unresolved by quorum/epoch tie-break implies `NULL` eligibility.
3. Replay divergence forbids `SETTLED_GLOBAL`.
4. Cross-epoch competing heads without deterministic epoch proof => ambiguity => `NULL`.
5. Non-`REPLAY_SAFE` branches cannot satisfy `UNUSED` on mutation path.
6. Evidence modules remain non-authoritative.

## Required FATE tests
- Split-brain with equal quorum and differing epochs => `NULL`.
- Partition heal with nonce resurrection attempt => nonce remains consumed (`NULL`).
- Partial topology visibility with apparent agreement => no global settlement.
- Epoch mismatch + replay divergence => settlement blocked.
- Tie-break determinism is permutation-invariant.
- Quarantined branch cannot re-promote absent explicit reconciliation proof.

## Failure modes that must return NULL
- `split_brain_detected=true` without canonical tie-break proof.
- `topology_present=false` for global legitimacy claims.
- `REPLAY_DIVERGENT` or `REPLAY_PARTITION_SUSPENDED` on mutation path.
- `AMBIGUOUS_REQUIRES_EPOCH` unresolved.
- Competing settled claims for same decision/authority hash.
- Branch resurrection attempt of consumed nonce after partition heal.
- Missing deterministic checkpoint hash continuity.

## Non-goals
- No endpoint additions/reordering.
- No authority model widening.
- No break-glass governance bypass expansion.
- No deployment/runtime substrate changes.

## Implementation prompt (bounded Codex agent)
Implement partition-finality closure by extending finality/replay/reconciliation semantics, plus schema evidence and deterministic FATE tests, while preserving fail-closed eligibility and canonical route/order invariants. Reject unresolved split-brain/epoch/replay ambiguity with `NULL`; do not alter authority surfaces or add mutation endpoints.
