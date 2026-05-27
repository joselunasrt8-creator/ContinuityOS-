# Lab 3 — Validate Exact Object; Observe NULL on Mutation

**Module:** 3  
**Estimated time:** 30 minutes  
**Prerequisites:** Runtime running locally (`npm run dev`); Labs 1 and 2 complete  
**Assignment:** Submit a hash mismatch scenario and explain why it returns NULL.

---

## Goal

Submit an AEO for validation, observe a VALID result, mutate one field, re-submit, and observe NULL.

---

## Background

The core invariant: `validated_object == executed_object`.

The runtime enforces this by comparing the `validated_object_hash` at execution time against the hash of the object stored during compilation. Any mutation changes the hash. Hash mismatch → NULL.

---

## Setup

Start the local runtime:

```bash
npm run dev
```

The runtime listens at `http://localhost:8787` by default.

Set your API key:

```bash
export API_KEY=your-local-api-key
export BASE_URL=http://localhost:8787
```

---

## Steps

### Step 1 — Create a session

```bash
SESSION=$(curl -sf -X POST "$BASE_URL/session" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"intent": "lab-3-session"}' | jq -r '.session_id')
echo "Session: $SESSION"
```

### Step 2 — Create a continuity record

```bash
CONTINUITY=$(curl -sf -X POST "$BASE_URL/continuity" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION\", \"intent\": \"lab-3-continuity\"}" \
  | jq -r '.continuity_id')
echo "Continuity: $CONTINUITY"
```

### Step 3 — Create a governed tool envelope

The runtime requires a governed tool envelope to be created before authority is issued.
The envelope binds a candidate intent to a single-use nonce via `/govern`.

```bash
DECISION_ID=$(node -e "console.log(require('crypto').randomUUID())")
GOVERN_NONCE=$(node -e "console.log(require('crypto').randomUUID())")
ENVELOPE_ID=$(curl -sf -X POST "$BASE_URL/govern" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Nonce: $GOVERN_NONCE" \
  -d "{
    \"decision_id\": \"$DECISION_ID\",
    \"continuity_id\": \"$CONTINUITY\",
    \"intent\": \"lab 3 demo execution\",
    \"scope\": {\"env\": \"lab\"},
    \"target\": {\"resource\": \"demo-resource\"},
    \"finality\": {\"continuity_required\": true}
  }" | jq -r '.envelope_id')
echo "Envelope: $ENVELOPE_ID"
```

### Step 4 — Create an authority

```bash
AUTHORITY=$(curl -sf -X POST "$BASE_URL/authority" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$SESSION\",
    \"decision_id\": \"$DECISION_ID\",
    \"continuity_id\": \"$CONTINUITY\",
    \"governed_tool_envelope_id\": \"$ENVELOPE_ID\",
    \"authority_class\": \"LAB_DEMO\"
  }" | jq -r '.authority_id')
echo "Authority: $AUTHORITY"
```

### Step 5 — Compile the AEO

```bash
NONCE=$(node -e "console.log(require('crypto').randomUUID())")
COMPILE_RESULT=$(curl -sf -X POST "$BASE_URL/compile" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"decision_id\": \"$DECISION_ID\",
    \"authority_id\": \"$AUTHORITY\",
    \"intent\": \"lab 3 demo execution\",
    \"scope\": {\"env\": \"lab\"},
    \"validation\": {\"proof_required\": true, \"replay_nonce\": \"$NONCE\", \"authority_class\": \"LAB_DEMO\"},
    \"target\": {\"resource\": \"demo-resource\"},
    \"finality\": {\"continuity_required\": true}
  }")
echo "$COMPILE_RESULT" | jq .
HASH=$(echo "$COMPILE_RESULT" | jq -r '.validated_object_hash')
echo "Hash: $HASH"
```

### Step 6 — Validate the AEO

```bash
VALIDATE_RESULT=$(curl -sf -X POST "$BASE_URL/validate" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"decision_id\": \"$DECISION_ID\",
    \"validated_object_hash\": \"$HASH\",
    \"invocation_nonce\": \"$NONCE\",
    \"session_id\": \"$SESSION\"
  }")
echo "$VALIDATE_RESULT" | jq .
```

**Expected:** `"status": "VALID"`

### Step 7 — Mutate one field and attempt validation

Compute a hash for a mutated version of the same AEO (change `target.resource`):

```bash
MUTATED_HASH=$(node -e "
const { canonicalize } = require('./src/canonical.js');
const crypto = require('crypto');
const mutated = {
  intent: 'lab 3 demo execution',
  scope: { env: 'lab' },
  validation: { proof_required: true, replay_nonce: process.env.NONCE, authority_class: 'LAB_DEMO' },
  target: { resource: 'MUTATED-resource' },  // ← mutated
  finality: { continuity_required: true }
};
console.log(crypto.createHash('sha256').update(canonicalize(mutated)).digest('hex'));
" NONCE=$NONCE)
echo "Mutated hash: $MUTATED_HASH"
```

Submit the mutated hash to `/validate`:

```bash
curl -sf -X POST "$BASE_URL/validate" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"decision_id\": \"$DECISION_ID\",
    \"validated_object_hash\": \"$MUTATED_HASH\",
    \"invocation_nonce\": \"$NONCE\",
    \"session_id\": \"$SESSION\"
  }" | jq .
```

**Expected:** `"status": "NULL"` — the hash does not match any compiled AEO in the registry.

---

## Expected Results

| Step | Expected result |
|------|----------------|
| Validate with correct hash | `"status": "VALID"` |
| Validate with mutated hash | `"status": "NULL"` |

---

## Assignment

Write a 2-3 paragraph explanation of:
1. Why the mutated hash returns NULL (trace the exact check the runtime performs)
2. What TOCTOU is and how `validated_object == executed_object` prevents it
3. One real-world scenario where this protection would matter

Submit as `lab-3-writeup.md` in your fork.

---

## Next

[Lab 4 — Block invalid mutation in CI](lab-4.md)
