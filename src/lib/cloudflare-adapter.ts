// Issue #1866: Cloudflare Workers Adapter.
//
// Maps an AEO with target.system === "cloudflare_worker" to a Cloudflare Worker invocation.
// Cloudflare is the FIRST adapter surface — it does not provide runtime authority.
//
// Adapter responsibilities:
//   - Extract target fields from AEO.target (already validated by Ω validator)
//   - Call the Cloudflare Worker executor with exact target parameters
//   - Return CloudflareExecutionEvidence derived from the actual HTTP response
//   - Delegate receipt construction to executeWithAdapter (never fabricate proof)
//
// Adapter forbidden actions:
//   - Modifying, reinterpreting, or supplementing AEO.target fields
//   - Calling endpoints beyond what AEO.target specifies
//   - Using CF metadata (CF-Ray, region, colo) as authority evidence
//   - Falling back to a secondary endpoint when the primary fails
//   - Treating a non-2xx response as execution success
//   - Returning fabricated evidence fields
//
// Failure conditions that return NULL:
//   - AEO.target.system ≠ "cloudflare_worker" → EXECUTOR_RETURNED_NULL
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

export const CLOUDFLARE_ADAPTER_SURFACE = "cloudflare_worker" as const
export type CloudflareAdapterSurface = typeof CLOUDFLARE_ADAPTER_SURFACE

// ── Cloudflare AEO Target Shape ────────────────────────────────────────────────
// What AEO.target must contain for this adapter to route successfully.
// The Ω validator guarantees these fields are present and valid before the adapter runs.
// The adapter does NOT re-validate them — it reads them as-is.

export type CloudflareAEOTarget = {
  readonly system: "cloudflare_worker"
  readonly worker_url: string                      // exact endpoint — no dynamic resolution
  readonly method: "GET" | "POST" | "PUT" | "DELETE"
  readonly path: string                            // path within the worker
  readonly request_body_hash: string               // sha256 of serialized request body
}

// ── Cloudflare Execution Evidence ─────────────────────────────────────────────
// Must be derived from the actual HTTP response — never from AEO fields.
// execution_id is expected to be the CF-Ray header from the response. This is an
// executor obligation: the adapter contract rejects blank execution_id but cannot
// independently prove the value is system-assigned rather than fabricated.
// The concrete executor implementation is responsible for enforcing CF-Ray origin.

export type CloudflareExecutionEvidence = {
  readonly execution_id: string     // expected: CF-Ray header (executor obligation, not contract guarantee)
  readonly executed_at: string      // ISO timestamp of when the response was received
  readonly adapter_surface: "cloudflare_worker"
  readonly adapter_specific: {
    readonly status_code: number    // HTTP status from the worker response
    readonly response_hash: string  // sha256 of response body
    readonly worker_region: string  // CF-Region header or "unknown" if absent
  }
}

// ── Cloudflare Worker Executor ─────────────────────────────────────────────────
// Receives ONLY what AEO.target specifies — no additional context injection.
// Executor obligation: return evidence only after actual HTTP execution; null on any failure.
// The contract layer rejects blank evidence fields but does not independently verify origin.
// Concrete implementations should set execution_id from the CF-Ray response header and
// return null if that header is absent (indicating the request did not reach Cloudflare).

export type CloudflareWorkerExecutor = (target: {
  readonly worker_url: string
  readonly method: string
  readonly path: string
  readonly request_body_hash: string
}) => CloudflareExecutionEvidence | null

// ── Cloudflare Adapter ─────────────────────────────────────────────────────────

function isValidCloudflareTarget(
  target: Record<string, unknown>,
): target is Record<string, unknown> & CloudflareAEOTarget {
  return (
    target.system === "cloudflare_worker" &&
    isNonBlankString(target.worker_url) &&
    (target.method === "GET" ||
      target.method === "POST" ||
      target.method === "PUT" ||
      target.method === "DELETE") &&
    isNonBlankString(target.path) &&
    isNonBlankString(target.request_body_hash)
  )
}

export class CloudflareAdapter implements AdapterContract {
  readonly adapter_surface = CLOUDFLARE_ADAPTER_SURFACE

  constructor(private readonly workerExecutor: CloudflareWorkerExecutor) {}

  execute(
    aeo: AdapterTargetedAEO,
    _context: AdapterExecutionContext,
  ): AdapterExecutionEvidence | null {
    const target = aeo.target
    if (!isValidCloudflareTarget(target)) return null

    // Pass ONLY what AEO.target specifies — no injection of session IDs, auth tokens,
    // or any context beyond the validated target parameters.
    return this.workerExecutor({
      worker_url: target.worker_url,
      method: target.method,
      path: target.path,
      request_body_hash: target.request_body_hash,
    })
  }
}

// ── Entry Point ────────────────────────────────────────────────────────────────
// executeCloudflareAdapter: public boundary for Cloudflare Worker execution.
// AEO hash enforcement and receipt construction are delegated to executeWithAdapter.

export function executeCloudflareAdapter(
  aeo: AdapterTargetedAEO | null | undefined,
  validated_object_hash: string,
  executor: CloudflareWorkerExecutor,
  emitted_at: string,
): AdapterExecutionOutcome {
  return executeWithAdapter(aeo, validated_object_hash, new CloudflareAdapter(executor), emitted_at)
}

function isNonBlankString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}
