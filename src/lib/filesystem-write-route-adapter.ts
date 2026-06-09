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
import type { ReplayRegistryPort, AppendResult } from './storage-adapter.js'

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
  const b = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!b || typeof b !== "object") return filesystemWriteResponse({ status: "NULL", result: "NULL", reason: "malformed_request" })

  const agent_id = String(b.agent_id || "")
  const session_id = String(b.session_id || "")
  const intent = String(b.intent || "")
  const path = String(b.path || "")
  const content = typeof b.content === "string" ? b.content : ""
  const decision_id = String(b.decision_id || FILESYSTEM_WRITE_GATEWAY_DECISION_ID)
  const replay_nonce = String(b.replay_nonce || "")

  if (!agent_id || !session_id || !intent || !path || !replay_nonce) {
    return filesystemWriteResponse({ status: "NULL", result: "NULL", stage: "capture", reason: "missing_required_fields" })
  }

  await ensureFilesystemWriteGatewayRegistry(env)

  const decisionRow = await env.DB.prepare(`SELECT * FROM governed_filesystem_write_decision_registry WHERE decision_id = ?1`).bind(decision_id).first<any>()
  if (!decisionRow) return filesystemWriteResponse({ status: "NULL", result: "NULL", stage: "validate", reason: "decision_not_found", decision_id })

  const nonceRow = await env.DB.prepare(`SELECT * FROM governed_filesystem_write_nonce_registry WHERE replay_nonce = ?1`).bind(replay_nonce).first<any>()
  if (nonceRow && String(nonceRow.decision_id) !== decision_id) {
    return filesystemWriteResponse({ status: "NULL", result: "NULL", stage: "validate", reason: "replay_nonce_decision_mismatch", replay_nonce })
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
  const validator_context = buildD1FilesystemValidatorContext(env, policy_hash, replayRegistryPort)
  const writerHandle = buildD1FilesystemWriter(() => new Date().toISOString())
  const emitted_at = new Date().toISOString()

  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input, binding },
    { validator_context, writer: writerHandle.writer, replay_registry: replayRegistryPort, emitted_at },
  )

  if (outcome.result !== 'EXECUTED' && outcome.result !== 'EXECUTED_UNCOMMITTED') {
    return filesystemWriteResponse({
      status: 'NULL',
      result: 'NULL',
      stage: outcome.stage,
      reason: outcome.reason,
      validator_denial: outcome.validator_denial,
      receipt: outcome.receipt,
    })
  }

  const captured = writerHandle.capture()
  if (!captured) {
    return filesystemWriteResponse({ status: 'NULL', result: 'NULL', stage: 'execute', reason: 'WRITER_CAPTURE_MISSING' })
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

  return filesystemWriteResponse({
    status: outcome.result,
    result: outcome.result,
    receipt,
    target_path: captured.path,
    bytes_written: captured.bytes_written,
    content_hash,
  })
}
