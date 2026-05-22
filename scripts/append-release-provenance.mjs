/**
 * scripts/append-release-provenance.mjs
 * Issue #996 — RELEASE_PROVENANCE_REGISTRY_PERSISTENCE_V1
 *
 * Evidence only — records release provenance entries deterministically.
 * Does not create authority, proof, execution, or deployment capability.
 * Does not automatically commit registry to main.
 *
 * Exports pure functions for append-only registry persistence.
 * CLI: node scripts/append-release-provenance.mjs <provenance.json> <registry.json>
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const REGISTRY_FAILURE_CLASSES = {
  RELEASE_REGISTRY_ENTRY_INVALID: 'release_registry_entry_invalid',
  RELEASE_REGISTRY_HASH_MISMATCH: 'release_registry_hash_mismatch',
  RELEASE_REGISTRY_REPLAY_CONFLICT: 'release_registry_replay_conflict',
  RELEASE_REGISTRY_MUTATION_AFTER_GENERATION: 'release_registry_mutation_after_generation',
  RELEASE_REGISTRY_BREAK_GLASS_CANONICALIZATION: 'release_registry_break_glass_canonicalization',
  RELEASE_REGISTRY_APPEND_NON_DETERMINISTIC: 'release_registry_append_non_deterministic',
  RELEASE_REGISTRY_UNKNOWN_PROVENANCE_TYPE: 'release_registry_unknown_provenance_type',
}

const VALID_PROVENANCE_TYPES = new Set(['DSSE', 'SLSA', 'INTERNAL', 'PENDING_EXTERNAL'])

const REQUIRED_ENTRY_FIELDS = [
  'release_id',
  'release_tag',
  'source_commit_sha',
  'artifact_hash',
  'artifact_hash_alg',
  'provenance_type',
  'evidence_only',
  'creates_authority',
  'creates_execution',
  'canonical_release_candidate',
  'workflow_run_id',
  'generated_at',
]

/**
 * Produces a canonical deep-sorted JSON representation.
 * Keys sorted alphabetically at every nesting level.
 * Ensures deterministic serialization regardless of insertion order.
 */
export function canonicalJson(value) {
  if (value === null || value === undefined) return JSON.stringify(value)
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']'
  }
  const keys = Object.keys(value).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}'
}

/**
 * Computes the deterministic SHA-256 registry hash.
 *
 * Hash covers: entries (sorted by release_id), entry_count (derived),
 * registry_hash_alg. Hash excludes registry_hash itself (avoids circularity).
 * Hash is stable under canonical JSON serialization.
 *
 * @param {object[]} entries
 * @param {string} [hashAlg]
 * @returns {string} hex SHA-256 digest
 */
export function computeRegistryHash(entries, hashAlg = 'sha256') {
  const sortedEntries = [...entries].sort((a, b) =>
    a.release_id < b.release_id ? -1 : a.release_id > b.release_id ? 1 : 0,
  )

  const payload = {
    entries: sortedEntries,
    entry_count: sortedEntries.length,
    registry_hash_alg: hashAlg,
  }

  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex')
}

/**
 * Validates that the registry's stored hash matches the computed hash.
 * Also validates entry_count matches entries.length.
 *
 * @param {object} registry
 * @returns {{ valid: boolean, failure_class: string|null, computed?: string, stored?: string }}
 */
export function validateRegistryHash(registry) {
  const entries = registry.entries || []
  const hashAlg = registry.registry_hash_alg || 'sha256'
  const computed = computeRegistryHash(entries, hashAlg)

  if (computed !== registry.registry_hash) {
    return {
      valid: false,
      failure_class: REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_HASH_MISMATCH,
      computed,
      stored: registry.registry_hash,
    }
  }

  if (registry.entry_count !== entries.length) {
    return {
      valid: false,
      failure_class: REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_HASH_MISMATCH,
      detail: `entry_count ${registry.entry_count} does not match entries.length ${entries.length}`,
    }
  }

  return { valid: true, failure_class: null }
}

/**
 * Validates a provenance entry for registry append.
 * Enforces evidence-only invariants.
 * Rejects unknown provenance types.
 * Rejects BREAK_GLASS canonicalization.
 *
 * @param {object} entry
 * @returns {{ valid: boolean, failures: Array<{failure_class: string, detail: string}> }}
 */
export function validateEntryForAppend(entry) {
  const failures = []

  const missing = REQUIRED_ENTRY_FIELDS.filter(
    (f) => entry[f] === undefined || entry[f] === null || entry[f] === '',
  )

  if (missing.length > 0) {
    failures.push({
      failure_class: REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_ENTRY_INVALID,
      detail: `missing required fields: ${missing.join(', ')}`,
    })
  }

  if (entry.evidence_only !== true) {
    failures.push({
      failure_class: REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_ENTRY_INVALID,
      detail: 'evidence_only must be true',
    })
  }

  if (entry.creates_authority !== false) {
    failures.push({
      failure_class: REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_ENTRY_INVALID,
      detail: 'creates_authority must be false',
    })
  }

  if (entry.creates_execution !== false) {
    failures.push({
      failure_class: REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_ENTRY_INVALID,
      detail: 'creates_execution must be false',
    })
  }

  if (entry.provenance_type !== undefined && !VALID_PROVENANCE_TYPES.has(entry.provenance_type)) {
    failures.push({
      failure_class: REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_UNKNOWN_PROVENANCE_TYPE,
      detail: `provenance_type "${entry.provenance_type}" must be one of DSSE|SLSA|INTERNAL|PENDING_EXTERNAL`,
    })
  }

  if (entry.break_glass === true && entry.canonical_release_candidate === true) {
    failures.push({
      failure_class: REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_BREAK_GLASS_CANONICALIZATION,
      detail: 'BREAK_GLASS entry cannot have canonical_release_candidate=true',
    })
  }

  return { valid: failures.length === 0, failures }
}

/**
 * Detects replay conflicts against existing registry entries.
 * Fails closed — any conflict prevents append.
 *
 * Replay rules enforced (mirroring RPR-001 through RPR-005):
 *   - same release_id reused → replay
 *   - same tag → different commit → replay (tag overwrite)
 *   - same tag → different artifact hash → replay
 *   - same commit + tag → different artifact hash → replay
 *   - same preo_reference + tag → different artifact hash → replay
 *
 * @param {object[]} registryEntries
 * @param {object} newEntry
 * @returns {Array<{failure_class: string, detail: string}>}
 */
export function detectRegistryReplayConflict(registryEntries, newEntry) {
  const seen = new Set()
  const conflicts = []

  function addConflict(failure_class, detail) {
    const key = `${failure_class}:${detail}`
    if (!seen.has(key)) {
      seen.add(key)
      conflicts.push({ failure_class, detail })
    }
  }

  for (const existing of registryEntries) {
    if (existing.release_id === newEntry.release_id) {
      addConflict(
        REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT,
        `release_id ${newEntry.release_id} already exists in registry`,
      )
      return conflicts
    }

    if (existing.release_tag === newEntry.release_tag) {
      if (existing.source_commit_sha !== newEntry.source_commit_sha) {
        addConflict(
          REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT,
          `tag ${newEntry.release_tag} already mapped to commit ${existing.source_commit_sha}`,
        )
      }

      if (existing.artifact_hash !== newEntry.artifact_hash) {
        addConflict(
          REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT,
          `tag ${newEntry.release_tag} already mapped to artifact hash ${existing.artifact_hash}`,
        )
      }

      if (
        existing.preo_reference &&
        newEntry.preo_reference &&
        existing.preo_reference === newEntry.preo_reference &&
        existing.artifact_hash !== newEntry.artifact_hash
      ) {
        addConflict(
          REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT,
          `preo_reference ${newEntry.preo_reference} + tag ${newEntry.release_tag} already mapped to different artifact hash`,
        )
      }
    }

    if (
      existing.source_commit_sha === newEntry.source_commit_sha &&
      existing.release_tag === newEntry.release_tag &&
      existing.artifact_hash !== newEntry.artifact_hash
    ) {
      addConflict(
        REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT,
        `commit ${newEntry.source_commit_sha} + tag ${newEntry.release_tag} already mapped to different artifact hash`,
      )
    }
  }

  return conflicts
}

/**
 * Verifies that the generated provenance entry equals the appended registry entry.
 * Mutation after workflow generation must fail.
 *
 * Uses canonical JSON comparison for field-order-independent deep equality.
 *
 * @param {object} generated - original provenance entry as generated by workflow
 * @param {object} appended  - provenance entry as it appears in the registry
 * @returns {{ equivalent: boolean, failure_class: string|null }}
 */
export function verifyProvenanceEquivalence(generated, appended) {
  const genCanonical = canonicalJson(generated)
  const appCanonical = canonicalJson(appended)

  if (genCanonical !== appCanonical) {
    return {
      equivalent: false,
      failure_class: REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_MUTATION_AFTER_GENERATION,
    }
  }

  return { equivalent: true, failure_class: null }
}

/**
 * Appends a validated provenance entry to the registry.
 * Returns a new registry object — does not mutate the input.
 * Fails closed on any validation, replay, or hash failure.
 *
 * Not allowed:
 *   - automatically commit registry update to main
 *   - create GitHub release
 *   - push tag
 *   - publish package
 *   - deploy artifact
 *
 * @param {object} registry - current registry state
 * @param {object} newEntry - provenance entry to append
 * @returns {object} updated registry with appended entry and recomputed hash
 * @throws {Error} with failure_class(es) property on any failure
 */
export function appendProvenanceEntry(registry, newEntry) {
  const entryValidation = validateEntryForAppend(newEntry)
  if (!entryValidation.valid) {
    const failureClasses = [...new Set(entryValidation.failures.map((f) => f.failure_class))].join(', ')
    const details = entryValidation.failures.map((f) => f.detail).join('; ')
    const err = new Error(`NULL — ${failureClasses}: ${details}`)
    err.failure_classes = entryValidation.failures.map((f) => f.failure_class)
    throw err
  }

  const entries = registry.entries || []
  const hashAlg = registry.registry_hash_alg || 'sha256'

  if (entries.length > 0) {
    const hashCheck = validateRegistryHash(registry)
    if (!hashCheck.valid) {
      const err = new Error(
        `NULL — ${REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_HASH_MISMATCH}: existing registry hash does not match entries`,
      )
      err.failure_class = REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_HASH_MISMATCH
      throw err
    }
  }

  const conflicts = detectRegistryReplayConflict(entries, newEntry)
  if (conflicts.length > 0) {
    const details = conflicts.map((c) => c.detail).join('; ')
    const err = new Error(
      `NULL — ${REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT}: ${details}`,
    )
    err.failure_class = REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_REPLAY_CONFLICT
    err.conflicts = conflicts
    throw err
  }

  const newEntries = [...entries, newEntry]
  const newEntryCount = newEntries.length
  const newHash = computeRegistryHash(newEntries, hashAlg)

  const verifyHash = computeRegistryHash(newEntries, hashAlg)
  if (newHash !== verifyHash) {
    const err = new Error(
      `NULL — ${REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_APPEND_NON_DETERMINISTIC}: registry hash is non-deterministic`,
    )
    err.failure_class = REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_APPEND_NON_DETERMINISTIC
    throw err
  }

  return {
    ...registry,
    entry_count: newEntryCount,
    registry_hash: newHash,
    registry_hash_alg: hashAlg,
    entries: newEntries,
  }
}

// ── CLI runner ──────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)

if (resolve(process.argv[1] ?? '') === __filename) {
  const [, , provenancePath, registryPath] = process.argv

  if (!provenancePath || !registryPath) {
    console.error(
      'NULL — release_registry_entry_invalid: usage: append-release-provenance.mjs <provenance.json> <registry.json>',
    )
    process.exit(1)
  }

  if (!existsSync(provenancePath)) {
    console.error(
      `NULL — release_registry_entry_invalid: provenance file not found: ${provenancePath}`,
    )
    process.exit(1)
  }

  let newEntry, registry

  try {
    newEntry = JSON.parse(readFileSync(provenancePath, 'utf8'))
  } catch (e) {
    console.error(
      `NULL — release_registry_entry_invalid: failed to parse provenance JSON: ${e.message}`,
    )
    process.exit(1)
  }

  if (existsSync(registryPath)) {
    try {
      registry = JSON.parse(readFileSync(registryPath, 'utf8'))
    } catch (e) {
      console.error(
        `NULL — release_registry_hash_mismatch: failed to parse registry JSON: ${e.message}`,
      )
      process.exit(1)
    }
  } else {
    const emptyEntries = []
    const emptyHash = computeRegistryHash(emptyEntries, 'sha256')
    registry = {
      artifact: 'RELEASE_PROVENANCE_REGISTRY',
      schema_version: 1,
      registry_hash_alg: 'sha256',
      registry_hash: emptyHash,
      entry_count: 0,
      entries: emptyEntries,
    }
  }

  try {
    const updatedRegistry = appendProvenanceEntry(registry, newEntry)

    const appended = updatedRegistry.entries[updatedRegistry.entries.length - 1]
    const equivalence = verifyProvenanceEquivalence(newEntry, appended)
    if (!equivalence.equivalent) {
      console.error(
        `NULL — ${REGISTRY_FAILURE_CLASSES.RELEASE_REGISTRY_MUTATION_AFTER_GENERATION}: provenance entry was mutated during append`,
      )
      process.exit(1)
    }

    writeFileSync(registryPath, JSON.stringify(updatedRegistry, null, 2) + '\n')
    console.log(
      `OK — appended ${newEntry.release_id} to registry (${updatedRegistry.entry_count} entries, hash: ${updatedRegistry.registry_hash.substring(0, 16)}...)`,
    )
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
