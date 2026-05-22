/**
 * scripts/reconcile-release-provenance-registry.mjs
 * Issue #998 — RELEASE_PROVENANCE_RECONCILIATION_V1
 *
 * Evidence only — compares distributed release provenance registries deterministically.
 * Does not create authority, proof, execution, or deployment capability.
 * Does not mutate source registries.
 * Does not create merged registry state.
 * Does not repair drift automatically.
 *
 * Exports pure functions for deterministic reconciliation evidence generation.
 * CLI: node scripts/reconcile-release-provenance-registry.mjs <registry-a.json> <registry-b.json>
 */

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import {
  canonicalJson,
  computeRegistryHash,
  validateRegistryHash,
} from './append-release-provenance.mjs'

export const RECONCILIATION_RESULT = {
  RECONCILED: 'RECONCILED',
  DRIFT_DETECTED: 'DRIFT_DETECTED',
  NULL: 'NULL',
}

export const DRIFT_CLASSES = {
  REGISTRY_HASH_DIVERGENCE: 'registry_hash_divergence',
  MISSING_RELEASE_ENTRY: 'missing_release_entry',
  REPLAY_CONFLICT_DETECTED: 'replay_conflict_detected',
  APPEND_ORDER_NON_CANONICAL: 'append_order_non_canonical',
  MUTATION_AFTER_APPEND: 'mutation_after_append',
  BREAK_GLASS_REGISTRY_ENTRY: 'break_glass_registry_entry',
  UNKNOWN_PROVENANCE_TYPE: 'unknown_provenance_type',
}

const VALID_PROVENANCE_TYPES = new Set(['DSSE', 'SLSA', 'INTERNAL', 'PENDING_EXTERNAL'])

/**
 * Sorts registry entries by release_id for canonical ordering.
 * Returns a new array — does not mutate input.
 */
export function normalizeRegistryEntries(entries) {
  return [...entries].sort((a, b) =>
    a.release_id < b.release_id ? -1 : a.release_id > b.release_id ? 1 : 0,
  )
}

/**
 * Returns true if entries are already in canonical (release_id-ascending) order.
 */
export function isCanonicalOrder(entries) {
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].release_id < entries[i - 1].release_id) return false
  }
  return true
}

/**
 * Detects entries with unknown provenance types (fail-closed drift class).
 *
 * @param {object[]} entries
 * @returns {Array<{drift_class, detail, release_id}>}
 */
export function detectUnknownProvenanceTypes(entries) {
  const findings = []
  for (const entry of entries) {
    if (entry.provenance_type !== undefined && !VALID_PROVENANCE_TYPES.has(entry.provenance_type)) {
      findings.push({
        drift_class: DRIFT_CLASSES.UNKNOWN_PROVENANCE_TYPE,
        detail: `provenance_type "${entry.provenance_type}" is not one of DSSE|SLSA|INTERNAL|PENDING_EXTERNAL`,
        release_id: entry.release_id,
      })
    }
  }
  return findings
}

/**
 * Detects BREAK_GLASS entries.
 * - break_glass=true AND canonical_release_candidate=true → null_condition (fail closed)
 * - break_glass=true AND canonical_release_candidate=false → observational drift
 *
 * @param {object[]} entries
 * @returns {Array<{drift_class, detail, release_id, null_condition: boolean}>}
 */
export function detectBreakGlassEntries(entries) {
  const findings = []
  for (const entry of entries) {
    if (entry.break_glass === true) {
      if (entry.canonical_release_candidate === true) {
        findings.push({
          drift_class: DRIFT_CLASSES.BREAK_GLASS_REGISTRY_ENTRY,
          detail: `BREAK_GLASS entry ${entry.release_id} has canonical_release_candidate=true — canonicalization must fail closed`,
          release_id: entry.release_id,
          null_condition: true,
        })
      } else {
        findings.push({
          drift_class: DRIFT_CLASSES.BREAK_GLASS_REGISTRY_ENTRY,
          detail: `BREAK_GLASS entry ${entry.release_id} present in registry`,
          release_id: entry.release_id,
          null_condition: false,
        })
      }
    }
  }
  return findings
}

/**
 * Detects mutations: same release_id in both registries but different canonical content.
 * Mutation after append is a fail-closed condition.
 *
 * @param {object[]} entriesA
 * @param {object[]} entriesB
 * @returns {Array<{drift_class, detail, release_id}>}
 */
export function detectMutations(entriesA, entriesB) {
  const mutations = []
  const mapB = new Map(entriesB.map((e) => [e.release_id, e]))
  for (const a of entriesA) {
    const b = mapB.get(a.release_id)
    if (b && canonicalJson(a) !== canonicalJson(b)) {
      mutations.push({
        drift_class: DRIFT_CLASSES.MUTATION_AFTER_APPEND,
        detail: `release_id ${a.release_id} exists in both registries but with different content`,
        release_id: a.release_id,
      })
    }
  }
  return mutations
}

/**
 * Detects cross-registry replay conflicts between distinct entries.
 * Checks entries in A against entries in B for semantic collisions
 * that would indicate tag overwrites or artifact hash substitutions.
 *
 * Replay rules enforced:
 * - Same release_tag → different source_commit_sha (tag overwrite across registries)
 * - Same release_tag → different artifact_hash
 * - Same source_commit_sha + release_tag → different artifact_hash
 *
 * @param {object[]} entriesA
 * @param {object[]} entriesB
 * @returns {Array<{drift_class, detail, release_id_a, release_id_b}>}
 */
export function detectCrossRegistryReplayConflicts(entriesA, entriesB) {
  const conflicts = []
  const seen = new Set()

  for (const a of entriesA) {
    for (const b of entriesB) {
      // Skip same release_id — mutations handled separately
      if (a.release_id === b.release_id) continue

      if (a.release_tag === b.release_tag) {
        // Same tag → different commit
        if (a.source_commit_sha !== b.source_commit_sha) {
          const key = `tag-commit:${a.release_tag}`
          if (!seen.has(key)) {
            seen.add(key)
            conflicts.push({
              drift_class: DRIFT_CLASSES.REPLAY_CONFLICT_DETECTED,
              detail: `tag ${a.release_tag} maps to commit ${a.source_commit_sha.substring(0, 12)} in registry-a but ${b.source_commit_sha.substring(0, 12)} in registry-b`,
              release_id_a: a.release_id,
              release_id_b: b.release_id,
            })
          }
        }

        // Same tag → different artifact hash
        if (a.artifact_hash !== b.artifact_hash) {
          const key = `tag-artifact:${a.release_tag}`
          if (!seen.has(key)) {
            seen.add(key)
            conflicts.push({
              drift_class: DRIFT_CLASSES.REPLAY_CONFLICT_DETECTED,
              detail: `tag ${a.release_tag} maps to artifact ${a.artifact_hash.substring(0, 16)}... in registry-a but ${b.artifact_hash.substring(0, 16)}... in registry-b`,
              release_id_a: a.release_id,
              release_id_b: b.release_id,
            })
          }
        }
      }

      // Same commit + same tag → different artifact hash (cross-registry)
      if (
        a.source_commit_sha === b.source_commit_sha &&
        a.release_tag === b.release_tag &&
        a.artifact_hash !== b.artifact_hash
      ) {
        const key = `commit-tag:${a.source_commit_sha}-${a.release_tag}`
        if (!seen.has(key)) {
          seen.add(key)
          conflicts.push({
            drift_class: DRIFT_CLASSES.REPLAY_CONFLICT_DETECTED,
            detail: `commit ${a.source_commit_sha.substring(0, 12)} + tag ${a.release_tag} maps to different artifact hashes across registries`,
            release_id_a: a.release_id,
            release_id_b: b.release_id,
          })
        }
      }
    }
  }

  return conflicts
}

/**
 * Detects entries present in one registry but absent from the other.
 *
 * @param {object[]} entriesA
 * @param {object[]} entriesB
 * @returns {Array<{drift_class, detail, release_id, registry: 'a'|'b'}>}
 */
export function detectMissingEntries(entriesA, entriesB) {
  const findings = []
  const idsA = new Set(entriesA.map((e) => e.release_id))
  const idsB = new Set(entriesB.map((e) => e.release_id))

  for (const id of idsA) {
    if (!idsB.has(id)) {
      findings.push({
        drift_class: DRIFT_CLASSES.MISSING_RELEASE_ENTRY,
        detail: `release_id ${id} present in registry-a but absent from registry-b`,
        release_id: id,
        registry: 'a',
      })
    }
  }

  for (const id of idsB) {
    if (!idsA.has(id)) {
      findings.push({
        drift_class: DRIFT_CLASSES.MISSING_RELEASE_ENTRY,
        detail: `release_id ${id} present in registry-b but absent from registry-a`,
        release_id: id,
        registry: 'b',
      })
    }
  }

  return findings
}

/**
 * Computes a deterministic reconciliation evidence hash.
 * Covers: canonical_a_hash, canonical_b_hash, reconciliation_result, drift_classes (sorted).
 * Proves that the reconciliation conclusion is deterministic for given inputs.
 *
 * @param {string} canonicalAHash
 * @param {string} canonicalBHash
 * @param {string} result
 * @param {string[]} driftClasses
 * @returns {string} hex SHA-256 digest
 */
export function computeReconciliationHash(canonicalAHash, canonicalBHash, result, driftClasses) {
  const payload = {
    canonical_a_hash: canonicalAHash,
    canonical_b_hash: canonicalBHash,
    drift_classes: [...driftClasses].sort(),
    reconciliation_result: result,
  }
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

/**
 * Generates a deterministic reconciliation evidence object for two distributed
 * release provenance registry instances.
 *
 * Evidence boundaries (always preserved):
 *   evidence_only: true
 *   creates_authority: false
 *   creates_execution: false
 *
 * Evidence never:
 *   - authorizes releases
 *   - validates provenance
 *   - executes operations
 *   - creates proof
 *   - mutates registry state
 *
 * @param {object} registryA - first registry instance
 * @param {object} registryB - second registry instance
 * @returns {object} reconciliation evidence object
 */
export function generateReconciliationEvidence(registryA, registryB) {
  const driftDetails = []
  const nullConditions = []

  const entriesA = (registryA && registryA.entries) ? registryA.entries : []
  const entriesB = (registryB && registryB.entries) ? registryB.entries : []
  const hashAlg = (registryA && registryA.registry_hash_alg) || 'sha256'

  // ── Step 1: Validate stored registry hashes ──────────────────────────────
  const hashCheckA = validateRegistryHash(registryA || { entries: [], registry_hash: '', registry_hash_alg: hashAlg, entry_count: 0 })
  if (!hashCheckA.valid) {
    nullConditions.push({
      reason: 'registry_a_hash_invalid',
      detail: `registry-a stored hash is invalid: ${hashCheckA.failure_class}`,
    })
  }

  const hashCheckB = validateRegistryHash(registryB || { entries: [], registry_hash: '', registry_hash_alg: hashAlg, entry_count: 0 })
  if (!hashCheckB.valid) {
    nullConditions.push({
      reason: 'registry_b_hash_invalid',
      detail: `registry-b stored hash is invalid: ${hashCheckB.failure_class}`,
    })
  }

  // ── Step 2: Detect unknown provenance types (fail closed) ─────────────────
  const unknownA = detectUnknownProvenanceTypes(entriesA)
  const unknownB = detectUnknownProvenanceTypes(entriesB)
  for (const finding of [...unknownA, ...unknownB]) {
    driftDetails.push(finding)
    nullConditions.push({ reason: DRIFT_CLASSES.UNKNOWN_PROVENANCE_TYPE, detail: finding.detail })
  }

  // ── Step 3: Detect BREAK_GLASS entries ────────────────────────────────────
  const bgA = detectBreakGlassEntries(entriesA)
  const bgB = detectBreakGlassEntries(entriesB)
  for (const finding of [...bgA, ...bgB]) {
    driftDetails.push(finding)
    if (finding.null_condition) {
      nullConditions.push({ reason: 'break_glass_canonicalization', detail: finding.detail })
    }
  }

  // ── Step 4: Detect mutations — same release_id, different content (fail closed) ──
  const mutations = detectMutations(entriesA, entriesB)
  for (const finding of mutations) {
    driftDetails.push(finding)
    nullConditions.push({ reason: DRIFT_CLASSES.MUTATION_AFTER_APPEND, detail: finding.detail })
  }

  // ── Step 5: Detect cross-registry replay conflicts (fail closed) ──────────
  const replayConflicts = detectCrossRegistryReplayConflicts(entriesA, entriesB)
  for (const finding of replayConflicts) {
    driftDetails.push(finding)
    nullConditions.push({ reason: DRIFT_CLASSES.REPLAY_CONFLICT_DETECTED, detail: finding.detail })
  }

  // ── Step 6: Detect missing entries (drift, not NULL) ──────────────────────
  const missing = detectMissingEntries(entriesA, entriesB)
  driftDetails.push(...missing)

  // ── Step 7: Detect non-canonical append order (drift, not NULL) ───────────
  if (entriesA.length > 1 && !isCanonicalOrder(entriesA)) {
    driftDetails.push({
      drift_class: DRIFT_CLASSES.APPEND_ORDER_NON_CANONICAL,
      detail: 'entries in registry-a are not in canonical release_id order',
      registry: 'a',
    })
  }
  if (entriesB.length > 1 && !isCanonicalOrder(entriesB)) {
    driftDetails.push({
      drift_class: DRIFT_CLASSES.APPEND_ORDER_NON_CANONICAL,
      detail: 'entries in registry-b are not in canonical release_id order',
      registry: 'b',
    })
  }

  // ── Step 8: Compute canonical hashes ─────────────────────────────────────
  const normalizedA = normalizeRegistryEntries(entriesA)
  const normalizedB = normalizeRegistryEntries(entriesB)
  const canonicalAHash = computeRegistryHash(normalizedA, hashAlg)
  const canonicalBHash = computeRegistryHash(normalizedB, hashAlg)

  // ── Step 9: Determine reconciliation result ───────────────────────────────
  let result
  if (nullConditions.length > 0) {
    result = RECONCILIATION_RESULT.NULL
  } else if (canonicalAHash === canonicalBHash) {
    result = RECONCILIATION_RESULT.RECONCILED
  } else {
    result = RECONCILIATION_RESULT.DRIFT_DETECTED
    driftDetails.push({
      drift_class: DRIFT_CLASSES.REGISTRY_HASH_DIVERGENCE,
      detail: `canonical registry hashes diverge: a=${canonicalAHash.substring(0, 16)}... b=${canonicalBHash.substring(0, 16)}...`,
    })
  }

  // Collect unique drift classes in deterministic order
  const driftClasses = [...new Set(driftDetails.map((d) => d.drift_class))].sort()

  // Compute deterministic reconciliation hash
  const reconciliationHash = computeReconciliationHash(
    canonicalAHash,
    canonicalBHash,
    result,
    driftClasses,
  )

  // ── Build evidence object — never mutates source registries ──────────────
  return {
    artifact: 'RELEASE_PROVENANCE_RECONCILIATION',
    evidence_only: true,
    creates_authority: false,
    creates_execution: false,
    registry_a_hash: (registryA && registryA.registry_hash) || '',
    registry_b_hash: (registryB && registryB.registry_hash) || '',
    canonical_a_hash: canonicalAHash,
    canonical_b_hash: canonicalBHash,
    entry_count_a: entriesA.length,
    entry_count_b: entriesB.length,
    reconciliation_result: result,
    drift_classes: driftClasses,
    drift_details: driftDetails,
    null_reasons: nullConditions,
    reconciliation_hash: reconciliationHash,
  }
}

// ── CLI runner ──────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)

if (resolve(process.argv[1] ?? '') === __filename) {
  const [, , registryAPath, registryBPath] = process.argv

  if (!registryAPath || !registryBPath) {
    console.error(
      'NULL — usage: reconcile-release-provenance-registry.mjs <registry-a.json> <registry-b.json>',
    )
    process.exit(1)
  }

  if (!existsSync(registryAPath)) {
    console.error(`NULL — registry-a not found: ${registryAPath}`)
    process.exit(1)
  }

  if (!existsSync(registryBPath)) {
    console.error(`NULL — registry-b not found: ${registryBPath}`)
    process.exit(1)
  }

  let registryA, registryB

  try {
    registryA = JSON.parse(readFileSync(registryAPath, 'utf8'))
  } catch (e) {
    console.error(`NULL — failed to parse registry-a: ${e.message}`)
    process.exit(1)
  }

  try {
    registryB = JSON.parse(readFileSync(registryBPath, 'utf8'))
  } catch (e) {
    console.error(`NULL — failed to parse registry-b: ${e.message}`)
    process.exit(1)
  }

  const evidence = generateReconciliationEvidence(registryA, registryB)

  console.log(JSON.stringify(evidence, null, 2))

  if (evidence.reconciliation_result === RECONCILIATION_RESULT.NULL) {
    process.exit(1)
  }

  if (evidence.reconciliation_result === RECONCILIATION_RESULT.DRIFT_DETECTED) {
    process.exit(2)
  }

  process.exit(0)
}
