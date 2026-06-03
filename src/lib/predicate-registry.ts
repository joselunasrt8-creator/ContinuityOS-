// Issue #1777: Phase 3A Predicate Registry resolution.
// Topology-only lookup between ValidatorBinding and future Ω validator execution.
// Resolution does not execute predicates, evaluate predicates, create/reserve
// authority, authorize execution, generate proof, mutate replay state, or run Ω
// validator evaluation.

export type PredicateRegistryStatus = "ACTIVE" | "INACTIVE" | "DEPRECATED" | "DRAFT"

export type PredicateDefinition = {
  readonly predicate_set_id: string
  readonly predicate_hash: string
  readonly lineage_version: string
  readonly predicate_ids: readonly string[]
  readonly side_effects_allowed?: unknown
}

export type PurePredicateDefinition = PredicateDefinition & {
  readonly side_effects_allowed: false
}

export type PredicatePurityViolation = {
  readonly result: "NULL"
  readonly reason: "PREDICATE_PURITY_VIOLATION"
  readonly creates_proof: false
  readonly creates_execution_eligibility: false
}

export interface PredicateRegistryDB {
  prepare(sql: string): {
    bind(...params: unknown[]): { all<T>(): Promise<{ results?: T[] } | T[]> }
  }
}

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parsePredicateIds(value: unknown): readonly string[] | null {
  const raw = nonEmptyText(value)
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!Array.isArray(parsed)) return null

  const predicateIds = parsed.map(nonEmptyText)
  if (predicateIds.some((id) => id === null)) return null

  return Object.freeze(predicateIds as string[])
}

function parseSideEffectsAllowed(value: unknown): unknown {
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return value

  const trimmed = value.trim()
  if (trimmed !== "false" && trimmed !== "true") return value

  try {
    const parsed = JSON.parse(trimmed)
    return typeof parsed === "boolean" ? parsed : value
  } catch {
    return value
  }
}

const PREDICATE_PURITY_NULL: PredicatePurityViolation = Object.freeze({
  result: "NULL" as const,
  reason: "PREDICATE_PURITY_VIOLATION" as const,
  creates_proof: false as const,
  creates_execution_eligibility: false as const,
})

// validatePredicateDefinitionPurity: validator pre-flight gate before predicate
// implementation loading, predicate execution, proof creation, or execution
// eligibility creation. A predicate may narrow validator policy, but may never
// widen it. Validation predicates must prove purity with an explicit
// side_effects_allowed === false metadata value before validation can continue.
export function validatePredicateDefinitionPurity<T>(
  predicate_definition: PredicateDefinition | null | undefined,
  continueValidation: (predicateDefinition: PurePredicateDefinition) => T,
): T | PredicatePurityViolation {
  if (!predicate_definition || predicate_definition.side_effects_allowed !== false) {
    return PREDICATE_PURITY_NULL
  }

  return continueValidation(Object.freeze({
    ...predicate_definition,
    side_effects_allowed: false as const,
  }))
}

// resolvePredicateDefinition: deterministic Phase 3A predicate lookup.
//
// Rules:
//   missing predicate_set_id       → NULL
//   unknown predicate_set_id       → NULL
//   INACTIVE / DEPRECATED / DRAFT  → NULL (not selected by ACTIVE lookup)
//   missing predicate_hash         → NULL
//   missing lineage_version        → NULL
//   multiple ACTIVE definitions    → NULL
//   exactly 1 ACTIVE definition    → immutable PredicateDefinition metadata
//
// Non-goals preserved here:
//   no predicate execution or evaluation
//   no authority creation, reservation, or execution authorization
//   no proof generation
//   no replay mutation
//   no Ω validator execution or evaluation
//
// Purity is not inferred from resolution. Call validatePredicateDefinitionPurity
// before loading or executing any predicate implementation.
export async function resolvePredicateDefinition(
  predicate_set_id: string | null | undefined,
  db: PredicateRegistryDB,
): Promise<PredicateDefinition | null> {
  const requestedPredicateSetId = nonEmptyText(predicate_set_id)
  if (!requestedPredicateSetId) return null

  const queryResult = await db
    .prepare(
      `SELECT predicate_set_id, predicate_hash, lineage_version, status, predicate_ids, side_effects_allowed
       FROM predicate_registry
       WHERE predicate_set_id = ?1 AND status = 'ACTIVE'
       ORDER BY created_at ASC, predicate_hash ASC, lineage_version ASC`,
    )
    .bind(requestedPredicateSetId)
    .all<Record<string, unknown>>()

  const rows = Array.isArray(queryResult) ? queryResult : (queryResult.results ?? [])
  if (rows.length !== 1) return null

  const row = rows[0]
  const status = nonEmptyText(row.status)
  const resolvedPredicateSetId = nonEmptyText(row.predicate_set_id)
  const predicateHash = nonEmptyText(row.predicate_hash)
  const lineageVersion = nonEmptyText(row.lineage_version)
  const predicateIds = parsePredicateIds(row.predicate_ids)
  const sideEffectsAllowed = parseSideEffectsAllowed(row.side_effects_allowed)

  if (status !== "ACTIVE") return null
  if (resolvedPredicateSetId !== requestedPredicateSetId) return null
  if (!predicateHash || !lineageVersion || !predicateIds) return null

  return Object.freeze({
    predicate_set_id: resolvedPredicateSetId,
    predicate_hash: predicateHash,
    lineage_version: lineageVersion,
    predicate_ids: predicateIds,
    side_effects_allowed: sideEffectsAllowed,
  })
}
