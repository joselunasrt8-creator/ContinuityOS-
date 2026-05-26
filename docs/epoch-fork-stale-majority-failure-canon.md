# Epoch Fork and Stale Majority Failure Canon — Issue K

**TYPE: SPEC-ONLY | NO IMPLEMENTATION | ANALYSIS ARTIFACT**

**Depends on:** Issue G, #1342 (conflict_set_registry), #1343 (quorum_attestation_registry)

**Integrates with:** #1194 distributed legitimacy failure canon taxonomy

---

## 1. Epoch Fork

**Definition:** Two or more epoch candidates claim `EPOCH_GLOBAL_AUTHORITATIVE` for the same scope simultaneously with no resolved tie-break.

**Detection:**
1. Two epoch candidates with identical `epoch_scope` observed with distinct `epoch_id` values.
2. Both carry quorum attestation evidence from #1343 (competing quorum sets).
3. Neither supersedes the other (no `supersedes_classification_id` chain linking them).

**State transition on detection:**
- Both candidates: `EPOCH_GLOBAL_AUTHORITATIVE → EPOCH_CONFLICTED`.
- Conflict entry written to #1342 `conflict_set_registry` with `conflict_state = 'OPEN'`.
- All decisions in scope: blocked from GLOBAL_VALID until fork resolved.

**Tie-break ordering (deterministic; no authority created):**

1. **Reconciliability score** — epoch with higher verified ancestry coverage wins.
2. **Quorum attestation weight** — epoch with stronger attestation weight from #1343 wins.
3. **Earliest authoritative causal clock index** — epoch whose legitimacy events have lower causal_index (#1346) wins.
4. **Lexicographic epoch_id hash** — last resort; fully deterministic.

**Resolution:**
- Winning epoch: `EPOCH_CONFLICTED → EPOCH_GLOBAL_AUTHORITATIVE`; conflict entry updated to `RESOLVED`.
- Losing epoch: `EPOCH_CONFLICTED → EPOCH_NULL`; all authority issued under losing epoch → STALE_VISIBLE or NULL.
- Immutable fork resolution event emitted with tie-break evidence and `reason_code = 'epoch_fork_resolved'`.
- Losing epoch decisions: degrade per Issue J cross-epoch settlement rules.

**Failure class:** `FAIL.DIST.EPOCH.FORK` → Split-brain legitimacy → EPOCH_CONFLICTED → AMBIGUOUS until resolved → NULL for losing branch.

---

## 2. Stale Epoch Majority

**Definition:** A majority of federation members attest to an epoch that is outside the staleness horizon — i.e., the revocation/renewal channel has been silent beyond the policy threshold.

**Detection:**
- `epoch_revocation_frontier` older than `max_allowed_silence_ms` (#1344).
- `evaluateLiveness` (#1344 `evaluateLiveness`) returns `within_sla = 0` for the epoch's revocation channel.
- Majority of federation members' attestations reference this stale epoch.

**Key rule:** Stale epoch majority does not produce a pass. Even if >50% of federation members attest to an epoch, if the epoch's revocation channel is silent, the epoch cannot be `EPOCH_GLOBAL_AUTHORITATIVE`.

**State transition:**
- `EPOCH_GLOBAL_AUTHORITATIVE → EPOCH_STALE_VISIBLE`.
- All new global decisions in scope: blocked.
- Existing `GLOBAL_VALID` decisions: downgrade to STALE_VISIBLE; immutable downgrade record emitted.

**Recovery path:**
- Fresh revocation evidence arrives within policy window: `EPOCH_STALE_VISIBLE → EPOCH_GLOBAL_AUTHORITATIVE` (renewal, not upgrade from NULL).
- Staleness exceeds max policy horizon or superseding epoch observed: `EPOCH_STALE_VISIBLE → EPOCH_NULL` (terminal).

**Failure class:** `FAIL.DIST.EPOCH.STALE_MAJORITY` → Stale lineage propagation → EPOCH_STALE_VISIBLE → no GLOBAL_VALID.

---

## 3. Epoch Revocation

**Definition:** The epoch authority source (quorum attestation set) is revoked or the epoch is explicitly closed with evidence.

**State transition:**
- `EPOCH_GLOBAL_AUTHORITATIVE → EPOCH_REVOKED → EPOCH_NULL`.
- All authority issued under this epoch: must be re-evaluated.
- Previously GLOBAL_VALID decisions: degrade to STALE_VISIBLE or NULL per predicate state.
- Immutable revocation event emitted; prior records persist as historical evidence.

**Failure class:** `FAIL.DIST.EPOCH.REVOKED` → Orphan authority drift → NULL for all decisions requiring EPOCH_VALID.

---

## 4. Downgrade Immutability Rule

Every epoch state downgrade MUST:
1. Emit a new record in #1340 `finality_classification_registry` with `supersedes_classification_id` pointing to the prior record.
2. Include a machine-readable `reason_code` from the canonical vocabulary:
   `epoch_fork_detected | epoch_fork_resolved_loser | stale_epoch_majority | revocation_channel_silent | epoch_revoked | epoch_superseded | quorum_degraded`
3. Never silently preserve prior validity.

The `fcr_no_upgrade_from_null` trigger in migration 0048 prevents any subsequent re-classification of NULL records.

---

## 5. Failure Class Integration (#1194 Taxonomy)

| Epoch Failure | FAIL.DIST Identifier | Canonical Output |
|---|---|---|
| Competing epoch heads unresolved | `FAIL.DIST.EPOCH.FORK` | EPOCH_CONFLICTED → AMBIGUOUS → NULL |
| Stale epoch majority attested | `FAIL.DIST.EPOCH.STALE_MAJORITY` | EPOCH_STALE_VISIBLE → no GLOBAL_VALID |
| Epoch quorum disagrees on canonical head | `FAIL.DIST.EPOCH.QUORUM_CONFLICT` | EPOCH_PARTITION_SUSPENDED → fail-closed |
| Epoch revoked | `FAIL.DIST.EPOCH.REVOKED` | EPOCH_NULL → NULL for all decisions |
| Local epoch accepted as global authority | `FAIL.DIST.EPOCH.LOCAL_AS_GLOBAL` | EPOCH_LOCAL → no GLOBAL_VALID |
| Epoch visibility partial | `FAIL.DIST.EPOCH.TOPOLOGY_PARTIAL` | EPOCH_PARTITION_SUSPENDED |
| Fork tie-break unresolvable | `FAIL.DIST.EPOCH.FORK_UNRESOLVABLE` | EPOCH_AMBIGUOUS → NULL |

---

## 6. Implementation Readiness

**NOT READY for fork detection or stale majority runtime.** No epoch persistence, no inter-shard epoch comparison infrastructure, and no epoch revocation surface exist.

**Ready for:** Issue L (epoch conformance vectors for FATE) spec.
