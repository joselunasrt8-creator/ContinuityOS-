# Registry Relationship Map

## Scope and Determination

This map is a deterministic, read-only reconciliation topology for the MindShift registry lineage surface. It does not create registry authority, imply runtime execution, mutate lineage, or simulate proof. Any unresolved, ambiguous, or non-recursively traversable relationship is classified as `NULL` for legitimacy integrity and `INVALID` for the attempted reconciliation result.

The canonical traversal spine is:

```text
session_registry
→ continuity_registry
→ authority_registry
→ aeo_registry
→ validation_registry
→ execution_registry
→ proof_registry
```

Additional lineage overlays:

```text
preo_registry → authority_registry → proof_registry
invocation_registry → validation_registry → execution_registry
```

The object integrity anchor is `validated_object_hash`; the replay anchor is the tuple `(decision_id, validated_object_hash, invocation_nonce)`; the governance ancestry anchor is `(identity_id, session_id, continuity_id, decision_id)`.

## 1. Registry Dependency Graph

| Registry | Purpose | Upstream dependencies | Downstream dependencies | Required foreign lineage | Replay relationships | Revocation propagation requirements | Drift risks | Required deterministic invariants | Failure classification | Reconciliation traversal order |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `session_registry` | Establishes identity-bound runtime session eligibility and expiry gate. | None inside this traversal; identity lineage is external to this map. | `continuity_registry`, then all descendant authority, validation, execution, and proof eligibility. | `identity_id`, `session_id`, `owner`, `trust_tier`, `continuity_status`, `expires_at`. | Session must bind any replayable lineage through downstream continuity and authority; resumed sessions cannot reuse consumed executable lineage. | Revoked, expired, or inactive session invalidates child continuity, active authority, pending validation, executable lineage, and proof eligibility. | Orphan continuity without session, continuity ancestry corruption, revoked session with active descendants. | Session lookup is exact by `session_id`; status and expiry are evaluated fail-closed; no missing identity/session ancestry may be inferred. | Missing or inactive session → `NULL`; conflicting session identity → `INVALID`; expired session → `NULL`. | 1 |
| `continuity_registry` | Persists durable legitimacy continuity between identity, session, and child lineage. | `session_registry`. | `authority_registry`, `aeo_registry`, `validation_registry`, `execution_registry`, `invocation_registry`, `proof_registry`. | `continuity_id`, `identity_id`, `session_id`, optional `parent_continuity_id`, `continuity_hash`, `canonical_continuity`, `status`, `expires_at`, `revoked_at`. | Replay scope must include continuity lineage; reused execution across revoked or mismatched continuity resolves `NULL`. | Revocation cascades to child continuities and every authority, validation, execution, invocation, and proof candidate bound to the continuity. | Continuity ancestry corruption, parent loop, hash drift, stale child continuity, orphan authority. | `canonical_continuity` hashes to `continuity_hash`; parent traversal is acyclic and exact; `(session_id, identity_id)` matches upstream session. | Missing continuity → `NULL`; hash drift → `NULL`; parent cycle or ambiguity → `INVALID`; revoked continuity → `NULL`. | 2 |
| `authority_registry` | Records bounded authority lifecycle for a decision and binds ownership, intent, scope, constraints, session, and continuity. | `continuity_registry` and `session_registry`. | `aeo_registry`, `preo_registry`, `validation_registry`, `execution_registry`, `proof_registry`. | `authority_id`, unique `decision_id`, `session_id`, `continuity_id`, `identity_id`, `owner`, `intent`, `scope`, `constraints`, `expiry`, `status`. | Authority cannot be replayed after consumption, expiry, revocation, or descendant execution for the same validated object. | Authority revocation blocks compile-derived AEO legitimacy, validation acceptance, execution eligibility, and proof legitimacy. | Authority ancestry drift, stale PREO lineage, duplicate decision authority, replay divergence. | `decision_id` resolves to exactly one authority; authority session/continuity/identity matches upstream; expiry and status are fail-closed. | Missing authority → `NULL`; duplicate authority ancestry → `INVALID`; expired/revoked authority → `NULL`. | 3 |
| `aeo_registry` | Persists the compiled exact object representation and its canonical hash. | `authority_registry`, `continuity_registry`, `session_registry`. | `validation_registry`. | `aeo_id`, `authority_id`, `decision_id`, `continuity_id`, `canonical_aeo`, `validated_object_hash`, `status`. | AEO hash is the executable object identity used by invocation, validation, execution, and proof replay checks. | Revoked authority or continuity invalidates AEO-derived validation and execution eligibility. | AEO/authority mismatch, canonicalization hash drift, orphan AEO, alternate object substitution. | `canonical_aeo` deterministically hashes to `validated_object_hash`; `authority_id` and `decision_id` match authority; object is immutable after compile. | Missing AEO → `NULL`; hash mismatch → `NULL`; authority mismatch → `INVALID`. | 4 |
| `validation_registry` | Records validator result for the exact object and nonce-bound invocation context. | `aeo_registry`, `authority_registry`, `continuity_registry`, `session_registry`, `invocation_registry`. | `execution_registry`. | `validation_id`, `session_id`, `continuity_id`, `decision_id`, `validated_object_hash`, `invocation_nonce`, `environment`, `result`, `reason`, `status`. | Validation must reconcile to an invocation reservation using the same `(decision_id, validated_object_hash, invocation_nonce)`. | Revoked session, continuity, or authority invalidates previously pending validation for execution; validation cannot authorize proof directly. | Replay divergence, validation for stale AEO, duplicate invocation chains, environment drift. | `result` must be `VALID` for execution; hash equals AEO hash; nonce equals invocation lineage; environment is exact when present. | Missing valid row → `NULL`; hash/nonce/environment mismatch → `INVALID`; non-VALID result → `NULL`. | 5 |
| `execution_registry` | Records the single execution attempt for an exact validated object. | `validation_registry`, `invocation_registry`, `aeo_registry`, `authority_registry`, `continuity_registry`, `session_registry`. | `proof_registry`. | `execution_id`, `session_id`, `continuity_id`, `decision_id`, `validated_object_hash`, `invocation_nonce`, `status`. | Unique execution by `(decision_id, validated_object_hash)` blocks duplicate execution; nonce must match validation and invocation lineage. | Revocation before execution blocks execution; revocation after execution blocks proof eligibility unless proof already reconciles to a valid execution and non-revoked lineage policy. | Execution/proof mismatch, replay divergence, duplicate execution, stale invocation consumption. | Executed object hash equals validated object hash; nonce matches validation; execution is exact-object-bound and non-replayable. | Missing execution for proof → `NULL`; duplicate execution → `INVALID`; hash mismatch → `NULL`; reused executable object → `NULL`. | 6 |
| `proof_registry` | Persists proof-of-transfer/evidence for an exact execution and object hash. | `execution_registry`, `validation_registry`, `authority_registry`, `continuity_registry`, `session_registry`, `preo_registry` where applicable. | Observability and external verification; terminal in this map. | `proof_id`, `session_id`, `continuity_id`, `identity_id`, `execution_id`, `decision_id`, `validated_object_hash`, `continuity_hash`, `authority_lineage`, `execution_lineage`, `surface`, `run_id`, `commit_sha`, `workflow`, `environment`. | Proof must bind the same decision/hash pair as execution; duplicate proof for decision/hash is disallowed by canonical uniqueness. | Revoked or mismatched upstream lineage makes proof legitimacy `NULL`; proof must not self-heal missing execution, authority, continuity, or session lineage. | Proof discontinuity, execution/proof mismatch, missing lineage snapshots, duplicate proof rows. | Proof `execution_id`, `decision_id`, and hash exactly match execution; lineage snapshots reconcile to canonical upstream records; no inferred ancestry. | Missing proof after execution → `NULL` for completed transfer evidence; proof without execution → `INVALID`; proof hash mismatch → `NULL`. | 7 |
| `invocation_registry` | Reserves and tracks replay nonce use for a specific decision and exact object hash. | `authority_registry`, `aeo_registry`, `continuity_registry`, `session_registry`. | `validation_registry`, `execution_registry`. | `decision_id`, `validated_object_hash`, `invocation_nonce`, `continuity_id`, `status`, `created_at`. | Primary replay key is `(decision_id, validated_object_hash, invocation_nonce)`; duplicate nonce chains are invalid. | Revocation of session, continuity, or authority invalidates unconsumed invocation lineage; consumed lineage cannot be reused. | Duplicate invocation chains, stale nonce reservation, replay divergence, invocation without validation. | The nonce tuple is unique and exact; consumed or duplicate invocation resolves fail-closed; no nonce may be synthesized during reconciliation. | Missing invocation for validation/execution → `NULL`; duplicate tuple → `INVALID`; consumed reuse → `NULL`. | Overlay before validation and execution |
| `preo_registry` | Records PREO review lineage over a reviewed object hash before authority/proof legitimacy closure. | `continuity_registry`, `authority_registry`. | `proof_registry` via authority lineage evidence. | `preo_id`, `decision_id`, `authority_id`, `continuity_id`, `reviewed_hash`, `canonical_preo`, `status`. | PREO is governance lineage, not an executable replay grant; reviewed hash must reconcile to authority/proof object lineage where required. | Revoked continuity or authority invalidates PREO contribution to proof legitimacy. | Stale PREO lineage, PREO/authority mismatch, reviewed hash drift, orphan PREO. | `decision_id`, `authority_id`, and `continuity_id` match canonical authority; `canonical_preo` hashes deterministically to reviewed lineage; accepted status is explicit. | Missing required PREO → `NULL`; stale or mismatched PREO → `INVALID`; non-accepted PREO → `NULL`. | Overlay between authority and proof |

## 2. Canonical Traversal Order

1. Resolve `session_registry` by exact `session_id`; verify active status and expiry.
2. Resolve `continuity_registry` by exact `continuity_id`; verify identity/session match, status, expiry, revocation, hash, and parent chain.
3. Resolve `authority_registry` by unique `decision_id`; verify session, continuity, identity, status, scope, constraints, and expiry.
4. Resolve `preo_registry` where governance review is required; verify PREO decision, authority, continuity, reviewed hash, and status.
5. Resolve `aeo_registry` by `decision_id` and `validated_object_hash`; verify authority and deterministic canonical AEO hash.
6. Resolve `invocation_registry` by `(decision_id, validated_object_hash, invocation_nonce)`; verify status and continuity lineage.
7. Resolve `validation_registry` by `(decision_id, validated_object_hash, invocation_nonce)`; require `VALID` result and matching environment when an environment is bound.
8. Resolve `execution_registry` by `(decision_id, validated_object_hash)`; verify execution nonce matches invocation and validation.
9. Resolve `proof_registry` by `execution_id`, `decision_id`, and `validated_object_hash`; verify proof lineage snapshots reconcile to upstream records.
10. Emit observability/drift findings without mutating canonical lineage.

## 3. Lineage Integrity Rules

- `session_registry → continuity_registry`: the continuity row must carry the same `session_id` and `identity_id` as the session-bound identity context.
- `continuity_registry → authority_registry`: authority must carry the same `session_id`, `continuity_id`, and `identity_id`; missing lineage is not inferred from `decision_id` alone.
- `authority_registry → aeo_registry`: AEO must carry the same `authority_id` and `decision_id`; AEO status must not outlive invalid authority.
- `aeo_registry → validation_registry`: validation hash must equal the AEO `validated_object_hash` and must not validate an alternate object.
- `validation_registry → execution_registry`: execution hash and nonce must equal validation hash and nonce; the executed object is the validated object or reconciliation returns `NULL`.
- `execution_registry → proof_registry`: proof must reference the exact `execution_id`, `decision_id`, and `validated_object_hash`; proof cannot legitimize an execution by hash-only approximation.
- `preo_registry → authority_registry → proof_registry`: PREO must reconcile to the same decision, authority, continuity, and reviewed object lineage that proof later reports.
- `invocation_registry → validation_registry → execution_registry`: nonce reservation, validation, and execution must share the same tuple and fail closed on duplicate or missing tuple members.

## 4. Replay Lineage Rules

- Replay scope is bound to identity, session, continuity, authority decision, exact object hash, invocation nonce, and target environment.
- The invocation tuple `(decision_id, validated_object_hash, invocation_nonce)` must exist before validation can be treated as replay-aware.
- Execution uniqueness by `(decision_id, validated_object_hash)` prevents a second execution of the same validated object even if a later nonce appears.
- A consumed invocation, revoked continuity, expired authority, duplicate delegation chain, or mismatched environment resolves `NULL`.
- Replay reconciliation is read-only: it reports divergence and does not reserve, consume, repair, or rewrite nonce lineage.

## 5. Revocation Cascade Rules

| Revoked lineage | Required cascade |
| --- | --- |
| Session | Invalidate child continuity, active authority, pending validation, executable lineage, resumable execution, and proof eligibility. |
| Continuity | Invalidate child continuities, delegated authority, AEOs, validations, invocations, executions, and proof eligibility. |
| Authority | Invalidate derived AEO legitimacy, validation acceptance, execution eligibility, and PREO/proof authority lineage. |
| PREO | Invalidate only PREO-contributed governance legitimacy; do not mutate authority, execution, or proof rows. |
| Invocation | Invalidate validation/execution replay eligibility for the specific nonce tuple. |
| Validation | Block execution for the specific exact object and nonce; downstream proof cannot be legitimate without valid execution. |
| Execution | Block proof eligibility for the exact execution; proof rows without valid execution are invalid. |

## 6. Drift Classification Matrix

| Drift class | Detection relationship | Severity | Classification | Required response |
| --- | --- | --- | --- | --- |
| Orphan lineage | Any child row lacks resolvable canonical parent. | Critical | `NULL` legitimacy, `INVALID` relationship. | Stop traversal at orphan edge; record drift evidence. |
| Replay divergence | Invocation, validation, and execution disagree on nonce, object hash, decision, continuity, or environment. | Critical | `NULL`. | Block replay eligibility; do not reconcile by substitution. |
| Proof discontinuity | Proof does not resolve to exact execution or proof lineage snapshots disagree with upstream registries. | Critical | `NULL`. | Mark proof legitimacy incomplete. |
| Authority ancestry drift | AEO/PREO/validation/execution/proof decision or authority lineage disagrees with authority registry. | Critical | `INVALID`. | Stop descendant legitimacy traversal. |
| Continuity ancestry corruption | Continuity hash drift, parent loop, parent missing, session mismatch, or identity mismatch. | Critical | `NULL` or `INVALID` for ambiguous ancestry. | Fail closed before authority traversal. |
| Execution/proof mismatch | Proof execution/hash/decision does not match execution row. | Critical | `NULL`. | Proof is not valid evidence for that execution. |
| Stale PREO lineage | PREO references old authority, continuity, reviewed hash, or non-accepted status. | High | `NULL` for required PREO; `INVALID` for mismatch. | Exclude PREO contribution and block proof closure if required. |
| Duplicate invocation chains | More than one lineage claims the same nonce tuple or multiple nonce chains claim same executable object. | Critical | `INVALID` for duplicate tuple; `NULL` for executable replay. | Block validation/execution replay eligibility. |
| Revocation propagation failure | Descendant active/valid rows remain eligible after upstream revocation. | Critical | `NULL`. | Report cascade drift; do not mutate descendants. |

## 7. Reconciliation Failure Modes

- Missing upstream parent: `NULL` because lineage cannot be recursively reconciled.
- Multiple upstream parents for a unique decision/hash edge: `INVALID` because ancestry is ambiguous.
- Hash instability between canonical object and persisted hash: `NULL` because exact-object binding failed.
- Missing invocation nonce for validation or execution: `NULL` because replay lineage is incomplete.
- Duplicate execution for the same decision/hash: `INVALID` because replay protection failed.
- Proof without exact execution: `INVALID` because evidence is disconnected from transfer.
- Revoked or expired upstream lineage: `NULL` because legitimacy is no longer eligible.
- Stale PREO or mismatched PREO authority: `NULL` or `INVALID` depending on whether the PREO is missing or contradictory.
- Environment mismatch: `NULL` because replay scope is environment-bound where environment is present.
- Parent continuity loop: `INVALID` because deterministic traversal cannot terminate safely.

## 8. Deterministic Reconciliation Requirements

- Traversal must be ordered, acyclic, and parent-first.
- Every object comparison uses deterministic canonical serialization and hash-stable equality.
- Reconciliation reads persisted lineage only; it does not create missing ancestry, update status, reserve nonce, consume nonce, or persist proof.
- Exact object identity is the persisted `validated_object_hash`; alternate derived objects are ignored unless they hash identically under canonical rules.
- All unique lineage anchors must resolve to exactly one row: `decision_id` for authority, `(decision_id, validated_object_hash)` for execution/proof, and `(decision_id, validated_object_hash, invocation_nonce)` for invocation/validation.
- Any unresolved edge returns `NULL`; any ambiguous edge returns `INVALID`; neither may be downgraded to a warning for execution eligibility.

## 9. Cross-Registry Integrity Invariants

1. `validated_object == executed_object`: `aeo_registry.validated_object_hash == validation_registry.validated_object_hash == execution_registry.validated_object_hash == proof_registry.validated_object_hash`.
2. `decision_id` is stable from authority through AEO, invocation, validation, execution, PREO, and proof.
3. `session_id`, `identity_id`, and `continuity_id` remain stable across all persisted legitimacy lineage that carries those fields.
4. `continuity_hash` in proof, when present, equals the canonical continuity hash for the referenced continuity.
5. `authority_lineage` in proof, when present, must reconcile to the canonical authority row and required PREO lineage.
6. `execution_lineage` in proof, when present, must reconcile to the canonical execution row and validation nonce tuple.
7. Revocation is monotonic for eligibility: downstream lineage cannot re-enable an upstream revoked or expired object.
8. Replay state is monotonic for execution: consumed or executed object lineage cannot become executable again through a new registry edge.
9. Validation does not imply execution; execution does not imply proof; proof does not self-authorize legitimacy.
10. Observability records drift; it does not repair or substitute registry lineage.

## 10. Observability Requirements

- Emit drift events with `drift_class`, severity, decision lineage, execution lineage where available, detected-by component, and resolution status.
- Emit observability events for parent resolution failure, hash drift, replay tuple mismatch, revocation cascade drift, proof discontinuity, and duplicate lineage detection.
- Include enough payload to reproduce the traversal path without exposing authority to mutate the runtime: registry name, lookup key, expected parent key, observed parent key, and failure class.
- Preserve read-only diagnostics: observability must not mutate canonical registry rows, consume invocations, or persist proof.
- Maintain terminal clarity: `NULL` means legitimacy cannot be established; `INVALID` means a contradictory or ambiguous relationship was found.

## Canonical Closure Rule

If any lineage edge cannot be recursively reconciled from `session_registry` through `proof_registry`, including PREO and invocation overlays when applicable, legitimacy integrity does not exist and the reconciliation result is `NULL`.
