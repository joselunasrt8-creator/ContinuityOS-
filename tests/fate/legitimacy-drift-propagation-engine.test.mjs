import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildImpactGraph,
  buildVerdictEnvelope,
  computeLegitimacyCollapse,
  computeMergeImpact,
  hashCanonical,
  propagateDrift,
} from '../../runtime/reconciliation/drift-propagation-engine.js'

function evidence(classification, reason = 'fixture_drift', identity = 'fixture') {
  return {
    topology_hash: 'topology-hash-fixture',
    topology_ancestry: ['root', 'parent', 'child'],
    drift_summary: [{ classification, reason, identity }],
  }
}

function assertEvidenceOnly(object) {
  assert.equal(object.evidence_only, true)
  assert.equal(object.executable, false)
  assert.equal(object.creates_authority, false)
  assert.equal(object.mutation_capable, false)
  assert.equal(object.deployment_capable, false)
  assert.equal(object.proof_generating, false)
  assert.equal(object.fail_closed_on_ambiguity, true)
}

test('topology drift propagation determinism produces identical verdicts for identical drift', () => {
  const first = buildVerdictEnvelope(evidence('TOPOLOGY_DRIFT'))
  const second = buildVerdictEnvelope(evidence('TOPOLOGY_DRIFT'))
  assert.equal(first.verdict_hash, second.verdict_hash)
  assert.equal(hashCanonical(first), hashCanonical(second))
  assert.equal(first.verdict, 'DRIFT_PROPAGATED')
  assertEvidenceOnly(first)
})

test('merge legitimacy collapse propagation fails closed without granting merge authority', () => {
  const propagation = propagateDrift(evidence('UNDECLARED_SURFACE'))
  const merge = computeMergeImpact(propagation)
  assert.equal(merge.merge_legitimacy, 'NULL')
  assert.equal(merge.governed_merge_allowed, false)
  assert.equal(merge.merge_surfaces_fail_closed, true)
  assert.ok(merge.invalidation_reasons.includes('MERGE_LINEAGE_CONTAMINATED'))
})

test('schema divergence ancestry invalidation propagates through route and governance bindings', () => {
  const verdict = buildVerdictEnvelope(evidence('SCHEMA_DIVERGENCE', 'schema_route_binding_orphaned'))
  assert.ok(verdict.propagation.propagated_drift_classes.includes('SCHEMA_PROPAGATION_FAILURE'))
  assert.ok(verdict.propagation.propagated_drift_classes.includes('RECONCILIATION_EQUIVALENCE_INVALID'))
  assert.equal(verdict.merge_impact.merge_legitimacy, 'NULL')
})

test('workflow expansion contamination invalidates PREO lineage and governed merge', () => {
  const propagation = propagateDrift(evidence('WORKFLOW_EXPANSION', 'hidden_workflow_expansion'))
  assert.ok(propagation.propagated_drift_classes.includes('WORKFLOW_TRUST_COLLAPSE'))
  assert.ok(propagation.propagated_drift_classes.includes('MERGE_LINEAGE_CONTAMINATED'))
})

test('proof lineage contamination spreads to execution and downstream proof trust', () => {
  const propagation = propagateDrift(evidence('TOPOLOGY_DRIFT', 'proof_lineage_discontinuity'))
  assert.ok(propagation.propagated_drift_classes.includes('PROOF_LINEAGE_CONTAMINATION'))
  assert.ok(propagation.propagated_drift_classes.includes('DOWNSTREAM_LEGITIMACY_NULL'))
})

test('recursive impact traversal bounds truncate deterministically and fail closed', () => {
  const many = {
    topology_hash: 'bounded-topology',
    topology_ancestry: [],
    drift_summary: Array.from({ length: 40 }, (_, i) => ({ classification: 'SCHEMA_DIVERGENCE', identity: `schema-${i}`, reason: 'schema_drift' })),
  }
  const graph = buildImpactGraph(many, { maxNodes: 8, maxDepth: 4 })
  assert.equal(graph.bounded, true)
  assert.equal(graph.truncated, true)
  assert.ok(graph.nodes.length <= 8)
  assert.ok(graph.drift_classes.includes('DOWNSTREAM_LEGITIMACY_NULL'))
})

test('governance propagation equivalence is canonical-order-preserving', () => {
  const a = {
    topology_hash: 'gov',
    drift_summary: [
      { classification: 'GOVERNANCE_MISMATCH', identity: 'b', reason: 'governance_runtime_divergence:/b' },
      { classification: 'GOVERNANCE_MISMATCH', identity: 'a', reason: 'governance_runtime_divergence:/a' },
    ],
  }
  const b = { ...a, drift_summary: [...a.drift_summary].reverse() }
  assert.equal(buildVerdictEnvelope(a).verdict_hash, buildVerdictEnvelope(b).verdict_hash)
})

test('replay-neutral propagation evidence excludes execution, mutation, deployment, and proof authority', () => {
  const verdict = buildVerdictEnvelope(evidence('SCHEMA_DIVERGENCE'))
  for (const object of [verdict, verdict.impact_graph, verdict.propagation, verdict.merge_impact]) assertEvidenceOnly(object)
  assert.equal(verdict.replay_neutral, true)
  assert.equal(verdict.merge_impact.governed_merge_allowed, false)
})

test('deterministic impact hashing is stable for equivalent object order', () => {
  const one = buildImpactGraph(evidence('UNDECLARED_SURFACE'))
  const two = buildImpactGraph({ ...evidence('UNDECLARED_SURFACE'), drift_summary: [...evidence('UNDECLARED_SURFACE').drift_summary] })
  assert.match(one.impact_hash, /^[0-9a-f]{64}$/)
  assert.equal(one.impact_hash, two.impact_hash)
})

test('undeclared surface contamination nulls topology and downstream legitimacy', () => {
  const verdict = buildVerdictEnvelope(evidence('UNDECLARED_SURFACE', 'execution_surface_not_declared_in_runtime_topology'))
  assert.ok(verdict.propagation.propagated_drift_classes.includes('TOPOLOGY_DRIFT_PROPAGATED'))
  assert.ok(verdict.propagation.propagated_drift_classes.includes('PROOF_LINEAGE_CONTAMINATION'))
  assert.equal(verdict.merge_impact.merge_legitimacy, 'NULL')
})

test('legitimacy drift propagation registry and GET-only routes are declared fail-closed', () => {
  const migration = readFileSync(new URL('../../migrations/0034_legitimacy_drift_propagation_registry.sql', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
  const rules = readFileSync(new URL('../../governance/runtime/MERGE_GOVERNANCE_RULES.json', import.meta.url), 'utf8')
  assert.match(migration, /CREATE TABLE IF NOT EXISTS legitimacy_drift_propagation_registry/)
  assert.match(migration, /idx_legitimacy_drift_propagation_registry_verdict/)
  assert.match(migration, /trg_legitimacy_drift_propagation_registry_no_update/)
  assert.match(source, /RECONCILIATION_IMPACT_ROUTE = "\/reconcile\/impact"/)
  assert.match(source, /DRIFT_PROPAGATION_ROUTES\.includes\(url\.pathname as any\) && request\.method !== "GET"/)
  assert.match(rules, /Unresolved propagated drift -> merge legitimacy NULL/)
  assert.match(rules, /"may_authorize_merge": false/)
})

test('legitimacy collapse quarantines topology ancestors without repairing topology', () => {
  const propagation = propagateDrift(evidence('SCHEMA_DIVERGENCE'))
  const collapse = computeLegitimacyCollapse(propagation)
  assert.equal(collapse.collapse_state, 'LEGITIMACY_NULL')
  assert.deepEqual(collapse.quarantined_ancestors, ['child', 'parent', 'root'])
  assert.equal(collapse.mutation_capable, false)
})
