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

# Recorded Demo Evidence

The output below is a real run of `npm run demo` from a clean checkout
(`demo/portability/filesystem-governed-execution.mjs`). It is shown here so
the governed-execution wedge can be evaluated without running anything.

Full transcript (clone → `npm install` → `npm run demo`):
[`demo/portability/RECORDED_DEMO.md`](demo/portability/RECORDED_DEMO.md)

## VALID — execution + proof

```json
{
  "status": "EXECUTED",
  "target_path": "governed/filesystem-write-gateway/seed.md",
  "bytes_written": 49,
  "receipt_id": "sha256:11d01f34c0a16ee6f2d280b6306170e9bba7c211a0ca1ba11fe7971bff7353a5",
  "validated_object_hash": "sha256:e41c6e2d731642223b6f1a1a0a05058a6042b176c19a4eefe5545b49cf82fadc",
  "executed_object_hash": "sha256:e41c6e2d731642223b6f1a1a0a05058a6042b176c19a4eefe5545b49cf82fadc",
  "exact_object_preserved": true,
  "proof_persisted": true,
  "lineage_persisted": true,
  "proof_lineage_bound": true
}
```

`validated_object_hash == executed_object_hash` — the object that was
validated is the exact object that was executed. A proof receipt and a
lineage node were both persisted and are bound to each other.

## REPLAY_NULL — execution blocked, no proof

The same `replay_nonce` is resubmitted with different content.

```json
{
  "agent_visible_response": {
    "result": "NULL",
    "execution_performed": false,
    "proof_emitted": false,
    "correlation_id": "null_evt_cef02c9657297af9fd3e3e055240a2c5"
  },
  "operator_audit_record": {
    "reason_class": "REPLAY_NULL",
    "stage": "replay",
    "denial_reason": "REPLAY_NONCE_CONSUMED"
  },
  "no_new_proof": true,
  "no_new_lineage": true
}
```

The agent receives only a bounded, non-enumerating NULL response. The full
diagnostic detail (`reason_class`, `stage`, `denial_reason`) is recoverable
by an operator from the internal audit registry via `correlation_id`, but is
never exposed to the calling agent.

## POLICY_NULL — execution blocked, no proof

A write to a denied path (`wrangler.toml`) is attempted.

```json
{
  "agent_visible_response": {
    "result": "NULL",
    "execution_performed": false,
    "proof_emitted": false,
    "correlation_id": "null_evt_9b3ffaa49994d4381d79dda187b19cdb"
  },
  "operator_audit_record": {
    "reason_class": "POLICY_NULL",
    "stage": "validate",
    "denial_reason": "PATH_NOT_ALLOWED"
  },
  "no_new_proof": true,
  "no_new_lineage": true
}
```

Same bounded shape, same fail-closed result: no write, no proof, no lineage —
regardless of *why* execution was denied.

## Agent runtime integration: LangChain

The same governed route is wired into a LangChain tool
(`@langchain/core/tools` `DynamicStructuredTool`). The tool has no
filesystem-write code of its own — `tool.invoke(...)` only calls
`POST /gateway/tool/filesystem-write` and returns the result.

```bash
npm run demo:langchain
```

See [`demo/integrations/langchain/README.md`](demo/integrations/langchain/README.md)
for the integration guide and [`governed-filesystem-tool.mjs`](demo/integrations/langchain/governed-filesystem-tool.mjs)
for the tool implementation.

## Portability: second mutation surface (GitHub issue comment)

The same execution contract — ATAO → AEO → Ω validator (`VALID`/`NULL`) →
execution boundary → proof — also holds for a structurally different
mutation surface: creating a comment on a GitHub issue.

```bash
npm run demo:portability:github
```

```json
{
  "status": "EXECUTED",
  "target_owner": "joselunasrt8-creator",
  "target_repo": "mindshift-demo",
  "target_issue_number": 1954,
  "validated_object_hash": "sha256:50b536ace02934020397ea3498d626a7eab28c5325958a131593e0a90425f29a",
  "executed_object_hash": "sha256:50b536ace02934020397ea3498d626a7eab28c5325958a131593e0a90425f29a",
  "exact_object_preserved": true,
  "comment_id": "demo-comment-0001",
  "comment_url": "https://github.com/joselunasrt8-creator/mindshift-demo/issues/1954#issuecomment-demo-0001"
}
```

Same contract shape, second mutation surface: `validated_object_hash ==
executed_object_hash`, and a `VALID`/`NULL` validator boundary, now applied to
an external GitHub API mutation instead of a local filesystem write. See
[`demo/portability/README.md`](demo/portability/README.md#portability-second-mutation-surface-github-issue-comment)
for details and scope notes.

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
