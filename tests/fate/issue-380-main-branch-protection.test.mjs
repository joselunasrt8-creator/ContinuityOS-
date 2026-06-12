/**
 * Issue #380 — Main Branch Protection Enforcement Boundary
 *
 * Generated after:
 *   - #695 adversarial execution verification merged
 *   - #383 reverse-closure mutation map merged
 *   - #896 Cloudflare containment merged
 *
 * Scope: repository sovereignty only.
 *
 * Verifies:
 *   - repository_sovereignty_matrix.json artifact is present and structurally valid
 *   - all 14 required verification areas are classified
 *   - all 5 required classifications are used (ENFORCED, EXTERNAL_POLICY, BREAK_GLASS, OPEN, CONTAINED)
 *   - all 5 required invariants are declared
 *   - specific path classifications match expected values
 *   - BREAK_GLASS paths are non-normal execution and cannot create legitimacy
 *   - OPEN paths have explicit residual_gap documentation
 *   - governance docs exist and contain required sections
 *   - consistency with BRANCH_PROTECTION_POLICY.json
 *   - cross-references with REVERSE_CLOSURE_MUTATION_MAP.json
 *
 * Evidence only — no runtime route changes, no validator changes, no proof behavior
 * changes, no execution path expansion, no authority creation, no deployment changes.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

function readText(path) {
  return readFileSync(join(root, path), 'utf8')
}

const SOVEREIGNTY_MATRIX = readJson('runtime/repository_sovereignty_matrix.json')
const BRANCH_PROTECTION_POLICY = readJson('governance/runtime/BRANCH_PROTECTION_POLICY.json')
const REVERSE_CLOSURE_MAP = readJson('runtime/REVERSE_CLOSURE_MUTATION_MAP.json')

const REQUIRED_CLASSIFICATIONS = ['ENFORCED', 'EXTERNAL_POLICY', 'BREAK_GLASS', 'OPEN', 'CONTAINED']

const REQUIRED_VERIFICATION_AREAS = [
  'direct_push_to_main',
  'force_push_to_main',
  'admin_bypass',
  'missing_codeowners_review',
  'unsigned_commits',
  'stale_review_dismissal',
  'required_status_checks',
  'workflow_mutation_through_pr',
  'branch_deletion',
  'branch_recreation_after_deletion',
  'tag_based_mutation',
  'github_actions_privilege_escalation',
  'workflow_dispatch_misuse',
  'merge_queue_bypass',
  'bot_account_mutation',
]

const REQUIRED_INVARIANT_IDS = ['RSI-001', 'RSI-002', 'RSI-003', 'RSI-004', 'RSI-005']

// ── 1. artifact structure ────────────────────────────────────────────────────

test('issue #380: repository_sovereignty_matrix artifact is present and structurally valid', () => {
  assert.equal(SOVEREIGNTY_MATRIX.artifact, 'REPOSITORY_SOVEREIGNTY_MATRIX')
  assert.equal(SOVEREIGNTY_MATRIX.issue, '380')
  assert.equal(SOVEREIGNTY_MATRIX.scope, 'repository sovereignty only')
  assert.ok(Array.isArray(SOVEREIGNTY_MATRIX.mutation_paths), 'mutation_paths must be an array')
  assert.ok(SOVEREIGNTY_MATRIX.mutation_paths.length >= 14, 'at least 14 mutation paths required')
  assert.ok(typeof SOVEREIGNTY_MATRIX.classification_schema === 'object', 'classification_schema must be present')
  assert.ok(Array.isArray(SOVEREIGNTY_MATRIX.governance_invariants), 'governance_invariants must be an array')
  assert.ok(typeof SOVEREIGNTY_MATRIX.summary === 'object', 'summary must be present')
})

test('issue #380: classification_schema declares all five required classifications', () => {
  const schema = SOVEREIGNTY_MATRIX.classification_schema
  for (const cls of REQUIRED_CLASSIFICATIONS) {
    assert.ok(schema[cls], `classification_schema must define ${cls}`)
    assert.ok(typeof schema[cls] === 'string' && schema[cls].length > 0, `${cls} definition must be non-empty`)
  }
})

test('issue #380: all five required classifications are actually used in mutation_paths', () => {
  const usedClassifications = new Set(SOVEREIGNTY_MATRIX.mutation_paths.map((p) => p.classification))
  for (const cls of REQUIRED_CLASSIFICATIONS) {
    assert.ok(usedClassifications.has(cls), `classification ${cls} must be used in at least one mutation path`)
  }
})

// ── 2. required verification areas ──────────────────────────────────────────

test('issue #380: all required verification areas are classified in sovereignty matrix', () => {
  const pathNames = new Set(SOVEREIGNTY_MATRIX.mutation_paths.map((p) => p.path_name))
  for (const area of REQUIRED_VERIFICATION_AREAS) {
    assert.ok(pathNames.has(area), `required verification area "${area}" must be classified in sovereignty matrix`)
  }
})

test('issue #380: every mutation path has required structural fields', () => {
  const required = ['path_id', 'path_name', 'description', 'classification', 'current_gate', 'enforcement_mechanism', 'residual_gap', 'closure_condition', 'linked_issue']
  for (const path of SOVEREIGNTY_MATRIX.mutation_paths) {
    for (const field of required) {
      assert.ok(path[field] !== undefined && path[field] !== null && path[field] !== '', `${path.path_id} must have non-empty ${field}`)
    }
    assert.ok(REQUIRED_CLASSIFICATIONS.includes(path.classification), `${path.path_id} has unknown classification: ${path.classification}`)
  }
})

test('issue #380: path IDs are unique and follow BSM-NNN format', () => {
  const ids = SOVEREIGNTY_MATRIX.mutation_paths.map((p) => p.path_id)
  const uniqueIds = new Set(ids)
  assert.equal(uniqueIds.size, ids.length, 'all path_id values must be unique')
  for (const id of ids) {
    assert.match(id, /^BSM-\d{3}$/, `path_id ${id} must follow BSM-NNN format`)
  }
})

// ── 3. required invariants ───────────────────────────────────────────────────

test('issue #380: all five required governance invariants are declared', () => {
  const invariantIds = new Set(SOVEREIGNTY_MATRIX.governance_invariants.map((i) => i.invariant_id))
  for (const id of REQUIRED_INVARIANT_IDS) {
    assert.ok(invariantIds.has(id), `required invariant ${id} must be declared in sovereignty matrix`)
  }
})

test('issue #380: every governance invariant has statement, description, verified, and basis fields', () => {
  for (const inv of SOVEREIGNTY_MATRIX.governance_invariants) {
    assert.ok(inv.statement && inv.statement.length > 0, `${inv.invariant_id} must have non-empty statement`)
    assert.ok(inv.description && inv.description.length > 0, `${inv.invariant_id} must have non-empty description`)
    assert.equal(inv.verified, true, `${inv.invariant_id} must be verified=true`)
    assert.ok(inv.basis && inv.basis.length > 0, `${inv.invariant_id} must have non-empty basis`)
  }
})

test('issue #380: RSI-001 — repository mutation alone cannot create legitimacy', () => {
  const rsi001 = SOVEREIGNTY_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RSI-001')
  assert.ok(rsi001, 'RSI-001 must be present')
  assert.match(rsi001.statement.toLowerCase(), /repository mutation.*cannot create legitimacy|cannot create legitimacy/)
  assert.equal(rsi001.verified, true)
})

test('issue #380: RSI-002 — merge capability does not equal execution legitimacy', () => {
  const rsi002 = SOVEREIGNTY_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RSI-002')
  assert.ok(rsi002, 'RSI-002 must be present')
  assert.match(rsi002.statement.toLowerCase(), /merge capability.*execution legitimacy|merge capability does not equal/)
  assert.equal(rsi002.verified, true)
})

test('issue #380: RSI-003 — branch protection is governance dependency, not proof', () => {
  const rsi003 = SOVEREIGNTY_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RSI-003')
  assert.ok(rsi003, 'RSI-003 must be present')
  assert.match(rsi003.statement.toLowerCase(), /branch protection.*governance dependency|governance dependency.*not proof/)
  assert.equal(rsi003.verified, true)
})

test('issue #380: RSI-004 — unsigned and unreviewed mutation paths classify as unauthorized', () => {
  const rsi004 = SOVEREIGNTY_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RSI-004')
  assert.ok(rsi004, 'RSI-004 must be present')
  assert.match(rsi004.statement.toLowerCase(), /unsigned.*unreviewed.*unauthorized|classify as unauthorized/)
  assert.equal(rsi004.verified, true)
})

test('issue #380: RSI-005 — external GitHub admin and root authority must classify as BREAK_GLASS', () => {
  const rsi005 = SOVEREIGNTY_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RSI-005')
  assert.ok(rsi005, 'RSI-005 must be present')
  assert.match(rsi005.statement.toLowerCase(), /break.glass|break_glass/)
  assert.equal(rsi005.verified, true)
})

// ── 4. BREAK_GLASS path verification ─────────────────────────────────────────

test('issue #380: BREAK_GLASS paths have non_normal_execution=true and creates_legitimacy=false', () => {
  const breakGlassPaths = SOVEREIGNTY_MATRIX.mutation_paths.filter((p) => p.classification === 'BREAK_GLASS')
  assert.ok(breakGlassPaths.length >= 1, 'at least one BREAK_GLASS path must be classified')
  for (const path of breakGlassPaths) {
    assert.equal(path.non_normal_execution, true, `BREAK_GLASS path ${path.path_id} must have non_normal_execution=true`)
    assert.equal(path.creates_legitimacy, false, `BREAK_GLASS path ${path.path_id} must have creates_legitimacy=false`)
  }
})

test('issue #380: admin_bypass is classified BREAK_GLASS with required fields', () => {
  const adminBypass = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'admin_bypass')
  assert.ok(adminBypass, 'admin_bypass path must be present')
  assert.equal(adminBypass.classification, 'BREAK_GLASS', 'admin_bypass must be classified BREAK_GLASS')
  assert.equal(adminBypass.non_normal_execution, true, 'admin_bypass must have non_normal_execution=true')
  assert.equal(adminBypass.creates_legitimacy, false, 'admin_bypass must have creates_legitimacy=false')
  assert.ok(adminBypass.authority_capable, 'admin_bypass must have authority_capable=true (acknowledged root authority)')
})

test('issue #380: BREAK_GLASS paths are consistent with RSI-005 invariant', () => {
  const rsi005 = SOVEREIGNTY_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RSI-005')
  assert.ok(rsi005, 'RSI-005 must be present')
  const breakGlassPaths = SOVEREIGNTY_MATRIX.mutation_paths.filter((p) => p.classification === 'BREAK_GLASS')
  assert.ok(breakGlassPaths.length >= 1, 'RSI-005 requires at least one BREAK_GLASS classification')
  for (const path of breakGlassPaths) {
    assert.equal(path.creates_legitimacy, false, `RSI-005: ${path.path_id} cannot create legitimacy`)
  }
})

// ── 5. OPEN path verification ─────────────────────────────────────────────────

test('issue #380: OPEN paths have non-empty residual_gap and closure_condition', () => {
  const openPaths = SOVEREIGNTY_MATRIX.mutation_paths.filter((p) => p.classification === 'OPEN')
  assert.ok(openPaths.length >= 5, 'at least 5 OPEN paths must be classified')
  for (const path of openPaths) {
    assert.ok(path.residual_gap && path.residual_gap.length > 0, `OPEN path ${path.path_id} must have non-empty residual_gap`)
    assert.ok(path.closure_condition && path.closure_condition.length > 0, `OPEN path ${path.path_id} must have non-empty closure_condition`)
  }
})

test('issue #380: direct_push_to_main and force_push_to_main are classified OPEN', () => {
  const directPush = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'direct_push_to_main')
  const forcePush = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'force_push_to_main')
  assert.ok(directPush, 'direct_push_to_main must be present')
  assert.ok(forcePush, 'force_push_to_main must be present')
  assert.equal(directPush.classification, 'OPEN', 'direct_push_to_main must be classified OPEN')
  assert.equal(forcePush.classification, 'OPEN', 'force_push_to_main must be classified OPEN')
  assert.equal(directPush.creates_legitimacy, false, 'direct_push_to_main must not create legitimacy')
  assert.equal(forcePush.creates_legitimacy, false, 'force_push_to_main must not create legitimacy')
})

test('issue #380: unsigned_commits is classified OPEN with UNVERIFIABLE_COMMIT_PROVENANCE result', () => {
  const unsignedCommits = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'unsigned_commits')
  assert.ok(unsignedCommits, 'unsigned_commits must be present')
  assert.equal(unsignedCommits.classification, 'OPEN', 'unsigned_commits must be classified OPEN — RSI-004')
  assert.match(unsignedCommits.unauthorized_result ?? '', /UNVERIFIABLE_COMMIT_PROVENANCE/)
})

test('issue #380: missing_codeowners_review is classified OPEN with UNREVIEWED_MERGE result', () => {
  const codeownersReview = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'missing_codeowners_review')
  assert.ok(codeownersReview, 'missing_codeowners_review must be present')
  assert.equal(codeownersReview.classification, 'OPEN', 'missing_codeowners_review must be classified OPEN — RSI-004')
  assert.match(codeownersReview.unauthorized_result ?? '', /UNREVIEWED_MERGE/)
})

test('issue #380: branch_deletion is classified OPEN with GOVERNANCE_EVIDENCE_LOSS result', () => {
  const branchDeletion = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'branch_deletion')
  assert.ok(branchDeletion, 'branch_deletion must be present')
  assert.equal(branchDeletion.classification, 'OPEN', 'branch_deletion must be classified OPEN')
  assert.match(branchDeletion.unauthorized_result ?? '', /GOVERNANCE_EVIDENCE_LOSS/)
})

test('issue #380: tag_based_mutation is classified OPEN with UNVERIFIABLE_RELEASE_PROVENANCE result', () => {
  const tagMutation = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'tag_based_mutation')
  assert.ok(tagMutation, 'tag_based_mutation must be present')
  assert.equal(tagMutation.classification, 'OPEN', 'tag_based_mutation must be classified OPEN')
  assert.match(tagMutation.unauthorized_result ?? '', /UNVERIFIABLE_RELEASE_PROVENANCE/)
  assert.match(tagMutation.linked_issue, /#382/, 'tag_based_mutation must link to #382')
})

// ── 6. EXTERNAL_POLICY path verification ──────────────────────────────────────

test('issue #380: EXTERNAL_POLICY paths have enforcement_mechanism referencing GitHub settings', () => {
  const externalPolicyPaths = SOVEREIGNTY_MATRIX.mutation_paths.filter((p) => p.classification === 'EXTERNAL_POLICY')
  assert.ok(externalPolicyPaths.length >= 2, 'at least 2 EXTERNAL_POLICY paths must be classified')
  for (const path of externalPolicyPaths) {
    assert.ok(
      path.enforcement_mechanism.toLowerCase().includes('github') || path.enforcement_mechanism.toLowerCase().includes('external'),
      `EXTERNAL_POLICY path ${path.path_id} enforcement_mechanism must reference GitHub or external dependency`,
    )
  }
})

test('issue #380: required_status_checks is classified EXTERNAL_POLICY', () => {
  const statusChecks = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'required_status_checks')
  assert.ok(statusChecks, 'required_status_checks must be present')
  assert.equal(statusChecks.classification, 'EXTERNAL_POLICY', 'required_status_checks must be EXTERNAL_POLICY')
})

test('issue #380: stale_review_dismissal is classified EXTERNAL_POLICY', () => {
  const staleReview = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'stale_review_dismissal')
  assert.ok(staleReview, 'stale_review_dismissal must be present')
  assert.equal(staleReview.classification, 'EXTERNAL_POLICY', 'stale_review_dismissal must be EXTERNAL_POLICY')
})

// ── 7. CONTAINED path verification ────────────────────────────────────────────

test('issue #380: CONTAINED paths have governance controls documented', () => {
  const containedPaths = SOVEREIGNTY_MATRIX.mutation_paths.filter((p) => p.classification === 'CONTAINED')
  assert.ok(containedPaths.length >= 2, 'at least 2 CONTAINED paths must be classified')
  for (const path of containedPaths) {
    assert.ok(path.current_gate && path.current_gate.length > 20, `CONTAINED path ${path.path_id} must have substantive current_gate documentation`)
    assert.ok(path.enforcement_mechanism && path.enforcement_mechanism.length > 0, `CONTAINED path ${path.path_id} must have enforcement_mechanism`)
  }
})

test('issue #380: workflow_mutation_through_pr is classified CONTAINED', () => {
  const workflowMutation = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'workflow_mutation_through_pr')
  assert.ok(workflowMutation, 'workflow_mutation_through_pr must be present')
  assert.equal(workflowMutation.classification, 'CONTAINED', 'workflow_mutation_through_pr must be CONTAINED')
  assert.match(workflowMutation.current_gate, /constitutional-integrity/i, 'workflow mutation must reference constitutional-integrity.yml')
})

test('issue #380: workflow_dispatch_misuse is classified CONTAINED', () => {
  const dispatchMisuse = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'workflow_dispatch_misuse')
  assert.ok(dispatchMisuse, 'workflow_dispatch_misuse must be present')
  assert.equal(dispatchMisuse.classification, 'CONTAINED', 'workflow_dispatch_misuse must be CONTAINED')
  assert.match(dispatchMisuse.current_gate, /governed-deploy/i, 'workflow_dispatch misuse must reference governed-deploy.yml')
})

test('issue #380: github_actions_privilege_escalation is classified CONTAINED', () => {
  const escalation = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'github_actions_privilege_escalation')
  assert.ok(escalation, 'github_actions_privilege_escalation must be present')
  assert.equal(escalation.classification, 'CONTAINED', 'github_actions_privilege_escalation must be CONTAINED')
})

// ── 8. ENFORCED path verification ─────────────────────────────────────────────

test('issue #380: at least one ENFORCED path must be classified', () => {
  const enforcedPaths = SOVEREIGNTY_MATRIX.mutation_paths.filter((p) => p.classification === 'ENFORCED')
  assert.ok(enforcedPaths.length >= 1, 'at least one ENFORCED path must be classified')
})

test('issue #380: pr_workflow_execution is classified ENFORCED', () => {
  const prWorkflow = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'pr_workflow_execution')
  assert.ok(prWorkflow, 'pr_workflow_execution must be present')
  assert.equal(prWorkflow.classification, 'ENFORCED', 'pr_workflow_execution must be ENFORCED')
  assert.match(prWorkflow.current_gate, /GitHub.*platform|platform.*enforces/i, 'pr_workflow_execution must reference GitHub platform enforcement')
})

// ── 9. residual open sovereignty gaps ────────────────────────────────────────

test('issue #380: residual_open_sovereignty_gaps are explicitly identified in summary', () => {
  const gaps = SOVEREIGNTY_MATRIX.summary.residual_open_sovereignty_gaps
  assert.ok(Array.isArray(gaps), 'residual_open_sovereignty_gaps must be an array')
  assert.ok(gaps.length >= 5, 'at least 5 residual open sovereignty gaps must be documented')
  for (const gap of gaps) {
    assert.ok(gap.gap_id, `gap must have gap_id`)
    assert.ok(gap.path_id, `gap must have path_id`)
    assert.ok(gap.gap, `gap must have gap description`)
    assert.ok(gap.linked_issue, `gap must have linked_issue`)
    assert.match(gap.linked_issue, /^#\d+$/, `${gap.gap_id} linked_issue must be in #NNN format`)
  }
})

test('issue #380: RSGAP-003 admin_bypass is acknowledged as BREAK_GLASS and cannot be eliminated', () => {
  const gaps = SOVEREIGNTY_MATRIX.summary.residual_open_sovereignty_gaps
  const rsgap003 = gaps.find((g) => g.gap_id === 'RSGAP-003')
  assert.ok(rsgap003, 'RSGAP-003 admin_bypass gap must be explicitly documented')
  assert.equal(rsgap003.path_id, 'BSM-003', 'RSGAP-003 must reference BSM-003 admin_bypass')
  assert.match(rsgap003.closure_requires ?? '', /BREAK_GLASS|cannot be eliminated|cannot.*closed/i, 'RSGAP-003 must acknowledge it cannot be eliminated at repository level')
})

test('issue #380: summary counts match actual path classifications', () => {
  const byClassification = {}
  for (const path of SOVEREIGNTY_MATRIX.mutation_paths) {
    byClassification[path.classification] = (byClassification[path.classification] ?? 0) + 1
  }
  const summaryCounts = SOVEREIGNTY_MATRIX.summary.by_classification
  for (const cls of REQUIRED_CLASSIFICATIONS) {
    assert.equal(
      summaryCounts[cls],
      byClassification[cls] ?? 0,
      `summary.by_classification.${cls} (${summaryCounts[cls]}) must match actual path count (${byClassification[cls] ?? 0})`,
    )
  }
  assert.equal(
    SOVEREIGNTY_MATRIX.summary.total_paths,
    SOVEREIGNTY_MATRIX.mutation_paths.length,
    'summary.total_paths must match mutation_paths.length',
  )
})

// ── 10. consistency with BRANCH_PROTECTION_POLICY.json ────────────────────────

test('issue #380: BRANCH_PROTECTION_POLICY.json is enforcement_activation_recorded and targets main', () => {
  assert.equal(BRANCH_PROTECTION_POLICY.target_branch, 'main', 'BRANCH_PROTECTION_POLICY.json must target main branch')
  assert.equal(BRANCH_PROTECTION_POLICY.status, 'enforcement_activation_recorded', 'BRANCH_PROTECTION_POLICY.json must declare enforcement_activation_recorded status')
})

test('issue #380: required_status_checks path references BRANCH_PROTECTION_POLICY emitted_check_inventory', () => {
  const statusChecks = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'required_status_checks')
  assert.ok(statusChecks, 'required_status_checks path must be present')
  const policyChecks = BRANCH_PROTECTION_POLICY.required_controls.required_status_checks
  assert.ok(Array.isArray(policyChecks), 'BRANCH_PROTECTION_POLICY must have required_status_checks array')
  assert.ok(policyChecks.includes('merge-governance-check'), 'BRANCH_PROTECTION_POLICY must require merge-governance-check')
  assert.ok(policyChecks.includes('generate-preo-candidate'), 'BRANCH_PROTECTION_POLICY must require generate-preo-candidate')
  assert.ok(policyChecks.includes('generate-sco-candidate'), 'BRANCH_PROTECTION_POLICY must require generate-sco-candidate')
  assert.match(statusChecks.current_gate, /merge-governance-check|generate-preo-candidate|generate-sco-candidate/, 'required_status_checks gate must reference emitted check names')
})

test('issue #380: admin_bypass classification is consistent with BRANCH_PROTECTION_POLICY admin_bypass_policy', () => {
  const adminBypassPath = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'admin_bypass')
  assert.ok(adminBypassPath, 'admin_bypass path must be present')
  assert.equal(adminBypassPath.classification, 'BREAK_GLASS')
  assert.equal(BRANCH_PROTECTION_POLICY.admin_bypass_policy.allow_admin_bypass, false, 'BRANCH_PROTECTION_POLICY must declare allow_admin_bypass=false')
  assert.match(BRANCH_PROTECTION_POLICY.admin_bypass_policy.rationale, /alternate mutation paths|governance visibility/)
})

test('issue #380: merge_queue_bypass classification is consistent with BRANCH_PROTECTION_POLICY merge_method_policy', () => {
  const mergeQueue = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'merge_queue_bypass')
  assert.ok(mergeQueue, 'merge_queue_bypass must be present')
  assert.equal(mergeQueue.classification, 'OPEN')
  const policy = BRANCH_PROTECTION_POLICY.merge_method_policy
  assert.ok(policy, 'BRANCH_PROTECTION_POLICY must have merge_method_policy')
  assert.match(policy.gap_result, /PREO_INVALID_AND_MERGE_LEGITIMACY_NULL/)
})

// ── 11. cross-reference with REVERSE_CLOSURE_MUTATION_MAP ────────────────────

test('issue #380: RCM-001 repository_direct_push is OPEN in reverse-closure map and BSM-001 is OPEN in sovereignty matrix', () => {
  const rcm001 = REVERSE_CLOSURE_MAP.surfaces.find((s) => s.surface_id === 'RCM-001')
  assert.ok(rcm001, 'RCM-001 must exist in REVERSE_CLOSURE_MUTATION_MAP')
  assert.equal(rcm001.status, 'OPEN', 'RCM-001 must be OPEN')
  assert.equal(rcm001.linked_issue, '#380', 'RCM-001 must link to #380')
  const bsm001 = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_id === 'BSM-001')
  assert.ok(bsm001, 'BSM-001 must exist in sovereignty matrix')
  assert.equal(bsm001.classification, 'OPEN', 'BSM-001 must be OPEN')
})

test('issue #380: RCM-003 branch_protection_enforcement is OPEN in reverse-closure map', () => {
  const rcm003 = REVERSE_CLOSURE_MAP.surfaces.find((s) => s.surface_id === 'RCM-003')
  assert.ok(rcm003, 'RCM-003 must exist in REVERSE_CLOSURE_MUTATION_MAP')
  assert.equal(rcm003.status, 'OPEN', 'RCM-003 must be OPEN')
  assert.equal(rcm003.linked_issue, '#380', 'RCM-003 must link to #380')
})

test('issue #380: RCM-004 codeowners_review is CONTAINED in reverse-closure map and BSM-004 is OPEN in sovereignty matrix', () => {
  const rcm004 = REVERSE_CLOSURE_MAP.surfaces.find((s) => s.surface_id === 'RCM-004')
  assert.ok(rcm004, 'RCM-004 must exist in REVERSE_CLOSURE_MUTATION_MAP')
  assert.equal(rcm004.status, 'CONTAINED', 'RCM-004 must be CONTAINED in RCM (advisory CODEOWNERS present)')
  assert.equal(rcm004.linked_issue, '#380', 'RCM-004 must link to #380')
  const bsm004 = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'missing_codeowners_review')
  assert.ok(bsm004, 'missing_codeowners_review must exist in sovereignty matrix')
  assert.equal(bsm004.classification, 'OPEN', 'missing_codeowners_review is OPEN: enforcement requires branch protection activation')
})

test('issue #380: RCM-019 root_credential_break_glass is BREAK_GLASS in reverse-closure map', () => {
  const rcm019 = REVERSE_CLOSURE_MAP.surfaces.find((s) => s.surface_id === 'RCM-019')
  assert.ok(rcm019, 'RCM-019 must exist in REVERSE_CLOSURE_MUTATION_MAP')
  assert.equal(rcm019.status, 'BREAK_GLASS', 'RCM-019 must be BREAK_GLASS')
  assert.equal(rcm019.creates_legitimacy, false, 'RCM-019 must not create legitimacy')
})

test('issue #380: INV-005 in reverse-closure map states main branch protection is OPEN linked to #380', () => {
  const inv005 = REVERSE_CLOSURE_MAP.invariants.find((i) => i.invariant_id === 'INV-005')
  assert.ok(inv005, 'INV-005 must exist in REVERSE_CLOSURE_MUTATION_MAP')
  assert.equal(inv005.satisfied, true, 'INV-005 must be satisfied')
  assert.match(inv005.description, /main branch protection.*OPEN.*#380|branch protection.*linked.*#380/)
})

// ── 12. governance docs verification ─────────────────────────────────────────

test('issue #380: docs/main-branch-protection-governance.md exists', () => {
  const docPath = join(root, 'docs/main-branch-protection-governance.md')
  assert.ok(existsSync(docPath), 'docs/main-branch-protection-governance.md must exist')
})

test('issue #380: governance doc contains required sections', () => {
  const doc = readText('docs/main-branch-protection-governance.md')
  const requiredSections = [
    'Main Branch Protection Governance',
    'RSI-001',
    'RSI-002',
    'RSI-003',
    'RSI-004',
    'RSI-005',
    'Classification Schema',
    'ENFORCED',
    'EXTERNAL_POLICY',
    'BREAK_GLASS',
    'OPEN',
    'CONTAINED',
    'Residual Open Sovereignty Gaps',
    'Branch Protection Policy Alignment',
    'Closure Conditions',
  ]
  for (const section of requiredSections) {
    assert.ok(doc.includes(section), `docs/main-branch-protection-governance.md must contain section/term: ${section}`)
  }
})

test('issue #380: governance doc declares non-operative status', () => {
  const doc = readText('docs/main-branch-protection-governance.md')
  assert.match(doc, /non-operative|Non-Operative|evidence only|Evidence only/i, 'governance doc must declare non-operative or evidence-only status')
})

test('issue #380: governance doc references all required verification area path IDs', () => {
  const doc = readText('docs/main-branch-protection-governance.md')
  const requiredPathIds = ['BSM-001', 'BSM-002', 'BSM-003', 'BSM-004', 'BSM-005', 'BSM-006', 'BSM-007', 'BSM-008', 'BSM-009', 'BSM-010', 'BSM-011', 'BSM-012', 'BSM-013', 'BSM-014']
  for (const id of requiredPathIds) {
    assert.ok(doc.includes(id), `governance doc must reference path ${id}`)
  }
})

// ── 13. meta-invariant: no authority creation ────────────────────────────────

test('issue #380: sovereignty matrix does not claim to create authority or enforce GitHub settings', () => {
  const purpose = SOVEREIGNTY_MATRIX.purpose.toLowerCase()
  const forbidden = /create authority|enforces github|modifies github settings/
  assert.equal(forbidden.test(purpose), false, 'sovereignty matrix must not claim to create authority or enforce GitHub settings')
})

test('issue #380: governance_drift_policy in BRANCH_PROTECTION_POLICY declares fail_closed behavior', () => {
  const driftPolicy = BRANCH_PROTECTION_POLICY.governance_drift_policy
  assert.ok(driftPolicy, 'governance_drift_policy must exist in BRANCH_PROTECTION_POLICY.json')
  assert.equal(driftPolicy.fail_closed, true, 'governance_drift_policy must be fail_closed=true')
  assert.match(driftPolicy.required_check_without_emitted_job, /PREO_INVALID_AND_MERGE_LEGITIMACY_NULL/)
})

test('issue #380: CODEOWNERS files declare @joselunasrt8-creator as maintainer for governance-critical paths', () => {
  const codeowners = readText('.github/CODEOWNERS')
  assert.match(codeowners, /@joselunasrt8-creator/, 'CODEOWNERS must declare @joselunasrt8-creator')
  assert.match(codeowners, /\.github\/workflows/, 'CODEOWNERS must cover .github/workflows/**')
})

// ── 14. summary list consistency ─────────────────────────────────────────────

test('issue #380: summary.open_paths matches actual OPEN path IDs', () => {
  const actualOpenIds = new Set(
    SOVEREIGNTY_MATRIX.mutation_paths
      .filter((p) => p.classification === 'OPEN')
      .map((p) => p.path_id),
  )
  const summaryOpenIds = new Set(SOVEREIGNTY_MATRIX.summary.open_paths)
  assert.deepEqual(
    [...actualOpenIds].sort(),
    [...summaryOpenIds].sort(),
    'summary.open_paths must match actual OPEN path IDs',
  )
})

test('issue #380: summary.break_glass_paths matches actual BREAK_GLASS path IDs', () => {
  const actualBGIds = new Set(
    SOVEREIGNTY_MATRIX.mutation_paths
      .filter((p) => p.classification === 'BREAK_GLASS')
      .map((p) => p.path_id),
  )
  const summaryBGIds = new Set(SOVEREIGNTY_MATRIX.summary.break_glass_paths)
  assert.deepEqual(
    [...actualBGIds].sort(),
    [...summaryBGIds].sort(),
    'summary.break_glass_paths must match actual BREAK_GLASS path IDs',
  )
})

test('issue #380: summary.enforced_paths matches actual ENFORCED path IDs', () => {
  const actualEnforcedIds = new Set(
    SOVEREIGNTY_MATRIX.mutation_paths
      .filter((p) => p.classification === 'ENFORCED')
      .map((p) => p.path_id),
  )
  const summaryEnforcedIds = new Set(SOVEREIGNTY_MATRIX.summary.enforced_paths)
  assert.deepEqual(
    [...actualEnforcedIds].sort(),
    [...summaryEnforcedIds].sort(),
    'summary.enforced_paths must match actual ENFORCED path IDs',
  )
})

// ── 15. scope boundary: no runtime/validator/proof/execution changes ───────────

test('issue #380: sovereignty matrix scope is repository sovereignty only (no runtime, validator, proof, execution changes)', () => {
  assert.equal(SOVEREIGNTY_MATRIX.scope, 'repository sovereignty only', 'sovereignty matrix scope must be "repository sovereignty only"')
})

test('issue #380: sovereignty matrix source_dependencies reference only governance and evidence artifacts (not runtime execution)', () => {
  const deps = SOVEREIGNTY_MATRIX.source_dependencies
  assert.ok(Array.isArray(deps), 'source_dependencies must be an array')
  for (const dep of deps) {
    assert.ok(dep.artifact, 'each source dependency must have an artifact path')
    const artifact = dep.artifact.toLowerCase()
    assert.ok(
      !artifact.includes('src/index') && !artifact.includes('src/runtime/validate') && !artifact.includes('src/runtime/execute'),
      `source dependency ${dep.artifact} must not reference runtime execution source files (scope boundary)`,
    )
  }
})
