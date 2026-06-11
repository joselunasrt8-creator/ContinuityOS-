// Adapter shell for the filesystem-write gateway route.
//
// This module owns all HTTP/D1/Cloudflare concerns for the filesystem-write
// route. It parses the request, constructs FilesystemWriteIntentInput and
// FilesystemWriteKernelContext, calls the kernel, persists the result, and
// formats the response.
//
// Kernel boundary: runFilesystemWriteGatewayAction never receives Request,
// Response, URL, Headers, Env, D1Database, HTTP method, route path, or any
// Cloudflare-specific handle. All D1 access is wrapped behind read-only
// interfaces (FilesystemValidatorContext) or deferred until after EXECUTED.

import { canonicalize, sha256Hex } from '../canonical.js'
import { runFilesystemWriteGatewayAction } from './filesystem-write-runtime-gateway.js'
import type { FilesystemValidatorContext } from './filesystem-aeo-validator.js'
import type { FilesystemWriter } from './filesystem-execution-adapter.js'
import type { ReplayRegistryPort, LineageRegistryPort, FilesystemExecutionLineageNode, NullAuditRegistryPort, AppendResult } from './storage-adapter.js'
import {
  generateCorrelationId,
  classifyReasonClass,
  buildBoundedNullResponse,
  NULL_AUDIT_VALIDATOR_VERSION,
} from './null-audit.js'
import type { NullAuditRecord } from './null-audit.js'

type FilesystemWriteAdapterEnv = { DB: D1Database }

const FILESYSTEM_WRITE_ADAPTER_ROUTE = "/gateway/tool/filesystem-write" as const

const FILESYSTEM_WRITE_GATEWAY_DECISION_ID = "AUTH-filesystem-write-gateway-001" as const
const FILESYSTEM_WRITE_GATEWAY_POLICY_ID = "filesystem-write-gateway-policy-v1" as const
const FILESYSTEM_WRITE_GATEWAY_SEED_PATH = "governed/filesystem-write-gateway/seed.md" as const
const FILESYSTEM_WRITE_GATEWAY_SEED_CONTENT =
  "# Governed Filesystem Write Gateway\n\nSeed object for the runtime-enforced filesystem-write gateway action (issue #1890).\nEvery mutation to this registry passes through runFilesystemWriteGatewayAction.\n"

const FILESYSTEM_WRITE_GATEWAY_POLICY_BODY = Object.freeze({
  policy_id: FILESYSTEM_WRITE_GATEWAY_POLICY_ID,
  allowed_paths: Object.freeze(["governed/filesystem-write-gateway/**"]) as readonly string[],
  denied_paths: Object.freeze(["governed/filesystem-write-gateway/secrets/**"]) as readonly string[],
  allowed_operations: Object.freeze(["create", "modify"]) as readonly string[],
  denied_operations: Object.freeze(["delete", "chmod", "rename", "symlink"]) as readonly string[],
  max_files: 1,
  max_diff_lines: 300,
})

let _policyHash: string | null = null
function filesystemWriteGatewayPolicyHash(): string {
  if (!_policyHash) {
    _policyHash = "sha256:" + sha256Hex(canonicalize(FILESYSTEM_WRITE_GATEWAY_POLICY_BODY))
  }
  return _policyHash
}

async function ensureFilesystemWriteGatewayRegistry(env: FilesystemWriteAdapterEnv): Promise<void> {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS governed_filesystem_object_registry (path TEXT PRIMARY KEY, content TEXT NOT NULL, content_hash TEXT NOT NULL, bytes_written INTEGER NOT NULL, updated_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS governed_filesystem_write_decision_registry (decision_id TEXT PRIMARY KEY, status TEXT NOT NULL, authority_lineage_hash TEXT NOT NULL, scope TEXT NOT NULL, expires_at TEXT, created_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS governed_filesystem_write_nonce_registry (replay_nonce TEXT PRIMARY KEY, decision_id TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN ('UNUSED','RESERVED','CONSUMED','INVALIDATED')), created_at TEXT NOT NULL, consumed_at TEXT)`).run()
  // Proof registry: receipt_id (AdapterProofReceipt) is the primary key.
  // atao_id is stored by the route adapter (not in the generic receipt) for lineage tracing.
  // target_path is stored from the writer capture for observability.
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS governed_filesystem_write_proof_registry (receipt_id TEXT PRIMARY KEY, atao_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, executed_object_hash TEXT NOT NULL, execution_evidence_hash TEXT NOT NULL, adapter_surface TEXT NOT NULL, decision_id TEXT NOT NULL, replay_nonce TEXT NOT NULL, target_path TEXT NOT NULL, execution_result TEXT NOT NULL CHECK (execution_result IN ('EXECUTED')), creates_authority INTEGER NOT NULL CHECK (creates_authority = 0), emitted_at TEXT NOT NULL, created_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS governed_filesystem_write_proof_registry_append_only_update BEFORE UPDATE ON governed_filesystem_write_proof_registry BEGIN SELECT RAISE(ABORT, 'governed_filesystem_write_proof_registry is append-only'); END`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS governed_filesystem_write_proof_registry_append_only_delete BEFORE DELETE ON governed_filesystem_write_proof_registry BEGIN SELECT RAISE(ABORT, 'governed_filesystem_write_proof_registry is append-only'); END`).run()

  // Lineage registry: append-only traceability record for each EXECUTED filesystem write.
  // node_id = "lineage:" + receipt_id (deterministic, one record per proof receipt).
  // No lineage record exists for NULL or EXECUTED_UNCOMMITTED outcomes.
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS governed_filesystem_write_lineage_registry (node_id TEXT PRIMARY KEY, parent_id TEXT, canonical_aeo_hash TEXT NOT NULL, receipt_id TEXT NOT NULL, decision_id TEXT NOT NULL, replay_nonce TEXT NOT NULL, target_system TEXT NOT NULL, target_action TEXT NOT NULL, target_path TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('EXECUTED','EXECUTED_UNCOMMITTED')), created_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS governed_filesystem_write_lineage_registry_append_only_update BEFORE UPDATE ON governed_filesystem_write_lineage_registry BEGIN SELECT RAISE(ABORT, 'governed_filesystem_write_lineage_registry is append-only'); END`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS governed_filesystem_write_lineage_registry_append_only_delete BEFORE DELETE ON governed_filesystem_write_lineage_registry BEGIN SELECT RAISE(ABORT, 'governed_filesystem_write_lineage_registry is append-only'); END`).run()

  // NULL audit registry: internal diagnostic record for bounded NULL responses.
  // Audit/observability only — never proof, never authority, never replay state.
  // execution_performed and proof_emitted are structurally false (CHECK constraints).
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS governed_filesystem_write_null_audit_registry (correlation_id TEXT PRIMARY KEY, reason_class TEXT NOT NULL, stage TEXT, denial_reason TEXT, agent_id TEXT, session_id TEXT, atao_id TEXT, canonical_aeo_hash TEXT, decision_id TEXT, replay_nonce TEXT, validator_version TEXT NOT NULL, execution_performed INTEGER NOT NULL CHECK (execution_performed = 0), proof_emitted INTEGER NOT NULL CHECK (proof_emitted = 0), created_at TEXT NOT NULL)`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS governed_filesystem_write_null_audit_registry_append_only_update BEFORE UPDATE ON governed_filesystem_write_null_audit_registry BEGIN SELECT RAISE(ABORT, 'governed_filesystem_write_null_audit_registry is append-only'); END`).run()
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS governed_filesystem_write_null_audit_registry_append_only_delete BEFORE DELETE ON governed_filesystem_write_null_audit_registry BEGIN SELECT RAISE(ABORT, 'governed_filesystem_write_null_audit_registry is append-only'); END`).run()

  const now = new Date().toISOString()
  const authority_lineage_hash = "sha256:" + sha256Hex(canonicalize({ decision_id: FILESYSTEM_WRITE_GATEWAY_DECISION_ID, surface: "filesystem_write", scope: "repository" }))
  await env.DB.prepare(`INSERT OR IGNORE INTO governed_filesystem_write_decision_registry (decision_id, status, authority_lineage_hash, scope, expires_at, created_at) VALUES (?1, 'ACTIVE', ?2, 'repository', NULL, ?3)`)
    .bind(FILESYSTEM_WRITE_GATEWAY_DECISION_ID, authority_lineage_hash, now).run()

  const seed_hash = "sha256:" + sha256Hex(FILESYSTEM_WRITE_GATEWAY_SEED_CONTENT)
  await env.DB.prepare(`INSERT OR IGNORE INTO governed_filesystem_object_registry (path, content, content_hash, bytes_written, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(FILESYSTEM_WRITE_GATEWAY_SEED_PATH, FILESYSTEM_WRITE_GATEWAY_SEED_CONTENT, seed_hash, FILESYSTEM_WRITE_GATEWAY_SEED_CONTENT.length, now).run()
}

function normalizeGovernedFilesystemPath(path: string): { ok: boolean; value?: any; observation_error?: string; topology_visible?: boolean; safe_to_disclose?: boolean } {
  if (typeof path !== "string" || path.trim().length === 0) {
    return { ok: false, observation_error: "AMBIGUOUS_PATH", topology_visible: false, safe_to_disclose: true }
  }
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    return { ok: false, observation_error: "OUTSIDE_SCOPE", topology_visible: false, safe_to_disclose: true }
  }
  return { ok: true, value: path }
}

function buildD1ReplayRegistryPort(db: D1Database): ReplayRegistryPort {
  return {
    async isNonceUnused(replay_nonce: string): Promise<boolean> {
      const row = await db
        .prepare(`SELECT state FROM governed_filesystem_write_nonce_registry WHERE replay_nonce = ?1`)
        .bind(replay_nonce)
        .first<any>()
      return !row || String(row.state) === 'UNUSED'
    },
    async markNonceConsumed(replay_nonce: string, decision_id: string): Promise<AppendResult> {
      const now = new Date().toISOString()
      const result = await db
        .prepare(
          `INSERT INTO governed_filesystem_write_nonce_registry (replay_nonce, decision_id, state, created_at, consumed_at)
           VALUES (?1, ?2, 'CONSUMED', ?3, ?3)
           ON CONFLICT(replay_nonce) DO UPDATE SET state = 'CONSUMED', consumed_at = excluded.consumed_at`,
        )
        .bind(replay_nonce, decision_id, now)
        .run()
      const changes = result.meta?.changes ?? 0
      return changes > 0
        ? { status: 'APPENDED', id: replay_nonce, hash: decision_id }
        : { status: 'ALREADY_EXISTS', id: replay_nonce, hash: decision_id }
    },
  }
}

function buildD1LineageRegistryPort(db: D1Database): LineageRegistryPort {
  return {
    async appendLineageNode(node: FilesystemExecutionLineageNode) {
      const now = new Date().toISOString()
      const result = await db
        .prepare(
          `INSERT INTO governed_filesystem_write_lineage_registry
             (node_id, parent_id, canonical_aeo_hash, receipt_id, decision_id, replay_nonce,
              target_system, target_action, target_path, status, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
           ON CONFLICT(node_id) DO NOTHING`,
        )
        .bind(
          node.node_id, node.parent_id ?? null, node.canonical_aeo_hash,
          node.receipt_id, node.decision_id, node.replay_nonce,
          node.target_system, node.target_action, node.target_path,
          node.status, now,
        )
        .run()
      const changes = result.meta?.changes ?? 0
      if (changes > 0) return { status: 'APPENDED', id: node.node_id, hash: node.canonical_aeo_hash }
      return { status: 'ALREADY_EXISTS', id: node.node_id, hash: node.canonical_aeo_hash }
    },
  }
}

function buildD1NullAuditRegistryPort(db: D1Database): NullAuditRegistryPort {
  return {
    async appendNullAuditRecord(record: NullAuditRecord): Promise<AppendResult> {
      const result = await db
        .prepare(
          `INSERT INTO governed_filesystem_write_null_audit_registry
             (correlation_id, reason_class, stage, denial_reason, agent_id, session_id,
              atao_id, canonical_aeo_hash, decision_id, replay_nonce, validator_version,
              execution_performed, proof_emitted, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 0, 0, ?12)
           ON CONFLICT(correlation_id) DO NOTHING`,
        )
        .bind(
          record.correlation_id, record.reason_class, record.stage, record.denial_reason,
          record.agent_id, record.session_id, record.atao_id, record.canonical_aeo_hash,
          record.decision_id, record.replay_nonce, record.validator_version, record.created_at,
        )
        .run()
      const changes = result.meta?.changes ?? 0
      if (changes > 0) return { status: 'APPENDED', id: record.correlation_id, hash: record.reason_class }
      return { status: 'ALREADY_EXISTS', id: record.correlation_id, hash: record.reason_class }
    },
  }
}

// respondBoundedNull: the only path that produces an agent-visible NULL response.
//
// reason_class is computed for the audit record only — it is never serialized
// into the response. The agent receives exactly { result, execution_performed,
// proof_emitted, correlation_id }. The full diagnostic detail (stage,
// denial_reason, atao/aeo linkage) is persisted to
// governed_filesystem_write_null_audit_registry, resolvable by an operator via
// correlation_id.
async function respondBoundedNull(
  auditPort: NullAuditRegistryPort,
  partial: {
    readonly stage: string | null
    readonly reason: string | null
    readonly failure_class?: string | null
    readonly null_reason?: string | null
    readonly agent_id: string | null
    readonly session_id: string | null
    readonly atao_id?: string | null
    readonly canonical_aeo_hash?: string | null
    readonly decision_id?: string | null
    readonly replay_nonce?: string | null
  },
): Promise<Response> {
  const reason_class = classifyReasonClass({
    stage: partial.stage,
    reason: partial.reason,
    failure_class: partial.failure_class ?? null,
    null_reason: partial.null_reason ?? null,
  })
  const correlation_id = generateCorrelationId()
  const record: NullAuditRecord = {
    correlation_id,
    result: 'NULL',
    reason_class,
    stage: partial.stage,
    denial_reason: partial.failure_class ?? partial.reason,
    agent_id: partial.agent_id,
    session_id: partial.session_id,
    atao_id: partial.atao_id ?? null,
    canonical_aeo_hash: partial.canonical_aeo_hash ?? null,
    decision_id: partial.decision_id ?? null,
    replay_nonce: partial.replay_nonce ?? null,
    validator_version: NULL_AUDIT_VALIDATOR_VERSION,
    execution_performed: false,
    proof_emitted: false,
    created_at: new Date().toISOString(),
  }
  await auditPort.appendNullAuditRecord(record)
  return filesystemWriteResponse(buildBoundedNullResponse(correlation_id))
}

function buildD1FilesystemValidatorContext(
  env: FilesystemWriteAdapterEnv,
  policy_hash: string,
  replayPort: ReplayRegistryPort,
): FilesystemValidatorContext {
  return {
    authorityRegistry: {
      readDecision: async (decisionId: string) => {
        const row = await env.DB.prepare(`SELECT * FROM governed_filesystem_write_decision_registry WHERE decision_id = ?1`).bind(decisionId).first<any>()
        if (!row) return { ok: false, observation_error: "REGISTRY_MISS", topology_visible: false, safe_to_disclose: true }
        return { ok: true, value: { decision_id: String(row.decision_id), status: String(row.status), authority_lineage_hash: String(row.authority_lineage_hash), scope: String(row.scope), expires_at: row.expires_at ? String(row.expires_at) : null } }
      },
      readAuthorityLineage: async (decisionId: string) => {
        const row = await env.DB.prepare(`SELECT * FROM governed_filesystem_write_decision_registry WHERE decision_id = ?1`).bind(decisionId).first<any>()
        if (!row) return { ok: false, observation_error: "LINEAGE_MISMATCH", topology_visible: false, safe_to_disclose: true }
        return { ok: true, value: { lineage_hash: String(row.authority_lineage_hash), status: String(row.status) } }
      },
    },
    policyRegistry: {
      readPolicy: async () => ({
        ok: true,
        value: {
          policy_id: FILESYSTEM_WRITE_GATEWAY_POLICY_ID,
          policy_hash,
          allowed_paths: FILESYSTEM_WRITE_GATEWAY_POLICY_BODY.allowed_paths,
          denied_paths: FILESYSTEM_WRITE_GATEWAY_POLICY_BODY.denied_paths,
          allowed_operations: FILESYSTEM_WRITE_GATEWAY_POLICY_BODY.allowed_operations,
          denied_operations: FILESYSTEM_WRITE_GATEWAY_POLICY_BODY.denied_operations,
          max_files: FILESYSTEM_WRITE_GATEWAY_POLICY_BODY.max_files,
          max_diff_lines: FILESYSTEM_WRITE_GATEWAY_POLICY_BODY.max_diff_lines,
        },
      }),
      readPolicyHash: async () => ({ ok: true, value: policy_hash }),
    },
    replayRegistry: {
      readNonceState: async (replayNonce: string) => {
        const unused = await replayPort.isNonceUnused(replayNonce)
        return { ok: true, value: unused ? 'UNUSED' : 'CONSUMED' } as any
      },
      readAeoState: async () => ({ ok: true, value: 'UNUSED' }),
    },
    filesystem: {
      normalizePath: (path: string) => normalizeGovernedFilesystemPath(path) as any,
      readHash: async (normalizedPath: any) => {
        const row = await env.DB.prepare(`SELECT content_hash FROM governed_filesystem_object_registry WHERE path = ?1`).bind(String(normalizedPath)).first<any>()
        if (!row) return { ok: false, observation_error: "NOT_FOUND", topology_visible: false, safe_to_disclose: true }
        return { ok: true, value: String(row.content_hash) }
      },
      readMetadata: async (normalizedPath: any) => {
        const row = await env.DB.prepare(`SELECT path FROM governed_filesystem_object_registry WHERE path = ?1`).bind(String(normalizedPath)).first<any>()
        return { ok: true, value: { exists: Boolean(row), is_symlink: false } }
      },
    },
    diffInspector: {
      hashDiff: (diff: any) => ({ ok: true, value: "sha256:" + diff.content }),
      inspectApplicability: async () => ({ ok: true, value: { applicable: true, post_write_hash: "" } }),
    },
    clock: {
      now: () => ({ ok: true, value: new Date().toISOString() }),
    },
  } as any
}

type FilesystemWriterCapture = {
  readonly path: string
  readonly content: string
  readonly bytes_written: number
}

// The FilesystemWriter contract is synchronous — it captures path+content immediately
// so the proof can be emitted in the same call. D1 writes are async, so the capture
// is persisted to governed_filesystem_object_registry strictly after the EXECUTED
// outcome is confirmed. There is no other way for that registry to change.
function buildD1FilesystemWriter(clock: () => string): {
  writer: FilesystemWriter
  capture: () => FilesystemWriterCapture | null
} {
  let captured: FilesystemWriterCapture | null = null
  const writer: FilesystemWriter = ({ path, content }) => {
    const bytes_written = content.length
    captured = { path, content, bytes_written }
    const execution_id = "fs-write:sha256:" + sha256Hex(content)
    const executed_at = clock()
    return { execution_id, executed_at, bytes_written }
  }
  return { writer, capture: () => captured }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json" } })
}

function filesystemWriteResponse(data: Record<string, unknown>, status = 200): Response {
  return json({
    route: FILESYSTEM_WRITE_ADAPTER_ROUTE,
    mutation_capability: true,
    execution_capability: true,
    proof_generating: true,
    creates_authority: false,
    ...data,
  }, status)
}

// handleFilesystemWriteRoute: adapter entry point for the filesystem-write route.
//
// Parses the request, constructs kernel inputs, invokes runFilesystemWriteGatewayAction
// (the only path to an EXECUTED filesystem-write proof), persists the result to D1
// only on EXECUTED, and returns a structured response.
//
// The kernel receives only FilesystemWriteIntentInput (pure agent data) and
// FilesystemWriteKernelContext (adapter-boundary constructs with no transport handles).
export async function handleFilesystemWriteRoute(env: FilesystemWriteAdapterEnv, request: Request): Promise<Response> {
  await ensureFilesystemWriteGatewayRegistry(env)
  const nullAuditRegistryPort = buildD1NullAuditRegistryPort(env.DB)

  const b = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!b || typeof b !== "object") {
    return respondBoundedNull(nullAuditRegistryPort, {
      stage: "capture", reason: "malformed_request", agent_id: null, session_id: null,
    })
  }

  const agent_id = String(b.agent_id || "")
  const session_id = String(b.session_id || "")
  const intent = String(b.intent || "")
  const path = String(b.path || "")
  const content = typeof b.content === "string" ? b.content : ""
  const decision_id = String(b.decision_id || FILESYSTEM_WRITE_GATEWAY_DECISION_ID)
  const replay_nonce = String(b.replay_nonce || "")

  if (!agent_id || !session_id || !intent || !path || !replay_nonce) {
    return respondBoundedNull(nullAuditRegistryPort, {
      stage: "capture", reason: "missing_required_fields",
      agent_id: agent_id || null, session_id: session_id || null,
    })
  }

  const decisionRow = await env.DB.prepare(`SELECT * FROM governed_filesystem_write_decision_registry WHERE decision_id = ?1`).bind(decision_id).first<any>()
  if (!decisionRow) {
    return respondBoundedNull(nullAuditRegistryPort, {
      stage: "validate", reason: "decision_not_found",
      agent_id, session_id, decision_id, replay_nonce,
    })
  }

  const nonceRow = await env.DB.prepare(`SELECT * FROM governed_filesystem_write_nonce_registry WHERE replay_nonce = ?1`).bind(replay_nonce).first<any>()
  if (nonceRow && String(nonceRow.decision_id) !== decision_id) {
    return respondBoundedNull(nullAuditRegistryPort, {
      stage: "validate", reason: "replay_nonce_decision_mismatch",
      agent_id, session_id, decision_id, replay_nonce,
    })
  }

  const existingObject = await env.DB.prepare(`SELECT * FROM governed_filesystem_object_registry WHERE path = ?1`).bind(path).first<any>()
  const pre_write_hash = existingObject ? String(existingObject.content_hash) : ""

  const policy_hash = filesystemWriteGatewayPolicyHash()

  const atao_input = {
    agent_id,
    session_id,
    intent,
    path,
    content,
    repo: "mindshift-demo",
    root: "repository",
    timestamp: new Date().toISOString(),
  }

  const binding = {
    decision_id,
    authority_lineage_hash: String(decisionRow.authority_lineage_hash),
    policy_id: FILESYSTEM_WRITE_GATEWAY_POLICY_ID,
    policy_hash,
    pre_write_hash,
    proposed_diff_hash: "",
    replay_nonce,
    allowed_paths: FILESYSTEM_WRITE_GATEWAY_POLICY_BODY.allowed_paths,
    denied_paths: FILESYSTEM_WRITE_GATEWAY_POLICY_BODY.denied_paths,
    allowed_operations: FILESYSTEM_WRITE_GATEWAY_POLICY_BODY.allowed_operations,
    denied_operations: FILESYSTEM_WRITE_GATEWAY_POLICY_BODY.denied_operations,
    max_files: FILESYSTEM_WRITE_GATEWAY_POLICY_BODY.max_files,
    max_diff_lines: FILESYSTEM_WRITE_GATEWAY_POLICY_BODY.max_diff_lines,
  }

  const replayRegistryPort = buildD1ReplayRegistryPort(env.DB)
  const lineageRegistryPort = buildD1LineageRegistryPort(env.DB)
  const validator_context = buildD1FilesystemValidatorContext(env, policy_hash, replayRegistryPort)
  const writerHandle = buildD1FilesystemWriter(() => new Date().toISOString())
  const emitted_at = new Date().toISOString()

  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input, binding },
    { validator_context, writer: writerHandle.writer, replay_registry: replayRegistryPort, emitted_at },
  )

  if (outcome.result !== 'EXECUTED' && outcome.result !== 'EXECUTED_UNCOMMITTED') {
    return respondBoundedNull(nullAuditRegistryPort, {
      stage: outcome.stage,
      reason: outcome.reason,
      failure_class: outcome.validator_denial?.failure_class ?? null,
      agent_id, session_id, decision_id, replay_nonce,
      canonical_aeo_hash: outcome.validator_denial?.aeo_hash ?? null,
    })
  }

  const captured = writerHandle.capture()
  if (!captured) {
    return respondBoundedNull(nullAuditRegistryPort, {
      stage: 'execute', reason: 'WRITER_CAPTURE_MISSING',
      agent_id, session_id, decision_id, replay_nonce, atao_id: outcome.atao_id,
      canonical_aeo_hash: outcome.receipt.validated_object_hash,
    })
  }

  // The real side effect: persisted only because — and exactly as — the
  // mandatory chain returned EXECUTED or EXECUTED_UNCOMMITTED. No other code
  // path writes this row. Nonce consumption is handled by the gateway via
  // ReplayRegistryPort.markNonceConsumed — not by raw SQL here.
  const content_hash = 'sha256:' + sha256Hex(captured.content)
  const persisted_at = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO governed_filesystem_object_registry (path, content, content_hash, bytes_written, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(path) DO UPDATE SET content = excluded.content, content_hash = excluded.content_hash, bytes_written = excluded.bytes_written, updated_at = excluded.updated_at`)
    .bind(captured.path, captured.content, content_hash, captured.bytes_written, persisted_at).run()

  const receipt = outcome.receipt
  await env.DB.prepare(`INSERT INTO governed_filesystem_write_proof_registry (receipt_id, atao_id, validated_object_hash, executed_object_hash, execution_evidence_hash, adapter_surface, decision_id, replay_nonce, target_path, execution_result, creates_authority, emitted_at, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,0,?11,?12)`)
    .bind(receipt.receipt_id, outcome.atao_id, receipt.validated_object_hash, receipt.executed_object_hash, receipt.execution_evidence_hash, receipt.adapter_surface, receipt.decision_id, receipt.replay_nonce, captured.path, receipt.execution_result, receipt.emitted_at, persisted_at).run()

  // Lineage append: route-level, after proof persistence.
  // Ordering: executeWithAdapter → markNonceConsumed → appendProofReceipt → appendLineageNode.
  // EXECUTED only — EXECUTED_UNCOMMITTED does not claim lineage convergence.
  // Lineage failure does not change execution result; lineage_append_status is separate evidence.
  let lineage_append_status: string | null = null
  if (outcome.result === 'EXECUTED') {
    const lineageNode: FilesystemExecutionLineageNode = {
      node_id: 'lineage:' + receipt.receipt_id,
      parent_id: null,
      canonical_aeo_hash: receipt.validated_object_hash,
      receipt_id: receipt.receipt_id,
      decision_id: receipt.decision_id,
      replay_nonce: receipt.replay_nonce,
      target_system: 'filesystem',
      target_action: 'write_file',
      target_path: captured.path,
      status: 'EXECUTED',
    }
    const lineageResult = await lineageRegistryPort.appendLineageNode(lineageNode)
    lineage_append_status = lineageResult.status
  }

  return filesystemWriteResponse({
    status: outcome.result,
    result: outcome.result,
    receipt,
    target_path: captured.path,
    bytes_written: captured.bytes_written,
    content_hash,
    ...(lineage_append_status !== null ? { lineage_append_status } : {}),
  })
}
