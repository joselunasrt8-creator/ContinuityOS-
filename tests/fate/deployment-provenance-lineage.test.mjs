import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../../migrations/0014_deployment_provenance_lineage.sql', import.meta.url), 'utf8')

test('valid provenance lineage is persisted from execution through proof', () => {
  for (const field of ['repository', 'branch', 'pull_request_id', 'merge_commit_sha', 'source_tree_hash', 'workflow_run_id', 'workflow_sha']) {
    assert.match(schema, new RegExp(`${field} TEXT`), `schema must persist ${field}`)
    assert.match(source, new RegExp(`proof: [\\s\\S]*${field}`), `proof response must expose ${field}`)
  }
  assert.match(source, /validateDeploymentProvenance\(env, \{ route: "\/execute"/)
  assert.match(source, /validateDeploymentProvenance\(env, \{ route: "\/proof"/)
})

test('workflow SHA mismatch fails closed as workflow source drift', () => {
  assert.match(source, /reason: "workflow_sha_mismatch"/)
  assert.match(source, /drift_class: "workflow_source_drift"/)
  assert.match(source, /indicator: "workflow_source_mismatch"/)
})

test('reviewed tree mismatch fails closed before proof persistence', () => {
  assert.match(source, /reason: "reviewed_tree_mismatch"/)
  assert.match(source, /expected_source_tree_hash: reviewedTreeHash/)
  assert.match(source, /provided_source_tree_hash: params\.provenance\.source_tree_hash/)
})

test('replayed provenance is blocked by workflow run uniqueness', () => {
  assert.match(migration, /idx_execution_registry_workflow_run_unique[\s\S]*ON execution_registry \(workflow_run_id\)/)
  assert.match(migration, /idx_proof_registry_workflow_run_unique[\s\S]*ON proof_registry \(workflow_run_id\)/)
  assert.match(source, /reason:"replayed_provenance"/)
  assert.match(source, /indicator: "duplicate_workflow_run"/)
})

test('orphaned workflow execution cannot execute without provenance', () => {
  assert.match(source, /reason: "workflow_provenance_missing"/)
  assert.match(source, /missingDeploymentProvenance\(params\.provenance\)/)
  assert.match(source, /indicator: "workflow_provenance_missing"/)
})

test('proof provenance drift rejects execution-proof mismatches', () => {
  assert.match(source, /reason: "provenance_drift"/)
  assert.match(source, /indicator: "execution_proof_provenance_mismatch"/)
  assert.match(source, /drift_class: "provenance_drift"/)
})

test('branch lineage mismatch rejects repo, branch, and PR drift', () => {
  assert.match(source, /reason: "branch_lineage_mismatch"/)
  assert.match(source, /drift_class: "branch_lineage_drift"/)
  assert.match(source, /reason: "pull_request_lineage_mismatch"/)
})
