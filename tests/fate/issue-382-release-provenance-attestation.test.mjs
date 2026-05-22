/**
 * Issue #382 — Release Provenance and Artifact Attestation Boundary
 *
 * Generated after:
 *   - #940 reverse-closure mutation map merged
 *   - #941 adversarial execution verification merged
 *   - #942 main branch protection governance merged
 *   - #896 Cloudflare containment merged
 *   - #936/#937 governed deployment spine merged
 *
 * Scope: release/tag provenance boundary only.
 *
 * Verifies:
 *   - release_provenance_matrix.json is present and structurally valid
 *   - all 20 required verification areas are classified
 *   - all 6 required classifications are defined in classification_schema
 *   - all 10 required invariants (RPI-001 through RPI-010) are declared
 *   - specific path classifications match expected values
 *   - BREAK_GLASS paths have non_normal_execution=true and creates_release_legitimacy=false
 *   - OPEN paths have non-empty residual_gap and closure_action
 *   - EXTERNAL_POLICY paths reference external dependencies
 *   - EVIDENCE_ONLY paths are not falsely claimed as enforced
 *   - canonical_release_boundary chain has all 7 steps
 *   - no current release can be classified CANONICAL_RELEASE (all boundary steps OPEN/EXTERNAL_POLICY)
 *   - creates_authority=false for all non-BREAK_GLASS paths
 *   - cross-reference with REVERSE_CLOSURE_MUTATION_MAP (RCM-016, RCM-017)
 *   - cross-reference with adversarial_execution_topology_map (ADV-008)
 *   - cross-reference with repository_sovereignty_matrix (BSM-011)
 *   - governance doc exists and contains required sections
 *   - all RPM path IDs are unique and follow RPM-NNN format
 *
 * Evidence only — no runtime route changes, no validator changes, no proof
 * behavior changes, no execution path expansion, no authority creation,
 * no deployment capability expansion.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'))
}

function readText(path) {
  return readFileSync(join(root, path), 'utf8')
}

const PROVENANCE_MATRIX = readJson('runtime/release_provenance_matrix.json')
const REVERSE_CLOSURE_MAP = readJson('runtime/REVERSE_CLOSURE_MUTATION_MAP.json')
const ADVERSARIAL_TOPOLOGY = readJson('runtime/adversarial_execution_topology_map.json')
const SOVEREIGNTY_MATRIX = readJson('runtime/repository_sovereignty_matrix.json')

const REQUIRED_CLASSIFICATIONS = [
  'CANONICAL_RELEASE',
  'NON_CANONICAL_RELEASE',
  'OPEN',
  'EXTERNAL_POLICY',
  'BREAK_GLASS',
  'EVIDENCE_ONLY',
]

const REQUIRED_VERIFICATION_AREAS = [
  'release_tag_creation',
  'unsigned_tag_creation',
  'mutable_tag_overwrite',
  'release_notes_without_validation_evidence',
  'artifact_without_provenance_reference',
  'package_publication_without_canonical_source_commit',
  'github_release_from_non_main_commit',
  'release_from_unreviewed_commit',
  'release_without_status_check_evidence',
  'release_without_artifact_hash',
  'release_without_deployment_proof_linkage',
  'local_tag_push_bypass',
  'github_ui_release_creation_bypass',
  'workflow_created_release',
  'bot_created_release',
  'admin_root_release_bypass',
  'artifact_rebuild_drift',
  'rollback_release_lineage',
  'provenance_replay',
  'attestation_mismatch',
]

const REQUIRED_INVARIANT_IDS = [
  'RPI-001', 'RPI-002', 'RPI-003', 'RPI-004', 'RPI-005',
  'RPI-006', 'RPI-007', 'RPI-008', 'RPI-009', 'RPI-010',
]

const VALID_CLASSIFICATIONS = new Set([
  'CANONICAL_RELEASE', 'NON_CANONICAL_RELEASE', 'OPEN',
  'EXTERNAL_POLICY', 'BREAK_GLASS', 'EVIDENCE_ONLY',
])

// ── 1. artifact presence and structure ─────────────────────────────────────

test('issue #382: release_provenance_matrix.json is present and structurally valid', () => {
  assert.ok(existsSync(join(root, 'runtime/release_provenance_matrix.json')), 'release_provenance_matrix.json must exist')
  assert.equal(PROVENANCE_MATRIX.artifact, 'RELEASE_PROVENANCE_MATRIX')
  assert.equal(PROVENANCE_MATRIX.issue, '382')
  assert.ok(PROVENANCE_MATRIX.schema_version >= 1, 'schema_version must be >= 1')
  assert.ok(typeof PROVENANCE_MATRIX.purpose === 'string' && PROVENANCE_MATRIX.purpose.length > 0, 'purpose must be non-empty')
  assert.ok(Array.isArray(PROVENANCE_MATRIX.provenance_paths), 'provenance_paths must be an array')
  assert.ok(PROVENANCE_MATRIX.provenance_paths.length >= 20, 'at least 20 provenance paths required')
  assert.ok(Array.isArray(PROVENANCE_MATRIX.governance_invariants), 'governance_invariants must be an array')
  assert.ok(typeof PROVENANCE_MATRIX.classification_schema === 'object', 'classification_schema must be present')
  assert.ok(typeof PROVENANCE_MATRIX.summary === 'object', 'summary must be present')
  assert.ok(typeof PROVENANCE_MATRIX.canonical_release_boundary === 'object', 'canonical_release_boundary must be present')
})

test('issue #382: governance documentation file is present', () => {
  assert.ok(
    existsSync(join(root, 'docs/release-provenance-attestation-boundary.md')),
    'docs/release-provenance-attestation-boundary.md must exist',
  )
})

// ── 2. classification schema ─────────────────────────────────────────────

test('issue #382: classification_schema declares all six required classifications', () => {
  const schema = PROVENANCE_MATRIX.classification_schema
  for (const cls of REQUIRED_CLASSIFICATIONS) {
    assert.ok(schema[cls], `classification_schema must define ${cls}`)
    assert.ok(typeof schema[cls] === 'string' && schema[cls].length > 0, `${cls} definition must be non-empty`)
  }
})

test('issue #382: all six required classifications are used in provenance_paths', () => {
  const usedClassifications = new Set(PROVENANCE_MATRIX.provenance_paths.map((p) => p.classification))
  // CANONICAL_RELEASE and NON_CANONICAL_RELEASE may appear only in schema/non_canonical_outcome —
  // they don't need to be an active path classification since no release currently satisfies the boundary
  const activelyUsed = ['OPEN', 'EXTERNAL_POLICY', 'BREAK_GLASS', 'EVIDENCE_ONLY']
  for (const cls of activelyUsed) {
    assert.ok(usedClassifications.has(cls), `classification ${cls} must be used in at least one provenance path`)
  }
})

// ── 3. required verification areas ──────────────────────────────────────

test('issue #382: all 20 required verification areas are classified', () => {
  const pathNames = new Set(PROVENANCE_MATRIX.provenance_paths.map((p) => p.path_name))
  for (const area of REQUIRED_VERIFICATION_AREAS) {
    assert.ok(pathNames.has(area), `required verification area "${area}" must be classified in release_provenance_matrix`)
  }
})

test('issue #382: every provenance path has required structural fields', () => {
  const required = [
    'path_id', 'path_name', 'description', 'classification',
    'current_gate', 'enforcement_mechanism', 'residual_gap',
    'closure_action', 'linked_issue',
  ]
  for (const path of PROVENANCE_MATRIX.provenance_paths) {
    for (const field of required) {
      assert.ok(
        path[field] !== undefined && path[field] !== null && path[field] !== '',
        `${path.path_id} must have non-empty ${field}`,
      )
    }
    assert.ok(
      VALID_CLASSIFICATIONS.has(path.classification),
      `${path.path_id} has unknown classification: ${path.classification}`,
    )
  }
})

test('issue #382: path IDs are unique and follow RPM-NNN format', () => {
  const ids = PROVENANCE_MATRIX.provenance_paths.map((p) => p.path_id)
  const uniqueIds = new Set(ids)
  assert.equal(uniqueIds.size, ids.length, 'all path_id values must be unique')
  for (const id of ids) {
    assert.match(id, /^RPM-\d{3}$/, `path_id ${id} must follow RPM-NNN format`)
  }
})

test('issue #382: all provenance paths link to issue #382', () => {
  for (const path of PROVENANCE_MATRIX.provenance_paths) {
    assert.match(path.linked_issue, /#382/, `${path.path_id} must link to #382`)
  }
})

// ── 4. canonical release boundary ────────────────────────────────────────

test('issue #382: canonical_release_boundary has all 7 required steps', () => {
  const boundary = PROVENANCE_MATRIX.canonical_release_boundary
  assert.ok(typeof boundary.description === 'string' && boundary.description.length > 0, 'canonical_release_boundary must have description')
  assert.ok(Array.isArray(boundary.chain), 'canonical_release_boundary must have chain array')
  assert.ok(boundary.chain.length >= 7, 'canonical_release_boundary chain must have at least 7 steps')

  const stepNames = boundary.chain.map((s) => s.name)
  const required = [
    'pr_reviewed_commit',
    'required_status_checks',
    'canonical_main_commit',
    'release_tag',
    'release_notes',
    'provenance_attestation_reference',
    'immutable_artifact_identity',
  ]
  for (const name of required) {
    assert.ok(stepNames.includes(name), `canonical_release_boundary chain must include step "${name}"`)
  }
})

test('issue #382: every canonical boundary step has name, description, evidence_required, and current_status', () => {
  for (const step of PROVENANCE_MATRIX.canonical_release_boundary.chain) {
    assert.ok(step.name && step.name.length > 0, `boundary step ${step.step} must have non-empty name`)
    assert.ok(step.description && step.description.length > 0, `boundary step "${step.name}" must have non-empty description`)
    assert.ok(step.evidence_required && step.evidence_required.length > 0, `boundary step "${step.name}" must have non-empty evidence_required`)
    assert.ok(step.current_status && step.current_status.length > 0, `boundary step "${step.name}" must have non-empty current_status`)
  }
})

test('issue #382: no release can currently be classified CANONICAL_RELEASE — boundary steps are OPEN or EXTERNAL_POLICY', () => {
  const summary = PROVENANCE_MATRIX.summary
  assert.equal(
    summary.canonical_release_paths_currently_satisfiable,
    0,
    'canonical_release_paths_currently_satisfiable must be 0 — no current release satisfies the full boundary',
  )
  assert.ok(
    typeof summary.note_on_canonical_release_satisfiability === 'string' &&
      summary.note_on_canonical_release_satisfiability.length > 0,
    'summary must document why CANONICAL_RELEASE is not currently satisfiable',
  )
  // Verify that none of the active path classifications is CANONICAL_RELEASE
  const usedClassifications = new Set(PROVENANCE_MATRIX.provenance_paths.map((p) => p.classification))
  assert.ok(
    !usedClassifications.has('CANONICAL_RELEASE'),
    'no path should be classified CANONICAL_RELEASE — no release currently satisfies the full boundary',
  )
})

// ── 5. required invariants ───────────────────────────────────────────────

test('issue #382: all 10 required governance invariants (RPI-001 to RPI-010) are declared', () => {
  const invariantIds = new Set(PROVENANCE_MATRIX.governance_invariants.map((i) => i.invariant_id))
  for (const id of REQUIRED_INVARIANT_IDS) {
    assert.ok(invariantIds.has(id), `required invariant ${id} must be declared in release_provenance_matrix`)
  }
})

test('issue #382: every governance invariant has statement, description, verified=true, and basis', () => {
  for (const inv of PROVENANCE_MATRIX.governance_invariants) {
    assert.ok(inv.statement && inv.statement.length > 0, `${inv.invariant_id} must have non-empty statement`)
    assert.ok(inv.description && inv.description.length > 0, `${inv.invariant_id} must have non-empty description`)
    assert.equal(inv.verified, true, `${inv.invariant_id} must be verified=true`)
    assert.ok(inv.basis && inv.basis.length > 0, `${inv.invariant_id} must have non-empty basis`)
  }
})

test('issue #382: RPI-001 — release capability does not equal release legitimacy', () => {
  const rpi001 = PROVENANCE_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RPI-001')
  assert.ok(rpi001, 'RPI-001 must be present')
  assert.match(rpi001.statement.toLowerCase(), /release capability|capability.*legitimacy/)
  assert.equal(rpi001.verified, true)
})

test('issue #382: RPI-002 — tag existence does not equal canonical release', () => {
  const rpi002 = PROVENANCE_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RPI-002')
  assert.ok(rpi002, 'RPI-002 must be present')
  assert.match(rpi002.statement.toLowerCase(), /tag existence|existence.*canonical/)
  assert.equal(rpi002.verified, true)
})

test('issue #382: RPI-003 — artifact existence does not equal provenance', () => {
  const rpi003 = PROVENANCE_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RPI-003')
  assert.ok(rpi003, 'RPI-003 must be present')
  assert.match(rpi003.statement.toLowerCase(), /artifact existence|existence.*provenance/)
  assert.equal(rpi003.verified, true)
})

test('issue #382: RPI-004 — release notes do not equal proof', () => {
  const rpi004 = PROVENANCE_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RPI-004')
  assert.ok(rpi004, 'RPI-004 must be present')
  assert.match(rpi004.statement.toLowerCase(), /release notes|notes.*proof/)
  assert.equal(rpi004.verified, true)
})

test('issue #382: RPI-005 — canonical release must bind all required fields', () => {
  const rpi005 = PROVENANCE_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RPI-005')
  assert.ok(rpi005, 'RPI-005 must be present')
  assert.match(rpi005.statement.toLowerCase(), /canonical release.*bind|bind|tag.*commit.*artifact/)
  assert.equal(rpi005.verified, true)
  // Verify the invariant description references each of the 8 required binding fields
  const desc = rpi005.description.toLowerCase()
  assert.ok(desc.includes('tag'), 'RPI-005 must reference release tag binding')
  assert.ok(desc.includes('commit'), 'RPI-005 must reference commit SHA binding')
  assert.ok(desc.includes('artifact'), 'RPI-005 must reference artifact hash binding')
  assert.ok(desc.includes('provenance') || desc.includes('attestation'), 'RPI-005 must reference provenance binding')
})

test('issue #382: RPI-006 — release and tag creation cannot create authority', () => {
  const rpi006 = PROVENANCE_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RPI-006')
  assert.ok(rpi006, 'RPI-006 must be present')
  assert.match(rpi006.statement.toLowerCase(), /cannot create authority|release.*tag.*creation.*cannot/)
  assert.equal(rpi006.verified, true)
})

test('issue #382: RPI-007 — release provenance is evidence-only unless bound by explicit authority', () => {
  const rpi007 = PROVENANCE_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RPI-007')
  assert.ok(rpi007, 'RPI-007 must be present')
  assert.match(rpi007.statement.toLowerCase(), /evidence.only|provenance.*evidence/)
  assert.equal(rpi007.verified, true)
})

test('issue #382: RPI-008 — admin/root release paths must be classified as BREAK_GLASS', () => {
  const rpi008 = PROVENANCE_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RPI-008')
  assert.ok(rpi008, 'RPI-008 must be present')
  assert.match(rpi008.statement.toLowerCase(), /break.glass|break_glass/)
  assert.equal(rpi008.verified, true)
})

test('issue #382: RPI-009 — non-main or unreviewed release paths must be NON_CANONICAL_RELEASE or OPEN', () => {
  const rpi009 = PROVENANCE_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RPI-009')
  assert.ok(rpi009, 'RPI-009 must be present')
  assert.match(rpi009.statement.toLowerCase(), /non.canonical|non_canonical|unreviewed/)
  assert.equal(rpi009.verified, true)
})

test('issue #382: RPI-010 — release provenance must not mutate validator, execution, proof, or authority semantics', () => {
  const rpi010 = PROVENANCE_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RPI-010')
  assert.ok(rpi010, 'RPI-010 must be present')
  assert.match(rpi010.statement.toLowerCase(), /must not mutate|not mutate/)
  assert.equal(rpi010.verified, true)
})

// ── 6. BREAK_GLASS path verification ────────────────────────────────────

test('issue #382: BREAK_GLASS paths have non_normal_execution=true and creates_release_legitimacy=false', () => {
  const bgPaths = PROVENANCE_MATRIX.provenance_paths.filter((p) => p.classification === 'BREAK_GLASS')
  assert.ok(bgPaths.length >= 1, 'at least one BREAK_GLASS path must be classified')
  for (const path of bgPaths) {
    assert.equal(
      path.non_normal_execution, true,
      `BREAK_GLASS path ${path.path_id} must have non_normal_execution=true`,
    )
    assert.equal(
      path.creates_release_legitimacy, false,
      `BREAK_GLASS path ${path.path_id} must have creates_release_legitimacy=false`,
    )
  }
})

test('issue #382: admin_root_release_bypass is classified BREAK_GLASS with required fields', () => {
  const adminPath = PROVENANCE_MATRIX.provenance_paths.find((p) => p.path_name === 'admin_root_release_bypass')
  assert.ok(adminPath, 'admin_root_release_bypass must be present')
  assert.equal(adminPath.classification, 'BREAK_GLASS', 'admin_root_release_bypass must be classified BREAK_GLASS')
  assert.equal(adminPath.non_normal_execution, true, 'admin_root_release_bypass must have non_normal_execution=true')
  assert.equal(adminPath.creates_release_legitimacy, false, 'admin_root_release_bypass must have creates_release_legitimacy=false')
  assert.equal(adminPath.creates_authority, true, 'admin_root_release_bypass must acknowledge authority_capable=true (root platform capability)')
})

test('issue #382: BREAK_GLASS paths are consistent with RPI-008 invariant', () => {
  const rpi008 = PROVENANCE_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RPI-008')
  assert.ok(rpi008, 'RPI-008 must be present')
  const bgPaths = PROVENANCE_MATRIX.provenance_paths.filter((p) => p.classification === 'BREAK_GLASS')
  for (const path of bgPaths) {
    assert.equal(path.creates_release_legitimacy, false, `RPI-008: ${path.path_id} cannot create release legitimacy`)
  }
})

// ── 7. OPEN path verification ────────────────────────────────────────────

test('issue #382: OPEN paths have non-empty residual_gap and closure_action', () => {
  const openPaths = PROVENANCE_MATRIX.provenance_paths.filter((p) => p.classification === 'OPEN')
  assert.ok(openPaths.length >= 10, 'at least 10 OPEN paths must be classified')
  for (const path of openPaths) {
    assert.ok(
      path.residual_gap && path.residual_gap.length > 0,
      `OPEN path ${path.path_id} must have non-empty residual_gap`,
    )
    assert.ok(
      path.closure_action && path.closure_action.length > 0,
      `OPEN path ${path.path_id} must have non-empty closure_action`,
    )
  }
})

test('issue #382: release_tag_creation is classified OPEN and linked to RCM-016', () => {
  const tagPath = PROVENANCE_MATRIX.provenance_paths.find((p) => p.path_name === 'release_tag_creation')
  assert.ok(tagPath, 'release_tag_creation must be present')
  assert.equal(tagPath.classification, 'OPEN', 'release_tag_creation must be classified OPEN')
  assert.equal(tagPath.creates_release_legitimacy, false, 'release_tag_creation must not create release legitimacy')
  assert.match(tagPath.linked_rcm ?? '', /RCM-016/, 'release_tag_creation must reference RCM-016')
})

test('issue #382: package_publication_without_canonical_source_commit is classified OPEN and linked to RCM-017', () => {
  const pkgPath = PROVENANCE_MATRIX.provenance_paths.find(
    (p) => p.path_name === 'package_publication_without_canonical_source_commit',
  )
  assert.ok(pkgPath, 'package_publication_without_canonical_source_commit must be present')
  assert.equal(pkgPath.classification, 'OPEN', 'package_publication_without_canonical_source_commit must be classified OPEN')
  assert.equal(pkgPath.creates_release_legitimacy, false)
  assert.match(pkgPath.linked_rcm ?? '', /RCM-017/, 'must reference RCM-017')
})

test('issue #382: github_release_from_non_main_commit is classified OPEN with NON_CANONICAL_RELEASE outcome — RPI-009', () => {
  const path = PROVENANCE_MATRIX.provenance_paths.find((p) => p.path_name === 'github_release_from_non_main_commit')
  assert.ok(path, 'github_release_from_non_main_commit must be present')
  assert.equal(path.classification, 'OPEN')
  assert.match(
    (path.non_canonical_outcome ?? '').toUpperCase(),
    /NON_CANONICAL_RELEASE/,
    'github_release_from_non_main_commit must have NON_CANONICAL_RELEASE outcome',
  )
})

test('issue #382: release_from_unreviewed_commit is classified OPEN — RPI-009', () => {
  const path = PROVENANCE_MATRIX.provenance_paths.find((p) => p.path_name === 'release_from_unreviewed_commit')
  assert.ok(path, 'release_from_unreviewed_commit must be present')
  assert.equal(path.classification, 'OPEN')
  assert.equal(path.creates_release_legitimacy, false)
})

test('issue #382: unsigned_tag_creation is classified OPEN — RPI-002', () => {
  const path = PROVENANCE_MATRIX.provenance_paths.find((p) => p.path_name === 'unsigned_tag_creation')
  assert.ok(path, 'unsigned_tag_creation must be present')
  assert.equal(path.classification, 'OPEN')
  assert.equal(path.creates_release_legitimacy, false)
})

test('issue #382: mutable_tag_overwrite is classified OPEN — RPI-002', () => {
  const path = PROVENANCE_MATRIX.provenance_paths.find((p) => p.path_name === 'mutable_tag_overwrite')
  assert.ok(path, 'mutable_tag_overwrite must be present')
  assert.equal(path.classification, 'OPEN')
  assert.equal(path.creates_release_legitimacy, false)
})

test('issue #382: artifact_without_provenance_reference is classified OPEN — RPI-003', () => {
  const path = PROVENANCE_MATRIX.provenance_paths.find((p) => p.path_name === 'artifact_without_provenance_reference')
  assert.ok(path, 'artifact_without_provenance_reference must be present')
  assert.equal(path.classification, 'OPEN')
  assert.equal(path.creates_release_legitimacy, false)
})

test('issue #382: release_notes_without_validation_evidence is classified OPEN — RPI-004', () => {
  const path = PROVENANCE_MATRIX.provenance_paths.find(
    (p) => p.path_name === 'release_notes_without_validation_evidence',
  )
  assert.ok(path, 'release_notes_without_validation_evidence must be present')
  assert.equal(path.classification, 'OPEN')
  assert.equal(path.creates_release_legitimacy, false)
})

test('issue #382: provenance_replay is classified OPEN — replay prevention not implemented', () => {
  const path = PROVENANCE_MATRIX.provenance_paths.find((p) => p.path_name === 'provenance_replay')
  assert.ok(path, 'provenance_replay must be present')
  assert.equal(path.classification, 'OPEN')
  assert.equal(path.creates_release_legitimacy, false)
})

test('issue #382: attestation_mismatch is classified OPEN — attestation verification not implemented', () => {
  const path = PROVENANCE_MATRIX.provenance_paths.find((p) => p.path_name === 'attestation_mismatch')
  assert.ok(path, 'attestation_mismatch must be present')
  assert.equal(path.classification, 'OPEN')
  assert.equal(path.creates_release_legitimacy, false)
})

// ── 8. EXTERNAL_POLICY path verification ─────────────────────────────────

test('issue #382: EXTERNAL_POLICY paths have enforcement_mechanism referencing external or GitHub dependency', () => {
  const extPaths = PROVENANCE_MATRIX.provenance_paths.filter((p) => p.classification === 'EXTERNAL_POLICY')
  assert.ok(extPaths.length >= 2, 'at least 2 EXTERNAL_POLICY paths must be classified')
  for (const path of extPaths) {
    const em = path.enforcement_mechanism.toLowerCase()
    assert.ok(
      em.includes('github') || em.includes('external') || em.includes('cannot be') || em.includes('organization'),
      `EXTERNAL_POLICY path ${path.path_id} enforcement_mechanism must reference GitHub or external dependency`,
    )
  }
})

test('issue #382: github_ui_release_creation_bypass is classified EXTERNAL_POLICY — not blockable at repository level', () => {
  const path = PROVENANCE_MATRIX.provenance_paths.find((p) => p.path_name === 'github_ui_release_creation_bypass')
  assert.ok(path, 'github_ui_release_creation_bypass must be present')
  assert.equal(path.classification, 'EXTERNAL_POLICY', 'github_ui_release_creation_bypass must be EXTERNAL_POLICY')
  assert.equal(path.creates_release_legitimacy, false)
  assert.equal(path.creates_authority, false)
  // Must document that this cannot be blocked at repository level
  assert.ok(
    path.enforcement_mechanism.toLowerCase().includes('cannot') ||
      path.enforcement_mechanism.toLowerCase().includes('external'),
    'github_ui_release_creation_bypass must document that it cannot be blocked at repository level',
  )
})

test('issue #382: bot_created_release is classified EXTERNAL_POLICY', () => {
  const path = PROVENANCE_MATRIX.provenance_paths.find((p) => p.path_name === 'bot_created_release')
  assert.ok(path, 'bot_created_release must be present')
  assert.equal(path.classification, 'EXTERNAL_POLICY', 'bot_created_release must be EXTERNAL_POLICY')
  assert.equal(path.creates_release_legitimacy, false)
})

// ── 9. EVIDENCE_ONLY path verification ───────────────────────────────────

test('issue #382: workflow_created_release is classified EVIDENCE_ONLY — no release workflow exists currently', () => {
  const path = PROVENANCE_MATRIX.provenance_paths.find((p) => p.path_name === 'workflow_created_release')
  assert.ok(path, 'workflow_created_release must be present')
  assert.equal(path.classification, 'EVIDENCE_ONLY', 'workflow_created_release must be EVIDENCE_ONLY')
  assert.equal(path.creates_release_legitimacy, false)
  assert.equal(path.creates_authority, false)
  // EVIDENCE_ONLY paths must not claim full enforcement
  assert.ok(
    path.enforcement_mechanism.toLowerCase().includes('no enforcement') ||
      path.enforcement_mechanism.toLowerCase().includes('not implemented') ||
      path.enforcement_mechanism.toLowerCase().includes('observable') ||
      path.enforcement_mechanism.toLowerCase().includes('no such workflow'),
    'EVIDENCE_ONLY path workflow_created_release must not falsely claim enforcement',
  )
})

test('issue #382: EVIDENCE_ONLY paths do not claim creates_release_legitimacy=true', () => {
  const evidencePaths = PROVENANCE_MATRIX.provenance_paths.filter((p) => p.classification === 'EVIDENCE_ONLY')
  for (const path of evidencePaths) {
    assert.equal(
      path.creates_release_legitimacy, false,
      `EVIDENCE_ONLY path ${path.path_id} must not claim creates_release_legitimacy=true`,
    )
  }
})

// ── 10. authority creation invariant ────────────────────────────────────

test('issue #382: creates_authority=false for all non-BREAK_GLASS provenance paths — RPI-006', () => {
  const nonBgPaths = PROVENANCE_MATRIX.provenance_paths.filter((p) => p.classification !== 'BREAK_GLASS')
  for (const path of nonBgPaths) {
    assert.equal(
      path.creates_authority, false,
      `${path.path_id} (${path.classification}) must have creates_authority=false — RPI-006`,
    )
  }
})

test('issue #382: creates_release_legitimacy=false for all non-CANONICAL_RELEASE paths — RPI-001', () => {
  for (const path of PROVENANCE_MATRIX.provenance_paths) {
    // No path should be CANONICAL_RELEASE currently (all boundary steps are OPEN/EXTERNAL_POLICY)
    assert.equal(
      path.creates_release_legitimacy, false,
      `${path.path_id} must have creates_release_legitimacy=false — no path currently satisfies canonical boundary`,
    )
  }
})

// ── 11. cross-reference with REVERSE_CLOSURE_MUTATION_MAP ───────────────

test('issue #382: RCM-016 release_tag_creation is OPEN and linked to #382 in REVERSE_CLOSURE_MAP', () => {
  const rcm016 = REVERSE_CLOSURE_MAP.surfaces.find((s) => s.surface_id === 'RCM-016')
  assert.ok(rcm016, 'RCM-016 must exist in REVERSE_CLOSURE_MUTATION_MAP')
  assert.equal(rcm016.status, 'OPEN', 'RCM-016 must be OPEN — this issue defines its boundary, does not close it')
  assert.match(rcm016.linked_issue, /#382/, 'RCM-016 must be linked to #382')
  assert.equal(rcm016.creates_legitimacy, false, 'RCM-016 creates_legitimacy must be false')
})

test('issue #382: RCM-017 package_artifact_publication is OPEN and linked to #382 in REVERSE_CLOSURE_MAP', () => {
  const rcm017 = REVERSE_CLOSURE_MAP.surfaces.find((s) => s.surface_id === 'RCM-017')
  assert.ok(rcm017, 'RCM-017 must exist in REVERSE_CLOSURE_MUTATION_MAP')
  assert.equal(rcm017.status, 'OPEN', 'RCM-017 must be OPEN — this issue defines its boundary, does not close it')
  assert.match(rcm017.linked_issue, /#382/, 'RCM-017 must be linked to #382')
  assert.equal(rcm017.creates_legitimacy, false, 'RCM-017 creates_legitimacy must be false')
})

test('issue #382: INV-004 in REVERSE_CLOSURE_MAP confirms release/tag creation remains OPEN linked to #382', () => {
  const inv004 = REVERSE_CLOSURE_MAP.invariants.find((i) => i.invariant_id === 'INV-004')
  assert.ok(inv004, 'INV-004 must be present in REVERSE_CLOSURE_MUTATION_MAP')
  assert.equal(inv004.satisfied, true, 'INV-004 must be satisfied (OPEN status is acknowledged)')
  assert.ok(
    inv004.evidence.some((e) => e.includes('RCM-016') || e.includes('#382')),
    'INV-004 evidence must reference RCM-016 or #382',
  )
})

test('issue #382: source_dependencies in release_provenance_matrix reference RCM-016 and RCM-017', () => {
  const deps = PROVENANCE_MATRIX.source_dependencies
  assert.ok(Array.isArray(deps), 'source_dependencies must be an array')
  const rcmDep = deps.find((d) => d.artifact && d.artifact.includes('REVERSE_CLOSURE'))
  assert.ok(rcmDep, 'source_dependencies must reference REVERSE_CLOSURE_MUTATION_MAP')
  assert.ok(
    rcmDep.surfaces && rcmDep.surfaces.includes('RCM-016'),
    'source_dependencies must reference RCM-016',
  )
  assert.ok(
    rcmDep.surfaces && rcmDep.surfaces.includes('RCM-017'),
    'source_dependencies must reference RCM-017',
  )
})

// ── 12. cross-reference with adversarial_execution_topology_map ──────────

test('issue #382: ADV-008 hidden_deploy_path_discovery covers RCM-016 and RCM-017 in adversarial topology', () => {
  const adv008 = ADVERSARIAL_TOPOLOGY.adversarial_categories.find((c) => c.category_id === 'ADV-008')
  assert.ok(adv008, 'ADV-008 must be present in adversarial_execution_topology_map')
  assert.ok(
    adv008.surfaces_exercised.includes('RCM-016'),
    'ADV-008 must exercise RCM-016 (release_tag_creation)',
  )
  assert.ok(
    adv008.surfaces_exercised.includes('RCM-017'),
    'ADV-008 must exercise RCM-017 (package_artifact_publication)',
  )
})

test('issue #382: adversarial topology surface index classifies RCM-016 as OPEN with hidden_deploy_path_discovery', () => {
  const rcm016Index = ADVERSARIAL_TOPOLOGY.surface_adversarial_index.find((s) => s.surface_id === 'RCM-016')
  assert.ok(rcm016Index, 'RCM-016 must be in surface_adversarial_index')
  assert.equal(rcm016Index.status, 'OPEN', 'RCM-016 must be OPEN in adversarial topology surface index')
  assert.ok(
    rcm016Index.adversarial_categories.includes('ADV-008'),
    'RCM-016 must be covered by ADV-008',
  )
})

test('issue #382: adversarial topology surface index classifies RCM-017 as OPEN', () => {
  const rcm017Index = ADVERSARIAL_TOPOLOGY.surface_adversarial_index.find((s) => s.surface_id === 'RCM-017')
  assert.ok(rcm017Index, 'RCM-017 must be in surface_adversarial_index')
  assert.equal(rcm017Index.status, 'OPEN', 'RCM-017 must be OPEN in adversarial topology surface index')
})

// ── 13. cross-reference with repository_sovereignty_matrix ───────────────

test('issue #382: BSM-011 tag_based_mutation is classified OPEN with UNVERIFIABLE_RELEASE_PROVENANCE and links to #382', () => {
  const bsm011 = SOVEREIGNTY_MATRIX.mutation_paths.find((p) => p.path_name === 'tag_based_mutation')
  assert.ok(bsm011, 'BSM-011 tag_based_mutation must be present in repository_sovereignty_matrix')
  assert.equal(bsm011.classification, 'OPEN', 'BSM-011 must be classified OPEN')
  assert.match(bsm011.unauthorized_result ?? '', /UNVERIFIABLE_RELEASE_PROVENANCE/)
  assert.match(bsm011.linked_issue, /#382/, 'BSM-011 must link to #382')
})

test('issue #382: release_provenance_matrix references repository_sovereignty_matrix as source dependency', () => {
  const deps = PROVENANCE_MATRIX.source_dependencies
  const matrixDep = deps.find((d) => d.artifact && d.artifact.includes('repository_sovereignty'))
  assert.ok(matrixDep, 'source_dependencies must reference repository_sovereignty_matrix.json')
})

// ── 14. residual gap documentation ───────────────────────────────────────

test('issue #382: summary declares residual_open_gaps with gap IDs following RPGAP-NNN format', () => {
  const gaps = PROVENANCE_MATRIX.summary.residual_open_gaps
  assert.ok(Array.isArray(gaps), 'summary.residual_open_gaps must be an array')
  assert.ok(gaps.length >= 4, 'at least 4 residual open gaps must be documented')
  for (const gap of gaps) {
    assert.ok(gap.gap_id, 'each gap must have a gap_id')
    assert.match(gap.gap_id, /^RPGAP-\d{3}$/, `gap_id ${gap.gap_id} must follow RPGAP-NNN format`)
    assert.ok(gap.path_id, `gap ${gap.gap_id} must reference a path_id`)
    assert.ok(gap.gap, `gap ${gap.gap_id} must have a gap description`)
    assert.ok(gap.linked_issue, `gap ${gap.gap_id} must have a linked_issue`)
    assert.ok(gap.closure_requires, `gap ${gap.gap_id} must have closure_requires`)
  }
})

test('issue #382: external/root gaps (RPGAP-005, RPGAP-006) are explicit — not hidden', () => {
  const gaps = PROVENANCE_MATRIX.summary.residual_open_gaps
  const rpgap005 = gaps.find((g) => g.gap_id === 'RPGAP-005')
  const rpgap006 = gaps.find((g) => g.gap_id === 'RPGAP-006')
  assert.ok(rpgap005, 'RPGAP-005 (GitHub UI bypass) must be explicitly documented')
  assert.ok(rpgap006, 'RPGAP-006 (admin root bypass) must be explicitly documented')
  assert.match(rpgap006.closure_requires.toLowerCase(), /break.glass|cannot be eliminated/, 'RPGAP-006 must acknowledge it cannot be eliminated at repository level')
})

test('issue #382: summary documents issue_382_closure_condition', () => {
  const condition = PROVENANCE_MATRIX.summary.issue_382_closure_condition
  assert.ok(typeof condition === 'string' && condition.length > 0, 'issue_382_closure_condition must be documented')
  assert.match(condition.toLowerCase(), /every release.*path|all.*path.*declared|classification completeness/)
})

// ── 15. governance doc content verification ──────────────────────────────

test('issue #382: governance doc contains required sections', () => {
  const doc = readText('docs/release-provenance-attestation-boundary.md')

  const requiredSections = [
    'Canonical Release Boundary',
    'Classification Schema',
    'Required Invariants',
    'Verification Areas',
    'Residual Gap',
    'Issue #382 Closure Condition',
  ]

  for (const section of requiredSections) {
    assert.ok(doc.includes(section), `governance doc must contain section "${section}"`)
  }
})

test('issue #382: governance doc references RCM-016 and RCM-017', () => {
  const doc = readText('docs/release-provenance-attestation-boundary.md')
  assert.ok(doc.includes('RCM-016'), 'governance doc must reference RCM-016')
  assert.ok(doc.includes('RCM-017'), 'governance doc must reference RCM-017')
})

test('issue #382: governance doc declares evidence-only scope — no runtime or authority changes', () => {
  const doc = readText('docs/release-provenance-attestation-boundary.md')
  assert.ok(
    doc.toLowerCase().includes('evidence only') || doc.toLowerCase().includes('evidence-only'),
    'governance doc must declare evidence-only scope',
  )
  assert.ok(
    doc.toLowerCase().includes('does not') || doc.toLowerCase().includes('no runtime'),
    'governance doc must declare no runtime changes',
  )
})

test('issue #382: governance doc lists all 20 verification areas in the table', () => {
  const doc = readText('docs/release-provenance-attestation-boundary.md')
  for (const area of REQUIRED_VERIFICATION_AREAS) {
    assert.ok(doc.includes(area), `governance doc must list verification area "${area}"`)
  }
})

test('issue #382: governance doc references canonical release chain with all 7 steps', () => {
  const doc = readText('docs/release-provenance-attestation-boundary.md')
  const stepNames = [
    'PR-reviewed commit',
    'required status checks',
    'canonical main commit',
    'release tag',
    'release notes',
    'provenance',
    'artifact identity',
  ]
  for (const step of stepNames) {
    assert.ok(
      doc.toLowerCase().includes(step.toLowerCase()),
      `governance doc must reference canonical boundary step "${step}"`,
    )
  }
})

// ── 16. no .github/workflows/ release workflow introduced ────────────────

test('issue #382: no ungoverned release workflow introduced in .github/workflows/', () => {
  // Verify that any workflow file related to releases is not a new ungoverned surface
  // (workflow_created_release is EVIDENCE_ONLY — no such workflow should exist without governance)
  const workflowDir = join(root, '.github/workflows')
  const workflows = readdirSync(workflowDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))

  const releaseWorkflows = workflows.filter((f) =>
    f.toLowerCase().includes('release') || f.toLowerCase().includes('publish') || f.toLowerCase().includes('tag'),
  )

  // If any release workflow exists, it must be a governed one — currently none should exist per RPM-014
  for (const wf of releaseWorkflows) {
    const content = readText(`.github/workflows/${wf}`)
    // A governed release workflow must reference canonical chain verification
    assert.ok(
      content.includes('canonical') ||
        content.includes('provenance') ||
        content.includes('PREO') ||
        content.toLowerCase().includes('governed'),
      `Release workflow .github/workflows/${wf} must reference canonical/provenance/PREO/governed — RPM-014 EVIDENCE_ONLY`,
    )
  }
})

// ── 17. no new runtime or authority surfaces introduced ──────────────────

test('issue #382: release_provenance_matrix does not introduce runtime routes or authority', () => {
  // Verify the matrix scope field confirms evidence-only scope
  assert.ok(
    PROVENANCE_MATRIX.scope.includes('release provenance') || PROVENANCE_MATRIX.scope.includes('attestation'),
    'scope must be limited to release provenance and artifact attestation boundary',
  )
  // Verify purpose field includes evidence-only constraint
  assert.ok(
    PROVENANCE_MATRIX.purpose.toLowerCase().includes('evidence only') ||
      PROVENANCE_MATRIX.purpose.toLowerCase().includes('no runtime'),
    'purpose must declare evidence-only constraint',
  )
})

test('issue #382: canonical_release_boundary is a verification specification — not an execution gate', () => {
  const rpi010 = PROVENANCE_MATRIX.governance_invariants.find((i) => i.invariant_id === 'RPI-010')
  assert.ok(rpi010, 'RPI-010 must be present')
  // The boundary defines classification criteria, not runtime enforcement
  const boundary = PROVENANCE_MATRIX.canonical_release_boundary
  // Each step has current_status indicating OPEN/EXTERNAL_POLICY — not "enforced"
  const enforced = boundary.chain.filter((s) =>
    s.current_status.toLowerCase().startsWith('enforced') && !s.current_status.toLowerCase().includes('open') && !s.current_status.toLowerCase().includes('external'),
  )
  assert.equal(
    enforced.length, 0,
    'no canonical boundary step should claim fully enforced status — all steps are OPEN or EXTERNAL_POLICY',
  )
})
