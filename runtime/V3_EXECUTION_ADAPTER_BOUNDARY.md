# V3 Execution Adapter Boundary

## Summary

The Execution Adapter Boundary is the third V3 adapter boundary, following:

- **Discovery Adapter** (#1920) — where information comes from
- **Storage Adapter** (#1917) — where legitimacy state lives
- **Execution Adapter** (this boundary) — where legitimacy becomes reality

It establishes a clean, substrate-agnostic execution contract so that any validated AEO can be dispatched through any execution substrate while preserving the two core invariants:

```
If no valid object exists → nothing happens
validated_object == executed_object
```

---

## The Boundary

### Before

```
Ω Validator → VALID | NULL
executeFilesystemWrite(aeo, hash, atao, executor, emitted_at)
→ FilesystemWriteExecutionProof   [filesystem-specific]
```

The filesystem execution path had its own hash enforcement and proof construction, duplicating logic that already existed in `executeWithAdapter`. The proof type was filesystem-specific, not portable.

### After

```
Ω Validator → VALID | NULL
executeWithAdapter(aeo, hash, FilesystemExecutionAdapter, emitted_at)
→ AdapterProofReceipt             [substrate-agnostic]
```

`executeWithAdapter` is the single boundary gate. The `FilesystemExecutionAdapter` is one substrate implementation. The same gate works for any substrate.

---

## Architectural Principle

```
continuity-core  →  decides    (VALID | NULL)
execution adapter →  obeys     (execute | do not execute)
```

The execution adapter does NOT decide legitimacy. It enforces legitimacy already determined by the Ω validator. Separating these responsibilities means:

- `continuity-core` semantics ≠ execution substrate
- The same legitimacy decision can be executed through different substrates
- Substrate changes require only a new adapter implementation, not core changes

---

## Resulting Architecture

```
Any Model
    ↓
Any Agent
    ↓
Continuity Core
    ├─ Discovery Adapter     (observes, never mutates)
    ├─ Storage Adapter       (persists legitimacy state)
    └─ Execution Adapter     (mutates external reality)
         ├─ FilesystemExecutionAdapter   [reference implementation]
         ├─ CloudflareAdapter            [Cloudflare Workers]
         └─ [future: GitHub, Terminal, CI/CD, Kubernetes, Cloud APIs]
    ↓
External Systems
```

Only the Execution Adapter is allowed to cross into state-changing reality. Discovery observes. Storage persists. Execution mutates.

---

## Adapter Contract

All execution adapters implement `AdapterContract` from `src/lib/adapter-contract.ts`:

```typescript
interface AdapterContract {
  readonly adapter_surface: string
  execute(aeo: AdapterTargetedAEO, context: AdapterExecutionContext): AdapterExecutionEvidence | null
}
```

**Adapter responsibilities:**
1. Accept an already-validated AEO (never validate)
2. Execute the exact target action the AEO specifies (no reinterpretation)
3. Return execution evidence derived from the actual execution
4. Delegate receipt construction to `executeWithAdapter` (never fabricate proof)

**Adapter forbidden actions:**
- Create, derive, or extend authority
- Validate or re-validate AEOs
- Mutate, reinterpret, or selectively read AEO fields
- Bypass, track, or simulate replay state
- Fabricate or partially construct execution evidence
- Return partial proof on failure (any failure → NULL)

---

## Filesystem Execution Adapter

**File:** `src/lib/filesystem-execution-adapter.ts`

Reference implementation for the filesystem write surface.

### Content Binding

Content is pre-bound at adapter construction from the captured ATAO:

```
content = atao.proposed_action.parameters.content
adapter = new FilesystemExecutionAdapter(content, writer)
```

The AEO carries content *identity* (`proposed_diff_hash`, `pre_write_hash`) but not content bytes. The adapter closes over the exact content the Ω validator approved via those hashes. This means:
- The AEO's hash chain guarantees which content was approved
- The adapter writes exactly that content — no re-derivation possible

### Injected Writer

The filesystem write function is injected:

```typescript
type FilesystemWriter = (input: { path: string; content: string }) => FilesystemWriteResult | null
```

For D1-backed execution (Cloudflare Workers): a synchronous capture closure that records path+content for deferred async D1 persistence, gated strictly on the EXECUTED outcome.

For real filesystem execution: writes the file directly and returns system metadata.

### Entry Point

```typescript
function executeFilesystemAdapter(
  aeo: AdapterTargetedAEO | null | undefined,
  validated_object_hash: string,
  content: string,
  writer: FilesystemWriter,
  emitted_at: string,
): AdapterExecutionOutcome
```

---

## Proof Receipt

On a successful execution, `executeWithAdapter` emits an `AdapterProofReceipt`:

```typescript
type AdapterProofReceipt = {
  receipt_id: string                // sha256(canonical receipt body)
  validated_object_hash: string     // from Ω validator — never re-derived
  executed_object_hash: string      // recomputed at boundary; equals validated on EXECUTED
  execution_evidence_hash: string   // sha256(canonical(evidence))
  adapter_surface: string           // which adapter surface executed
  decision_id: string               // from AEO.validation
  replay_nonce: string              // from AEO.validation
  execution_result: "EXECUTED"
  creates_authority: false          // structural invariant — never configurable
  emitted_at: string
}
```

The receipt is constructed in `executeWithAdapter`, not in the adapter. Adapters cannot fabricate receipt fields.

---

## Execution Path

The canonical chain (frozen):

```
raw input
→ captureFilesystemWriteATAO     (non-operative capture)
→ compileFilesystemWriteAEO      (ATAO + authority binding → AEO)
→ validateFilesystemAEO          (Ω validator: VALID | NULL)
→ executeFilesystemAdapter       (execution adapter boundary: EXECUTED | NULL)
   └─ executeWithAdapter
       ├─ shape guard (exactly 5 AEO fields)
       ├─ hash recompute (validated_object_hash == executed_object_hash)
       ├─ FilesystemExecutionAdapter.execute()
       └─ AdapterProofReceipt construction
```

There is no path to an EXECUTED outcome that bypasses any stage.

---

## Future Substrates

The same execution path works for any substrate by swapping the adapter:

| Substrate | Adapter | Mutates |
|-----------|---------|---------|
| Filesystem | `FilesystemExecutionAdapter` | Files on disk / D1 registry |
| Cloudflare Workers | `CloudflareAdapter` | Worker deployments |
| GitHub | future `GitHubExecutionAdapter` | Issues, PRs, commits |
| Terminal | future `TerminalExecutionAdapter` | Shell commands |
| CI/CD | future `CIExecutionAdapter` | Pipeline runs |
| Kubernetes | future `K8sExecutionAdapter` | Cluster resources |
| Cloud APIs | future substrate adapters | External state |

The legitimacy decision (Ω validator → VALID | NULL) is identical across all substrates.

---

## Invariants Preserved

```
If no valid object exists → nothing happens
validated_object == executed_object
```

Both invariants are enforced in `executeWithAdapter` before the adapter is ever called:
- NULL Ω validator result → adapter never reached
- Hash mismatch at boundary → adapter never called (OBJECT_HASH_MISMATCH)
- Adapter returns null → EXECUTOR_RETURNED_NULL, no proof emitted
