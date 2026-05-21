export type ContinuityStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | string
export type ContinuityNode = { continuity_id: string; session_id: string; identity_id?: string; parent_continuity_id?: string | null; continuity_hash: string; status: ContinuityStatus; expires_at?: string | null; revoked_at?: string | null }
export type SessionNode = { session_id: string; identity_id?: string; continuity_status?: string; expires_at?: string | null; revoked_at?: string | null }
export type ContinuityFailureReason = "missing_session_lineage" | "missing_continuity_lineage" | "revoked_session_lineage" | "revoked_continuity_lineage" | "expired_session_lineage" | "expired_continuity_lineage" | "orphan_continuity_lineage" | "ambiguous_continuity_lineage" | "continuity_cycle_detected" | "continuity_depth_exceeded" | "continuity_hash_mismatch" | "continuity_identity_mismatch" | "continuity_reconciliation_failed"
export type ContinuityLineageVerifierInput = { now?: Date; maxDepth?: number; session: SessionNode | null; continuity: ContinuityNode | null; continuityById: Map<string, ContinuityNode | ContinuityNode[]>; expectedLineageHash?: string; computeLineageHash: (lineage: ContinuityNode[]) => string }
export type ContinuityLineageVerification = { ok: true; lineage: ContinuityNode[]; lineage_hash: string } | { ok: false; reason: ContinuityFailureReason }

const isExpired = (iso: string | null | undefined, nowMs: number) => Boolean(iso && Number.isFinite(Date.parse(iso)) && Date.parse(iso) <= nowMs)
const resolveDeterministicNode = (map: Map<string, ContinuityNode | ContinuityNode[]>, continuityId: string) => {
  const value = map.get(continuityId)
  if (!value) return { node: null as ContinuityNode | null, ambiguous: false }
  if (Array.isArray(value)) return value.length === 1 ? { node: value[0], ambiguous: false } : { node: null, ambiguous: true }
  return { node: value, ambiguous: false }
}

export function verifyContinuityLineage(input: ContinuityLineageVerifierInput): ContinuityLineageVerification {
  const nowMs = (input.now || new Date()).getTime()
  const maxDepth = Number.isFinite(input.maxDepth) && Number(input.maxDepth) > 0 ? Math.floor(Number(input.maxDepth)) : 32
  if (!input.session) return { ok: false, reason: "missing_session_lineage" }
  if ((input.session.revoked_at || "") || (input.session.continuity_status || "ACTIVE") !== "ACTIVE") return { ok: false, reason: "revoked_session_lineage" }
  if (isExpired(input.session.expires_at, nowMs)) return { ok: false, reason: "expired_session_lineage" }
  if (!input.continuity) return { ok: false, reason: "missing_continuity_lineage" }

  const lineage: ContinuityNode[] = []
  const visited = new Set<string>()
  let current: ContinuityNode | null = input.continuity
  while (current) {
    if (!current.continuity_id) return { ok: false, reason: "continuity_reconciliation_failed" }
    if (visited.has(current.continuity_id)) return { ok: false, reason: "continuity_cycle_detected" }
    visited.add(current.continuity_id)
    if (current.session_id !== input.session.session_id) return { ok: false, reason: "continuity_reconciliation_failed" }
    const sessionIdentity = String(input.session.identity_id || "").trim()
    const continuityIdentity = String(current.identity_id || "").trim()
    if ((sessionIdentity || continuityIdentity) && sessionIdentity !== continuityIdentity) return { ok: false, reason: "continuity_identity_mismatch" }
    if ((current.revoked_at || "") || current.status !== "ACTIVE") return { ok: false, reason: "revoked_continuity_lineage" }
    if (isExpired(current.expires_at, nowMs)) return { ok: false, reason: "expired_continuity_lineage" }
    lineage.push(current)
    if (lineage.length > maxDepth) return { ok: false, reason: "continuity_depth_exceeded" }
    const parentId = String(current.parent_continuity_id || "").trim()
    if (!parentId) break
    const resolved = resolveDeterministicNode(input.continuityById, parentId)
    if (resolved.ambiguous) return { ok: false, reason: "ambiguous_continuity_lineage" }
    if (!resolved.node) return { ok: false, reason: "orphan_continuity_lineage" }
    current = resolved.node
  }

  const lineageHash = input.computeLineageHash(lineage)
  if (!lineageHash) return { ok: false, reason: "continuity_reconciliation_failed" }
  if (input.expectedLineageHash && input.expectedLineageHash !== lineageHash) return { ok: false, reason: "continuity_hash_mismatch" }
  return { ok: true, lineage, lineage_hash: lineageHash }
}
