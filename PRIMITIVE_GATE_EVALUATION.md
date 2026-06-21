# Primitive Gate Evaluation — First Non-Trivially-Substitutable ContinuityOS Primitive

**Artifact type:** `RESEARCH_ARTIFACT`
**Mode:** `NON_OPERATIVE` — evaluates primitives; authorizes nothing.
**Runtime effect:** none · **Legitimacy-state effect:** none · **Authority effect:** none ·
**Execution-path effect:** none · **Schema effect:** none
**Issue:** [#2184 — Research: First Non-Trivially-Substitutable ContinuityOS Primitive](https://github.com/joselunasrt8-creator/ContinuityOS-/issues/2184)
**Date:** 2026-06-21

This document answers #2184. It does **not** authorize implementation, service creation,
runtime mutation, proof creation, adoption claims, or dependency claims. It evaluates only the
primitive.

```text
Research ≠ Implementation
Capability ≠ Dependency
Continuity primitive ≠ Dependency primitive
Substitution-resistant ≠ Dependency-forming
```

---

## Method

### The abundance → scarcity logic (why this question exists)

```text
Abundant  → architecture proof, execution proof, governance proof, demonstration proof
          → every current guarantee (Continuity Merge Guard) is reproducible by
            a flat file + a local script
Scarce    → a guarantee a consumer CANNOT reproduce, and loses if the producer disappears
Question  → what is the smallest continuity guarantee that is non-trivially-substitutable
            AND can form a dependency?
```

The standing finding (`#2184`) is `NO_NON_TRIVIALLY_SUBSTITUTABLE_PRIMITIVE_IDENTIFIED`,
because the current consumable surface's guarantees are all reproducible by a substitute, so
"the substitute wins." This evaluation tests whether that finding still holds against every
candidate primitive, grounded in the actual implementation.

### The gate (every test must be cleared, in order)

A candidate `QUALIFIES` only if it clears **all** of the following. Any single failure ⇒
`REJECT`.

**1. Strict 3-part qualifying gate (all three required):**

| # | Condition | Fails when… |
|---|---|---|
| (a) | The guarantee **survives a trust boundary** | the guarantee only holds inside one process/owner |
| (b) | The consumer **cannot independently recreate** the guarantee | the consumer holds all inputs and can re-derive it locally |
| (c) | **Removing the producer destroys** the guarantee | the guarantee persists without the producer |

**2. Substitution Test** (the operational form of (b)): attempt to reproduce the guarantee
with each trivial substitute. If **any** preserves the guarantee ⇒ `REJECT`.

| Substitute | Preserves guarantee? |
|---|---|
| Flat file | Yes / No |
| Environment variable | Yes / No |
| Cache | Yes / No |
| Local script | Yes / No |

**3. Dependency Test** (necessary, beyond substitution — this is what #2184 ultimately asks):

```text
If the producer disappears:
  Does the consumer lose a capability they cannot reasonably replace?
    YES → continue
    NO  → REJECT
```

Substitution-resistance is necessary but not sufficient. A primitive can resist a one-line
substitute and still create no dependency. Only a candidate that clears the 3-part gate **and**
the Dependency Test is `QUALIFIES`.

### Grounding (the decisive structural fact)

`continuity-core` is a **pure in-memory library**. Every primitive is a deterministic function
over inputs the **caller supplies**:

- `continuity-core/src/replay.rs` — `ReplayRegistry` is an in-memory `BTreeSet<Nonce>` +
  `BTreeSet<ObjectHash>`; `admit()` consumes within one registry instance.
- `continuity-core/src/lineage.rs` — `LineageGraph` is an in-memory `BTreeMap<LineageId, …>`;
  `classify()` returns `Orphan`/`Valid` over nodes the caller inserted.
- `continuity-core/src/proof.rs` — `ProofEnvelope::from_evidence()` hashes caller-supplied
  `ExecutionEvidence`.
- `continuity-core/src/aeo_validation.rs` — `validate_aeo()` is a pure `VALID`/`NULL` decision
  over a caller-supplied object + a caller-supplied `AeoValidationContext`.
- `continuity-core/src/reconciliation.rs` — `classify_reconciliation()` compares
  `expected_hash` vs `observed_hash` from caller-supplied evidence.

No primitive holds state the consumer does not also hold, and none reaches across a boundary
the consumer does not control. This single fact is what every candidate below runs into.

---

## Per-candidate evaluation

Each candidate uses #2184's required output shape: Minimal Topology · Continuity Guarantee ·
Failure Mode · Substitution Analysis · Verdict. Where the failure mode is structurally
identical, the shared root cause is stated once and referenced.

### Shared root cause (R0)

> Every guarantee below is computed by a pure function over inputs the consumer already holds.
> The consumer can run the identical function (`continuity-core` is open and portable) over the
> identical inputs and obtain the identical result without the producer. Therefore (b) fails and
> all four substitutes preserve the guarantee — unless the guarantee is bound to state held by a
> party the consumer does not control. Only the cross-owner candidate (C10) escapes R0 on (a)/(c),
> and it is evaluated on its own merits.

### C1 — Replay-safe validation (single-consumption)

- **Minimal topology:** `nonce+hash → ReplayRegistry.admit() → Unused | Null`
- **Continuity guarantee:** a `(nonce, object_hash)` pair is admitted at most once.
- **Failure mode:** re-submission ⇒ `ReplayState::Null` (`replay.rs`).
- **Substitution analysis:**

  | Substitute | Preserves guarantee? | Why |
  |---|---|---|
  | Flat file | **Yes** | a `seen.txt` set of consumed nonces is exactly what `BTreeSet` is |
  | Env var | Yes (small N) | append consumed nonces to an env-held list |
  | Cache | **Yes** | a keyed cache of consumed nonces is the registry |
  | Local script | **Yes** | 10 lines reproduce `admit()` |

- **Gate:** (a) **FAIL** — single-consumption only holds within one registry the consumer owns.
  No trust boundary is crossed. **Verdict: `REJECT`.**

### C2 — Proof-lineage verification / C3 — Chain-of-proof continuity

- **Minimal topology:** `nodes → LineageGraph.classify(id) → Valid | Orphan(→Null)`
- **Continuity guarantee:** a proof/execution node is `Valid` only if every parent is present
  (no orphan); chain is unbroken.
- **Failure mode:** a missing ancestor ⇒ `Orphan` ⇒ `classify_as_validation` returns `Null`
  (`lineage.rs`).
- **Substitution analysis:** all `Yes` — the consumer holds the nodes; a flat-file adjacency
  list + a reachability script reproduces `classify()` and `ancestors()` exactly.
- **Gate:** (b) **FAIL** (R0). **Verdict: `REJECT`.**

### C4 — Cross-run state verification / C8 — Continuity-lineage checkpoints

- **Minimal topology:** `run_N state → serialized checkpoint → run_N+1 verify`
- **Continuity guarantee:** state from a prior run is carried into the next and verified.
- **Failure mode:** mismatch ⇒ `Divergent`/`Null`.
- **Substitution analysis:** all `Yes` — "carry state across runs and verify it" **is** a flat
  file (the checkpoint) plus a hash compare. The substitute is the canonical implementation.
- **Gate:** (b) **FAIL** (R0); the substitute is definitional. **Verdict: `REJECT`.**

### C5 — Authority-lineage validation

- **Minimal topology:** `object + expected_authority → validate_aeo() → Valid | Null`
- **Continuity guarantee:** all five AEO sub-objects bind the same `authority_id`, scope is
  contained, and the object hash matches (`aeo_validation.rs`).
- **Failure mode:** any authority mismatch / scope overflow / hash mismatch ⇒ `Null`.
- **Substitution analysis:** all `Yes` — `expected_authority` and `maximum_scope` are **supplied
  by the caller**. The consumer who supplies the expected authority can also check it locally.
  The validator asserts consistency; it does not *issue* authority the consumer lacks.
- **Gate:** (b) **FAIL** — the authority root is an input, not a producer-held secret. **Verdict:
  `REJECT`.**

### C6 — Proof-chain reconciliation / C9 — Distributed proof verification

- **Minimal topology:** `expected_hash, observed_hash, lineage/proof flags → classify_reconciliation() → Reconciled | Divergent | Partial | Ambiguous | Null`
- **Continuity guarantee:** observed execution reconciles with the validated object across
  registries.
- **Failure mode:** `expected ≠ observed` ⇒ `Divergent`; missing evidence ⇒ `Partial`
  (`reconciliation.rs`).
- **Substitution analysis:** all `Yes` — reconciliation is a comparison of two hashes plus three
  booleans, all caller-supplied. A local script reproduces it. "Distributed" naming does not
  change this: nothing in the function requires a remote party — it compares values the consumer
  already has.
- **Gate:** (b) **FAIL** (R0). **Verdict: `REJECT`.**

### C7 — Multi-boundary continuity assertions

- **Minimal topology:** `boundary_1 proof → boundary_2 proof → cross-boundary equivalence assertion`
- **Continuity guarantee:** the same validated object crossed multiple surfaces with preserved
  identity (`validated_object == executed_object` across surfaces — the README portability
  claim).
- **Failure mode:** identity divergence at any boundary ⇒ `Null`.
- **Substitution analysis:** all `Yes` — each boundary's check is a local hash equality; asserting
  several of them is still local hash equalities over caller-held objects.
- **Gate:** (b) **FAIL** (R0). **Verdict: `REJECT`.**

### C10 — Cross-repository continuity inheritance  *(the only candidate that escapes R0)*

- **Minimal topology:** `repo A proof chain → trust boundary → repo B accepts/depends on A's continuity`
- **Continuity guarantee (intended):** repo B can treat A's validated continuity as load-bearing
  for B's own merge eligibility, **without B being able to fabricate A's proofs**, because they
  are bound to A's authority/history that B does not control.
- **Failure mode:** broken/forged inheritance ⇒ B's gate fails closed.
- **Why it escapes R0:** this is the one candidate where (a) a trust boundary is genuinely crossed
  (A ≠ B, different owners) and (c) removing the producer would, in principle, destroy the
  inherited continuity.
- **Substitution analysis (current model):**

  | Substitute | Preserves guarantee? | Why |
  |---|---|---|
  | Flat file | **Yes** | the ContinuityOS contribution is `hash(identity)` + classify `VALID/NULL` — B reproduces both locally (`actions/continuity-merge-guard/check.mjs` is portable) |
  | Env var | Yes | the expected authority/identity fields are configuration B already holds |
  | Cache | Yes | a cached prior result is as authoritative as a recomputed one |
  | Local script | **Yes** | B re-runs the same pure validator over the same identity object |

- **Decisive analysis:** In the *proven* external loop
  (`docs/dependency-formation/external-dependency-loop-closure.md`), what B (the
  `continuityos-sandbox` consumer) actually cannot fabricate is **GitHub's required-status-check
  enforcement and artifact store** — i.e. the binding is supplied by *GitHub's* boundary, not by a
  ContinuityOS primitive. ContinuityOS's own contribution to that loop —
  `hash({repo, pr_number, head_sha, base_sha, actor})` then classify `VALID/NULL` — is a pure
  function B can run itself. Strip GitHub's enforcement away and ContinuityOS's guarantee is fully
  locally reproducible.
- **Gate:** (b) **FAIL under the current model** — the non-substitutable enforcement belongs to
  GitHub, not to ContinuityOS; the ContinuityOS-supplied guarantee is locally recreatable.
- **Dependency Test:** if ContinuityOS disappeared, B loses the *packaging* of identity hashing,
  but **not a capability B cannot reasonably replace** — B can compute the same hash and wire the
  same `VALID/NULL` gate in a few lines, keeping GitHub's required-check enforcement. ⇒ **NO.**
- **Verdict: `REJECT` (under the current ContinuityOS model).**

---

## Why all candidates failed

This section is mandatory and its conclusion is first-class: the honest result of the gate may be
that **no** qualifying primitive exists, and the existence of #2184 must not pressure a discovery.

```text
Architecture proof ........... ✓
Execution proof .............. ✓
Governance proof ............. ✓
Demonstration proof .......... ✓
Dependency primitive ......... ✗   ← no non-trivially-substitutable, dependency-forming primitive
```

Two structural reasons, both grounded in code:

1. **Every primitive is a pure function over consumer-held inputs.** `replay.rs`, `lineage.rs`,
   `proof.rs`, `aeo_validation.rs`, and `reconciliation.rs` compute decisions from data the caller
   already possesses, using logic the caller can run (the crate is portable and open). There is no
   producer-held secret, no continuously-updated authoritative state, and no remote attestation in
   the critical path. So condition (b) — "consumer cannot independently recreate" — fails for C1–C9
   by construction, and all four trivial substitutes preserve the guarantee.

2. **The only non-substitutable enforcement in the proven loop is borrowed, not native.** C10 is the
   sole candidate that crosses a real trust boundary, but in the demonstrated external dependency
   loop the irreplaceable component is **GitHub's required-check + artifact infrastructure**, which
   ContinuityOS *rides on* rather than *provides*. ContinuityOS's own contribution there is a hash
   and a classification — both locally reproducible — so it fails the Substitution Test and the
   Dependency Test.

The gap is therefore precise and is **not** an architecture, execution, or governance gap: it is
the absence of a continuity guarantee that ContinuityOS itself makes non-fabricable across an
ownership boundary. Stated in the project's own terms:

```text
Continuity primitive  →  PROVEN   (state carried + verified within a trust domain)
Dependency primitive  →  ABSENT   (state a foreign consumer cannot fabricate and would lose)
```

This matches the standing finding and the live frontier (`DEPENDENCY_TRACKER.md`: outside-owner
dependency is the only open metric; `ROOT.md`: non-priorities forbid new canon/ontology to close
it). The scarce thing is not more architecture — it is a primitive whose continuity only the
producer can vouch for.

### Smallest direction that *would* qualify (noted, not designed — outside #2184's boundary)

For completeness, and **without authorizing or designing** it (that exceeds this research issue):
the only shape that clears all three gate conditions is a continuity guarantee bound to
**producer-held, non-reconstructable state** that a foreign consumer (i) cannot compute from its own
inputs, (ii) cannot obtain from any substitute, and (iii) loses entirely if the producer stops
vouching. A pure, portable, stateless library cannot exhibit this property — which is precisely why
the current model yields no qualifying primitive. Whether such a primitive can exist *without*
becoming a service is the open question for a separate issue.

---

## Determination

```text
NO_QUALIFYING_PRIMITIVE_EXISTS_UNDER_CURRENT_CONTINUITYOS_MODEL
```

- Candidates C1–C9: `REJECT` — pure functions over consumer-held inputs; all trivial substitutes
  preserve the guarantee (condition (b) fails; root cause R0).
- Candidate C10 (cross-repository continuity inheritance): `REJECT` under the current model — the
  non-substitutable enforcement is GitHub's, not ContinuityOS's; the ContinuityOS-supplied guarantee
  is locally reproducible and fails the Dependency Test.
- The architecture/execution/governance/demonstration proofs are unaffected and remain `✓`. The
  absent element is a **dependency primitive**, not a runtime capability.

Both outcomes were admissible; the evidence supports the negative. This artifact creates no
authority, mutates no runtime state, and claims no dependency. It records that, under the current
pure-library model, ContinuityOS has a proven *continuity* primitive and no non-trivially-
substitutable *dependency* primitive.
