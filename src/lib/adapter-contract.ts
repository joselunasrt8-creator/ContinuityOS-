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
import { classifyExecutionEligibility } from '../../runtime/lineage/executionEligibility.mjs'

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
  // Continuity binding — present only when the AEO declared a lineage. Because these
  // fields enter the receipt body, receipt_id (a hash of the body) BINDS the lineage
  // head the run inherited. Proof binds lineage; it never creates authority.
  readonly continuity_id?: string
  readonly parent_continuity_id?: string
  readonly parent_executed_object_hash?: string
  readonly lineage_eligibility?: "ELIGIBLE"
}

// The prior run's terminal state on a lineage (the chain head the gate inherits).
export type EligibilityCarry = {
  readonly continuity_id: string
  readonly parent_continuity_id?: string
  readonly validated_object_hash: string
  readonly executed_object_hash: string
  readonly proof_hash?: string
  readonly status?: string
  readonly expires_at?: string
  readonly revoked_at?: string
}

// Continuity context supplied by the caller (read from the registry) so the boundary
// stays pure: it consults this context, it does not perform I/O.
export type ContinuityGateContext = {
  readonly prior: EligibilityCarry | null
  readonly consumed_nonces?: readonly string[]
  readonly now?: string
}

// ── Null Result ────────────────────────────────────────────────────────────────
// All conditions that produce a NULL outcome. No partial results exist.
// Any failure in the adapter chain returns one of these reasons.

export type AdapterNullReason =
  | "NULL_AEO_INPUT"                  // aeo argument was null or undefined
  | "NULL_VALIDATED_HASH"             // validated_object_hash was null, undefined, or blank
  | "NULL_EXECUTOR"                   // executor argument was null or not an AdapterContract
  | "NULL_EMITTED_AT"                 // emitted_at was null, undefined, or blank
  | "AEO_SHAPE_INVALID"               // AEO has extra or missing top-level fields (not exactly 5)
  | "OBJECT_HASH_MISMATCH"            // recomputed AEO hash ≠ validated_object_hash
  | "EXECUTOR_RETURNED_NULL"          // executor.execute() returned null or undefined
  | "EVIDENCE_MISSING_EXECUTION_ID"   // evidence.execution_id was blank or missing
  | "EVIDENCE_MISSING_EXECUTED_AT"    // evidence.executed_at was blank or missing
  | "EVIDENCE_SURFACE_MISMATCH"       // evidence.adapter_surface ≠ AEO.target.system
  | "EVIDENCE_ADAPTER_SPECIFIC_NULL"  // evidence.adapter_specific was null or not a plain record
  | "NULL_CONTINUITY_CONTEXT"         // AEO declared a lineage but no continuity context was supplied
  | "EXECUTION_NOT_ELIGIBLE"          // continuity gate returned NULL — run does not inherit the lineage head

export type AdapterNullResult = {
  readonly execution_result: "NULL"
  readonly null_reason: AdapterNullReason
  readonly creates_authority: false
  // Present only for EXECUTION_NOT_ELIGIBLE — the gate's fail-closed reasons, for diagnosis.
  readonly lineage_null_reasons?: readonly string[]
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

// ── AEO Shape Guard ────────────────────────────────────────────────────────────
// Exact top-level field check — AEOs must have exactly these 5 keys, no more.
// TypeScript types do not protect runtime inputs; this guard does.
// Note: content validation is the Ω validator's job upstream. This boundary only
// ensures the adapter cannot accept an object that was never run through canonical
// AEO compilation (e.g., an object with injected extra fields that would hash
// differently from any legitimately compiled AEO).

export const ADAPTER_AEO_REQUIRED_KEYS = [
  "finality", "intent", "scope", "target", "validation",
] as const

function hasExactAEOShape(aeo: AdapterTargetedAEO): boolean {
  const keys = Object.keys(aeo).sort()
  if (keys.length !== ADAPTER_AEO_REQUIRED_KEYS.length) return false
  return keys.every((key, i) => key === ADAPTER_AEO_REQUIRED_KEYS[i])
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
//   2. Exact AEO shape guard — extra or missing top-level fields → AEO_SHAPE_INVALID
//      (TypeScript types do not protect runtime inputs; this guard does)
//   3. Recompute AEO hash at execution boundary
//   4. Hash mismatch → NULL (OBJECT_HASH_MISMATCH) — executor never called
//   5. Call adapter.execute() with exact AEO — no field injection or reinterpretation
//   6. Null evidence → NULL (EXECUTOR_RETURNED_NULL)
//   7. Incomplete evidence fields → NULL with specific reason
//   8. Evidence surface mismatch → NULL (EVIDENCE_SURFACE_MISMATCH)
//   9. All checks pass → emit immutable proof receipt
//
// The proof receipt is constructed here, not in the adapter, to prevent fabrication.
// Note: semantic AEO content validation is the upstream Ω validator's responsibility.
// This boundary guards shape and hash integrity only — it does not re-validate
// authority, policy, replay state, or field semantics.

export function executeWithAdapter(
  aeo: AdapterTargetedAEO | null | undefined,
  validated_object_hash: string | null | undefined,
  executor: AdapterContract | null | undefined,
  emitted_at: string | null | undefined,
  continuity?: ContinuityGateContext | null,
): AdapterExecutionOutcome {
  const nullResult = (
    reason: AdapterNullReason,
    lineage_null_reasons?: readonly string[],
  ): AdapterExecutionOutcome => ({
    ok: false,
    null_result: Object.freeze({
      execution_result: "NULL" as const,
      null_reason: reason,
      creates_authority: false as const,
      ...(lineage_null_reasons ? { lineage_null_reasons: Object.freeze([...lineage_null_reasons]) } : {}),
    }),
  })

  if (!aeo) return nullResult("NULL_AEO_INPUT")
  if (!isNonBlankString(validated_object_hash)) return nullResult("NULL_VALIDATED_HASH")
  if (!executor || typeof executor.execute !== "function") return nullResult("NULL_EXECUTOR")
  if (!isNonBlankString(emitted_at)) return nullResult("NULL_EMITTED_AT")

  // Exact shape guard: reject AEOs with extra or missing top-level fields.
  // This is a defense-in-depth check — the Ω validator upstream already enforces
  // canonical shape, but TypeScript types do not protect against runtime injection.
  if (!hasExactAEOShape(aeo)) return nullResult("AEO_SHAPE_INVALID")

  // Recompute AEO hash at execution boundary.
  // Any mutation between Ω validation and this boundary produces a different hash → NULL.
  // The executor is NOT called if the hash does not match.
  const recomputed = computeAdapterAEOHash(aeo)
  if (recomputed !== validated_object_hash) return nullResult("OBJECT_HASH_MISMATCH")

  // ── Execution-eligibility continuity gate (runtime law) ──────────────────────
  // When the AEO declares continuity (validation.lineage_key), execution is admitted
  // ONLY IF this run inherits the prior run's executed object on the lineage. The
  // gate narrows only: it can withhold execution (executor never called), never
  // create authority. Standalone AEOs (no lineage_key) are unaffected.
  let lineageBinding: {
    continuity_id: string
    parent_continuity_id: string
    parent_executed_object_hash: string
    lineage_eligibility: "ELIGIBLE"
  } | null = null
  const lineageKey = isNonBlankString(aeo.validation.lineage_key)
    ? (aeo.validation.lineage_key as string).trim()
    : ""
  if (lineageKey) {
    if (!continuity) return nullResult("NULL_CONTINUITY_CONTEXT")
    const current = {
      lineage_key: lineageKey,
      continuity_id: aeo.validation.continuity_id,
      parent_continuity_id: aeo.validation.parent_continuity_id,
      parent_executed_object_hash: aeo.validation.parent_executed_object_hash,
      validated_object_hash,
      nonce: aeo.validation.replay_nonce,
    }
    const decision = classifyExecutionEligibility(continuity.prior ?? null, current, {
      now: continuity.now,
      consumed_nonces: continuity.consumed_nonces ? [...continuity.consumed_nonces] : [],
    })
    if (decision.eligibility !== "ELIGIBLE") {
      // Fail-closed: executor is NEVER called when the run does not inherit the head.
      return nullResult("EXECUTION_NOT_ELIGIBLE", decision.null_reasons)
    }
    lineageBinding = {
      continuity_id: String(aeo.validation.continuity_id ?? ""),
      parent_continuity_id: String(aeo.validation.parent_continuity_id ?? ""),
      parent_executed_object_hash: String(aeo.validation.parent_executed_object_hash ?? ""),
      lineage_eligibility: "ELIGIBLE",
    }
  }

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
    // Bind the inherited lineage head into the proof (only when continuity was declared).
    ...(lineageBinding ?? {}),
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
