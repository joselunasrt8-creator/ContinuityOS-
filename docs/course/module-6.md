# Module 6 — Agent Execution Gateway

**Duration:** ~1.5 hours  
**Lab:** [L8 — Agent gateway integration *(optional)*](labs/lab-8.md)

---

## Learning Objectives

By the end of this module you will be able to:

1. Explain why LLM output is not authority
2. Describe the ATAO pattern and when it is created
3. Trace the path from agent tool call → ATAO → AEO → validation → gated execution
4. Identify the gateway boundary in `gateway.js`
5. Explain what makes the gateway non-bypassable

---

## 6.1 The Problem: Agent Output Is Not Authority

When an LLM produces a tool call, the call looks authoritative:

```json
{
  "tool": "deploy",
  "arguments": {
    "environment": "production",
    "repo": "my-org/my-repo",
    "branch": "main"
  }
}
```

This looks like an instruction. It is not authorization.

The model produced this output because it was trained to produce outputs that look like this. It has no knowledge of:
- Whether the caller has deploy permissions
- Whether the target environment is in scope
- Whether this exact object has been validated
- Whether the nonce has been consumed
- Whether the continuity lineage is intact

**Treating model output as authorization is the most common legitimacy failure in AI-native systems.**

---

## 6.2 The ATAO Pattern

When an agent's tool call arrives at the gateway, the first thing that happens is it is captured as an **ATAO** — an Agent Tool Action Object.

The ATAO is the structured representation of the intent before any authority is bound:

```typescript
interface DeployATAO {
  intent: string                    // "deploy production worker"
  scope: {
    env: string                     // "production"
    type: "DEPLOY_INTENT"
  }
  target: {
    repo: string
    branch: string
    sha: string
  }
  constraints: {
    max_duration_seconds: number
    rollback_on_failure: boolean
  }
  authority_reference: string       // reference to an Authority that must be bound
  continuity_reference: string      // continuity lineage this action belongs to
  risk_class: string                // "PRODUCTION_DEPLOY"
}
```

**Key invariant:** The ATAO is not a request to execute. It is a declaration of intent that must pass the full compile → validate → execute chain before any state change occurs.

**Code reference:** [`src/governed-deploy.ts`](../../src/governed-deploy.ts)

---

## 6.3 The Gateway Boundary

The gateway (`gateway.js`) is the integration surface between external agent frameworks and the legitimacy runtime.

```
External agent (LLM, automation, human)
              ↓
      gateway.js boundary
              ↓
         ATAO creation
              ↓
       /compile → AEO
              ↓
      /validate → ValidationResult
              ↓
   Only if VALID: /execute
              ↓
        /proof emission
```

The gateway does not accept raw tool calls for execution. Every tool call that crosses the boundary is converted to an ATAO, compiled to an AEO, and validated before execution is attempted.

**Code reference:** [`gateway.js`](../../gateway.js)

---

## 6.4 Why the Gateway Is Non-Bypassable

The governance module boundary enforcement (`src/governance-module-boundary-enforcement.ts`) ensures that:

1. No execution route is reachable without passing through the validation step
2. No AEO can be executed without a matching `validated_object_hash` in the validation registry
3. No bypass path is available — `BYPASS_PATHS.json` defines what must be blocked and the conformance suite checks for it

**Code reference:** [`src/governance-module-boundary-enforcement.ts`](../../src/governance-module-boundary-enforcement.ts), [`BYPASS_PATHS.json`](../../BYPASS_PATHS.json)

---

## 6.5 OpenClaw-Style Integration

External agent frameworks (LangChain, AutoGPT-style, custom tool-calling systems) can plug into the gateway at the ATAO boundary.

The integration contract is:
1. Agent framework captures tool call output
2. Framework passes tool call to `gateway.js` `handleToolCall()` function
3. Gateway converts tool call to ATAO using the tool's declared schema
4. Gateway submits ATAO to the compile → validate → execute chain
5. Gateway returns either the execution result or a NULL signal to the framework
6. Framework does not execute the tool call directly — it waits for the gateway result

```javascript
// Example integration contract
const result = await gateway.handleToolCall({
  tool: "deploy",
  arguments: { environment: "production", repo: "...", branch: "..." },
  caller_context: { continuity_id: "...", authority_reference: "..." }
});

if (result.status === "NULL") {
  // Gateway refused — no state change occurred
  throw new Error("Tool call not authorized: " + result.reason);
}
// Only reach here if execution was legitimately authorized
```

---

## 6.6 What Happens When the Gateway Refuses

If the gateway returns NULL at any step in the chain:

- The tool call is not executed
- No state change occurs
- The agent framework receives a NULL signal
- The agent can surface this to the human in the loop
- The reason is logged (missing authority, hash mismatch, consumed nonce, etc.)

The agent cannot retry by simply calling the tool again — the nonce is consumed on the first attempt. Re-execution requires a new authority binding and a new AEO compilation, which requires a new governance decision.

---

## 6.7 The Agent Cannot Create Its Own Authority

A critical invariant: **the agent cannot produce its own authority binding.**

The agent produces the ATAO. The authority must come from outside the agent — from a governance process, a human approval, or a policy engine.

```
Agent output (ATAO) ──────────────────────────────┐
                                                   │
Governance process (human or policy engine) ───┐  │
                                               │  │
                                         Authority binding
                                               │
                                         /compile
                                               │
                                              AEO
```

If the agent could produce its own authority, the legitimacy chain would be circular. The boundary between "agent declared intent" and "governance granted authority" is where the human-in-the-loop lives.

---

## 6.8 Agent Tool Envelope

ContinuityOS supports governed tool envelopes — a structured format for wrapping tool calls with legitimacy metadata before they enter the gateway.

**Code reference:** [`src/lib/aeo-governance.ts`](../../src/lib/aeo-governance.ts) — governed tool envelope registry

The envelope contains:
- The original tool call (intent)
- The authority reference
- The continuity reference
- The envelope hash (for exact-object discipline)

The gateway unwraps the envelope, verifies the hash, then proceeds with ATAO construction.

---

## Knowledge Check

1. An LLM produces `{ "tool": "delete_table", "arguments": { "table": "users" } }`. Under what circumstances can this tool call result in the `users` table being deleted?
2. Why can't the agent produce its own authority binding?
3. What does the gateway return when the validation step returns NULL?

---

## Code to Read

- [`gateway.js`](../../gateway.js) — the gateway boundary and `handleToolCall()` integration surface
- [`src/governed-deploy.ts`](../../src/governed-deploy.ts) — `DeployATAO`, `DeployAEO`, `DeployValidatorPredicates`
- [`src/governance-module-boundary-enforcement.ts`](../../src/governance-module-boundary-enforcement.ts) — boundary enforcement logic
- [`BYPASS_PATHS.json`](../../BYPASS_PATHS.json) — blocked bypass paths (read this to understand what the enforcement prevents)

---

## Next

[Module 7 — Distributed Legitimacy](module-7.md): extend the legitimacy chain across multiple nodes — LOCAL_VALID vs GLOBAL_VALID, topology visibility, replay in a distributed system, and reconciliation.
