import { toCanonicalAeo } from './lib/aeo-governance.js'
import type { CanonicalAEO } from './lib/aeo-governance.js'

export const GOVERNED_DEPLOY_WORKFLOW = 'governed-deploy.yml' as const

export type DeployRiskClass = 'PRODUCTION_DEPLOY' | 'PREVIEW_DEPLOY' | 'BREAK_GLASS_DEPLOY'

// ATAO: the canonical input shape for creating deploy authority.
// Maps to the authority_registry record; compiled into a DeployAEO at /compile.
export type DeployATAO = {
  readonly intent: string
  readonly scope: Record<string, unknown>
  readonly target: {
    readonly repo: string
    readonly branch: string
    readonly workflow: typeof GOVERNED_DEPLOY_WORKFLOW
  }
  readonly constraints: {
    readonly max_executions: number
    readonly [key: string]: unknown
  }
  readonly authority_reference: string
  readonly continuity_reference: string
  readonly risk_class: DeployRiskClass
}

// AEO produced by /compile from a DeployATAO.
// validation.workflow is always GOVERNED_DEPLOY_WORKFLOW.
// finality.proof_required is always true.
export type DeployAEO = CanonicalAEO & {
  readonly validation: { readonly workflow: typeof GOVERNED_DEPLOY_WORKFLOW }
  readonly finality: { readonly proof_required: true }
}

export type DeployValidatorPredicates = {
  readonly authority_valid: boolean
  readonly continuity_valid: boolean
  readonly nonce_unique: boolean
  readonly replay_eligible: boolean
  readonly policy_valid: boolean
  readonly hash_equal: boolean
  readonly environment_eligible: boolean
  readonly scope_constraints_met: boolean
}

export type DeployValidatorResult =
  | { readonly ok: true; readonly predicates: DeployValidatorPredicates }
  | { readonly ok: false; readonly reason: string; readonly predicates: Partial<DeployValidatorPredicates> }

const DEPLOY_RISK_CLASSES: readonly string[] = ['PRODUCTION_DEPLOY', 'PREVIEW_DEPLOY', 'BREAK_GLASS_DEPLOY']
const REQUIRED_ATAO_KEYS = ['authority_reference', 'constraints', 'continuity_reference', 'intent', 'risk_class', 'scope', 'target'].join('|')

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function isExpiredAt(expiry: string | null | undefined): boolean {
  if (!expiry) return true
  const ts = Date.parse(expiry)
  return !Number.isFinite(ts) || ts <= Date.now()
}

export function validateDeployATAO(input: unknown): input is DeployATAO {
  if (!isPlainRecord(input)) return false
  if (Object.keys(input).sort().join('|') !== REQUIRED_ATAO_KEYS) return false
  if (typeof input.intent !== 'string' || !input.intent) return false
  if (!isPlainRecord(input.scope)) return false
  if (!isPlainRecord(input.target)) return false
  const target = input.target as Record<string, unknown>
  if (typeof target.repo !== 'string' || !target.repo) return false
  if (typeof target.branch !== 'string' || !target.branch) return false
  if (target.workflow !== GOVERNED_DEPLOY_WORKFLOW) return false
  if (!isPlainRecord(input.constraints)) return false
  const constraints = input.constraints as Record<string, unknown>
  if (typeof constraints.max_executions !== 'number' || constraints.max_executions < 1) return false
  if (typeof input.authority_reference !== 'string' || !input.authority_reference) return false
  if (typeof input.continuity_reference !== 'string' || !input.continuity_reference) return false
  if (!DEPLOY_RISK_CLASSES.includes(input.risk_class as string)) return false
  return true
}

// Builds the canonical AEO from a validated DeployATAO.
// Returns null if the ATAO fails AEO structural requirements.
export function buildDeployAEO(atao: DeployATAO): CanonicalAEO | null {
  return toCanonicalAeo({
    intent: atao.intent,
    scope: atao.scope,
    validation: { workflow: GOVERNED_DEPLOY_WORKFLOW },
    target: atao.target,
    finality: { proof_required: true },
  })
}

// Evaluates all deploy validator predicates.
// Fails closed: returns ok:false at the first failing predicate.
export function validateDeployPredicates(params: {
  readonly riskClass?: DeployRiskClass
  readonly breakGlassLineageBound?: boolean
  readonly breakGlassReplayDetected?: boolean
  readonly authorityStatus: string
  readonly authorityExpiry: string | null | undefined
  readonly continuityStatus: string
  readonly nonceInserted: boolean
  readonly proofExists: boolean
  readonly hashMatch: boolean
  readonly environment: string
  readonly workflowMatch: boolean
  readonly scopeMatch: boolean
}): DeployValidatorResult {
  const isBreakGlassDeploy = params.riskClass === 'BREAK_GLASS_DEPLOY'
  const predicates: DeployValidatorPredicates = {
    authority_valid: params.authorityStatus === 'ACTIVE' && !isExpiredAt(params.authorityExpiry),
    continuity_valid: params.continuityStatus === 'ACTIVE',
    nonce_unique: params.nonceInserted,
    replay_eligible: !params.proofExists,
    policy_valid: params.workflowMatch,
    hash_equal: params.hashMatch,
    environment_eligible: params.environment === 'production',
    scope_constraints_met: params.scopeMatch && params.workflowMatch,
  }

  if (isBreakGlassDeploy && params.breakGlassLineageBound !== true) {
    return { ok: false, reason: 'break_glass_unbound', predicates }
  }
  if (isBreakGlassDeploy && params.breakGlassReplayDetected === true) {
    return { ok: false, reason: 'break_glass_replay_blocked', predicates }
  }
  if (!predicates.authority_valid) return { ok: false, reason: 'authority_invalid_or_expired', predicates }
  if (!predicates.continuity_valid) return { ok: false, reason: 'invalid_continuity', predicates }
  if (!predicates.nonce_unique) return { ok: false, reason: 'nonce_used', predicates }
  if (!predicates.replay_eligible) return { ok: false, reason: 'replay_detected', predicates }
  if (!predicates.policy_valid) return { ok: false, reason: 'workflow_mismatch', predicates }
  if (!predicates.hash_equal) return { ok: false, reason: 'hash_mismatch', predicates }
  if (!predicates.environment_eligible) return { ok: false, reason: 'environment_ineligible', predicates }
  if (!predicates.scope_constraints_met) return { ok: false, reason: 'scope_constraints_mismatch', predicates }

  return { ok: true, predicates }
}
