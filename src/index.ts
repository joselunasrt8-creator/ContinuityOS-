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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json" } })
}

async function body(req: Request): Promise<any> { try { return await req.json() } catch { return {} } }
function authorized(req: Request, env: Env): boolean { return typeof env.API_KEY === "string" && env.API_KEY.length > 0 && req.headers.get("X-API-Key") === env.API_KEY }
function canonicalize(v: any): string { if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`; if (v && typeof v === "object") return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(v[k])}`).join(",")}}`; return JSON.stringify(v) }
async function sha256Hex(input: string): Promise<string> { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)); return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("") }

function toCanonicalAeo(input: any): CanonicalAEO | null {
  const keys = Object.keys(input || {}).sort()
  if (keys.length !== REQUIRED_AEO_KEYS.length) return null
  if (keys.join("|") !== [...REQUIRED_AEO_KEYS].sort().join("|")) return null
  return {
    intent: String(input.intent || ""),
    scope: input.scope || {},
    validation: input.validation || {},
    target: input.target || {},
    finality: input.finality || {}
  }
}

async function ensureSchema(env: Env) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS authority_registry (authority_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, intent TEXT NOT NULL, scope TEXT NOT NULL, constraints TEXT NOT NULL, expiry TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS aeo_registry (aeo_id TEXT PRIMARY KEY, authority_id TEXT NOT NULL, decision_id TEXT NOT NULL, canonical_aeo TEXT NOT NULL, validated_object_hash TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS validation_registry (validation_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, environment TEXT, result TEXT NOT NULL, reason TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS execution_registry (execution_id TEXT PRIMARY KEY, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(decision_id, validated_object_hash))`,
    `CREATE TABLE IF NOT EXISTS proof_registry (proof_id TEXT PRIMARY KEY, execution_id TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, surface TEXT, run_id TEXT, commit_sha TEXT, workflow TEXT, environment TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS invocation_registry (decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, invocation_nonce TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(decision_id, validated_object_hash, invocation_nonce))`
  ]
  for (const s of stmts) await env.DB.prepare(s).run()
}

async function hasColumn(env: Env, table: string, column: string): Promise<boolean> {
  const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all<any>()
  const rows = Array.isArray(info?.results) ? info.results : []
  return rows.some((row: any) => String(row?.name) === column)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true })

    const mutationEndpoint = ["/authority", "/compile", "/validate", "/execute", "/proof"].includes(url.pathname) && request.method === "POST"
    if (mutationEndpoint && !authorized(request, env)) return json({ status: "NULL", reason: "unauthorized" }, 403)

    await ensureSchema(env)

    if (url.pathname === "/authority" && request.method === "POST") {
      const b = await body(request)
      const rec = { authority_id: crypto.randomUUID(), decision_id: String(b.decision_id || crypto.randomUUID()), owner: String(b.owner || "unknown"), intent: String(b.intent || "deploy_production"), scope: JSON.stringify(b.scope || {}), constraints: JSON.stringify(b.constraints || {}), expiry: String(b.expiry || new Date(Date.now()+3600_000).toISOString()), status: "ACTIVE", created_at: new Date().toISOString() }
      await env.DB.prepare(`INSERT INTO authority_registry (authority_id,decision_id,owner,intent,scope,constraints,expiry,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`).bind(rec.authority_id,rec.decision_id,rec.owner,rec.intent,rec.scope,rec.constraints,rec.expiry,rec.status,rec.created_at).run()
      return json(rec)
    }

    if (url.pathname === "/compile" && request.method === "POST") {
      try {
        const b = await body(request)
        const decision_id = String(b.decision_id || "")
        if (!decision_id) return json({ status: "NULL", route: "/compile", reason: "missing_decision_id" })

        const authorityHasStatus = await hasColumn(env, "authority_registry", "status")
        const authorityHasDecision = await hasColumn(env, "authority_registry", "decision_id")
        if (!authorityHasStatus || !authorityHasDecision) {
          return json({ status: "NULL", route: "/compile", reason: "schema_incompatible_authority_registry" })
        }
        const aeoHasHash = await hasColumn(env, "aeo_registry", "validated_object_hash")
        if (!aeoHasHash) return json({ status: "NULL", route: "/compile", reason: "schema_incompatible_aeo_registry" })

        const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
        if (!authority) return json({ status: "NULL", route: "/compile", reason: "authority_missing" })
        if (!["ACTIVE", "VALIDATED", "RESERVED"].includes(String(authority.status || ""))) {
          return json({ status: "NULL", route: "/compile", reason: "authority_unusable" })
        }
        const constraints = JSON.parse(String(authority.constraints || "{}"))
        const canonical_aeo = toCanonicalAeo({ intent: authority.intent, scope: JSON.parse(String(authority.scope || "{}")), validation: { workflow: GOVERNED_WORKFLOW }, target: { repo: constraints.repo, branch: constraints.branch, workflow: GOVERNED_WORKFLOW }, finality: { proof_required: true } })
        if (!canonical_aeo) return json({ status: "NULL", route: "/compile", reason: "invalid_canonical_aeo" })
        const validated_object_hash = await sha256Hex(canonicalize(canonical_aeo))
        await env.DB.prepare(`INSERT INTO aeo_registry (aeo_id,authority_id,decision_id,canonical_aeo,validated_object_hash,status,created_at) VALUES (?1,?2,?3,?4,?5,'COMPILED',?6)`).bind(crypto.randomUUID(), authority.authority_id, decision_id, JSON.stringify(canonical_aeo), validated_object_hash, new Date().toISOString()).run()
        return json({ status: "COMPILED", decision_id, validated_object_hash, canonical_aeo })
      } catch (error: any) {
        return json({
          status: "FAILED",
          route: "/compile",
          error: String(error?.message || error || "unknown_error"),
          reason: "compile_exception"
        })
      }
    }

    if (url.pathname === "/validate" && request.method === "POST") {
      const b = await body(request); const { decision_id, validated_object_hash, invocation_nonce, environment } = b
      const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
      if (!authority) return json({ status:"NULL", result:"INVALID", reason:"authority_missing" })
      if (!["ACTIVE","VALIDATED","RESERVED"].includes(String(authority.status))) return json({ status:"NULL", result:"INVALID", reason:"authority_unusable" })
      const compiled = await env.DB.prepare(`SELECT * FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2`).bind(decision_id, validated_object_hash).first<any>()
      if (!compiled) return json({ status:"NULL", result:"INVALID", reason:"hash_missing" })
      const target = JSON.parse(String(compiled.canonical_aeo)).target
      const constraints = JSON.parse(String(authority.constraints))
      if (target.repo!==constraints.repo || target.branch!==constraints.branch || target.workflow!==constraints.workflow) return json({ status:"NULL", result:"INVALID", reason:"scope_constraints_mismatch" })
      if (target.workflow !== GOVERNED_WORKFLOW) return json({ status:"NULL", result:"INVALID", reason:"workflow_mismatch" })
      const insert = await env.DB.prepare(`INSERT OR IGNORE INTO invocation_registry (decision_id,validated_object_hash,invocation_nonce,status,created_at) VALUES (?1,?2,?3,'RESERVED',?4)`).bind(decision_id,validated_object_hash,invocation_nonce,new Date().toISOString()).run()
      if ((insert.meta?.changes||0)===0) return json({ status:"NULL", result:"INVALID", reason:"nonce_used" })
      await env.DB.prepare(`INSERT INTO validation_registry (validation_id,decision_id,validated_object_hash,invocation_nonce,environment,result,reason,status,created_at) VALUES (?1,?2,?3,?4,?5,'VALID',NULL,'VALID',?6)`).bind(crypto.randomUUID(),decision_id,validated_object_hash,invocation_nonce,String(environment||""),new Date().toISOString()).run()
      await env.DB.prepare(`UPDATE authority_registry SET status='RESERVED' WHERE decision_id=?1 AND status IN ('ACTIVE','VALIDATED','RESERVED')`).bind(decision_id).run()
      return json({ status:"VALID", result:"VALID", validated_object_hash, invocation_nonce })
    }

    if (url.pathname === "/execute" && request.method === "POST") {
      const b = await body(request); const { decision_id, validated_object_hash, invocation_nonce } = b
      const valid = await env.DB.prepare(`SELECT * FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3 AND result='VALID'`).bind(decision_id,validated_object_hash,invocation_nonce).first<any>()
      if (!valid) return json({ status:"NULL", result:"INVALID", reason:"no_validation" })
      const inv = await env.DB.prepare(`SELECT * FROM invocation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3`).bind(decision_id,validated_object_hash,invocation_nonce).first<any>()
      if (!inv || inv.status!=="RESERVED") return json({ status:"NULL", result:"INVALID", reason:"nonce_not_reserved" })
      const authority = await env.DB.prepare(`SELECT * FROM authority_registry WHERE decision_id=?1`).bind(decision_id).first<any>()
      if (!authority || !["RESERVED","VALIDATED"].includes(String(authority.status))) return json({ status:"NULL", result:"INVALID", reason:"authority_not_reserved" })
      const replay = await env.DB.prepare(`SELECT execution_id FROM execution_registry WHERE decision_id=?1 AND validated_object_hash=?2`).bind(decision_id,validated_object_hash).first<any>()
      if (replay) return json({ status:"NULL", result:"INVALID", reason:"replay_detected" })
      const compiled = await env.DB.prepare(`SELECT canonical_aeo FROM aeo_registry WHERE decision_id=?1 AND validated_object_hash=?2`).bind(decision_id,validated_object_hash).first<any>()
      const execHash = await sha256Hex(canonicalize(JSON.parse(String(compiled?.canonical_aeo||"{}"))))
      if (execHash !== validated_object_hash) return json({ status:"NULL", result:"INVALID", reason:"wrong_hash" })
      const execution_id = crypto.randomUUID()
      await env.DB.prepare(`INSERT INTO execution_registry (execution_id,decision_id,validated_object_hash,invocation_nonce,status,created_at) VALUES (?1,?2,?3,?4,'EXECUTED',?5)`).bind(execution_id,decision_id,validated_object_hash,invocation_nonce,new Date().toISOString()).run()
      await env.DB.prepare(`UPDATE invocation_registry SET status='EXECUTED' WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3`).bind(decision_id,validated_object_hash,invocation_nonce).run()
      await env.DB.prepare(`UPDATE authority_registry SET status='EXECUTED' WHERE decision_id=?1`).bind(decision_id).run()
      return json({ status:"VALID", result:"EXECUTED", execution_status:"EXECUTED", execution_id, validated_object_hash, invocation_nonce })
    }

    if (url.pathname === "/proof" && request.method === "POST") {
      const b = await body(request)
      const execution = await env.DB.prepare(`SELECT * FROM execution_registry WHERE execution_id=?1 AND decision_id=?2 AND validated_object_hash=?3`).bind(b.execution_id,b.decision_id,b.validated_object_hash).first<any>()
      if (!execution) return json({ status:"NULL", result:"INVALID", reason:"execution_missing" })
      await env.DB.prepare(`INSERT INTO proof_registry (proof_id,execution_id,decision_id,validated_object_hash,surface,run_id,commit_sha,workflow,environment,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`).bind(crypto.randomUUID(),b.execution_id,b.decision_id,b.validated_object_hash,String(b.surface||""),String(b.run_id||""),String(b.commit_sha||""),String(b.workflow||""),String(b.environment||""),new Date().toISOString()).run()
      await env.DB.prepare(`UPDATE authority_registry SET status='CONSUMED' WHERE decision_id=?1`).bind(b.decision_id).run()
      return json({ status:"PROVEN", result:"OK" })
    }

    return json({ status: "NULL", reason: "not_found" }, 404)
  }
}
