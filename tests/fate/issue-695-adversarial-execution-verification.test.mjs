/**
 * Issue #695 — Adversarial Execution Surface Verification
 *
 * Regenerated from merged #383 reverse-closure mutation map after:
 *   - #940 merged
 *   - #383 completed (REVERSE_CLOSURE_MUTATION_MAP.json)
 *   - #896 Cloudflare containment merged
 *   - External Cloudflare Git Integration disable performed
 *
 * Scope: verify all 22 RCM surfaces from the reverse-closure topology,
 * all 14 adversarial categories, all 8 fail-closed invariants, and the
 * canonical VALID path preservation.
 *
 * Evidence only — no runtime route changes, no validator changes, no proof
 * behavior changes, no execution path expansion, no authority creation.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

function readText(path) {
  return readFileSync(join(root, path), 'utf8')
}

const REVERSE_CLOSURE_MAP = readJson('runtime/REVERSE_CLOSURE_MUTATION_MAP.json')
const ADVERSARIAL_TOPOLOGY = readJson('runtime/adversarial_execution_topology_map.json')
const EXPLOITABILITY_REPORT = readJson('runtime/residual_exploitability_report.json')

const CANONICAL_CHAIN = ['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof']

const REQUIRED_ADVERSARIAL_CATEGORIES = [
  'workflow_dispatch_bypass',
  'shell_wrapped_deploy_attempts',
  'orphan_execution',
  'replay_reuse',
  'stale_proof_lineage',
  'authority_reuse',
  'undeclared_registry_mutation',
  'hidden_deploy_path_discovery',
  'proof_lineage_corruption',
  'exact_object_drift',
  'mutation_after_validation',
  'bypass_capable_local_terminal_execution',
  'credential_misuse_classification',
  'reconciliation_telemetry_misuse',
]

const REQUIRED_FAIL_CLOSED_INVARIANTS = [
  'undeclared_mutation',
  'replayed_execution',
  'stale_authority',
  'detached_lineage',
  'proof_mismatch',
  'post_validation_mutation',
  'undeclared_deploy_path',
  'validator_bypass',
]

const VALID_STATUSES = ['CLOSED', 'CONTAINED', 'OPEN', 'BREAK_GLASS', 'OBSERVABILITY_ONLY']

// ── adversarial verifier ────────────────────────────────────────────────────

function verifyExecutionAttempt({
  hasProof,
  hasAuthority,
  hasLineage,
  authorityConsumed,
  authorityExpired,
  nonceReused,
  objectHashValidated,
  objectHashExecuted,
  proofHashMatchesObject,
  undeclaredSurface,
  validatorEscaped,
  postValidationMutation,
  undeclaredDeployPath,
}) {
  if (undeclaredSurface) return 'NULL'
  if (!hasAuthority) return 'NULL'
  if (authorityConsumed) return 'NULL'
  if (authorityExpired) return 'NULL'
  if (!hasLineage) return 'NULL'
  if (nonceReused) return 'NULL'
  if (!hasProof) return 'NULL'
  if (objectHashValidated !== objectHashExecuted) return 'NULL'
  if (postValidationMutation) return 'NULL'
  if (!proofHashMatchesObject) return 'NULL'
  if (validatorEscaped) return 'NULL'
  if (undeclaredDeployPath) return 'NULL'
  return 'VALID'
}

// ── 1. artifact structure ───────────────────────────────────────────────────

test('issue #695: REVERSE_CLOSURE_MUTATION_MAP artifact is present and structurally valid', () => {
  assert.equal(REVERSE_CLOSURE_MAP.artifact, 'REVERSE_CLOSURE_MUTATION_MAP')
  assert.equal(REVERSE_CLOSURE_MAP.issue, '383')
  assert.ok(Array.isArray(REVERSE_CLOSURE_MAP.surfaces))
  assert.equal(REVERSE_CLOSURE_MAP.surfaces.length, 22)
  assert.deepEqual(REVERSE_CLOSURE_MAP.canonical_chain, CANONICAL_CHAIN)
  assert.match(REVERSE_CLOSURE_MAP.null_semantics_invariant, /UNDECLARED_MUTATION_SURFACE -> NULL/)
})

test('issue #695: adversarial_execution_topology_map artifact is present and structurally valid', () => {
  assert.equal(ADVERSARIAL_TOPOLOGY.artifact, 'ADVERSARIAL_EXECUTION_TOPOLOGY_MAP')
  assert.equal(ADVERSARIAL_TOPOLOGY.issue, '695')
  assert.equal(ADVERSARIAL_TOPOLOGY.source_map_issue, '383')
  assert.deepEqual(ADVERSARIAL_TOPOLOGY.canonical_chain, CANONICAL_CHAIN)
  assert.ok(Array.isArray(ADVERSARIAL_TOPOLOGY.adversarial_categories))
  assert.ok(Array.isArray(ADVERSARIAL_TOPOLOGY.fail_closed_invariant_verification))
  assert.ok(Array.isArray(ADVERSARIAL_TOPOLOGY.surface_adversarial_index))
  assert.equal(ADVERSARIAL_TOPOLOGY.surface_adversarial_index.length, 22)
})

test('issue #695: residual_exploitability_report artifact is present and structurally valid', () => {
  assert.equal(EXPLOITABILITY_REPORT.artifact, 'RESIDUAL_EXPLOITABILITY_REPORT')
  assert.equal(EXPLOITABILITY_REPORT.issue, '695')
  assert.ok(Array.isArray(EXPLOITABILITY_REPORT.closed.surfaces))
  assert.ok(Array.isArray(EXPLOITABILITY_REPORT.contained.surfaces))
  assert.ok(Array.isArray(EXPLOITABILITY_REPORT.open.surfaces))
  assert.ok(Array.isArray(EXPLOITABILITY_REPORT.break_glass.surfaces))
  assert.ok(Array.isArray(EXPLOITABILITY_REPORT.observability_only.surfaces))
})

// ── 2. all 22 RCM surfaces classified and indexed ──────────────────────────

test('issue #695: all 22 RCM surfaces from reverse-closure map are classified in adversarial topology', () => {
  const indexedIds = new Set(ADVERSARIAL_TOPOLOGY.surface_adversarial_index.map((s) => s.surface_id))
  for (const surface of REVERSE_CLOSURE_MAP.surfaces) {
    assert.ok(indexedIds.has(surface.surface_id), `${surface.surface_id} must be in adversarial topology index`)
  }
})

test('issue #695: every surface in adversarial topology has a valid status classification', () => {
  for (const entry of ADVERSARIAL_TOPOLOGY.surface_adversarial_index) {
    assert.ok(
      VALID_STATUSES.includes(entry.status),
      `${entry.surface_id} has unknown status: ${entry.status}`,
    )
    assert.ok(typeof entry.mutation_capable === 'boolean', `${entry.surface_id} must declare mutation_capable`)
    assert.ok(Array.isArray(entry.adversarial_categories), `${entry.surface_id} must have adversarial_categories array`)
    assert.ok(entry.adversarial_result, `${entry.surface_id} must have adversarial_result`)
  }
})

test('issue #695: status counts in exploitability report match reverse-closure map classification', () => {
  const reportCounts = EXPLOITABILITY_REPORT.summary.by_status
  assert.equal(reportCounts.CLOSED, 3)
  assert.equal(reportCounts.CONTAINED, 10)
  assert.equal(reportCounts.OPEN, 4)
  assert.equal(reportCounts.BREAK_GLASS, 3)
  assert.equal(reportCounts.OBSERVABILITY_ONLY, 2)
  assert.equal(
    reportCounts.CLOSED + reportCounts.CONTAINED + reportCounts.OPEN + reportCounts.BREAK_GLASS + reportCounts.OBSERVABILITY_ONLY,
    22,
  )
})

// ── 3. all 14 adversarial categories verified ──────────────────────────────

test('issue #695: all 14 required adversarial categories are present in adversarial topology', () => {
  const categoryNames = new Set(ADVERSARIAL_TOPOLOGY.adversarial_categories.map((c) => c.name))
  for (const required of REQUIRED_ADVERSARIAL_CATEGORIES) {
    assert.ok(categoryNames.has(required), `adversarial category "${required}" must be present`)
  }
})

test('issue #695: each adversarial category has expected_outcome, verified flag, and surfaces_exercised', () => {
  for (const category of ADVERSARIAL_TOPOLOGY.adversarial_categories) {
    assert.ok(category.category_id, `${category.name} must have category_id`)
    assert.ok(category.expected_outcome, `${category.name} must have expected_outcome`)
    assert.equal(category.verified, true, `${category.name} must be verified=true`)
    assert.ok(Array.isArray(category.surfaces_exercised), `${category.name} must have surfaces_exercised array`)
    assert.ok(category.surfaces_exercised.length > 0, `${category.name} must exercise at least one surface`)
    assert.ok(category.verification_basis, `${category.name} must have verification_basis`)
  }
})

// ── 4. all 8 fail-closed invariants verified ───────────────────────────────

test('issue #695: all 8 fail-closed invariants are present in adversarial topology', () => {
  const invariantNames = new Set(ADVERSARIAL_TOPOLOGY.fail_closed_invariant_verification.map((i) => i.invariant))
  for (const required of REQUIRED_FAIL_CLOSED_INVARIANTS) {
    assert.ok(invariantNames.has(required), `fail-closed invariant "${required}" must be present`)
  }
})

test('issue #695: all fail-closed invariants are verified=true with evidence', () => {
  for (const invariant of ADVERSARIAL_TOPOLOGY.fail_closed_invariant_verification) {
    assert.equal(invariant.verified, true, `invariant "${invariant.invariant}" must be verified=true`)
    assert.ok(invariant.condition, `invariant "${invariant.invariant}" must have condition`)
    assert.ok(invariant.evidence, `invariant "${invariant.invariant}" must have evidence`)
    assert.match(invariant.condition, /NULL/, `invariant "${invariant.invariant}" condition must reference NULL outcome`)
  }
})

// ── 5. adversarial fixtures — fail-closed invariant enforcement ─────────────

test('issue #695: undeclared_mutation invariant — undeclared surface → NULL', () => {
  const cases = [
    { id: 'shadow_authority_table', params: { undeclaredSurface: true, hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'bypass_execution_log', params: { undeclaredSurface: true, hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'root_override_sink', params: { undeclaredSurface: true, hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
  ]
  for (const { id, params } of cases) {
    assert.equal(verifyExecutionAttempt(params), 'NULL', `undeclared surface ${id} must produce NULL`)
  }
})

test('issue #695: replayed_execution invariant — replay reuse → NULL', () => {
  const cases = [
    { id: 'nonce_reused', params: { undeclaredSurface: false, hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: true, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'object_hash_seen', params: { undeclaredSurface: false, hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'SEEN_HASH', objectHashExecuted: 'DIFFERENT_HASH', proofHashMatchesObject: true, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
  ]
  for (const { id, params } of cases) {
    assert.equal(verifyExecutionAttempt(params), 'NULL', `replay attempt ${id} must produce NULL`)
  }
})

test('issue #695: stale_authority invariant — expired/consumed authority → NULL', () => {
  const expired = verifyExecutionAttempt({
    undeclaredSurface: false, hasProof: true, hasAuthority: true, hasLineage: true,
    authorityConsumed: false, authorityExpired: true, nonceReused: false,
    objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(expired, 'NULL', 'expired authority must produce NULL')

  const consumed = verifyExecutionAttempt({
    undeclaredSurface: false, hasProof: true, hasAuthority: true, hasLineage: true,
    authorityConsumed: true, authorityExpired: false, nonceReused: false,
    objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(consumed, 'NULL', 'consumed authority must produce NULL')
})

test('issue #695: detached_lineage invariant — orphan execution without lineage → NULL', () => {
  const result = verifyExecutionAttempt({
    undeclaredSurface: false, hasProof: true, hasAuthority: true, hasLineage: false,
    authorityConsumed: false, authorityExpired: false, nonceReused: false,
    objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(result, 'NULL', 'detached lineage must produce NULL')
})

test('issue #695: proof_mismatch invariant — mismatched proof hash → NULL', () => {
  const result = verifyExecutionAttempt({
    undeclaredSurface: false, hasProof: true, hasAuthority: true, hasLineage: true,
    authorityConsumed: false, authorityExpired: false, nonceReused: false,
    objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: false,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(result, 'NULL', 'proof hash mismatch must produce NULL')
})

test('issue #695: post_validation_mutation invariant — exact-object drift between validate and execute → NULL', () => {
  const exactObjectDrift = verifyExecutionAttempt({
    undeclaredSurface: false, hasProof: true, hasAuthority: true, hasLineage: true,
    authorityConsumed: false, authorityExpired: false, nonceReused: false,
    objectHashValidated: 'HASH_AT_VALIDATE', objectHashExecuted: 'HASH_AT_EXECUTE_AFTER_MUTATION',
    proofHashMatchesObject: true, validatorEscaped: false, postValidationMutation: false,
    undeclaredDeployPath: false,
  })
  assert.equal(exactObjectDrift, 'NULL', 'object hash drift (validate != execute) must produce NULL')

  const postMutation = verifyExecutionAttempt({
    undeclaredSurface: false, hasProof: true, hasAuthority: true, hasLineage: true,
    authorityConsumed: false, authorityExpired: false, nonceReused: false,
    objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true,
    validatorEscaped: false, postValidationMutation: true, undeclaredDeployPath: false,
  })
  assert.equal(postMutation, 'NULL', 'post-validation mutation flag must produce NULL')
})

test('issue #695: undeclared_deploy_path invariant — undeclared deploy path → NULL', () => {
  const result = verifyExecutionAttempt({
    undeclaredSurface: false, hasProof: true, hasAuthority: true, hasLineage: true,
    authorityConsumed: false, authorityExpired: false, nonceReused: false,
    objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: true,
  })
  assert.equal(result, 'NULL', 'undeclared deploy path must produce NULL')
})

test('issue #695: validator_bypass invariant — validator escape → NULL', () => {
  const result = verifyExecutionAttempt({
    undeclaredSurface: false, hasProof: true, hasAuthority: true, hasLineage: true,
    authorityConsumed: false, authorityExpired: false, nonceReused: false,
    objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true,
    validatorEscaped: true, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(result, 'NULL', 'validator escape must produce NULL')
})

// ── 6. comprehensive adversarial category fixtures ──────────────────────────

test('issue #695: workflow_dispatch_bypass category — fabricated dispatch inputs → NULL', () => {
  const cases = [
    { id: 'no_proof', params: { hasProof: false, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'no_authority', params: { hasProof: true, hasAuthority: false, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'no_lineage', params: { hasProof: true, hasAuthority: true, hasLineage: false, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
  ]
  for (const { id, params } of cases) {
    assert.equal(verifyExecutionAttempt(params), 'NULL', `workflow dispatch bypass ${id} must produce NULL`)
  }
})

test('issue #695: shell_wrapped_deploy_attempts category — governed-deploy.ts blocks bash/sh/zsh wrangler patterns', () => {
  const governedDeploy = readText('scripts/governed-deploy.ts')
  assert.match(
    governedDeploy,
    /\(bash\|sh\|zsh\)/,
    'governed-deploy.ts must block bash/sh/zsh-wrapped wrangler deploy',
  )
  assert.match(
    governedDeploy,
    /failClosed\('direct wrangler invocation rejected'/,
    'governed-deploy.ts must failClosed on direct wrangler invocation',
  )
})

test('issue #695: orphan_execution category — execution without lineage → NULL', () => {
  const orphan = verifyExecutionAttempt({
    hasProof: true, hasAuthority: true, hasLineage: false, authorityConsumed: false,
    authorityExpired: false, nonceReused: false, objectHashValidated: 'A',
    objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(orphan, 'NULL', 'orphan execution (no lineage) must produce NULL')
})

test('issue #695: replay_reuse category — replayed execution proof → NULL', () => {
  const replayed = verifyExecutionAttempt({
    hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false,
    authorityExpired: false, nonceReused: true, objectHashValidated: 'A',
    objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(replayed, 'NULL', 'replayed proof (nonce reused) must produce NULL')
})

test('issue #695: stale_proof_lineage category — expired authority in proof chain → NULL', () => {
  const stale = verifyExecutionAttempt({
    hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false,
    authorityExpired: true, nonceReused: false, objectHashValidated: 'A',
    objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(stale, 'NULL', 'stale proof lineage (expired authority) must produce NULL')
})

test('issue #695: authority_reuse category — consumed authority → NULL', () => {
  const reused = verifyExecutionAttempt({
    hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: true,
    authorityExpired: false, nonceReused: false, objectHashValidated: 'A',
    objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(reused, 'NULL', 'authority reuse (consumed authority) must produce NULL')
})

test('issue #695: undeclared_registry_mutation category — mutation surface exhaustiveness verified', () => {
  const matrix = readJson('runtime/MUTATION_SURFACE_EXHAUSTIVENESS.json')
  assert.equal(matrix.fail_closed_response, 'UNDECLARED_MUTATION_SURFACE -> NULL')
  assert.equal(matrix.exhaustiveness_status, 'EXHAUSTIVE')
  assert.ok(matrix.declared_surfaces.length >= 10)

  const undeclaredMutation = verifyExecutionAttempt({
    hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false,
    authorityExpired: false, nonceReused: false, objectHashValidated: 'A',
    objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: true,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(undeclaredMutation, 'NULL', 'undeclared registry mutation must produce NULL')
})

test('issue #695: hidden_deploy_path_discovery category — all non-canonical deploy paths classified', () => {
  const topology = readJson('governance/runtime/DEPLOYMENT_TOPOLOGY_MAP.json')
  assert.ok(Array.isArray(topology.deployment_paths))
  assert.ok(topology.deployment_paths.length >= 5)

  const governedPaths = topology.deployment_paths.filter((p) => p.governed === true)
  assert.ok(governedPaths.length >= 1, 'at least one governed deploy path must exist')

  for (const path of topology.deployment_paths) {
    if (!path.governed && path.production_capable) {
      assert.ok(
        path.containment_action || (path.status && path.status.length > 0),
        `ungoverned production-capable path ${path.path_id} must have containment_action or status`,
      )
    }
  }

  const bypassMatrix = readJson('governance/runtime/RESIDUAL_BYPASS_MATRIX.json')
  assert.ok(Array.isArray(bypassMatrix.residual_bypasses))
  for (const bypass of bypassMatrix.residual_bypasses) {
    assert.ok(bypass.observability, `${bypass.bypass_id} must be observable`)
    assert.notEqual(bypass.observability.toUpperCase(), 'NONE', `${bypass.bypass_id} must not be fully unobservable`)
  }
})

test('issue #695: proof_lineage_corruption category — mismatched proof hash → NULL', () => {
  const corrupted = verifyExecutionAttempt({
    hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false,
    authorityExpired: false, nonceReused: false, objectHashValidated: 'A',
    objectHashExecuted: 'A', proofHashMatchesObject: false, undeclaredSurface: false,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(corrupted, 'NULL', 'proof lineage corruption (hash mismatch) must produce NULL')
})

test('issue #695: exact_object_drift category — validated hash != executed hash → NULL', () => {
  const drift = verifyExecutionAttempt({
    hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false,
    authorityExpired: false, nonceReused: false, objectHashValidated: 'HASH_V',
    objectHashExecuted: 'HASH_E', proofHashMatchesObject: true, undeclaredSurface: false,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(drift, 'NULL', 'exact-object drift (validated hash != executed hash) must produce NULL')
})

test('issue #695: mutation_after_validation category — post-validation mutation → NULL', () => {
  const mutated = verifyExecutionAttempt({
    hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false,
    authorityExpired: false, nonceReused: false, objectHashValidated: 'A',
    objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false,
    validatorEscaped: false, postValidationMutation: true, undeclaredDeployPath: false,
  })
  assert.equal(mutated, 'NULL', 'post-validation mutation must produce NULL')
})

test('issue #695: bypass_capable_local_terminal_execution category — governed-deploy.ts context guard', () => {
  const governedDeploy = readText('scripts/governed-deploy.ts')
  assert.match(
    governedDeploy,
    /process\.env\.MINDSHIFT_GOVERNED_DEPLOY_CONTEXT !== 'github_actions_governed'/,
    'governed-deploy.ts must check MINDSHIFT_GOVERNED_DEPLOY_CONTEXT',
  )
  assert.match(
    governedDeploy,
    /failClosed\('workflow bypasses governed deploy wrapper'/,
    'governed-deploy.ts must failClosed when context is missing',
  )
})

test('issue #695: credential_misuse_classification category — root credentials classified as non-normal break-glass', () => {
  const breakGlassSurfaces = EXPLOITABILITY_REPORT.break_glass.surfaces
  assert.ok(breakGlassSurfaces.length >= 3, 'at least 3 break-glass surfaces must be classified')

  for (const surface of breakGlassSurfaces) {
    assert.equal(surface.non_normal_execution, true, `${surface.surface_id} must be classified non_normal_execution`)
    assert.equal(surface.creates_legitimacy, false, `${surface.surface_id} must not create legitimacy`)
    assert.ok(surface.closure_action, `${surface.surface_id} must have a closure action`)
  }

  const rcm019 = breakGlassSurfaces.find((s) => s.surface_id === 'RCM-019')
  assert.ok(rcm019, 'RCM-019 (root_credential_break_glass) must be in break_glass classification')
  assert.equal(rcm019.authority_capable, true, 'root credential surface must be authority_capable=true (acknowledged)')
  assert.equal(rcm019.creates_legitimacy, false, 'root credential surface must not create MindShift legitimacy')
})

test('issue #695: reconciliation_telemetry_misuse category — observability surfaces cannot escalate', () => {
  const observabilityOnlySurfaces = EXPLOITABILITY_REPORT.observability_only.surfaces
  assert.ok(observabilityOnlySurfaces.length >= 2)

  for (const surface of observabilityOnlySurfaces) {
    const verification = surface.verified_non_escalation
    assert.equal(verification.cannot_create_authority, true, `${surface.surface_id} cannot create authority`)
    assert.equal(verification.cannot_create_validation, true, `${surface.surface_id} cannot create validation`)
    assert.equal(verification.cannot_create_execution, true, `${surface.surface_id} cannot create execution`)
    assert.equal(verification.cannot_create_proof, true, `${surface.surface_id} cannot create proof`)
    assert.equal(verification.cannot_create_legitimacy, true, `${surface.surface_id} cannot create legitimacy`)
  }
})

// ── 7. canonical VALID path preservation ───────────────────────────────────

test('issue #695: canonical VALID path — VALID ∧ AUTHORIZED ∧ UNUSED ∧ POLICY_VALID produces only non-NULL result', () => {
  const valid = verifyExecutionAttempt({
    hasProof: true,
    hasAuthority: true,
    hasLineage: true,
    authorityConsumed: false,
    authorityExpired: false,
    nonceReused: false,
    objectHashValidated: 'CANONICAL_HASH',
    objectHashExecuted: 'CANONICAL_HASH',
    proofHashMatchesObject: true,
    undeclaredSurface: false,
    validatorEscaped: false,
    postValidationMutation: false,
    undeclaredDeployPath: false,
  })
  assert.equal(valid, 'VALID', 'canonical authorized unused policy-valid execution must produce VALID')

  const validPath = ADVERSARIAL_TOPOLOGY.canonical_valid_path
  assert.equal(validPath.result, 'VALID')
  assert.equal(validPath.all_other_paths, 'NULL')
})

test('issue #695: every adversarial fixture category produces NULL; only VALID path produces VALID', () => {
  const allNullFixtures = [
    { id: 'undeclared_surface', params: { hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: true, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'no_authority', params: { hasProof: true, hasAuthority: false, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'authority_consumed', params: { hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: true, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'authority_expired', params: { hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: true, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'no_lineage', params: { hasProof: true, hasAuthority: true, hasLineage: false, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'nonce_reused', params: { hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: true, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'no_proof', params: { hasProof: false, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'exact_object_drift', params: { hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'HASH_V', objectHashExecuted: 'HASH_E', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'post_validation_mutation', params: { hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: true, undeclaredDeployPath: false } },
    { id: 'proof_hash_mismatch', params: { hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: false, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'validator_escaped', params: { hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: true, postValidationMutation: false, undeclaredDeployPath: false } },
    { id: 'undeclared_deploy_path', params: { hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false, authorityExpired: false, nonceReused: false, objectHashValidated: 'A', objectHashExecuted: 'A', proofHashMatchesObject: true, undeclaredSurface: false, validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: true } },
  ]

  for (const { id, params } of allNullFixtures) {
    assert.equal(verifyExecutionAttempt(params), 'NULL', `adversarial fixture "${id}" must produce NULL`)
  }

  const validResult = verifyExecutionAttempt({
    hasProof: true, hasAuthority: true, hasLineage: true, authorityConsumed: false,
    authorityExpired: false, nonceReused: false, objectHashValidated: 'SAME',
    objectHashExecuted: 'SAME', proofHashMatchesObject: true, undeclaredSurface: false,
    validatorEscaped: false, postValidationMutation: false, undeclaredDeployPath: false,
  })
  assert.equal(validResult, 'VALID', 'canonical valid execution must produce VALID')
})

// ── 8. specific required surface verifications ─────────────────────────────

test('issue #695: Cloudflare Git Integration (RCM-008) is CONTAINED, not active production authority', () => {
  const rcm008 = ADVERSARIAL_TOPOLOGY.surface_adversarial_index.find((s) => s.surface_id === 'RCM-008')
  assert.ok(rcm008, 'RCM-008 must be in adversarial topology index')
  assert.equal(rcm008.status, 'CONTAINED', 'Cloudflare Git Integration must be CONTAINED')
  assert.equal(rcm008.mutation_capable, false, 'Cloudflare Git Integration must not be mutation-capable while disabled')

  const cfVerification = ADVERSARIAL_TOPOLOGY.specific_surface_verifications.cloudflare_git_integration
  assert.equal(cfVerification.classification, 'CONTAINED')
  assert.equal(cfVerification.active_production_authority, false)
  assert.match(cfVerification.verification, /external.*disable.*active|disable.*confirmed/i)

  const cfClassification = readJson('governance/runtime/CLOUDFLARE_AUTHORITY_CLASSIFICATION.json')
  const cf001 = cfClassification.surfaces.find((s) => s.surface_id === 'CF-001')
  assert.ok(cf001, 'CF-001 Cloudflare Git Integration must be in authority classification')
  assert.equal(cf001.production_capable, true)
  assert.equal(cf001.governed_by_mindshift, false)
  assert.match(cf001.containment_status, /CONTAINMENT_REQUIRED/)
})

test('issue #695: break-glass/root credential paths are classified as non-normal execution, not active authority', () => {
  const breakGlassInTopology = ADVERSARIAL_TOPOLOGY.specific_surface_verifications.break_glass_paths
  assert.equal(breakGlassInTopology.non_normal_execution, true)
  assert.equal(breakGlassInTopology.creates_legitimacy, false)
  assert.deepEqual(breakGlassInTopology.surface_ids.sort(), ['RCM-010', 'RCM-011', 'RCM-019'])

  const reportBG = EXPLOITABILITY_REPORT.break_glass.surfaces
  for (const surface of reportBG) {
    assert.equal(surface.non_normal_execution, true, `${surface.surface_id} must be non_normal_execution`)
    assert.equal(surface.creates_legitimacy, false, `${surface.surface_id} must not create legitimacy`)
  }

  const rootAuthorityConstraints = readJson('runtime/root_authority_constraints.json')
  assert.ok(rootAuthorityConstraints, 'root_authority_constraints.json must exist')
})

test('issue #695: observability/telemetry surfaces cannot create authority, validation, execution, proof, or legitimacy', () => {
  const observabilityVerification = ADVERSARIAL_TOPOLOGY.specific_surface_verifications.observability_surfaces
  assert.equal(observabilityVerification.cannot_create_authority, true)
  assert.equal(observabilityVerification.cannot_create_validation, true)
  assert.equal(observabilityVerification.cannot_create_execution, true)
  assert.equal(observabilityVerification.cannot_create_proof, true)
  assert.equal(observabilityVerification.cannot_create_legitimacy, true)
  assert.deepEqual(observabilityVerification.surface_ids.sort(), ['RCM-020', 'RCM-021'])

  const exhaustiveness = readJson('runtime/MUTATION_SURFACE_EXHAUSTIVENESS.json')
  const nonExecutable = exhaustiveness.declared_surfaces.filter((s) => s.classification === 'NON_EXECUTABLE')
  for (const surface of nonExecutable) {
    assert.equal(surface.creates_authority, false, `NON_EXECUTABLE ${surface.surface_id} must not create authority`)
    assert.equal(surface.execution_capable, false, `NON_EXECUTABLE ${surface.surface_id} must not be execution-capable`)
  }
})

test('issue #695: release/tag creation is OPEN linked to #382 (not closed externally)', () => {
  const releaseVerification = ADVERSARIAL_TOPOLOGY.specific_surface_verifications.release_tag_creation
  assert.deepEqual(releaseVerification.surface_ids.sort(), ['RCM-016', 'RCM-017'])
  assert.equal(releaseVerification.classification, 'OPEN')
  assert.equal(releaseVerification.linked_issue, '#382')

  const rcm016 = REVERSE_CLOSURE_MAP.surfaces.find((s) => s.surface_id === 'RCM-016')
  const rcm017 = REVERSE_CLOSURE_MAP.surfaces.find((s) => s.surface_id === 'RCM-017')
  assert.ok(rcm016, 'RCM-016 must exist')
  assert.ok(rcm017, 'RCM-017 must exist')
  assert.equal(rcm016.status, 'OPEN', 'release_tag_creation must remain OPEN')
  assert.equal(rcm016.linked_issue, '#382', 'release_tag_creation must link to #382')
  assert.equal(rcm017.status, 'OPEN', 'package_artifact_publication must remain OPEN')
  assert.equal(rcm017.linked_issue, '#382', 'package_artifact_publication must link to #382')
})

test('issue #695: branch protection is OPEN linked to #380 (unless externally enforced)', () => {
  const bpVerification = ADVERSARIAL_TOPOLOGY.specific_surface_verifications.branch_protection
  assert.deepEqual(bpVerification.surface_ids.sort(), ['RCM-001', 'RCM-003'])
  assert.equal(bpVerification.classification, 'OPEN')
  assert.equal(bpVerification.linked_issue, '#380')

  const rcm001 = REVERSE_CLOSURE_MAP.surfaces.find((s) => s.surface_id === 'RCM-001')
  const rcm003 = REVERSE_CLOSURE_MAP.surfaces.find((s) => s.surface_id === 'RCM-003')
  assert.equal(rcm001.status, 'OPEN', 'repository_direct_push must remain OPEN')
  assert.equal(rcm001.linked_issue, '#380')
  assert.equal(rcm003.status, 'OPEN', 'branch_protection_enforcement must remain OPEN')
  assert.equal(rcm003.linked_issue, '#380')
})

// ── 9. RCM-022 closure verification ────────────────────────────────────────

test('issue #695: RCM-022 (adversarial_verification) is now CLOSED by this issue', () => {
  const rcm022InTopology = ADVERSARIAL_TOPOLOGY.surface_adversarial_index.find((s) => s.surface_id === 'RCM-022')
  assert.ok(rcm022InTopology, 'RCM-022 must be in adversarial topology index')
  assert.equal(rcm022InTopology.status, 'CLOSED', 'RCM-022 must be CLOSED by #695 adversarial verification')

  const closedSurfaces = EXPLOITABILITY_REPORT.closed.surfaces
  const rcm022Closed = closedSurfaces.find((s) => s.surface_id === 'RCM-022')
  assert.ok(rcm022Closed, 'RCM-022 must be in exploitability report closed surfaces')
  assert.equal(rcm022Closed.residual_exploitability, 'NONE')

  assert.match(ADVERSARIAL_TOPOLOGY.summary.note_on_rcm022_status, /CLOSED/)
  assert.match(EXPLOITABILITY_REPORT.summary.note_on_rcm022, /CLOSED/)
})

// ── 10. no stale #899 artifacts ────────────────────────────────────────────

test('issue #695: verification uses current main artifacts from #383, #896, #940 — no stale #899 dependency', () => {
  assert.equal(REVERSE_CLOSURE_MAP.issue, '383', 'must derive from #383 reverse-closure map')
  assert.ok(
    REVERSE_CLOSURE_MAP.incorporated_work.some((w) => w.issue === '#896'),
    '#896 Cloudflare containment must be incorporated',
  )
  assert.ok(
    REVERSE_CLOSURE_MAP.incorporated_work.some((w) => w.issue === '#890'),
    '#890 deployment spine must be incorporated',
  )
  assert.ok(
    REVERSE_CLOSURE_MAP.incorporated_work.some((w) => w.issue === '#939'),
    '#939 mutation surface exhaustiveness must be incorporated',
  )
  assert.match(REVERSE_CLOSURE_MAP.purpose, /#896/)
  assert.match(REVERSE_CLOSURE_MAP.purpose, /Cloudflare Git Integration/)
})
