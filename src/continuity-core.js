// Correctness-critical ContinuityOS continuity-core primitives.
// Mirrors the Rust continuity-core crate interface for cross-language conformance.
// Pure: no network calls, no storage, no side effects.

import { canonicalize, sha256Hex } from './canonical.js'

// ─── AEO validation ──────────────────────────────────────────────────────────

const REQUIRED_AEO_FIELDS = Object.freeze(['finality', 'intent', 'scope', 'target', 'validation'])

// Mirrors Rust aeo_object_for_hash(): returns a copy with validation.object_hash set to null.
export function aeoObjectForHash(aeo) {
  const clone = JSON.parse(JSON.stringify(aeo))
  if (clone.validation && typeof clone.validation === 'object' && !Array.isArray(clone.validation)) {
    clone.validation.object_hash = null
  }
  return clone
}

// Mirrors Rust validate_aeo().
// Returns 'VALID' | 'NULL'.
//
// Mandatory checks (always enforced):
//   1. AEO has exactly 5 required top-level fields.
//   2. Each field is a non-array plain object.
//   3. authority_id matches expected_authority when expected_authority is provided.
//
// Conditional checks (enforced when context provides the binding):
//   4. scope.bounds are within maximum_scope — enforced when context.maximum_scope is set.
//      When absent, scope policy is enforced by the surface-specific Ω validator.
//   5. validation.object_hash matches the canonical hash — enforced when object_hash is present.
//      When absent, hash binding is enforced downstream by executeWithAdapter
//      (validated_object_hash == executed_object_hash invariant).
//
// Surface-specific AEO formats (e.g. FilesystemAEO) that do not yet carry
// validation.object_hash or scope.bounds pass checks 1–3 unconditionally and
// gain full enforcement when their AEO type evolves to the canonical form.
export function validateAeo(aeo, context) {
  if (!aeo || typeof aeo !== 'object' || Array.isArray(aeo)) return 'NULL'

  const keys = Object.keys(aeo).sort()
  if (keys.length !== REQUIRED_AEO_FIELDS.length) return 'NULL'
  for (let i = 0; i < REQUIRED_AEO_FIELDS.length; i++) {
    if (keys[i] !== REQUIRED_AEO_FIELDS[i]) return 'NULL'
  }

  const expected = context?.expected_authority
  for (const section of REQUIRED_AEO_FIELDS) {
    if (!aeo[section] || typeof aeo[section] !== 'object' || Array.isArray(aeo[section])) return 'NULL'
    if (expected !== undefined && aeo[section].authority_id !== expected) return 'NULL'
  }

  if (context?.maximum_scope !== undefined) {
    const bounds = aeo.scope?.bounds
    if (!Array.isArray(bounds) || bounds.length === 0) return 'NULL'
    if (bounds.some(b => typeof b !== 'string' || b.trim() === '')) return 'NULL'
    const maximumScope = new Set(context.maximum_scope)
    for (const bound of bounds) {
      if (!maximumScope.has(bound)) return 'NULL'
    }
  }

  const storedHash = aeo.validation?.object_hash
  if (storedHash !== undefined) {
    if (typeof storedHash !== 'string' || storedHash.length !== 64) return 'NULL'
    const computed = sha256Hex(canonicalize(aeoObjectForHash(aeo)))
    if (computed !== storedHash) return 'NULL'
  }

  return 'VALID'
}

// ─── Lineage ──────────────────────────────────────────────────────────────────

// Mirrors Rust LineageGraph.
// Returns an object with insert(), classify(), and classifyAsValidation() methods.
export function createLineageGraph() {
  const nodes = new Map()

  return {
    // Returns 'VALID' | 'AMBIGUOUS'. Mirrors LineageGraph::insert().
    insert(node) {
      if (nodes.has(node.id)) return 'AMBIGUOUS'
      nodes.set(node.id, node)
      return 'VALID'
    },

    // Returns 'VALID' | 'ORPHAN' | 'NULL'. Mirrors LineageGraph::classify().
    classify(id) {
      const node = nodes.get(id)
      if (!node) return 'NULL'
      for (const parentId of node.parent_ids) {
        if (!nodes.has(parentId)) return 'ORPHAN'
      }
      return 'VALID'
    },

    // Mirrors LineageGraph::classify_as_validation(): ORPHAN resolves to NULL.
    // Returns 'VALID' | 'AMBIGUOUS' | 'NULL'.
    classifyAsValidation(id) {
      const state = this.classify(id)
      return state === 'ORPHAN' ? 'NULL' : state
    },
  }
}

// ─── Proof envelope ───────────────────────────────────────────────────────────

// Mirrors Rust ProofEnvelope::from_evidence().
// Returns a proof envelope object or null when evidence is absent or invalid.
export function buildProofEnvelope(proofId, evidence) {
  if (!evidence) return null

  const { execution_id, decision_id, aeo_hash, target_system, target_action, result, timestamp, evidence_object } = evidence

  if (!result || !result.trim()) return null
  if (!timestamp || !timestamp.trim()) return null
  if (evidence_object === null || evidence_object === undefined) return null

  const evidenceHash = sha256Hex(canonicalize(evidence_object))

  return {
    proof_id: proofId,
    execution_id,
    decision_id,
    aeo_hash,
    target_system,
    target_action,
    result,
    timestamp,
    evidence_hash: evidenceHash,
  }
}

// ─── Reconciliation ──────────────────────────────────────────────────────────

// Mirrors Rust classify_reconciliation().
// Returns 'RECONCILED' | 'DIVERGENT' | 'AMBIGUOUS' | 'PARTIAL' | 'NULL'.
export function classifyReconciliation(evidence) {
  if (!evidence) return 'NULL'

  const { expected_hash, observed_hash, lineage_complete, proof_present, observations_complete, ambiguity_detected } = evidence

  if (expected_hash == null || observed_hash == null) return 'PARTIAL'
  if (ambiguity_detected) return 'AMBIGUOUS'
  if (!lineage_complete || !proof_present || !observations_complete) return 'PARTIAL'
  if (expected_hash === observed_hash) return 'RECONCILED'
  return 'DIVERGENT'
}

// ─── Replay registry ─────────────────────────────────────────────────────────

// Mirrors Rust ReplayRegistry.
// Returns an object with classify() and admit() methods.
export function createReplayRegistry() {
  const usedNonces = new Set()
  const usedObjectHashes = new Set()

  return {
    // Mirrors ReplayRegistry::classify().
    // Returns 'UNUSED' | 'USED' | 'AMBIGUOUS' | 'NULL'.
    classify(nonce, objectHash, lineageBinding) {
      if (!nonce || !objectHash || !lineageBinding) return 'NULL'
      const nonceUsed = usedNonces.has(nonce)
      const hashUsed = usedObjectHashes.has(objectHash)
      if (!nonceUsed && !hashUsed) return 'UNUSED'
      if (nonceUsed && hashUsed) return 'USED'
      return 'AMBIGUOUS'
    },

    // Mirrors ReplayRegistry::admit().
    // Returns 'UNUSED' on first use; NULL on reuse or missing inputs.
    admit(nonce, objectHash, lineageBinding) {
      const state = this.classify(nonce, objectHash, lineageBinding)
      if (state === 'UNUSED') {
        usedNonces.add(nonce)
        usedObjectHashes.add(objectHash)
        return 'UNUSED'
      }
      return 'NULL'
    },
  }
}
