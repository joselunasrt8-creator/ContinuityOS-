# Lab 6 — Emit a Proof Artifact for a Valid Action

**Module:** 5  
**Estimated time:** 30 minutes  
**Prerequisites:** Runtime running locally; Lab 3 complete (you have a valid DECISION_ID and HASH)

---

## Goal

Complete a full 7-step legitimacy lifecycle — session → continuity → authority → compile → validate → execute → proof — and verify that a proof row exists in the `proof_registry`.

---

## Background

A proof is only emitted after a successful execution. The sequence is:

```
/session → /continuity → /authority → /compile → /validate → /execute → /proof
```

Each step is required. You cannot skip to `/proof` directly.

**Code reference:** [`src/index.ts`](../../../src/index.ts) — all seven routes

---

## Setup

```bash
export API_KEY=your-local-api-key
export BASE_URL=http://localhost:8787
```

---

## Steps

### Steps 1–5 — Complete the chain (reusing Lab 3 steps)

Run steps 1–5 from Lab 3 to get a valid `DECISION_ID`, `HASH`, and `NONCE`.

Alternatively, if you have these values from Lab 3, export them:

```bash
export DECISION_ID=<your-decision-id-from-lab-3>
export HASH=<your-hash-from-lab-3>
export NONCE=<your-nonce-from-lab-3>
```

> **Note:** If you already consumed the nonce in Lab 3, generate new values using the full sequence from Lab 3 steps 1–5.

### Step 6 — Execute

```bash
EXECUTE_RESULT=$(curl -sf -X POST "$BASE_URL/execute" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"decision_id\": \"$DECISION_ID\",
    \"validated_object_hash\": \"$HASH\",
    \"invocation_nonce\": \"$NONCE\"
  }")
echo "$EXECUTE_RESULT" | jq .
EXECUTION_ID=$(echo "$EXECUTE_RESULT" | jq -r '.execution_id')
echo "Execution ID: $EXECUTION_ID"
```

**Expected:** `"status": "EXECUTED"` with an `execution_id`.

### Step 7 — Emit proof

```bash
PROOF_RESULT=$(curl -sf -X POST "$BASE_URL/proof" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"decision_id\": \"$DECISION_ID\"}")
echo "$PROOF_RESULT" | jq .
PROOF_ID=$(echo "$PROOF_RESULT" | jq -r '.proof_id')
echo "Proof ID: $PROOF_ID"
```

**Expected:** a proof object with `proof_id`, `decision_hash`, `execution_id`, and `created_at`.

### Step 8 — Verify the proof row exists

Query the proof registry directly:

```bash
curl -sf "$BASE_URL/proof/$PROOF_ID" \
  -H "X-API-Key: $API_KEY" | jq .
```

**Expected:** the same proof object returned in Step 7. The row exists in the `proof_registry`.

### Step 9 — Verify append-only behavior

Attempt to overwrite the proof by posting to `/proof` again with the same `decision_id`:

```bash
curl -sf -X POST "$BASE_URL/proof" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"decision_id\": \"$DECISION_ID\"}" | jq .
```

**Expected:** an error response — the proof already exists. The `UNIQUE` constraint on `decision_hash` prevents a second insert.

### Step 10 — Verify nonce is consumed

Attempt to execute again with the same nonce:

```bash
curl -sf -X POST "$BASE_URL/execute" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"decision_id\": \"$DECISION_ID\",
    \"validated_object_hash\": \"$HASH\",
    \"invocation_nonce\": \"$NONCE\"
  }" | jq .
```

**Expected:** `"status": "NULL"` — the nonce is consumed.

---

## Expected Results

| Step | Expected |
|------|----------|
| Execute with valid inputs | `"status": "EXECUTED"` |
| Emit proof | Proof object with `proof_id` |
| Fetch proof by ID | Same proof object |
| Re-emit proof | Error — already exists |
| Re-execute with consumed nonce | `"status": "NULL"` |

---

## What You Proved

A complete governance chain produces exactly one proof per execution. The proof is append-only, the nonce is consumed, and neither can be reused to authorize another execution.

---

## Next

[Lab 7 — Run the full conformance suite](lab-7.md)
