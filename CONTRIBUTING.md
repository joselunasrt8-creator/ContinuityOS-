# Contributing to ContinuityOS

Thank you for contributing to ContinuityOS.

ContinuityOS is not traditional application software.

ContinuityOS is runtime infrastructure derived from the MindShift canon.

Its purpose is to govern whether state-changing actions are allowed to exist before execution occurs.

Core invariant:

```text
If no valid object exists → nothing happens
```

---

# Core Principles

All contributions must preserve:

- deterministic validation
- exact-object discipline
- replay resistance
- fail-closed behavior
- non-bypassable execution boundaries
- proof coherence
- authority integrity

Contributions that weaken these properties will not be accepted.

---

# Canonical Runtime Flow

```text
/session → /continuity → /authority → /compile → /validate → /execute → /proof
```

All state-changing execution surfaces must route through this lifecycle.

Direct execution paths are considered invalid architecture.

---

# Contribution Philosophy

ContinuityOS values:

```text
working structure > claims
```

and:

```text
proof > assumptions
```

The project prioritizes:
- correctness
- clarity
- deterministic behavior
- bounded scope
- runtime integrity

over:
- hype
- uncontrolled abstraction
- unnecessary complexity

---

# Allowed Contributions

Examples:

- ContinuityOS validator hardening
- replay protection improvements
- deterministic canonicalization
- proof persistence
- schema validation
- observability improvements
- FATE tests
- execution surface mapping
- PREO/SCO governance
- continuity lineage
- runtime documentation
- policy infrastructure

---

# Forbidden Contribution Patterns

Do NOT introduce:

- hidden execution paths
- implicit authority
- direct deploy bypasses
- mutable validated objects
- execution without proof
- uncontrolled autonomous execution
- silent mutation of canonical schemas
- fail-open behavior

---

# Exact-Object Discipline

Canonical invariant:

```text
validated_object == executed_object
```

Mutation after validation is considered a boundary violation.

---

# Codex Execution Protocol

Codex-assisted closure work must follow the repository execution protocol in `docs/codex-execution-protocol.md`.

Required closure invariant:

```text
one issue → one branch → one PR → one invariant → one FATE expansion
```

Codex PRs must:

- use exactly one issue-scoped branch
- open exactly one issue-scoped PR
- protect exactly one stated invariant
- add or update deterministic FATE/static coverage for that invariant
- avoid bundled refactors and unrelated cleanup
- report changed files, tests added, invariant protected, and follow-up gaps as separate issue candidates

Codex documentation-governance work must not modify runtime logic, canonical routes, authority behavior, proof behavior, replay behavior, validator behavior, reconciliation behavior, or schema behavior unless the scoped issue explicitly requires it.

---

# Pull Request Expectations

All PRs should:

- define clear scope
- preserve canonical invariants
- minimize execution surface expansion
- include rationale
- include validation evidence
- avoid unrelated mutation

Where appropriate:
- add replay tests
- add drift tests
- add validator coverage
- add proof verification

---

# Testing

ContinuityOS uses deterministic runtime verification principles inspired by infrastructure projects such as FFmpeg FATE.

Expected validation areas include:

- replay resistance
- mutation drift
- authority lifecycle correctness
- proof integrity
- bypass prevention
- fail-closed behavior

## Test tiers (issue #2079)

The suite is reachable through explicit, tiered npm scripts so small edits get
fast local feedback while full legitimacy coverage stays available for
merge/release readiness:

| Command | Scope | Use for |
|---|---|---|
| `npm run test:smoke` | Curated fast subset (CLI surface + core legitimacy / authority / SA-derivation / governance-bundle smoke) | Local edit feedback — runs in well under a second |
| `npm run test:runtime` | `tests/` root + reconciliation + conformance | Runtime legitimacy validation |
| `npm run test:governance` | `tests/fate/**` (GMA / merge / proof / authority / continuity) | Governance validation |
| `npm test` / `npm run test:full` | Entire suite (`node --import tsx --test`) | Full merge/release readiness — the load-bearing CI gate |

Notes:

- `npm test` and `npm run test:full` are identical and run the complete suite.
  The CI required check (`Runtime conformance suite (npm test)`) runs this full
  suite, so full runtime + governance coverage gates every merge — these tiers
  are additive convenience, they remove no coverage (issue #2079, additive
  phase; see `governance/operational-risk/REQUIRED_CHECK_TOPOLOGY_AUDIT_2066.md`).
- `test:runtime` / `test:governance` are partitions for targeted feedback. The
  suite is not yet strictly run-order-isolated, so a tier run can surface a
  slightly different pass/fail count than the full run; the full run
  (`npm test` / `test:full`) remains the authoritative gate.

---

# Governance

MindShift remains the canon and research umbrella.
ContinuityOS is the runtime substrate.

The repository is public to support:
- transparency
- auditability
- interoperability
- ecosystem trust
- shared legitimacy standards

Public access does not imply unrestricted runtime authority.

---

# Security

If you discover:
- bypass paths
- replay vulnerabilities
- proof inconsistencies
- authority escalation paths
- continuity failures

please disclose responsibly through a private security report before public disclosure.

---

# Architectural Direction

ContinuityOS does not attempt to replace intelligence.

ContinuityOS governs legitimacy before execution.

Compressed:

```text
AI scales cognition
ContinuityOS scales legitimacy
```

---

# Final Principle

```text
No structure → no legitimacy → no execution
```
