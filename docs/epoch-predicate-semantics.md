# Epoch Predicate Semantics: EPOCH_VALID, CONVERGENCE_VALID, SETTLEMENT_VALID — Issue H

**TYPE: SPEC-ONLY | NO IMPLEMENTATION | ANALYSIS ARTIFACT**

**Depends on:** Issue G (epoch-substrate-semantics.md), #1340–#1348 (all closed)

---

## 1. Predicate Hierarchy

```
SETTLEMENT_VALID ⊃ CONVERGENCE_VALID ⊃ EPOCH_VALID ⊃ base invariant
```

Each level is additive — it does not replace the level below. The base invariant
(`VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE`)
must hold at all levels. Failure at any level routes to NULL.

Extended canonical invariant:
```
VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE
  ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE
  ∧ EPOCH_VALID ∧ CONVERGENCE_VALID ∧ SETTLEMENT_VALID
  else NULL
```

---

## 2. EPOCH_VALID

**Definition:** The epoch in scope is `EPOCH_GLOBAL_AUTHORITATIVE` and the legitimacy object under evaluation was issued within or for that epoch and has not been invalidated by epoch close or revocation.

**Required evidence:**
- `epoch_finality_status == EPOCH_GLOBAL_AUTHORITATIVE`
- `epoch_quorum_profile` attestation present in #1343 registry
- Object's continuity lineage epoch ≤ current epoch (monotonicity: no future or superseded epoch)
- `epoch_revocation_frontier` within policy staleness bound (#1344)
- No open conflict set (#1342) for this epoch scope
- Causal clock index of object ≤ `epoch_causal_frontier` (#1346)

**Invalidating evidence:**
- `epoch_finality_status` in {EPOCH_AMBIGUOUS, EPOCH_STALE_VISIBLE, EPOCH_PARTITION_SUSPENDED, EPOCH_CONFLICTED, EPOCH_REVOKED, EPOCH_NULL}
- Object continuity lineage epoch > current epoch (future epoch claim)
- Revocation channel silent beyond staleness bound
- Competing epoch head with higher reconciliability score exists in conflict set
- Causal clock index of object > `epoch_causal_frontier`

**NULL conditions:**
- No epoch defined for scope → NULL
- EPOCH_NULL or EPOCH_REVOKED → NULL
- EPOCH_AMBIGUOUS with no tie-break → NULL
- EPOCH_PARTITION_SUSPENDED → NULL (fail-closed; not implicit pass)
- Missing quorum attestation → NULL for GLOBAL_VALID; LOCAL_VALID only if local epoch defined

---

## 3. CONVERGENCE_VALID

**Definition:** All distributed predicates are simultaneously satisfied: base invariant holds, partition-finality predicates hold, and epoch is globally authoritative.

**Required evidence (all must hold):**
- All base predicates: `VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE`
- All distributed predicates: `Q ∧ G ∧ L ∧ X` (quorum, global convergence, lineage freshness, cryptographic integrity)
- `EPOCH_VALID` holds
- Classification in #1340 registry is GLOBAL_VALID (not downgraded)
- No open conflict set (#1342) for scope
- Reconciliation finality class is GLOBAL_RECONCILED_CANDIDATE or higher (#1348)

**Invalidating evidence:**
- Any base predicate fails → NULL immediately
- EPOCH_VALID fails → downgrade to LOCAL_VALID or NULL per scope
- Open conflict set exists → AMBIGUOUS
- Quorum drops below threshold after decision → downgrade GLOBAL_VALID → AMBIGUOUS
- Any immutable downgrade proof event emitted for this decision

**NULL conditions:**
- Any base predicate fails → NULL
- EPOCH_NULL, EPOCH_REVOKED, EPOCH_AMBIGUOUS → NULL
- No quorum attestation → NULL (cannot claim CONVERGENCE_VALID locally)
- Reconciliation finality NULL_RECONCILIATION → NULL

---

## 4. SETTLEMENT_VALID

**Definition:** A legitimacy decision has reached finality — proof is globally final, epoch is globally authoritative, reconciliation is settled, and no subsequent evidence can silently reverse the outcome without emitting an immutable downgrade event.

**Required evidence (all must hold):**
- `CONVERGENCE_VALID` holds
- `proof_finality_class == PROOF_GLOBAL_FINAL` (not PROOF_LOCAL_FINAL or PROOF_CONTINGENT)
- Reconciliation finality class is GLOBAL_RECONCILED_CANDIDATE with all-registry coherence confirmed (#1348)
- No open competing heads in #1342 conflict set for this decision's scope
- Epoch `epoch_reconciliation_frontier` encompasses this decision
- Settlement evidence persisted as immutable append-only record

**Invalidating evidence:**
- Late-arriving revocation proof (must downgrade to STALE_VISIBLE or NULL; never silent preservation)
- Competing epoch head emerging after settlement (if causally prior, settlement degrades to EPOCH_CONFLICTED path)
- Proof arriving out of causal order that reveals replay violation (CONVERGENCE_VALID → NULL)
- Quorum membership change that retroactively invalidates the attestation

**NULL conditions:**
- Any CONVERGENCE_VALID NULL condition applies
- PROOF_LOCAL_FINAL or PROOF_CONTINGENT → not NULL but not SETTLEMENT_VALID
- Missing immutable settlement record → observational only, not SETTLEMENT_VALID
- Epoch not yet EPOCH_GLOBAL_AUTHORITATIVE at decision time → settlement deferred

**PROOF_LOCAL_FINAL cannot satisfy SETTLEMENT_VALID.** Local proof is not global settlement.

---

## 5. Silent Preservation is Forbidden

At all three predicate levels, a downgrade event must be emitted when validity is lost. A decision that was `SETTLEMENT_VALID` at T=0 cannot remain classified as settled at T=1 if any invalidating evidence arrives at T=1. The system must emit an immutable downgrade record; the prior classification record persists as historical evidence.

---

## 6. Implementation Readiness

**NOT READY for runtime predicate evaluation.** `EPOCH_VALID` is absent from the constitutional gate. No `epoch_registry` D1 table exists for persisting epoch state. Predicate evaluation requires all three to be wired into the constitutional gate and backed by persistent epoch records.

**Ready for:** Issues I–L spec artifacts.
