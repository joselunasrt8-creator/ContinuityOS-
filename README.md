# ContinuityOS

AI systems can decide what to do.
ContinuityOS governs whether they are allowed to do it.

---

# Try the Governed Demo

The fastest way to see the runtime in action is the governed filesystem demo. It
requires no Cloudflare credentials and runs against the existing
`POST /gateway/tool/filesystem-write` route.

```bash
npm install
npm run demo
```

Expected output:

```
VALID        → proof receipt + lineage node, validated_object_hash == executed_object_hash
Replay NULL  → no new proof, no new lineage
Policy NULL  → fails closed, no proof, no lineage
```

See `demo/portability/README.md` for details and
`docs/issues/first-installable-path.md` for the design rationale.

---

# What You Just Saw

```text
Agent
→ Proposed Action
→ Validation
→ Execution Boundary
→ Proof
```

A proposed action is only executed if it passes validation. If validation
fails — a replayed nonce, a denied path — nothing executes and nothing is
recorded.

---

# Core Invariants

```text
If no valid object exists
→ nothing happens
```

```text
validated_object == executed_object
```

Mutation after validation is considered a boundary violation.

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

ContinuityOS is the runtime infrastructure project derived from the MindShift canon.
MindShift remains the canon and research umbrella; ContinuityOS is the runtime
substrate. ContinuityOS governs whether state-changing actions are permitted to
exist before execution occurs.

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

---

# External Demo: Portable Legitimacy Conformance Evidence

This repository contains a portable conformance harness demonstrating that
legitimacy observability infrastructure can operate outside the canonical runtime
with minimal dependency friction.

## What this demonstrates

- Conformance pack-v1 executes with no dependency on the canonical runtime
- Governance evidence artifacts are emitted deterministically
- CI-visible evidence is published on every pack-relevant change
- Governance vocabulary is portable before runtime adoption occurs

## What this does NOT demonstrate

- Runtime legitimacy
- Authority issuance
- Execution permission
- Distributed proof finality
- Deployment

## Running the conformance harness

Requirements: Node.js >= 18, shell.

```bash
node conformance/pack-v1/harness.mjs
```

or via the runner script:

```bash
./scripts/run-conformance.sh
```

Expected output (all vectors passing):

```
CONFORMANCE_EVIDENCE_OBSERVED
VALIDATION_FAIL_CLOSED_CONFIRMED
REPLAY_CONSUMPTION_PRESERVED
PROOF_APPEND_ONLY_CONFIRMED
CONVERGENCE_CLASSIFICATION_CORRECT
PACK_V1_CONFORMANCE_COMPLETE
```

Evidence artifact written to: `conformance/pack-v1/conformance-pack-v1-evidence.json`
Reference snapshot at: `evidence/latest.json`

---

# Governance Boundary

```text
conformance evidence  ≠  authority
badge                 ≠  execution permission
observability         ≠  legitimacy
fixture pass          ≠  runtime governance
visibility            ≠  legitimacy
```

The conformance harness is:

- **Evidence-only** — it reads static fixtures and emits structured output
- **Non-operative** — it does not create authority, perform deployment, or mutate runtime state
- **Fail-closed** — if any vector fails, the harness exits non-zero and CI fails

The purpose is observability, comparability, and governance vocabulary portability.
Not runtime governance, authority issuance, or distributed proof finality.

---

# Install-Base Interpretation

Install base is **not**:

- stars
- downloads
- chatbot usage
- prompts

Install base **is**:

```text
workflow dependency
+
execution dependency
+
governance dependency
```

Install-base expansion starts when external systems depend on your governance vocabulary
before they depend on your runtime.

This repository is the first external proof that legitimacy observability infrastructure
is portable — demonstrating governance vocabulary can become an external dependency
surface before runtime adoption occurs.
