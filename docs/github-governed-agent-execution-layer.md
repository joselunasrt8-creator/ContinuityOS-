# GitHub-Native Governed Agent Execution Layer

## Objective

Define a deterministic governance layer between agent/tooling surfaces (Codex, Cursor, Claude Code, Copilot, CI/CD, PRs, merge) and production execution so that execution only occurs when legitimacy is proven.

Core gate:

`VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID` else `NULL`.

## Architecture topology

1. Human Intent
2. Input Shaping
3. Authority Binding
4. ATAO
5. AEO
6. Ω Validation
7. Execution Boundary
8. Proof-of-Execution
9. Registry Persistence
10. Merge Governance
11. Runtime Reality

## Canonical execution pipeline

Canonical mutation path:

`/authority → /compile → /validate → /execute → /proof`

Control properties:

- proposal never implies execution
- validation object hash must equal executed object hash
- execution objects are single-use via replay nonce/consumption semantics
- proofs are append-only and replay-checked

## GitHub Actions integration model

### Pull request boundary

- `.github/workflows/merge-governance-check.yml` classifies changed surfaces.
- Workflow generates PREO/SCO candidate objects bound to exact PR head SHA.
- If governed paths are touched, SCO is mandatory.
- Merge governance artifacts must parse and exist, fail-closed on absence.

### Deploy boundary

- `.github/workflows/prepare-governed-deploy.yml` prepares bounded decision + continuity + authority + validated hash + nonce.
- `.github/workflows/governed-deploy.yml` performs runtime calls in canonical order and rejects any non-canonical state.

## Canonical schema binding

`governance/runtime/AGENT_EXECUTION_GOVERNANCE_MODEL.json` declares:

- canonical invariants
- execution gate expression
- PR governance object bindings
- registry persistence obligations
- fail-closed requirements
- MCP integration allow/deny boundaries

## Merge governance enforcement layer

Required merge evidence:

- authoritative identity + decision linkage
- PREO/SCO candidate closure
- validation status closure
- proof existence and lineage consistency
- immutable SHA continuity (validated SHA == merged SHA)

Any mismatch yields deterministic rejection (`NULL`/blocked merge).

## Proof registry structure

Minimum persisted lineage tuple:

- who proposed
- who validated
- who authorized
- what executed
- validated object hash
- executed object hash
- proof identifier
- replay nonce state

Constraint: `validated_object_hash == executed_object_hash`.

## Replay-safe merge protections

- single-use authority and nonce consumption
- rejection of reused decision IDs / invocation nonce
- deterministic dedupe + quarantine on duplicate proof attempts
- immutable head SHA lock between validation and merge

## MCP integration boundaries

Allowed MCP interactions:

- read PR metadata
- read CI status
- submit governed artifacts

Forbidden MCP interactions:

- direct merge
- direct deploy
- post-validation mutation

## Multi-agent coordination model

- agents may propose artifacts only
- authority remains explicit and externalized
- validation remains deterministic and independent of agent origin
- execution is blocked unless proof chain and policy gates close

## Failure-state analysis (fail-closed)

- missing governance object => `NULL`
- policy violation => blocked
- replayed authority/proof/nonce => blocked + quarantine
- post-validation mutation => invalid + blocked
- missing proof persistence => non-mergeable/non-deployable

## Attack surface analysis

Key attack classes and response:

1. **Implicit authority escalation**: blocked by mandatory authority object binding.
2. **PR head-sha swap after validation**: blocked by SHA continuity lock.
3. **Replay of execution inputs**: blocked by single-use nonce/authority semantics.
4. **Observability-to-authority abuse**: blocked by GET-only non-authoritative observability contract.
5. **Hidden deploy paths**: blocked by canonical workflow/ref and route assertions.

## Deterministic checkpoints

- checkpoint 1: PR artifact generation (PREO/SCO)
- checkpoint 2: authority issuance
- checkpoint 3: compile hash derivation
- checkpoint 4: validation closure
- checkpoint 5: execute boundary
- checkpoint 6: proof persistence
- checkpoint 7: merge/deploy admissibility

All checkpoints fail-closed on missing or divergent state.
