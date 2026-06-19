# Epoch Substrate Semantics — Issue G

**TYPE: SPEC-ONLY | NO IMPLEMENTATION | ANALYSIS ARTIFACT**

**Prerequisites closed:** #1340, #1342, #1343, #1344, #1345, #1346, #1347, #1348

---

## 1. What Is an Epoch

An **epoch** in MindShift is a bounded legitimacy scope unit that constrains *when* authority objects, continuity lineage, replay eligibility, and proof finality are valid — binding `WHEN` (temporal scope) to the existing `WHO` (identity) + `WHICH` (continuity lineage) axes of the legitimacy model.

Epoch observation ≠ epoch authority. An epoch is classified evidence, not an execution surface.

---

## 2. Epoch Object Model

```
epoch_id                    Globally unique deterministic identifier.
                            Derived: sha256(scope + epoch_start_evidence + authority_source_id)

epoch_scope                 The registry/topology/federation scope this epoch applies to.
                            GLOBAL | DOMAIN:<id> | PARTITION:<id> | LOCAL:<node_id>

epoch_authority_source      Legitimacy source that proposed and attested this epoch.
                            quorum_attestation_id[] from #1343; does not create new authority.

epoch_start_condition       Predicate set satisfied at epoch boundary open:
                            - prior epoch closed or superseded
                            - quorum threshold met for epoch_scope
                            - continuity lineage active and not stale
                            - no open conflict sets blocking epoch transition
                            - revocation channel live within staleness bound

epoch_close_condition       Any of:
                            - explicit epoch closure with quorum attestation
                            - superseding epoch observed with higher reconciliability score
                            - revocation evidence invalidates epoch authority source
                            - staleness horizon exceeded without renewal evidence
                            - partition isolation exceeds policy threshold

epoch_quorum_profile        Federation profile ID from #1343 governing quorum math,
                            member weights, max lineage age, required topology visibility,
                            and downgrade behavior when quorum degrades.

epoch_causal_frontier       Causal clock index (#1346) of the last legitimacy event
                            causally within this epoch. Events after frontier belong to
                            successor epoch or AMBIGUOUS if frontier unclear.

epoch_replay_frontier       Highest replay nonce consumed within this epoch scope.
                            Nonces consumed at or before frontier are non-transferable
                            to successor epochs (per #1347 anti-entropy rules).

epoch_reconciliation_frontier  Reconciliation finality class reached within this epoch
                            (#1348): LOCAL_RECONCILED | GLOBAL_RECONCILED_CANDIDATE |
                            AMBIGUOUS_RECONCILIATION | NULL_RECONCILIATION

epoch_revocation_frontier   Last observed revocation liveness timestamp within epoch scope
                            (#1344). Epoch validity degrades if revocation channel silent
                            beyond policy staleness bound.

epoch_finality_status       Current classification (see Section 3).
```

---

## 3. Canonical Epoch States

| State | Meaning |
|---|---|
| `EPOCH_LOCAL` | Attested within a single partition/domain only. Supports LOCAL_VALID decisions only. |
| `EPOCH_GLOBAL_CANDIDATE` | Partial quorum attestation. May upgrade to EPOCH_GLOBAL_AUTHORITATIVE or degrade to EPOCH_AMBIGUOUS. |
| `EPOCH_GLOBAL_AUTHORITATIVE` | Full quorum attestation; no competing heads; revocation channel live; lineage fresh. GLOBAL_VALID decisions may reference this epoch. Monotone within scope until close condition met. |
| `EPOCH_AMBIGUOUS` | Competing epoch heads with no resolved tie-break. All decisions in scope: AMBIGUOUS. No execution for global side effects. |
| `EPOCH_STALE_VISIBLE` | Epoch visible but revocation/renewal channel silent beyond staleness horizon. Cannot support GLOBAL_VALID. May upgrade if freshness evidence arrives. |
| `EPOCH_PARTITION_SUSPENDED` | Topology visibility below quorum threshold. All decisions in scope: PARTITION_SUSPENDED. Fail-closed. |
| `EPOCH_CONFLICTED` | Two or more competing epoch candidates with resolved conflict entry (#1342) but pending tie-break settlement. Execution blocked. |
| `EPOCH_REVOKED` | Epoch authority source revoked or epoch explicitly closed with evidence. All authority issued under this epoch must be re-evaluated. |
| `EPOCH_NULL` | Hard failure. No valid epoch evidence for scope. NULL for all decisions requiring EPOCH_VALID. Terminal. |

**State transitions:**

```
(proposed)
  → EPOCH_LOCAL (local attestation only)
    → EPOCH_GLOBAL_CANDIDATE (partial quorum)
      → EPOCH_GLOBAL_AUTHORITATIVE (full quorum, no conflicts)
        → EPOCH_STALE_VISIBLE (revocation channel silent)
          → EPOCH_NULL (staleness exceeds max or superseded)
        → EPOCH_REVOKED (explicit revocation evidence)
          → EPOCH_NULL
        → EPOCH_CONFLICTED (competing head observed)
          → EPOCH_AMBIGUOUS (no tie-break resolved)
          → EPOCH_GLOBAL_AUTHORITATIVE (tie-break resolved, competing head is NULL)
    → EPOCH_AMBIGUOUS (competing candidate observed)
  → EPOCH_PARTITION_SUSPENDED (topology below threshold)
    → (any) on partition heal + re-evaluation
```

`EPOCH_NULL` is terminal: no upgrade path from NULL.

---

## 4. Dependency Mapping from #1340–#1348

Each closed issue provides one indispensable evidence column the epoch substrate requires:

| Closed Issue | Provides to Epoch Substrate |
|---|---|
| #1340 finality_classification_registry | Persistence surface for epoch finality classification records |
| #1342 conflict_set_registry | Epoch fork observation: competing epoch heads become a conflict entry |
| #1343 quorum_attestation_registry | Evidence that quorum attests to same epoch head (EPOCH_GLOBAL_AUTHORITATIVE) |
| #1344 revocation_liveness_registry | Evidence that revocation channels were live within epoch bounds (L predicate) |
| #1345 validator extension | Surface where epoch classification evidence returns alongside VALID/NULL |
| #1346 causal clock | Epoch happens-before ordering: continuity → authority → epoch transition |
| #1347 replay convergence | Epoch-bound replay: nonce consumed in epoch N does not become eligible in epoch N+k |
| #1348 reconciliation determinism | Settlement outcome AMBIGUOUS_REQUIRES_EPOCH; epoch boundaries govern merge ordering |

---

## 5. NULL Conditions for Epoch Evaluation

- No epoch defined for scope → NULL
- `epoch_finality_status` not EPOCH_GLOBAL_AUTHORITATIVE → NULL for GLOBAL_VALID
- EPOCH_NULL, EPOCH_REVOKED, EPOCH_AMBIGUOUS → NULL
- EPOCH_PARTITION_SUSPENDED → NULL (not implicit pass)
- Missing quorum attestation → NULL for global claims; LOCAL_VALID only if local epoch defined
- Revocation channel silent beyond staleness bound → NULL for new global decisions

---

## 6. Implementation Readiness

**NOT READY for D1 implementation.** No `epoch_registry` table exists. The epoch object has no persistence surface and `EPOCH_VALID` is absent from the constitutional gate.

**Ready for:** Issues H–L spec artifacts (see docs/).

**Implementation becomes eligible after:** Issues G–L accepted as spec PRs (this file is G).
