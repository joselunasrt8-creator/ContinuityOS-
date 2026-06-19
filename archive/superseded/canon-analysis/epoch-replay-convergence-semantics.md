# Epoch-Bound Replay Convergence Semantics — Issue I

**TYPE: SPEC-ONLY | NO IMPLEMENTATION | ANALYSIS ARTIFACT**

**Depends on:** Issue G, Issue H, #1346 (causal clock), #1347 (replay convergence)

---

## 1. Core Rule: Nonce Non-Transferability

A nonce consumed in epoch N is permanently consumed. It does not become eligible in epoch N+k under any circumstance, including:
- Partition healing
- Epoch transition
- Anti-entropy propagation
- Reconciliation settlement

`UNUSED = false` once consumed anywhere in the distributed topology, regardless of epoch boundaries.

---

## 2. Epoch Replay Frontier

The `epoch_replay_frontier` field on an epoch record holds the highest replay nonce consumed within the epoch's scope. This frontier is:

- **Monotone-increasing within an epoch:** new consumption evidence only advances the frontier.
- **Non-transferable across epochs:** a nonce consumed at frontier position F in epoch N does not restore eligibility in epoch N+1, even if epoch N+1's frontier starts below F.
- **Anti-entropy invariant:** merging shard consumption evidence (per #1347 `mergeConsumptionEvidence`) must never remove a nonce from the frontier.

---

## 3. Cross-Epoch Replay Scenarios

### Scenario A: Nonce consumed in epoch N; successor epoch N+1 observed

- Nonce remains consumed in epoch N+1.
- `UNUSED = false` propagates across epoch boundary.
- Anti-entropy must propagate consumption evidence to all shards before epoch N+1 finalizes.
- If propagation incomplete at epoch N+1 start: affected in-flight authority → `PARTITION_SUSPENDED` until anti-entropy resolves.
- On anti-entropy resolution: authority using that nonce → `NULL` (replay detected).

### Scenario B: Partition — shard A consumed nonce; shard B has not seen it

- Shard B's in-flight authority using that nonce: `REPLAY_DIVERGENT` (per #1347 `classifyReplayConvergence`).
- On partition heal: shard B learns of consumption via anti-entropy merge.
- Shard B's authority → `PARTITION_SUSPENDED → NULL`.
- Shard A's authority: unaffected (canonical consumer).

### Scenario C: Both shards independently consume same nonce (split-brain replay)

- Both shards attempted consumption under same (decision_id, invocation_nonce).
- On heal: `resolveReplayConflict` (#1347) selects canonical winner by earliest `causal_index`.
- Loser's authority → `NULL` (replay violation detected).
- Immutable downgrade record emitted: `reason_code = 'replay_violation_detected'`.
- Prior classification for loser superseded to NULL; `fcr_no_upgrade_from_null` trigger (migration 0048) prevents re-classification.

### Scenario D: Nonce consumed in `LOCAL_VALID` scope; global finalization pending

- Nonce remains consumed even if global finalization is later blocked by conflict.
- `UNUSED = false` is not conditional on finalization outcome.
- Authority issued against a consumed nonce that later fails global finalization: NULL for global side-effects; local legitimacy degraded to STALE_VISIBLE or NULL per predicate state.

---

## 4. Anti-Entropy Replay Protocol Requirements

The anti-entropy protocol (implementation out of scope for this spec) must satisfy:

1. **Completeness:** every consumption event observed by any shard is eventually propagated to all shards.
2. **Monotonicity:** consumption evidence is never removed; `mergeConsumptionEvidence` (#1347) is the canonical merge operation.
3. **Epoch-neutrality:** propagation does not restore eligibility. A nonce consumed in epoch N arriving at shard B in epoch N+1 must be treated as consumed in epoch N+1 as well.
4. **Causal ordering:** propagated evidence includes `causal_index` from #1346 so `resolveReplayConflict` can deterministically identify the canonical consumer.
5. **Replay-neutral reconciliation:** anti-entropy cannot unconsume a nonce. This is the `replay_neutral = true` invariant enforced in `src/lib/replay-convergence.ts`.

---

## 5. NULL Routing for Cross-Epoch Replay

| Scenario | Routing |
|---|---|
| Nonce consumed in any prior epoch | UNUSED=false → NULL for re-use attempt |
| Shard sees nonce consumed; topology absent | REPLAY_PARTITION_SUSPENDED → fail-closed |
| Divergent consumption evidence; partition active | REPLAY_DIVERGENT → blocked until anti-entropy |
| Split-brain: both shards consumed same nonce | Loser → NULL; winner → REPLAY_CONSUMED |
| Anti-entropy completes; loser shard authority | NULL (replay violation; no recovery path) |

---

## 6. Implementation Readiness

**NOT READY for anti-entropy runtime implementation.** No distributed nonce propagation infrastructure exists. The `invocation_nonce` schema is local only (enforced per `(decision_id, validated_object_hash)` in D1).

**Ready for:** Issue J (epoch-bound reconciliation settlement) spec.
