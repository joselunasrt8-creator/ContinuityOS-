# Multi-Agent Coordination Boundary

## Purpose

Define bounded multi-agent coordination for MindShift development and governance without granting agents execution authority.

This artifact is non-operative.

It does not:
- create authority
- validate objects
- execute actions
- generate proof
- mutate runtime state
- expand execution routes

Core coordination rule:

```text
many agents may think
one governed boundary determines existence
```

Canonical boundary:

```text
proposal ≠ authority
capability ≠ permission
AI output ≠ execution legitimacy
```

---

## 1. Agent Role Matrix

| Agent Role | Purpose | Allowed Outputs | Forbidden Actions |
|---|---|---|---|
| Planning Agent | Decompose founder intent into scoped work | issue candidates, scope maps, closure queues | execute code, merge PRs, create authority |
| Architecture Agent | Map canon to implementation requirements | specs, invariant-risk maps, boundary analysis | mutate runtime directly, bypass issue discipline |
| Code Agent | Produce scoped patch proposals | diffs, tests, PR-ready changes | direct deploy, bundled refactors, unscoped mutation |
| Audit Agent | Inspect bypass paths and governance drift | findings, classifications, gap reports | remediate without separate issue |
| Test / FATE Agent | Define deterministic verification | test plans, FATE coverage proposals | weaken assertions, convert fail-closed to permissive |
| Proof / Provenance Agent | Map evidence and lineage | provenance maps, release evidence, proof expectations | fabricate proof, treat observation as execution evidence |
| Documentation Agent | Compress canon and stabilize terms | docs, narratives, diagrams | imply adoption, execution, authority, or state change |
| Continuity Audit Agent | Inspect identity/session/authority lineage | continuity threat maps, revocation gap reports | invalidate or mutate runtime state directly |
| Reconciliation Agent | Compare registry/topology consistency | drift reports, reconciliation maps | authorize execution, mutate legitimacy state |

---

## 2. Agent Permission Matrix

| Permission | Planning | Architecture | Code | Audit | Test/FATE | Proof/Provenance | Docs | Continuity Audit | Reconciliation |
|---|---|---|---|---|---|---|---|---|---|
| Propose | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Analyze | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Classify | yes | yes | limited | yes | yes | yes | yes | yes | yes |
| Draft docs | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Draft code | no | no | yes | no | limited | no | no | no | no |
| Run scoped local tests | no | no | yes | yes | yes | no | no | no | no |
| Create authority | no | no | no | no | no | no | no | no | no |
| Merge PR | no | no | no | no | no | no | no | no | no |
| Deploy | no | no | no | no | no | no | no | no | no |
| Generate proof of execution | no | no | no | no | no | no | no | no | no |

---

## 3. Issue Handoff Protocol

Every agent handoff must preserve:

```text
one issue
→ one branch
→ one PR
→ one invariant
→ one closure
```

Required issue fields:
- invariant
- scope
- non-goals
- affected files
- expected proof
- FATE/test impact
- rollback condition
- completion condition

If any field is missing:

```text
NULL
```

No implementation should begin from an unbounded issue.

---

## 4. PR Handoff Protocol

Every PR must include:
- linked issue
- changed files
- invariant protected
- non-operative or runtime-impact statement
- tests added or test-impact rationale
- proof/provenance expectation
- rollback condition

A PR is invalid if it:
- bundles unrelated work
- alters multiple invariants without scope
- expands execution surfaces without explicit authority
- mutates runtime semantics from documentation scope
- treats review comments as authority

---

## 5. Review Escalation Rules

Escalate review when a change touches:
- authority semantics
- validator behavior
- execution boundary behavior
- proof semantics
- replay semantics
- continuity lineage
- reconciliation semantics
- deployment workflows
- branch/release governance

Escalation output:
- approve
- request changes
- split issue
- classify as NULL

---

## 6. Conflict Resolution Rules

When agents disagree:

1. invariant registry wins over narrative
2. runtime layer separation wins over implementation convenience
3. exact-object discipline wins over patch speed
4. fail-closed behavior wins over permissive behavior
5. human/governed approval boundary wins over agent confidence

If conflict remains unresolved:

```text
NULL
```

---

## 7. Non-Authority Statement

Agents are cognition and proposal surfaces.

Agents do not possess inherent authority.

Agent output may become useful input to governance, but it is not itself governance.

```text
agent proposal
≠
authorized execution
```

---

## 8. Proof / Provenance Expectations

Agents may reference proof requirements.

Agents may not fabricate proof.

Valid evidence may include:
- issue link
- PR link
- commit hash
- test output
- release tag
- registry record
- deployment proof

Observation alone is not proof of execution.

---

## 9. Failure Modes and NULL Conditions

| Failure Mode | NULL Condition |
|---|---|
| agent treats proposal as authority | compile denied |
| agent treats tool access as permission | execution denied |
| agent mutates outside scope | PR invalid |
| agent bundles unrelated invariants | split or NULL |
| agent bypasses review | merge invalid |
| agent claims proof without evidence | proof invalid |
| agent expands runtime semantics from docs | NULL |
| reconciliation agent authorizes execution | NULL |
| continuity audit agent mutates lineage | NULL |

---

## Final Principle

```text
multi-agent cognition may scale

execution authority must not
```
