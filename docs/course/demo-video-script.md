# Demo Video Script

**Target length:** 8–10 minutes  
**Audience:** Developers seeing ContinuityOS for the first time  
**Goal:** Show the mutation → NULL moment in under 10 minutes; end with course CTA

---

## [0:00 – 0:45] Hook — The Problem

**[Screen: code editor showing a simple deploy workflow]**

> "This workflow deploys to production on every push to main. It has full credentials. It works. And it has no idea whether the deploy was ever authorized."

**[Screen: highlight the `on: push` trigger]**

> "If an LLM writes a push, or a bot, or a misconfigured automation — this deploys. No check. No proof. No way to audit whether this exact deploy was legitimately requested."

> "That is the capability-equals-authority assumption. ContinuityOS replaces it."

---

## [0:45 – 2:00] The Core Concept

**[Screen: simple diagram — intent → legitimacy object → validated execution → proof]**

> "The model: instead of 'if I can, execute', we require 'if this exact object is valid, authorized, and replay-safe — then, and only then, execute'."

> "Three things must be true before any mutation happens:"
> 1. "A legitimacy object exists for this exact action"
> 2. "The object has been validated against authority"
> 3. "The nonce is unused — this is the first and only time this object is used"

> "If any of these fails, the result is NULL. The mutation does not happen."

---

## [2:00 – 4:00] The Mutation → NULL Moment

**[Screen: terminal, runtime running]**

> "Let me show you this in real time."

**[Screen: POST to /compile with valid AEO]**

> "I compile a legitimacy object for a production deploy. I get back a hash — SHA-256 of the canonical form of this exact object."

**[Screen: POST to /validate, show VALID response]**

> "I validate. The runtime checks the authority, the nonce, all nine predicates. Result: VALID."

**[Screen: mutate one field in the object — change branch name]**

> "Now I'm going to mutate one field. Change the branch from 'main' to 'attacker-branch'. Recompute the hash."

**[Screen: show the two hashes side by side — different]**

> "Different hash. The object changed."

**[Screen: POST to /validate with mutated hash]**

> "I submit the mutated hash to validate. Result..."

**[Screen: NULL response]**

> "NULL. The runtime found no compiled AEO with that hash. The mutation was detected. No execution."

> "This is what 'validated_object equals executed_object' looks like in practice."

---

## [4:00 – 5:30] The Governed CI/CD Surface

**[Screen: GitHub Actions, governed-deploy.yml]**

> "The same invariant applies to CI/CD. The governed deploy workflow requires three inputs before it runs at all: decision ID, validated object hash, invocation nonce."

**[Screen: trigger workflow with empty inputs]**

> "If I trigger it without inputs..."

**[Screen: GitHub Actions job failed — NULL signal on first step]**

> "Hard fail. No deploy step runs. NULL on the first line."

> "The CI surface fails closed. Not 'fails with an error you can catch and retry'. Fails closed — nothing happens."

---

## [5:30 – 7:00] The Proof

**[Screen: POST to /execute, then /proof]**

> "When a legitimately authorized execution does happen, it produces a proof. An append-only record: this decision hash, this execution ID, this continuity lineage, this timestamp."

**[Screen: proof_registry query showing one row]**

> "One row. No delete. No update. One proof per execution. The nonce is consumed — this exact execution cannot be replayed."

---

## [7:00 – 8:30] The Course

**[Screen: course README module map]**

> "This is an eight-module course that teaches you to add this infrastructure to any repo."

> "Module 1 through 3: the concepts — capability versus authority, the object model, exact-object validation."

> "Module 4 and 5: CI/CD and proof — the governed deploy workflow, append-only proof log."

> "Module 6 and 7: agents and distribution — routing AI tool calls through the gateway, distributed finality."

> "Module 8: conformance — running the 30-check suite and earning the badge."

> "By the end, your repo will hold a conformance report showing it fails closed on unauthorized mutations."

---

## [8:30 – 9:00] CTA

**[Screen: course landing page]**

> "Start at Module 1. If you own CI/CD pipelines, jump to Module 4. If you build AI agents, jump to Module 6."

> "The course takes about 11 hours. The mutation-returns-NULL moment takes about 30 minutes. That's Lab 3."

> "[link to course]"
