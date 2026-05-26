# Epoch Substrate Conformance Vectors for FATE — Issue L

**TYPE: SPEC-ONLY | NO TEST IMPLEMENTATION | ANALYSIS ARTIFACT**

**Depends on:** Issues G, H, I, J, K; existing FATE suite patterns in `tests/fate/`

---

## 1. Purpose

This document defines deterministic test vectors for the epoch substrate failure modes and predicate evaluation paths. Vectors are specified for future FATE test implementation — they do not constitute test code.

Each vector specifies: input predicate/epoch state, expected classification output, and expected NULL routing.

---

## 2. EPOCH_VALID Vectors

### V-G-01: EPOCH_VALID true — all conditions met
```
Input:
  epoch_finality_status = EPOCH_GLOBAL_AUTHORITATIVE
  quorum_attestation present (has_quorum_evidence=1, has_global_consensus_evidence=1)
  object causal_index ≤ epoch_causal_frontier
  epoch_revocation_frontier within staleness bound
  no open conflict set for scope
Expected:
  EPOCH_VALID = true
  classification = GLOBAL_VALID (when base predicates also hold)
```

### V-G-02: EPOCH_VALID false — epoch is EPOCH_LOCAL
```
Input:
  epoch_finality_status = EPOCH_LOCAL
  local attestation only; Q=false
Expected:
  EPOCH_VALID = false for GLOBAL_VALID claims
  EPOCH_VALID = true for LOCAL_VALID claims only
  classification = LOCAL_VALID (not GLOBAL_VALID)
```

### V-G-03: EPOCH_VALID false — epoch is EPOCH_PARTITION_SUSPENDED
```
Input:
  epoch_finality_status = EPOCH_PARTITION_SUSPENDED
  topology_present = false
Expected:
  EPOCH_VALID = false
  classification = PARTITION_SUSPENDED
  NULL for all global decisions in scope
```

### V-G-04: EPOCH_VALID false — revocation channel silent
```
Input:
  epoch_finality_status = EPOCH_STALE_VISIBLE
  evaluateLiveness() → within_sla=0 (from #1344)
Expected:
  EPOCH_VALID = false
  classification = STALE_VISIBLE
  Downgrade event emitted; prior GLOBAL_VALID superseded
```

### V-G-05: EPOCH_VALID false — object causal_index beyond epoch frontier
```
Input:
  epoch_finality_status = EPOCH_GLOBAL_AUTHORITATIVE
  object.causal_index = 99
  epoch_causal_frontier = 50
Expected:
  EPOCH_VALID = false (object belongs to different/unknown epoch)
  classification = AMBIGUOUS
```

---

## 3. Epoch Fork Vectors

### V-K-01: Fork detected — two competing EPOCH_GLOBAL_AUTHORITATIVE candidates
```
Input:
  epoch_candidate_A: epoch_id=A, reconciliability_score=0.9, quorum_weight=0.8, causal_index=5
  epoch_candidate_B: epoch_id=B, reconciliability_score=0.7, quorum_weight=0.9, causal_index=3
  same epoch_scope; no supersession chain between them
Expected:
  Both → EPOCH_CONFLICTED
  Conflict entry written to conflict_set_registry with conflict_state=OPEN
  All decisions in scope → AMBIGUOUS until resolved
```

### V-K-02: Fork tie-break — reconciliability wins first
```
Input: (from V-K-01)
  epoch_A reconciliability_score=0.9 > epoch_B reconciliability_score=0.7
Expected:
  epoch_A → EPOCH_GLOBAL_AUTHORITATIVE (winner)
  epoch_B → EPOCH_NULL (loser)
  Conflict entry → RESOLVED; collapse_rule_applied=RECONCILIABILITY
  epoch_B decisions → NULL
  Immutable fork resolution event emitted
```

### V-K-03: Fork tie-break — quorum_weight wins when reconciliability ties
```
Input:
  epoch_A: reconciliability_score=0.8, quorum_weight=0.9, causal_index=5
  epoch_B: reconciliability_score=0.8, quorum_weight=0.6, causal_index=3
Expected:
  epoch_A → winner (higher quorum_weight)
  collapse_rule_applied=QUORUM_WEIGHT
```

### V-K-04: Fork tie-break — causal_index wins when quorum ties
```
Input:
  epoch_A: reconciliability_score=0.8, quorum_weight=0.8, causal_index=3
  epoch_B: reconciliability_score=0.8, quorum_weight=0.8, causal_index=7
Expected:
  epoch_A → winner (lower causal_index = earlier)
  collapse_rule_applied=CAUSAL_CLOCK
```

### V-K-05: Fork unresolvable — all tie-break fields equal
```
Input:
  epoch_A and epoch_B identical on reconciliability, quorum_weight, causal_index, observed_at
  epoch_A.epoch_id = 'aaa...' < epoch_B.epoch_id = 'zzz...' (lexicographic)
Expected:
  epoch_A → winner (lexicographic hash last resort)
  collapse_rule_applied=LEXICOGRAPHIC
  (Fully deterministic even in worst case)
```

---

## 4. Stale Epoch Majority Vectors

### V-K-06: Stale epoch majority — revocation channel silent
```
Input:
  epoch_finality_status = EPOCH_GLOBAL_AUTHORITATIVE
  evaluateLiveness(last_observed_at, max_allowed_silence_ms) → within_sla=0
  Majority (>50%) of federation members attest to this epoch
Expected:
  epoch → EPOCH_STALE_VISIBLE (majority attestation does NOT override staleness)
  New global decisions in scope: blocked
  Prior GLOBAL_VALID decisions → STALE_VISIBLE downgrade event emitted
```

### V-K-07: Stale epoch renewal — freshness evidence arrives
```
Input:
  epoch_finality_status = EPOCH_STALE_VISIBLE
  New revocation liveness record: within_sla=1 (from #1344 evaluateLiveness)
Expected:
  epoch → EPOCH_GLOBAL_AUTHORITATIVE (renewed; not upgraded from NULL)
  Global decisions resume
```

---

## 5. Cross-Epoch Replay Vectors

### V-I-01: Nonce consumed in epoch N; re-use attempted in epoch N+1
```
Input:
  nonce 'X' consumed in epoch N (causal_index=5)
  epoch N+1 is EPOCH_GLOBAL_AUTHORITATIVE
  Authority in epoch N+1 attempts to use nonce 'X'
Expected:
  isNonceConsumedGlobally('X', merged_evidence) = true
  classifyReplayConvergence → REPLAY_CONSUMED
  UNUSED = false → NULL for epoch N+1 authority
```

### V-I-02: Split-brain replay — both shards consumed same nonce
```
Input:
  shard_A: consumed nonce 'X', causal_index=3
  shard_B: consumed nonce 'X', causal_index=7
  Partition healed; evidence merged
Expected:
  resolveReplayConflict → shard_A wins (lower causal_index)
  shard_B authority → NULL (replay_violation_detected)
  Immutable NULL classification emitted for shard_B's decision
  fcr_no_upgrade_from_null prevents re-classification
```

---

## 6. Settlement Deferral Vectors

### V-J-01: Settlement deferred — epoch N closes before GLOBAL_RECONCILED_CANDIDATE
```
Input:
  Decision D in epoch N; reconciliation → AMBIGUOUS_RECONCILIATION at epoch N close
  Epoch N+1 is EPOCH_GLOBAL_AUTHORITATIVE
  Decision D continuity lineage carries through (no break)
  Decision D causal_index ≤ epoch N+1 causal_frontier
  Decision D nonce not consumed in losing epoch
Expected:
  Settlement deferred to epoch N+1 → eligible for re-evaluation
  classifyReconciliationFinality re-run in epoch N+1 context
```

### V-J-02: Settlement deferred but continuity break — NULL
```
Input:
  Decision D in epoch N; continuity lineage revoked between epoch N and N+1
Expected:
  Deferral ineligible → NULL (continuity break)
  No re-evaluation in epoch N+1
```

### V-J-03: AMBIGUOUS_REQUIRES_EPOCH resolved via epoch fork tie-break
```
Input:
  classifyReconciliationFinality → AMBIGUOUS_REQUIRES_EPOCH
  Two competing heads with epoch_id_A and epoch_id_B
  Epoch fork tie-break resolves: epoch_id_A wins
Expected:
  Surviving heads from epoch_id_A: re-evaluated
  classifyReconciliationFinality with epoch_id_A heads → GLOBAL_RECONCILED_CANDIDATE
  epoch_id_B heads → discarded (NULL epoch); decisions → NULL
```

---

## 7. Partition Healing Vectors

### V-G-06: Partition heals — PARTITION_SUSPENDED upgrades to LOCAL_RECONCILED
```
Input:
  heads all share same head_hash (agreement)
  topology_present was false; now true
  All base predicates hold
Expected:
  classifyReconciliationFinality → GLOBAL_RECONCILED_CANDIDATE (topology now present)
  PARTITION_SUSPENDED decisions re-evaluated → LOCAL_VALID or GLOBAL_VALID
  New classification records emitted (supersedes PARTITION_SUSPENDED records)
```

### V-G-07: Partition heals with fork — AMBIGUOUS persists until tie-break
```
Input:
  Shard A and Shard B have different head_hash values post-heal
  No epoch fork (same epoch_id)
Expected:
  classifyReconciliationFinality → AMBIGUOUS_RECONCILIATION
  selectCanonicalHead → deterministic winner via tie-break
  Loser heads → superseded; winner head → GLOBAL_RECONCILED_CANDIDATE candidate
```

---

## 8. Minimum Vector Coverage Requirements

Future FATE test implementation must cover at minimum:

- 5 EPOCH_VALID true/false paths (vectors V-G-01 through V-G-05)
- 5 epoch fork detection and tie-break paths (V-K-01 through V-K-05)
- 2 stale epoch majority paths (V-K-06, V-K-07)
- 2 cross-epoch replay paths (V-I-01, V-I-02)
- 3 settlement deferral paths (V-J-01 through V-J-03)
- 2 partition healing paths (V-G-06, V-G-07)

**Total minimum: 19 deterministic vectors** covering all canonical epoch failure modes.

Each vector must be deterministic, non-operative (no runtime mutation), and must specify expected NULL routing explicitly.
