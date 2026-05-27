# Lab 9 — Install-Base Telemetry *(Optional)*

**Module:** 8  
**Estimated time:** 30 minutes  
**Prerequisites:** Lab 6 complete; runtime running  
**Difficulty:** Intermediate

---

## Goal

Instrument a governed execution counter in your fork and verify that a telemetry event is recorded when a legitimacy-gated execution succeeds.

---

## Background

The install-base metric measures how many governed executions have occurred across all ContinuityOS deployments. Each successful execution emits a telemetry event via the legitimacy telemetry module.

**Code reference:** [`src/telemetry.ts`](../../../src/telemetry.ts), [`src/legitimacy-telemetry.ts`](../../../src/legitimacy-telemetry.ts)

---

## Steps

### Step 1 — Read the telemetry client

Open `src/legitimacy-telemetry.ts`. Find:
- The `governed_execution_volume` counter increment
- The `blocked_invalid_execution_volume` counter increment
- What metadata is attached to each event

### Step 2 — Complete a governed execution

Run the full 7-step chain from Lab 6 in your fork. After step 6 (execute) succeeds, a `governed_execution_volume` telemetry event should be emitted.

### Step 3 — Verify the telemetry event

```bash
# Query the telemetry log for governed execution events
curl -sf "$BASE_URL/telemetry/governed_execution_volume" \
  -H "X-API-Key: $API_KEY" | jq .
```

You should see a list of events including the one from Step 2, with metadata:
- `decision_id`
- `continuity_id`
- `epoch_id`
- `timestamp`

### Step 4 — Trigger a blocked execution and observe telemetry

Attempt validation with a mutated hash (from Lab 3 Step 6). After the NULL result, query:

```bash
curl -sf "$BASE_URL/telemetry/blocked_invalid_execution_volume" \
  -H "X-API-Key: $API_KEY" | jq .
```

You should see an event with `reason: "hash_mismatch"`.

### Step 5 — Compute your metrics

```bash
node -e "
const governed = 1;     // from Step 2
const blocked = 1;      // from Step 4

const total = governed + blocked;
const utilizationRate = (governed / total * 100).toFixed(1);
const blockRate = (blocked / total * 100).toFixed(1);

console.log('Governed executions:', governed);
console.log('Blocked invalid:', blocked);
console.log('Utilization rate:', utilizationRate + '%');
console.log('Block rate:', blockRate + '%');
"
```

---

## Expected Results

| Metric | Expected |
|--------|----------|
| governed_execution_volume event | Present with correct metadata |
| blocked_invalid_execution_volume event | Present with `reason: "hash_mismatch"` |
| Telemetry counter persists | Query returns history, not just latest |

---

## What You Proved

Every governed execution and every blocked invalid execution generates a telemetry signal. These signals are the raw data for the install-base metric that measures ContinuityOS adoption.

---

## Final Project

You have completed all optional labs. Proceed to the [Final Project](../README.md#final-project).
