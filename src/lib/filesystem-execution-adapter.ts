// Execution Adapter Boundary — filesystem write surface.
//
// Maps an AEO with target.system === "filesystem" to a filesystem write.
// FilesystemExecutionAdapter is the reference implementation of the execution
// adapter boundary for the filesystem substrate.
//
// Adapter responsibilities:
//   - Extract target.path from AEO.target (already validated by Ω validator)
//   - Invoke the injected writer with exactly the pre-bound content and validated path
//   - Return FilesystemExecutionEvidence derived from the actual write result
//   - Delegate receipt construction to executeWithAdapter (never fabricate proof)
//
// Adapter forbidden actions:
//   - Modifying, reinterpreting, or supplementing AEO.target fields
//   - Deriving path or content from any source other than AEO.target.path and pre-bound content
//   - Using write metadata (bytes_written, executed_at) as authority evidence
//   - Falling back to a secondary path when the primary write fails
//   - Returning fabricated evidence fields
//
// Failure conditions that return NULL:
//   - AEO.target.system ≠ "filesystem" → EXECUTOR_RETURNED_NULL
//   - AEO.target.path is missing or blank → EXECUTOR_RETURNED_NULL
//   - writer() returns null → EXECUTOR_RETURNED_NULL
//   - Propagated: OBJECT_HASH_MISMATCH, NULL_AEO_INPUT, NULL_VALIDATED_HASH, etc.
//
// Content binding:
//   Content is pre-bound at construction time from the captured ATAO.
//   The AEO carries content identity (proposed_diff_hash, pre_write_hash) but
//   not content bytes — the adapter closes over the exact content the Ω validator
//   approved via those hashes.

import type {
  AdapterContract,
  AdapterTargetedAEO,
  AdapterExecutionContext,
  AdapterExecutionEvidence,
  AdapterExecutionOutcome,
} from './adapter-contract.js'
import { executeWithAdapter } from './adapter-contract.js'

export const FILESYSTEM_ADAPTER_SURFACE = "filesystem" as const
export type FilesystemAdapterSurface = typeof FILESYSTEM_ADAPTER_SURFACE

// ── Filesystem Writer ──────────────────────────────────────────────────────────
// Injected synchronous write function.
//
// For D1-backed execution: a capture closure that records path+content for
// deferred async persistence; the route adapter performs the real D1 write
// strictly after an EXECUTED outcome.
//
// For real filesystem execution: writes the file and returns system metadata.
//
// Returning null signals write failure — the adapter returns null to executeWithAdapter,
// which emits EXECUTOR_RETURNED_NULL. The executor obligation: return null on any
// failure rather than throwing or returning incomplete evidence.

export type FilesystemWriteResult = {
  readonly execution_id: string  // assigned by the writer (e.g. "fs-write:sha256:<hash>")
  readonly executed_at: string   // ISO timestamp at moment of write
  readonly bytes_written: number
}

export type FilesystemWriter = (input: {
  readonly path: string
  readonly content: string
}) => FilesystemWriteResult | null

// ── Filesystem Execution Evidence ─────────────────────────────────────────────
// Derived from the actual write result — never from AEO fields.
// execution_id must come from the writer, not be fabricated by the adapter.

export type FilesystemExecutionEvidence = {
  readonly execution_id: string
  readonly executed_at: string
  readonly adapter_surface: "filesystem"
  readonly adapter_specific: {
    readonly bytes_written: number
    readonly path: string
    readonly operation: string
  }
}

// ── Filesystem Execution Adapter ───────────────────────────────────────────────

export class FilesystemExecutionAdapter implements AdapterContract {
  readonly adapter_surface = FILESYSTEM_ADAPTER_SURFACE

  constructor(
    private readonly content: string,
    private readonly writer: FilesystemWriter,
  ) {}

  execute(
    aeo: AdapterTargetedAEO,
    _context: AdapterExecutionContext,
  ): AdapterExecutionEvidence | null {
    if (aeo.target.system !== FILESYSTEM_ADAPTER_SURFACE) return null

    const path = typeof aeo.target.path === 'string' ? aeo.target.path : null
    if (!path) return null

    const operation = typeof aeo.target.operation === 'string'
      ? aeo.target.operation
      : 'write'

    const result = this.writer({ path, content: this.content })
    if (!result) return null

    return {
      execution_id: result.execution_id,
      executed_at: result.executed_at,
      adapter_surface: FILESYSTEM_ADAPTER_SURFACE,
      adapter_specific: {
        bytes_written: result.bytes_written,
        path,
        operation,
      },
    }
  }
}

// ── Entry Point ────────────────────────────────────────────────────────────────
// executeFilesystemAdapter: public boundary for filesystem write execution.
// AEO hash enforcement and receipt construction are delegated to executeWithAdapter.
//
// content is pre-bound from the ATAO — the exact bytes whose hash the Ω validator
// approved. The adapter never re-derives or reinterprets content from AEO fields.

export function executeFilesystemAdapter(
  aeo: AdapterTargetedAEO | null | undefined,
  validated_object_hash: string,
  content: string,
  writer: FilesystemWriter,
  emitted_at: string,
): AdapterExecutionOutcome {
  return executeWithAdapter(
    aeo,
    validated_object_hash,
    new FilesystemExecutionAdapter(content, writer),
    emitted_at,
  )
}
