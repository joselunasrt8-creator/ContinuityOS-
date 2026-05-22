export const NULL_STATUS = "NULL" as const
export const VALID_STATUS = "VALID" as const
export const INVALID_RESULT = "INVALID" as const
export const VALID_RESULT = "VALID" as const

export type NullStatus = typeof NULL_STATUS
export type ValidStatus = typeof VALID_STATUS
export type InvalidResult = typeof INVALID_RESULT
export type ValidResult = typeof VALID_RESULT

export interface CanonicalNullResult {
  readonly status: NullStatus
  readonly result: InvalidResult
  readonly reason: string
}

export interface CanonicalValidResult {
  readonly status: ValidStatus
  readonly result: ValidResult
}

export function canonicalNullResult(reason: string): CanonicalNullResult {
  return Object.freeze({ status: NULL_STATUS, result: INVALID_RESULT, reason }) as CanonicalNullResult
}

export function isCanonicalNullResult(value: unknown): value is CanonicalNullResult {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return v.status === NULL_STATUS && v.result === INVALID_RESULT && typeof v.reason === "string"
}
