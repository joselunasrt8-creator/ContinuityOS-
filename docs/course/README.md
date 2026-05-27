# ContinuityOS Developer Course

> AI systems can execute. ContinuityOS determines when execution is legitimate.

## What This Course Is

An 8-module, 9-lab path that teaches you to add **distributed legitimacy infrastructure** to any repo that executes code on behalf of an intent.

By the end, your repo will refuse to execute any mutation that has not been validated, authorized, and assigned a replay-safe nonce. You will hold a conformance report proving it.

## The Core Shift

| Before | After |
|--------|-------|
| `prompt → execution` | `intent → legitimacy object → validated execution → proof → continuity` |
| capability = authority | capability ≠ authority |
| "I can, therefore I will" | "This exact object is valid, authorized, and replay-safe — therefore, and only then, execute" |

## Audience Paths

| Your role | Start here | Exit outcome |
|-----------|------------|--------------|
| **Beginner developer** | Module 1 | Run conformance checks against a starter repo |
| **Platform / CI/CD engineer** | Module 4 | Replace raw deploy workflow with governed-deploy template |
| **Agent builder** | Module 6 | Route agent tool calls through ATAO → AEO gateway before mutation |
| **Open-source maintainer** | Module 4 | Add conformance badge + proof log; block direct mutation |

## Prerequisites

- GitHub account
- Basic TypeScript (can read interfaces and async/await)
- Familiarity with GitHub Actions syntax

No prior knowledge of ContinuityOS is required.

## Module Map

| # | Module | Core concept | Time |
|---|--------|--------------|------|
| [1](module-1.md) | Legitimacy Basics | capability ≠ authority; intent → legitimacy object | 1h |
| [2](module-2.md) | The Object Model | ATAO, Authority, AEO, ValidationResult, Proof, ReplayRecord | 1h |
| [3](module-3.md) | Exact-Object Validation | canonical serialization, hashing, validated_object == executed_object | 1.5h |
| [4](module-4.md) | Governed CI/CD Surface | governed deploy workflow, proof_required, nonce, blocking | 1.5h |
| [5](module-5.md) | Proof and Continuity | proof artifact, append-only log, continuity lineage | 1h |
| [6](module-6.md) | Agent Execution Gateway | agent output ≠ authority; tool call → ATAO → AEO → gateway | 1.5h |
| [7](module-7.md) | Distributed Legitimacy | LOCAL_VALID vs GLOBAL_VALID, topology, replay, reconciliation | 2h |
| [8](module-8.md) | Conformance & Telemetry | CONF-DIST checks, public report, dependency measurement | 1h |

**Total:** ~11 hours of instruction + labs

## Lab Map

| Lab | What you build |
|-----|----------------|
| [L1](labs/lab-1.md) | Create a legitimacy object from an intent description |
| [L2](labs/lab-2.md) | Canonicalize and hash an AEO |
| [L3](labs/lab-3.md) | Validate exact object; observe NULL on mutation |
| [L4](labs/lab-4.md) | Block invalid mutation in CI |
| [L5](labs/lab-5.md) | Add governed deploy to your own repo fork |
| [L6](labs/lab-6.md) | Emit a proof artifact for a valid action |
| [L7](labs/lab-7.md) | Run the full conformance suite |
| [L8](labs/lab-8.md) | Agent gateway integration *(optional)* |
| [L9](labs/lab-9.md) | Install-base telemetry *(optional)* |

## Final Project

Add ContinuityOS/MindShift to an external demo repo of your choice.

**Requirements:**
1. Fork or create a public repo with at least one state-changing operation
2. Install the governed deploy workflow template from `templates/governed-deploy.yml`
3. Define a legitimacy object for the state change
4. Validate it — demonstrate that a mutated object returns NULL
5. Emit a proof artifact (append to proof log)
6. Run conformance suite and paste the report
7. *(Optional)* Add the conformance badge to your README

**Acceptance:** your repo must fail closed on any unapproved mutation.

## Core Invariants You Will Learn

```
If no valid object exists → nothing happens

validated_object == executed_object

capability ≠ authority

Proof existence ≠ distributed finality

Execution allowed only if:
  VALID
  ∧ AUTHORIZED
  ∧ UNUSED
  ∧ POLICY_VALID
  ∧ REPLAY_SAFE
  ∧ TOPOLOGY_VISIBLE
  ∧ RECONCILABLE
  ∧ EPOCH_VALID
  ∧ CONVERGENCE_VALID
  Else → NULL
```

## Non-Goals

This course does **not**:
- Create authority (completing the course does not authorize any execution)
- Teach production hosting
- Certify legal or security compliance
- Provide enterprise deployment support
- Imply real-world adoption has occurred

## Glossary

See [`docs/glossary.md`](../glossary.md) for canonical definitions of all terms.

## Conformance Reference

See [`docs/stage2-conformance-matrix.md`](../stage2-conformance-matrix.md) for the full CONF-CICD and CONF-DIST check specifications.
