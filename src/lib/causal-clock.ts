import { sha256Hex, canonicalize } from '../canonical.js'
import type { CausalLegitimacyClockResult } from '../causal-legitimacy-clocks.js'

// Evidence-only — causal ordering ≠ execution authority
export const creates_authority = false as const

export type CausalClockObjectType =
  | 'session'
  | 'continuity'
  | 'authority'
  | 'aeo'
  | 'validation'
  | 'execution'
  | 'proof'

// Canonical legitimacy chain order for intra-scope causal indexing.
// An event of type T at position p must have causal_index > all events
// of types at positions 0..p-1 in the same legitimacy scope.
export const CAUSAL_OBJECT_TYPE_ORDER: readonly CausalClockObjectType[] = [
  'session',
  'continuity',
  'authority',
  'aeo',
  'validation',
  'execution',
  'proof',
] as const

// A single legitimacy event in the causal ordering.
// causal_index is a monotone Lamport-style counter assigned at event creation.
export type CausalClockEntry = {
  readonly object_id: string
  readonly object_type: CausalClockObjectType
  readonly causal_index: number              // monotone; assigned via assignCausalIndex()
  readonly parent_object_id: string | null
  readonly parent_causal_index: number | null  // causal_index of parent; null for scope roots
  readonly lineage_hash: string
  readonly created_at: string
}

// Assigns the next causal_index for a new event given existing events in scope.
// Returns 1 for the first event; max(existing)+1 for subsequent events.
export function assignCausalIndex(
  prior_events: readonly Pick<CausalClockEntry, 'causal_index'>[],
): number {
  if (prior_events.length === 0) return 1
  return Math.max(...prior_events.map((e) => e.causal_index)) + 1
}

// Determines if event a happens-before event b.
// True when: b is a direct child of a, or a.causal_index < b.causal_index.
export function happensBefore(a: CausalClockEntry, b: CausalClockEntry): boolean {
  if (b.parent_object_id === a.object_id) return true
  if (b.parent_causal_index !== null && a.causal_index <= b.parent_causal_index) return true
  return a.causal_index < b.causal_index
}

// Serializes a CausalClockEntry for storage in the causal_clock_json column.
export function buildCausalClockJson(entry: CausalClockEntry): string {
  return JSON.stringify({
    object_id: entry.object_id,
    object_type: entry.object_type,
    causal_index: entry.causal_index,
    parent_object_id: entry.parent_object_id,
    parent_causal_index: entry.parent_causal_index,
    lineage_hash: entry.lineage_hash,
    created_at: entry.created_at,
  })
}

// Parses a causal_clock_json string back to a CausalClockEntry.
// Returns null if the value is absent, malformed, or missing required fields.
export function parseCausalClockJson(json: string | null | undefined): CausalClockEntry | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    if (typeof parsed.causal_index !== 'number' || !Number.isFinite(parsed.causal_index)) return null
    if (typeof parsed.object_id !== 'string' || !parsed.object_id) return null
    if (typeof parsed.object_type !== 'string') return null
    return parsed as CausalClockEntry
  } catch {
    return null
  }
}

// Builds a deterministic content-addressed ID for a CausalClockEntry.
export function buildCausalClockEntryId(entry: CausalClockEntry): string {
  return `ccl_${sha256Hex(canonicalize({ object_id: entry.object_id, causal_index: entry.causal_index, created_at: entry.created_at }))}`
}

// Extracts a causal_clock_index for use in conflict-set tie-break ordering.
// Returns the proof_step of the last deterministic_order entry when the clock
// is CAUSALLY_ORDERED; null otherwise (ambiguous clocks cannot provide causal evidence).
// Format of deterministic_order entries: "object_id:parent_object_id:replay_step:revocation_step:proof_step"
export function causalIndexFromClockResult(result: CausalLegitimacyClockResult): number | null {
  if (result.classification !== 'CAUSALLY_ORDERED') return null
  if (result.deterministic_order.length === 0) return null
  const lastEntry = result.deterministic_order[result.deterministic_order.length - 1]
  const parts = lastEntry.split(':')
  const proofStep = parseInt(parts[4] ?? '0', 10)
  return Number.isFinite(proofStep) ? proofStep : null
}

// Detects causal inversions in a set of CausalClockEntries.
// A causal inversion occurs when a parent's causal_index >= its child's causal_index.
// Returns an array of inversion descriptors; empty array means no inversions detected.
export function detectCausalInversions(events: readonly CausalClockEntry[]): string[] {
  const byId = new Map(events.map((e) => [e.object_id, e]))
  const inversions: string[] = []
  for (const event of events) {
    if (event.parent_object_id !== null && event.parent_causal_index !== null) {
      const parent = byId.get(event.parent_object_id)
      if (parent && parent.causal_index >= event.causal_index) {
        inversions.push(
          `inversion:${event.parent_object_id}(${parent.causal_index})→${event.object_id}(${event.causal_index})`,
        )
      }
    }
  }
  return inversions
}

// Validates that a sequence of CausalClockEntries respects the canonical
// legitimacy chain type order (session→continuity→authority→aeo→validation→execution→proof).
// Returns true when all type-order constraints are satisfied across parent→child pairs.
export function verifyCausalTypeOrder(events: readonly CausalClockEntry[]): boolean {
  const typeRank = new Map(CAUSAL_OBJECT_TYPE_ORDER.map((t, i) => [t, i]))
  const byId = new Map(events.map((e) => [e.object_id, e]))
  for (const event of events) {
    if (!event.parent_object_id) continue
    const parent = byId.get(event.parent_object_id)
    if (!parent) continue
    const parentRank = typeRank.get(parent.object_type) ?? -1
    const childRank = typeRank.get(event.object_type) ?? -1
    if (childRank < parentRank) return false
  }
  return true
}
