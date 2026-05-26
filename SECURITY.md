# Security Policy

## Supported Versions

ContinuityOS is evolving rapidly and security support applies only to actively maintained canonical runtime branches.

| Version | Supported |
| ------- | ---------- |
| main / current runtime | ✅ |
| experimental branches | ⚠️ best effort |
| archived / deprecated branches | ❌ |

---

# Security Philosophy

ContinuityOS is distributed legitimacy infrastructure for execution-capable systems.

MindShift remains the canon and research umbrella.
ContinuityOS is the runtime substrate.

Security is not treated as:
- perimeter defense only
- static access control only
- trust-by-default

The system is designed around:

```text
deterministic validation + non-bypassable execution boundaries + replay resistance + exact-object discipline + proof persistence
```

Core invariant:

```text
If no valid object exists → nothing happens
```

---

# Scope of Security Concerns

Security issues include, but are not limited to:

- execution boundary bypasses
- replay vulnerabilities
- authority escalation
- proof forgery
- mutation-after-validation paths
- hidden execution surfaces
- fail-open behavior
- canonicalization inconsistencies
- continuity lineage failures
- registry integrity violations
- unauthorized runtime mutation

---

# Reporting a Vulnerability

Please report vulnerabilities privately before public disclosure.

Include:
- affected component
- reproduction steps
- expected behavior
- observed behavior
- severity assessment
- proof-of-concept if available

Preferred reports are:
- deterministic
- minimal
- reproducible
- bounded in scope

---

# Disclosure Expectations

You can expect:
- acknowledgement of receipt
- investigation of reproducible reports
- clarification requests if needed
- coordinated disclosure for confirmed issues

Not all reports will be accepted.

Reports may be declined if they:
- cannot be reproduced
- rely on unsupported assumptions
- require unrealistic trust violations
- fall outside the defined runtime scope

---

# Responsible Disclosure

Please do not:
- publicly disclose unresolved vulnerabilities
- exploit production systems
- access data you do not own
- perform destructive testing against live environments

The objective is:
- runtime integrity
- ecosystem trust
- deterministic remediation

---

# Security Model

ContinuityOS assumes:

```text
capability ≠ authority
```

and:

```text
proposal ≠ execution legitimacy
```

Security therefore depends on preserving:

```text
/session → /continuity → /authority → /compile → /validate → /execute → /proof
```

as the only valid path to state change.

---

# Final Principle

```text
No bypass path = runtime integrity
```
