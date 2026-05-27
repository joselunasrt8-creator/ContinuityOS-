# Module 1 — Legitimacy Basics

**Duration:** ~1 hour  
**Lab:** [L1 — Create a legitimacy object](labs/lab-1.md)

---

## Learning Objectives

By the end of this module you will be able to:

1. Explain why `capability ≠ authority`
2. Explain why `visibility ≠ authority`
3. Explain why `prompt ≠ execution`
4. Describe what a legitimacy object is and why it exists
5. State the fail-closed default: if no valid object exists → nothing happens

---

## 1.1 The Default Danger

Most software that executes on behalf of an intent follows this pattern:

```
prompt / request / trigger
        ↓
    execution
```

The system checks whether it *can* do something, then does it.

This is fine when:
- The system is small
- The action is reversible
- The agent is a human who can be held accountable

It is dangerous when:
- An LLM or autonomous agent produces the prompt
- The action is a deployment, a write, a deletion, or a financial operation
- The path from intent to execution is automated and fast

**The problem is not that the system is capable. The problem is that capability is being treated as authority.**

---

## 1.2 Capability ≠ Authority

Having the API key does not authorize the action.  
Having the deploy token does not authorize the deploy.  
Having write access to the repo does not authorize the mutation.

These are **capabilities** — they describe what the system *can* do.

**Authority** is different. Authority is a declared, validated, scoped permission to perform a specific action at a specific time on a specific target.

> Without authority, capability is just potential energy waiting for an accident.

ContinuityOS enforces this boundary. Before any state change can occur, a legitimate authority object must exist for that exact change.

---

## 1.3 Visibility ≠ Authority

A common mistake in distributed systems: assuming that *observing* an action authorizes it.

- A webhook arrives describing a deployment. Does receiving it mean the deployment is authorized? No.
- A log entry shows a previous execution succeeded. Does that authorize re-execution? No.
- A topology node shows a validator saw the action. Does topology visibility grant authority? No.

ContinuityOS makes this explicit:

```
visibility ≠ authority
```

Seeing something happened is observability. Authorizing something to happen is a separate act that requires a legitimacy object.

---

## 1.4 Prompt ≠ Execution

In AI-native systems, the default collapse is:

```
LLM output → tool call → state change
```

This is the most dangerous pattern. The LLM is capable of producing any output. That output must not be treated as authorization.

ContinuityOS introduces a mandatory boundary:

```
LLM output (intent)
      ↓
  ATAO (Agent Tool Action Object)
      ↓
  Authority binding
      ↓
  AEO (Atomic Execution Object)
      ↓
  Validation
      ↓
  Execution (only if VALID)
      ↓
  Proof
```

Each step in this chain is non-bypassable. You will build this chain in Modules 2–6.

---

## 1.5 The Legitimacy Object

A **legitimacy object** is the artifact that turns intent into a validated execution candidate.

It contains:
- **intent** — what is being attempted (human-readable)
- **scope** — what resources are in scope
- **validation** — the criteria that must be satisfied
- **target** — the exact target of the action
- **finality** — how the result should be recorded

A legitimacy object is not a request. It is a declaration of intent that will be cryptographically hashed, validated against authority, checked for replay safety, and — only if all conditions pass — executed.

If any condition fails, the result is `NULL`. Nothing happens.

---

## 1.6 Fail-Closed Default

ContinuityOS uses a **fail-closed** default throughout:

```
If no valid legitimacy object exists → nothing happens
```

This means:
- Missing object → NULL (not an error that can be caught and retried freely)
- Malformed object → NULL
- Mutated object → NULL
- Expired object → NULL
- Replayed object → NULL
- Unauthorized object → NULL

NULL is not an exception. It is the expected safe state when legitimacy cannot be established.

> The system that fails open is the one that acts when it shouldn't.  
> The system that fails closed is the one that refuses to act when it can't be certain.

---

## 1.7 The Legitimacy Predicate Gate

The full gate that guards every execution in ContinuityOS:

```
VALID
∧ AUTHORIZED
∧ UNUSED          (invocation nonce not previously consumed)
∧ POLICY_VALID    (matches declared policy)
∧ REPLAY_SAFE     (nonce not replayed)
∧ TOPOLOGY_VISIBLE (executing node visible in registry)
∧ RECONCILABLE    (continuity lineage intact)
∧ EPOCH_VALID     (epoch is current)
∧ CONVERGENCE_VALID (distributed state has converged)
→ GLOBAL_VALID candidate

Else → NULL
```

All nine conditions must be true. A single failure returns NULL.

You will learn each predicate in Modules 3–7.

---

## 1.8 Why This Matters for AI Systems

As AI agents gain the ability to invoke tools, deploy code, send messages, and modify state, the question "was this authorized?" becomes critical.

ContinuityOS provides a deterministic answer:

- Either a valid, authorized, replay-safe, epoch-valid legitimacy object exists for this exact action
- Or the action does not happen

This is not about slowing down AI systems. It is about ensuring that speed does not come at the cost of accountability.

---

## Knowledge Check

1. A system has an API key with full write access to a production database. Does this mean it has *authority* to delete records? Why or why not?

2. An LLM produces a tool call that says `{ "action": "deploy", "target": "production" }`. What must happen before this tool call can result in a deployment?

3. What does ContinuityOS return when a legitimacy object fails any condition?

---

## Code to Read

- [`docs/glossary.md`](../glossary.md) — canonical definitions of all terms used in this module
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — legitimacy invariants section
- [`SECURITY.md`](../../SECURITY.md) — fail-closed behavior and replay resistance

---

## Next

[Module 2 — The Object Model](module-2.md): learn the exact types that make up a legitimacy object (ATAO, Authority, AEO, ValidationResult, Proof, ReplayRecord).
