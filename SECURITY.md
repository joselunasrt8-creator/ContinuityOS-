# Security Policy

## Supported Versions

MindShift is evolving rapidly and security support applies only to actively maintained canonical runtime branches.

| Version | Supported |
| ------- | ---------- |
| main / current runtime | ✅ |
| experimental branches | ⚠️ best effort |
| archived / deprecated branches | ❌ |

---

# Security Philosophy

MindShift is execution legitimacy infrastructure.

Security is not treated as:
- perimeter defense only
- static access control only
- trust-by-default

The system is designed around:

text id="wz7f8m" deterministic validation + non-bypassable execution boundaries + replay resistance + exact-object discipline + proof persistence 

Core invariant:

text id="j9t4vx" If no valid object exists → nothing happens 

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

MindShift assumes:

text id="s4j2pk" capability ≠ authority 

and:

text id="r8n1vz" proposal ≠ execution legitimacy 

Security therefore depends on preserving:

text id="z1m8qe" /authority → /compile → /validate → /execute → /proof 

as the only valid path to state change.

---

# Final Principle

text id="y5c2wr" No bypass path = runtime integrity 
