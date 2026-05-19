import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalize, sha256Hex } from '../canonical.js'

function readJson(baseDir, relativePath) {
  const fullPath = join(baseDir, relativePath)
  if (!existsSync(fullPath)) return null
  return JSON.parse(readFileSync(fullPath, 'utf8'))
}

function countArray(value) { return Array.isArray(value) ? value.length : 0 }

export function deriveInstallBaseTelemetry(baseDir = process.cwd()) {
  const governedSurfaces = readJson(baseDir, 'runtime/governed_surfaces.json')
  const sovereigntyMap = readJson(baseDir, 'runtime/sovereignty_map.json')
  const sovereigntyGaps = readJson(baseDir, 'runtime/sovereignty_gaps.json')
  const runtimeGraph = readJson(baseDir, 'runtime/topology/runtime_graph.json')
  const bypassPaths = readJson(baseDir, 'BYPASS_PATHS.json')
  const issue565Path = join(baseDir, 'tests/fate/issue-565-telemetry-taxonomy.test.mjs')
  const issue565 = existsSync(issue565Path) ? readFileSync(issue565Path, 'utf8') : ''
  const reconciliationSpec = readJson(baseDir, 'governance/runtime/RECONCILIATION_VERIFICATION_SPEC.json')

  const metrics = {
    governed_execution_count: countArray(governedSurfaces?.governed),
    governed_deploy_count: (governedSurfaces?.governed || []).filter((s) => /deploy/i.test(String(s.surface_id || ''))).length,
    proof_persisted_count: (sovereigntyMap?.surfaces || []).filter((s) => s.proof_persisted === true).length,
    validation_success_count: (runtimeGraph?.nodes || []).filter((n) => n.route === '/validate' && n.declared && n.schema_bound).length,
    validation_null_count: (issue565.match(/'[^']+'/g) || []).filter((v) => v === "'hash_mismatch'" || v === "'boundary_bypass'" || v === "'orphan_proof'" || v === "'replay_detected'").length,
    replay_rejection_count: (issue565.match(/replay_detected/g) || []).length,
    hash_mismatch_rejection_count: (issue565.match(/hash_mismatch/g) || []).length,
    boundary_bypass_rejection_count: (issue565.match(/boundary_bypass/g) || []).length,
    orphan_proof_detection_count: Math.max(
      (reconciliationSpec?.reconciliation_tests || []).filter((t) => t.test_id === 'orphan_proof_detection').length,
      (issue565.match(/orphan_proof/g) || []).length > 0 ? 1 : 0,
    ),
    governed_surface_count: (sovereigntyMap?.surfaces || []).filter((s) => s.sovereignty_tier === 'S0' || s.sovereignty_tier === 'S1').length,
    ungoverned_surface_count: (sovereigntyMap?.surfaces || []).filter((s) => s.sovereignty_tier === 'S2' || s.sovereignty_tier === 'S3').length,
    open_sovereignty_gap_count: (sovereigntyGaps?.gaps || []).filter((g) => g.sovereignty_tier === 'S3').length,
    contained_sovereignty_gap_count: (sovereigntyGaps?.gaps || []).filter((g) => g.sovereignty_tier === 'S2').length,
    install_base_artifacts_present: ['runtime/governed_surfaces.json', 'runtime/sovereignty_map.json', 'runtime/sovereignty_gaps.json'].every((p) => existsSync(join(baseDir, p))),
    graph_projection_present: Array.isArray(runtimeGraph?.canonical_lifecycle) && runtimeGraph.canonical_lifecycle.join(' -> ').includes('/session'),
  }

  const unknownSafeMetrics = Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, v ?? 'UNKNOWN']))

  const reportCore = {
    artifact: 'INSTALL_BASE_TELEMETRY_REPORT',
    generated_from: 'reconciliation+proof+NULL+sovereignty+governed-deploy artifacts',
    canonical_chain: ['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof'],
    read_only: true,
    non_authoritative: true,
    creates_authority: false,
    creates_proof: false,
    metrics: unknownSafeMetrics,
  }

  const report_hash = sha256Hex(canonicalize(reportCore))
  return { ...reportCore, report_hash }
}
