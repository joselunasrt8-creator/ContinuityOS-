// Issue #1866: Adapter-Based Governance — core adapter contract.
//
// Enforces the boundary between legitimacy and execution for all adapter surfaces
// (Cloudflare, D1, GitHub, Wrangler, etc.) without weakening ContinuityOS invariants.
//
// Core invariants preserved:
//   Execution Surface ≠ Legitimacy Surface
//   validated_object_hash == executed_object_hash
//   Adapters are execution surfaces, not legitimacy surfaces
//   No authority expansion through adapter execution
//
// Adapter responsibilities:
//   1. Accept an already-validated AEO (never validate)
//   2. Execute the exact target action the AEO specifies (no reinterpretation)
//   3. Return adapter-specific execution evidence derived from actual execution
//   4. Bind evidence to a generic proof receipt
//
// Adapter forbidden actions:
//   - Create, derive, or extend authority
//   - Validate or re-validate AEOs
//   - Mutate, reinterpret, or selectively read AEO fields
//   - Bypass, track, or simulate replay state
//   - Fabricate or partially construct execution evidence
//   - Return partial proof on failure (any failure condition → NULL)

import { canonicalize, sha256Hex } from '../canonical.js'

// ── Adapter-Targeted AEO ───────────────────────────────────────────────────────
// Structural minimum any AEO must satisfy to be routed to an adapter.
// Adapters receive this shape — adapter-specific fields live in target.
// The adapter does NOT validate this structure; that is the Ω validator's job.

export type AdapterTargetedAEO = {
  readonly intent: {
    readonly action: string
    readonly purpose: string
  }
  readonly scope: Readonly<Record<string, unknown>>
  readonly validation: {
    readonly decision_id: string
    readonly authority_lineage_hash: string
    readonly policy_id: string
    readonly policy_hash: string
    readonly replay_nonce: string
    readonly aeo_hash_required: boolean
    readonly requires_unused_nonce: boolean
    readonly [key: string]: unknown
  }
  readonly target: {
    readonly system: string  // adapter surface discriminant for routing
    readonly [key: string]: unknown
  }
  readonly finality: {
    readonly proof_required: true
    readonly proof_type: string
    readonly replay_state_after_success: string
    readonly [key: string]: unknown
  }
}

// ── Adapter-Specific Evidence ──────────────────────────────────────────────────
// What the adapter returns after executing the target action.
// Every field must be derived from the actual execution — never from AEO fields.
// execution_id and executed_at must come from the target system, not the adapter.

export type AdapterExecutionEvidence = {
  readonly execution_id: string     // assigned by the target system (e.g. CF-Ray, query ID)
  readonly executed_at: string      // ISO timestamp from the target system
  readonly adapter_surface: string  // must equal AEO.target.system
  readonly adapter_specific: Readonly<Record<string, unknown>>  // surface-specific fields
}

// ── Generic Proof Receipt ──────────────────────────────────────────────────────
// Immutable artifact binding a validated AEO to its execution evidence.
// Non-operative: proof receipt does not restore authority, does not alter replay state,
// does not grant execution eligibility for future actions.
// creates_authority is a structural false — not a configuration option.

export type AdapterProofReceipt = {
  readonly receipt_id: string                // sha256(canonical receipt body, excluding receipt_id)
  readonly validated_object_hash: string     // passed through from Ω validator — never re-derived
  readonly executed_object_hash: string      // recomputed at boundary; equals validated on EXECUTED
  readonly execution_evidence_hash: string   // sha256(canonical(evidence))
  readonly adapter_surface: string           // which adapter surface executed
  readonly decision_id: string               // from AEO.validation — not re-derived from evidence
  readonly replay_nonce: string              // from AEO.validation — not re-derived from evidence
  readonly execution_result: "EXECUTED"      // only emitted when execution fully succeeded
  readonly creates_authority: false          // structural invariant — never configurable
  readonly emitted_at: string
}

// ── Null Result ────────────────────────────────────────────────────────────────
// All conditions that produce a NULL outcome. No partial results exist.
// Any failure in the adapter chain returns one of these reasons.

export type AdapterNullReason =
  | "NULL_AEO_INPUT"                  // aeo argument was null or undefined
  | "NULL_VALIDATED_HASH"             // validated_object_hash was null, undefined, or blank
  | "NULL_EXECUTOR"                   // executor argument was null or not an AdapterContract
  | "NULL_EMITTED_AT"                 // emitted_at was null, undefined, or blank
  | "OBJECT_HASH_MISMATCH"            // recomputed AEO hash ≠ validated_object_hash
  | "EXECUTOR_RETURNED_NULL"          // executor.execute() returned null or undefined
  | "EVIDENCE_MISSING_EXECUTION_ID"   // evidence.execution_id was blank or missing
  | "EVIDENCE_MISSING_EXECUTED_AT"    // evidence.executed_at was blank or missing
  | "EVIDENCE_SURFACE_MISMATCH"       // evidence.adapter_surface ≠ AEO.target.system
  | "EVIDENCE_ADAPTER_SPECIFIC_NULL"  // evidence.adapter_specific was null or not a plain record

export type AdapterNullResult = {
  readonly execution_result: "NULL"
  readonly null_reason: AdapterNullReason
  readonly creates_authority: false
}

export type AdapterExecutionOutcome =
  | { readonly ok: true; readonly receipt: AdapterProofReceipt }
  | { readonly ok: false; readonly null_result: AdapterNullResult }

// ── Adapter Context ────────────────────────────────────────────────────────────
// Read-only context passed into the adapter's execute method.
// The adapter may not modify or re-derive these values.

export type AdapterExecutionContext = {
  readonly validated_object_hash: string
  readonly emitted_at: string
}

// ── Adapter Contract ───────────────────────────────────────────────────────────
// Minimal interface all adapter implementations must satisfy.
//
// An AdapterContract:
//   - declares which adapter surface it handles (adapter_surface)
//   - exposes a single execute() method that accepts an AEO + context
//   - returns execution evidence or null (never throws into the proof layer)
//
// The contract does NOT expose:
//   - validate() — adapters never validate
//   - createAuthority() — adapters never create authority
//   - mutateAEO() — adapters never touch the AEO object
//   - replay checks — adapters never track or simulate replay state

export interface AdapterContract {
  readonly adapter_surface: string

  execute(
    aeo: AdapterTargetedAEO,
    context: AdapterExecutionContext,
  ): AdapterExecutionEvidence | null
}

// ── Hash Utility ───────────────────────────────────────────────────────────────
// Used externally to compute the validated_object_hash before calling executeWithAdapter.

export function computeAdapterAEOHash(aeo: AdapterTargetedAEO): string {
  return "sha256:" + sha256Hex(canonicalize(aeo))
}

// ── Wiring Function ────────────────────────────────────────────────────────────
// executeWithAdapter: the ONLY path through which an adapter may produce a proof receipt.
//
// Enforcement sequence:
//   1. Null-check all inputs — any null → NULL result with specific reason
//   2. Recompute AEO hash at execution boundary
//   3. Hash mismatch → NULL (OBJECT_HASH_MISMATCH) — executor never called
//   4. Call adapter.execute() with exact AEO — no field injection or reinterpretation
//   5. Null evidence → NULL (EXECUTOR_RETURNED_NULL)
//   6. Incomplete evidence fields → NULL with specific reason
//   7. Evidence surface mismatch → NULL (EVIDENCE_SURFACE_MISMATCH)
//   8. All checks pass → emit immutable proof receipt
//
// The proof receipt is constructed here, not in the adapter, to prevent fabrication.

export function executeWithAdapter(
  aeo: AdapterTargetedAEO | null | undefined,
  validated_object_hash: string | null | undefined,
  executor: AdapterContract | null | undefined,
  emitted_at: string | null | undefined,
): AdapterExecutionOutcome {
  const nullResult = (reason: AdapterNullReason): AdapterExecutionOutcome => ({
    ok: false,
    null_result: Object.freeze({
      execution_result: "NULL" as const,
      null_reason: reason,
      creates_authority: false as const,
    }),
  })

  if (!aeo) return nullResult("NULL_AEO_INPUT")
  if (!isNonBlankString(validated_object_hash)) return nullResult("NULL_VALIDATED_HASH")
  if (!executor || typeof executor.execute !== "function") return nullResult("NULL_EXECUTOR")
  if (!isNonBlankString(emitted_at)) return nullResult("NULL_EMITTED_AT")

  // Recompute AEO hash at execution boundary.
  // Any mutation between Ω validation and this boundary produces a different hash → NULL.
  // The executor is NOT called if the hash does not match.
  const recomputed = computeAdapterAEOHash(aeo)
  if (recomputed !== validated_object_hash) return nullResult("OBJECT_HASH_MISMATCH")

  // Delegate to adapter — pass exact AEO and read-only context, nothing more.
  const evidence = executor.execute(aeo, {
    validated_object_hash,
    emitted_at,
  })

  if (!evidence) return nullResult("EXECUTOR_RETURNED_NULL")
  if (!isNonBlankString(evidence.execution_id)) return nullResult("EVIDENCE_MISSING_EXECUTION_ID")
  if (!isNonBlankString(evidence.executed_at)) return nullResult("EVIDENCE_MISSING_EXECUTED_AT")
  if (evidence.adapter_surface !== aeo.target.system) return nullResult("EVIDENCE_SURFACE_MISMATCH")
  if (!isPlainRecord(evidence.adapter_specific)) return nullResult("EVIDENCE_ADAPTER_SPECIFIC_NULL")

  // Proof receipt construction happens here — never in the adapter.
  // This prevents adapters from fabricating receipt fields.
  const evidence_hash = "sha256:" + sha256Hex(canonicalize(evidence))
  const receiptBody = {
    validated_object_hash,
    executed_object_hash: recomputed,  // equals validated_object_hash — invariant holds
    execution_evidence_hash: evidence_hash,
    adapter_surface: evidence.adapter_surface,
    decision_id: aeo.validation.decision_id,
    replay_nonce: aeo.validation.replay_nonce,
    execution_result: "EXECUTED" as const,
    creates_authority: false as const,
    emitted_at,
  }
  const receipt_id = "sha256:" + sha256Hex(canonicalize(receiptBody))
  const receipt: AdapterProofReceipt = Object.freeze({ receipt_id, ...receiptBody })

  return { ok: true, receipt }
}

function isNonBlankString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}
