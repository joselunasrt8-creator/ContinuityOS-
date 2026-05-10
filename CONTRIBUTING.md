# Contributing to MindShift

Thank you for contributing to MindShift.

MindShift is not traditional application software.

MindShift is:

text Execution Ontology Infrastructure 

Its purpose is to govern whether state-changing actions are allowed to exist before execution occurs.

Core invariant:

text If no valid object exists → nothing happens 

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

text /authority → /compile → /validate → /execute → /proof 

All state-changing execution surfaces must route through this lifecycle.

Direct execution paths are considered invalid architecture.

---

# Contribution Philosophy

MindShift values:

text working structure > claims 

and:

text proof > assumptions 

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

- validator hardening
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

text validated_object == executed_object 

Mutation after validation is considered a boundary violation.

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

MindShift uses deterministic runtime verification principles inspired by infrastructure projects such as FFmpeg FATE.

Expected validation areas include:

- replay resistance
- mutation drift
- authority lifecycle correctness
- proof integrity
- bypass prevention
- fail-closed behavior

---

# Governance

MindShift is evolving toward:

text open legitimacy standards + managed governance infrastructure 

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

MindShift does not attempt to replace intelligence.

MindShift governs legitimacy before execution.

Compressed:

text AI scales cognition MindShift scales legitimacy 

---

# Final Principle

text No structure → no legitimacy → no execution 
