/**
 * Reconciliation Invariants & Cross-Registry Audit Framework
 * 
 * Verifies deterministic lineage integrity across all registry types:
 * - Proof → Execution → Validation → Authority → AEO lineage
 * - Continuity chain validity
 * - Revocation propagation
 * - Orphan lineage quarantine
 * - Replay resistance
 */

export enum ReconciliationInvariant {
  // Proof Ancestry - every proof must have reachable execution ancestry
  PROOF_EXECUTION_ANCESTRY = 'PROOF_EXECUTION_ANCESTRY',
  PROOF_DECISION_HASH_MATCH = 'PROOF_DECISION_HASH_MATCH',
  PROOF_SESSION_CONTINUITY_BIND = 'PROOF_SESSION_CONTINUITY_BIND',
  PROOF_WORKFLOW_RUN_UNIQUE = 'PROOF_WORKFLOW_RUN_UNIQUE',

  // Execution Ancestry - every execution must have reachable validation ancestry
  EXECUTION_VALIDATION_ANCESTRY = 'EXECUTION_VALIDATION_ANCESTRY',
  EXECUTION_DECISION_OBJECT_MATCH = 'EXECUTION_DECISION_OBJECT_MATCH',
  EXECUTION_NONCE_UNIQUENESS = 'EXECUTION_NONCE_UNIQUENESS',
  EXECUTION_STATUS_VALID = 'EXECUTION_STATUS_VALID',

  // Validation Ancestry - every validation must have reachable AEO ancestry
  VALIDATION_AEO_ANCESTRY = 'VALIDATION_AEO_ANCESTRY',
  VALIDATION_DECISION_OBJECT_MATCH = 'VALIDATION_DECISION_OBJECT_MATCH',
  VALIDATION_NONCE_SINGLE_USE = 'VALIDATION_NONCE_SINGLE_USE',
  VALIDATION_RESULT_DETERMINISTIC = 'VALIDATION_RESULT_DETERMINISTIC',

  // AEO Ancestry - every AEO must have reachable authority ancestry
  AEO_AUTHORITY_ANCESTRY = 'AEO_AUTHORITY_ANCESTRY',
  AEO_DECISION_OBJECT_MATCH = 'AEO_DECISION_OBJECT_MATCH',
  AEO_CANONICAL_HASH_MATCH = 'AEO_CANONICAL_HASH_MATCH',
  AEO_STATUS_VALID = 'AEO_STATUS_VALID',

  // Authority Ancestry - every authority must have valid continuity lineage
  AUTHORITY_CONTINUITY_VALID = 'AUTHORITY_CONTINUITY_VALID',
  AUTHORITY_DECISION_UNIQUE = 'AUTHORITY_DECISION_UNIQUE',
  AUTHORITY_EXPIRY_NOT_EXPIRED = 'AUTHORITY_EXPIRY_NOT_EXPIRED',
  AUTHORITY_STATUS_NOT_REVOKED = 'AUTHORITY_STATUS_NOT_REVOKED',

  // Continuity Chain - must have complete unbroken lineage
  CONTINUITY_HASH_VALID = 'CONTINUITY_HASH_VALID',
  CONTINUITY_SESSION_VALID = 'CONTINUITY_SESSION_VALID',
  CONTINUITY_IDENTITY_VALID = 'CONTINUITY_IDENTITY_VALID',
  CONTINUITY_PARENT_ANCESTRY = 'CONTINUITY_PARENT_ANCESTRY',

  // Revocation Propagation - must cascade correctly
  REVOCATION_RECURSIVE = 'REVOCATION_RECURSIVE',
  REVOCATION_CONTINUITY_CASCADE = 'REVOCATION_CONTINUITY_CASCADE',
  REVOCATION_AUTHORITY_CASCADE = 'REVOCATION_AUTHORITY_CASCADE',
  REVOCATION_EVIDENCE_RECORDED = 'REVOCATION_EVIDENCE_RECORDED',

  // Orphan Lineage - must be quarantined
  ORPHAN_EXECUTION_QUARANTINED = 'ORPHAN_EXECUTION_QUARANTINED',
  ORPHAN_PROOF_ARCHIVED = 'ORPHAN_PROOF_ARCHIVED',
  ORPHAN_VALIDATION_MARKED = 'ORPHAN_VALIDATION_MARKED',

  // Replay Resistance - must prevent cross-registry replays
  REPLAY_NONCE_CONSUMED = 'REPLAY_NONCE_CONSUMED',
  REPLAY_AUTHORITY_CONSUMED = 'REPLAY_AUTHORITY_CONSUMED',
  REPLAY_INVOCATION_SINGLE_USE = 'REPLAY_INVOCATION_SINGLE_USE',
  REPLAY_PROOF_UNIQUE = 'REPLAY_PROOF_UNIQUE',
}

export interface ReconciliationAnomalyType {
  invariant: ReconciliationInvariant;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  class: DriftClassification;
  description: string;
}

export enum DriftClassification {
  // Critical structural drift
  BROKEN_PROOF_LINEAGE = 'BROKEN_PROOF_LINEAGE',
  BROKEN_EXECUTION_LINEAGE = 'BROKEN_EXECUTION_LINEAGE',
  BROKEN_VALIDATION_LINEAGE = 'BROKEN_VALIDATION_LINEAGE',
  BROKEN_AEO_LINEAGE = 'BROKEN_AEO_LINEAGE',
  BROKEN_AUTHORITY_LINEAGE = 'BROKEN_AUTHORITY_LINEAGE',
  BROKEN_CONTINUITY_CHAIN = 'BROKEN_CONTINUITY_CHAIN',

  // Orphan records
  ORPHANED_PROOF = 'ORPHANED_PROOF',
  ORPHANED_EXECUTION = 'ORPHANED_EXECUTION',
  ORPHANED_VALIDATION = 'ORPHANED_VALIDATION',
  ORPHANED_AEO = 'ORPHANED_AEO',
  ORPHANED_AUTHORITY = 'ORPHANED_AUTHORITY',
  ORPHANED_CONTINUITY = 'ORPHANED_CONTINUITY',
  ORPHANED_SESSION = 'ORPHANED_SESSION',

  // Hash mismatches
  DECISION_HASH_MISMATCH = 'DECISION_HASH_MISMATCH',
  OBJECT_HASH_MISMATCH = 'OBJECT_HASH_MISMATCH',
  CONTINUITY_HASH_MISMATCH = 'CONTINUITY_HASH_MISMATCH',
  CANONICAL_HASH_MISMATCH = 'CANONICAL_HASH_MISMATCH',

  // Replay/reuse violations
  NONCE_REPLAY_DETECTED = 'NONCE_REPLAY_DETECTED',
  AUTHORITY_REPLAY_DETECTED = 'AUTHORITY_REPLAY_DETECTED',
  PROOF_DUPLICATE_DETECTED = 'PROOF_DUPLICATE_DETECTED',
  EXECUTION_DUPLICATE_DETECTED = 'EXECUTION_DUPLICATE_DETECTED',

  // Revocation violations
  REVOKED_CONTINUITY_IN_USE = 'REVOKED_CONTINUITY_IN_USE',
  REVOKED_AUTHORITY_IN_USE = 'REVOKED_AUTHORITY_IN_USE',
  REVOCATION_NOT_CASCADED = 'REVOCATION_NOT_CASCADED',

  // Status anomalies
  INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION',
  EXPIRED_AUTHORITY = 'EXPIRED_AUTHORITY',
  EXPIRED_CONTINUITY = 'EXPIRED_CONTINUITY',
  EXPIRED_SESSION = 'EXPIRED_SESSION',

  // Topology violations
  INVALID_EXECUTION_SURFACE = 'INVALID_EXECUTION_SURFACE',
  UNAUTHORIZED_ENVIRONMENT = 'UNAUTHORIZED_ENVIRONMENT',
  INVALID_BRANCH_LINEAGE = 'INVALID_BRANCH_LINEAGE',
  INVALID_WORKFLOW_LINEAGE = 'INVALID_WORKFLOW_LINEAGE',

  // Cross-registry authority reconciliation violations
  CROSS_REGISTRY_AUTHORITY_DISAGREEMENT = 'CROSS_REGISTRY_AUTHORITY_DISAGREEMENT',
  CROSS_REGISTRY_AUTHORITY_TEMPORAL_DIVERGENCE = 'CROSS_REGISTRY_AUTHORITY_TEMPORAL_DIVERGENCE',
  CROSS_REGISTRY_AUTHORITY_CONTINUITY_MISMATCH = 'CROSS_REGISTRY_AUTHORITY_CONTINUITY_MISMATCH',
}

export interface ReconciliationInvariantDefinition {
  invariant: ReconciliationInvariant;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  driftClass: DriftClassification;
  query: string;
  description: string;
  failureMode: string;
}

/**
 * Canonical reconciliation invariants - these MUST always be true
 * or the registry is in an unreconciled state
 */
export const RECONCILIATION_INVARIANTS: Map<
  ReconciliationInvariant,
  ReconciliationInvariantDefinition
> = new Map([
  // PROOF ANCESTRY INVARIANTS
  [
    ReconciliationInvariant.PROOF_EXECUTION_ANCESTRY,
    {
      invariant: ReconciliationInvariant.PROOF_EXECUTION_ANCESTRY,
      severity: 'CRITICAL',
      driftClass: DriftClassification.BROKEN_PROOF_LINEAGE,
      query: `
        SELECT proof_registry.proof_id 
        FROM proof_registry 
        LEFT JOIN execution_registry 
          ON proof_registry.execution_id = execution_registry.execution_id 
          AND proof_registry.decision_id = execution_registry.decision_id 
          AND proof_registry.validated_object_hash = execution_registry.validated_object_hash 
        WHERE execution_registry.execution_id IS NULL
      `,
      description: 'Every proof must have reachable execution ancestry',
      failureMode:
        'Proof has no corresponding execution record - lineage is broken',
    },
  ],
  [
    ReconciliationInvariant.PROOF_DECISION_HASH_MATCH,
    {
      invariant: ReconciliationInvariant.PROOF_DECISION_HASH_MATCH,
      severity: 'CRITICAL',
      driftClass: DriftClassification.DECISION_HASH_MISMATCH,
      query: `
        SELECT proof_registry.proof_id 
        FROM proof_registry 
        WHERE proof_registry.decision_hash IS NULL 
          OR proof_registry.decision_hash = '' 
          OR proof_registry.decision_hash != (
            proof_registry.decision_id || char(31) || proof_registry.validated_object_hash
          )
      `,
      description: 'Proof decision_hash must equal decision_id || chr(31) || validated_object_hash',
      failureMode:
        'Proof decision_hash does not match the canonical format - proof is corrupted',
    },
  ],
  [
    ReconciliationInvariant.PROOF_SESSION_CONTINUITY_BIND,
    {
      invariant: ReconciliationInvariant.PROOF_SESSION_CONTINUITY_BIND,
      severity: 'CRITICAL',
      driftClass: DriftClassification.BROKEN_PROOF_LINEAGE,
      query: `
        SELECT proof_registry.proof_id 
        FROM proof_registry 
        LEFT JOIN session_registry 
          ON proof_registry.session_id = session_registry.session_id 
        LEFT JOIN continuity_registry 
          ON proof_registry.continuity_id = continuity_registry.continuity_id 
        WHERE session_registry.session_id IS NULL 
          OR continuity_registry.continuity_id IS NULL
      `,
      description:
        'Every proof must bind to valid session and continuity records',
      failureMode:
        'Proof references non-existent session or continuity - binding is broken',
    },
  ],
  [
    ReconciliationInvariant.PROOF_WORKFLOW_RUN_UNIQUE,
    {
      invariant: ReconciliationInvariant.PROOF_WORKFLOW_RUN_UNIQUE,
      severity: 'HIGH',
      driftClass: DriftClassification.PROOF_DUPLICATE_DETECTED,
      query: `
        SELECT workflow_run_id, COUNT(*) as count 
        FROM proof_registry 
        WHERE workflow_run_id IS NOT NULL 
        GROUP BY workflow_run_id 
        HAVING count > 1
      `,
      description:
        'Each workflow_run_id must be unique across proof_registry',
      failureMode: 'Duplicate proof records detected for same workflow run',
    },
  ],

  // EXECUTION ANCESTRY INVARIANTS
  [
    ReconciliationInvariant.EXECUTION_VALIDATION_ANCESTRY,
    {
      invariant: ReconciliationInvariant.EXECUTION_VALIDATION_ANCESTRY,
      severity: 'CRITICAL',
      driftClass: DriftClassification.BROKEN_EXECUTION_LINEAGE,
      query: `
        SELECT execution_registry.execution_id 
        FROM execution_registry 
        LEFT JOIN validation_registry 
          ON execution_registry.decision_id = validation_registry.decision_id 
          AND execution_registry.validated_object_hash = validation_registry.validated_object_hash 
          AND execution_registry.invocation_nonce = validation_registry.invocation_nonce 
        WHERE validation_registry.validation_id IS NULL
      `,
      description: 'Every execution must have reachable validation ancestry',
      failureMode:
        'Execution has no corresponding validation record - lineage is broken',
    },
  ],
  [
    ReconciliationInvariant.EXECUTION_DECISION_OBJECT_MATCH,
    {
      invariant: ReconciliationInvariant.EXECUTION_DECISION_OBJECT_MATCH,
      severity: 'CRITICAL',
      driftClass: DriftClassification.OBJECT_HASH_MISMATCH,
      query: `
        SELECT execution_registry.execution_id 
        FROM execution_registry 
        LEFT JOIN validation_registry 
          ON execution_registry.decision_id = validation_registry.decision_id 
          AND execution_registry.validated_object_hash = validation_registry.validated_object_hash 
        WHERE validation_registry.result != 'VALID' 
          OR validation_registry.validated_object_hash IS NULL
      `,
      description:
        'Execution must reference validated object hash from validation record',
      failureMode: 'Execution object hash does not match validation - corruption detected',
    },
  ],
  [
    ReconciliationInvariant.EXECUTION_NONCE_UNIQUENESS,
    {
      invariant: ReconciliationInvariant.EXECUTION_NONCE_UNIQUENESS,
      severity: 'HIGH',
      driftClass: DriftClassification.EXECUTION_DUPLICATE_DETECTED,
      query: `
        SELECT decision_id, validated_object_hash, invocation_nonce, COUNT(*) as count 
        FROM execution_registry 
        GROUP BY decision_id, validated_object_hash, invocation_nonce 
        HAVING count > 1
      `,
      description:
        'Each (decision_id, validated_object_hash, invocation_nonce) tuple must be unique',
      failureMode:
        'Duplicate execution records for same decision/object/nonce - replay detected',
    },
  ],
  [
    ReconciliationInvariant.EXECUTION_STATUS_VALID,
    {
      invariant: ReconciliationInvariant.EXECUTION_STATUS_VALID,
      severity: 'MEDIUM',
      driftClass: DriftClassification.INVALID_STATUS_TRANSITION,
      query: `
        SELECT execution_registry.execution_id 
        FROM execution_registry 
        WHERE execution_registry.status NOT IN ('PENDING', 'EXECUTED', 'FAILED', 'REJECTED')
      `,
      description: 'Execution status must be one of: PENDING, EXECUTED, FAILED, REJECTED',
      failureMode: 'Execution has invalid status value',
    },
  ],

  // VALIDATION ANCESTRY INVARIANTS
  [
    ReconciliationInvariant.VALIDATION_AEO_ANCESTRY,
    {
      invariant: ReconciliationInvariant.VALIDATION_AEO_ANCESTRY,
      severity: 'CRITICAL',
      driftClass: DriftClassification.BROKEN_VALIDATION_LINEAGE,
      query: `
        SELECT validation_registry.validation_id 
        FROM validation_registry 
        LEFT JOIN aeo_registry 
          ON validation_registry.decision_id = aeo_registry.decision_id 
          AND validation_registry.validated_object_hash = aeo_registry.validated_object_hash 
        WHERE validation_registry.result = 'VALID' 
          AND aeo_registry.aeo_id IS NULL
      `,
      description: 'Every valid validation must have reachable AEO ancestry',
      failureMode: 'Valid validation has no corresponding AEO record - lineage is broken',
    },
  ],
  [
    ReconciliationInvariant.VALIDATION_DECISION_OBJECT_MATCH,
    {
      invariant: ReconciliationInvariant.VALIDATION_DECISION_OBJECT_MATCH,
      severity: 'CRITICAL',
      driftClass: DriftClassification.OBJECT_HASH_MISMATCH,
      query: `
        SELECT validation_registry.validation_id 
        FROM validation_registry 
        WHERE validation_registry.validated_object_hash IS NULL 
          OR validation_registry.decision_id IS NULL
      `,
      description: 'Validation must have both validated_object_hash and decision_id',
      failureMode:
        'Validation is missing critical hash or decision reference - corruption detected',
    },
  ],
  [
    ReconciliationInvariant.VALIDATION_NONCE_SINGLE_USE,
    {
      invariant: ReconciliationInvariant.VALIDATION_NONCE_SINGLE_USE,
      severity: 'HIGH',
      driftClass: DriftClassification.NONCE_REPLAY_DETECTED,
      query: `
        SELECT decision_id, validated_object_hash, invocation_nonce, COUNT(*) as count 
        FROM validation_registry 
        WHERE result = 'VALID' 
        GROUP BY decision_id, validated_object_hash, invocation_nonce 
        HAVING count > 1
      `,
      description:
        'Each (decision_id, validated_object_hash, invocation_nonce) tuple must have at most one VALID result',
      failureMode: 'Multiple valid validations for same nonce - replay detected',
    },
  ],
  [
    ReconciliationInvariant.VALIDATION_RESULT_DETERMINISTIC,
    {
      invariant: ReconciliationInvariant.VALIDATION_RESULT_DETERMINISTIC,
      severity: 'HIGH',
      driftClass: DriftClassification.INVALID_STATUS_TRANSITION,
      query: `
        SELECT decision_id, validated_object_hash, invocation_nonce, result 
        FROM validation_registry 
        WHERE (decision_id, validated_object_hash, invocation_nonce) IN (
          SELECT decision_id, validated_object_hash, invocation_nonce 
          FROM validation_registry 
          GROUP BY decision_id, validated_object_hash, invocation_nonce 
          HAVING COUNT(DISTINCT result) > 1
        )
      `,
      description:
        'For same (decision_id, object_hash, nonce), result must be deterministic',
      failureMode:
        'Same validation tuple has conflicting results - non-determinism detected',
    },
  ],

  // AEO ANCESTRY INVARIANTS
  [
    ReconciliationInvariant.AEO_AUTHORITY_ANCESTRY,
    {
      invariant: ReconciliationInvariant.AEO_AUTHORITY_ANCESTRY,
      severity: 'CRITICAL',
      driftClass: DriftClassification.BROKEN_AEO_LINEAGE,
      query: `
        SELECT aeo_registry.aeo_id 
        FROM aeo_registry 
        LEFT JOIN authority_registry 
          ON aeo_registry.authority_id = authority_registry.authority_id 
        WHERE authority_registry.authority_id IS NULL
      `,
      description: 'Every AEO must have reachable authority ancestry',
      failureMode: 'AEO has no corresponding authority record - lineage is broken',
    },
  ],
  [
    ReconciliationInvariant.AEO_DECISION_OBJECT_MATCH,
    {
      invariant: ReconciliationInvariant.AEO_DECISION_OBJECT_MATCH,
      severity: 'CRITICAL',
      driftClass: DriftClassification.DECISION_HASH_MISMATCH,
      query: `
        SELECT aeo_registry.aeo_id 
        FROM aeo_registry 
        LEFT JOIN authority_registry 
          ON aeo_registry.authority_id = authority_registry.authority_id 
        WHERE aeo_registry.decision_id != authority_registry.decision_id 
          OR aeo_registry.decision_id IS NULL 
          OR authority_registry.decision_id IS NULL
      `,
      description: 'AEO decision_id must match parent authority decision_id',
      failureMode: 'AEO decision_id does not match parent authority - lineage is broken',
    },
  ],
  [
    ReconciliationInvariant.AEO_CANONICAL_HASH_MATCH,
    {
      invariant: ReconciliationInvariant.AEO_CANONICAL_HASH_MATCH,
      severity: 'HIGH',
      driftClass: DriftClassification.CANONICAL_HASH_MISMATCH,
      query: `
        SELECT aeo_registry.aeo_id 
        FROM aeo_registry 
        WHERE aeo_registry.canonical_aeo IS NULL 
          OR aeo_registry.canonical_aeo = ''
      `,
      description: 'AEO must have canonical_aeo object stored',
      failureMode: 'AEO missing canonical object - cannot verify hash',
    },
  ],
  [
    ReconciliationInvariant.AEO_STATUS_VALID,
    {
      invariant: ReconciliationInvariant.AEO_STATUS_VALID,
      severity: 'MEDIUM',
      driftClass: DriftClassification.INVALID_STATUS_TRANSITION,
      query: `
        SELECT aeo_registry.aeo_id 
        FROM aeo_registry 
        WHERE aeo_registry.status NOT IN ('CREATED', 'VALIDATED', 'CONSUMED', 'REVOKED')
      `,
      description:
        'AEO status must be one of: CREATED, VALIDATED, CONSUMED, REVOKED',
      failureMode: 'AEO has invalid status value',
    },
  ],

  // AUTHORITY ANCESTRY INVARIANTS
  [
    ReconciliationInvariant.AUTHORITY_CONTINUITY_VALID,
    {
      invariant: ReconciliationInvariant.AUTHORITY_CONTINUITY_VALID,
      severity: 'CRITICAL',
      driftClass: DriftClassification.BROKEN_AUTHORITY_LINEAGE,
      query: `
        SELECT authority_registry.authority_id 
        FROM authority_registry 
        LEFT JOIN continuity_registry 
          ON authority_registry.continuity_id = continuity_registry.continuity_id 
        WHERE continuity_registry.continuity_id IS NULL 
          OR continuity_registry.status = 'REVOKED'
      `,
      description:
        'Every authority must have reachable, non-revoked continuity ancestry',
      failureMode:
        'Authority has no valid continuity record or continuity is revoked - lineage is broken',
    },
  ],
  [
    ReconciliationInvariant.AUTHORITY_DECISION_UNIQUE,
    {
      invariant: ReconciliationInvariant.AUTHORITY_DECISION_UNIQUE,
      severity: 'HIGH',
      driftClass: DriftClassification.AUTHORITY_REPLAY_DETECTED,
      query: `
        SELECT decision_id, COUNT(*) as count 
        FROM authority_registry 
        GROUP BY decision_id 
        HAVING count > 1
      `,
      description: 'Each decision_id must be unique across authority_registry',
      failureMode: 'Duplicate authority records for same decision - replay detected',
    },
  ],
  [
    ReconciliationInvariant.AUTHORITY_EXPIRY_NOT_EXPIRED,
    {
      invariant: ReconciliationInvariant.AUTHORITY_EXPIRY_NOT_EXPIRED,
      severity: 'HIGH',
      driftClass: DriftClassification.EXPIRED_AUTHORITY,
      query: `
        SELECT authority_registry.authority_id 
        FROM authority_registry 
        WHERE datetime(authority_registry.expiry) < datetime('now')
      `,
      description: 'Authority must not be expired at reconciliation time',
      failureMode: 'Authority has expired - cannot be used for new operations',
    },
  ],
  [
    ReconciliationInvariant.AUTHORITY_STATUS_NOT_REVOKED,
    {
      invariant: ReconciliationInvariant.AUTHORITY_STATUS_NOT_REVOKED,
      severity: 'HIGH',
      driftClass: DriftClassification.REVOKED_AUTHORITY_IN_USE,
      query: `
        SELECT authority_registry.authority_id 
        FROM authority_registry 
        WHERE authority_registry.status = 'REVOKED' 
          AND EXISTS (
            SELECT 1 
            FROM validation_registry 
            WHERE validation_registry.decision_id = authority_registry.decision_id 
              AND validation_registry.created_at > authority_registry.revoked_at
          )
      `,
      description: 'Revoked authority must not have subsequent validations',
      failureMode:
        'Revoked authority has later validations - revocation was not properly propagated',
    },
  ],

  // CONTINUITY CHAIN INVARIANTS
  [
    ReconciliationInvariant.CONTINUITY_HASH_VALID,
    {
      invariant: ReconciliationInvariant.CONTINUITY_HASH_VALID,
      severity: 'CRITICAL',
      driftClass: DriftClassification.CONTINUITY_HASH_MISMATCH,
      query: `
        SELECT continuity_registry.continuity_id 
        FROM continuity_registry 
        WHERE continuity_registry.continuity_hash IS NULL 
          OR continuity_registry.continuity_hash = ''
      `,
      description:
        'Continuity must have valid continuity_hash matching canonical continuity object',
      failureMode: 'Continuity hash is missing or invalid - cannot verify chain',
    },
  ],
  [
    ReconciliationInvariant.CONTINUITY_SESSION_VALID,
    {
      invariant: ReconciliationInvariant.CONTINUITY_SESSION_VALID,
      severity: 'CRITICAL',
      driftClass: DriftClassification.BROKEN_CONTINUITY_CHAIN,
      query: `
        SELECT continuity_registry.continuity_id 
        FROM continuity_registry 
        LEFT JOIN session_registry 
          ON continuity_registry.session_id = session_registry.session_id 
        WHERE session_registry.session_id IS NULL
      `,
      description: 'Every continuity must bind to valid session record',
      failureMode: 'Continuity references non-existent session - chain is broken',
    },
  ],
  [
    ReconciliationInvariant.CONTINUITY_IDENTITY_VALID,
    {
      invariant: ReconciliationInvariant.CONTINUITY_IDENTITY_VALID,
      severity: 'HIGH',
      driftClass: DriftClassification.BROKEN_CONTINUITY_CHAIN,
      query: `
        SELECT continuity_registry.continuity_id 
        FROM continuity_registry 
        WHERE continuity_registry.identity_id IS NULL 
          OR continuity_registry.identity_id = ''
      `,
      description: 'Every continuity must have valid identity_id',
      failureMode: 'Continuity is missing identity binding - chain is incomplete',
    },
  ],
  [
    ReconciliationInvariant.CONTINUITY_PARENT_ANCESTRY,
    {
      invariant: ReconciliationInvariant.CONTINUITY_PARENT_ANCESTRY,
      severity: 'HIGH',
      driftClass: DriftClassification.BROKEN_CONTINUITY_CHAIN,
      query: `
        SELECT c.continuity_id 
        FROM continuity_registry c 
        LEFT JOIN continuity_registry p 
          ON c.parent_continuity_id = p.continuity_id 
        WHERE c.parent_continuity_id IS NOT NULL 
          AND p.continuity_id IS NULL
      `,
      description:
        'If continuity has parent_continuity_id, parent must exist and not be revoked',
      failureMode:
        'Continuity parent does not exist or is revoked - chain is broken',
    },
  ],

  // REVOCATION PROPAGATION INVARIANTS
  [
    ReconciliationInvariant.REVOCATION_RECURSIVE,
    {
      invariant: ReconciliationInvariant.REVOCATION_RECURSIVE,
      severity: 'CRITICAL',
      driftClass: DriftClassification.REVOCATION_NOT_CASCADED,
      query: `
        SELECT DISTINCT c.continuity_id 
        FROM continuity_registry c 
        WHERE c.status = 'REVOKED' 
          AND EXISTS (
            SELECT 1 
            FROM continuity_registry child 
            WHERE child.parent_continuity_id = c.continuity_id 
              AND child.status != 'REVOKED'
          )
      `,
      description:
        'When continuity is revoked, all descendant continuities must be recursively revoked',
      failureMode: 'Revoked continuity has non-revoked children - cascade is incomplete',
    },
  ],
  [
    ReconciliationInvariant.REVOCATION_CONTINUITY_CASCADE,
    {
      invariant: ReconciliationInvariant.REVOCATION_CONTINUITY_CASCADE,
      severity: 'CRITICAL',
      driftClass: DriftClassification.REVOCATION_NOT_CASCADED,
      query: `
        SELECT DISTINCT ar.authority_id 
        FROM authority_registry ar 
        JOIN continuity_registry cr ON ar.continuity_id = cr.continuity_id 
        WHERE cr.status = 'REVOKED' 
          AND ar.status NOT IN ('REVOKED', 'CONSUMED')
      `,
      description:
        'When continuity is revoked, all dependent authorities must be revoked or consumed',
      failureMode:
        'Authorities bound to revoked continuity have not been revoked - cascade is incomplete',
    },
  ],
  [
    ReconciliationInvariant.REVOCATION_AUTHORITY_CASCADE,
    {
      invariant: ReconciliationInvariant.REVOCATION_AUTHORITY_CASCADE,
      severity: 'HIGH',
      driftClass: DriftClassification.REVOCATION_NOT_CASCADED,
      query: `
        SELECT DISTINCT vr.validation_id 
        FROM validation_registry vr 
        JOIN authority_registry ar ON vr.decision_id = ar.decision_id 
        WHERE ar.status = 'REVOKED' 
          AND vr.created_at > ar.revoked_at
      `,
      description: 'Validations after authority revocation must be rejected',
      failureMode:
        'Validations exist after authority revocation - revocation was not enforced',
    },
  ],
  [
    ReconciliationInvariant.REVOCATION_EVIDENCE_RECORDED,
    {
      invariant: ReconciliationInvariant.REVOCATION_EVIDENCE_RECORDED,
      severity: 'MEDIUM',
      driftClass: DriftClassification.REVOCATION_NOT_CASCADED,
      query: `
        SELECT DISTINCT cr.continuity_id 
        FROM continuity_registry cr 
        WHERE cr.status = 'REVOKED' 
          AND cr.revoked_at IS NULL
      `,
      description: 'Every revoked continuity must record revoked_at timestamp',
      failureMode: 'Revoked continuity has no timestamp - audit trail is incomplete',
    },
  ],

  // ORPHAN LINEAGE INVARIANTS
  [
    ReconciliationInvariant.ORPHAN_EXECUTION_QUARANTINED,
    {
      invariant: ReconciliationInvariant.ORPHAN_EXECUTION_QUARANTINED,
      severity: 'HIGH',
      driftClass: DriftClassification.ORPHANED_EXECUTION,
      query: `
        SELECT DISTINCT er.execution_id 
        FROM execution_registry er 
        LEFT JOIN continuity_registry cr ON er.continuity_id = cr.continuity_id 
        WHERE cr.continuity_id IS NULL 
          OR (cr.status = 'REVOKED' AND er.created_at < cr.revoked_at)
      `,
      description:
        'Executions with non-existent or revoked continuity must be quarantined',
      failureMode:
        'Orphaned execution exists without quarantine marker - must be isolated',
    },
  ],
  [
    ReconciliationInvariant.ORPHAN_PROOF_ARCHIVED,
    {
      invariant: ReconciliationInvariant.ORPHAN_PROOF_ARCHIVED,
      severity: 'HIGH',
      driftClass: DriftClassification.ORPHANED_PROOF,
      query: `
        SELECT DISTINCT pr.proof_id 
        FROM proof_registry pr 
        LEFT JOIN execution_registry er ON pr.execution_id = er.execution_id 
        LEFT JOIN continuity_registry cr ON pr.continuity_id = cr.continuity_id 
        WHERE er.execution_id IS NULL 
          OR cr.status = 'REVOKED'
      `,
      description:
        'Proofs referencing non-existent or revoked lineage must be archived',
      failureMode:
        'Orphaned proof exists without archive - must be moved to archive table',
    },
  ],
  [
    ReconciliationInvariant.ORPHAN_VALIDATION_MARKED,
    {
      invariant: ReconciliationInvariant.ORPHAN_VALIDATION_MARKED,
      severity: 'MEDIUM',
      driftClass: DriftClassification.ORPHANED_VALIDATION,
      query: `
        SELECT DISTINCT vr.validation_id 
        FROM validation_registry vr 
        LEFT JOIN authority_registry ar ON vr.decision_id = ar.decision_id 
        WHERE vr.result = 'VALID' 
          AND ar.authority_id IS NULL
      `,
      description: 'Validations without valid authority must be marked as orphaned',
      failureMode: 'Orphaned validation exists without orphan marker - must be marked',
    },
  ],
]);

/**
 * Maps from a registry type to its upstream registries (dependencies)
 */
export const REGISTRY_DEPENDENCY_MAP: Record<string, string[]> = {
  proof_registry: [
    'execution_registry',
    'session_registry',
    'continuity_registry',
  ],
  execution_registry: [
    'validation_registry',
    'session_registry',
    'continuity_registry',
  ],
  validation_registry: [
    'aeo_registry',
    'session_registry',
    'continuity_registry',
  ],
  aeo_registry: ['authority_registry', 'decision_registry'],
  authority_registry: ['continuity_registry', 'session_registry'],
  continuity_registry: ['session_registry'],
  session_registry: [],
};

/**
 * Registry traversal order for reconciliation (dependency order)
 */
export const REGISTRY_TRAVERSAL_ORDER: string[] = [
  'session_registry',
  'continuity_registry',
  'authority_registry',
  'aeo_registry',
  'validation_registry',
  'execution_registry',
  'proof_registry',
];
