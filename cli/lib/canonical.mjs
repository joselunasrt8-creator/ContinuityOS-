import { createHash } from "node:crypto"

function isCanonicalObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function normalize(value) {
  if (value === undefined) return null
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(normalize)
  if (isCanonicalObject(value)) {
    return Object.freeze(
      Object.keys(value)
        .sort()
        .reduce((acc, key) => {
          acc[key] = normalize(value[key])
          return acc
        }, {}),
    )
  }
  return null
}

export function canonicalize(value) {
  const normalized = normalize(value)
  if (Array.isArray(normalized)) return `[${normalized.map(canonicalize).join(",")}]`
  if (isCanonicalObject(normalized))
    return `{${Object.keys(normalized)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(normalized[key])}`)
      .join(",")}}`
  return JSON.stringify(normalized)
}

export function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex")
}

export function hashCanonical(value) {
  return sha256Hex(canonicalize(value))
}
