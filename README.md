# ContinuityOS

<p align="center">
  <img
    src="figures/continuityos-runtime-banner.png"
    alt="ContinuityOS runtime flow: validate, govern, execute, prove"
    width="100%">
</p>

ContinuityOS is legitimacy infrastructure for execution-capable systems.

Its core purpose is to decide whether an exact proposed state-changing action is currently eligible to execute, fail closed when required legitimacy conditions are not satisfied, preserve exact-object identity across the boundary, and emit proof and lineage after successful execution.

This repository contains a Cloudflare Worker and D1-backed runtime, conformance harnesses, portable demos, and governance artifacts for validating state-changing actions before execution.

The current implementation demonstrates bounded runtime properties on specific execution surfaces. Broader distributed-legitimacy semantics in this repository remain architecture and conformance claims unless and until exercised on the corresponding real runtime path.

---

## Quick Start

Use these paths to evaluate the runtime without reading the full repository first.

| Demo | Purpose | Command | More information |
| --- | --- | --- | --- |
| Governed Filesystem Demo | Shows the existing `POST /gateway/tool/filesystem-write` route enforcing validation before a local filesystem mutation. | `npm install`<br>`npm run demo` | [`demo/portability/README.md`](demo/portability/README.md), [`docs/issues/first-installable-path.md`](docs/issues/first-installable-path.md) |
| StateGate | Provides a packaged GitHub Action that checks a pull request identity object and optional author policy, then returns `VALID` or `NULL` with a proof artifact. | See workflow example below. | [`actions/continuity-merge-guard/README.md`](actions/continuity-merge-guard/README.md) |
| LangChain Integration | Wires the same governed filesystem route into a LangChain `DynamicStructuredTool`; the tool itself contains no filesystem-write logic. | `npm run demo:langchain` | [`demo/integrations/langchain/README.md`](demo/integrations/langchain/README.md), [`governed-filesystem-tool.mjs`](demo/integrations/langchain/governed-filesystem-tool.mjs) |
| GitHub Portability Demo | Applies the same execution contract to a second mutation surface: creating a GitHub issue comment. | `npm run demo:portability:github` | [`demo/portability/README.md`](demo/portability/README.md#portability-second-mutation-surface-github-issue-comment) |

### Governed Filesystem Demo

The fastest way to see the runtime in action is the governed filesystem demo. It requires no Cloudflare credentials and runs against the existing `POST /gateway/tool/filesystem-write` route.

```bash
npm install
npm run demo
```

Expected output:

```text
VALID        → proof receipt + lineage node, validated_object_hash == executed_object_hash
Replay NULL  → no new proof, no new lineage
Policy NULL  → fails closed, no proof, no lineage
```

### StateGate

A second installable wedge: a packaged GitHub Action that checks a pull request's identity object (`repo`, `pr_number`, `head_sha`, `base_sha`, `actor`) plus optional explicit author policy (`author-kind`, `require-agent-authored`), hashes it, and returns `VALID` or `NULL` (fail-closed) with a proof artifact — designed to be added as a required status check.

```yaml
- uses: joselunasrt8-creator/stategate@v1
  with:
    repo: ${{ github.repository }}
    pr-number: ${{ github.event.pull_request.number }}
    head-sha: ${{ github.event.pull_request.head.sha }}
    base-sha: ${{ github.event.pull_request.base.sha }}
    actor: ${{ github.event.pull_request.user.login }}
```

`@v1` is the published, pinnable StateGate version. Use a pinned version for any consumer that treats the result as load-bearing (a required status check).

#### Compatibility

StateGate intentionally preserves several machine-readable legacy `MERGE_GUARD_*` identifiers, including proof artifact names, proof record types, proof IDs, and existing required-check names such as `merge-guard`. These are replay, proof-compatibility, and integration surfaces rather than public branding. They remain unchanged until a future versioned migration explicitly sequences replacement identifiers without breaking existing proofs, branch protection, or downstream consumers.

#### Live external consumer

[`joselunasrt8-creator/continuityos-sandbox`](https://github.com/joselunasrt8-creator/continuityos-sandbox) historically installed the predecessor action at `@v0.1.0` and made `merge-guard` a **required** status check on its `main` branch — `LOAD-BEARING_ACTIVE`. Real PRs in that repo have exercised both outcomes: a `VALID` result allows merge, and a `NULL` result reports `failure` and leaves the PR `blocked`. See that repo's `LOAD_BEARING_READINESS.md` and `NULL_ENFORCEMENT_PROOF.md` for the evidence.

---

## What is ContinuityOS?

AI systems and automation can generate proposed actions. ContinuityOS sits at the execution-legitimacy boundary and asks a narrower question:

> Does this exact proposed action currently possess the required legitimacy to execute?

The minimal runtime shape is:

```text
Execution Candidate
        ↓
Authority
        ↓
Execution Eligibility
        ↓
Execution Boundary
        ↓
Proof + Reconciliation
```

A proposed action is not executable merely because it is intelligent, useful, syntactically valid, or policy-shaped. It must satisfy the applicable legitimacy conditions for the exact object and current state.

### Canonical runtime flow

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

## Core Invariants

> [!IMPORTANT]
> If no valid object exists<br>
> → nothing happens

> [!IMPORTANT]
> `validated_object == executed_object`

> [!CAUTION]
> Mutation after validation<br>
> → boundary violation

> [!IMPORTANT]
> Replay<br>
> → `NULL`

These invariants define the intended execution boundary. Whether every claimed predicate is operational on every surface is an empirical question and must be demonstrated per surface.

---

## Runtime Architecture

```text
Agent / Automation
        ↓
Exact Execution Candidate
        ↓
ContinuityOS Runtime
        ↓
┌────────────┬───────────┬────────┬────────┬────────┐
│ Validation │ Authority │ Replay │ Policy │ Proof  │
└────────────┴───────────┴────────┴────────┴────────┘
        ↓
Execution Eligibility
        ↓
Execution Surface
        ↓
Proof + Reconciliation
```

Candidate execution gate:

```text
VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID
∧ REPLAY_SAFE ∧ TOPOLOGY_VISIBLE
∧ RECONCILABLE ∧ EPOCH_VALID ∧ CONVERGENCE_VALID
```

Where a required predicate is not yet represented canonically or exercised on the selected surface, ContinuityOS must fail closed or return a bounded blocker rather than infer legitimacy.

ContinuityOS does not replace intelligence. It governs execution eligibility.

---

## Demonstrated vs Candidate Capabilities

### Demonstrated in this repository

The repository includes concrete evidence for bounded behaviors including:

- exact-object preservation on the governed filesystem demo;
- replay rejection on the governed filesystem demo;
- policy-based rejection on the governed filesystem demo;
- proof and lineage emission after successful execution;
- a second mutation surface using the GitHub issue-comment portability demo;
- deterministic StateGate validation for exact pull request state.

### Candidate / broader architecture

The repository also contains semantics and conformance work for broader legitimacy concerns including:

- distributed authority;
- topology visibility;
- reconciliation;
- causal/epoch validity;
- convergence semantics;
- multi-surface lifecycle enforcement.

Those concepts should not be interpreted as fully operational merely because they are documented, modeled, or covered by static/conformance fixtures. Runtime support must be demonstrated on the exact effect path where the claim is made.

---

## Core Principles

- deterministic validation
- exact-object execution
- replay resistance
- fail-closed behavior
- proof persistence
- non-bypassable execution boundaries where operationally enforced
- authority integrity
- continuity lineage
- evidence before architectural promotion

---

## Repository Layout

| Path | Description |
| --- | --- |
| `demo/` | Governed execution demos, portability examples, and integration examples. |
| `runtime/` | Runtime-facing implementation area where present in the repository topology. |
| `gateway/` | Gateway-facing execution boundary area where present in the repository topology. |
| `actions/` | Installable GitHub Actions, including Continuity StateGate. |
| `docs/` | Canon, implementation plans, semantics, audits, and adoption documentation. |
| `conformance/` | Portable conformance packs, vectors, suites, and evidence artifacts. |
| `cli/` | Command-line entry points and SDK helpers. |
| `continuity-core/` | Rust core primitives and conformance tests. |
| `.github/` | CI workflows, issue templates, and repository automation. |

---

## Documentation

| Document | Purpose |
| --- | --- |
| [`QUICKSTART.md`](QUICKSTART.md) | Stage 1 and Stage 2 developer quickstart. |
| [`docs/governed-deploy-quickstart.md`](docs/governed-deploy-quickstart.md) | Stage 1 governed deploy walkthrough. |
| [`docs/stage2-legitimacy-vocabulary.md`](docs/stage2-legitimacy-vocabulary.md) | 12-state distributed legitimacy vocabulary. |
| [`docs/reconciliation-state-machine.md`](docs/reconciliation-state-machine.md) | Reconciliation state machine. |
| [`docs/topology-visibility-semantics.md`](docs/topology-visibility-semantics.md) | Topology visibility semantics. |
| [`docs/causal-legitimacy-clock-semantics.md`](docs/causal-legitimacy-clock-semantics.md) | Causal legitimacy clock semantics. |
| [`docs/stage2-conformance-matrix.md`](docs/stage2-conformance-matrix.md) | Stage 2 conformance matrix (`CONF-DIST-01`–`15`). |
| [`docs/stage2-distributed-legitimacy-enforcement-plan-v1.md`](docs/stage2-distributed-legitimacy-enforcement-plan-v1.md) | Stage 2 plan. |
| [`docs/glossary.md`](docs/glossary.md) | Canonical terminology. |

---

## Position in Continufy

ContinuityOS is the legitimacy and execution-boundary project within the broader Continufy research and engineering program.

It is not derived from MindShift, and MindShift does not confer legitimacy on ContinuityOS. The repositories have separate responsibilities:

```text
LLM Layer
→ capability

MindShift
→ context / cognition governance
→ candidate models and intent candidates

ContinuityOS
→ legitimacy infrastructure
→ execution eligibility
→ execution boundary
→ proof / reconciliation
```

SYNAPSE may provide structural evidence where relevant, but it is not a mandatory runtime dependency. MindShift may improve candidate context or cognition, but it does not authorize execution. Continufy provides the umbrella/business direction, not runtime authority.

The production topology should be treated as evidence-dependent. A component belongs on the runtime path only if repeated execution demonstrates that it adds necessary value at that boundary.

---

## Recorded Demo Evidence

The output below is a real run of `npm run demo` from a clean checkout (`demo/portability/filesystem-governed-execution.mjs`). It is shown here so the governed-execution wedge can be evaluated without running anything.

Full transcript (clone → `npm install` → `npm run demo`): [`demo/portability/RECORDED_DEMO.md`](demo/portability/RECORDED_DEMO.md)

### VALID — execution + proof

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

`validated_object_hash == executed_object_hash` — the object that was validated is the exact object that was executed. A proof receipt and a lineage node were both persisted and are bound to each other.

### REPLAY_NULL — execution blocked, no proof

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

The agent receives only a bounded, non-enumerating NULL response. The full diagnostic detail (`reason_class`, `stage`, `denial_reason`) is recoverable by an operator from the internal audit registry via `correlation_id`, but is never exposed to the calling agent.

### POLICY_NULL — execution blocked, no proof

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

Same bounded shape, same fail-closed result: no write, no proof, no lineage — regardless of *why* execution was denied.

### GitHub portability evidence

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

Same contract shape, second mutation surface: `validated_object_hash == executed_object_hash`, and a `VALID`/`NULL` validator boundary, now applied to an external GitHub API mutation instead of a local filesystem write.

---

## Conformance

This repository contains a portable conformance harness demonstrating that legitimacy observability infrastructure can operate outside the canonical runtime with minimal dependency friction.

### What this demonstrates

- Conformance pack-v1 executes with no dependency on the canonical runtime.
- Governance evidence artifacts are emitted deterministically.
- CI-visible evidence is published on every pack-relevant change.
- Governance vocabulary is portable before runtime adoption occurs.

### What this does not demonstrate

- Runtime legitimacy.
- Authority issuance.
- Execution permission.
- Distributed proof finality.
- Deployment.

### Running the conformance harness

Requirements: Node.js >= 18, shell.

```bash
node conformance/pack-v1/harness.mjs
```

or via the runner script:

```bash
./scripts/run-conformance.sh
```

Expected output (all vectors passing):

```text
CONFORMANCE_EVIDENCE_OBSERVED
VALIDATION_FAIL_CLOSED_CONFIRMED
REPLAY_CONSUMPTION_PRESERVED
PROOF_APPEND_ONLY_CONFIRMED
CONVERGENCE_CLASSIFICATION_CORRECT
PACK_V1_CONFORMANCE_COMPLETE
```

Evidence artifact written to: `conformance/pack-v1/conformance-pack-v1-evidence.json`<br>
Reference snapshot at: `evidence/latest.json`

### Governance Boundary

```text
conformance evidence  ≠  authority
badge                 ≠  execution permission
observability         ≠  legitimacy
fixture pass          ≠  runtime governance
visibility            ≠  legitimacy
```

The conformance harness is:

- **Evidence-only** — it reads static fixtures and emits structured output.
- **Non-operative** — it does not create authority, perform deployment, or mutate runtime state.
- **Fail-closed** — if any vector fails, the harness exits non-zero and CI fails.

The purpose is observability, comparability, and governance vocabulary portability. Not runtime governance, authority issuance, or distributed proof finality.

---

## Repository Governance and Contribution Model

Repository mutation governance is enforced through:

- Apache-2.0 licensing
- `CODEOWNERS`
- `SECURITY.md`
- `CONTRIBUTING.md`
- governed pull request flow
- deterministic validation expectations

Direct mutation paths that bypass review/governance are considered invalid architecture.

ContinuityOS accepts bounded, reviewable contributions that preserve canonical invariants. See [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md), and [`CODEOWNERS`](CODEOWNERS).

---

## Install-Base Interpretation

Install base is **not** stars, downloads, chatbot usage, or prompts.

Install base **is**:

```text
workflow dependency
+
execution dependency
+
governance dependency
```

Install-base expansion begins when external systems materially depend on ContinuityOS for a real workflow or execution boundary. Conformance portability, demos, and same-owner integrations are useful evidence, but they are not by themselves independent external adoption or economic value.
