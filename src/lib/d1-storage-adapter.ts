// Issue #1866: D1 Storage Adapter.
//
// Maps an AEO with target.system === "d1" to a Cloudflare D1 database operation.
// D1 is an execution surface — it stores proof artifacts, not authority records.
//
// Adapter responsibilities:
//   - Extract target fields from AEO.target (already validated by Ω validator)
//   - Call the D1 executor with exact target parameters
//   - Return D1ExecutionEvidence derived from the actual query result
//   - Delegate receipt construction to executeWithAdapter (never fabricate proof)
//
// Adapter forbidden actions:
//   - Issuing SQL beyond what AEO.target specifies (no cascades, triggers, joins)
//   - Using D1 metadata (query_id, affected rows) as authority evidence
//   - Falling back to a secondary query or table when the primary fails
//   - Treating a zero-row-affected result as execution success (INSERT must affect ≥ 1)
//   - Returning fabricated row counts or query IDs
//
// Failure conditions that return NULL:
//   - AEO.target.system ≠ "d1" → EXECUTOR_RETURNED_NULL
//   - AEO.target is missing required fields → EXECUTOR_RETURNED_NULL
//   - executor() returns null → EXECUTOR_RETURNED_NULL
//   - Propagated: OBJECT_HASH_MISMATCH, NULL_AEO_INPUT, NULL_VALIDATED_HASH, etc.

import type {
  AdapterContract,
  AdapterTargetedAEO,
  AdapterExecutionContext,
  AdapterExecutionEvidence,
  AdapterExecutionOutcome,
} from './adapter-contract.js'
import { executeWithAdapter } from './adapter-contract.js'

export const D1_ADAPTER_SURFACE = "d1" as const
export type D1AdapterSurface = typeof D1_ADAPTER_SURFACE

// ── D1 Operation Types ─────────────────────────────────────────────────────────
// Only DML operations are permitted. DDL (CREATE, DROP, ALTER) is not an adapter surface.

export type D1Operation = "INSERT" | "UPDATE" | "SELECT" | "DELETE"

// ── D1 AEO Target Shape ────────────────────────────────────────────────────────
// What AEO.target must contain for this adapter to route successfully.
// The Ω validator guarantees these fields before the adapter runs.
// parameter_hash binds the query parameters canonically — the adapter does not
// deserialize or inspect them; the executor receives the hash for its own integrity check.

export type D1AEOTarget = {
  readonly system: "d1"
  readonly database_id: string     // D1 database identifier — no dynamic resolution
  readonly table_name: string      // target table — no cross-table queries
  readonly operation: D1Operation  // operation type
  readonly parameter_hash: string  // sha256 of canonical query parameters
}

// ── D1 Execution Evidence ──────────────────────────────────────────────────────
// Must be derived from the actual D1 query result — never from AEO fields.
// execution_id is expected to be the query ID assigned by D1. This is an executor
// obligation: the adapter contract rejects blank execution_id but cannot independently
// prove the value is D1-assigned rather than fabricated.
// The concrete executor implementation is responsible for enforcing D1 query ID origin.

export type D1ExecutionEvidence = {
  readonly execution_id: string   // expected: D1-assigned query ID (executor obligation, not contract guarantee)
  readonly executed_at: string    // ISO timestamp from D1 (not from adapter clock)
  readonly adapter_surface: "d1"
  readonly adapter_specific: {
    readonly rows_affected: number  // from D1 result — must be ≥ 0
    readonly table_name: string     // echo of executed table for receipt binding
    readonly operation: D1Operation
  }
}

// ── D1 Executor ───────────────────────────────────────────────────────────────
// Receives ONLY what AEO.target specifies — no additional context injection.
// Executor obligation: return evidence only after actual D1 query execution; null on any failure.
// The contract layer rejects blank evidence fields but does not independently verify origin.
// Concrete implementations should set execution_id from the D1 query result and return
// null if the query fails, the binding is unavailable, or a query ID cannot be obtained.
//   - zero rows affected for INSERT/UPDATE/DELETE (executor decides policy)

export type D1Executor = (target: {
  readonly database_id: string
  readonly table_name: string
  readonly operation: D1Operation
  readonly parameter_hash: string
}) => D1ExecutionEvidence | null

// ── D1 Adapter ────────────────────────────────────────────────────────────────

function isValidD1Operation(v: unknown): v is D1Operation {
  return v === "INSERT" || v === "UPDATE" || v === "SELECT" || v === "DELETE"
}

function isValidD1Target(
  target: Record<string, unknown>,
): target is Record<string, unknown> & D1AEOTarget {
  return (
    target.system === "d1" &&
    isNonBlankString(target.database_id) &&
    isNonBlankString(target.table_name) &&
    isValidD1Operation(target.operation) &&
    isNonBlankString(target.parameter_hash)
  )
}

export class D1StorageAdapter implements AdapterContract {
  readonly adapter_surface = D1_ADAPTER_SURFACE

  constructor(private readonly d1Executor: D1Executor) {}

  execute(
    aeo: AdapterTargetedAEO,
    _context: AdapterExecutionContext,
  ): AdapterExecutionEvidence | null {
    const target = aeo.target
    if (!isValidD1Target(target)) return null

    // Pass ONLY what AEO.target specifies — no injection beyond validated target parameters.
    return this.d1Executor({
      database_id: target.database_id,
      table_name: target.table_name,
      operation: target.operation,
      parameter_hash: target.parameter_hash,
    })
  }
}

// ── Entry Point ────────────────────────────────────────────────────────────────
// executeD1Adapter: public boundary for D1 storage execution.
// AEO hash enforcement and receipt construction are delegated to executeWithAdapter.

export function executeD1Adapter(
  aeo: AdapterTargetedAEO | null | undefined,
  validated_object_hash: string,
  executor: D1Executor,
  emitted_at: string,
): AdapterExecutionOutcome {
  return executeWithAdapter(aeo, validated_object_hash, new D1StorageAdapter(executor), emitted_at)
}

function isNonBlankString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}
