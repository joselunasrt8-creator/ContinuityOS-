# ContinuityOS

ContinuityOS is distributed legitimacy infrastructure for execution-capable systems.

ContinuityOS is the runtime infrastructure project derived from the MindShift canon.

MindShift remains the canon and research umbrella.
ContinuityOS is the runtime substrate.

ContinuityOS governs whether state-changing actions are permitted to exist before execution occurs.

Core invariant:

```text
If no valid object exists
→ nothing happens
```

---

# Canonical Runtime Flow

```text
/session
→ /continuity
→ /authority
→ /compile
→ /validate
→ /execute
→ /proof
```

All state-changing execution surfaces are expected to route through this lifecycle.

---

# Core Principles

ContinuityOS runtime is built around:

- deterministic validation
- exact-object discipline
- replay resistance
- fail-closed behavior
- proof persistence
- non-bypassable execution boundaries
- authority integrity
- continuity lineage

Canonical invariant:

```text
validated_object == executed_object
```

Mutation after validation is considered a boundary violation.

---

# Repository Governance

Repository mutation governance is enforced through:

- Apache-2.0 licensing
- CODEOWNERS
- SECURITY.md
- CONTRIBUTING.md
- governed pull request flow
- deterministic validation expectations

Direct mutation paths that bypass review/governance are considered invalid architecture.

---

# Contribution Model

ContinuityOS accepts bounded, reviewable contributions that preserve canonical invariants.

See:

- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODEOWNERS`

---

# Positioning

Canonical external statement:

```text
ContinuityOS is distributed legitimacy infrastructure for execution-capable systems.
```

Execution gate:

```text
VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID
∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE
∧ RECONCILABLE ∧ EPOCH_VALID ∧ CONVERGENCE_VALID
```

ContinuityOS does not replace intelligence. It enforces legitimacy before execution.

MindShift discovered the canon.
ContinuityOS operationalizes it.

---

# Documentation

- `QUICKSTART.md` — Stage 1 and Stage 2 developer quickstart
- `docs/governed-deploy-quickstart.md` — Stage 1 governed deploy walkthrough
- `docs/stage2-legitimacy-vocabulary.md` — 12-state distributed legitimacy vocabulary
- `docs/reconciliation-state-machine.md` — reconciliation state machine
- `docs/topology-visibility-semantics.md` — topology visibility semantics
- `docs/causal-legitimacy-clock-semantics.md` — causal legitimacy clock semantics
- `docs/stage2-conformance-matrix.md` — Stage 2 conformance matrix (CONF-DIST-01–15)
- `docs/stage2-distributed-legitimacy-enforcement-plan-v1.md` — Stage 2 plan
- `docs/glossary.md` — canonical terminology
