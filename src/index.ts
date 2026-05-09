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
const CANONICAL_RUNTIME_ROUTES = ["/session", "/authority", "/compile", "/validate", "/execute", "/proof"] as const

type TelemetryEventType = "SESSION_CREATED" | "AUTHORITY_CREATED" | "AEO_COMPILED" | "VALIDATION_GRANTED" | "VALIDATION_REJECTED" | "EXECUTION_STARTED" | "EXECUTION_COMPLETED" | "PROOF_PERSISTED" | "REPLAY_BLOCKED" | "HASH_MISMATCH" | "AUTHORITY_CONSUMED"
type DriftClass = "authority_drift" | "hash_drift" | "execution_drift" | "proof_drift" | "replay_drift" | "registry_drift"

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json" } })
}

async function body(req: Request): Promise<any> { try { return await req.json() } catch { return {} } }
function authorized(req: Request, env: Env): boolean { return typeof env.API_KEY === "string" && env.API_KEY.length > 0 && req.headers.get("X-API-Key") === env.API_KEY }
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
    repo: String(input?.repo || ""),
    branch: String(input?.branch || ""),
    workflow: String(input?.workflow || GOVERNED_WORKFLOW)
  }
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
  const stmts = [
    `CREATE TABLE IF NOT EXISTS session_registry (session_id TEXT PRIMARY KEY, identity_id TEXT NOT NULL, owner TEXT NOT NULL, trust_tier TEXT NOT NULL, continuity_status TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_session_registry_status_expiry ON session_registry(continuity_status, expires_at)`,
    `CREATE TABLE IF NOT EXISTS authority_registry (authority_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL UNIQUE, session_id TEXT NOT NULL, owner TEXT NOT NULL, intent TEXT NOT NULL, scope TEXT NOT NULL, constraints TEXT NOT NULL, expiry TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS aeo_registry (aeo_id TEXT PRIMARY KEY, authority_id TEXT NOT NULL, decision_id TEXT NOT NULL, canonical_aeo TEXT NOT NULL, validated_object_hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS validation_registry (validation_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, environment TEXT, result TEXT NOT NULL, reason TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS execution_registry (execution_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(decision_id, validated_object_hash))`,
    `CREATE TABLE IF NOT EXISTS proof_registry (proof_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, execution_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, surface TEXT, run_id TEXT, commit_sha TEXT, workflow TEXT, environment TEXT, created_at TEXT NOT NULL, UNIQUE(decision_id, validated_object_hash))`,
    `CREATE TABLE IF NOT EXISTS proof_registry_duplicate_archive (archive_id TEXT PRIMARY KEY, proof_id TEXT NOT NULL, session_id TEXT NOT NULL, execution_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, surface TEXT, run_id TEXT, commit_sha TEXT, workflow TEXT, environment TEXT, created_at TEXT NOT NULL, archived_at TEXT NOT NULL, archive_reason TEXT NOT NULL, canonical_proof_id TEXT NOT NULL, UNIQUE(proof_id))`,
    `CREATE TABLE IF NOT EXISTS invocation_registry (decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce))`,
    `CREATE TABLE IF NOT EXISTS observability_registry (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, decision_id TEXT, authority_id TEXT, execution_id TEXT, proof_id TEXT, severity TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_observability_decision ON observability_registry(decision_id)`,
    `CREATE INDEX IF NOT EXISTS idx_observability_execution ON observability_registry(execution_id)`,
    `CREATE INDEX IF NOT EXISTS idx_observability_type ON observability_registry(event_type)`,
    `CREATE TABLE IF NOT EXISTS drift_registry (drift_id TEXT PRIMARY KEY, drift_class TEXT NOT NULL, severity TEXT NOT NULL, decision_id TEXT, execution_id TEXT, payload TEXT NOT NULL, detected_by TEXT NOT NULL, resolution_status TEXT NOT NULL, created_at TEXT NOT NULL)`
  ]
  for (const s of stmts) await env.DB.prepare(s).run()
  if (options.stabilizeProofRegistry === false) return
  await quarantineHistoricalProofDuplicates(env)
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique ON proof_registry(decision_id, validated_object_hash)`).run()
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
    return null
  }
  return session
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true })

    const canonicalRuntimeRoute = CANONICAL_RUNTIME_ROUTES.includes(url.pathname as any)
    const mutationEndpoint = canonicalRuntimeRoute && request.method === "POST"
    if (mutationEndpoint && !authorized(request, env)) return json({ status: "NULL", reason: "unauthorized" }, 403)

    try {
      await ensureSchema(env, { stabilizeProofRegistry: url.pathname !== "/session" })
    } catch {
      return json({ status: "NULL", reason: "schema_initialization_failed" }, 500)
    }

    if (request.method === "POST" && !canonicalRuntimeRoute) {
      await recordDrift(env, { drift_class: "registry_drift", severity: "HIGH", payload: { route: url.pathname, indicator: "invalid_route_invocation" } })
      return json({ status: "NULL", reason: "not_found" }, 404)
    }

    if (url.pathname === "/session" && request.method === "POST") {
      const b = await body(request)
      const identity_id = String(b.identity_id || "")
      if (!identity_id) return json({ status: "NULL", reason: "missing_identity_id" })
      const expires_at = String(b.expires_at || new Date(Date.now()+SESSION_TTL_MS).toISOString())
      if (isExpired(expires_at)) return json({ status: "NULL", reason: "invalid_session_expiry" })
      const session = { session_id: crypto.randomUUID(), identity_id, owner: "human-origin", trust_tier: "T0", continuity_status: "ACTIVE", created_at: new Date().toISOString(), expires_at }
      await env.DB.prepare(`INSERT INTO session_registry (session_id,identity_id,owner,trust_tier,continuity_status,created_at,expires_at) VALUES (?1,?2,?3,?4,?5,?6,?7)`).bind(session.session_id,session.identity_id,session.owner,session.trust_tier,session.continuity_status,session.created_at,session.expires_at).run()
      await emitTelemetry(env, { event_type: "SESSION_CREATED", severity: "INFO", payload: { route: "/session", session_id: session.session_id, continuity_status: "ACTIVE" } })
      return json({ status: "SESSION_ACTIVE", session_id: session.session_id })
    }

    if (url.pathname === "/authority" && request.method === "POST") {
      const b = await body(request)
      const session_id = String(b.session_id || "")
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status: "NULL", reason: "invalid_session" }, { event_type: "VALIDATION_REJECTED", severity: "HIGH", payload: { route: "/authority", session_id }, drift_class: "authority_drift" })
      const rec = { authority_id: crypto.randomUUID(), decision_id: String(b.decision_id || crypto.randomUUID()), session_id, owner: String(b.owner || "unknown"), intent: String(b.intent || "deploy_production"), scope: JSON.stringify(b.scope || {}), constraints: JSON.stringify(b.constraints || {}), expiry: String(b.expiry || new Date(Date.now()+3600_000).toISOString()), status: "ACTIVE", created_at: new Date().toISOString() }
      await env.DB.prepare(`INSERT INTO authority_registry (authority_id,decision_id,session_id,owner,intent,scope,constraints,expiry,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`).bind(rec.authority_id,rec.decision_id,rec.session_id,rec.owner,rec.intent,rec.scope,rec.constraints,rec.expiry,rec.status,rec.created_at).run()
      await emitTelemetry(env, { event_type: "AUTHORITY_CREATED", decision_id: rec.decision_id, authority_id: rec.authority_id, severity: "INFO", payload: { route: "/authority", session_id, authority_status: "ACTIVE" } })
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
        const constraints = JSON.parse(String(authority.constraints || "{}"))
        const target = canonicalDeployTarget(constraints)
        if (target.workflow !== GOVERNED_WORKFLOW) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "workflow_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile", workflow: target.workflow, indicator: "unmanaged_deploy_surface" }, drift_class: "registry_drift" })
        const canonical_aeo = toCanonicalAeo({ intent: authority.intent, scope: JSON.parse(String(authority.scope || "{}")), validation: { workflow: GOVERNED_WORKFLOW }, target, finality: { proof_required: true } })
        if (!canonical_aeo) return rejectWithTelemetry(env, { status: "NULL", route: "/compile", reason: "invalid_canonical_aeo" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/compile" }, drift_class: "registry_drift" })
        const canonical_aeo_json = canonicalize(canonical_aeo)
        const validated_object_hash = await sha256Hex(canonical_aeo_json)
        await env.DB.prepare(`INSERT INTO aeo_registry (aeo_id,authority_id,decision_id,canonical_aeo,validated_object_hash,status,created_at) VALUES (?1,?2,?3,?4,?5,'COMPILED',?6)`).bind(crypto.randomUUID(), authority.authority_id, decision_id, canonical_aeo_json, validated_object_hash, new Date().toISOString()).run()
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
      const b = await body(request); const { decision_id, validated_object_hash, invocation_nonce, environment } = b; const session_id = String(b.session_id || "")
      const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
      if (!authority) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/validate" }, drift_class: "authority_drift" })
      if (!["ACTIVE","VALIDATED","RESERVED"].includes(String(authority.status))) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_unusable" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", authority_status: authority.status, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", session_id }, drift_class: "authority_drift" })
      if (String(authority.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", expected_session_id: authority.session_id, provided_session_id: session_id }, drift_class: "authority_drift" })
      const compiled = await env.DB.prepare(`SELECT * FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2`).bind(decision_id, validated_object_hash).first<any>()
      if (!compiled) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"hash_missing" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", validated_object_hash }, drift_class: "hash_drift" })
      const target = JSON.parse(String(compiled.canonical_aeo)).target
      const constraints = canonicalDeployTarget(JSON.parse(String(authority.constraints)))
      if (String(target.repo)!==constraints.repo || String(target.branch)!==constraints.branch || String(target.workflow)!==constraints.workflow) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"scope_constraints_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", indicator: "non_canonical_workflow" }, drift_class: "registry_drift" })
      if (target.workflow !== GOVERNED_WORKFLOW) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"workflow_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", workflow: target.workflow, indicator: "unmanaged_deploy_surface" }, drift_class: "registry_drift" })
      const insert = await env.DB.prepare(`INSERT OR IGNORE INTO invocation_registry (decision_id,validated_object_hash,invocation_nonce,status,created_at) VALUES (?1,?2,?3,'RESERVED',?4)`).bind(decision_id,validated_object_hash,invocation_nonce,new Date().toISOString()).run()
      if ((insert.meta?.changes||0)===0) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"nonce_used" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/validate", validated_object_hash, invocation_nonce, indicator: "reused_nonce" }, drift_class: "replay_drift" })
      await env.DB.prepare(`INSERT INTO validation_registry (validation_id,session_id,decision_id,validated_object_hash,invocation_nonce,environment,result,reason,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,'VALID',NULL,'VALID',?7)`).bind(crypto.randomUUID(),session_id,decision_id,validated_object_hash,invocation_nonce,String(environment||""),new Date().toISOString()).run()
      await env.DB.prepare(`UPDATE authority_registry SET status='RESERVED' WHERE decision_id=?1 AND status IN ('ACTIVE','VALIDATED','RESERVED')`).bind(decision_id).run()
      await emitTelemetry(env, { event_type: "VALIDATION_GRANTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "INFO", payload: { route: "/validate", validated_object_hash, invocation_nonce, authority_status: "RESERVED" } })
      return json({ status:"VALID", result:"VALID", session_id, validated_object_hash, invocation_nonce })
    }

    if (url.pathname === "/execute" && request.method === "POST") {
      const b = await body(request); const { decision_id, validated_object_hash, invocation_nonce } = b; const session_id = String(b.session_id || "")
      await emitTelemetry(env, { event_type: "EXECUTION_STARTED", decision_id, severity: "INFO", payload: { route: "/execute", validated_object_hash, invocation_nonce } })
      const valid = await env.DB.prepare(`SELECT * FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3 AND result='VALID'`).bind(decision_id,validated_object_hash,invocation_nonce).first<any>()
      if (!valid) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"no_validation" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", validated_object_hash, invocation_nonce, indicator: "execute_without_validate" }, drift_class: "execution_drift" })
      const session = await activeSession(env, session_id)
      if (!session) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", session_id, validated_object_hash, invocation_nonce }, drift_class: "execution_drift" })
      if (String(valid.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, severity: "HIGH", payload: { route: "/execute", expected_session_id: valid.session_id, provided_session_id: session_id, validated_object_hash, invocation_nonce }, drift_class: "execution_drift" })
      const inv = await env.DB.prepare(`SELECT * FROM invocation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3`).bind(decision_id,validated_object_hash,invocation_nonce).first<any>()
      if (!inv || inv.status!=="RESERVED") return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"nonce_not_reserved" }, { event_type: "REPLAY_BLOCKED", decision_id, severity: "HIGH", payload: { route: "/execute", validated_object_hash, invocation_nonce, invocation_status: inv?.status || null, indicator: "reused_nonce" }, drift_class: "replay_drift" })
      const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
      if (!authority || !["RESERVED","VALIDATED"].includes(String(authority.status))) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_not_reserved" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority?.authority_id || ""), severity: "HIGH", payload: { route: "/execute", authority_status: authority?.status || null, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      if (String(authority.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_session_id: authority.session_id, provided_session_id: session_id }, drift_class: "authority_drift" })
      const replay = await env.DB.prepare(`SELECT execution_id FROM execution_registry WHERE decision_id=?1 AND validated_object_hash=?2`).bind(decision_id,validated_object_hash).first<any>()
      if (replay) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"replay_detected" }, { event_type: "REPLAY_BLOCKED", decision_id, authority_id: String(authority.authority_id || ""), execution_id: String(replay.execution_id || ""), severity: "HIGH", payload: { route: "/execute", validated_object_hash, invocation_nonce, indicator: "duplicate_execution" }, drift_class: "replay_drift" })
      const compiled = await env.DB.prepare(`SELECT canonical_aeo FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2`).bind(decision_id,validated_object_hash).first<any>()
      const execHash = await sha256Hex(canonicalize(JSON.parse(String(compiled?.canonical_aeo||"{}"))))
      if (execHash !== validated_object_hash) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"wrong_hash" }, { event_type: "HASH_MISMATCH", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", expected_hash: validated_object_hash, actual_hash: execHash, indicator: "execution_hash_mismatch" }, drift_class: "hash_drift" })
      const execution_id = crypto.randomUUID()
      await env.DB.prepare(`INSERT INTO execution_registry (execution_id,session_id,decision_id,validated_object_hash,invocation_nonce,status,created_at) VALUES (?1,?2,?3,?4,?5,'EXECUTED',?6)`).bind(execution_id,session_id,decision_id,validated_object_hash,invocation_nonce,new Date().toISOString()).run()
      await env.DB.prepare(`UPDATE invocation_registry SET status='EXECUTED' WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3`).bind(decision_id,validated_object_hash,invocation_nonce).run()
      await env.DB.prepare(`UPDATE authority_registry SET status='EXECUTED' WHERE decision_id=?1`).bind(decision_id).run()
      await emitTelemetry(env, { event_type: "EXECUTION_COMPLETED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, severity: "INFO", payload: { route: "/execute", validated_object_hash, invocation_nonce, authority_status: "EXECUTED" } })
      return json({ status:"EXECUTED", session_id, execution_id })
    }

    if (url.pathname === "/proof" && request.method === "POST") {
      const b = await body(request)
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
      let proofInserted = 0
      let authorityConsumed = 0
      try {
        const proofBoundary = await env.DB.batch<any>([
          env.DB.prepare(`SELECT * FROM execution_registry WHERE execution_id=?1 AND decision_id=?2 AND validated_object_hash=?3 AND status='EXECUTED'`).bind(execution_id,decision_id,validated_object_hash),
          env.DB.prepare(`SELECT * FROM session_registry WHERE session_id=?1 AND continuity_status='ACTIVE' AND expires_at>?2`).bind(session_id,created_at),
          env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id),
          env.DB.prepare(`INSERT INTO proof_registry (proof_id,session_id,execution_id,decision_id,validated_object_hash,surface,run_id,commit_sha,workflow,environment,created_at)
            SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11
            WHERE EXISTS (SELECT 1 FROM execution_registry WHERE execution_id=?3 AND decision_id=?4 AND validated_object_hash=?5 AND session_id=?2 AND status='EXECUTED')
              AND EXISTS (SELECT 1 FROM session_registry WHERE session_id=?2 AND continuity_status='ACTIVE' AND expires_at>?11)
              AND EXISTS (SELECT 1 FROM authority_registry WHERE decision_id=?4 AND session_id=?2 AND status='EXECUTED')`).bind(proof_id,session_id,execution_id,decision_id,validated_object_hash,String(b.surface||""),String(b.run_id||""),String(b.commit_sha||""),String(b.workflow||""),String(b.environment||""),created_at),
          env.DB.prepare(`UPDATE authority_registry SET status='CONSUMED' WHERE decision_id=?1 AND session_id=?2 AND status='EXECUTED' AND EXISTS (SELECT 1 FROM proof_registry WHERE proof_id=?3 AND decision_id=?1 AND validated_object_hash=?4)`).bind(decision_id,session_id,proof_id,validated_object_hash)
        ])
        execution = proofBoundary[0]?.results?.[0] || null
        session = proofBoundary[1]?.results?.[0] || null
        authority = proofBoundary[2]?.results?.[0] || null
        proofInserted = proofBoundary[3]?.meta?.changes || 0
        authorityConsumed = proofBoundary[4]?.meta?.changes || 0
      } catch {
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"proof_replay" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, proof_id, severity: "HIGH", payload: { route: "/proof", validated_object_hash, indicator: "duplicate_proof_or_transaction_conflict" }, drift_class: "replay_drift" })
      }
      if (!execution) {
        const executionById = await env.DB.prepare(`SELECT * FROM execution_registry WHERE execution_id=?1`).bind(execution_id).first<any>()
        if (executionById) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"execution_missing" }, { event_type: "HASH_MISMATCH", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", expected_decision_id: executionById.decision_id, provided_decision_id: decision_id, expected_hash: executionById.validated_object_hash, provided_hash: validated_object_hash, indicator: "proof_hash_mismatch" }, drift_class: "proof_drift" })
        return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"execution_missing" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", validated_object_hash, indicator: "proof_without_execute" }, drift_class: "proof_drift" })
      }
      if (!session) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"invalid_session" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", session_id }, drift_class: "proof_drift" })
      if (String(execution.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, severity: "HIGH", payload: { route: "/proof", expected_session_id: execution.session_id, provided_session_id: session_id }, drift_class: "proof_drift" })
      if (!authority || String(authority.status) !== "EXECUTED") return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_not_executed" }, { event_type: "REPLAY_BLOCKED", decision_id, execution_id, authority_id: String(authority?.authority_id || ""), severity: "HIGH", payload: { route: "/proof", authority_status: authority?.status || null, indicator: "authority_reuse_after_consumed" }, drift_class: "authority_drift" })
      if (String(authority.session_id || "") !== session_id) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"session_lineage_mismatch" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", expected_session_id: authority.session_id, provided_session_id: session_id }, drift_class: "authority_drift" })
      if (proofInserted !== 1 || authorityConsumed !== 1) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason:"authority_consumption_failed" }, { event_type: "VALIDATION_REJECTED", decision_id, execution_id, proof_id, authority_id: String(authority.authority_id || ""), severity: "CRITICAL", payload: { route: "/proof", proof_inserted: proofInserted, authority_consumed: authorityConsumed }, drift_class: "authority_drift" })
      await emitTelemetry(env, { event_type: "PROOF_PERSISTED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, proof_id, severity: "INFO", payload: { route: "/proof", session_id, validated_object_hash } })
      await emitTelemetry(env, { event_type: "AUTHORITY_CONSUMED", decision_id, authority_id: String(authority.authority_id || ""), execution_id, proof_id, severity: "INFO", payload: { route: "/proof", authority_status: "CONSUMED" } })
      return json({ status:"PROVEN", result:"OK", proof_id, proof: { proof_id, session_id, execution_id, decision_id, validated_object_hash } })
    }

    return json({ status: "NULL", reason: "not_found" }, 404)
  }
}
