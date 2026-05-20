import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalize, sha256Hex } from '../canonical.js'

function readJson(baseDir, relativePath) {
  const fullPath = join(baseDir, relativePath)
  if (!existsSync(fullPath)) return null
  return JSON.parse(readFileSync(fullPath, 'utf8'))
}

function countArray(value) { return Array.isArray(value) ? value.length : 0 }
function countMatches(text, pattern) { return (text.match(pattern) || []).length }

export function deriveInstallBaseTelemetry(baseDir = process.cwd()) {
  const governedSurfaces = readJson(baseDir, 'runtime/governed_surfaces.json')
  const sovereigntyMap = readJson(baseDir, 'runtime/sovereignty_map.json')
  const sovereigntyGaps = readJson(baseDir, 'runtime/sovereignty_gaps.json')
  const runtimeGraph = readJson(baseDir, 'runtime/topology/runtime_graph.json')
  const bypassPaths = readJson(baseDir, 'BYPASS_PATHS.json')
  const preoSpec = readJson(baseDir, 'governance/preo/PREO_SPEC.json')
  const reconciliationSpec = readJson(baseDir, 'governance/runtime/RECONCILIATION_VERIFICATION_SPEC.json')
  const federationSpec = readJson(baseDir, 'governance/runtime/FEDERATION_CONFORMANCE_SPEC.json')
  const issue565Path = join(baseDir, 'tests/fate/issue-565-telemetry-taxonomy.test.mjs')
  const issue565 = existsSync(issue565Path) ? readFileSync(issue565Path, 'utf8') : ''

  const runtime_dependency = {
    governed_execution_count: countArray(governedSurfaces?.governed),
    proof_persistence_count: (sovereigntyMap?.surfaces || []).filter((s) => s.proof_persisted === true).length,
    replay_rejection_count: countMatches(issue565, /replay_detected/g),
    validation_success_count: (runtimeGraph?.nodes || []).filter((n) => n.route === '/validate' && n.declared && n.schema_bound).length,
    validation_failure_count: countMatches(issue565, /hash_mismatch|boundary_bypass|orphan_proof|replay_detected/g),
    continuity_revocation_count: countMatches(issue565, /continuity_revoked/g),
    reconciliation_drift_count: (sovereigntyGaps?.gaps || []).filter((g) => /drift/i.test(String(g.risk_class || ''))).length,
    deterministic_quarantine_count: (sovereigntyGaps?.gaps || []).filter((g) => /quarantine/i.test(String(g.required_action || ''))).length,
  }

  const workflow_dependency = {
    preo_governed_merge_count: countArray(preoSpec?.merge_rules),
    validator_routed_execution_count: (runtimeGraph?.edges || []).filter((e) => e.from === '/compile' && e.to === '/validate').length,
    execution_boundary_enforcement_count: (runtimeGraph?.edges || []).filter((e) => e.from === '/validate' && e.to === '/execute').length,
    bypass_rejection_count: countArray(bypassPaths?.blocked_paths),
    fate_verification_coverage_count: countMatches(issue565, /test\(/g),
  }

  const ecosystem_dependency = {
    mcp_integration_count: countArray(federationSpec?.mcp_integrations),
    federation_node_count: countArray(federationSpec?.federation_nodes),
    external_schema_consumer_count: countArray(federationSpec?.external_schema_consumers),
    governance_graph_dependency_count: countArray(runtimeGraph?.nodes),
    evidence_only_federation_count: (federationSpec?.federation_nodes || []).filter((n) => n.evidence_only === true).length,
  }

  const classifications = {
    GOVERNED_EXECUTION_DEPENDENCY: runtime_dependency.governed_execution_count,
    VALIDATION_DEPENDENCY: runtime_dependency.validation_success_count + runtime_dependency.validation_failure_count,
    PROOF_DEPENDENCY: runtime_dependency.proof_persistence_count,
    CONTINUITY_DEPENDENCY: runtime_dependency.continuity_revocation_count,
    RECONCILIATION_DEPENDENCY: runtime_dependency.reconciliation_drift_count,
    FEDERATION_EVIDENCE_DEPENDENCY: ecosystem_dependency.evidence_only_federation_count,
    WORKFLOW_GOVERNANCE_DEPENDENCY: workflow_dependency.preo_governed_merge_count + workflow_dependency.validator_routed_execution_count,
  }

  const constraints = {
    telemetry_cannot_authorize_execution: true,
    telemetry_cannot_become_proof: true,
    append_only_when_persisted: true,
    no_execution_route_expansion: true,
    no_validated_object_mutation: true,
    no_replay_state_mutation: true,
    fail_closed_semantics_preserved: true,
    exact_object_enforcement_preserved: true,
  }

  const reportCore = {
    artifact: 'INSTALL_BASE_TELEMETRY_REPORT',
    install_base_semantics: 'governed_execution_dependency',
    canonical_chain: ['/session', '/continuity', '/authority', '/compile', '/validate', '/execute', '/proof'],
    read_only: true,
    non_authoritative: true,
    creates_authority: false,
    creates_proof: false,
    telemetry_boundary: 'observability_only_evidence_only_non_executable',
    categories: { runtime_dependency, workflow_dependency, ecosystem_dependency },
    classifications,
    constraints,
    graph_projection: {
      node_sets: ['runtime_nodes', 'governance_nodes', 'federation_nodes'],
      edge_sets: ['canonical_chain_edges', 'governance_dependency_edges', 'evidence_federation_edges'],
      install_base_signal: 'sum(classifications[*])',
    },
    metrics: {
      governed_surface_count: (sovereigntyMap?.surfaces || []).filter((s) => s.sovereignty_tier === 'S0' || s.sovereignty_tier === 'S1').length,
      ungoverned_surface_count: (sovereigntyMap?.surfaces || []).filter((s) => s.sovereignty_tier === 'S2' || s.sovereignty_tier === 'S3').length,
      open_sovereignty_gap_count: (sovereigntyGaps?.gaps || []).filter((g) => g.sovereignty_tier === 'S3').length,
      contained_sovereignty_gap_count: (sovereigntyGaps?.gaps || []).filter((g) => g.sovereignty_tier === 'S2').length,
      install_base_artifacts_present: ['runtime/governed_surfaces.json', 'runtime/sovereignty_map.json', 'runtime/sovereignty_gaps.json'].every((p) => existsSync(join(baseDir, p))),
      graph_projection_present: Array.isArray(runtimeGraph?.canonical_lifecycle) && runtimeGraph.canonical_lifecycle.join(' -> ').includes('/validate -> /execute -> /proof'),
    },
  }

  const unknownSafeMetrics = JSON.parse(canonicalize(reportCore), (_, v) => (v ?? 'UNKNOWN'))
  const report_hash = sha256Hex(canonicalize(unknownSafeMetrics))
  return { ...unknownSafeMetrics, report_hash }
}
