// Issue #1928: Project FilesystemAEO into CanonicalAEO for the canonical validateAeo gateway.
//
// canonical_authority_id is derived from FilesystemAEO.validation.authority_lineage_hash as a
// projection identity. This is NOT authority creation — it binds the five canonical sections
// to the same lineage anchor without granting execution eligibility, replay rights, or scope.
//
// The CanonicalAEO produced here satisfies the continuity-core validateAeo contract unchanged
// (src/continuity-core.js ≡ continuity-core/src/aeo_validation.rs, governed by V3_CONFORMANCE_SPEC):
//   1. Exactly 5 top-level keys: finality, intent, scope, target, validation
//   2. Every section: authority_id === canonical_authority_id
//   3. scope.bounds: non-empty string[], every element within context.maximum_scope
//   4. validation.object_hash: sha256(canonicalize(AEO with validation.object_hash = null))
//
// validateAeo, validate_aeo (Rust), and validateFilesystemAEO are not modified.

import type { FilesystemAEO } from './filesystem-aeo.js'
import { canonicalize, sha256Hex } from '../canonical.js'

export type CanonicalAEOFinality = {
  readonly authority_id: string
  readonly proof_required: boolean
  readonly proof_type: string
}

export type CanonicalAEOIntent = {
  readonly authority_id: string
  readonly value: string
}

export type CanonicalAEOScope = {
  readonly authority_id: string
  readonly bounds: readonly string[]
}

export type CanonicalAEOTarget = {
  readonly action: string      // canonical name — mirrors FilesystemAEO.target.operation
  readonly authority_id: string
  readonly operation: string   // extra field preserved so FilesystemExecutionAdapter can read operation
  readonly path: string
  readonly system: string
}

export type CanonicalAEOValidation = {
  readonly authority_id: string
  readonly decision_id: string
  readonly object_hash: string          // 64-char hex, no "sha256:" prefix (validateAeo checks length === 64)
  readonly proposed_diff_hash: string   // content identity binding — canonical hash covers the diff/content hash
  readonly replay_nonce: string
}

export type CanonicalAEO = {
  readonly finality: CanonicalAEOFinality
  readonly intent: CanonicalAEOIntent
  readonly scope: CanonicalAEOScope
  readonly target: CanonicalAEOTarget
  readonly validation: CanonicalAEOValidation
}

export type CanonicalAEOContext = {
  readonly expected_authority: string
  readonly maximum_scope: readonly string[]
}

export type CanonicalAEOCompilationResult =
  | {
      readonly ok: true
      readonly canonical_aeo: CanonicalAEO
      readonly canonical_aeo_hash: string
      readonly context: CanonicalAEOContext
    }
  | {
      readonly ok: false
      readonly denial_reason: string
    }

export function compileCanonicalAEOFromFilesystem(
  aeo: FilesystemAEO | null | undefined,
): CanonicalAEOCompilationResult {
  if (!aeo) return { ok: false, denial_reason: "NULL_FILESYSTEM_AEO" }

  // canonical_authority_id: projection identity from the FilesystemAEO lineage anchor.
  // All five canonical sections are bound to this identity. NOT a new authority.
  const canonical_authority_id = aeo.validation.authority_lineage_hash
  if (typeof canonical_authority_id !== 'string' || canonical_authority_id.trim().length === 0) {
    return { ok: false, denial_reason: "MISSING_CANONICAL_AUTHORITY_ID" }
  }

  // scope.bounds: namespaced scope values consumed by the validateAeo bounds containment check
  const bounds: readonly string[] = Object.freeze([
    `system:${aeo.target.system}`,
    ...aeo.scope.allowed_operations.map(op => `action:${op}`),
  ])

  const finality: CanonicalAEOFinality = Object.freeze({
    authority_id: canonical_authority_id,
    proof_required: aeo.finality.proof_required,
    proof_type: aeo.finality.proof_type,
  })

  const intent: CanonicalAEOIntent = Object.freeze({
    authority_id: canonical_authority_id,
    value: aeo.intent.purpose,
  })

  const scope: CanonicalAEOScope = Object.freeze({
    authority_id: canonical_authority_id,
    bounds,
  })

  const target: CanonicalAEOTarget = Object.freeze({
    action: aeo.target.operation,
    authority_id: canonical_authority_id,
    operation: aeo.target.operation,
    path: aeo.target.path,
    system: aeo.target.system,
  })

  // object_hash computed with validation.object_hash = null, mirroring the aeoObjectForHash
  // convention from src/continuity-core.js. Stored as raw 64-char hex (no "sha256:" prefix).
  const aeo_for_hash = {
    finality,
    intent,
    scope,
    target,
    validation: {
      authority_id: canonical_authority_id,
      decision_id: aeo.validation.decision_id,
      object_hash: null,
      proposed_diff_hash: aeo.validation.proposed_diff_hash,
      replay_nonce: aeo.validation.replay_nonce,
    },
  }
  const object_hash = sha256Hex(canonicalize(aeo_for_hash))

  const validation: CanonicalAEOValidation = Object.freeze({
    authority_id: canonical_authority_id,
    decision_id: aeo.validation.decision_id,
    object_hash,
    proposed_diff_hash: aeo.validation.proposed_diff_hash,
    replay_nonce: aeo.validation.replay_nonce,
  })

  const canonical_aeo: CanonicalAEO = Object.freeze({ finality, intent, scope, target, validation })

  // canonical_aeo_hash: sha256 of the full canonical AEO with object_hash set.
  // Passed to executeWithAdapter as validated_object_hash; the adapter recomputes this
  // hash at the boundary and requires it to match (exact-object binding invariant).
  const canonical_aeo_hash = "sha256:" + sha256Hex(canonicalize(canonical_aeo))

  const context: CanonicalAEOContext = Object.freeze({
    expected_authority: canonical_authority_id,
    maximum_scope: bounds,
  })

  return { ok: true, canonical_aeo, canonical_aeo_hash, context }
}
