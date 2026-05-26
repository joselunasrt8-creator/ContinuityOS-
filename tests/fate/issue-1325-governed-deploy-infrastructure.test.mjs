import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  GOVERNED_DEPLOY_WORKFLOW,
  validateDeployATAO,
  buildDeployAEO,
  validateDeployPredicates,
} from '../../src/governed-deploy.js'

const governedDeployScript = readFileSync('scripts/governed-deploy.ts', 'utf8')
const indexSource = readFileSync('src/index.ts', 'utf8')

// ── DeployATAO structure ────────────────────────────────────────────────────

const validATAO = Object.freeze({
  intent: 'deploy_production',
  scope: { environment: 'production' },
  target: { repo: 'org/repo', branch: 'main', workflow: 'governed-deploy.yml' },
  constraints: { max_executions: 1 },
  authority_reference: 'decision-abc',
  continuity_reference: 'continuity-xyz',
  risk_class: 'PRODUCTION_DEPLOY',
})

test('validateDeployATAO accepts a fully valid ATAO', () => {
  assert.equal(validateDeployATAO(validATAO), true)
})

test('validateDeployATAO rejects null and non-objects', () => {
  assert.equal(validateDeployATAO(null), false)
  assert.equal(validateDeployATAO('string'), false)
  assert.equal(validateDeployATAO(42), false)
  assert.equal(validateDeployATAO([]), false)
})

test('validateDeployATAO rejects ATAO with extra keys', () => {
  assert.equal(validateDeployATAO({ ...validATAO, extra_field: 'x' }), false)
})

test('validateDeployATAO rejects ATAO with missing keys', () => {
  const { authority_reference: _omit, ...incomplete } = validATAO
  assert.equal(validateDeployATAO(incomplete), false)
})

test('validateDeployATAO rejects wrong workflow in target', () => {
  assert.equal(
    validateDeployATAO({ ...validATAO, target: { repo: 'org/repo', branch: 'main', workflow: 'other.yml' } }),
    false,
  )
})

test('validateDeployATAO rejects unknown risk_class', () => {
  assert.equal(validateDeployATAO({ ...validATAO, risk_class: 'UNKNOWN' }), false)
})

test('validateDeployATAO rejects max_executions below 1', () => {
  assert.equal(validateDeployATAO({ ...validATAO, constraints: { max_executions: 0 } }), false)
})

test('validateDeployATAO accepts all valid risk classes', () => {
  for (const risk_class of ['PRODUCTION_DEPLOY', 'PREVIEW_DEPLOY', 'BREAK_GLASS_DEPLOY']) {
    assert.equal(validateDeployATAO({ ...validATAO, risk_class }), true, `risk_class ${risk_class} must be accepted`)
  }
})

test('GOVERNED_DEPLOY_WORKFLOW constant is governed-deploy.yml', () => {
  assert.equal(GOVERNED_DEPLOY_WORKFLOW, 'governed-deploy.yml')
})

// ── Deploy AEO construction ─────────────────────────────────────────────────

test('buildDeployAEO returns a canonical 5-field AEO from a valid ATAO', () => {
  const aeo = buildDeployAEO(validATAO)
  assert.ok(aeo, 'AEO must not be null for a valid ATAO')
  assert.deepEqual(Object.keys(aeo).sort(), ['finality', 'intent', 'scope', 'target', 'validation'])
})

test('buildDeployAEO AEO validation.workflow is always GOVERNED_DEPLOY_WORKFLOW', () => {
  const aeo = buildDeployAEO(validATAO)
  assert.ok(aeo)
  assert.equal(aeo.validation.workflow, GOVERNED_DEPLOY_WORKFLOW)
})

test('buildDeployAEO AEO finality.proof_required is always true', () => {
  const aeo = buildDeployAEO(validATAO)
  assert.ok(aeo)
  assert.equal(aeo.finality.proof_required, true)
})

test('buildDeployAEO AEO intent and scope match ATAO', () => {
  const aeo = buildDeployAEO(validATAO)
  assert.ok(aeo)
  assert.equal(aeo.intent, validATAO.intent)
})

test('buildDeployAEO AEO is frozen (exact-object discipline)', () => {
  const aeo = buildDeployAEO(validATAO)
  assert.ok(aeo)
  assert.equal(Object.isFrozen(aeo), true)
})

// ── Deploy validator predicates ─────────────────────────────────────────────

const validPredicateParams = Object.freeze({
  authorityStatus: 'ACTIVE',
  authorityExpiry: new Date(Date.now() + 3_600_000).toISOString(),
  continuityStatus: 'ACTIVE',
  nonceInserted: true,
  proofExists: false,
  hashMatch: true,
  environment: 'production',
  workflowMatch: true,
  scopeMatch: true,
})

test('validateDeployPredicates ok:true when all predicates pass', () => {
  const result = validateDeployPredicates(validPredicateParams)
  assert.equal(result.ok, true)
})

test('validateDeployPredicates ok:false when authority expired', () => {
  const result = validateDeployPredicates({
    ...validPredicateParams,
    authorityExpiry: new Date(Date.now() - 1000).toISOString(),
  })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'authority_invalid_or_expired')
})

test('validateDeployPredicates ok:false when authority status is not ACTIVE', () => {
  const result = validateDeployPredicates({ ...validPredicateParams, authorityStatus: 'CONSUMED' })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'authority_invalid_or_expired')
})

test('validateDeployPredicates ok:false when continuity not ACTIVE', () => {
  const result = validateDeployPredicates({ ...validPredicateParams, continuityStatus: 'REVOKED' })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'invalid_continuity')
})

test('validateDeployPredicates ok:false when nonce already used', () => {
  const result = validateDeployPredicates({ ...validPredicateParams, nonceInserted: false })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'nonce_used')
})

test('validateDeployPredicates ok:false when proof already exists (replay)', () => {
  const result = validateDeployPredicates({ ...validPredicateParams, proofExists: true })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'replay_detected')
})

test('validateDeployPredicates ok:false when workflow does not match', () => {
  const result = validateDeployPredicates({ ...validPredicateParams, workflowMatch: false })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'workflow_mismatch')
})

test('validateDeployPredicates ok:false when hash does not match', () => {
  const result = validateDeployPredicates({ ...validPredicateParams, hashMatch: false })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'hash_mismatch')
})

test('validateDeployPredicates ok:false when environment is not production', () => {
  const result = validateDeployPredicates({ ...validPredicateParams, environment: 'staging' })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'environment_ineligible')
})

test('validateDeployPredicates ok:false when scope constraints not met', () => {
  const result = validateDeployPredicates({ ...validPredicateParams, scopeMatch: false })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'scope_constraints_mismatch')
})

// ── Direct wrangler deploy → NULL ───────────────────────────────────────────

test('scripts/governed-deploy.ts enforces MINDSHIFT_GOVERNED_DEPLOY_CONTEXT guard', () => {
  assert.match(governedDeployScript, /MINDSHIFT_GOVERNED_DEPLOY_CONTEXT/)
  assert.match(governedDeployScript, /github_actions_governed/)
})

test('scripts/governed-deploy.ts blocks direct wrangler invocation with NULL exit', () => {
  assert.match(governedDeployScript, /direct_wrangler_invocation_rejection/)
  assert.match(governedDeployScript, /direct wrangler invocation rejected/)
  assert.match(governedDeployScript, /workflow_bypass_rejection/)
})

test('scripts/governed-deploy.ts rejects workflow bypass attempts', () => {
  assert.match(governedDeployScript, /workflow bypasses governed deploy wrapper/)
})

// ── Replay duplicate → NULL ─────────────────────────────────────────────────

test('scripts/governed-deploy.ts rejects duplicate proof tuple as NULL', () => {
  assert.match(governedDeployScript, /duplicate proof tuple rejected/)
  assert.match(governedDeployScript, /replay_rejection/)
  assert.match(governedDeployScript, /replayed legitimacy artifacts rejected/)
})

test('scripts/governed-deploy.ts audit registry uses canonical hash to detect replay', () => {
  assert.match(governedDeployScript, /sha256Hex\(canonicalize\(event\)\)/)
  assert.match(governedDeployScript, /duplicated/)
})

// ── Proof persistence requirement ──────────────────────────────────────────

test('/compile route enforces proof_required in AEO finality', () => {
  assert.match(indexSource, /finality: \{ proof_required: true \}/)
})

test('/validate route rejects AEO without proof_required', () => {
  assert.match(indexSource, /reason:"proof_requirement_missing"/)
  assert.match(indexSource, /compiledCanonicalAeo\.finality\?\.proof_required !== true/)
})

// ── Governed workflow exclusivity ──────────────────────────────────────────

test('/compile route rejects non-governed workflow', () => {
  assert.match(indexSource, /reason: "workflow_mismatch"[\s\S]*indicator: "unmanaged_deploy_surface"/)
})

test('/validate route rejects non-governed workflow', () => {
  const validateSection = indexSource.slice(indexSource.indexOf('pathname === "/validate"'))
  assert.match(validateSection, /workflow_mismatch/)
  assert.match(validateSection, /GOVERNED_WORKFLOW/)
})

test('execution replay is blocked at /execute route', () => {
  assert.match(indexSource, /reason:"replay_detected"/)
  assert.match(indexSource, /indicator: "duplicate_execution"/)
})
