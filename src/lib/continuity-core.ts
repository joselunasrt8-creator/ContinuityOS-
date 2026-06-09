/**
 * continuity-core TypeScript interface
 *
 * Defines the portable kernel boundary for V3.  Nothing in this module
 * imports a Request, Response, URL, Headers, Env, D1Database, or any
 * cloud-specific handle.  Every type here has a named counterpart in
 * the Rust continuity-core crate.
 *
 * The six-layer chain:
 *   canonical object → deterministic hash → read-only validation
 *   → exact-object boundary → replay / authority checks → append-only proof
 *
 * Invariants (must hold across every implementation):
 *   If no valid object exists → nothing happens.
 *   validated_object == executed_object
 */

// ─── AEO field types ──────────────────────────────────────────────────────────

export type AEOIntent = {
  id: string
  authority_id: string
  nonce: string
  [key: string]: unknown
}

export type AEOScope = {
  authority_id: string
  bounds: string[]
}

export type AEOValidation = {
  authority_id: string
  lineage_id: string
  object_hash: string | null
}

export type AEOTarget = {
  authority_id: string
  system: string
  action: string
}

export type AEOFinality = {
  authority_id: string
  mode: string
}

/** Exact 5-field Authorized Execution Object — the canonical governed unit. */
export type AEO = {
  intent: AEOIntent
  scope: AEOScope
  validation: AEOValidation
  target: AEOTarget
  finality: AEOFinality
}

// ─── Validation context ───────────────────────────────────────────────────────

/** Read-only authority context supplied at validation time. */
export type AeoValidationContext = {
  expected_authority: string
  maximum_scope: string[]
}

// ─── Decision types ───────────────────────────────────────────────────────────

/** Layer 3 output: exact-object boundary decision. */
export type ValidationDecision = 'VALID' | 'NULL'

/** Layer 4 output: lineage node classification. ORPHAN resolves to NULL at the execution boundary. */
export type LineageState = 'VALID' | 'ORPHAN' | 'AMBIGUOUS' | 'NULL'

/** Layer 5 output: replay registry classification. */
export type ReplayState = 'UNUSED' | 'USED' | 'AMBIGUOUS' | 'NULL'

/** Offline reconciliation state — must never influence VALID / NULL on the hot path. */
export type ReconciliationState = 'RECONCILED' | 'DIVERGENT' | 'AMBIGUOUS' | 'PARTIAL' | 'NULL'

// ─── Execution evidence & proof envelope ─────────────────────────────────────

/**
 * Evidence produced by a governed execution.
 * Mirrors Rust ExecutionEvidence.
 */
export type ExecutionEvidence = {
  execution_id: string
  decision_id: string
  aeo_hash: string
  target_system: string
  target_action: string
  result: string
  timestamp: string
  evidence_object: Record<string, unknown>
}

/**
 * Append-only proof receipt.  Cannot be created without passing the VALID gate.
 * Mirrors Rust ProofEnvelope.
 */
export type ProofEnvelope = {
  proof_id: string
  execution_id: string
  decision_id: string
  aeo_hash: string
  target_system: string
  target_action: string
  result: string
  timestamp: string
  evidence_hash: string
}

// ─── Lineage graph ────────────────────────────────────────────────────────────

export type LineageNodeKind = 'authority' | 'proof' | 'execution'

/** Mirrors Rust LineageNode. */
export type LineageNode = {
  id: string
  parent_ids: string[]
  kind: LineageNodeKind
}

/** Mirrors Rust LineageGraph. Read-only at execution time. */
export interface LineageGraph {
  insert(node: LineageNode): 'VALID' | 'AMBIGUOUS'
  classify(id: string): LineageState
  classifyAsValidation(id: string): Exclude<LineageState, 'ORPHAN'>
}

// ─── Replay registry ──────────────────────────────────────────────────────────

/** Mirrors Rust ReplayRegistry. Nonce + hash deduplication; append-only state. */
export interface ReplayRegistry {
  classify(nonce: string, objectHash: string, lineageBinding: string): ReplayState
  admit(nonce: string, objectHash: string, lineageBinding: string): 'UNUSED' | 'NULL'
}

// ─── Reconciliation evidence ──────────────────────────────────────────────────

/** Mirrors Rust ReconciliationEvidence. Offline only. */
export type ReconciliationEvidence = {
  expected_hash: string | null
  observed_hash: string | null
  lineage_complete: boolean
  proof_present: boolean
  observations_complete: boolean
  ambiguity_detected: boolean
}

// ─── The continuity-core interface ────────────────────────────────────────────

/**
 * Every implementation of continuity-core — TypeScript, Rust, Wasm — must
 * satisfy this interface against the golden conformance fixtures.
 *
 * Layer mapping:
 *   Layer 1  canonicalize        canonical object
 *   Layer 2  sha256Hex           deterministic hash
 *   Layer 3  validateAeo         read-only validation + exact-object boundary
 *   Layer 4  createLineageGraph  authority checks (read-only)
 *   Layer 5  createReplayRegistry  replay prevention
 *   Layer 6  buildProofEnvelope  append-only proof
 */
export interface ContinuityCore {
  canonicalize(value: unknown): string
  sha256Hex(canonical: string): string
  aeoObjectForHash(aeo: unknown): unknown
  validateAeo(aeo: unknown, context: AeoValidationContext): ValidationDecision
  createLineageGraph(): LineageGraph
  createReplayRegistry(): ReplayRegistry
  buildProofEnvelope(proofId: string, evidence: ExecutionEvidence | null): ProofEnvelope | null
  classifyReconciliation(evidence: ReconciliationEvidence | null): ReconciliationState
}

// ─── Reference implementation ─────────────────────────────────────────────────

import { canonicalize as _canonicalize, sha256Hex as _sha256Hex } from '../canonical.js'
import {
  aeoObjectForHash as _aeoObjectForHash,
  validateAeo as _validateAeo,
  createLineageGraph as _createLineageGraph,
  createReplayRegistry as _createReplayRegistry,
  buildProofEnvelope as _buildProofEnvelope,
  classifyReconciliation as _classifyReconciliation,
} from '../continuity-core.js'

/** TypeScript reference implementation of ContinuityCore. */
export const continuityCoreImpl: ContinuityCore = {
  canonicalize: _canonicalize,
  sha256Hex: _sha256Hex,
  aeoObjectForHash: _aeoObjectForHash,
  validateAeo: _validateAeo,
  createLineageGraph: _createLineageGraph,
  createReplayRegistry: _createReplayRegistry,
  buildProofEnvelope: _buildProofEnvelope,
  classifyReconciliation: _classifyReconciliation,
}
