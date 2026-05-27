# Stage 2 Conformance Matrix Overview

**Artifact Type:** Stage 2 Canonical Documentation  
**Status:** NON_OPERATIVE — documentation only  
**Implemented By:** Slice K (PR #1471)  
**Suite File:** `conformance/suites/stage2-distributed-legitimacy-conformance.json`  
**Anchor Plan:** `docs/stage2-distributed-legitimacy-enforcement-plan-v1.md` §14

---

## Purpose

This document provides a human-readable overview of the Stage 2 distributed legitimacy conformance matrix (CONF-DIST-01 through CONF-DIST-15). It reflects the implemented conformance suite and cross-references the implementing slices, fixtures, and test modules.

---

## WARNING

> **Conformance ≠ execution authority.**  
> **Conformance test passage does not grant execution eligibility.**  
> **Fixtures are read-only JSON; the runner is test-only.**  
> **No runtime path leads from a fixture to execution.**

The conformance suite verifies that runtime behavior satisfies invariants. It does not create authority, validate production objects, execute workflows, or imply that any object is eligible for execution.

---

## Conformance Matrix

| ID | Check | Expected Result | Forbidden Results | Slice | Fixture | Test |
|----|-------|-----------------|------------------|-------|---------|------|
| CONF-DIST-01 | `LOCAL_VALID` does not imply `GLOBAL_VALID` | `LOCAL_VALID` | `GLOBAL_VALID`, `CONVERGENCE_VALID` | B | `local_valid_no_global_promotion.json` | `stage2-conf-dist-01.test.mjs` |
| CONF-DIST-02 | Partition-local proof downgraded on partition detection | `PARTITION_SUSPENDED` | `GLOBAL_VALID`, `CONVERGENCE_VALID`, `LOCAL_VALID` | G | `partition_proof_downgrade.json` | `stage2-conf-dist-02.test.mjs` |
| CONF-DIST-03 | Replay consumed in partition remains consumed after healing | `NULL` | `GLOBAL_VALID`, `CONVERGENCE_VALID`, `REPLAY_SAFE` | F | `replay_consumed_partition_heal.json` | `stage2-conf-dist-03.test.mjs` |
| CONF-DIST-04 | Stale lineage collapses to `STALE_VISIBLE` | `STALE_VISIBLE` | `GLOBAL_VALID`, `LOCAL_VALID` | H | `stale_lineage_collapse.json` | `stage2-conf-dist-04.test.mjs` |
| CONF-DIST-05 | Conflicting proof roots create `CONFLICTED` | `CONFLICTED` | `GLOBAL_VALID`, `CONVERGENCE_VALID` | E | `conflicting_proof_roots.json` | `stage2-conf-dist-05.test.mjs` |
| CONF-DIST-06 | Quorum disagreement prevents `GLOBAL_VALID` | `AMBIGUOUS` or `CONFLICTED` | `GLOBAL_VALID`, `CONVERGENCE_VALID` | D | `quorum_disagreement.json` | `stage2-conf-dist-06.test.mjs` |
| CONF-DIST-07 | Detached proof cannot finalize | `NULL` | `GLOBAL_VALID`, `CONVERGENCE_VALID`, `FINALIZED` | G | `detached_proof.json` | `stage2-conf-dist-07.test.mjs` |
| CONF-DIST-08 | Reconciliation cannot create authority | No execution eligibility | Any execution-eligible state | H | `reconciliation_no_authority.json` | `stage2-conf-dist-08.test.mjs` |
| CONF-DIST-09 | Topology invisibility returns `NULL` or `AMBIGUOUS` | `NULL` or `AMBIGUOUS` | `GLOBAL_VALID`, `CONVERGENCE_VALID` | I | `topology_invisible.json` | `stage2-conf-dist-09.test.mjs` |
| CONF-DIST-10 | Settlement preserves losing branch evidence | `STALE_VISIBLE` (losing branch retained) | Any state that implies losing branch deleted | E | `settlement_losing_branch.json` | `stage2-conf-dist-10.test.mjs` |
| CONF-DIST-11 | Epoch mismatch prevents `CONVERGENCE_VALID` | `NULL` or `STALE_VISIBLE` | `GLOBAL_VALID`, `CONVERGENCE_VALID` | C | `epoch_mismatch.json` | `stage2-conf-dist-11.test.mjs` |
| CONF-DIST-12 | Revocation liveness downgrade propagates | `STALE_VISIBLE` propagated | Any valid state retaining active classification | H | `revocation_liveness_downgrade.json` | `stage2-conf-dist-12.test.mjs` |
| CONF-DIST-13 | Causal ordering ambiguity prevents finality | `AMBIGUOUS` | `GLOBAL_VALID`, `CONVERGENCE_VALID` | J | `causal_ambiguity.json` | `stage2-conf-dist-13.test.mjs` |
| CONF-DIST-14 | Proof downgrade/upgrade is append-only | Events immutable in log | Any state implying event mutation | G | `proof_downgrade_append_only.json` | `stage2-conf-dist-14.test.mjs` |
| CONF-DIST-15 | Partition healing does not restore replay eligibility | `NULL` | `GLOBAL_VALID`, `REPLAY_SAFE`, any eligible state | F | `partition_heal_no_replay_restore.json` | `stage2-conf-dist-15.test.mjs` |

All fixtures are in `tests/fixtures/stage2/`.  
All tests are in `tests/fate/`.

---

## What the Conformance Suite Proves

The suite verifies the following invariants:

1. `LOCAL_VALID` cannot silently become `GLOBAL_VALID` (CONF-DIST-01)
2. Partition conditions downgrade proof finality (CONF-DIST-02)
3. Replay consumption survives partition heal (CONF-DIST-03, CONF-DIST-15)
4. Stale lineage cannot remain active (CONF-DIST-04)
5. Conflicting proof roots are classified and preserved (CONF-DIST-05)
6. Quorum disagreement blocks global claims (CONF-DIST-06)
7. Detached proof cannot finalize (CONF-DIST-07)
8. Reconciliation cannot create authority (CONF-DIST-08)
9. Topology invisibility blocks global claims (CONF-DIST-09)
10. Conflict settlement preserves losing branches (CONF-DIST-10)
11. Epoch mismatch blocks convergence (CONF-DIST-11)
12. Revocation liveness propagates (CONF-DIST-12)
13. Causal ambiguity blocks finality (CONF-DIST-13)
14. Proof downgrade/upgrade events are append-only (CONF-DIST-14)
15. Partition healing does not restore replay eligibility (CONF-DIST-15)

---

## Implementing Slices

| Slice | PR | Primary Conformance Checks |
|-------|----|---------------------------|
| Slice B — Finality Classification Registry Hardening | (PR #1440 series) | CONF-DIST-01 |
| Slice C — Epoch Registry + Settlement Coupling | (PR series) | CONF-DIST-11 |
| Slice D — ValidatorAttestationEnvelope + Quorum | (PR series) | CONF-DIST-06 |
| Slice E — ConflictSetEnvelope + Settlement | PR #1450 | CONF-DIST-05, CONF-DIST-10 |
| Slice F — Distributed Replay Convergence | PR #1448 | CONF-DIST-03, CONF-DIST-15 |
| Slice G — Proof Finality Metadata | PR #1449 | CONF-DIST-02, CONF-DIST-07, CONF-DIST-14 |
| Slice H — Reconciliation State Machine | PR #1451 | CONF-DIST-04, CONF-DIST-08, CONF-DIST-12 |
| Slice I — Topology Visibility Enforcement | PR #1452 | CONF-DIST-09 |
| Slice J — Causal Legitimacy Clocks | PR #1468 | CONF-DIST-13 |
| Slice K — Stage 2 Conformance Matrix | PR #1471 | All CONF-DIST-01–15 |

---

## Stage 1 Regression Protection

The Stage 2 conformance suite does not replace the Stage 1 suite. Both suites must pass independently.

- Stage 1 suite: `conformance/suites/cicd-stage1-conformance.json`
- Stage 1 tests: `tests/cicd-stage1-conformance.test.mjs`
- Coverage: CONF-CICD-01 through CONF-CICD-15

Stage 2 extends Stage 1 guarantees to distributed topology. It does not replace them.

---

## NULL Coverage

The conformance suite explicitly covers NULL paths for:

- Topology ambiguity (CONF-DIST-09)
- Replay resurrection attempts (CONF-DIST-03, CONF-DIST-15)
- Epoch mismatch (CONF-DIST-11)
- Detached proof (CONF-DIST-07)
- Unresolved conflict-set (CONF-DIST-05)
- Quorum disagreement (CONF-DIST-06)
- Causal ambiguity (CONF-DIST-13)

---

## Cross-References

| Related Document | Topic |
|-----------------|-------|
| `docs/stage2-legitimacy-vocabulary.md` | Full 12-state vocabulary |
| `docs/reconciliation-state-machine.md` | Reconciliation state machine |
| `docs/topology-visibility-semantics.md` | Topology visibility semantics |
| `docs/causal-legitimacy-clock-semantics.md` | Causal clock semantics |
| `docs/stage2-distributed-legitimacy-enforcement-plan-v1.md` | Full Stage 2 plan |
