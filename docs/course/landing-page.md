# Course Landing Page Outline

> **ContinuityOS Developer Course** — Stop writing `if I can, execute`. Start writing `if this exact object is valid, authorized, and replay-safe — then, and only then, execute`.

---

## Hero

**Headline:**  
Your AI agent can execute. ContinuityOS determines when that execution is legitimate.

**Subheading:**  
An 8-module developer course. Add governed execution to any repo. Block unauthorized mutations at the boundary. Hold cryptographic proof of every state change.

**CTA buttons:**
- [Start Module 1 →](module-1.md)
- [Jump to: I own a CI/CD pipeline →](module-4.md)
- [Jump to: I build AI agents →](module-6.md)

---

## The Problem (2 sentences)

AI agents can call tools. Tools change state. Without a legitimacy boundary, any agent output can become a production mutation — without validation, authorization, or proof.

---

## The Core Shift

| Before | After |
|--------|-------|
| `prompt → execution` | `intent → legitimacy object → validated execution → proof` |
| `capability = authority` | `capability ≠ authority` |
| No proof of authorization | Append-only proof log per execution |
| No replay resistance | Single-use nonce per execution |

---

## What You Will Build

By the end of this course, your repo will:

1. **Refuse** to execute any mutation without a validated, authorized, replay-safe legitimacy object
2. **Emit** a cryptographic proof artifact for every successful execution
3. **Block** unauthorized mutations at the CI gate — fail closed, not open
4. **Pass** the full ContinuityOS conformance suite (30/30 checks)
5. **Hold** a conformance badge showing the boundary is in place

---

## Course Map

| Module | Concept | Time |
|--------|---------|------|
| 1 | Legitimacy Basics — why `capability ≠ authority` | 1h |
| 2 | The Object Model — ATAO, AEO, Authority, Proof | 1h |
| 3 | Exact-Object Validation — canonical hash, NULL on mutation | 1.5h |
| 4 | Governed CI/CD Surface — governed deploy workflow | 1.5h |
| 5 | Proof and Continuity — append-only log, lineage | 1h |
| 6 | Agent Execution Gateway — agent output ≠ authority | 1.5h |
| 7 | Distributed Legitimacy — LOCAL_VALID vs GLOBAL_VALID | 2h |
| 8 | Conformance and Telemetry — run the suite, earn the badge | 1h |

**Total:** ~11 hours + labs

---

## Who This Is For

**Platform / CI/CD engineers** — Replace raw deploy workflows with a governed surface that requires legitimacy inputs. Block deploys that skip the gate.

**AI agent builders** — Route tool calls through the ATAO → AEO gateway. Prevent agent output from becoming direct state changes.

**Open-source maintainers** — Add a conformance badge and proof log. Show contributors that mutations are governed.

**Beginner developers** — Start from Module 1. No prior ContinuityOS knowledge required.

---

## What You Need

- GitHub account
- Basic TypeScript (can read interfaces)
- Familiarity with GitHub Actions

---

## Non-Goals

This course does not:
- Create authority (you do not gain any execution permissions by completing it)
- Teach production hosting or deployment
- Certify legal or security compliance
- Claim that conformance = production security guarantee

---

## Start

[Module 1 — Legitimacy Basics →](module-1.md)
