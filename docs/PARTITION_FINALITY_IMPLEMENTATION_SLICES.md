# Partition-Finality Implementation Slices (Issue-Ready)

Canonical source: `PARTITION_FINALITY_SEMANTICS.md` (PR #1295 semantics).  
Scope: decomposition only; **no implementation**.

Global preservation constraints for every issue below:
- `validated_object == executed_object`
- No valid continuity lineage → no valid authority → no valid execution
- All persisted legitimacy lineage remains recursively reconcilable
- Append-only history; no destructive rewrite
- Fail-closed outcomes (`NULL|INVALID|BLOCKED|QUARANTINED|deterministic rejection evidence`)

---

## 1) Issue: Add Finality Classification Record Persistence

**Objective**
- Introduce immutable, append-only finality decisions per object hash so runtime can deterministically track `LOCAL_VALID|GLOBAL_VALID|AMBIGUOUS|STALE_VISIBLE|PARTITION_SUSPENDED|NULL` transitions and supersessions.

**Runtime objects touched**
- Finality classification record
- Proof event log (for downgrade/upgrade linkage)
- Reconciliation lineage references

**Invariants preserved**
- Decision records never mutate prior validated objects.
- Classification persistence does not authorize execution; it records evidence only.
- Any execution remains gated by `VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID`.

**Acceptance criteria**
- Persist record fields: `object_hash`, `classification`, predicate snapshot (`V/A/U/P/R/T/C/Q/G/L/X`), `decided_at`, `supersedes_decision_id`.
- Supersession creates a new row/event; prior rows remain readable.
- Deterministic mapping from predicate snapshot to classification outcome.
- Read-only observability can query classifications without creating authority.

**Non-goals**
- No change to execution routing or authority issuance.
- No global quorum math redesign.

---

## 2) Issue: Add Partition Epoch Object Lifecycle

**Objective**
- Model partition windows as explicit epoch objects to anchor topology visibility evidence and reconciliation boundaries.

**Runtime objects touched**
- Partition epoch object
- Topology visibility evidence records
- Reconciliation state cursor

**Invariants preserved**
- Partition epoch is evidence, not authority.
- `PARTITION_SUSPENDED` remains fail-closed and non-executable for global side effects.
- Epoch closure never rewrites lineage history.

**Acceptance criteria**
- Persist fields: `partition_epoch_id`, `scope`, `detected_at`, `resolved_at`, `visibility_bitmap`.
- Open epoch created on partition detection; close epoch on deterministic heal signal.
- Classifier can bind any non-global finality decision to active epoch context.
- Reconciliation logic can enumerate affected scopes by epoch.

**Non-goals**
- No automatic partition healing policy invention.
- No runtime mutation path additions outside canonical flow.

---

## 3) Issue: Introduce Quorum Attestation Envelope

**Objective**
- Add explicit quorum evidence envelope required for `GLOBAL_VALID` classification under federated/high-assurance profiles.

**Runtime objects touched**
- Quorum attestation envelope
- Federation profile metadata
- Finality classifier input set

**Invariants preserved**
- Quorum evidence supplements, never replaces, `VALID/AUTHORIZED/UNUSED/POLICY_VALID`.
- Missing or insufficient quorum fails closed to `LOCAL_VALID` or `AMBIGUOUS` per policy.

**Acceptance criteria**
- Persist envelope fields: `federation_profile_id`, `member_attestations[]`, `weight_total`, `weight_approved`, `quorum_met`.
- Deterministic quorum evaluation algorithm per profile.
- `GLOBAL_VALID` blocked unless quorum envelope proves `Q=true`.
- Envelope references are replay-neutral and append-only.

**Non-goals**
- No new federate trust bootstrap mechanism.
- No implicit authority from observability telemetry.

---

## 4) Issue: Add Revocation Liveness Evidence Object

**Objective**
- Track revocation-channel freshness to enforce lineage freshness (`L`) and deterministic downgrade semantics.

**Runtime objects touched**
- Revocation liveness evidence
- Finality classifier freshness predicate inputs
- Downgrade proof event stream

**Invariants preserved**
- Stale or absent liveness cannot silently preserve `GLOBAL_VALID`.
- Downgrades are explicit immutable events.

**Acceptance criteria**
- Persist fields: `channel_id`, `last_observed_at`, `max_allowed_silence_ms`, `within_sla`.
- Classifier computes `L` using stored liveness evidence and policy horizon.
- If liveness drops below SLA after prior `GLOBAL_VALID`, deterministic downgrade event is emitted.
- No execution authorization implied by liveness records.

**Non-goals**
- No external revocation transport redesign.
- No broad scheduling/automation framework introduction.

---

## 5) Issue: Implement Conflict Set Registry for Split-Brain

**Objective**
- Persist competing canonical heads and deterministic collapse outcomes for governed lineage scopes.

**Runtime objects touched**
- Conflict set registry
- Canonical head selection evidence
- Finality supersession records

**Invariants preserved**
- Split-brain does not permit bypass execution.
- Losing branches become non-executable (`NULL`/`STALE_VISIBLE`) yet remain historically preserved.
- Tie-break ordering remains deterministic and auditable.

**Acceptance criteria**
- Persist fields: `conflict_set_id`, `lineage_scope`, `competing_heads[]`, `collapse_rule_applied`, `winner_head_hash`.
- Enforce canonical tie-break sequence from semantics.
- Freeze global finalization for scope while unresolved conflict exists.
- Emit explicit collapse evidence linking winners/losers.

**Non-goals**
- No probabilistic or manual-only adjudication path.
- No deletion of losing branch evidence.

---

## 6) Issue: Extend Proof Envelope with Finality Metadata

**Objective**
- Extend proof objects to encode local/global/contingent finality and reconciliation dependencies.

**Runtime objects touched**
- Proof finality envelope extensions
- Proof persistence route storage schema
- Finality classifier proof parser

**Invariants preserved**
- Proof classes do not mutate validated objects.
- Proof evidence cannot escalate authority by itself.
- Replay constraints remain enforced on late-arriving proofs.

**Acceptance criteria**
- Add fields: `proof_visibility_scope`, `proof_finality_class`, `proof_arrival_order_index`, `reconciliation_dependency_ids[]`.
- `PROOF_GLOBAL_FINAL` eligible only with full predicate satisfaction.
- `PROOF_LOCAL_FINAL` capped at local semantics.
- Late revocation proofs trigger deterministic downgrade, never silent retention.

**Non-goals**
- No proof cryptosystem replacement.
- No alternate proof submission routes.

---

## 7) Issue: Enrich Validator Output with Classification Predicates

**Objective**
- Extend validator outputs to include explicit distributed predicates (`T,C,Q,G,L,X`) alongside canonical gates for auditable classification.

**Runtime objects touched**
- Validator result object
- Finality classifier input contract
- Telemetry/observability payloads (GET-only)

**Invariants preserved**
- Validator enrichment is additive and non-authoritative.
- Execution gate remains `VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID`.
- `validated_object == executed_object` remains intact.

**Acceptance criteria**
- Validator emits deterministic predicate map for each decision context.
- Predicate map consumed by finality classifier without hidden defaults.
- Missing required predicate evidence fails closed.
- Backward compatibility path for existing validator consumers documented.

**Non-goals**
- No route semantic changes from GET to mutation.
- No implicit quorum inference from partial telemetry.

---

## 8) Issue: Add Reconciliation Downgrade/Upgrade Proof Events

**Objective**
- Persist immutable reconciliation transition events for classification upgrades/downgrades after partition healing or late evidence arrival.

**Runtime objects touched**
- Reconciliation transition event stream
- Finality classification supersession links
- Proof lineage graph

**Invariants preserved**
- Reclassification is additive evidence, never in-place mutation.
- Global-to-non-global downgrade is explicit and immutable.
- Recursive reconciliability remains preserved across transitions.

**Acceptance criteria**
- Transition event schema captures: prior class, new class, trigger evidence refs, timestamp, affected scope/object.
- Downgrade from `GLOBAL_VALID` always emits event.
- Upgrade to `GLOBAL_VALID` requires full predicate satisfaction at upgrade time.
- Transition chain is fully replay-auditable and append-only.

**Non-goals**
- No silent batch rewrites of historical classifications.
- No off-ledger reconciliation shortcuts.

---

## 9) Issue: Add Tests/Conformance for `LOCAL_VALID` vs `GLOBAL_VALID`

**Objective**
- Establish deterministic test coverage for classification boundary behavior under predicate permutations and policy profiles.

**Runtime objects touched**
- Conformance vector suites
- Finality classifier tests
- Policy profile fixtures

**Invariants preserved**
- No test permits execution when canonical gates fail.
- Distinction between local acceptance and global finality remains explicit.

**Acceptance criteria**
- Add vectors for: full predicates → `GLOBAL_VALID`; missing any of `Q/G/L/X` with base predicates true → `LOCAL_VALID` or `AMBIGUOUS` per policy.
- Add downgrade vectors where post-fact evidence invalidates `L/X/C`.
- Assert deterministic state output with no nondeterministic ordering dependence.
- Verify preserved rule: no valid continuity lineage → no valid authority → no valid execution.

**Non-goals**
- No expansion into unrelated constitutional layers.
- No replacement of existing canonical test names unless compatibility aliasing is provided.

---

## 10) Issue: Add Split-Brain Collapse Conformance Matrix

**Objective**
- Build a matrix-driven conformance suite for split-brain detection, tie-break collapse ordering, and post-collapse classification outcomes.

**Runtime objects touched**
- Split-brain/Conflict set test fixtures
- Collapse tie-break evaluator
- Reconciliation transition proofs

**Invariants preserved**
- Unresolved split-brain blocks global finalization.
- Collapse remains deterministic, auditable, and append-only.
- Losing branch execution is blocked while evidence is retained.

**Acceptance criteria**
- Matrix dimensions include: ancestry coverage, quorum strength, signed commit time attestation availability, hash tie-break fallback.
- Verify tie-break precedence exactly as specified.
- Verify post-collapse downgrades for prior branch-dependent `LOCAL_VALID` decisions.
- Verify no bypass path grants execution outside canonical `/authority → /compile → /validate → /execute → /proof` flow.

**Non-goals**
- No introduction of manual override backdoors.
- No non-deterministic “best effort” collapse logic.
