# Epoch-Bound Reconciliation Settlement Semantics — Issue J

**TYPE: SPEC-ONLY | NO IMPLEMENTATION | ANALYSIS ARTIFACT**

**Depends on:** Issue G, Issue H, Issue I, #1348 (reconciliation determinism)

---

## 1. Settlement and Epoch Boundaries

A reconciliation settlement outcome is epoch-bound: the epoch in which settlement was reached constrains whether and how the outcome carries forward.

**Core rule:** A decision cannot be re-evaluated in epoch N+1 as if epoch N never existed. The causal clock index of the decision must fall within the settled epoch's causal frontier (`epoch_causal_frontier` from Issue G).

---

## 2. AMBIGUOUS_REQUIRES_EPOCH Outcome

`AMBIGUOUS_REQUIRES_EPOCH` (from #1348 `classifyReconciliationFinality`) arises when competing registry heads have different `epoch_id` values and no epoch tie-break has been resolved.

**Resolution path:**

1. Identify competing epoch candidates from #1342 `conflict_set_registry`.
2. Apply epoch tie-break (Issue K): reconciliability → quorum_weight → causal_index → observed_at → head_hash.
3. Winning epoch: becomes EPOCH_GLOBAL_AUTHORITATIVE candidate.
4. Losing epoch: classified EPOCH_NULL; its registry heads are superseded.
5. Re-run `classifyReconciliationFinality` with surviving heads → GLOBAL_RECONCILED_CANDIDATE if consensus, AMBIGUOUS_RECONCILIATION if still competing within winning epoch.

**If no tie-break resolvable:** remains `AMBIGUOUS_REQUIRES_EPOCH` → NULL for all global decisions in scope.

---

## 3. Settlement Deferral Rules

A settlement outcome may be deferred from epoch N to epoch N+1 when:

1. Epoch N closes before settlement completes (no GLOBAL_RECONCILED_CANDIDATE reached).
2. Successor epoch N+1 is EPOCH_GLOBAL_AUTHORITATIVE.
3. The decision's continuity lineage carries through from epoch N to epoch N+1 (no lineage break).
4. The decision's causal clock index falls within epoch N+1's causal frontier.
5. The decision's replay nonce remains consumed (non-transferability preserved; Issue I).

**Settlement deferral does NOT:**
- Restore UNUSED predicate for consumed nonces.
- Restart the legitimacy chain (session → proof remains intact).
- Allow re-execution under different authority.
- Produce new authority from the deferral event itself.

---

## 4. Cross-Epoch Settlement Scenarios

### Scenario A: Settlement completes within epoch N

- `epoch_reconciliation_frontier` of epoch N encompasses the decision.
- `SETTLEMENT_VALID` may be evaluated (subject to Issue H conditions).
- Settlement record is immutable; appended to `finality_classification_registry` (#1340).

### Scenario B: Epoch N closes before settlement; epoch N+1 is available

- Check deferral eligibility (Section 3 rules).
- If eligible: re-evaluate against epoch N+1 state; emit new classification record superseding PARTITION_SUSPENDED or AMBIGUOUS_RECONCILIATION from epoch N.
- If not eligible (continuity break, causal frontier missed, replay consumed in losing epoch): → NULL.

### Scenario C: Epoch fork straddles settlement window

- Both epoch N and epoch N' claimed EPOCH_GLOBAL_AUTHORITATIVE simultaneously.
- Fork detected via #1342 conflict set.
- Settlement blocked until epoch fork resolved (Issue K tie-break).
- Decisions in scope: EPOCH_CONFLICTED → AMBIGUOUS_RECONCILIATION.
- After fork resolution: winning epoch's decisions eligible for re-evaluation; losing epoch's decisions → NULL.

### Scenario D: Late-arriving reconciliation evidence changes canonical head

- New registry head arrives with higher reconciliability score than prior canonical head.
- `selectCanonicalHead` (#1348) deterministically selects new winner.
- Prior `GLOBAL_RECONCILED_CANDIDATE` classification: superseded by new record.
- If new winner produces same head_hash: no change to settlement validity.
- If new winner produces different head_hash: prior SETTLEMENT_VALID decisions → STALE_VISIBLE or NULL per immutable downgrade rules.

---

## 5. NULL Routing for Epoch-Bound Settlement

| Condition | Routing |
|---|---|
| Epoch boundary ambiguous for decision | NULL until epoch tie-break resolved |
| Causal ordering ambiguous across epoch boundary | NULL |
| Continuity lineage break between epochs | NULL |
| Epoch N+1 not EPOCH_GLOBAL_AUTHORITATIVE at deferral | Deferred; not NULL but not SETTLEMENT_VALID |
| Replay nonce consumed in losing epoch's decision | NULL (nonce consumed; authority invalid) |
| Fork unresolved at settlement deadline | NULL for global decisions |

---

## 6. Implementation Readiness

**NOT READY for settlement runtime.** No epoch persistence, no cross-epoch causal frontier enforcement, and no settlement registry exist. `SETTLEMENT_VALID` cannot be evaluated until the full epoch substrate is implemented and the constitutional gate is extended.

**Ready for:** Issue K (epoch fork and stale majority failure canon) spec.
