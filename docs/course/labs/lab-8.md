# Lab 8 — Agent Gateway Integration *(Optional)*

**Module:** 6  
**Estimated time:** 45 minutes  
**Prerequisites:** Runtime running locally; Labs 1–6 complete  
**Difficulty:** Intermediate

---

## Goal

Simulate an LLM tool call, capture it as an ATAO, route it through the gateway, and observe that the gateway gates execution — preventing direct mutation from agent output.

---

## Background

The gateway (`gateway.js`) is the integration surface between external agents and the legitimacy runtime. An agent produces a tool call. The gateway converts it to an ATAO, compiles it to an AEO, validates it, and gates execution.

**Code reference:** [`gateway.js`](../../../gateway.js)

---

## Setup

```bash
export API_KEY=your-local-api-key
export BASE_URL=http://localhost:8787
```

---

## Steps

### Step 1 — Simulate an agent tool call

In a new file `lab-8-agent-output.json`, write what an LLM might produce:

```json
{
  "tool": "deploy",
  "arguments": {
    "environment": "staging",
    "repo": "my-org/my-repo",
    "branch": "feature-branch"
  },
  "call_id": "call_abc123"
}
```

This represents raw agent output — intent, but not authorization.

### Step 2 — Read the gateway code

Open `gateway.js` and find:
- The `handleToolCall()` function
- Where the ATAO is constructed from the tool call
- Where `/compile` is called
- Where `/validate` is called
- What the gateway returns when validation returns NULL

### Step 3 — Trace the gateway flow manually

Without calling the gateway directly, trace what would happen:

1. `handleToolCall({ tool: "deploy", arguments: {...} })` is called
2. Gateway constructs ATAO: `{ intent: "deploy staging", scope: {...}, target: {...}, ... }`
3. Gateway calls `/compile` with the ATAO and a pre-existing authority
4. Gateway calls `/validate` with the compiled hash
5. If VALID → gateway calls `/execute`
6. If NULL at any step → gateway returns NULL to caller

### Step 4 — Call the gateway with a pre-compiled authority

First, prepare an authority using the Lab 3 steps (session → continuity → authority).

Then call the gateway:

```bash
node -e "
const gateway = require('./gateway.js');

gateway.handleToolCall({
  tool: 'deploy',
  arguments: { environment: 'staging', repo: 'my-org/my-repo', branch: 'feature-branch' },
  caller_context: {
    continuity_id: process.env.CONTINUITY_ID,
    authority_id: process.env.AUTHORITY_ID,
    base_url: process.env.BASE_URL,
    api_key: process.env.API_KEY
  }
}).then(result => {
  console.log('Gateway result:', JSON.stringify(result, null, 2));
}).catch(err => {
  console.error('Gateway error:', err.message);
});
" BASE_URL=$BASE_URL API_KEY=$API_KEY CONTINUITY_ID=$CONTINUITY_ID AUTHORITY_ID=$AUTHORITY_ID
```

### Step 5 — Attempt to bypass the gateway

Try calling `/execute` directly without going through `/compile` and `/validate`:

```bash
curl -sf -X POST "$BASE_URL/execute" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"decision_id\": \"fake-decision-id\",
    \"validated_object_hash\": \"fake-hash\",
    \"invocation_nonce\": \"$(node -e 'console.log(require(\"crypto\").randomUUID())')\"
  }" | jq .
```

**Expected:** `"status": "NULL"` — no AEO exists with a fake decision_id.

---

## Expected Results

| Scenario | Expected |
|----------|----------|
| Gateway with valid authority | Proceeds to execution; returns execution result |
| Gateway without authority | Returns NULL at compile or validate step |
| Direct `/execute` with fake inputs | Returns NULL |

---

## What You Proved

Agent output cannot directly trigger execution. The gateway is the only path from agent intent to execution, and it enforces the full legitimacy chain.

---

## Next

[Lab 9 — Install-base telemetry *(optional)*](lab-9.md) or [Final Project](../README.md#final-project).
