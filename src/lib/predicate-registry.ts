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

// resolvePredicateDefinition: deterministic Phase 3A predicate lookup.
//
// Rules:
//   missing predicate_set_id       → NULL
//   unknown predicate_set_id       → NULL
//   INACTIVE / DEPRECATED / DRAFT  → NULL (not selected by ACTIVE lookup)
//   missing predicate_hash         → NULL
//   missing lineage_version        → NULL
//   multiple ACTIVE definitions    → NULL
//   exactly 1 ACTIVE definition    → immutable PredicateDefinition
//
// Non-goals preserved here:
//   no predicate execution or evaluation
//   no authority creation, reservation, or execution authorization
//   no proof generation
//   no replay mutation
//   no Ω validator execution or evaluation
export async function resolvePredicateDefinition(
  predicate_set_id: string | null | undefined,
  db: PredicateRegistryDB,
): Promise<PredicateDefinition | null> {
  const requestedPredicateSetId = nonEmptyText(predicate_set_id)
  if (!requestedPredicateSetId) return null

  const queryResult = await db
    .prepare(
      `SELECT predicate_set_id, predicate_hash, lineage_version, status, predicate_ids
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

  if (status !== "ACTIVE") return null
  if (resolvedPredicateSetId !== requestedPredicateSetId) return null
  if (!predicateHash || !lineageVersion || !predicateIds) return null

  return Object.freeze({
    predicate_set_id: resolvedPredicateSetId,
    predicate_hash: predicateHash,
    lineage_version: lineageVersion,
    predicate_ids: predicateIds,
  })
}
