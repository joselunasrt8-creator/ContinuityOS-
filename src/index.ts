type Env = { DB: D1Database, API_KEY?: string }

type CanonicalAEO = {
  intent: string
  scope: Record<string, unknown>
  validation: Record<string, unknown>
  target: Record<string, unknown>
  finality: Record<string, unknown>
}

const REQUIRED_AEO_KEYS = ["intent", "scope", "validation", "target", "finality"] as const
const GOVERNED_WORKFLOW = "governed-deploy.yml"
const SESSION_TTL_MS = 3600_000
const SYSTEM_MAX_CONTINUITY_DEPTH = 32
const CANONICAL_RUNTIME_ROUTES = ["/session", "/continuity", "/authority", "/compile", "/validate", "/execute", "/proof"] as const
const GOVERNED_AUXILIARY_ROUTES = ["/preo"] as const
const REQUIRE_PREO_LINEAGE = "explicit_governed_deploy_policy" as const

const REQUIRED_SCHEMA_COLUMNS: Record<string, string[]> = {
  session_registry: ["session_id", "identity_id", "owner", "trust_tier", "continuity_status", "created_at", "expires_at"],
  continuity_registry: ["continuity_id", "identity_id", "session_id", "parent_continuity_id", "continuity_hash", "canonical_continuity", "status", "issued_at", "expires_at", "revoked_at"],
  authority_registry: ["authority_id", "decision_id", "session_id", "owner", "intent", "scope", "constraints", "expiry", "status", "created_at", "continuity_id", "identity_id"],
  aeo_registry: ["aeo_id", "authority_id", "decision_id", "canonical_aeo", "validated_object_hash", "status", "created_at", "continuity_id"],
  preo_registry: ["preo_id", "decision_id", "authority_id", "continuity_id", "reviewed_hash", "reviewed_tree_hash", "merge_commit_sha", "canonical_preo", "status", "created_at"],
  validation_registry: ["validation_id", "session_id", "decision_id", "validated_object_hash", "invocation_nonce", "environment", "result", "reason", "status", "created_at", "continuity_id"],
  execution_registry: ["execution_id", "session_id", "decision_id", "validated_object_hash", "invocation_nonce", "status", "created_at", "continuity_id", "repository", "branch", "pull_request_id", "merge_commit_sha", "source_tree_hash", "workflow_run_id", "workflow_sha"],
  proof_registry: ["proof_id", "session_id", "execution_id", "decision_id", "validated_object_hash", "surface", "run_id", "commit_sha", "workflow", "environment", "created_at", "continuity_id", "continuity_hash", "identity_id", "authority_lineage", "execution_lineage", "repository", "branch", "pull_request_id", "merge_commit_sha", "source_tree_hash", "workflow_run_id", "workflow_sha"],
  proof_registry_duplicate_archive: ["archive_id", "proof_id", "session_id", "execution_id", "decision_id", "validated_object_hash", "surface", "run_id", "commit_sha", "workflow", "environment", "created_at", "archived_at", "archive_reason", "canonical_proof_id"],
  invocation_registry: ["decision_id", "validated_object_hash", "invocation_nonce", "status", "created_at", "continuity_id"],
  observability_registry: ["event_id", "event_type", "decision_id", "authority_id", "execution_id", "proof_id", "severity", "payload", "created_at"],
  drift_registry: ["drift_id", "drift_class", "severity", "decision_id", "execution_id", "payload", "detected_by", "resolution_status", "created_at"]
}

type SchemaDiagnosticReason = "missing_required_table" | "missing_required_column" | "migration_required" | "database_unavailable" | "schema_initialization_failed"

class SchemaInitializationError extends Error {
  reason: SchemaDiagnosticReason

  constructor(reason: SchemaDiagnosticReason, cause?: unknown) {
    super(reason)
    this.reason = reason
    this.cause = cause
  }
}

function schemaDiagnosticReason(error: unknown): SchemaDiagnosticReason {
  if (error instanceof SchemaInitializationError) return error.reason
  const message = String((error as any)?.message || error || "")
  if (/no such table/i.test(message)) return "missing_required_table"
  if (/no such column|has no column named/i.test(message)) return "missing_required_column"
  if (/duplicate column name|UNIQUE constraint failed|constraint failed|index.*already exists/i.test(message)) return "migration_required"
  if (/database|D1_|SQLITE_BUSY|SQLITE_IOERR/i.test(message)) return "database_unavailable"
  return "schema_initialization_failed"
}

type TelemetryEventType = "SESSION_CREATED" | "CONTINUITY_CREATED" | "AUTHORITY_CREATED" | "AEO_COMPILED" | "VALIDATION_GRANTED" | "VALIDATION_REJECTED" | "EXECUTION_STARTED" | "EXECUTION_COMPLETED" | "PROOF_PERSISTED" | "REPLAY_BLOCKED" | "HASH_MISMATCH" | "AUTHORITY_CONSUMED"
type DriftClass = "authority_drift" | "hash_drift" | "execution_drift" | "proof_drift" | "replay_drift" | "registry_drift" | "provenance_drift" | "branch_lineage_drift" | "workflow_source_drift"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json" } })
}

async function body(req: Request): Promise<any> { try { return await req.json() } catch { return {} } }
function authorized(req: Request, env: Env): boolean { return typeof env.API_KEY === "string" && env.API_KEY.length > 0 && req.headers.get("X-API-Key") === env.API_KEY }
function hasDb(env: unknown): env is Env { return Boolean((env as any)?.DB && typeof (env as any).DB.prepare === "function") }
function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

function normalizeCanonicalValue(v: unknown): unknown {
  if (v === undefined) return null
  if (v === null || typeof v === "string" || typeof v === "boolean") return v
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (Array.isArray(v)) return v.map(normalizeCanonicalValue)
  if (isPlainRecord(v)) {
    return Object.freeze(Object.keys(v).sort().reduce<Record<string, unknown>>((normalized, key) => {
      normalized[key] = normalizeCanonicalValue(v[key])
      return normalized
    }, {}))
  }
  return null
}

function canonicalRecord(v: unknown): Record<string, unknown> {
  const normalized = normalizeCanonicalValue(v)
  return isPlainRecord(normalized) ? normalized : {}
}

function canonicalize(v: unknown): string {
  const normalized = normalizeCanonicalValue(v)
  if (Array.isArray(normalized)) return `[${normalized.map(canonicalize).join(",")}]`
  if (isPlainRecord(normalized)) return `{${Object.keys(normalized).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(normalized[key])}`).join(",")}}`
  return JSON.stringify(normalized)
}
async function sha256Hex(input: string): Promise<string> { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)); return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("") }

function canonicalDeployTarget(input: any): { repo: string, branch: string, workflow: string } {
  return {
    repo: String(input?.repo || input?.repository || ""),
    branch: String(input?.branch || ""),
    workflow: String(input?.workflow || GOVERNED_WORKFLOW)
  }
}

type DeploymentProvenance = {
  repository: string
  branch: string
  pull_request_id: string
  merge_commit_sha: string
  source_tree_hash: string
  workflow_run_id: string
  workflow_sha: string
}

function deploymentProvenanceFrom(input: any): DeploymentProvenance {
  return {
    repository: String(input?.repository || input?.repo || ""),
    branch: String(input?.branch || ""),
    pull_request_id: String(input?.pull_request_id || input?.pull_request_number || ""),
    merge_commit_sha: String(input?.merge_commit_sha || input?.commit_sha || ""),
    source_tree_hash: String(input?.source_tree_hash || ""),
    workflow_run_id: String(input?.workflow_run_id || input?.run_id || ""),
    workflow_sha: String(input?.workflow_sha || input?.commit_sha || "")
  }
}

function missingDeploymentProvenance(provenance: DeploymentProvenance): string[] {
  return Object.entries(provenance).filter(([, value]) => !value).map(([key]) => key)
}

function toCanonicalAeo(input: any): CanonicalAEO | null {
  const keys = Object.keys(input || {}).sort()
  if (keys.length !== REQUIRED_AEO_KEYS.length) return null
  if (keys.join("|") !== [...REQUIRED_AEO_KEYS].sort().join("|")) return null
  return Object.freeze({
    intent: String(input.intent || ""),
    scope: canonicalRecord(input.scope),
    validation: canonicalRecord(input.validation),
    target: canonicalRecord(input.target),
    finality: canonicalRecord(input.finality)
  })
}

async function ensureSchema(env: Env, options: { stabilizeProofRegistry?: boolean } = {}) {
  try {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS session_registry (session_id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, owner TEXT NOT NULL, trust_tier TEXT NOT NULL, continuity_status TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_session_registry_status_expiry ON session_registry(continuity_status, expires_at)`,
      `CREATE TABLE IF NOT EXISTS continuity_registry (continuity_id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, session_id TEXT NOT NULL, parent_continuity_id TEXT, continuity_hash TEXT NOT NULL, canonical_continuity TEXT NOT NULL, status TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, UNIQUE(continuity_hash))`,
      `CREATE INDEX IF NOT EXISTS idx_continuity_registry_session_identity ON continuity_registry(session_id, identity_id, status, expires_at)`,
      `CREATE TABLE IF NOT EXISTS authority_registry (authority_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL UNIQUE, session_id TEXT NOT NULL, owner TEXT NOT NULL, intent TEXT NOT NULL, scope TEXT NOT NULL, constraints TEXT NOT NULL, expiry TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT, identity_id TEXT)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_authority_registry_decision_unique ON authority_registry(decision_id)`,
      `CREATE TABLE IF NOT EXISTS aeo_registry (aeo_id TEXT PRIMARY KEY, authority_id TEXT NOT NULL, decision_id TEXT NOT NULL, canonical_aeo TEXT NOT NULL, validated_object_hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_aeo_registry_decision_hash ON aeo_registry(decision_id, validated_object_hash)`,
      `CREATE TABLE IF NOT EXISTS preo_registry (preo_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL, authority_id TEXT NOT NULL, continuity_id TEXT NOT NULL, reviewed_hash TEXT NOT NULL, reviewed_tree_hash TEXT, merge_commit_sha TEXT, canonical_preo TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(decision_id, reviewed_hash))`,
      `CREATE INDEX IF NOT EXISTS idx_preo_registry_decision_hash ON preo_registry(decision_id, reviewed_hash)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_preo_registry_lineage_unique ON preo_registry(decision_id, reviewed_hash, reviewed_tree_hash, merge_commit_sha)`,
      `CREATE TABLE IF NOT EXISTS validation_registry (validation_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, environment TEXT, result TEXT NOT NULL, reason TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_validation_registry_decision_hash_nonce ON validation_registry(decision_id, validated_object_hash, invocation_nonce)`,
      `CREATE TABLE IF NOT EXISTS execution_registry (execution_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT, repository TEXT, branch TEXT, pull_request_id TEXT, merge_commit_sha TEXT, source_tree_hash TEXT, workflow_run_id TEXT, workflow_sha TEXT, UNIQUE(decision_id, validated_object_hash), UNIQUE(continuity_id, decision_id, validated_object_hash), UNIQUE(workflow_run_id))`,
      `CREATE INDEX IF NOT EXISTS idx_execution_registry_decision_hash ON execution_registry(decision_id, validated_object_hash)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_registry_workflow_run_unique ON execution_registry(workflow_run_id)`,
      `CREATE TABLE IF NOT EXISTS proof_registry (proof_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, execution_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, surface TEXT, run_id TEXT, commit_sha TEXT, workflow TEXT, environment TEXT, created_at TEXT NOT NULL, continuity_id TEXT, continuity_hash TEXT, identity_id TEXT, authority_lineage TEXT, execution_lineage TEXT, repository TEXT, branch TEXT, pull_request_id TEXT, merge_commit_sha TEXT, source_tree_hash TEXT, workflow_run_id TEXT, workflow_sha TEXT, UNIQUE(decision_id, validated_object_hash), UNIQUE(workflow_run_id))`,
      `CREATE INDEX IF NOT EXISTS idx_proof_registry_execution_decision_hash ON proof_registry(execution_id, decision_id, validated_object_hash)`,
      `CREATE TABLE IF NOT EXISTS proof_registry_duplicate_archive (archive_id TEXT PRIMARY KEY, proof_id TEXT NOT NULL, session_id TEXT NOT NULL, execution_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, surface TEXT, run_id TEXT, commit_sha TEXT, workflow TEXT, environment TEXT, created_at TEXT NOT NULL, archived_at TEXT NOT NULL, archive_reason TEXT NOT NULL, canonical_proof_id TEXT NOT NULL, UNIQUE(proof_id))`,
      `CREATE TABLE IF NOT EXISTS invocation_registry (decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, continuity_id TEXT, PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_invocation_registry_nonce_once ON invocation_registry(decision_id, validated_object_hash, invocation_nonce)`,
      `CREATE TABLE IF NOT EXISTS observability_registry (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, decision_id TEXT, authority_id TEXT, execution_id TEXT, proof_id TEXT, severity TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_observability_decision ON observability_registry(decision_id)`,
      `CREATE INDEX IF NOT EXISTS idx_observability_execution ON observability_registry(execution_id)`,
      `CREATE INDEX IF NOT EXISTS idx_observability_type ON observability_registry(event_type)`,
      `CREATE TABLE IF NOT EXISTS drift_registry (drift_id TEXT PRIMARY KEY, drift_class TEXT NOT NULL, severity TEXT NOT NULL, decision_id TEXT, execution_id TEXT, payload TEXT NOT NULL, detected_by TEXT NOT NULL, resolution_status TEXT NOT NULL, created_at TEXT NOT NULL)`
    ]
    for (const s of stmts) await env.DB.prepare(s).run()
    await ensureRequiredSchemaColumns(env)
    if (options.stabilizeProofRegistry === false) return
    await quarantineHistoricalProofDuplicates(env)
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique ON proof_registry(decision_id, validated_object_hash)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_workflow_run_unique ON proof_registry(workflow_run_id)`).run()
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_proof_registry_provenance ON proof_registry(repository, branch, pull_request_id, merge_commit_sha, workflow_run_id)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_registry_workflow_run_unique ON execution_registry(workflow_run_id)`).run()
  } catch (error) {
    throw new SchemaInitializationError(schemaDiagnosticReason(error), error)
  }
}

async function ensureRequiredSchemaColumns(env: Env) {
  const tableColumnSets: Array<[string, string[], Set<string>]> = []
  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA_COLUMNS)) {
    tableColumnSets.push([table, columns, await tableColumns(env, table)])
  }

  if (tableColumnSets.every(([, , existing]) => existing.size === 0)) return

  for (const [table, columns, existing] of tableColumnSets) {
    if (existing.size === 0) throw new SchemaInitializationError("missing_required_table")
    for (const column of columns) {
      if (!existing.has(column)) {
        await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${columnType(column)}`).run()
        existing.add(column)
      }
    }
  }
}

function columnType(column: string): string {
  if (column === "upstream_status") return "INTEGER"
  return "TEXT"
}

async function tableColumns(env: Env, table: string): Promise<Set<string>> {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all<any>()
  const rows = Array.isArray(info?.results) ? info.results : []
  return new Set(rows.map((row: any) => String(row?.name || "")).filter(Boolean))
}

function continuityHashMaterial(input: any): Record<string, unknown> {
  const revocation = isPlainRecord(input?.revocation) ? input.revocation : {}
  return {
    actor_chain: Array.isArray(input?.actor_chain) ? input.actor_chain.map(String) : [],
    authority_chain: Array.isArray(input?.authority_chain) ? input.authority_chain.map(String) : [],
    constraints: canonicalRecord(input?.constraints),
    continuity_id: String(input?.continuity_id || ""),
    expires_at: String(input?.expires_at || ""),
    identity_id: String(input?.identity_id || ""),
    issued_at: String(input?.issued_at || ""),
    parent_continuity_id: input?.parent_continuity_id ? String(input.parent_continuity_id) : null,
    revocation: { revoked_at: revocation.revoked_at ?? null, status: String(revocation.status || "ACTIVE") },
    scope: canonicalRecord(input?.scope),
    session_id: String(input?.session_id || "")
  }
}

async function continuityHash(input: any): Promise<string> {
  return sha256Hex(canonicalize(continuityHashMaterial(input)))
}

async function collectContinuityDescendants(env: Env, root_continuity_id: string): Promise<string[]> {
  if (!root_continuity_id) return []
  const discovered = new Set<string>([root_continuity_id])
  const frontier = [root_continuity_id]
  while (frontier.length > 0) {
    const parent_id = frontier.shift() || ""
    const children = await env.DB.prepare(`SELECT continuity_id FROM continuity_registry WHERE parent_continuity_id=?1`).bind(parent_id).all<any>()
    for (const row of Array.isArray(children?.results) ? children.results : []) {
      const child_id = String(row?.continuity_id || "")
      if (!child_id || discovered.has(child_id)) continue
      discovered.add(child_id)
      frontier.push(child_id)
    }
  }
  return Array.from(discovered)
}

async function invalidateContinuityLineage(env: Env, continuity_id: string, status: "REVOKED" | "EXPIRED", reason: string, invalidated_at = new Date().toISOString()) {
  const ids = await collectContinuityDescendants(env, continuity_id)
  if (ids.length === 0) return
  const placeholders = ids.map((_, index) => `?${index + 1}`).join(",")
  await env.DB.prepare(`UPDATE continuity_registry SET status=?${ids.length + 1}, revoked_at=COALESCE(revoked_at, ?${ids.length + 2}) WHERE continuity_id IN (${placeholders}) AND status IN ('ACTIVE','RESERVED','EXECUTED','CONSUMED')`).bind(...ids, status, invalidated_at).run()
  await env.DB.prepare(`UPDATE authority_registry SET status='REVOKED' WHERE continuity_id IN (${placeholders}) AND status IN ('ACTIVE','VALIDATED','RESERVED','EXECUTED')`).bind(...ids).run()
  await env.DB.prepare(`UPDATE validation_registry SET status='REVOKED', result='INVALID', reason=?${ids.length + 1} WHERE continuity_id IN (${placeholders}) AND status='VALID'`).bind(...ids, reason).run()
  await env.DB.prepare(`UPDATE invocation_registry SET status='REVOKED' WHERE continuity_id IN (${placeholders}) AND status='RESERVED'`).bind(...ids).run()
}

async function cascadeRevocation(env: Env, continuity_id: string, revoked_at = new Date().toISOString()) {
  await invalidateContinuityLineage(env, continuity_id, "REVOKED", "continuity_revoked", revoked_at)
}

async function cascadeExpiration(env: Env, continuity_id: string, expired_at = new Date().toISOString()) {
  await invalidateContinuityLineage(env, continuity_id, "EXPIRED", "continuity_expired", expired_at)
}

async function cascadeSessionRevocation(env: Env, session_id: string) {
  await env.DB.prepare(`UPDATE continuity_registry SET status='REVOKED', revoked_at=COALESCE(revoked_at, ?2) WHERE session_id=?1 AND status='ACTIVE'`).bind(session_id, new Date().toISOString()).run()
  await env.DB.prepare(`UPDATE authority_registry SET status='REVOKED' WHERE session_id=?1 AND status IN ('ACTIVE','VALIDATED','RESERVED')`).bind(session_id).run()
  await env.DB.prepare(`UPDATE validation_registry SET status='REVOKED', result='INVALID', reason='session_revoked' WHERE session_id=?1 AND status='VALID'`).bind(session_id).run()
  await env.DB.prepare(`UPDATE invocation_registry SET status='REVOKED' WHERE continuity_id IN (SELECT continuity_id FROM continuity_registry WHERE session_id=?1) AND status='RESERVED'`).bind(session_id).run()
}

async function activeContinuity(env: Env, continuity_id: string, session: any, decision_id?: string): Promise<any | null> {
  if (!continuity_id || !session) return null
  const now = new Date().toISOString()
  const visited = new Set<string>()
  const ancestry: any[] = []
  let requestedContinuity: any = null
  let requestedCanonical: any = null
  let current_id = continuity_id

  while (current_id) {
    if (visited.has(current_id)) {
      await cascadeRevocation(env, continuity_id)
      return null
    }
    visited.add(current_id)

    const continuity = await env.DB.prepare(`SELECT * FROM continuity_registry WHERE continuity_id=?1`).bind(current_id).first<any>()
    if (!continuity) {
      await cascadeRevocation(env, continuity_id)
      return null
    }
    if (String(continuity.status || "") !== "ACTIVE") {
      await cascadeRevocation(env, current_id)
      return null
    }
    if (isExpired(String(continuity.expires_at || ""))) {
      await cascadeExpiration(env, current_id, now)
      return null
    }
    if (String(continuity.session_id || "") !== String(session.session_id || "")) return null
    if (String(continuity.identity_id || "") !== String(session.identity_id || "")) return null

    let canonical: any
    try { canonical = JSON.parse(String(continuity.canonical_continuity || "{}")) } catch { return null }
    const actualHash = await continuityHash(canonical)
    if (actualHash !== String(continuity.continuity_hash || "") || actualHash !== String(canonical.continuity_hash || "")) return null
    if (String(canonical.continuity_id || "") !== String(continuity.continuity_id || "")) return null
    const canonicalParent = canonical.parent_continuity_id ? String(canonical.parent_continuity_id) : ""
    const storedParent = continuity.parent_continuity_id ? String(continuity.parent_continuity_id) : ""
    if (canonicalParent !== storedParent) return null
    if (canonicalParent === current_id) {
      await cascadeRevocation(env, continuity_id)
      return null
    }
    if (current_id === continuity_id) {
      requestedContinuity = continuity
      requestedCanonical = canonical
      if (decision_id && !Array.isArray(canonical.authority_chain)) return null
      if (decision_id && !canonical.authority_chain.map(String).includes(String(decision_id))) return null
    }

    const ancestor = continuity
    const ancestorCanonical = canonical
    ancestry.push({ ...ancestor, canonical: ancestorCanonical })
    if (ancestry.length > SYSTEM_MAX_CONTINUITY_DEPTH) {
      await cascadeRevocation(env, continuity_id)
      return null
    }

    const configuredMaxDepth = Number(requestedCanonical?.constraints?.max_depth)
    if (
      Number.isFinite(configuredMaxDepth)
      && configuredMaxDepth >= 0
      && ancestry.length > configuredMaxDepth
    ) {
      await cascadeRevocation(env, continuity_id)
      return null
    }
    current_id = canonicalParent
  }

  const root = ancestry[ancestry.length - 1]
  if (!root || root.parent_continuity_id || !requestedContinuity || !requestedCanonical) return null
  return { ...requestedContinuity, canonical: requestedCanonical, ancestry }
}

async function quarantineHistoricalProofDuplicates(env: Env) {
  const archived_at = new Date().toISOString()
  await env.DB.prepare(`INSERT OR IGNORE INTO proof_registry_duplicate_archive (archive_id,proof_id,session_id,execution_id,decision_id,validated_object_hash,surface,run_id,commit_sha,workflow,environment,created_at,archived_at,archive_reason,canonical_proof_id)
    SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1,1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
      p.proof_id,p.session_id,p.execution_id,p.decision_id,p.validated_object_hash,p.surface,p.run_id,p.commit_sha,p.workflow,p.environment,p.created_at,?1,'duplicate_proof_lineage',
      (SELECT c.proof_id FROM proof_registry c WHERE c.decision_id=p.decision_id AND c.validated_object_hash=p.validated_object_hash ORDER BY c.created_at ASC, c.rowid ASC LIMIT 1)
    FROM proof_registry p
    WHERE EXISTS (SELECT 1 FROM proof_registry earlier WHERE earlier.decision_id=p.decision_id AND earlier.validated_object_hash=p.validated_object_hash AND (earlier.created_at < p.created_at OR (earlier.created_at = p.created_at AND earlier.rowid < p.rowid)))`).bind(archived_at).run()
  await env.DB.prepare(`DELETE FROM proof_registry
    WHERE rowid IN (
      SELECT p.rowid FROM proof_registry p
      WHERE EXISTS (SELECT 1 FROM proof_registry earlier WHERE earlier.decision_id=p.decision_id AND earlier.validated_object_hash=p.validated_object_hash AND (earlier.created_at < p.created_at OR (earlier.created_at = p.created_at AND earlier.rowid < p.rowid)))
    )`).run()
}

async function emitTelemetry(env: Env, event: {
  event_type: TelemetryEventType
  decision_id?: string
  authority_id?: string
  execution_id?: string
  proof_id?: string
  severity?: string
  payload?: Record<string, unknown>
}) {
  const created_at = new Date().toISOString()
  const payload = JSON.stringify({ ...(event.payload || {}), timestamp: created_at })
  await env.DB.prepare(`INSERT INTO observability_registry (event_id,event_type,decision_id,authority_id,execution_id,proof_id,severity,payload,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`)
    .bind(crypto.randomUUID(), event.event_type, event.decision_id || null, event.authority_id || null, event.execution_id || null, event.proof_id || null, event.severity || "INFO", payload, created_at)
    .run()
}

async function recordDrift(env: Env, drift: {
  drift_class: DriftClass
  severity?: string
  decision_id?: string
  execution_id?: string
  payload?: Record<string, unknown>
  detected_by?: string
}) {
  const created_at = new Date().toISOString()
  const payload = JSON.stringify({ ...(drift.payload || {}), timestamp: created_at })
  await env.DB.prepare(`INSERT INTO drift_registry (drift_id,drift_class,severity,decision_id,execution_id,payload,detected_by,resolution_status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'OPEN',?8)`)
    .bind(crypto.randomUUID(), drift.drift_class, drift.severity || "HIGH", drift.decision_id || null, drift.execution_id || null, payload, drift.detected_by || "runtime_observability_agent", created_at)
    .run()
}

async function rejectWithTelemetry(env: Env, response: Record<string, unknown>, telemetry: {
  event_type?: TelemetryEventType
  decision_id?: string
  authority_id?: string
  execution_id?: string
  proof_id?: string
  severity?: string
  payload?: Record<string, unknown>
  drift_class?: DriftClass
  detected_by?: string
}) {
  const payload = { reason: response.reason, result: response.result, status: response.status, ...(telemetry.payload || {}) }
  if (telemetry.event_type) {
    await emitTelemetry(env, { ...telemetry, event_type: telemetry.event_type, payload })
  }
  if (telemetry.drift_class) {
    await recordDrift(env, { drift_class: telemetry.drift_class, severity: telemetry.severity, decision_id: telemetry.decision_id, execution_id: telemetry.execution_id, payload, detected_by: telemetry.detected_by })
  }
  return json(response)
}

async function hasColumn(env: Env, table: string, column: string): Promise<boolean> {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all<any>()
  const rows = Array.isArray(info?.results) ? info.results : []
  return rows.some((row: any) => String(row?.name) === column)
}

function isExpired(expires_at: string, nowMs = Date.now()): boolean {
  const expiresMs = Date.parse(expires_at)
  return !Number.isFinite(expiresMs) || expiresMs <= nowMs
}

async function activeSession(env: Env, session_id: string): Promise<any | null> {
  if (!session_id) return null
  const session = await env.DB.prepare(`SELECT * FROM session_registry WHERE session_id=?1`).bind(session_id).first<any>()
  if (!session) return null
  if (String(session.continuity_status || "") !== "ACTIVE") return null
  if (isExpired(String(session.expires_at || ""))) {
    await env.DB.prepare(`UPDATE session_registry SET continuity_status='EXPIRED' WHERE session_id=?1 AND continuity_status='ACTIVE'`).bind(session_id).run()
    await cascadeSessionRevocation(env, session_id)
    return null
  }
  return session
}

function preoGovernanceEnabled(constraints: Record<string, unknown>, target: Record<string, unknown>): boolean {
  if (String(target.workflow || "") !== GOVERNED_WORKFLOW) return false
  const governance = isPlainRecord(constraints.governance) ? constraints.governance : {}
  const preo = isPlainRecord(constraints.preo) ? constraints.preo : {}
  return constraints.require_preo_lineage === true || governance.require_preo_lineage === true || preo.required === true || preo.require_lineage === true
}

async function ensurePreoSchema(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS preo_registry (
    preo_id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL,
    authority_id TEXT NOT NULL,
    continuity_id TEXT NOT NULL,
    reviewed_hash TEXT NOT NULL,
    reviewed_tree_hash TEXT,
    merge_commit_sha TEXT,
    canonical_preo TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(decision_id, reviewed_hash)
  )`).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_preo_registry_decision_hash ON preo_registry (decision_id, reviewed_hash)`).run()
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_preo_registry_lineage_unique ON preo_registry(decision_id, reviewed_hash, reviewed_tree_hash, merge_commit_sha)`).run()
}

async function preoTableExists(env: Env): Promise<boolean> {
  const table = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='preo_registry'`).first<any>()
  return Boolean(table)
}

async function validatePreoLineage(env: Env, params: { decision_id: string, validated_object_hash: string, authority: any, required: boolean }): Promise<"OK" | "missing_preo" | "preo_hash_mismatch"> {
  const result = await deploymentPreoLineage(env, params.decision_id, params.validated_object_hash, params.authority, params.required)
  return result.status
}

async function deploymentPreoLineage(env: Env, decision_id: string, validated_object_hash: string, authority: any, required = true): Promise<{ status: "OK" | "missing_preo" | "preo_hash_mismatch", preo?: any, canonical_preo?: any }> {
  if (!(await preoTableExists(env))) {
    if (required) {
      await ensurePreoSchema(env)
      return { status: "missing_preo" }
    }
    return { status: "OK" }
  }

  const rows = await env.DB.prepare(`SELECT * FROM preo_registry WHERE decision_id=?1 AND status='PREO_VALID' ORDER BY created_at ASC, preo_id ASC`).bind(decision_id).all<any>()
  const preos = Array.isArray(rows?.results) ? rows.results : []
  if (preos.length === 0) return { status: required ? "missing_preo" : "OK" }

  const matching = preos.find((preo: any) => String(preo.reviewed_hash || "") === validated_object_hash)
  if (!matching) return { status: "preo_hash_mismatch" }
  if (String(matching.authority_id || "") !== String(authority.authority_id || "")) return { status: "preo_hash_mismatch" }
  if (String(matching.continuity_id || "") !== String(authority.continuity_id || "")) return { status: "preo_hash_mismatch" }

  let canonicalPreo: unknown
  try { canonicalPreo = JSON.parse(String(matching.canonical_preo || "{}")) } catch { canonicalPreo = null }
  if (!isPlainRecord(canonicalPreo) || String((canonicalPreo as any).reviewed_hash || "") !== validated_object_hash) return { status: "preo_hash_mismatch" }
  if (String((canonicalPreo as any).reviewed_tree_hash || "") !== String(matching.reviewed_tree_hash || "")) return { status: "preo_hash_mismatch" }
  if (String((canonicalPreo as any).merge_commit_sha || "") !== String(matching.merge_commit_sha || "")) return { status: "preo_hash_mismatch" }
  return { status: "OK", preo: matching, canonical_preo: canonicalPreo }
}

async function validateDeploymentProvenance(env: Env, params: {
  route: string
  decision_id: string
  validated_object_hash: string
  authority: any
  compiledCanonicalAeo: CanonicalAEO
  provenance: DeploymentProvenance
  execution?: any
}): Promise<{ ok: true, preo: any, canonical_preo: any } | { ok: false, reason: string, drift_class: DriftClass, payload: Record<string, unknown> }> {
  const missing = missingDeploymentProvenance(params.provenance)
  if (missing.length > 0) return { ok: false, reason: "workflow_provenance_missing", drift_class: "provenance_drift", payload: { route: params.route, missing_provenance: missing, indicator: "workflow_provenance_missing" } }

  const target = canonicalDeployTarget(params.compiledCanonicalAeo.target)
  if (params.provenance.repository !== target.repo || params.provenance.branch !== target.branch) {
    return { ok: false, reason: "branch_lineage_mismatch", drift_class: "branch_lineage_drift", payload: { route: params.route, expected_repository: target.repo, provided_repository: params.provenance.repository, expected_branch: target.branch, provided_branch: params.provenance.branch, indicator: "branch_lineage_mismatch" } }
  }

  const preoLineage = await deploymentPreoLineage(env, params.decision_id, params.validated_object_hash, params.authority, true)
  if (preoLineage.status !== "OK" || !preoLineage.preo || !preoLineage.canonical_preo) {
    return { ok: false, reason: preoLineage.status, drift_class: "provenance_drift", payload: { route: params.route, policy: REQUIRE_PREO_LINEAGE, indicator: preoLineage.status } }
  }

  const canonicalPreo = preoLineage.canonical_preo as any
  const reviewedTreeHash = String(preoLineage.preo.reviewed_tree_hash || "")
  const mergeCommitSha = String(preoLineage.preo.merge_commit_sha || "")
  if (!reviewedTreeHash || !mergeCommitSha) return { ok: false, reason: "reviewed_provenance_missing", drift_class: "provenance_drift", payload: { route: params.route, indicator: "reviewed_provenance_missing" } }
  if (params.provenance.source_tree_hash !== reviewedTreeHash || String(canonicalPreo.reviewed_tree_hash || "") !== reviewedTreeHash) {
    return { ok: false, reason: "reviewed_tree_mismatch", drift_class: "workflow_source_drift", payload: { route: params.route, expected_source_tree_hash: reviewedTreeHash, provided_source_tree_hash: params.provenance.source_tree_hash, indicator: "reviewed_tree_mismatch" } }
  }
  if (params.provenance.merge_commit_sha !== mergeCommitSha) {
    return { ok: false, reason: "merge_sha_mismatch", drift_class: "provenance_drift", payload: { route: params.route, expected_merge_commit_sha: mergeCommitSha, provided_merge_commit_sha: params.provenance.merge_commit_sha, indicator: "merge_sha_mismatch" } }
  }
  if (params.provenance.workflow_sha !== mergeCommitSha) {
    return { ok: false, reason: "workflow_sha_mismatch", drift_class: "workflow_source_drift", payload: { route: params.route, expected_workflow_sha: mergeCommitSha, provided_workflow_sha: params.provenance.workflow_sha, indicator: "workflow_source_mismatch" } }
  }
  if (String(canonicalPreo.pull_request_id || "") && params.provenance.pull_request_id !== String(canonicalPreo.pull_request_id || "")) {
    return { ok: false, reason: "pull_request_lineage_mismatch", drift_class: "branch_lineage_drift", payload: { route: params.route, expected_pull_request_id: String(canonicalPreo.pull_request_id || ""), provided_pull_request_id: params.provenance.pull_request_id, indicator: "pull_request_lineage_mismatch" } }
  }
  if (params.execution) {
    for (const key of Object.keys(params.provenance) as Array<keyof DeploymentProvenance>) {
      if (String(params.execution[key] || "") !== params.provenance[key]) {
        return { ok: false, reason: "provenance_drift", drift_class: "provenance_drift", payload: { route: params.route, field: key, expected: String(params.execution[key] || ""), provided: params.provenance[key], indicator: "execution_proof_provenance_mismatch" } }
      }
    }
  }
  return { ok: true, preo: preoLineage.preo, canonical_preo: preoLineage.canonical_preo }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true })

    const canonicalRuntimeRoute = CANONICAL_RUNTIME_ROUTES.includes(url.pathname as any)
    const governedAuxiliaryRoute = GOVERNED_AUXILIARY_ROUTES.includes(url.pathname as any)
    const governedMutationRoute = canonicalRuntimeRoute || governedAuxiliaryRoute
    const mutationEndpoint = governedMutationRoute && request.method === "POST"
    if (mutationEndpoint && !authorized(request, env)) return json({ status: "NULL", reason: "unauthorized" }, 403)

    if (!hasDb(env)) return json({ status: "NULL", reason: "database_unavailable" }, 500)

    try {
      await ensureSchema(env, { stabilizeProofRegistry: url.pathname !== "/session" })
    } catch (error) {
      return json({ status: "NULL", reason: schemaDiagnosticReason(error) }, 500)
    }

    try {
    if (request.method === "POST" && !canonicalRuntimeRoute) {
      if (!governedAuxiliaryRoute) {
        await recordDrift(env, { drift_class: "registry_drift", severity: "HIGH", payload: { route: url.pathname, indicator: "invalid_route_invocation" } })
        return json({ status: "NULL", reason: "not_found" }, 404)
      }
    }

    if (url.pathname === "/preo" && request.method === "POST") {
      const b = await body(request)
      const decision_id = String(b.decision_id || "")
      const reviewed_hash = String(b.reviewed_hash || b.validated_object_hash || "")
      const reviewed_tree_hash = String(b.reviewed_tree_hash || b.source_tree_hash || "")
      const merge_commit_sha = String(b.merge_commit_sha || "")
      const pull_request_id = String(b.pull_request_id || b.pull_request_number || "")
      if (!decision_id) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "missing_decision_id" }, { event_type: "VALIDATION_REJECTED", severity: "WARN", payload: { route: "/preo", indicator: "missing_decision_id" }, drift_class: "registry_drift" })
      if (!reviewed_hash) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "missing_reviewed_hash" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/preo", indicator: "missing_reviewed_hash" }, drift_class: "hash_drift" })
      if (!reviewed_tree_hash) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "missing_reviewed_tree_hash" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/preo", indicator: "missing_reviewed_tree_hash" }, drift_class: "provenance_drift" })
      if (!merge_commit_sha) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "missing_merge_commit_sha" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/preo", indicator: "missing_merge_commit_sha" }, drift_class: "provenance_drift" })
      if (!pull_request_id) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "missing_pull_request_id" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/preo", indicator: "missing_pull_request_id" }, drift_class: "branch_lineage_drift" })
      if (b.validated_object_hash && String(b.validated_object_hash) !== reviewed_hash) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "preo_hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/preo", reviewed_hash, validated_object_hash: String(b.validated_object_hash), indicator: "preo_hash_mismatch" }, drift_class: "hash_drift" })

      const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
      if (!authority) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "authority_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/preo" }, drift_class: "authority_drift" })
      if (!["ACTIVE", "VALIDATED", "RESERVED"].includes(String(authority.status || ""))) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "authority_unusable" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/preo", authority_status: authority.status }, drift_class: "authority_drift" })
      const session = await activeSession(env, String(authority.session_id || ""))
      if (!session) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/preo" }, drift_class: "authority_drift" })
      const continuity = await activeContinuity(env, String(authority.continuity_id || ""), session, decision_id)
      if (!continuity) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/preo", continuity_id: authority.continuity_id || null }, drift_class: "authority_drift" })

      await ensurePreoSchema(env)
      const created_at = new Date().toISOString()
      const canonical_preo = canonicalize({
        decision_id,
        authority_id: String(authority.authority_id || ""),
        continuity_id: String(authority.continuity_id || ""),
        reviewed_hash,
        reviewed_tree_hash,
        merge_commit_sha,
        pull_request_id,
        evidence: canonicalRecord(b.evidence),
        status: "PREO_VALID"
      })
      const preo_id = String(b.preo_id || crypto.randomUUID())
      const insert = await env.DB.prepare(`INSERT OR IGNORE INTO preo_registry (preo_id,decision_id,authority_id,continuity_id,reviewed_hash,reviewed_tree_hash,merge_commit_sha,canonical_preo,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'PREO_VALID',?9)`).bind(preo_id, decision_id, String(authority.authority_id || ""), String(authority.continuity_id || ""), reviewed_hash, reviewed_tree_hash, merge_commit_sha, canonical_preo, created_at).run()
      if ((insert.meta?.changes || 0) === 0) return rejectWithTelemetry(env, { status: "NULL", route: "/preo", reason: "preo_replay" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/preo", reviewed_hash, indicator: "duplicate_preo" }, drift_class: "replay_drift" })
      await emitTelemetry(env, { event_type: "VALIDATION_GRANTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "INFO", payload: { route: "/preo", reviewed_hash, policy: REQUIRE_PREO_LINEAGE } })
      return json({ status: "PREO_VALID", decision_id, preo_id, reviewed_hash, reviewed_tree_hash, merge_commit_sha, pull_request_id })
    }

    if (url.pathname === "/session" && request.method === "POST") {
      const b = await body(request)
      const identity_id = String(b.identity_id || "")
      if (!identity_id) return json({ status: "NULL", reason: "missing_identity_id" }, 400)
      const expires_at = String(b.expires_at || new Date(Date.now()+SESSION_TTL_MS).toISOString())
      if (isExpired(expires_at)) return json({ status: "NULL", reason: "invalid_session_expiry" }, 400)
      const session = { session_id: crypto.randomUUID(), identity_id, owner: "human-origin", trust_tier: "T0", continuity_status: "ACTIVE", created_at: new Date().toISOString(), expires_at }
      await env.DB.prepare(`INSERT INTO session_registry (session_id,identity_id,owner,trust_tier,continuity_status,created_at,expires_at) VALUES (?1,?2,?3,?4,?5,?6,?7)`).bind(session.session_id,session.identity_id,session.owner,session.trust_tier,session.continuity_status,session.created_at,session.expires_at).run()
      try { await emitTelemetry(env, { event_type: "SESSION_CREATED", severity: "INFO", payload: { route: "/session", session_id: session.session_id, identity_id: session.identity_id, continuity_status: "ACTIVE" } }) } catch {}
      return json({ status: "SESSION_ACTIVE", session_id: session.session_id, identity_id: session.identity_id, created_at: session.created_at, expires_at: session.expires_at })
    }

    if (url.pathname === "/continuity" && request.method === "POST") {
      const b = await body(request)
      const session_id = String(b.session_id || "")
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status: "NULL", reason: "invalid_session" }, { event_type: "VALIDATION_REJECTED", severity: "HIGH", payload: { route: "/continuity", session_id }, drift_class: "authority_drift" })
      const continuity_id = String(b.continuity_id || crypto.randomUUID())
      const issued_at = String(b.issued_at || new Date().toISOString())
      const expires_at = String(b.expires_at || session.expires_at)
      if (isExpired(expires_at)) return rejectWithTelemetry(env, { status: "NULL", reason: "expired_continuity" }, { event_type: "VALIDATION_REJECTED", severity: "HIGH", payload: { route: "/continuity", session_id, continuity_id }, drift_class: "authority_drift" })
      const parent_continuity_id = b.parent_continuity_id ? String(b.parent_continuity_id) : ""
      const requestedScope =
        isPlainRecord(b.scope)
          ? canonicalRecord(b.scope)
          : { environment: "production" }
      if (parent_continuity_id === continuity_id) return rejectWithTelemetry(env, { status: "NULL", reason: "continuity_cycle_detected" }, { event_type: "VALIDATION_REJECTED", severity: "HIGH", payload: { route: "/continuity", session_id, continuity_id, parent_continuity_id }, drift_class: "authority_drift" })

      if (parent_continuity_id) {
        const parent = await activeContinuity(env, parent_continuity_id, session)
        if (!parent) {
          return rejectWithTelemetry(
            env,
            { status: "NULL", reason: "invalid_parent_continuity" },
            {
              event_type: "VALIDATION_REJECTED",
              severity: "HIGH",
              payload: {
                route: "/continuity",
                session_id,
                continuity_id,
                parent_continuity_id,
                indicator: "orphaned_continuity_prevented"
              },
              drift_class: "authority_drift"
            }
          )
        }

        const prospectiveDepth = parent.ancestry.length + 1
        if (prospectiveDepth > SYSTEM_MAX_CONTINUITY_DEPTH) {
          return rejectWithTelemetry(
            env,
            { status: "NULL", reason: "continuity_depth_exceeded" },
            {
              event_type: "VALIDATION_REJECTED",
              severity: "HIGH",
              payload: {
                route: "/continuity",
                continuity_id,
                parent_continuity_id,
                prospective_depth: prospectiveDepth,
                system_max_depth: SYSTEM_MAX_CONTINUITY_DEPTH
              },
              drift_class: "authority_drift"
            }
          )
        }

        const configuredMaxDepth = Number(parent?.canonical?.constraints?.max_depth)
        if (
          Number.isFinite(configuredMaxDepth)
          && configuredMaxDepth >= 0
          && prospectiveDepth > configuredMaxDepth
        ) {
          return rejectWithTelemetry(
            env,
            { status: "NULL", reason: "continuity_depth_exceeded" },
            {
              event_type: "VALIDATION_REJECTED",
              severity: "HIGH",
              payload: {
                route: "/continuity",
                continuity_id,
                parent_continuity_id,
                prospective_depth: prospectiveDepth,
                configured_max_depth: configuredMaxDepth
              },
              drift_class: "authority_drift"
            }
          )
        }

        const parentScope =
          isPlainRecord(parent?.canonical?.scope)
            ? canonicalRecord(parent.canonical.scope)
            : {}
        const childScope = canonicalRecord(requestedScope)

        for (const [key, value] of Object.entries(childScope)) {
          if (!Object.prototype.hasOwnProperty.call(parentScope, key)) {
            return rejectWithTelemetry(
              env,
              { status: "NULL", reason: "scope_expansion_detected" },
              {
                event_type: "VALIDATION_REJECTED",
                severity: "HIGH",
                payload: {
                  route: "/continuity",
                  continuity_id,
                  parent_continuity_id,
                  indicator: "recursive_scope_expansion_detected"
                },
                drift_class: "authority_drift"
              }
            )
          }
          if (canonicalize(parentScope[key]) !== canonicalize(value)) {
            return rejectWithTelemetry(
              env,
              { status: "NULL", reason: "scope_expansion_detected" },
              {
                event_type: "VALIDATION_REJECTED",
                severity: "HIGH",
                payload: {
                  route: "/continuity",
                  continuity_id,
                  parent_continuity_id,
                  indicator: "recursive_scope_expansion_detected"
                },
                drift_class: "authority_drift"
              }
            )
          }
        }
      }

      const material: any = continuityHashMaterial({
        continuity_id,
        identity_id: String(session.identity_id || ""),
        session_id,
        parent_continuity_id: parent_continuity_id || null,
        authority_chain: Array.isArray(b.authority_chain) ? b.authority_chain : [],
        actor_chain: Array.isArray(b.actor_chain) ? b.actor_chain : ["human", "agent"],
        scope: requestedScope,
        constraints: b.constraints || { max_depth: 3, delegation_allowed: false },
        revocation: b.revocation || { status: "ACTIVE", revoked_at: null },
        issued_at,
        expires_at
      })
      const hash = await continuityHash(material)
      const continuity = { ...material, continuity_hash: hash }
      if (String(continuity.revocation.status) !== "ACTIVE") return rejectWithTelemetry(env, { status: "NULL", reason: "revoked_continuity" }, { event_type: "VALIDATION_REJECTED", severity: "HIGH", payload: { route: "/continuity", continuity_id }, drift_class: "authority_drift" })
      await env.DB.prepare(`INSERT INTO continuity_registry (continuity_id,identity_id,session_id,parent_continuity_id,continuity_hash,canonical_continuity,status,issued_at,expires_at,revoked_at) VALUES (?1,?2,?3,?4,?5,?6,'ACTIVE',?7,?8,NULL)`).bind(continuity_id, continuity.identity_id, session_id, continuity.parent_continuity_id, hash, canonicalize(continuity), issued_at, expires_at).run()
      await emitTelemetry(env, { event_type: "CONTINUITY_CREATED", severity: "INFO", payload: { route: "/continuity", session_id, continuity_id, continuity_hash: hash } })
      return json({ status: "CONTINUITY_ACTIVE", continuity_id, continuity_hash: hash, continuity })
    }

    if (url.pathname === "/authority" && request.method === "POST") {
      const b = await body(request)
      const session_id = String(b.session_id || "")
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status: "NULL", reason: "invalid_session" }, { event_type: "VALIDATION_REJECTED", severity: "HIGH", payload: { route: "/authority", session_id }, drift_class: "authority_drift" })
      const decision_id = String(b.decision_id || crypto.randomUUID())
      const continuity_id = String(b.continuity_id || "")
      if (!continuity_id) return rejectWithTelemetry(env, { status: "NULL", reason: "missing_continuity_id" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/authority", session_id }, drift_class: "authority_drift" })
      const continuity = await activeContinuity(env, continuity_id, session, decision_id)
      if (!continuity) return rejectWithTelemetry(env, { status: "NULL", reason: "invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/authority", session_id, continuity_id }, drift_class: "authority_drift" })
      const rec = { authority_id: crypto.randomUUID(), decision_id, identity_id: String(session.identity_id || ""), session_id, continuity_id, owner: String(b.owner || "unknown"), intent: String(b.intent || "deploy_production"), scope: JSON.stringify(b.scope || {}), constraints: JSON.stringify(b.constraints || {}), expiry: String(b.expiry || new Date(Date.now()+3600_000).toISOString()), status: "ACTIVE", created_at: new Date().toISOString() }
      await env.DB.prepare(`INSERT INTO authority_registry (authority_id,decision_id,identity_id,session_id,continuity_id,owner,intent,scope,constraints,expiry,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`).bind(rec.authority_id,rec.decision_id,rec.identity_id,rec.session_id,rec.continuity_id,rec.owner,rec.intent,rec.scope,rec.constraints,rec.expiry,rec.status,rec.created_at).run()
      await emitTelemetry(env, { event_type: "AUTHORITY_CREATED", decision_id: rec.decision_id, authority_id: rec.authority_id, severity: "INFO", payload: { route: "/authority", session_id, continuity_id, authority_status: "ACTIVE" } })
      return json(rec)
    }

    if (url.pathname === "/compile" && request.method === "POST") {
      try {
        const b = await body(request)
        const decision_id = String(b.decision_id || "")
        if (!decision_id) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "missing_decision_id" }, { event_type: "VALIDATION_REJECTED", severity: "WARN", payload: { route: "/compile", indicator: "missing_decision_id" }, drift_class: "registry_drift" })

        const authorityHasStatus = await hasColumn(env, "authority_registry", "status")
        const authorityHasDecision = await hasColumn(env, "authority_registry", "decision_id")
        if (!authorityHasStatus || !authorityHasDecision) {
          return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "schema_incompatible_authority_registry" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "CRITICAL", payload: { route: "/compile" }, drift_class: "registry_drift" })
        }
        const aeoHasHash = await hasColumn(env, "aeo_registry", "validated_object_hash")
        if (!aeoHasHash) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "schema_incompatible_aeo_registry" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "CRITICAL", payload: { route: "/compile" }, drift_class: "registry_drift" })

        const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
        if (!authority) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "authority_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/compile" }, drift_class: "authority_drift" })
        if (!["ACTIVE", "VALIDATED", "RESERVED"].includes(String(authority.status || ""))) {
          return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "authority_unusable" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", authority_status: authority.status, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
        }
        const session = await activeSession(env, String(authority.session_id || ""))
        if (!session) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile" }, drift_class: "authority_drift" })
        const continuity = await activeContinuity(env, String(authority.continuity_id || ""), session, decision_id)
        if (!continuity) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", continuity_id: authority.continuity_id || null }, drift_class: "authority_drift" })

        const constraints = JSON.parse(String(authority.constraints || "{}"))
        const target = canonicalDeployTarget(constraints)
        if (target.workflow !== GOVERNED_WORKFLOW) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "workflow_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", workflow: target.workflow, indicator: "unmanaged_deploy_surface" }, drift_class: "registry_drift" })
        const requirePreoLineage = preoGovernanceEnabled(constraints, target)

        const existingAeos = await env.DB.prepare(`SELECT * FROM aeo_registry WHERE decision_id=?1 ORDER BY created_at ASC, aeo_id ASC`).bind(decision_id).all<any>()
        const existingRows = Array.isArray(existingAeos?.results) ? existingAeos.results : []
        if (existingRows.length > 0) {
          const first = existingRows[0]
          let canonicalAeo: unknown
          try { canonicalAeo = JSON.parse(String(first.canonical_aeo || "{}")) } catch { canonicalAeo = null }
          const storedHash = String(first.validated_object_hash || "")
          const recomputedHash = await sha256Hex(canonicalize(canonicalAeo))
          const hasConflictingAeo = existingRows.some((row: any) => String(row.validated_object_hash || "") !== storedHash || String(row.canonical_aeo || "") !== String(first.canonical_aeo || ""))
          if (!canonicalAeo || !storedHash || recomputedHash !== storedHash || hasConflictingAeo) {
            return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "compiled_aeo_hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/compile", stored_hash: storedHash, actual_hash: recomputedHash, indicator: "stored_aeo_hash_mismatch" }, drift_class: "hash_drift" })
          }
          const preoLineage = await validatePreoLineage(env, { decision_id, validated_object_hash: storedHash, authority, required: requirePreoLineage })
          if (preoLineage !== "OK") return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: preoLineage }, { event_type: preoLineage === "preo_hash_mismatch" ? "HASH_MISMATCH" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", validated_object_hash: storedHash, policy: REQUIRE_PREO_LINEAGE, required: requirePreoLineage, indicator: preoLineage }, drift_class: preoLineage === "preo_hash_mismatch" ? "hash_drift" : "registry_drift" })
          await emitTelemetry(env, { event_type: "AEO_COMPILED", decision_id, authority_id: String(first.authority_id || ""), severity: "INFO", payload: { route: "/compile", validated_object_hash: storedHash, indicator: "existing_canonical_aeo_reused" } })
          return json({ status: "COMPILED", decision_id, validated_object_hash: storedHash, canonical_aeo: canonicalAeo })
        }

        const canonical_aeo = toCanonicalAeo({ intent: authority.intent, scope: JSON.parse(String(authority.scope || "{}")), validation: { workflow: GOVERNED_WORKFLOW }, target, finality: { proof_required: true } })
        if (!canonical_aeo) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "invalid_canonical_aeo" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile" }, drift_class: "registry_drift" })
        const canonical_aeo_json = canonicalize(canonical_aeo)
        const validated_object_hash = await sha256Hex(canonical_aeo_json)
        const preoLineage = await validatePreoLineage(env, { decision_id, validated_object_hash, authority, required: requirePreoLineage })
        if (preoLineage !== "OK") return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: preoLineage }, { event_type: preoLineage === "preo_hash_mismatch" ? "HASH_MISMATCH" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", validated_object_hash, policy: REQUIRE_PREO_LINEAGE, required: requirePreoLineage, indicator: preoLineage }, drift_class: preoLineage === "preo_hash_mismatch" ? "hash_drift" : "registry_drift" })
        await env.DB.prepare(`INSERT INTO aeo_registry (aeo_id,authority_id,decision_id,continuity_id,canonical_aeo,validated_object_hash,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,'COMPILED',?7)`).bind(crypto.randomUUID(), authority.authority_id, decision_id, String(authority.continuity_id || ""), canonical_aeo_json, validated_object_hash, new Date().toISOString()).run()
        await emitTelemetry(env, { event_type: "AEO_COMPILED", decision_id, authority_id: String(authority.authority_id || ""), severity: "INFO", payload: { route: "/compile", validated_object_hash } })
        return json({ status: "COMPILED", decision_id, validated_object_hash, canonical_aeo: JSON.parse(canonical_aeo_json) })
      } catch (error: any) {
        await recordDrift(env, { drift_class: "registry_drift", severity: "CRITICAL", payload: { route: "/compile", error: String(error?.message || error || "unknown_error") } })
        return json({
          status: "FAILED",
          route: "/compile",
          error: String(error?.message || error || "unknown_error"),
          reason: "compile_exception"
        })
      }
    }

    if (url.pathname === "/validate" && request.method === "POST") {
      const b = await body(request); const decision_id = String(b.decision_id || ""); const validated_object_hash = String(b.validated_object_hash || ""); const invocation_nonce = String(b.invocation_nonce || ""); const environment = b.environment; const session_id = String(b.session_id || "")
      if (!decision_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_decision_id" }, { event_type: "VALIDATION_REJECTED", severity: "WARN", payload: { route: "/validate" }, drift_class: "hash_drift" })
      if (!validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_validated_object_hash" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/validate", indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (!invocation_nonce) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_invocation_nonce" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "WARN", payload: { route: "/validate", validated_object_hash }, drift_class: "replay_drift" })
      const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
      if (!authority) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/validate" }, drift_class: "authority_drift" })
      if (!["ACTIVE","VALIDATED","RESERVED"].includes(String(authority.status))) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_unusable" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", authority_status: authority.status, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", session_id }, drift_class: "authority_drift" })
      if (String(authority.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_session_id: authority.session_id, provided_session_id: session_id }, drift_class: "authority_drift" })
      const continuity = await activeContinuity(env, String(authority.continuity_id || ""), session, String(decision_id || ""))
      if (!continuity) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", continuity_id: authority.continuity_id || null }, drift_class: "authority_drift" })
      if (String(authority.identity_id || "") !== String(session.identity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"identity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_identity_id: session.identity_id, provided_identity_id: authority.identity_id }, drift_class: "authority_drift" })
      const compiled = await env.DB.prepare(`SELECT * FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND status='COMPILED'`).bind(decision_id, validated_object_hash).first<any>()
      if (!compiled) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", validated_object_hash, indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      let compiledAeo: any
      try { compiledAeo = JSON.parse(String(compiled.canonical_aeo || "{}")) } catch { compiledAeo = null }
      const compiledCanonicalAeo = toCanonicalAeo(compiledAeo)
      const compiledHash = compiledCanonicalAeo ? await sha256Hex(canonicalize(compiledCanonicalAeo)) : ""
      if (!compiledCanonicalAeo || compiledHash !== validated_object_hash || compiledHash !== String(compiled.validated_object_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_hash: validated_object_hash, actual_hash: compiledHash, indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (String(compiled.continuity_id || "") !== String(authority.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_continuity_id: authority.continuity_id, provided_continuity_id: compiled.continuity_id, indicator: "non_canonical_validation_lineage" }, drift_class: "hash_drift" })
      const target = compiledCanonicalAeo.target
      const constraints = canonicalDeployTarget(JSON.parse(String(authority.constraints)))
      if (String(target.repo)!==constraints.repo || String(target.branch)!==constraints.branch || String(target.workflow)!==constraints.workflow) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"scope_constraints_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", indicator: "non_canonical_workflow" }, drift_class: "registry_drift" })
      if (target.workflow !== GOVERNED_WORKFLOW) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"workflow_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", workflow: target.workflow, indicator: "unmanaged_deploy_surface" }, drift_class: "registry_drift" })
      const insert = await env.DB.prepare(`INSERT OR IGNORE INTO invocation_registry (decision_id,validated_object_hash,invocation_nonce,continuity_id,status,created_at) VALUES (?1,?2,?3,?4,'RESERVED',?5)`).bind(decision_id,validated_object_hash,invocation_nonce,String(authority.continuity_id || ""),new Date().toISOString()).run()
      if ((insert.meta?.changes||0)===0) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"nonce_used" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", validated_object_hash, invocation_nonce, indicator: "reused_nonce" }, drift_class: "replay_drift" })
      await env.DB.prepare(`INSERT INTO validation_registry (validation_id,session_id,continuity_id,decision_id,validated_object_hash,invocation_nonce,environment,result,reason,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,'VALID',NULL,'VALID',?8)`).bind(crypto.randomUUID(),session_id,String(authority.continuity_id || ""),decision_id,validated_object_hash,invocation_nonce,String(environment||""),new Date().toISOString()).run()
      await env.DB.prepare(`UPDATE authority_registry SET status='RESERVED' WHERE decision_id=?1 AND status IN ('ACTIVE','VALIDATED','RESERVED')`).bind(decision_id).run()
      await emitTelemetry(env, { event_type: "VALIDATION_GRANTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "INFO", payload: { route: "/validate", validated_object_hash, invocation_nonce, authority_status: "RESERVED" } })
      return json({ status:"VALID", result:"VALID", session_id, validated_object_hash, invocation_nonce })
    }

    if (url.pathname === "/execute" && request.method === "POST") {
      const b = await body(request); const decision_id = String(b.decision_id || ""); const validated_object_hash = String(b.validated_object_hash || ""); const invocation_nonce = String(b.invocation_nonce || ""); const session_id = String(b.session_id || ""); const provenance = deploymentProvenanceFrom(b)
      await emitTelemetry(env, { event_type: "EXECUTION_STARTED", decision_id, severity: "INFO", payload: { route: "/execute", validated_object_hash, invocation_nonce } })
      if (!decision_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_decision_id" }, { event_type: "VALIDATION_REJECTED", severity: "WARN", payload: { route: "/execute" }, drift_class: "execution_drift" })
      if (!validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_validated_object_hash" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/execute", indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      if (!invocation_nonce) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_invocation_nonce" }, { event_type: "REPLAY_BLOCKED", decision_id, severity: "HIGH", payload: { route: "/execute", validated_object_hash, indicator: "missing_nonce" }, drift_class: "replay_drift" })
      const validation = await env.DB.prepare(`SELECT * FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3 AND result='VALID' AND status='VALID'`).bind(decision_id,validated_object_hash,invocation_nonce).first<any>()
      if (!validation) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, severity: "HIGH", payload: { route: "/execute", validated_object_hash, invocation_nonce, indicator: "validation_hash_missing_or_mismatched" }, drift_class: "hash_drift" })
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", session_id, validated_object_hash, invocation_nonce }, drift_class: "execution_drift" })
      if (String(validation.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", expected_session_id: validation.session_id, provided_session_id: session_id, validated_object_hash, invocation_nonce }, drift_class: "execution_drift" })
      const inv = await env.DB.prepare(`SELECT * FROM invocation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3`).bind(decision_id,validated_object_hash,invocation_nonce).first<any>()
      if (!inv || inv.status!=="RESERVED") return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"nonce_not_reserved" }, { event_type: "REPLAY_BLOCKED", decision_id, severity: "HIGH", payload: { route: "/execute", validated_object_hash, invocation_nonce, invocation_status: inv?.status || null, indicator: "reused_nonce" }, drift_class: "replay_drift" })
      const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
      if (!authority || !["RESERVED","VALIDATED"].includes(String(authority.status))) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_not_reserved" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority?.authority_id || ""), severity: "HIGH", payload: { route: "/execute", authority_status: authority?.status || null, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      if (String(authority.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_session_id: authority.session_id, provided_session_id: session_id }, drift_class: "authority_drift" })
      const continuity = await activeContinuity(env, String(authority.continuity_id || ""), session, String(decision_id || ""))
      if (!continuity) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", continuity_id: authority.continuity_id || null, indicator: "orphaned_execution_prevented" }, drift_class: "execution_drift" })
      if (String(validation.continuity_id || "") !== String(authority.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_continuity_id: authority.continuity_id, provided_continuity_id: validation.continuity_id }, drift_class: "execution_drift" })
      const replay = await env.DB.prepare(`SELECT execution_id FROM execution_registry WHERE decision_id=?1 AND validated_object_hash=?2`).bind(decision_id,validated_object_hash).first<any>()
      if (replay) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"replay_detected" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), execution_id: String(replay.execution_id || ""), severity: "HIGH", payload: { route: "/execute", validated_object_hash, invocation_nonce, indicator: "duplicate_execution" }, drift_class: "replay_drift" })
      const compiled = await env.DB.prepare(`SELECT canonical_aeo,validated_object_hash,continuity_id,status FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND status='COMPILED'`).bind(decision_id,validated_object_hash).first<any>()
      let executionAeo: any
      try { executionAeo = JSON.parse(String(compiled?.canonical_aeo || "{}")) } catch { executionAeo = null }
      const executionCanonicalAeo = toCanonicalAeo(executionAeo)
      const execHash = executionCanonicalAeo ? await sha256Hex(canonicalize(executionCanonicalAeo)) : ""
      if (!compiled || !executionCanonicalAeo || execHash !== validated_object_hash || execHash !== String(compiled.validated_object_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_hash: validated_object_hash, actual_hash: execHash, indicator: "execution_hash_mismatch" }, drift_class: "hash_drift" })
      if (String(compiled.continuity_id || "") !== String(authority.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_continuity_id: authority.continuity_id, provided_continuity_id: compiled.continuity_id, indicator: "non_canonical_validation_lineage" }, drift_class: "execution_drift" })
      const provenanceValidation = await validateDeploymentProvenance(env, { route: "/execute", decision_id, validated_object_hash, authority, compiledCanonicalAeo: executionCanonicalAeo, provenance })
      if (!provenanceValidation.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: provenanceValidation.reason }, { event_type: provenanceValidation.drift_class === "workflow_source_drift" ? "HASH_MISMATCH" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { ...provenanceValidation.payload, validated_object_hash }, drift_class: provenanceValidation.drift_class })
      const execution_id = crypto.randomUUID()
      try {
        await env.DB.prepare(`INSERT INTO execution_registry (execution_id,session_id,decision_id,validated_object_hash,invocation_nonce,status,created_at,continuity_id,repository,branch,pull_request_id,merge_commit_sha,source_tree_hash,workflow_run_id,workflow_sha) VALUES (?1,?2,?3,?4,?5,'EXECUTED',?6,?7,?8,?9,?10,?11,?12,?13,?14)`).bind(execution_id, authority.session_id, decision_id, validated_object_hash, invocation_nonce, new Date().toISOString(), String(authority.continuity_id || ""), provenance.repository, provenance.branch, provenance.pull_request_id, provenance.merge_commit_sha, provenance.source_tree_hash, provenance.workflow_run_id, provenance.workflow_sha).run()
      } catch {
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"replayed_provenance" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, severity: "HIGH", payload: { route: "/execute", workflow_run_id: provenance.workflow_run_id, indicator: "duplicate_workflow_run" }, drift_class: "replay_drift" })
      }
      await env.DB.prepare(`UPDATE invocation_registry SET status='EXECUTED' WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3`).bind(decision_id,validated_object_hash,invocation_nonce).run()
      await env.DB.prepare(`UPDATE authority_registry SET status='EXECUTED' WHERE decision_id=?1`).bind(decision_id).run()
      await emitTelemetry(env, { event_type: "EXECUTION_COMPLETED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, severity: "INFO", payload: { route: "/execute", validated_object_hash, invocation_nonce, authority_status: "EXECUTED" } })
      return json({ status:"EXECUTED", session_id, execution_id })
    }

    if (url.pathname === "/proof" && request.method === "POST") {
      const b = await body(request)
      const provenance = deploymentProvenanceFrom(b)
      const execution_id = String(b.execution_id || "")
      const decision_id = String(b.decision_id || "")
      const validated_object_hash = String(b.validated_object_hash || "")
      const session_id = String(b.session_id || "")
      if (!execution_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_execution_id" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "WARN", payload: { route: "/proof" }, drift_class: "proof_drift" })
      if (!decision_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_decision_id" }, { event_type: "VALIDATION_REJECTED", execution_id, severity: "WARN", payload: { route: "/proof" }, drift_class: "proof_drift" })
      if (!validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"missing_validated_object_hash" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "WARN", payload: { route: "/proof" }, drift_class: "proof_drift" })
      const proof_id = crypto.randomUUID()
      const created_at = new Date().toISOString()
      let execution: any = null
      let session: any = null
      let authority: any = null
      let validation: any = null
      let proofInserted = 0
      let authorityConsumed = 0
      try {
        const proofReads = await env.DB.batch<any>([
          env.DB.prepare(`SELECT * FROM execution_registry WHERE execution_id=?1 AND decision_id=?2 AND validated_object_hash=?3 AND status='EXECUTED'`).bind(execution_id,decision_id,validated_object_hash),
          env.DB.prepare(`SELECT * FROM session_registry WHERE session_id=?1 AND continuity_status='ACTIVE' AND expires_at>?2`).bind(session_id,created_at),
          env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id),
          env.DB.prepare(`SELECT * FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND session_id=?3 AND status='VALID' AND result='VALID' ORDER BY created_at DESC LIMIT 1`).bind(decision_id,validated_object_hash,session_id)
        ])
        execution = proofReads[0]?.results?.[0] || null
        session = proofReads[1]?.results?.[0] || null
        authority = proofReads[2]?.results?.[0] || null
        validation = proofReads[3]?.results?.[0] || null
      } catch {
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"proof_read_failed" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, proof_id, severity: "HIGH", payload: { route: "/proof", validated_object_hash }, drift_class: "proof_drift" })
      }
      if (!execution) {
        const executionById = await env.DB.prepare(`SELECT * FROM execution_registry WHERE execution_id=?1`).bind(execution_id).first<any>()
        if (executionById) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", expected_decision_id: executionById.decision_id, provided_decision_id: decision_id, expected_hash: executionById.validated_object_hash, provided_hash: validated_object_hash, indicator: "proof_hash_mismatch" }, drift_class: "proof_drift" })
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"execution_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", validated_object_hash, indicator: "proof_without_execute" }, drift_class: "proof_drift" })
      }
      if (!session) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", session_id }, drift_class: "proof_drift" })
      if (String(execution.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", expected_session_id: execution.session_id, provided_session_id: session_id }, drift_class: "proof_drift" })
      if (!authority || String(authority.status) !== "EXECUTED") return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_not_executed" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, authority_id: String(authority?.authority_id || ""), severity: "HIGH", payload: { route: "/proof", authority_status: authority?.status || null, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      if (String(authority.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_session_id: authority.session_id, provided_session_id: session_id }, drift_class: "authority_drift" })
      if (String(authority.continuity_id || "") !== String(execution.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_continuity_id: authority.continuity_id, provided_continuity_id: execution.continuity_id }, drift_class: "proof_drift" })
      if (!validation || String(validation.continuity_id || "") !== String(execution.continuity_id || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"continuity_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_continuity_id: execution.continuity_id, provided_continuity_id: validation?.continuity_id || null }, drift_class: "proof_drift" })
      const continuity = await activeContinuity(env, String(execution.continuity_id || ""), session, decision_id)
      if (!continuity) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_continuity" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", continuity_id: execution.continuity_id || null, indicator: "proof_lineage_invalid" }, drift_class: "proof_drift" })
      const compiled = await env.DB.prepare(`SELECT canonical_aeo,validated_object_hash,continuity_id,status FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND status='COMPILED'`).bind(decision_id,validated_object_hash).first<any>()
      let proofAeo: any
      try { proofAeo = JSON.parse(String(compiled?.canonical_aeo || "{}")) } catch { proofAeo = null }
      const proofCanonicalAeo = toCanonicalAeo(proofAeo)
      const proofHash = proofCanonicalAeo ? await sha256Hex(canonicalize(proofCanonicalAeo)) : ""
      if (!compiled || !proofCanonicalAeo || proofHash !== validated_object_hash || proofHash !== String(compiled.validated_object_hash || "")) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_mismatch" }, { event_type: "HASH_MISMATCH", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_hash: validated_object_hash, actual_hash: proofHash, indicator: "proof_hash_mismatch" }, drift_class: "hash_drift" })
      const provenanceValidation = await validateDeploymentProvenance(env, { route: "/proof", decision_id, validated_object_hash, authority, compiledCanonicalAeo: proofCanonicalAeo, provenance, execution })
      if (!provenanceValidation.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: provenanceValidation.reason }, { event_type: provenanceValidation.drift_class === "workflow_source_drift" ? "HASH_MISMATCH" : "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { ...provenanceValidation.payload, validated_object_hash }, drift_class: provenanceValidation.drift_class })
      const authorityLineage = canonicalize({
        identity_id: String(authority.identity_id || ""),
        session_id,
        continuity_id: String(execution.continuity_id || ""),
        continuity_ancestry: continuity.ancestry || [],
        authority_id: String(authority.authority_id || ""),
        decision_id,
        validated_object_hash,
        repository: provenance.repository,
        branch: provenance.branch,
        pull_request_id: provenance.pull_request_id,
        merge_commit_sha: provenance.merge_commit_sha,
        source_tree_hash: provenance.source_tree_hash,
        workflow_run_id: provenance.workflow_run_id,
        workflow_sha: provenance.workflow_sha,
        validation_id: String(validation.validation_id || ""),
        validation_status: String(validation.status || "")
      })
      const executionLineage = canonicalize({
        identity_id: String(authority.identity_id || ""),
        session_id,
        continuity_id: String(execution.continuity_id || ""),
        continuity_ancestry: continuity.ancestry || [],
        authority_id: String(authority.authority_id || ""),
        decision_id,
        execution_id,
        validated_object_hash,
        repository: provenance.repository,
        branch: provenance.branch,
        pull_request_id: provenance.pull_request_id,
        merge_commit_sha: provenance.merge_commit_sha,
        source_tree_hash: provenance.source_tree_hash,
        workflow_run_id: provenance.workflow_run_id,
        workflow_sha: provenance.workflow_sha,
        invocation_nonce: String(execution.invocation_nonce || ""),
        execution_status: String(execution.status || "")
      })
      try {
        const proofBoundary = await env.DB.batch<any>([
          env.DB.prepare(`INSERT INTO proof_registry (proof_id,identity_id,session_id,continuity_id,continuity_hash,execution_id,decision_id,validated_object_hash,authority_lineage,execution_lineage,surface,run_id,commit_sha,workflow,environment,created_at,repository,branch,pull_request_id,merge_commit_sha,source_tree_hash,workflow_run_id,workflow_sha)
            SELECT ?1, s.identity_id, ?2, a.continuity_id, c.continuity_hash, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?15, ?16, ?17, ?18, ?19, ?20, ?21
            FROM authority_registry a JOIN session_registry s ON s.session_id=a.session_id JOIN continuity_registry c ON c.continuity_id=a.continuity_id
            WHERE a.decision_id=?4 AND a.session_id=?2 AND a.status='EXECUTED' AND c.status='ACTIVE' AND c.expires_at>?13
              AND a.continuity_id=?14
              AND EXISTS (SELECT 1 FROM execution_registry WHERE execution_id=?3 AND decision_id=?4 AND validated_object_hash=?5 AND session_id=?2 AND continuity_id=a.continuity_id AND status='EXECUTED')
              AND EXISTS (SELECT 1 FROM validation_registry WHERE decision_id=?4 AND validated_object_hash=?5 AND session_id=?2 AND continuity_id=a.continuity_id AND status='VALID' AND result='VALID')
              AND s.continuity_status='ACTIVE' AND s.expires_at>?13`).bind(proof_id,session_id,execution_id,decision_id,validated_object_hash,authorityLineage,executionLineage,String(b.surface||""),provenance.workflow_run_id,provenance.workflow_sha,String(b.workflow||GOVERNED_WORKFLOW),String(b.environment||""),created_at,String(execution.continuity_id || ""),provenance.repository,provenance.branch,provenance.pull_request_id,provenance.merge_commit_sha,provenance.source_tree_hash,provenance.workflow_run_id,provenance.workflow_sha),
          env.DB.prepare(`UPDATE authority_registry SET status='CONSUMED' WHERE decision_id=?1 AND session_id=?2 AND status='EXECUTED' AND continuity_id=?5 AND EXISTS (SELECT 1 FROM proof_registry WHERE proof_id=?3 AND decision_id=?1 AND validated_object_hash=?4)`).bind(decision_id,session_id,proof_id,validated_object_hash,String(execution.continuity_id || ""))
        ])
        proofInserted = proofBoundary[0]?.meta?.changes || 0
        authorityConsumed = proofBoundary[1]?.meta?.changes || 0
      } catch {
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"proof_replay" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, proof_id, severity: "HIGH", payload: { route: "/proof", validated_object_hash, indicator: "duplicate_proof_or_transaction_conflict" }, drift_class: "replay_drift" })
      }
      if (proofInserted !== 1 || authorityConsumed !== 1) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_consumption_failed" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, proof_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/proof", proof_inserted: proofInserted, authority_consumed: authorityConsumed }, drift_class: "authority_drift" })
      await emitTelemetry(env, { event_type: "PROOF_PERSISTED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, proof_id, severity: "INFO", payload: { route: "/proof", session_id, validated_object_hash, repository: provenance.repository, branch: provenance.branch, workflow_run_id: provenance.workflow_run_id } })
      await emitTelemetry(env, { event_type: "AUTHORITY_CONSUMED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, proof_id, severity: "INFO", payload: { route: "/proof", authority_status: "CONSUMED" } })
      return json({ status:"PROVEN", result:"OK", proof_id, proof: { proof_id, identity_id: String(authority.identity_id || ""), session_id, continuity_id: String(authority.continuity_id || ""), execution_id, decision_id, validated_object_hash, repository: provenance.repository, branch: provenance.branch, pull_request_id: provenance.pull_request_id, merge_commit_sha: provenance.merge_commit_sha, source_tree_hash: provenance.source_tree_hash, workflow_run_id: provenance.workflow_run_id, workflow_sha: provenance.workflow_sha } })
    }

    return json({ status: "NULL", reason: "not_found" }, 404)
    } catch {
      return json({ status: "NULL", reason: "runtime_exception" }, 500)
    }
  }
}
