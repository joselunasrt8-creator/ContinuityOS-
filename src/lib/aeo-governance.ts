export type CanonicalAEO = {
  intent: string
  scope: Record<string, unknown>
  validation: Record<string, unknown>
  target: Record<string, unknown>
  finality: Record<string, unknown>
}

export const REQUIRED_AEO_KEYS = ["intent", "scope", "validation", "target", "finality"] as const

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

export function canonicalize(v: unknown): string {
  const normalized = normalizeCanonicalValue(v)
  if (Array.isArray(normalized)) return `[${normalized.map(canonicalize).join(",")}]`
  if (isPlainRecord(normalized)) return `{${Object.keys(normalized).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(normalized[key])}`).join(",")}}`
  return JSON.stringify(normalized)
}

function canonicalRecord(v: unknown): Record<string, unknown> | null {
  const normalized = normalizeCanonicalValue(v)
  return isPlainRecord(normalized) ? normalized : null
}

export function toCanonicalAeo(input: unknown): CanonicalAEO | null {
  if (!isPlainRecord(input)) return null
  const keys = Object.keys(input).sort()
  if (keys.length !== REQUIRED_AEO_KEYS.length) return null
  if (keys.join("|") !== [...REQUIRED_AEO_KEYS].sort().join("|")) return null

  const intent = String(input.intent ?? "")
  const scope = canonicalRecord(input.scope)
  const validation = canonicalRecord(input.validation)
  const target = canonicalRecord(input.target)
  const finality = canonicalRecord(input.finality)

  if (!intent || !scope || !validation || !target || !finality) return null

  return Object.freeze({ intent, scope, validation, target, finality })
}
