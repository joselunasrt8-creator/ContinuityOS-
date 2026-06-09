// Issue #1866: D1 Storage Adapter (AEO execution surface).
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
//
// Issue #1917: D1 Registry Adapter (continuity-core storage boundary).
//
// Implements the four abstract registry interfaces from storage-adapter.ts:
//   AuthorityRegistryReader  — read-only authority lookup
//   ReplayRegistryPort       — nonce admission and consumed-nonce detection
//   LineageRegistryReader/Appender — lineage_registry append-only chain
//   ProofRegistryAppender    — adapter_proof_registry append-only receipts
//   ValidCommitPort          — atomic post-VALID write group
//
// D1Database handle is constructor-injected and never re-exported.

import type {
  AdapterContract,
  AdapterTargetedAEO,
  AdapterExecutionContext,
  AdapterExecutionEvidence,
  AdapterExecutionOutcome,
  AdapterProofReceipt,
} from './adapter-contract.js'
import { executeWithAdapter } from './adapter-contract.js'
import { canonicalize, sha256Hex } from '../canonical.js'
import type {
  AppendResult,
  AuthorityRecord,
  LineageNode,
  StorageReadResult,
  ValidExecutionCommit,
  ContinuityStorageAdapter,
} from './storage-adapter.js'

// ── D1 AEO Execution Surface ──────────────────────────────────────────────────

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

// ── D1 Registry Adapter (Issue #1917) ─────────────────────────────────────────
// Implements ContinuityStorageAdapter against Cloudflare D1.
// D1Database handle is constructor-injected and stays inside this class.
// No D1Database reference appears in any continuity-core file.

export class D1RegistryAdapter implements ContinuityStorageAdapter {
  constructor(private readonly db: D1Database) {}

  // AuthorityRegistryReader ────────────────────────────────────────────────────

  async readAuthority(authority_id: string): Promise<AuthorityRecord | null> {
    const row = await this.db
      .prepare(`SELECT authority_id, delegation_lineage_hash, created_at, expiry, status FROM authority_registry WHERE authority_id = ?1`)
      .bind(authority_id)
      .first<any>()
    if (!row) return null
    return {
      authority_id: String(row.authority_id || ""),
      lineage_hash: String(row.delegation_lineage_hash || ""),
      valid_from: String(row.created_at || ""),
      valid_until: row.expiry && String(row.expiry) !== "UNLIMITED" && String(row.expiry) !== "" ? String(row.expiry) : null,
      revoked: String(row.status || "") === "CONSUMED" || String(row.status || "") === "REVOKED",
    }
  }

  // ReplayRegistryPort ─────────────────────────────────────────────────────────
  // Uses govern_nonce_registry (cluster 36) as the canonical nonce store.
  // nonce_domain = 'continuity-core' for storage adapter use.

  async isNonceUnused(replay_nonce: string): Promise<boolean> {
    const row = await this.db
      .prepare(`SELECT 1 FROM govern_nonce_registry WHERE nonce = ?1 LIMIT 1`)
      .bind(replay_nonce)
      .first<any>()
    return row === null
  }

  async markNonceConsumed(replay_nonce: string, decision_id: string): Promise<AppendResult> {
    const now = new Date().toISOString()
    const result = await this.db
      .prepare(`INSERT OR IGNORE INTO govern_nonce_registry (nonce, nonce_domain, candidate_hash, created_at) VALUES (?1, 'continuity-core', ?2, ?3)`)
      .bind(replay_nonce, decision_id, now)
      .run()
    const changes = result.meta?.changes ?? 0
    if (changes > 0) return { status: "APPENDED", id: replay_nonce, hash: decision_id }
    return { status: "ALREADY_EXISTS", id: replay_nonce, hash: decision_id }
  }

  // LineageRegistryReader + LineageRegistryAppender ────────────────────────────
  // Canonical table: lineage_registry.
  // execution_registry / validation_registry lineage columns are legacy read-through only.

  async readLineageNode(node_id: string): Promise<StorageReadResult<LineageNode>> {
    const row = await this.db
      .prepare(`SELECT node_id, parent_id, canonical_hash, depth FROM lineage_registry WHERE node_id = ?1`)
      .bind(node_id)
      .first<any>()
    if (!row) return { status: "NOT_FOUND" }
    const record: LineageNode = {
      node_id: String(row.node_id || ""),
      parent_id: row.parent_id ? String(row.parent_id) : null,
      canonical_hash: String(row.canonical_hash || ""),
      depth: Number(row.depth ?? 0),
    }
    const record_hash = await sha256Hex(canonicalize(record))
    return { status: "FOUND", record, record_hash }
  }

  async appendLineageNode(node: LineageNode): Promise<AppendResult> {
    const now = new Date().toISOString()
    const result = await this.db
      .prepare(`INSERT OR IGNORE INTO lineage_registry (node_id, parent_id, canonical_hash, depth, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
      .bind(node.node_id, node.parent_id ?? null, node.canonical_hash, node.depth, now)
      .run()
    const changes = result.meta?.changes ?? 0
    const hash = await sha256Hex(canonicalize(node))
    if (changes > 0) return { status: "APPENDED", id: node.node_id, hash }
    return { status: "ALREADY_EXISTS", id: node.node_id, hash }
  }

  // ProofRegistryAppender ──────────────────────────────────────────────────────
  // Writes to adapter_proof_registry (separate from the legacy proof_registry).
  // Duplicate receipt_id is a fatal integrity violation — returns REJECTED, never silently ignores.

  async appendProofReceipt(receipt: AdapterProofReceipt): Promise<AppendResult> {
    const existing = await this.db
      .prepare(`SELECT receipt_id FROM adapter_proof_registry WHERE receipt_id = ?1`)
      .bind(receipt.receipt_id)
      .first<any>()
    if (existing) {
      return { status: "REJECTED", reason: "duplicate_receipt_id" }
    }
    const now = new Date().toISOString()
    const result = await this.db
      .prepare(`INSERT INTO adapter_proof_registry (receipt_id, validated_object_hash, executed_object_hash, execution_evidence_hash, adapter_surface, decision_id, replay_nonce, execution_result, creates_authority, emitted_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10)`)
      .bind(
        receipt.receipt_id,
        receipt.validated_object_hash,
        receipt.executed_object_hash,
        receipt.execution_evidence_hash,
        receipt.adapter_surface,
        receipt.decision_id,
        receipt.replay_nonce,
        receipt.execution_result,
        receipt.emitted_at,
        now,
      )
      .run()
    const changes = result.meta?.changes ?? 0
    if (changes > 0) return { status: "APPENDED", id: receipt.receipt_id, hash: receipt.validated_object_hash }
    return { status: "REJECTED", reason: "insert_failed" }
  }

  // ValidCommitPort ────────────────────────────────────────────────────────────
  // Atomic post-VALID commit group: nonce consumed + lineage node + proof receipt.
  // The storage adapter owns this transaction boundary.
  // Returns REJECTED if any step fails — caller receives no partial commit.

  async commitValidatedExecution(record: ValidExecutionCommit): Promise<AppendResult> {
    const now = new Date().toISOString()
    const { replay_nonce, decision_id, lineage_node, proof_receipt } = record

    // Pre-check: reject if proof receipt already exists (duplicate_receipt_id is fatal)
    const existingProof = await this.db
      .prepare(`SELECT receipt_id FROM adapter_proof_registry WHERE receipt_id = ?1`)
      .bind(proof_receipt.receipt_id)
      .first<any>()
    if (existingProof) {
      return { status: "REJECTED", reason: "duplicate_receipt_id" }
    }

    const results = await this.db.batch([
      this.db
        .prepare(`INSERT OR IGNORE INTO govern_nonce_registry (nonce, nonce_domain, candidate_hash, created_at) VALUES (?1, 'continuity-core', ?2, ?3)`)
        .bind(replay_nonce, decision_id, now),
      this.db
        .prepare(`INSERT OR IGNORE INTO lineage_registry (node_id, parent_id, canonical_hash, depth, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
        .bind(lineage_node.node_id, lineage_node.parent_id ?? null, lineage_node.canonical_hash, lineage_node.depth, now),
      this.db
        .prepare(`INSERT INTO adapter_proof_registry (receipt_id, validated_object_hash, executed_object_hash, execution_evidence_hash, adapter_surface, decision_id, replay_nonce, execution_result, creates_authority, emitted_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?10)`)
        .bind(
          proof_receipt.receipt_id,
          proof_receipt.validated_object_hash,
          proof_receipt.executed_object_hash,
          proof_receipt.execution_evidence_hash,
          proof_receipt.adapter_surface,
          proof_receipt.decision_id,
          proof_receipt.replay_nonce,
          proof_receipt.execution_result,
          proof_receipt.emitted_at,
          now,
        ),
    ])

    const nonceChanges = (results[0] as any)?.meta?.changes ?? 0
    const lineageChanges = (results[1] as any)?.meta?.changes ?? 0
    const proofChanges = (results[2] as any)?.meta?.changes ?? 0

    if (proofChanges === 0) return { status: "REJECTED", reason: "proof_insert_failed" }
    if (nonceChanges === 0 && lineageChanges === 0) {
      // Both already existed — idempotent re-commit is acceptable
      return { status: "ALREADY_EXISTS", id: proof_receipt.receipt_id, hash: proof_receipt.validated_object_hash }
    }
    return { status: "APPENDED", id: proof_receipt.receipt_id, hash: proof_receipt.validated_object_hash }
  }
}

// ── Public Factory ─────────────────────────────────────────────────────────────

export function initializeD1RegistryAdapter(db: D1Database): D1RegistryAdapter {
  return new D1RegistryAdapter(db)
}

// ── D1 Registry Schema Bootstrap ──────────────────────────────────────────────
// Creates DDL for the four core continuity-core registries:
//   govern_nonce_registry, lineage_registry, adapter_proof_registry
// plus the migration for govern_nonce_registry (moved from cluster 36).
// Idempotent: safe to call multiple times.

export async function bootstrapContinuityRegistrySchema(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS lineage_registry (node_id TEXT PRIMARY KEY, parent_id TEXT, canonical_hash TEXT NOT NULL, depth INTEGER NOT NULL, created_at TEXT NOT NULL)`).run()
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_lineage_registry_no_update BEFORE UPDATE ON lineage_registry BEGIN SELECT RAISE(ABORT, 'lineage_registry is append-only'); END`).run()
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_lineage_registry_no_delete BEFORE DELETE ON lineage_registry BEGIN SELECT RAISE(ABORT, 'lineage_registry is append-only'); END`).run()
  await db.prepare(`CREATE TABLE IF NOT EXISTS adapter_proof_registry (receipt_id TEXT PRIMARY KEY, validated_object_hash TEXT NOT NULL, executed_object_hash TEXT NOT NULL, execution_evidence_hash TEXT NOT NULL, adapter_surface TEXT NOT NULL, decision_id TEXT NOT NULL, replay_nonce TEXT NOT NULL, execution_result TEXT NOT NULL CHECK (execution_result = 'EXECUTED'), creates_authority INTEGER NOT NULL CHECK (creates_authority = 0), emitted_at TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_adapter_proof_registry_no_update BEFORE UPDATE ON adapter_proof_registry BEGIN SELECT RAISE(ABORT, 'adapter_proof_registry is append-only'); END`).run()
  await db.prepare(`CREATE TRIGGER IF NOT EXISTS trg_adapter_proof_registry_no_delete BEFORE DELETE ON adapter_proof_registry BEGIN SELECT RAISE(ABORT, 'adapter_proof_registry is append-only'); END`).run()
  await ensureGovernNonceRegistrySchema(db)
}

// ── Govern Nonce Registry Schema (moved from src/index.ts cluster 36) ─────────
// Creates govern_nonce_registry with domain support and handles migration
// from the pre-domain schema.

export async function ensureGovernNonceRegistrySchema(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS govern_nonce_registry (nonce TEXT NOT NULL, nonce_domain TEXT NOT NULL, candidate_hash TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (nonce, nonce_domain))`).run()
  const tableInfo = await db.prepare(`PRAGMA table_info(govern_nonce_registry)`).all()
  const columns = Array.isArray(tableInfo?.results) ? tableInfo.results.map((row: any) => String(row?.name || "")) : []
  if (columns.includes("nonce_domain")) return
  await db.prepare(`CREATE TABLE IF NOT EXISTS govern_nonce_registry_v2 (nonce TEXT NOT NULL, nonce_domain TEXT NOT NULL, candidate_hash TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (nonce, nonce_domain))`).run()
  await db.prepare(`INSERT OR IGNORE INTO govern_nonce_registry_v2 (nonce, nonce_domain, candidate_hash, created_at) SELECT nonce, 'openclaw', candidate_hash, created_at FROM govern_nonce_registry`).run()
  await db.prepare(`DROP TABLE govern_nonce_registry`).run()
  await db.prepare(`ALTER TABLE govern_nonce_registry_v2 RENAME TO govern_nonce_registry`).run()
  const postInfo = await db.prepare(`PRAGMA table_info(govern_nonce_registry)`).all()
  const postColumns = Array.isArray(postInfo?.results) ? postInfo.results.map((row: any) => String(row?.name || "")) : []
  if (!postColumns.includes("nonce_domain")) throw new Error("govern_nonce_registry_nonce_domain_upgrade_failed")
}

// ── Proof Quarantine Helpers (moved from src/index.ts cluster 21) ─────────────
// Bootstrap-time offline path for detecting and quarantining historical proof duplicates.
// Must never run during the execution hot path.

export type ProofDuplicateQuarantineSummary = { detected: boolean; quarantined: number }

function proofDecisionHash(decision_id: string, validated_object_hash: string): string {
  return `${decision_id}${validated_object_hash}`
}

function proofLineageMaterial(row: any): Record<string, unknown> {
  return canonicalRecord({
    proof_id: String(row.proof_id || ""),
    session_id: String(row.session_id || ""),
    execution_id: String(row.execution_id || ""),
    decision_id: String(row.decision_id || ""),
    validated_object_hash: String(row.validated_object_hash || ""),
    surface: row.surface ?? null,
    run_id: row.run_id ?? null,
    commit_sha: row.commit_sha ?? null,
    workflow: row.workflow ?? null,
    environment: row.environment ?? null,
    created_at: String(row.created_at || ""),
    continuity_id: row.continuity_id ?? null,
    continuity_hash: row.continuity_hash ?? null,
    identity_id: row.identity_id ?? null,
    authority_lineage: row.authority_lineage ?? null,
    execution_lineage: row.execution_lineage ?? null,
    repository: row.repository ?? null,
    branch: row.branch ?? null,
    pull_request_id: row.pull_request_id ?? null,
    merge_commit_sha: row.merge_commit_sha ?? null,
    source_tree_hash: row.source_tree_hash ?? null,
    workflow_run_id: row.workflow_run_id ?? null,
    workflow_sha: row.workflow_sha ?? null,
  })
}

async function canonicalProofLineageHash(row: any, canonical_proof_id: string): Promise<string> {
  return sha256Hex(canonicalize({ canonical_proof_selected: canonical_proof_id, proof: proofLineageMaterial(row) }))
}

async function deterministicProofQuarantineId(row: any, lineage_hash: string): Promise<string> {
  return sha256Hex(canonicalize({ quarantine_reason: "duplicate_proof_lineage", proof_id: String(row.proof_id || ""), lineage_hash }))
}

export function sortProofLineageRows(rows: any[]): any[] {
  return [...rows].sort((a, b) => {
    const created = String(a.created_at || "").localeCompare(String(b.created_at || ""))
    if (created !== 0) return created
    const canonical = canonicalize(proofLineageMaterial(a)).localeCompare(canonicalize(proofLineageMaterial(b)))
    if (canonical !== 0) return canonical
    return String(a.proof_id || "").localeCompare(String(b.proof_id || ""))
  })
}

export async function quarantineHistoricalProofDuplicates(db: D1Database): Promise<ProofDuplicateQuarantineSummary> {
  const duplicateRows = await db.prepare(`SELECT rowid AS __rowid,* FROM proof_registry
    WHERE decision_hash IN (
      SELECT decision_hash FROM proof_registry GROUP BY decision_hash HAVING COUNT(*) > 1
    )
    ORDER BY decision_id ASC, validated_object_hash ASC, created_at ASC, proof_id ASC`).all()
  const rows = Array.isArray(duplicateRows?.results) ? duplicateRows.results : []
  if (rows.length === 0) return { detected: false, quarantined: 0 }

  const groups = new Map<string, any[]>()
  for (const row of rows) {
    const key = String(row.decision_hash || proofDecisionHash(String(row.decision_id || ""), String(row.validated_object_hash || "")))
    const group = groups.get(key) || []
    group.push(row)
    groups.set(key, group)
  }

  let quarantined = 0
  const duplicateRowids: string[] = []
  for (const group of groups.values()) {
    const ordered = sortProofLineageRows(group)
    const canonical = ordered[0]
    const canonical_proof_id = String(canonical.proof_id || "")
    for (const duplicate of ordered.slice(1)) {
      const proof_id = String(duplicate.proof_id || "")
      const lineage_hash = await canonicalProofLineageHash(duplicate, canonical_proof_id)
      const quarantine_id = await deterministicProofQuarantineId(duplicate, lineage_hash)
      const quarantine_generated_at = String(duplicate.created_at || canonical.created_at || "")
      await db.prepare(`INSERT OR IGNORE INTO proof_registry_duplicate_archive (archive_id,proof_id,session_id,execution_id,decision_id,validated_object_hash,surface,run_id,commit_sha,workflow,environment,created_at,archived_at,archive_reason,canonical_proof_id)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'duplicate_proof_lineage',?14)`).bind(
          `archive:${proof_id}:duplicate_proof_lineage`,
          proof_id,
          String(duplicate.session_id || ""),
          String(duplicate.execution_id || ""),
          String(duplicate.decision_id || ""),
          String(duplicate.validated_object_hash || ""),
          duplicate.surface ?? null,
          duplicate.run_id ?? null,
          duplicate.commit_sha ?? null,
          duplicate.workflow ?? null,
          duplicate.environment ?? null,
          String(duplicate.created_at || ""),
          quarantine_generated_at,
          canonical_proof_id,
        ).run()
      await db.prepare(`INSERT OR IGNORE INTO proof_quarantine_registry (quarantine_id,proof_id,lineage_hash,quarantine_reason,canonical_proof_selected,duplicate_proof_archived,quarantine_generated_at,replay_neutral,evidence_only)
        VALUES (?1,?2,?3,'duplicate_proof_lineage',?4,?5,?6,'true','true')`).bind(
          quarantine_id,
          proof_id,
          lineage_hash,
          canonical_proof_id,
          `archive:${proof_id}:duplicate_proof_lineage`,
          quarantine_generated_at,
        ).run()
      duplicateRowids.push(String(duplicate.__rowid || ""))
      quarantined += 1
    }
  }

  for (const rowid of duplicateRowids.filter(Boolean)) {
    await db.prepare(`DELETE FROM proof_registry WHERE rowid=?1`).bind(rowid).run()
  }
  return { detected: true, quarantined }
}

export async function backfillProofDecisionHashes(db: D1Database): Promise<void> {
  await db.prepare(`UPDATE proof_registry SET decision_hash = decision_id || char(31) || validated_object_hash WHERE decision_hash IS NULL OR decision_hash = ''`).run()
}

export async function validateProofArchiveCompatibility(db: D1Database): Promise<void> {
  await db.prepare(`INSERT OR IGNORE INTO proof_registry_duplicate_archive (archive_id,proof_id,session_id,execution_id,decision_id,validated_object_hash,surface,run_id,commit_sha,workflow,environment,created_at,archived_at,archive_reason,canonical_proof_id)
    SELECT 'bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe',NULL,NULL,NULL,NULL,NULL,'bootstrap_archive_compatibility_probe','bootstrap_archive_compatibility_probe','archive_compatibility_probe','bootstrap_archive_compatibility_probe'
    WHERE 0`).run()
}

export async function proofRegistryStabilized(db: D1Database): Promise<boolean> {
  const duplicates = await db.prepare(`SELECT COUNT(*) AS count FROM (
    SELECT decision_hash FROM proof_registry WHERE decision_hash IS NULL OR decision_hash = '' OR decision_hash != decision_id || char(31) || validated_object_hash
    UNION ALL
    SELECT decision_hash FROM proof_registry GROUP BY decision_hash HAVING COUNT(*) > 1
  )`).first<any>()
  return Number(duplicates?.count || 0) === 0
}

// ── Internal Utilities ────────────────────────────────────────────────────────

function canonicalRecord<T extends Record<string, unknown>>(obj: T): T {
  const sorted = {} as T
  for (const key of Object.keys(obj).sort()) {
    (sorted as any)[key] = (obj as any)[key]
  }
  return sorted
}

function isNonBlankString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0
}
