// Issue #1917: Storage Adapter Boundary.
//
// Abstract registry interfaces for the continuity-core storage boundary.
// No database handles, no D1, no SQLite, no Postgres. Pure interface definitions.
//
// The kernel computes. The storage layer persists. They are not the same surface.
//
// Two invariants must survive every storage adapter swap:
//   If no valid object exists → nothing happens.
//   validated_object == executed_object.
//
// D1 is the reference implementation (src/lib/d1-storage-adapter.ts).
// SQLite and Postgres adapters are planned for V3 step 7.

import type { AdapterProofReceipt } from './adapter-contract.js'
import type { NullAuditRecord } from './null-audit.js'

// ── Shared Result Types ────────────────────────────────────────────────────────

// AppendResult: returned by every write path so failures are never silently hidden.
export type AppendResult =
  | { readonly status: "APPENDED"; readonly id: string; readonly hash: string }
  | { readonly status: "ALREADY_EXISTS"; readonly id: string; readonly hash: string }
  | { readonly status: "REJECTED"; readonly reason: string }

// StorageReadResult: generic verified-read envelope.
// Callers should verify record_hash === sha256(canonicalize(record)) before trusting.
export type StorageReadResult<T> =
  | { readonly status: "FOUND"; readonly record: T; readonly record_hash: string }
  | { readonly status: "NOT_FOUND" }
  | { readonly status: "BOUNDARY_DIVERGENCE"; readonly reason: string }

// ── Authority Registry ─────────────────────────────────────────────────────────
// Kernel reads authority at execution time to evaluate authority_lineage_hash.
// The kernel never writes to the authority registry during execution.

export type AuthorityRecord = {
  readonly authority_id: string
  readonly lineage_hash: string       // canonical hash of authority provenance chain
  readonly valid_from: string         // ISO timestamp
  readonly valid_until: string | null // null = no expiry defined
  readonly revoked: boolean
}

export interface AuthorityRegistryReader {
  // Returns null (not throws) when authority_id is not found. NULL execution, not storage error.
  readAuthority(authority_id: string): Promise<AuthorityRecord | null>
}

// ── Replay Registry ────────────────────────────────────────────────────────────
// Nonce admission check and consumed-nonce detection.
// UNUSED → CONSUMED is a terminal state transition enforced by database constraints.

export interface ReplayRegistryPort {
  // Returns true if the nonce has never been consumed. Returns false (not throws) when consumed.
  isNonceUnused(replay_nonce: string): Promise<boolean>

  // Marks the nonce as consumed. Returns AppendResult so duplicate/consumed nonce
  // cannot be silently hidden. Must never be called on a NULL execution path.
  markNonceConsumed(replay_nonce: string, decision_id: string): Promise<AppendResult>
}

// ── Lineage Registry ───────────────────────────────────────────────────────────
// Append-only chain of execution stage hashes.
// Canonical table: lineage_registry. execution_registry / validation_registry
// lineage columns are legacy read-through only during migration.
// Lineage failures are not recoverable — they return NULL.

export type LineageNode = {
  readonly node_id: string
  readonly parent_id: string | null   // null only for root
  readonly canonical_hash: string     // sha256 of canonical node representation
  readonly depth: number              // chain depth from root
}

export interface LineageRegistryReader {
  // Returns NOT_FOUND (not throws) when node_id is absent. NULL execution, not storage error.
  readLineageNode(node_id: string): Promise<StorageReadResult<LineageNode>>
}

export interface LineageRegistryAppender {
  // Appends a new lineage node after a VALID execution.
  // Must never be called on a NULL execution path.
  appendLineageNode(node: LineageNode): Promise<AppendResult>
}

// ── Lineage Registry Port ──────────────────────────────────────────────────────
// Write-side port for post-execution lineage traceability.
// Named consistently with ReplayRegistryPort — the write-side port for the lineage boundary.
// Lineage semantics (what to record) live in the route orchestrator;
// lineage persistence lives exclusively in the adapter through this port.
// Must never be called on a NULL execution path.
// Proof is the authoritative execution evidence; lineage is traceability only.
// No reconciliation. No convergence claims.

export type FilesystemExecutionLineageNode = {
  readonly node_id: string                                   // deterministic: "lineage:" + receipt_id
  readonly parent_id: string | null                          // null — no parent chain in V3 initial implementation
  readonly canonical_aeo_hash: string                        // sha256 of the CanonicalAEO (== receipt.validated_object_hash)
  readonly receipt_id: string                                // bound to the proof receipt for this execution
  readonly decision_id: string                               // governing decision that authorized execution
  readonly replay_nonce: string                              // nonce consumed to reach EXECUTED
  readonly target_system: string                             // "filesystem"
  readonly target_action: string                             // "write_file"
  readonly target_path: string                               // target file path from the CanonicalAEO
  readonly status: "EXECUTED" | "EXECUTED_UNCOMMITTED"       // mirrors gateway execution outcome
}

export interface LineageRegistryPort {
  // Appends a lineage traceability record after proof persistence.
  // Returns AppendResult — ALREADY_EXISTS is allowed (idempotent retry); REJECTED surfaces the error.
  // Lineage append failure must not erase proof or change execution result.
  appendLineageNode(node: FilesystemExecutionLineageNode): Promise<AppendResult>
}

// ── Proof Registry ─────────────────────────────────────────────────────────────
// Append-only proof persistence after VALID execution.
// Duplicate receipt_id is a fatal integrity violation — must surface, never silently drop.
// receipt_id is pre-computed by the kernel — never generated by the storage adapter.

export type { AdapterProofReceipt as ProofReceipt }

export interface ProofRegistryAppender {
  // Persists an immutable proof receipt.
  // Returns REJECTED (not silent) when receipt_id already exists.
  // Must never be called on a NULL execution path.
  appendProofReceipt(receipt: AdapterProofReceipt): Promise<AppendResult>
}

// ── Atomic Post-VALID Commit ───────────────────────────────────────────────────
// All four writes (nonce consumed, lineage node, proof receipt, evidence persist)
// must succeed together or the execution result is indeterminate.
// The storage adapter owns this transaction boundary; the kernel calls one method.

export type ValidExecutionCommit = {
  readonly replay_nonce: string
  readonly decision_id: string
  readonly lineage_node: LineageNode
  readonly proof_receipt: AdapterProofReceipt
}

export interface ValidCommitPort {
  // Atomic commit of the post-VALID write group.
  // Returns REJECTED if any write fails; caller receives no partial commit.
  commitValidatedExecution(record: ValidExecutionCommit): Promise<AppendResult>
}

// ── NULL Audit Registry ────────────────────────────────────────────────────────
// Audit/observability surface for bounded NULL responses (governed
// filesystem-write route). A NullAuditRecord is never proof, never authority,
// and never affects replay eligibility:
//   NULL audit record != proof
//   NULL audit record != authority
//   NULL audit record != replay eligibility
// execution_performed and proof_emitted are structurally false.
// Must never be called on an EXECUTED / EXECUTED_UNCOMMITTED path.

export interface NullAuditRegistryPort {
  // Persists the internal diagnostic record for a bounded NULL response.
  // Returns AppendResult so audit-write failures are never silently hidden.
  appendNullAuditRecord(record: NullAuditRecord): Promise<AppendResult>
}

// ── Composite Storage Adapter Interface ───────────────────────────────────────
// Implements the full storage contract for continuity-core.
// D1Database / SqliteDatabase / PgClient must never appear on the public interface.

export interface ContinuityStorageAdapter extends
  AuthorityRegistryReader,
  ReplayRegistryPort,
  LineageRegistryReader,
  LineageRegistryAppender,
  ProofRegistryAppender,
  ValidCommitPort {}
