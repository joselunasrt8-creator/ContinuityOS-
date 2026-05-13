type Env = { DB: D1Database, API_KEY?: string, PROVENANCE_HMAC_SECRET?: string }

type CanonicalAEO = {
  intent: string
  scope: Record<string, unknown>
  validation: Record<string, unknown>
  target: Record<string, unknown>
  finality: Record<string, unknown>
}

const REQUIRED_AEO_KEYS = ["intent", "scope", "validation", "target", "finality"] as const
const GOVERNED_WORKFLOW = "governed-deploy.yml"
const PROVENANCE_PAYLOAD_TYPE = "application/vnd.mindshift.cryptographic-provenance.v1+json"
const SESSION_TTL_MS = 3600_000
const SYSTEM_MAX_CONTINUITY_DEPTH = 32
const CANONICAL_RUNTIME_ROUTES = ["/session", "/continuity", "/authority", "/compile", "/validate", "/execute", "/proof"] as const
const GOVERNANCE_EVIDENCE_ROUTES = ["/preo"] as const
const NON_EXECUTABLE_OBSERVABILITY_ROUTES = ["/reconcile", "/reconcile/schedule", "/reconcile/report", "/reconcile/drift", "/federation/reconcile", "/federation/reconcile/report", "/federation/reconcile/drift", "/federation/reconcile/checkpoint", "/federation/reconcile/revocation"] as const
const REQUIRE_PREO_LINEAGE = "explicit_governed_deploy_policy" as const
const CANONICAL_RECONCILIATION_REGISTRY_ORDER = [
  "session_registry",
  "continuity_registry",
  "authority_registry",
  "aeo_registry",
  "validation_registry",
  "execution_registry",
  "proof_registry",
  "invocation_registry",
  "preo_registry"
] as const
const RECONCILIATION_MAX_RECURSION_DEPTH = SYSTEM_MAX_CONTINUITY_DEPTH
const RECONCILIATION_ROW_LIMIT = 2
const RECONCILIATION_SCHEDULER_BATCH_LIMIT = 25
const FEDERATED_RECONCILIATION_PAYLOAD_TYPE = "application/vnd.mindshift.federated-reconciliation.v1+json"
const LOCAL_FEDERATION_RUNTIME_ID = "mindshift-local-runtime"
const FEDERATED_REVOCATION_OBSERVABILITY_REGISTRY = "federated_revocation_observability_registry" as const


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
  attestation_registry: ["attestation_id", "envelope_hash", "payload_hash", "payload_type", "signer_identity", "decision_id", "validated_object_hash", "workflow_run_id", "workflow_sha", "canonical_aeo_hash", "transparency_log_id", "transparency_integrated_time", "status", "created_at"],
  observability_registry: ["event_id", "event_type", "decision_id", "authority_id", "execution_id", "proof_id", "severity", "payload", "created_at"],
  drift_registry: ["drift_id", "drift_class", "severity", "decision_id", "execution_id", "payload", "detected_by", "resolution_status", "created_at"],
  federated_reconciliation_registry: ["reconciliation_id", "runtime_id", "remote_runtime_id", "classification", "validated_object_hash", "reconciliation_merkle_root", "bundle_hash", "verification_status", "drift_class", "created_at"]
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
type DriftClass = "authority_drift" | "hash_drift" | "execution_drift" | "proof_drift" | "replay_drift" | "registry_drift" | "provenance_drift" | "branch_lineage_drift" | "workflow_source_drift" | "reconciliation_failure_drift" | "recursive_ancestry_drift" | "replay_chain_drift" | "proof_lineage_drift" | "preo_ancestry_drift" | "revocation_propagation_drift" | "duplicate_lineage_hash_drift" | "orphan_legitimacy_object_drift" | "federated_lineage_drift" | "foreign_ancestry_mismatch_drift" | "scheduler_ordering_instability_drift" | "reconciliation_report_drift" | "portable_serialization_mismatch_drift" | "federated_replay_discontinuity_drift" | "deterministic_traversal_instability_drift" | "reconciliation_payload_corruption_drift" | "traversal_instability_drift" | "telemetry_payload_drift" | "attestation_drift" | "signature_drift" | "signer_identity_drift" | "payload_drift" | "transparency_drift" | "federated_checkpoint_drift" | "federated_merkle_drift" | "federated_bundle_drift" | "federated_attestation_drift" | "federated_reconciliation_drift" | "federated_runtime_divergence_drift" | "federated_replay_drift" | "federated_preo_drift" | "federated_continuity_drift" | "federated_exact_object_drift" | "federated_revocation_divergence_drift" | "federated_revocation_projection_drift" | "federated_revocation_replay_drift" | "federated_checkpoint_revocation_drift" | "federated_expiration_visibility_drift"

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

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value)
    return Uint8Array.from(binary, (char) => char.charCodeAt(0))
  } catch {
    return null
  }
}


function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function dsseLengthPrefixed(value: Uint8Array): Uint8Array {
  return concatBytes(utf8Bytes(String(value.length)), utf8Bytes(" "), value)
}

function dssePreAuthenticationEncoding(payloadType: string, payload: Uint8Array): Uint8Array {
  return concatBytes(utf8Bytes("DSSEv1 "), dsseLengthPrefixed(utf8Bytes(payloadType)), dsseLengthPrefixed(payload))
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) diff |= (a[i] || 0) ^ (b[i] || 0)
  return diff === 0
}

async function hmacSha256(secret: string, bytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", utf8Bytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes))
}

function canonicalProvenancePayload(input: {
  decision_id: string
  validated_object_hash: string
  workflow_run_id: string
  workflow_sha: string
  canonical_aeo_hash: string
  signer_identity: string
  transparency_log_id: string
  transparency_integrated_time: string
  federation?: unknown
}): Record<string, unknown> {
  return canonicalRecord({
    canonical_aeo_hash: input.canonical_aeo_hash,
    decision_id: input.decision_id,
    federation: isPlainRecord(input.federation) ? canonicalRecord(input.federation) : null,
    signer_identity: input.signer_identity,
    transparency_integrated_time: input.transparency_integrated_time,
    transparency_log_id: input.transparency_log_id,
    validated_object_hash: input.validated_object_hash,
    workflow_run_id: input.workflow_run_id,
    workflow_sha: input.workflow_sha
  })
}

type DsseProvenanceValidationContext = {
  decision_id: string
  validated_object_hash: string
  workflow_run_id: string
  workflow_sha: string
  canonical_aeo_hash: string
  expected_signer_identity: string
  hmac_secret: string
}

type ValidatedDsseProvenance = {
  envelope_hash: string
  payload_hash: string
  payload_type: string
  signer_identity: string
  decision_id: string
  validated_object_hash: string
  workflow_run_id: string
  workflow_sha: string
  canonical_aeo_hash: string
  transparency_log_id: string
  transparency_integrated_time: string
}

function envelopeFromInput(input: any): any | null {
  if (!input) return null
  if (isPlainRecord(input.dsse_envelope)) return input.dsse_envelope
  if (isPlainRecord(input.envelope)) return input.envelope
  if (isPlainRecord(input.attestation)) return input.attestation
  if (isPlainRecord(input.provenance_attestation)) return input.provenance_attestation
  return null
}

async function validateDsseProvenanceEnvelope(envelope: any, context: DsseProvenanceValidationContext): Promise<ValidatedDsseProvenance | null> {
  if (!context.hmac_secret) return null
  if (!isPlainRecord(envelope)) return null
  const payloadType = String(envelope.payloadType || envelope.payload_type || "")
  if (payloadType !== PROVENANCE_PAYLOAD_TYPE) return null
  const payloadBytes = base64ToBytes(String(envelope.payload || ""))
  if (!payloadBytes) return null
  const payloadJson = new TextDecoder().decode(payloadBytes)
  let payload: any
  try { payload = JSON.parse(payloadJson) } catch { return null }
  if (!isPlainRecord(payload)) return null

  const transparency = isPlainRecord(envelope.transparency) ? envelope.transparency : {}
  const transparency_log_id = String(payload.transparency_log_id || transparency.log_id || envelope.transparency_log_id || "")
  const transparency_integrated_time = String(payload.transparency_integrated_time || transparency.integrated_time || envelope.transparency_integrated_time || "")
  if (!transparency_log_id || !transparency_integrated_time) return null

  if (String(payload.signer_identity || "") !== context.expected_signer_identity) return null
  if (String(payload.decision_id || "") !== context.decision_id) return null
  if (String(payload.validated_object_hash || "") !== context.validated_object_hash) return null
  if (String(payload.workflow_run_id || "") !== context.workflow_run_id) return null
  if (String(payload.workflow_sha || "") !== context.workflow_sha) return null
  if (String(payload.canonical_aeo_hash || "") !== context.canonical_aeo_hash) return null

  const federation = isPlainRecord(payload.federation) ? payload.federation : null
  if (federation && (String(federation.ambiguous_lineage || "") === "true" || (federation as any).ambiguous_lineage === true || String(federation.remote_legitimacy || "") === "true" || (federation as any).remote_legitimacy === true || String(federation.local_authority || "") === "true" || (federation as any).local_authority === true)) return null

  const canonicalPayload = canonicalProvenancePayload({
    decision_id: context.decision_id,
    validated_object_hash: context.validated_object_hash,
    workflow_run_id: context.workflow_run_id,
    workflow_sha: context.workflow_sha,
    canonical_aeo_hash: context.canonical_aeo_hash,
    signer_identity: context.expected_signer_identity,
    transparency_log_id,
    transparency_integrated_time,
    federation: federation || null
  })
  const canonicalPayloadString = canonicalize(canonicalPayload)
  if (payloadJson !== canonicalPayloadString) return null

  const signatures = Array.isArray((envelope as any).signatures) ? (envelope as any).signatures : []
  const matching = signatures.find((signature: any) => isPlainRecord(signature) && String(signature.keyid || signature.signer_identity || "") === context.expected_signer_identity)
  if (!matching) return null
  const providedSignature = base64ToBytes(String(matching.sig || matching.signature || ""))
  if (!providedSignature) return null
  const pae = dssePreAuthenticationEncoding(PROVENANCE_PAYLOAD_TYPE, payloadBytes)
  const expectedSignature = await hmacSha256(context.hmac_secret, pae)
  if (!constantTimeEqual(providedSignature, expectedSignature)) return null

  return {
    envelope_hash: await sha256Hex(canonicalize(envelope)),
    payload_hash: await sha256Hex(canonicalPayloadString),
    payload_type: PROVENANCE_PAYLOAD_TYPE,
    signer_identity: context.expected_signer_identity,
    decision_id: context.decision_id,
    validated_object_hash: context.validated_object_hash,
    workflow_run_id: context.workflow_run_id,
    workflow_sha: context.workflow_sha,
    canonical_aeo_hash: context.canonical_aeo_hash,
    transparency_log_id,
    transparency_integrated_time
  }
}

async function validateRequestProvenanceAttestation(env: Env, input: any, context: DsseProvenanceValidationContext): Promise<{ ok: true, attestation: ValidatedDsseProvenance | null } | { ok: false, reason: string, drift_class: DriftClass, payload: Record<string, unknown> }> {
  const envelope = envelopeFromInput(input)
  if (!envelope) return { ok: true, attestation: null }
  const attestation = await validateDsseProvenanceEnvelope(envelope, context)
  if (!attestation) return { ok: false, reason: "invalid_provenance_attestation", drift_class: "attestation_drift", payload: { indicator: "cryptographic_provenance_invalid" } }
  const replay = await env.DB.prepare(`SELECT attestation_id,envelope_hash,workflow_run_id,decision_id,validated_object_hash,signer_identity,status FROM attestation_registry WHERE envelope_hash=?1 OR workflow_run_id=?2 OR (decision_id=?3 AND validated_object_hash=?4) LIMIT 1`).bind(attestation.envelope_hash, attestation.workflow_run_id, attestation.decision_id, attestation.validated_object_hash).first<any>()
  if (replay) return { ok: false, reason: "replayed_attestation", drift_class: "replay_drift", payload: { indicator: "attestation_replay", envelope_hash: attestation.envelope_hash, workflow_run_id: attestation.workflow_run_id } }
  return { ok: true, attestation }
}

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
      `CREATE TABLE IF NOT EXISTS attestation_registry (attestation_id TEXT PRIMARY KEY, envelope_hash TEXT NOT NULL, payload_hash TEXT NOT NULL, payload_type TEXT NOT NULL, signer_identity TEXT NOT NULL, decision_id TEXT NOT NULL, validated_object_hash TEXT NOT NULL, workflow_run_id TEXT NOT NULL, workflow_sha TEXT NOT NULL, canonical_aeo_hash TEXT NOT NULL, transparency_log_id TEXT NOT NULL, transparency_integrated_time TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(envelope_hash), UNIQUE(workflow_run_id), UNIQUE(decision_id, validated_object_hash))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_envelope_hash_unique ON attestation_registry(envelope_hash)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_workflow_run_unique ON attestation_registry(workflow_run_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_decision_object_unique ON attestation_registry(decision_id, validated_object_hash)`,
      `CREATE TABLE IF NOT EXISTS observability_registry (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, decision_id TEXT, authority_id TEXT, execution_id TEXT, proof_id TEXT, severity TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_observability_decision ON observability_registry(decision_id)`,
      `CREATE INDEX IF NOT EXISTS idx_observability_execution ON observability_registry(execution_id)`,
      `CREATE INDEX IF NOT EXISTS idx_observability_type ON observability_registry(event_type)`,
      `CREATE TABLE IF NOT EXISTS drift_registry (drift_id TEXT PRIMARY KEY, drift_class TEXT NOT NULL, severity TEXT NOT NULL, decision_id TEXT, execution_id TEXT, payload TEXT NOT NULL, detected_by TEXT NOT NULL, resolution_status TEXT NOT NULL, created_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS federated_reconciliation_registry (reconciliation_id TEXT PRIMARY KEY, runtime_id TEXT NOT NULL, remote_runtime_id TEXT NOT NULL, classification TEXT NOT NULL, validated_object_hash TEXT NOT NULL, reconciliation_merkle_root TEXT NOT NULL, bundle_hash TEXT NOT NULL, verification_status TEXT NOT NULL, drift_class TEXT, created_at TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS idx_federated_reconciliation_runtime_hash ON federated_reconciliation_registry(runtime_id, remote_runtime_id, validated_object_hash)`
    ]
    for (const s of stmts) await env.DB.prepare(s).run()
    await ensureRequiredSchemaColumns(env)
    if (options.stabilizeProofRegistry === false) return
    await quarantineHistoricalProofDuplicates(env)
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_decision_hash_unique ON proof_registry(decision_id, validated_object_hash)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_registry_workflow_run_unique ON proof_registry(workflow_run_id)`).run()
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_proof_registry_provenance ON proof_registry(repository, branch, pull_request_id, merge_commit_sha, workflow_run_id)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_registry_workflow_run_unique ON execution_registry(workflow_run_id)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_envelope_hash_unique ON attestation_registry(envelope_hash)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_workflow_run_unique ON attestation_registry(workflow_run_id)`).run()
    await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_attestation_registry_decision_object_unique ON attestation_registry(decision_id, validated_object_hash)`).run()
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

type ReconciliationRegistry = typeof CANONICAL_RECONCILIATION_REGISTRY_ORDER[number]
type ReconciliationStatus = "VALID_RECONCILIATION" | "INVALID_RECONCILIATION" | "NULL"
type ReconciliationAnchor = {
  session_id?: string
  continuity_id?: string
  decision_id?: string
  execution_id?: string
  proof_id?: string
  validated_object_hash?: string
  invocation_nonce?: string
}
type ReconciliationTraceEntry = {
  registry: ReconciliationRegistry
  canonical_traversal_position: number
  reconciliation_depth: number
  lookup_key: string
  row_count: number
  lineage_hash?: string
}
type ReconciliationDrift = {
  drift_id: string
  drift_class: DriftClass
  lineage_anchor: string
  registry_origin: ReconciliationRegistry
  detected_at: string
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  deterministic_trace: ReconciliationTraceEntry[]
}
type ReconciliationResult = {
  status: ReconciliationStatus
  result: ReconciliationStatus
  lineage_anchor: string
  canonical_registry_ordering: readonly ReconciliationRegistry[]
  recursion_depth: number
  deterministic_traversal_trace: ReconciliationTraceEntry[]
  drift_classifications: ReconciliationDrift[]
}

function reconciliationAnchorKey(anchor: ReconciliationAnchor): string {
  return canonicalize({
    continuity_id: String(anchor.continuity_id || ""),
    decision_id: String(anchor.decision_id || ""),
    execution_id: String(anchor.execution_id || ""),
    invocation_nonce: String(anchor.invocation_nonce || ""),
    proof_id: String(anchor.proof_id || ""),
    session_id: String(anchor.session_id || ""),
    validated_object_hash: String(anchor.validated_object_hash || "")
  })
}

async function reconciliationDriftId(drift_class: DriftClass, registry: ReconciliationRegistry, lineage_anchor: string, trace: ReconciliationTraceEntry[]): Promise<string> {
  return sha256Hex(canonicalize({ drift_class, registry, lineage_anchor, trace }))
}

async function reconciliationInvalid(
  drift_class: DriftClass,
  registry: ReconciliationRegistry,
  anchor: ReconciliationAnchor,
  trace: ReconciliationTraceEntry[],
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "HIGH"
): Promise<ReconciliationResult> {
  const lineage_anchor = reconciliationAnchorKey(anchor)
  const drift: ReconciliationDrift = {
    drift_id: await reconciliationDriftId(drift_class, registry, lineage_anchor, trace),
    drift_class,
    lineage_anchor,
    registry_origin: registry,
    detected_at: "DETERMINISTIC_RECONCILIATION_TRAVERSAL",
    severity,
    deterministic_trace: trace.map((entry) => ({ ...entry }))
  }
  return {
    status: "INVALID_RECONCILIATION",
    result: "NULL",
    lineage_anchor,
    canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER,
    recursion_depth: trace.length,
    deterministic_traversal_trace: trace.map((entry) => ({ ...entry })),
    drift_classifications: [drift]
  }
}

function reconciliationValid(anchor: ReconciliationAnchor, trace: ReconciliationTraceEntry[]): ReconciliationResult {
  return {
    status: "VALID_RECONCILIATION",
    result: "VALID_RECONCILIATION",
    lineage_anchor: reconciliationAnchorKey(anchor),
    canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER,
    recursion_depth: trace.length,
    deterministic_traversal_trace: trace.map((entry) => ({ ...entry })),
    drift_classifications: []
  }
}

function reconciliationNull(anchor: ReconciliationAnchor, trace: ReconciliationTraceEntry[] = []): ReconciliationResult {
  return {
    status: "NULL",
    result: "NULL",
    lineage_anchor: reconciliationAnchorKey(anchor),
    canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER,
    recursion_depth: trace.length,
    deterministic_traversal_trace: trace.map((entry) => ({ ...entry })),
    drift_classifications: []
  }
}

function reconciliationLookup(anchor: ReconciliationAnchor, context: Record<string, any>, registry: ReconciliationRegistry): { sql: string, bind: string[], lookup_key: string } {
  const session_id = String(context.session?.session_id || anchor.session_id || "")
  const continuity_id = String(context.continuity?.continuity_id || anchor.continuity_id || "")
  const decision_id = String(context.authority?.decision_id || anchor.decision_id || "")
  const validated_object_hash = String(context.aeo?.validated_object_hash || anchor.validated_object_hash || "")
  const execution_id = String(context.execution?.execution_id || anchor.execution_id || "")
  const invocation_nonce = String(context.validation?.invocation_nonce || context.execution?.invocation_nonce || anchor.invocation_nonce || "")
  const proof_id = String(anchor.proof_id || "")
  switch (registry) {
    case "session_registry":
      return session_id
        ? { sql: `SELECT * FROM session_registry WHERE session_id=?1 ORDER BY created_at ASC, session_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [session_id], lookup_key: session_id }
        : { sql: `SELECT * FROM session_registry WHERE continuity_status='ACTIVE' ORDER BY created_at ASC, session_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [], lookup_key: "ACTIVE" }
    case "continuity_registry":
      return continuity_id
        ? { sql: `SELECT * FROM continuity_registry WHERE continuity_id=?1 ORDER BY issued_at ASC, continuity_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [continuity_id], lookup_key: continuity_id }
        : { sql: `SELECT * FROM continuity_registry WHERE session_id=?1 ORDER BY issued_at ASC, continuity_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [session_id], lookup_key: session_id }
    case "authority_registry":
      return decision_id
        ? { sql: `SELECT * FROM authority_registry WHERE decision_id=?1 ORDER BY created_at ASC, authority_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [decision_id], lookup_key: decision_id }
        : { sql: `SELECT * FROM authority_registry WHERE session_id=?1 AND continuity_id=?2 ORDER BY created_at ASC, authority_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [session_id, continuity_id], lookup_key: `${session_id}:${continuity_id}` }
    case "aeo_registry":
      return { sql: `SELECT * FROM aeo_registry WHERE decision_id=?1 ORDER BY created_at ASC, aeo_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [decision_id], lookup_key: decision_id }
    case "validation_registry":
      return { sql: `SELECT * FROM validation_registry WHERE decision_id=?1 AND validated_object_hash=?2 ORDER BY created_at ASC, validation_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [decision_id, validated_object_hash], lookup_key: `${decision_id}:${validated_object_hash}` }
    case "execution_registry":
      return execution_id
        ? { sql: `SELECT * FROM execution_registry WHERE execution_id=?1 ORDER BY created_at ASC, execution_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [execution_id], lookup_key: execution_id }
        : { sql: `SELECT * FROM execution_registry WHERE decision_id=?1 AND validated_object_hash=?2 ORDER BY created_at ASC, execution_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [decision_id, validated_object_hash], lookup_key: `${decision_id}:${validated_object_hash}` }
    case "proof_registry":
      return proof_id
        ? { sql: `SELECT * FROM proof_registry WHERE proof_id=?1 ORDER BY created_at ASC, proof_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [proof_id], lookup_key: proof_id }
        : { sql: `SELECT * FROM proof_registry WHERE execution_id=?1 AND decision_id=?2 AND validated_object_hash=?3 ORDER BY created_at ASC, proof_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [execution_id, decision_id, validated_object_hash], lookup_key: `${execution_id}:${decision_id}:${validated_object_hash}` }
    case "invocation_registry":
      return { sql: `SELECT * FROM invocation_registry WHERE decision_id=?1 AND validated_object_hash=?2 AND invocation_nonce=?3 ORDER BY created_at ASC, invocation_nonce ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [decision_id, validated_object_hash, invocation_nonce], lookup_key: `${decision_id}:${validated_object_hash}:${invocation_nonce}` }
    case "preo_registry":
      return { sql: `SELECT * FROM preo_registry WHERE decision_id=?1 AND reviewed_hash=?2 ORDER BY created_at ASC, preo_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`, bind: [decision_id, validated_object_hash], lookup_key: `${decision_id}:${validated_object_hash}` }
  }
}

async function readReconciliationRows(env: Env, anchor: ReconciliationAnchor, context: Record<string, any>, registry: ReconciliationRegistry): Promise<{ rows: any[], lookup_key: string }> {
  const lookup = reconciliationLookup(anchor, context, registry)
  const stmt = env.DB.prepare(lookup.sql).bind(...lookup.bind)
  const result = await stmt.all<any>()
  return { rows: Array.isArray(result?.results) ? result.results : [], lookup_key: lookup.lookup_key }
}

async function verifyContinuityAncestryReadOnly(env: Env, continuity: any, session: any): Promise<"VALID" | DriftClass> {
  const visited = new Set<string>()
  let current: any = continuity
  let depth = 0
  while (current) {
    const current_id = String(current.continuity_id || "")
    if (!current_id || visited.has(current_id)) return "recursive_ancestry_drift"
    visited.add(current_id)
    depth += 1
    if (depth > RECONCILIATION_MAX_RECURSION_DEPTH) return "traversal_instability_drift"
    if (String(current.session_id || "") !== String(session.session_id || "")) return "recursive_ancestry_drift"
    if (String(current.identity_id || "") !== String(session.identity_id || "")) return "recursive_ancestry_drift"
    if (String(current.status || "") !== "ACTIVE" || current.revoked_at) return "revocation_propagation_drift"
    if (isExpired(String(current.expires_at || ""))) return "revocation_propagation_drift"
    let canonical: any
    try { canonical = JSON.parse(String(current.canonical_continuity || "{}")) } catch { return "recursive_ancestry_drift" }
    const actualHash = await continuityHash(canonical)
    if (actualHash !== String(current.continuity_hash || "") || actualHash !== String(canonical.continuity_hash || "")) return "recursive_ancestry_drift"
    const duplicateHash = await env.DB.prepare(`SELECT continuity_id FROM continuity_registry WHERE continuity_hash=?1 ORDER BY continuity_id ASC LIMIT ${RECONCILIATION_ROW_LIMIT}`).bind(String(current.continuity_hash || "")).all<any>()
    if ((duplicateHash?.results || []).length > 1) return "duplicate_lineage_hash_drift"
    const canonicalParent = canonical.parent_continuity_id ? String(canonical.parent_continuity_id) : ""
    const storedParent = current.parent_continuity_id ? String(current.parent_continuity_id) : ""
    if (canonicalParent !== storedParent) return "recursive_ancestry_drift"
    if (!canonicalParent) return "VALID"
    current = await env.DB.prepare(`SELECT * FROM continuity_registry WHERE continuity_id=?1`).bind(canonicalParent).first<any>()
    if (!current) return "orphan_legitimacy_object_drift"
  }
  return "orphan_legitimacy_object_drift"
}

async function verifyReconciliationRegistryRow(env: Env, registry: ReconciliationRegistry, row: any, context: Record<string, any>): Promise<"VALID" | DriftClass> {
  switch (registry) {
    case "session_registry":
      if (String(row.continuity_status || "") !== "ACTIVE" || isExpired(String(row.expires_at || ""))) return "revocation_propagation_drift"
      context.session = row
      return "VALID"
    case "continuity_registry": {
      if (!context.session) return "orphan_legitimacy_object_drift"
      const ancestry = await verifyContinuityAncestryReadOnly(env, row, context.session)
      if (ancestry !== "VALID") return ancestry
      context.continuity = row
      return "VALID"
    }
    case "authority_registry":
      if (!context.session || !context.continuity) return "orphan_legitimacy_object_drift"
      if (String(row.session_id || "") !== String(context.session.session_id || "")) return "recursive_ancestry_drift"
      if (String(row.continuity_id || "") !== String(context.continuity.continuity_id || "")) return "recursive_ancestry_drift"
      if (String(row.identity_id || "") !== String(context.session.identity_id || "")) return "recursive_ancestry_drift"
      if (["REVOKED", "EXPIRED"].includes(String(row.status || ""))) return "revocation_propagation_drift"
      context.authority = row
      return "VALID"
    case "aeo_registry": {
      if (!context.authority) return "orphan_legitimacy_object_drift"
      if (String(row.authority_id || "") !== String(context.authority.authority_id || "")) return "recursive_ancestry_drift"
      if (String(row.continuity_id || "") !== String(context.authority.continuity_id || "")) return "recursive_ancestry_drift"
      let parsed: any
      try { parsed = JSON.parse(String(row.canonical_aeo || "{}")) } catch { return "recursive_ancestry_drift" }
      const canonicalAeo = toCanonicalAeo(parsed)
      const actualHash = canonicalAeo ? await sha256Hex(canonicalize(canonicalAeo)) : ""
      if (!canonicalAeo || actualHash !== String(row.validated_object_hash || "")) return "recursive_ancestry_drift"
      context.aeo = row
      return "VALID"
    }
    case "validation_registry":
      if (!context.session || !context.continuity || !context.aeo) return "orphan_legitimacy_object_drift"
      if (String(row.session_id || "") !== String(context.session.session_id || "")) return "recursive_ancestry_drift"
      if (String(row.continuity_id || "") !== String(context.continuity.continuity_id || "")) return "recursive_ancestry_drift"
      if (String(row.validated_object_hash || "") !== String(context.aeo.validated_object_hash || "")) return "recursive_ancestry_drift"
      if (String(row.status || "") !== "VALID" || String(row.result || "") !== "VALID") return "replay_chain_drift"
      context.validation = row
      return "VALID"
    case "execution_registry":
      if (!context.validation) return "orphan_legitimacy_object_drift"
      if (String(row.session_id || "") !== String(context.validation.session_id || "")) return "recursive_ancestry_drift"
      if (String(row.continuity_id || "") !== String(context.validation.continuity_id || "")) return "recursive_ancestry_drift"
      if (String(row.decision_id || "") !== String(context.validation.decision_id || "")) return "recursive_ancestry_drift"
      if (String(row.validated_object_hash || "") !== String(context.validation.validated_object_hash || "")) return "recursive_ancestry_drift"
      if (String(row.invocation_nonce || "") !== String(context.validation.invocation_nonce || "")) return "replay_chain_drift"
      if (String(row.status || "") !== "EXECUTED") return "proof_lineage_drift"
      context.execution = row
      return "VALID"
    case "proof_registry": {
      if (!context.execution || !context.continuity || !context.authority) return "orphan_legitimacy_object_drift"
      if (String(row.execution_id || "") !== String(context.execution.execution_id || "")) return "proof_lineage_drift"
      if (String(row.decision_id || "") !== String(context.execution.decision_id || "")) return "proof_lineage_drift"
      if (String(row.validated_object_hash || "") !== String(context.execution.validated_object_hash || "")) return "proof_lineage_drift"
      if (String(row.continuity_id || "") !== String(context.continuity.continuity_id || "")) return "proof_lineage_drift"
      if (String(row.continuity_hash || "") !== String(context.continuity.continuity_hash || "")) return "proof_lineage_drift"
      let authorityLineage: any = null
      let executionLineage: any = null
      try { authorityLineage = JSON.parse(String(row.authority_lineage || "{}")); executionLineage = JSON.parse(String(row.execution_lineage || "{}")) } catch { return "proof_lineage_drift" }
      if (String(authorityLineage.authority_id || "") !== String(context.authority.authority_id || "")) return "proof_lineage_drift"
      if (String(executionLineage.execution_id || "") !== String(context.execution.execution_id || "")) return "proof_lineage_drift"
      context.proof = row
      return "VALID"
    }
    case "invocation_registry":
      if (!context.validation || !context.execution) return "orphan_legitimacy_object_drift"
      if (String(row.decision_id || "") !== String(context.validation.decision_id || "")) return "replay_chain_drift"
      if (String(row.validated_object_hash || "") !== String(context.validation.validated_object_hash || "")) return "replay_chain_drift"
      if (String(row.invocation_nonce || "") !== String(context.validation.invocation_nonce || "")) return "replay_chain_drift"
      if (String(row.continuity_id || "") !== String(context.validation.continuity_id || "")) return "replay_chain_drift"
      if (String(row.status || "") !== "EXECUTED") return "replay_chain_drift"
      context.invocation = row
      return "VALID"
    case "preo_registry":
      if (!context.authority || !context.aeo) return "orphan_legitimacy_object_drift"
      if (String(row.decision_id || "") !== String(context.authority.decision_id || "")) return "preo_ancestry_drift"
      if (String(row.authority_id || "") !== String(context.authority.authority_id || "")) return "preo_ancestry_drift"
      if (String(row.continuity_id || "") !== String(context.authority.continuity_id || "")) return "preo_ancestry_drift"
      if (String(row.reviewed_hash || "") !== String(context.aeo.validated_object_hash || "")) return "preo_ancestry_drift"
      if (String(row.status || "") !== "PREO_VALID") return "preo_ancestry_drift"
      context.preo = row
      return "VALID"
  }
}

async function deterministicRecursiveReconciliationTraversal(env: Env, anchor: ReconciliationAnchor): Promise<ReconciliationResult> {
  if (!hasDb(env)) return reconciliationNull(anchor)
  const context: Record<string, any> = {}
  const trace: ReconciliationTraceEntry[] = []
  for (const registry of CANONICAL_RECONCILIATION_REGISTRY_ORDER) {
    if (trace.length >= RECONCILIATION_MAX_RECURSION_DEPTH) return reconciliationInvalid("traversal_instability_drift", registry, anchor, trace, "CRITICAL")
    const { rows, lookup_key } = await readReconciliationRows(env, anchor, context, registry)
    const traceEntry: ReconciliationTraceEntry = {
      registry,
      canonical_traversal_position: CANONICAL_RECONCILIATION_REGISTRY_ORDER.indexOf(registry),
      reconciliation_depth: trace.length + 1,
      lookup_key,
      row_count: rows.length,
      lineage_hash: String(rows[0]?.continuity_hash || rows[0]?.validated_object_hash || rows[0]?.reviewed_hash || "")
    }
    trace.push(traceEntry)
    if (rows.length === 0) return reconciliationInvalid("orphan_legitimacy_object_drift", registry, anchor, trace)
    if (rows.length > 1) return reconciliationInvalid("traversal_instability_drift", registry, anchor, trace)
    const rowDrift = await verifyReconciliationRegistryRow(env, registry, rows[0], context)
    if (rowDrift !== "VALID") return reconciliationInvalid(rowDrift, registry, anchor, trace)
  }
  return reconciliationValid(anchor, trace)
}


type ReconciliationScheduleAnchor = ReconciliationAnchor & {
  canonical_schedule_position: number
  scheduled_registry: "proof_registry"
}
type ReconciliationScheduleWindow = {
  status: "SCHEDULED_RECONCILIATION" | "NULL"
  scheduler_mode: "deterministic_read_only_traversal"
  window_id: string
  batch_limit: number
  ordered_by: readonly string[]
  read_only: true
  replay_neutral: true
  canonical_registry_ordering: readonly ReconciliationRegistry[]
  anchors: ReconciliationScheduleAnchor[]
}
type ReconciliationSummaryObject = {
  reconciliation_id: string
  reconciliation_timestamp: string
  status: ReconciliationStatus
  lineage_anchor: string
  traversal_trace: ReconciliationTraceEntry[]
  drift_classifications: ReconciliationDrift[]
  registry_lineage_anchors: string[]
  registry_integrity_summary: {
    registries_checked: number
    drift_count: number
    bounded_recursion_depth: number
    canonical_registry_ordering: readonly ReconciliationRegistry[]
  }
}
type FederatedLineageEvidence = {
  runtime_id: string
  trust_domain: "local_runtime" | "foreign_runtime" | "portable_proof_bundle"
  lineage_hash: string
  decision_id: string
  validated_object_hash: string
  invocation_nonce: string
  proof_id: string
  revocation_state: "ACTIVE" | "REVOKED" | "EXPIRED" | "UNKNOWN"
  parent_lineage_hash?: string
}
type FederatedLineageVerification = {
  status: "FEDERATED_LINEAGE_OBSERVED" | "NULL"
  drift_class?: DriftClass
  local_runtime_id: string
  remote_runtime_id: string
  trust_domain_boundary: "foreign_lineage_is_evidence_not_authority"
  bounded_federation_depth: number
  replay_isolation: "remote_replay_state_not_consumed"
  lineage_continuity_hash?: string
}
type FederatedRevocationEvidence = {
  runtime_id: string
  remote_runtime_id: string
  continuity_id: string
  decision_id: string
  validated_object_hash: string
  revocation_class: string
  revocation_reason: string
  lineage_hash: string
  reconciliation_merkle_root: string
  attestation_hash: string
  observed_at: string
}
type FederatedRevocationEvidenceEnvelope = {
  evidence_type: "FederatedRevocationEvidence"
  evidence_hash: string
  evidence: FederatedRevocationEvidence
  replay_neutral: true
  read_only: true
  mutation_capable: false
  federation_boundary: "portable_evidence_not_portable_authority"
  deterministic_serialization: true
  exact_object_bound: true
  remote_authority_inherited: false
  remote_execution_legitimacy: false
  replay_state_consumed: false
}
type FederatedRevocationVerification = {
  status: "FEDERATED_REVOCATION_OBSERVED" | "NULL"
  result: "FEDERATED_REVOCATION_OBSERVED" | "NULL"
  drift_class?: DriftClass
  fate?: "federated_revocation_identity_mismatch" | "federated_revocation_replay_collision" | "federated_revocation_without_lineage" | "federated_remote_revocation_authority_inference" | "federated_checkpoint_revocation_divergence" | "federated_expired_lineage_visibility_corruption"
  evidence_hash?: string
  envelope?: FederatedRevocationEvidenceEnvelope
  observability_only: true
  local_validation_required: true
  remote_authority_inherited: false
  remote_execution_legitimacy: false
  replay_state_consumed: false
  replay_neutral: true
}
type PortableReconciliationEnvelope = {
  media_type: "application/vnd.mindshift.reconciliation+jcs"
  dsse_payload_type: "application/vnd.mindshift.reconciliation.v1+json"
  canonicalization: "JCS"
  content_addressed_lineage_hash: string
  exact_object_hash: string
  payload: Record<string, unknown>
}

function reconciliationAnchorFromRequest(url: URL): ReconciliationAnchor {
  return {
    session_id: url.searchParams.get("session_id") || undefined,
    continuity_id: url.searchParams.get("continuity_id") || undefined,
    decision_id: url.searchParams.get("decision_id") || undefined,
    execution_id: url.searchParams.get("execution_id") || undefined,
    proof_id: url.searchParams.get("proof_id") || undefined,
    validated_object_hash: url.searchParams.get("validated_object_hash") || undefined,
    invocation_nonce: url.searchParams.get("invocation_nonce") || undefined
  }
}

async function deterministicReconciliationId(kind: string, payload: unknown): Promise<string> {
  return sha256Hex(canonicalize({ kind, payload }))
}

async function deterministicReconciliationSchedule(env: Env): Promise<ReconciliationScheduleWindow> {
  const ordered_by = [
    "proof_registry.created_at ASC",
    "proof_registry.decision_id ASC",
    "proof_registry.execution_id ASC",
    "proof_registry.proof_id ASC"
  ] as const
  if (!hasDb(env)) {
    return {
      status: "NULL",
      scheduler_mode: "deterministic_read_only_traversal",
      window_id: await deterministicReconciliationId("schedule", { anchors: [], ordered_by }),
      batch_limit: RECONCILIATION_SCHEDULER_BATCH_LIMIT,
      ordered_by,
      read_only: true,
      replay_neutral: true,
      canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER,
      anchors: []
    }
  }
  const result = await env.DB.prepare(`SELECT session_id,continuity_id,decision_id,execution_id,proof_id,validated_object_hash FROM proof_registry ORDER BY created_at ASC, decision_id ASC, execution_id ASC, proof_id ASC LIMIT ${RECONCILIATION_SCHEDULER_BATCH_LIMIT}`).all<any>()
  const anchors = (Array.isArray(result?.results) ? result.results : []).map((row, index): ReconciliationScheduleAnchor => ({
    canonical_schedule_position: index + 1,
    scheduled_registry: "proof_registry",
    session_id: String(row.session_id || ""),
    continuity_id: String(row.continuity_id || ""),
    decision_id: String(row.decision_id || ""),
    execution_id: String(row.execution_id || ""),
    proof_id: String(row.proof_id || ""),
    validated_object_hash: String(row.validated_object_hash || "")
  }))
  const windowCore = { anchors, batch_limit: RECONCILIATION_SCHEDULER_BATCH_LIMIT, ordered_by }
  return {
    status: anchors.length ? "SCHEDULED_RECONCILIATION" : "NULL",
    scheduler_mode: "deterministic_read_only_traversal",
    window_id: await deterministicReconciliationId("schedule", windowCore),
    batch_limit: RECONCILIATION_SCHEDULER_BATCH_LIMIT,
    ordered_by,
    read_only: true,
    replay_neutral: true,
    canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER,
    anchors
  }
}

async function reconciliationSummaryObject(result: ReconciliationResult, reconciliation_timestamp: string): Promise<ReconciliationSummaryObject> {
  const registry_lineage_anchors = result.deterministic_traversal_trace.map((entry) => canonicalize({ registry: entry.registry, lookup_key: entry.lookup_key, lineage_hash: entry.lineage_hash || "" }))
  const stable = {
    status: result.status,
    lineage_anchor: result.lineage_anchor,
    traversal_trace: result.deterministic_traversal_trace,
    drift_classifications: result.drift_classifications.map((drift) => drift.drift_class),
    registry_lineage_anchors
  }
  return {
    reconciliation_id: await deterministicReconciliationId("report", stable),
    reconciliation_timestamp,
    status: result.status,
    lineage_anchor: result.lineage_anchor,
    traversal_trace: result.deterministic_traversal_trace.map((entry) => ({ ...entry })),
    drift_classifications: result.drift_classifications.map((drift) => ({ ...drift, deterministic_trace: drift.deterministic_trace.map((entry) => ({ ...entry })) })),
    registry_lineage_anchors,
    registry_integrity_summary: {
      registries_checked: result.deterministic_traversal_trace.length,
      drift_count: result.drift_classifications.length,
      bounded_recursion_depth: result.recursion_depth,
      canonical_registry_ordering: CANONICAL_RECONCILIATION_REGISTRY_ORDER
    }
  }
}

async function portableReconciliationEnvelope(payload: Record<string, unknown>): Promise<PortableReconciliationEnvelope> {
  const exact_object_hash = await sha256Hex(canonicalize(payload))
  return {
    media_type: "application/vnd.mindshift.reconciliation+jcs",
    dsse_payload_type: "application/vnd.mindshift.reconciliation.v1+json",
    canonicalization: "JCS",
    content_addressed_lineage_hash: await sha256Hex(canonicalize({ exact_object_hash, lineage_anchor: String(payload.lineage_anchor || "") })),
    exact_object_hash,
    payload: canonicalRecord(payload)
  }
}


function canonicalFederatedRevocationEvidence(input: any): FederatedRevocationEvidence | null {
  const evidence = {
    runtime_id: String(input?.runtime_id || ""),
    remote_runtime_id: String(input?.remote_runtime_id || ""),
    continuity_id: String(input?.continuity_id || ""),
    decision_id: String(input?.decision_id || ""),
    validated_object_hash: String(input?.validated_object_hash || ""),
    revocation_class: String(input?.revocation_class || ""),
    revocation_reason: String(input?.revocation_reason || ""),
    lineage_hash: String(input?.lineage_hash || ""),
    reconciliation_merkle_root: String(input?.reconciliation_merkle_root || ""),
    attestation_hash: String(input?.attestation_hash || ""),
    observed_at: String(input?.observed_at || "")
  }
  if (Object.values(evidence).some((value) => !value)) return null
  if (evidence.runtime_id === evidence.remote_runtime_id) return null
  if (![evidence.validated_object_hash, evidence.lineage_hash, evidence.reconciliation_merkle_root, evidence.attestation_hash].every((value) => /^[a-f0-9]{64}$/.test(value))) return null
  return Object.freeze(evidence)
}

async function deterministicFederatedRevocationEvidenceHash(evidence: FederatedRevocationEvidence): Promise<string> {
  return sha256Hex(canonicalize({ evidence_type: "FederatedRevocationEvidence", deterministic_serialization: true, exact_object_bound: true, evidence }))
}

async function replayNeutralFederatedRevocationEvidenceEnvelope(evidence: FederatedRevocationEvidence): Promise<FederatedRevocationEvidenceEnvelope> {
  const evidence_hash = await deterministicFederatedRevocationEvidenceHash(evidence)
  return {
    evidence_type: "FederatedRevocationEvidence",
    evidence_hash,
    evidence,
    replay_neutral: true,
    read_only: true,
    mutation_capable: false,
    federation_boundary: "portable_evidence_not_portable_authority",
    deterministic_serialization: true,
    exact_object_bound: true,
    remote_authority_inherited: false,
    remote_execution_legitimacy: false,
    replay_state_consumed: false
  }
}

async function classifyFederatedRevocationEvidence(input: any, expected: ReconciliationAnchor, checkpoint?: ReconciliationCheckpoint | null, local_runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<FederatedRevocationVerification> {
  const payload = isPlainRecord(input?.evidence) ? input.evidence : input
  const evidence = canonicalFederatedRevocationEvidence(payload)
  const nullResult = (drift_class: DriftClass, fate: NonNullable<FederatedRevocationVerification["fate"]>): FederatedRevocationVerification => ({ status: "NULL", result: "NULL", drift_class, fate, observability_only: true, local_validation_required: true, remote_authority_inherited: false, remote_execution_legitimacy: false, replay_state_consumed: false, replay_neutral: true })
  if (isPlainRecord(input) && ((input as any).remote_authority_inherited === true || (input as any).remote_execution_legitimacy === true || (input as any).local_revocation_authority === true || (input as any).mutation_capable === true)) return nullResult("federated_revocation_projection_drift", "federated_remote_revocation_authority_inference")
  if (!evidence) return nullResult("federated_revocation_divergence_drift", "federated_revocation_identity_mismatch")
  if (evidence.runtime_id !== local_runtime_id) return nullResult("federated_revocation_divergence_drift", "federated_revocation_identity_mismatch")
  if (!evidence.lineage_hash) return nullResult("federated_revocation_divergence_drift", "federated_revocation_without_lineage")
  if (expected.decision_id && evidence.decision_id !== expected.decision_id) return nullResult("federated_revocation_replay_drift", "federated_revocation_replay_collision")
  if (expected.validated_object_hash && evidence.validated_object_hash !== expected.validated_object_hash) return nullResult("federated_revocation_replay_drift", "federated_revocation_replay_collision")
  if (expected.continuity_id && evidence.continuity_id !== expected.continuity_id) return nullResult("federated_revocation_divergence_drift", "federated_revocation_identity_mismatch")
  if (checkpoint && evidence.reconciliation_merkle_root !== checkpoint.reconciliation_merkle_root) return nullResult("federated_checkpoint_revocation_drift", "federated_checkpoint_revocation_divergence")
  if (evidence.revocation_class === "EXPIRED" && !/^\d{4}-\d{2}-\d{2}T/.test(evidence.observed_at)) return nullResult("federated_expiration_visibility_drift", "federated_expired_lineage_visibility_corruption")
  const envelope = await replayNeutralFederatedRevocationEvidenceEnvelope(evidence)
  return { status: "FEDERATED_REVOCATION_OBSERVED", result: "FEDERATED_REVOCATION_OBSERVED", evidence_hash: envelope.evidence_hash, envelope, observability_only: true, local_validation_required: true, remote_authority_inherited: false, remote_execution_legitimacy: false, replay_state_consumed: false, replay_neutral: true }
}

async function federatedRevocationEvidenceFromResult(result: ReconciliationResult, checkpoint: ReconciliationCheckpoint, observed_at: string, remote_runtime_id = "mindshift-federated://observed-runtime"): Promise<FederatedRevocationEvidenceEnvelope | null> {
  const byRegistry = new Map(result.deterministic_traversal_trace.map((entry) => [entry.registry, entry]))
  const drift_reason = result.drift_classifications.find((drift) => String(drift.drift_class).includes("revocation"))?.drift_class || "observed_remote_revocation_state"
  const evidence = canonicalFederatedRevocationEvidence({
    runtime_id: LOCAL_FEDERATION_RUNTIME_ID,
    remote_runtime_id,
    continuity_id: String(byRegistry.get("continuity_registry")?.lookup_key || "continuity-observed"),
    decision_id: String(byRegistry.get("authority_registry")?.lookup_key || "decision-observed"),
    validated_object_hash: await sha256Hex(canonicalize(byRegistry.get("validation_registry") || byRegistry.get("aeo_registry") || null)),
    revocation_class: result.drift_classifications.some((drift) => drift.drift_class === "revocation_propagation_drift") ? "REVOKED" : "OBSERVED",
    revocation_reason: String(drift_reason),
    lineage_hash: await sha256Hex(canonicalize(result.deterministic_traversal_trace)),
    reconciliation_merkle_root: checkpoint.reconciliation_merkle_root,
    attestation_hash: await sha256Hex(canonicalize({ attestation: "federated_revocation_observability", checkpoint_id: checkpoint.checkpoint_id })),
    observed_at
  })
  return evidence ? replayNeutralFederatedRevocationEvidenceEnvelope(evidence) : null
}

async function verifyFederatedLineageContinuity(evidence: FederatedLineageEvidence[], local_runtime_id: string): Promise<FederatedLineageVerification> {
  const bounded_federation_depth = evidence.length
  if (!local_runtime_id || bounded_federation_depth === 0 || bounded_federation_depth > RECONCILIATION_MAX_RECURSION_DEPTH) {
    return { status: "NULL", drift_class: "federated_lineage_drift", local_runtime_id, remote_runtime_id: "", trust_domain_boundary: "foreign_lineage_is_evidence_not_authority", bounded_federation_depth, replay_isolation: "remote_replay_state_not_consumed" }
  }
  const [head, ...rest] = evidence
  if (head.trust_domain !== "local_runtime" || head.runtime_id !== local_runtime_id) {
    return { status: "NULL", drift_class: "foreign_ancestry_mismatch_drift", local_runtime_id, remote_runtime_id: String(head.runtime_id || ""), trust_domain_boundary: "foreign_lineage_is_evidence_not_authority", bounded_federation_depth, replay_isolation: "remote_replay_state_not_consumed" }
  }
  let previous = head
  for (const item of rest) {
    if (item.trust_domain === "local_runtime" || String(item.parent_lineage_hash || "") !== String(previous.lineage_hash || "")) {
      return { status: "NULL", drift_class: "federated_lineage_drift", local_runtime_id, remote_runtime_id: String(item.runtime_id || ""), trust_domain_boundary: "foreign_lineage_is_evidence_not_authority", bounded_federation_depth, replay_isolation: "remote_replay_state_not_consumed" }
    }
    if (item.decision_id !== previous.decision_id || item.validated_object_hash !== previous.validated_object_hash || item.invocation_nonce !== previous.invocation_nonce) {
      return { status: "NULL", drift_class: "federated_replay_discontinuity_drift", local_runtime_id, remote_runtime_id: String(item.runtime_id || ""), trust_domain_boundary: "foreign_lineage_is_evidence_not_authority", bounded_federation_depth, replay_isolation: "remote_replay_state_not_consumed" }
    }
    previous = item
  }
  return {
    status: "FEDERATED_LINEAGE_OBSERVED",
    local_runtime_id,
    remote_runtime_id: String(previous.runtime_id || ""),
    trust_domain_boundary: "foreign_lineage_is_evidence_not_authority",
    bounded_federation_depth,
    replay_isolation: "remote_replay_state_not_consumed",
    lineage_continuity_hash: await sha256Hex(canonicalize(evidence))
  }
}


type RemoteRuntimeClassification = "LOCAL_RUNTIME" | "FEDERATED_RUNTIME" | "EXTERNAL_REFERENCE" | "UNTRUSTED_RUNTIME" | "PORTABLE_EVIDENCE_ONLY"
type PortableLegitimacyBundle = {
  runtime_id: string
  reconciliation_id: string
  decision_id: string
  validated_object_hash: string
  proof_id: string
  execution_id: string
  invocation_nonce: string
  continuity_id: string
  authority_lineage_hash: string
  proof_lineage_hash: string
  replay_lineage_hash: string
  preo_lineage_hash: string
  attestation_hash: string
  reconciliation_merkle_root: string
  federation_boundary: string
  emitted_at: string
}
type ReconciliationMerkleNode = {
  position: number
  layer: "session" | "continuity" | "authority" | "AEO" | "validation" | "execution" | "proof" | "attestation" | "PREO"
  registry: string
  object_hash: string
  parent_hash: string
  node_hash: string
}
type ReconciliationCheckpoint = {
  checkpoint_id: string
  runtime_id: string
  reconciliation_merkle_root: string
  traversal_position: number
  deterministic_hash: string
  lineage_count: number
  replay_snapshot_hash: string
  drift_snapshot_hash: string
  revocation_snapshot_hash: string
  created_at: string
}
type ReconciliationWitnessEnvelope = {
  witness_id: string
  runtime_classification: RemoteRuntimeClassification
  authority_boundary: "portable_evidence_not_portable_authority"
  local_validation_required: true
  replay_neutral: true
  mutation_capable: false
  bundle_hash: string
  checkpoint_hash: string
}
type FederatedBundleVerification = {
  status: "FEDERATED_RECONCILIATION_OBSERVED" | "NULL"
  result: "FEDERATED_RECONCILIATION_OBSERVED" | "NULL"
  drift_class?: DriftClass
  runtime_classification: RemoteRuntimeClassification
  trust_semantics: "remote_evidence_can_narrow_acceptance_only"
  local_validation_required: true
  remote_authority_inherited: false
  remote_execution_legitimacy: false
  replay_state_consumed: false
  merkle_root?: string
  bundle_hash?: string
}

const RECONCILIATION_MERKLE_LAYERS: readonly ReconciliationMerkleNode["layer"][] = ["session", "continuity", "authority", "AEO", "validation", "execution", "proof", "attestation", "PREO"] as const

function classifyRemoteRuntime(runtime_id: string, local_runtime_id = LOCAL_FEDERATION_RUNTIME_ID): RemoteRuntimeClassification {
  const id = String(runtime_id || "")
  if (!id) return "UNTRUSTED_RUNTIME"
  if (id === local_runtime_id) return "LOCAL_RUNTIME"
  if (id.startsWith("spiffe://") || id.startsWith("mindshift-federated://")) return "FEDERATED_RUNTIME"
  if (id.startsWith("https://") || id.startsWith("urn:")) return "EXTERNAL_REFERENCE"
  return "PORTABLE_EVIDENCE_ONLY"
}

function canonicalPortableLegitimacyBundle(input: any): PortableLegitimacyBundle | null {
  const bundle = {
    runtime_id: String(input?.runtime_id || ""),
    reconciliation_id: String(input?.reconciliation_id || ""),
    decision_id: String(input?.decision_id || ""),
    validated_object_hash: String(input?.validated_object_hash || ""),
    proof_id: String(input?.proof_id || ""),
    execution_id: String(input?.execution_id || ""),
    invocation_nonce: String(input?.invocation_nonce || ""),
    continuity_id: String(input?.continuity_id || ""),
    authority_lineage_hash: String(input?.authority_lineage_hash || ""),
    proof_lineage_hash: String(input?.proof_lineage_hash || ""),
    replay_lineage_hash: String(input?.replay_lineage_hash || ""),
    preo_lineage_hash: String(input?.preo_lineage_hash || ""),
    attestation_hash: String(input?.attestation_hash || ""),
    reconciliation_merkle_root: String(input?.reconciliation_merkle_root || ""),
    federation_boundary: String(input?.federation_boundary || ""),
    emitted_at: String(input?.emitted_at || "")
  }
  if (Object.values(bundle).some((value) => !value)) return null
  if (bundle.federation_boundary !== "portable_evidence_not_portable_authority") return null
  return Object.freeze(bundle)
}

async function reconciliationMerkleEvidence(result: ReconciliationResult): Promise<{ root: string, nodes: ReconciliationMerkleNode[] }> {
  const nodes: ReconciliationMerkleNode[] = []
  let parent_hash = await sha256Hex(canonicalize({ genesis: "federated_reconciliation", lineage_anchor: result.lineage_anchor }))
  for (let index = 0; index < RECONCILIATION_MERKLE_LAYERS.length; index++) {
    const layer = RECONCILIATION_MERKLE_LAYERS[index]
    const trace = result.deterministic_traversal_trace[index]
    const object_hash = await sha256Hex(canonicalize({ layer, trace: trace || null }))
    const node_hash = await sha256Hex(canonicalize({ layer, object_hash, parent_hash, position: index }))
    nodes.push({ position: index, layer, registry: String(trace?.registry || ""), object_hash, parent_hash, node_hash })
    parent_hash = node_hash
  }
  return { root: parent_hash, nodes }
}

async function deterministicReconciliationSnapshot(result: ReconciliationResult): Promise<Record<string, unknown>> {
  const merkle = await reconciliationMerkleEvidence(result)
  return canonicalRecord({
    authority_boundary: "portable_evidence_not_portable_authority",
    canonical_runtime_path: CANONICAL_RUNTIME_ROUTES,
    drift_classifications: result.drift_classifications.map((drift) => drift.drift_class).sort(),
    local_validation_required: true,
    merkle_nodes: merkle.nodes,
    reconciliation_merkle_root: merkle.root,
    replay_neutral: true,
    status: result.result,
    traversal_trace: result.deterministic_traversal_trace
  })
}

async function deterministicReconciliationCheckpoint(result: ReconciliationResult, created_at: string, runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<ReconciliationCheckpoint> {
  const snapshot = await deterministicReconciliationSnapshot(result)
  const replay_snapshot_hash = await sha256Hex(canonicalize({ replay_neutral: true, trace: result.deterministic_traversal_trace.filter((entry) => entry.registry === "invocation_registry") }))
  const drift_snapshot_hash = await sha256Hex(canonicalize(result.drift_classifications.map((drift) => drift.drift_class).sort()))
  const revocation_snapshot_hash = await sha256Hex(canonicalize({ replay_neutral: true, revocation_classes: result.drift_classifications.filter((drift) => String(drift.drift_class).includes("revocation") || String(drift.drift_class).includes("expiration")).map((drift) => drift.drift_class).sort() }))
  const deterministic_hash = await sha256Hex(canonicalize({ runtime_id, snapshot, replay_snapshot_hash, drift_snapshot_hash, revocation_snapshot_hash }))
  const reconciliation_merkle_root = String(snapshot.reconciliation_merkle_root || "")
  return {
    checkpoint_id: await sha256Hex(canonicalize({ runtime_id, reconciliation_merkle_root, deterministic_hash, created_at })),
    runtime_id,
    reconciliation_merkle_root,
    traversal_position: result.deterministic_traversal_trace.length,
    deterministic_hash,
    lineage_count: result.deterministic_traversal_trace.length,
    replay_snapshot_hash,
    drift_snapshot_hash,
    revocation_snapshot_hash,
    created_at
  }
}

async function portableLegitimacyBundleFromResult(result: ReconciliationResult, emitted_at: string, runtime_id = LOCAL_FEDERATION_RUNTIME_ID): Promise<PortableLegitimacyBundle | null> {
  const merkle = await reconciliationMerkleEvidence(result)
  const byRegistry = new Map(result.deterministic_traversal_trace.map((entry) => [entry.registry, entry]))
  const bundle = canonicalPortableLegitimacyBundle({
    runtime_id,
    reconciliation_id: await deterministicReconciliationId("federated_bundle", { runtime_id, root: merkle.root, anchor: result.lineage_anchor }),
    decision_id: String(byRegistry.get("authority_registry")?.lookup_key || ""),
    validated_object_hash: String(byRegistry.get("aeo_registry")?.lineage_hash || byRegistry.get("validation_registry")?.lineage_hash || ""),
    proof_id: String(byRegistry.get("proof_registry")?.lookup_key || "").split(":").at(-1) || "proof-observed",
    execution_id: String(byRegistry.get("execution_registry")?.lookup_key || ""),
    invocation_nonce: String(byRegistry.get("invocation_registry")?.lookup_key || "").split(":").at(-1) || "nonce-observed",
    continuity_id: String(byRegistry.get("continuity_registry")?.lookup_key || ""),
    authority_lineage_hash: await sha256Hex(canonicalize(byRegistry.get("authority_registry") || null)),
    proof_lineage_hash: await sha256Hex(canonicalize(byRegistry.get("proof_registry") || null)),
    replay_lineage_hash: await sha256Hex(canonicalize(byRegistry.get("invocation_registry") || null)),
    preo_lineage_hash: await sha256Hex(canonicalize(byRegistry.get("preo_registry") || null)),
    attestation_hash: await sha256Hex(canonicalize({ attestation: "observed", root: merkle.root })),
    reconciliation_merkle_root: merkle.root,
    federation_boundary: "portable_evidence_not_portable_authority",
    emitted_at
  })
  return bundle
}

async function verifyFederatedProofEnvelope(envelope: any, bundle: PortableLegitimacyBundle, hmac_secret?: string): Promise<boolean> {
  if (!isPlainRecord(envelope)) return false
  const payloadType = String(envelope.payloadType || envelope.payload_type || "")
  if (payloadType !== FEDERATED_RECONCILIATION_PAYLOAD_TYPE) return false
  const payloadBytes = base64ToBytes(String(envelope.payload || ""))
  if (!payloadBytes) return false
  const payloadJson = new TextDecoder().decode(payloadBytes)
  if (payloadJson !== canonicalize(bundle)) return false
  if (!hmac_secret) return true
  const signatures = Array.isArray((envelope as any).signatures) ? (envelope as any).signatures : []
  const provided = signatures.find((signature: any) => isPlainRecord(signature) && String(signature.keyid || "") === bundle.runtime_id)
  const signatureBytes = base64ToBytes(String(provided?.sig || provided?.signature || ""))
  if (!signatureBytes) return false
  const expected = await hmacSha256(hmac_secret, dssePreAuthenticationEncoding(FEDERATED_RECONCILIATION_PAYLOAD_TYPE, payloadBytes))
  return constantTimeEqual(signatureBytes, expected)
}

async function verifyFederatedLegitimacyBundle(input: any, expected: ReconciliationAnchor, local_runtime_id = LOCAL_FEDERATION_RUNTIME_ID, hmac_secret?: string): Promise<FederatedBundleVerification> {
  const payload = isPlainRecord(input?.payload) ? input.payload : input
  const bundle = canonicalPortableLegitimacyBundle(payload)
  const classification = classifyRemoteRuntime(String(bundle?.runtime_id || ""), local_runtime_id)
  const nullResult = (drift_class: DriftClass): FederatedBundleVerification => ({ status: "NULL", result: "NULL", drift_class, runtime_classification: classification, trust_semantics: "remote_evidence_can_narrow_acceptance_only", local_validation_required: true, remote_authority_inherited: false, remote_execution_legitimacy: false, replay_state_consumed: false })
  if (!bundle) return nullResult("federated_bundle_drift")
  if (classification === "UNTRUSTED_RUNTIME") return nullResult("federated_runtime_divergence_drift")
  if (canonicalize(payload) !== canonicalize(bundle)) return nullResult("federated_bundle_drift")
  if (expected.decision_id && bundle.decision_id !== expected.decision_id) return nullResult("federated_reconciliation_drift")
  if (expected.validated_object_hash && bundle.validated_object_hash !== expected.validated_object_hash) return nullResult("federated_exact_object_drift")
  if (expected.invocation_nonce && bundle.invocation_nonce !== expected.invocation_nonce) return nullResult("federated_replay_drift")
  if (expected.continuity_id && bundle.continuity_id !== expected.continuity_id) return nullResult("federated_continuity_drift")
  if (expected.execution_id && bundle.execution_id !== expected.execution_id) return nullResult("federated_reconciliation_drift")
  if (expected.proof_id && bundle.proof_id !== expected.proof_id) return nullResult("federated_attestation_drift")
  if (!/^[a-f0-9]{64}$/.test(bundle.reconciliation_merkle_root)) return nullResult("federated_merkle_drift")
  if (!/^[a-f0-9]{64}$/.test(bundle.attestation_hash)) return nullResult("federated_attestation_drift")
  if (!/^[a-f0-9]{64}$/.test(bundle.preo_lineage_hash)) return nullResult("federated_preo_drift")
  if (isPlainRecord(input?.dsse_envelope) && !(await verifyFederatedProofEnvelope(input.dsse_envelope, bundle, hmac_secret))) return nullResult("federated_attestation_drift")
  const bundle_hash = await sha256Hex(canonicalize(bundle))
  return { status: "FEDERATED_RECONCILIATION_OBSERVED", result: "FEDERATED_RECONCILIATION_OBSERVED", runtime_classification: classification, trust_semantics: "remote_evidence_can_narrow_acceptance_only", local_validation_required: true, remote_authority_inherited: false, remote_execution_legitimacy: false, replay_state_consumed: false, merkle_root: bundle.reconciliation_merkle_root, bundle_hash }
}

async function reconciliationWitnessEnvelope(bundle: PortableLegitimacyBundle | null, checkpoint: ReconciliationCheckpoint, classification: RemoteRuntimeClassification): Promise<ReconciliationWitnessEnvelope> {
  const bundle_hash = await sha256Hex(canonicalize(bundle || {}))
  const checkpoint_hash = await sha256Hex(canonicalize(checkpoint))
  return {
    witness_id: await sha256Hex(canonicalize({ bundle_hash, checkpoint_hash, classification })),
    runtime_classification: classification,
    authority_boundary: "portable_evidence_not_portable_authority",
    local_validation_required: true,
    replay_neutral: true,
    mutation_capable: false,
    bundle_hash,
    checkpoint_hash
  }
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
}): Promise<{ ok: true, preo: any | null, canonical_preo: any | null } | { ok: false, reason: string, drift_class: DriftClass, payload: Record<string, unknown> }> {
  const missing = missingDeploymentProvenance(params.provenance)
  if (missing.length > 0) return { ok: false, reason: "workflow_provenance_missing", drift_class: "provenance_drift", payload: { route: params.route, missing_provenance: missing, indicator: "workflow_provenance_missing" } }

  const target = canonicalDeployTarget(params.compiledCanonicalAeo.target)
  if (params.provenance.repository !== target.repo || params.provenance.branch !== target.branch) {
    return { ok: false, reason: "branch_lineage_mismatch", drift_class: "branch_lineage_drift", payload: { route: params.route, expected_repository: target.repo, provided_repository: params.provenance.repository, expected_branch: target.branch, provided_branch: params.provenance.branch, indicator: "branch_lineage_mismatch" } }
  }

  let authorityConstraints: Record<string, unknown> = {}
  try { authorityConstraints = canonicalRecord(JSON.parse(String(params.authority.constraints || "{}"))) } catch { authorityConstraints = {} }
  const requirePreoLineage = preoGovernanceEnabled(authorityConstraints, target)
  const preoLineage = await deploymentPreoLineage(env, params.decision_id, params.validated_object_hash, params.authority, requirePreoLineage)
  if (preoLineage.status !== "OK") {
    return { ok: false, reason: preoLineage.status, drift_class: "provenance_drift", payload: { route: params.route, policy: REQUIRE_PREO_LINEAGE, required: requirePreoLineage, indicator: preoLineage.status } }
  }
  if (!requirePreoLineage) {
    if (params.execution) {
      for (const key of Object.keys(params.provenance) as Array<keyof DeploymentProvenance>) {
        if (String(params.execution[key] || "") !== params.provenance[key]) {
          return { ok: false, reason: "provenance_drift", drift_class: "provenance_drift", payload: { route: params.route, field: key, expected: String(params.execution[key] || ""), provided: params.provenance[key], indicator: "execution_proof_provenance_mismatch" } }
        }
      }
    }
    return { ok: true, preo: null, canonical_preo: null }
  }
  if (!preoLineage.preo || !preoLineage.canonical_preo) {
    return { ok: false, reason: "missing_preo", drift_class: "provenance_drift", payload: { route: params.route, policy: REQUIRE_PREO_LINEAGE, required: true, indicator: "missing_preo" } }
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
    if (url.pathname === "/reconcile" && request.method === "GET") return json({ status: "NULL", route: "/reconcile", reason: "observability_only" })
    if (url.pathname === "/reconcile/schedule" && request.method === "GET") {
      try {
        const schedule = await deterministicReconciliationSchedule(env)
        return json({ ...schedule, route: "/reconcile/schedule", reason: "observability_only" })
      } catch {
        return json({ status: "NULL", route: "/reconcile/schedule", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/reconcile/report" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const summary = await reconciliationSummaryObject(result, new Date().toISOString())
        const portable = await portableReconciliationEnvelope(summary as unknown as Record<string, unknown>)
        return json({ status: result.result, route: "/reconcile/report", reason: "observability_only", report: summary, portable })
      } catch {
        return json({ status: "NULL", route: "/reconcile/report", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/reconcile/drift" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const summary = await reconciliationSummaryObject(result, new Date().toISOString())
        return json({ status: result.result, route: "/reconcile/drift", reason: "observability_only", reconciliation_id: summary.reconciliation_id, drift: result.drift_classifications })
      } catch {
        return json({ status: "NULL", route: "/reconcile/drift", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/federation/reconcile" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const emitted_at = new Date().toISOString()
        const checkpoint = await deterministicReconciliationCheckpoint(result, emitted_at)
        const bundle = await portableLegitimacyBundleFromResult(result, emitted_at)
        const verification = url.searchParams.get("bundle")
          ? await verifyFederatedLegitimacyBundle(JSON.parse(new TextDecoder().decode(base64ToBytes(String(url.searchParams.get("bundle"))) || utf8Bytes("{}"))), anchor, LOCAL_FEDERATION_RUNTIME_ID, env.PROVENANCE_HMAC_SECRET)
          : null
        const witness = await reconciliationWitnessEnvelope(bundle, checkpoint, classifyRemoteRuntime(String(bundle?.runtime_id || LOCAL_FEDERATION_RUNTIME_ID)))
        return json({ status: result.result, route: "/federation/reconcile", reason: "observability_only", authority_boundary: "portable_evidence_not_portable_authority", local_validation_required: true, remote_execution_legitimacy: false, replay_neutral: true, bundle, checkpoint, witness, verification })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/federation/reconcile/report" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const emitted_at = new Date().toISOString()
        const summary = await reconciliationSummaryObject(result, emitted_at)
        const snapshot = await deterministicReconciliationSnapshot(result)
        const bundle = await portableLegitimacyBundleFromResult(result, emitted_at)
        return json({ status: result.result, route: "/federation/reconcile/report", reason: "observability_only", report: summary, deterministic_snapshot: snapshot, portable_legitimacy_bundle: bundle, federation_boundary: "portable_evidence_not_portable_authority" })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile/report", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/federation/reconcile/drift" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const federated_drift_taxonomy: DriftClass[] = ["federated_checkpoint_drift", "federated_merkle_drift", "federated_bundle_drift", "federated_attestation_drift", "federated_reconciliation_drift", "federated_runtime_divergence_drift", "federated_replay_drift", "federated_preo_drift", "federated_continuity_drift", "federated_exact_object_drift", "federated_revocation_divergence_drift", "federated_revocation_projection_drift", "federated_revocation_replay_drift", "federated_checkpoint_revocation_drift", "federated_expiration_visibility_drift"]
        return json({ status: result.result, route: "/federation/reconcile/drift", reason: "observability_only", drift: result.drift_classifications, federated_drift_taxonomy, repairs: false, legitimacy_inference: false, revocation_observability: true })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile/drift", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/federation/reconcile/revocation" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const observed_at = new Date().toISOString()
        const checkpoint = await deterministicReconciliationCheckpoint(result, observed_at)
        const supplied = url.searchParams.get("evidence")
        const evidenceInput = supplied ? JSON.parse(new TextDecoder().decode(base64ToBytes(String(supplied)) || utf8Bytes("{}"))) : null
        const generated = await federatedRevocationEvidenceFromResult(result, checkpoint, observed_at)
        const verification = evidenceInput ? await classifyFederatedRevocationEvidence(evidenceInput, anchor, checkpoint) : null
        return json({ status: result.result, route: "/federation/reconcile/revocation", reason: "observability_only", federation_boundary: "portable_evidence_not_portable_authority", remote_authority_inherited: false, remote_execution_legitimacy: false, replay_state_consumed: false, replay_neutral: true, read_only: true, mutation_capable: false, revocation_evidence: generated, verification })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile/revocation", reason: "reconciliation_unavailable" })
      }
    }
    if (url.pathname === "/federation/reconcile/checkpoint" && request.method === "GET") {
      try {
        const anchor = reconciliationAnchorFromRequest(url)
        const result = await deterministicRecursiveReconciliationTraversal(env, anchor)
        const checkpoint = await deterministicReconciliationCheckpoint(result, new Date().toISOString())
        return json({ status: result.result, route: "/federation/reconcile/checkpoint", reason: "observability_only", append_only: true, rollback_overwrite: false, replay_neutral: true, checkpoint })
      } catch {
        return json({ status: "NULL", route: "/federation/reconcile/checkpoint", reason: "reconciliation_unavailable" })
      }
    }
    if (NON_EXECUTABLE_OBSERVABILITY_ROUTES.includes(url.pathname as any)) return json({ status: "NULL", route: url.pathname, reason: "observability_only" }, request.method === "GET" ? 200 : 405)

    const canonicalRuntimeRoute = CANONICAL_RUNTIME_ROUTES.includes(url.pathname as any)
    const governanceEvidenceRoute = GOVERNANCE_EVIDENCE_ROUTES.includes(url.pathname as any)
    const governedMutationRoute = canonicalRuntimeRoute || governanceEvidenceRoute
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
      if (!governanceEvidenceRoute) {
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
      const attestationValidation = await validateRequestProvenanceAttestation(env, b, {
        decision_id,
        validated_object_hash,
        workflow_run_id: provenance.workflow_run_id,
        workflow_sha: provenance.workflow_sha,
        canonical_aeo_hash: execHash,
        expected_signer_identity: String(authority.identity_id || ""),
        hmac_secret: String(env.PROVENANCE_HMAC_SECRET || env.API_KEY || "")
      })
      if (!attestationValidation.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: attestationValidation.reason }, { event_type: attestationValidation.drift_class === "replay_drift" ? "REPLAY_BLOCKED" : "VALIDATION_REJECTED", decision_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/execute", ...attestationValidation.payload, validated_object_hash }, drift_class: attestationValidation.drift_class })
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
      const attestationValidation = await validateRequestProvenanceAttestation(env, b, {
        decision_id,
        validated_object_hash,
        workflow_run_id: provenance.workflow_run_id,
        workflow_sha: provenance.workflow_sha,
        canonical_aeo_hash: proofHash,
        expected_signer_identity: String(authority.identity_id || ""),
        hmac_secret: String(env.PROVENANCE_HMAC_SECRET || env.API_KEY || "")
      })
      if (!attestationValidation.ok) return rejectWithTelemetry(env, { status:"NULL", result:"INVALID", reason: attestationValidation.reason }, { event_type: attestationValidation.drift_class === "replay_drift" ? "REPLAY_BLOCKED" : "VALIDATION_REJECTED", decision_id, execution_id, authority_id: String(authority.authority_id || ""), severity: "HIGH", payload: { route: "/proof", ...attestationValidation.payload, validated_object_hash }, drift_class: attestationValidation.drift_class })
      const validatedAttestation = attestationValidation.attestation
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
        const proofStatements = [
          env.DB.prepare(`INSERT INTO proof_registry (proof_id,identity_id,session_id,continuity_id,continuity_hash,execution_id,decision_id,validated_object_hash,authority_lineage,execution_lineage,surface,run_id,commit_sha,workflow,environment,created_at,repository,branch,pull_request_id,merge_commit_sha,source_tree_hash,workflow_run_id,workflow_sha)
            SELECT ?1, s.identity_id, ?2, a.continuity_id, c.continuity_hash, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?15, ?16, ?17, ?18, ?19, ?20, ?21
            FROM authority_registry a JOIN session_registry s ON s.session_id=a.session_id JOIN continuity_registry c ON c.continuity_id=a.continuity_id
            WHERE a.decision_id=?4 AND a.session_id=?2 AND a.status='EXECUTED' AND c.status='ACTIVE' AND c.expires_at>?13
              AND a.continuity_id=?14
              AND EXISTS (SELECT 1 FROM execution_registry WHERE execution_id=?3 AND decision_id=?4 AND validated_object_hash=?5 AND session_id=?2 AND continuity_id=a.continuity_id AND status='EXECUTED')
              AND EXISTS (SELECT 1 FROM validation_registry WHERE decision_id=?4 AND validated_object_hash=?5 AND session_id=?2 AND continuity_id=a.continuity_id AND status='VALID' AND result='VALID')
              AND s.continuity_status='ACTIVE' AND s.expires_at>?13`).bind(proof_id,session_id,execution_id,decision_id,validated_object_hash,authorityLineage,executionLineage,String(b.surface||""),provenance.workflow_run_id,provenance.workflow_sha,String(b.workflow||GOVERNED_WORKFLOW),String(b.environment||""),created_at,String(execution.continuity_id || ""),provenance.repository,provenance.branch,provenance.pull_request_id,provenance.merge_commit_sha,provenance.source_tree_hash,provenance.workflow_run_id,provenance.workflow_sha),
          env.DB.prepare(`UPDATE authority_registry SET status='CONSUMED' WHERE decision_id=?1 AND session_id=?2 AND status='EXECUTED' AND continuity_id=?5 AND EXISTS (SELECT 1 FROM proof_registry WHERE proof_id=?3 AND decision_id=?1 AND validated_object_hash=?4)`).bind(decision_id,session_id,proof_id,validated_object_hash,String(execution.continuity_id || ""))
        ]
        if (validatedAttestation) {
          proofStatements.push(env.DB.prepare(`INSERT INTO attestation_registry (attestation_id,envelope_hash,payload_hash,payload_type,signer_identity,decision_id,validated_object_hash,workflow_run_id,workflow_sha,canonical_aeo_hash,transparency_log_id,transparency_integrated_time,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'VALIDATED',?13)`).bind(crypto.randomUUID(), validatedAttestation.envelope_hash, validatedAttestation.payload_hash, validatedAttestation.payload_type, validatedAttestation.signer_identity, validatedAttestation.decision_id, validatedAttestation.validated_object_hash, validatedAttestation.workflow_run_id, validatedAttestation.workflow_sha, validatedAttestation.canonical_aeo_hash, validatedAttestation.transparency_log_id, validatedAttestation.transparency_integrated_time, created_at))
        }
        const proofBoundary = await env.DB.batch<any>(proofStatements)
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
