# Continuity Coding Protocol Primitive Map v1

## 1. Purpose
This document is a **non-operative topology/planning primitive map** that compresses repository complexity into invariant-preserving coding primitives. It maps canonical and governance-adjacent surfaces without introducing runtime enforcement, authority, validator changes, execution expansion, or legitimacy-state mutation.

## 2. Core Compression
Great infrastructure compresses complexity into small deterministic primitives:
1. **Intent as typed object, not prose** — implementation intent must be machine-checkable.
2. **Scope as explicit write-set** — bounded file/path surface before mutation.
3. **Invariants as deterministic checks** — fail closed to `NULL` on invariant break.
4. **Mutation as minimal diff** — smallest topology-visible change.
5. **Proof as artifact** — evidence object required for persistence claims.
6. **Continuity as merge gate** — lineage continuity required before merge legitimacy.

## 3. Mutation-Capable Surfaces
Canonical runtime mutation path (declared):
- `/session`
- `/continuity`
- `/authority`
- `/compile`
- `/validate`
- `/execute`
- `/proof`

Governance-adjacent surface in scope for topology mapping:
- `/govern` (candidate/governed envelope surface; treated as non-operative evidence/control-plane in this map).

Surface classification (primitive responsibility):
- **Mutation-capable**: `/session`, `/continuity`, `/authority`, `/compile`, `/validate`, `/execute`, `/proof`
- **Topology-visible**: all above + `/govern`
- **Continuity-dependent**: `/authority`, `/compile`, `/validate`, `/execute`, `/proof`

## 4. Authority Boundaries
Authority-bearing progression is strictly lineage-bound:
- `/authority` is the explicit authority-issuing boundary.
- `/compile`, `/validate`, `/execute`, `/proof` consume authority lineage and must not imply independent authority creation.
- `/govern` can propose/classify/attest candidate objects, but **proposal is not permission**.

Boundary primitives:
- **visibility ≠ authority**
- **proposal ≠ permission**
- No valid continuity lineage → no valid authority → no valid execution.

## 5. Replay-Risk Surfaces
Replay-sensitive surfaces (object or nonce reuse risk):
- `/validate` (validation-object binding and freshness scope)
- `/execute` (invocation replay barriers)
- `/proof` (proof replay and persistence duplication barriers)
- `/govern` (candidate envelope replay risk in governance/control-plane workflows)

Replay primitive:
- Any replay-unsafe lineage resolves to `NULL` (non-admission).

## 6. Required Proof Artifacts
Proof-producing and proof-dependent surfaces:
- **Proof-producing**: `/proof`
- **Proof-dependent for durable legitimacy claims**: `/execute` → `/proof`
- **Topology/control evidence**: `/govern` artifacts are evidence, not execution authority.

Minimum artifact bundle for continuity coding:
- typed intent object
- explicit write-set
- invariant check results
- minimal diff record
- lineage references (continuity/authority/validated object)
- proof artifact pointer/hash

## 7. Continuity / Merge Gates
Merge legitimacy is continuity-gated:
- Continuity lineage must be present and reconcilable.
- Authority lineage must derive from valid continuity.
- Executed object must remain hash/identity-equal to validated object.
- Proof artifact must exist for persistence assertions.

Gate primitive:
- If continuity is not reconcilable and topology-visible, merge result is `NULL`.

## 8. Minimum Invariant Suite
Required deterministic invariants:
- If no valid object exists → nothing happens.
- `validated_object == executed_object`.
- No valid continuity lineage → no valid authority → no valid execution.
- No ATAO → No AEO → NULL.
- `VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE` else → `NULL`.
- `visibility ≠ authority`.
- `proposal ≠ permission`.
- proof required for persistence.

## 9. Non-Operative Boundary
This artifact is **documentation-only** and **non-operative**:
- does not alter runtime route behavior
- does not execute deployment
- does not create authority
- does not change validators
- does not mutate legitimacy state
- does not widen execution semantics
- does not create proof
- does not imply runtime enforcement exists

## 10. Final Compression
Vibe coding:
prompt → broad mutation → drift → chaos

Continuity coding:
**intent → bounded object → validated change → proof → lineage → reconciliation**

Operational compression statement:
- Complexity is absorbed by six primitives: **intent, scope, invariants, minimal mutation, proof, continuity gate**.
- Canonical surfaces (`/session` → `/proof`) and governance-adjacent `/govern` are mapped by mutation, authority, replay, topology, proof, and continuity responsibilities without changing execution semantics.
