# OpenClaw Governed Envelope v1 — Structured Planning Artifact (Mode B)

## 1) Intent
Convert `/govern` from non-operative candidate evidence intake into a deterministic governance handoff boundary while preserving the existing `/session → /continuity → /authority → /compile → /validate → /execute → /proof` authority chain.

## 2) Exact Scope (Bounded)
This planning slice defines a **next PR design** only, with no new execution surface:
- Add immutable governed envelope schema and persistence.
- Harden `/govern` replay semantics (nonce domain + anti-rebinding).
- Enforce envelope linkage checks at `/validate` and `/proof`.
- Add explicit fail-closed gates for `POLICY_VALID` and `TOPOLOGY_VISIBLE`.
- Add deterministic conformance vectors for positive + NULL outcomes.

Out of scope:
- No tool execution from `/govern`.
- No authority auto-creation or authority widening.
- No bypass of ATAO/AEO flow.
- No unrelated subsystem refactors.

## 3) Topology Map
Primary mutation-capable path remains:
`/validate → /execute → /proof`

Governance handoff boundary to add:
`/govern (candidate envelope only) -> linkage consumed by /validate and /proof`

Affected surfaces:
- Route logic (`src/index.ts`): `/govern`, `/validate`, `/proof`.
- Canonicalization helper surface (`src/canonical.js`) only if required.
- D1 schema migrations (`migrations/*`) for envelope + replay constraints.
- Conformance vectors/suites for deterministic fail-closed checks.

## 4) Preserved Invariants
- `validated_object == executed_object`.
- No valid continuity lineage => no valid authority => no valid execution.
- If no valid object exists, nothing happens (NULL).
- Execution requires:
  `VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID ∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE ∧ RECONCILABLE`.

## 5) Proposed Data Model
### `govern_envelope_registry`
- `envelope_id` (PK)
- `candidate_hash`
- `candidate_canonical`
- `nonce`
- `nonce_domain`
- `policy_class`
- `policy_digest`
- `topology_attestation_hash`
- `cognition_lineage_hash` (nullable, policy-conditional)
- `continuity_context_hash`
- `status` (`VALID_CANDIDATE` | `NULL`)
- `reason`
- `created_at`

### Replay guard
Either extend existing nonce guard or add dedicated table with constraints:
- `UNIQUE (nonce, nonce_domain)` for domain-scoped replay safety.
- Optional anti-rebinding hardening: `UNIQUE (nonce, nonce_domain, candidate_hash)` depending on desired policy strictness.

### Linkage extension
Add linkage columns to downstream lineage registries (`validation_registry` and/or `proof_registry`):
- `govern_envelope_id`
- `govern_envelope_hash`

## 6) Route-level Predicate Contract
### `/govern`
Fail closed to `NULL` when:
- Missing `X-Nonce`
- Candidate parse/canonicalization failure
- Missing/invalid policy class or digest
- Topology attestation missing/stale
- Nonce replay or nonce rebinding

Success path:
- Persist immutable envelope record
- Emit deterministic telemetry classification/reason code
- Return `VALID_CANDIDATE` only for envelope-valid proposals

### `/validate`
Reject (`NULL`) when:
- Govern envelope linkage absent
- Envelope hash/ID mismatched
- Envelope stale/ambiguous
- Govern candidate projection hash mismatched against validation lineage object

### `/proof`
Reject (`NULL`) when:
- Govern ancestry linkage absent
- Govern ancestry ambiguous/conflicting
- Govern envelope hash not bound to proof lineage

## 7) Exact-object Discipline
Add deterministic equality enforcement:
- Govern projected candidate object hash must equal downstream lineage object hash used for execution.
- Any drift (`govern_candidate_projection_hash != validated/executed_hash`) => fail closed `NULL`.

## 8) Replay-safety Semantics
Required guarantees:
- Same `(nonce, nonce_domain)` cannot be reused.
- Same nonce with different candidate cannot rebind lineage.
- Candidate reuse across unauthorized domains fails.
- Replay branches must emit stable reason codes for deterministic conformance.

## 9) Validation & Conformance Plan (No Execution Here)
### Unit/static route checks
- `/govern`: missing nonce, malformed candidate, missing policy, missing topology => `NULL`.
- `/govern`: replay and rebinding attempts => `NULL`.
- `/validate`: envelope missing/mismatch => `NULL`.
- `/proof`: govern ancestry missing/ambiguous => `NULL`.

### Conformance vectors
- Positive path + each predicate fail-closed branch for:
  `VALID`, `AUTHORIZED`, `UNUSED`, `POLICY_VALID`, `REPLAY_SAFE`, `TOPOLOGY_VISIBLE`, `RECONCILABLE`.
- Exact-object drift vectors.
- Proof replay vectors.

## 10) Suggested File Touch Set for Implementation PR
- `src/index.ts`
- `src/canonical.js` (if helper reuse required)
- `migrations/*` (new envelope/replay migration)
- `conformance/suites/exact-object-interoperability-verification.json`
- `conformance/suites/replay-neutrality-certification.json`
- `conformance/suites/cicd-replay-enforcement.json`
- `conformance/vectors/deterministic-legitimacy-vectors.json`
- Optional docs:
  - `docs/topology/legitimacy-topology.md`
  - `docs/execution-surface-closure.md`
  - `docs/release-provenance-attestation-boundary.md`

## 11) Reconciliation Risks / Open Ambiguities
- Whether anti-rebinding should be strict `(nonce, domain)` global lock or allow idempotent replay for exact same candidate hash.
- Precise staleness semantics for topology attestation (time/window/source of truth).
- Policy rules for when `cognition_lineage_hash` is mandatory vs optional.
- Which registry (`validation_registry`, `proof_registry`, or both) should be canonical linkage authority.

## 12) Proposed Next PR Title
**OpenClaw Governed Envelope v1: replay-safe exact-object handoff with proof/topology binding**
