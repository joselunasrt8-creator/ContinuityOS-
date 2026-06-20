# Runtime Lineage — Execution-Eligibility Continuity Primitive (v1)

## Why this exists

ContinuityOS primitives were **stateless**: they evaluate current-run inputs and hash them, but
carry no *verified state across a run boundary*. The Merge Guard proves enforcement; it does not
prove continuity.

A first compression of that research produced a **proof-lineage** primitive — an append-only chain
`proof(N-1) → proof(N)`. That is a correct, tamper-evident *substrate*, but a proof log can exist
**without ever governing execution**. It answers *"how do proofs inherit?"*, which is not the
ContinuityOS thesis.

The thesis is **execution-eligibility continuity** — **runtime lineage**:

```
validated_object(N-1) → executed_object(N) → proof(N)
```

bound to the invariants:

```
validated_object == executed_object
no valid lineage → no valid authority → no valid execution
```

## Proof lineage vs runtime lineage

| | Proof lineage | Runtime lineage (this primitive) |
|---|---|---|
| Binds | `proof(N-1) → proof(N)` | `validated(N-1) → executed(N) → proof(N)` |
| Governs execution? | No — audit record | Yes — a precondition consumed before `/execute` |
| State that inherits | prior proof hash | prior **executed object** + **continuity head** |
| Failure effect | broken audit trail | **execution does not happen** |

## What the runtime already had, and the gap

- Within a single run, `validated_object == executed_object` **is** enforced
  (`cli/commands/validate.mjs` → `cli/commands/execute.mjs` live-hash check; `adapter-contract.ts`).
- Session continuity (`parent_continuity_id`) **is** verified for ACTIVE/expired/revoked
  (`src/runtime/continuity/verifyContinuityLineage.ts`).
- **But** no gate made run N's *execution eligibility* depend on run N−1's *executed object*. AEO
  validation (`continuity-core/src/aeo_validation.rs`) checks current-run inputs only. The binding
  described in `docs/course/module-5.md` was documented, not enforced.

This primitive closes that gap with the smallest possible gate.

## Two layers

### Layer 1 — substrate (`runtime/lineage/continuityProofChain.mjs`)
An append-only, tamper-evident hash chain. Each link's payload is the **execution-eligibility
carry** — the terminal runtime state of a run:

```
link_hash = sha256(canonicalize({
  lineage_key, sequence_number, parent_link_hash,
  continuity_id, parent_continuity_id,
  validated_object_hash, executed_object_hash, proof_hash, timestamp,
}))   // link_hash is NEVER part of its own preimage
```

Fail-closed substrate NULLs: `MISSING_PARENT`, `PARENT_MISMATCH`, `SEQUENCE_GAP`,
`DUPLICATE_SEQUENCE`, `DUPLICATE_LINK_HASH`, `MUTATED_PRIOR_LINK`, `LINEAGE_KEY_MISMATCH`,
`LINK_HASH_MISMATCH`. The chain **head** is the prior run's carry.

### Layer 2 — the gate (`runtime/lineage/executionEligibility.mjs`)
`classifyExecutionEligibility(prior, current, { now, consumed_nonces })`
→ `{ eligibility: 'ELIGIBLE' | 'NULL', null_reasons[], creates_authority: false, widens_eligibility: false }`

- `prior` = the head eligibility carry (or `GENESIS_EXECUTION_STATE` for a root run).
- `current` = `{ continuity_id, parent_continuity_id, parent_executed_object_hash,
  validated_object_hash, nonce }`.

**Fail-closed NULL reasons:**

| reason | meaning |
|---|---|
| `UNVALIDATED_CURRENT` | no validated object → nothing happens |
| `PRIOR_INVARIANT_BROKEN` | last run had `validated != executed` → state cannot be inherited |
| `UNINHERITED_EXECUTED_STATE` | **current does not inherit prior executed object** (the core check) |
| `BROKEN_CONTINUITY` | current does not inherit the continuity head |
| `REVOKED_LINEAGE` | prior lineage revoked / not ACTIVE |
| `EXPIRED_LINEAGE` | prior lineage expired before `now` |
| `REPLAYED_NONCE` | nonce already consumed (no replay restoration) |

Root case: with no prior, ELIGIBLE requires
`parent_executed_object_hash == GENESIS_EXECUTION_STATE.executed_object_hash` and empty
`parent_continuity_id`.

## Why it survives the Primitive Gate

The Primitive Gate (`docs/stage2-primitive-packaging-plan-v1.md` §8/§13) requires a primitive to
**not create authority, not widen execution eligibility**, default NULL, and exit non-zero on any
violation. This gate:

- **Default NULL** — `ELIGIBLE` only when every inheritance predicate passes.
- **`creates_authority: false`** — it returns a classification, never an authority.
- **Narrows only** — `widens_eligibility: false`; no input promotes a NULL to ELIGIBLE except
  passing all checks. (Asserted by the `PRIMITIVE_GATE_NARROWS_ONLY` conformance vector and the
  "never widens" FATE sweep.)
- It can only **withhold** execution eligibility.

## Persistence — git-committed JSONL (no D1/SQLite/service)

`runtime/lineage/proofChainRegistry.mjs` persists carries through an append-only JSONL log
(`runtime/lineage/execution_lineage_registry.jsonl`). `admitRun(registryPath, current, opts)` is
fail-closed end to end:

1. read the prior carry (head) and consumed nonces from disk;
2. run the gate;
3. **ELIGIBLE** → build the next substrate link and append one line;
4. **NULL** → append **nothing**; return the reasons.

`governance/merge-legitimacy/merge_proof_registry.jsonl` remains the merge-governance instance of
the same substrate (documented, not rewired here).

## Placement and adoption path

The gate sits **before `/execute`** in the spine
`intent → continuity → authority → validation → execution → proof → registry → reconciliation`:
`/execute` consumes `ELIGIBLE`; `NULL` means execution does not happen. Reconciliation feeds the
next run's `prior` carry. Wiring the gate into the live `/execute` route is the adoption step and is
intentionally out of scope for v1.

## Out of scope (Primitive-Gate-safe)
- Minting the next `continuity_id` (approaches authority creation — excluded; gate narrows only).
- D1/SQLite/service persistence — JSONL only.
- Signatures/DSSE on carries — the substrate is hash-anchored; signing is a later hardening layer.

## Verification
- `npm test` — `tests/fate/execution-eligibility-continuity.test.mjs` (ELIGIBLE path, every NULL
  reason, genesis, cross-run admit, never-widens sweep, creates-no-authority) and
  `tests/fate/continuity-proof-chain.test.mjs` (substrate).
- `node conformance/pack-v1/harness.mjs` — `LINEAGE_INHERITANCE_PRESERVED`,
  `EXECUTION_ELIGIBILITY_CONTINUITY_PRESERVED`, `PRIMITIVE_GATE_NARROWS_ONLY`,
  `PACK_V1_CONFORMANCE_COMPLETE`.

## Hardening (post-#2186 review)

The primitive **narrows eligibility**; this hardening **protects the eligibility evidence** so
eligibility can never be reconstructed from corrupted state. Each item is a fail-closed boundary:

- **Malformed registry lines fail closed.** `readEntries` is strict: an unparseable line — or a
  chain-shaped line missing its link identity — is `MALFORMED_REGISTRY_LINE`, never silently
  skipped (silent skipping could hide a dropped/tampered link). Pure markers (`registry_init`) are
  still allowed. `verifyRegistryChain` reports it as `NULL`; `admitRun` refuses to append.
- **Stored chain verified before append.** `admitRun` and `executeGovernedRun` re-verify the full
  persisted chain (`STORED_CHAIN_INVALID`) before trusting the head, executing, or appending —
  nothing is ever appended on top of a broken chain.
- **Replay + revocation/expiry are hash-bound.** `nonce, status, expires_at, revoked_at` now enter
  `link_hash`. Tampering any of them on a persisted link breaks the recompute
  (`MUTATED_PRIOR_LINK`) instead of silently restoring eligibility (un-revoking, un-expiring, or
  swapping a consumed nonce).
- **Post-gate execution race closed.** A per-registry advisory lock (`registryLock.mjs`, reentrant
  in-process) wraps the **whole** critical section `read head → gate → execute → append`, so the
  executor side effect stays inside the protected region; concurrent runs on a lineage cannot both
  execute against the same head. Fail-closed if the lock cannot be acquired.
- **Current-run invariant enforced (not assumed).** A run asserting `executed_object_hash !=
  validated_object_hash` is `CURRENT_INVARIANT_BROKEN` → `NULL`, so a divergent carry can never
  enter the registry as a future inheritance base.
- **Verification ergonomics.** `mindshift lineage head` prints the inherited carry (or `GENESIS`);
  `mindshift lineage verify` surfaces tamper/fork/gap/duplicate **and** malformed-line detection.

Hardening verification: `tests/fate/lineage-hardening.test.mjs` (tamper each hash-bound field →
`MUTATED_PRIOR_LINK`; malformed-line fail-closed; stored-chain-before-append; current-invariant;
lock reentrancy/exclusion/stale-reclaim) and conformance vectors `LINEAGE-06`, `ELIG-09`.
