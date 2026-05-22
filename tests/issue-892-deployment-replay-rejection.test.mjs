import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyDeploymentProof, canonicalProofBindingHash } from '../src/runtime/deployment/verifyDeploymentProof.ts'
import { verifyDeploymentProvenance, provenanceIsReplayed } from '../src/runtime/deployment/verifyDeploymentProvenance.ts'

function validCandidate(overrides = {}) {
  return {
    deployment_proof_id: `dproof-${Math.random().toString(36).slice(2)}`,
    workflow_hash: 'wf-hash-canonical',
    artifact_hash: 'artifact-hash-canonical',
    commit_sha: 'abc123def456',
    deployment_environment: 'production',
    provenance_lineage_hash: 'provenance-lineage-hash-canonical',
    ...overrides
  }
}

function priorProof(overrides = {}) {
  const base = validCandidate()
  return {
    ...base,
    proof_binding_hash: canonicalProofBindingHash({
      workflow_hash: base.workflow_hash,
      artifact_hash: base.artifact_hash,
      commit_sha: base.commit_sha,
      deployment_environment: base.deployment_environment,
      provenance_lineage_hash: base.provenance_lineage_hash,
    }),
    ...overrides,
  }
}

test('stale workflow deployment rejected when workflow_hash differs from prior', () => {
  const prior = priorProof()
  const candidate = validCandidate({ workflow_hash: 'stale-workflow-hash' })
  const result = verifyDeploymentProof({ candidate, prior_proof: prior })
  assert.deepEqual(result, { ok: false, reason: 'stale_workflow_deployment' })
})

test('artifact hash mismatch rejected when artifact_hash differs from prior', () => {
  const prior = priorProof()
  const candidate = validCandidate({ artifact_hash: 'mismatched-artifact-hash' })
  const result = verifyDeploymentProof({ candidate, prior_proof: prior })
  assert.deepEqual(result, { ok: false, reason: 'artifact_hash_mismatch' })
})

test('commit sha mismatch rejected when commit_sha differs from prior', () => {
  const prior = priorProof()
  const candidate = validCandidate({ commit_sha: 'different-commit-sha' })
  const result = verifyDeploymentProof({ candidate, prior_proof: prior })
  assert.deepEqual(result, { ok: false, reason: 'commit_sha_mismatch' })
})

test('replayed deployment proof rejected when proof_binding_hash matches prior', () => {
  const base = validCandidate()
  const binding = canonicalProofBindingHash({
    workflow_hash: base.workflow_hash,
    artifact_hash: base.artifact_hash,
    commit_sha: base.commit_sha,
    deployment_environment: base.deployment_environment,
    provenance_lineage_hash: base.provenance_lineage_hash,
  })
  const prior = { ...base, proof_binding_hash: binding }
  const candidate = { ...base, proof_binding_hash: binding }
  const result = verifyDeploymentProof({ candidate, prior_proof: prior })
  assert.deepEqual(result, { ok: false, reason: 'replayed_deployment_proof' })
})

test('deployment lineage drift rejected when provenance_lineage_hash differs from prior', () => {
  const prior = priorProof()
  const candidate = validCandidate({ provenance_lineage_hash: 'diverged-lineage-hash' })
  const result = verifyDeploymentProof({ candidate, prior_proof: prior })
  assert.deepEqual(result, { ok: false, reason: 'deployment_lineage_drift' })
})

test('deterministic NULL behavior: all rejection paths return ok: false with reason', () => {
  const prior = priorProof()

  const cases = [
    [validCandidate({ workflow_hash: '' }), 'missing_workflow_hash'],
    [validCandidate({ artifact_hash: '' }), 'missing_artifact_hash'],
    [validCandidate({ commit_sha: '' }), 'missing_commit_sha'],
    [validCandidate({ deployment_environment: '' }), 'missing_deployment_environment'],
    [validCandidate({ provenance_lineage_hash: '' }), 'missing_provenance_lineage'],
    [validCandidate({ workflow_hash: 'stale' }), 'stale_workflow_deployment'],
    [validCandidate({ artifact_hash: 'mismatch' }), 'artifact_hash_mismatch'],
    [validCandidate({ commit_sha: 'mismatch' }), 'commit_sha_mismatch'],
  ]

  for (const [candidate, expectedReason] of cases) {
    const needsPrior = ['stale_workflow_deployment', 'artifact_hash_mismatch', 'commit_sha_mismatch'].includes(expectedReason)
    const result = verifyDeploymentProof({ candidate, prior_proof: needsPrior ? prior : undefined })
    assert.equal(result.ok, false, `expected failure for reason ${expectedReason}`)
    assert.equal(result.reason, expectedReason)
  }
})

test('workflow_hash equality check is required for deployment validation', () => {
  const prior = priorProof()
  const matching = validCandidate()
  const result = verifyDeploymentProof({ candidate: matching, prior_proof: prior })
  assert.equal(result.ok, true)
})

test('artifact_hash equality check is required for deployment validation', () => {
  const prior = priorProof({ artifact_hash: 'specific-artifact' })
  const matching = validCandidate({ artifact_hash: 'specific-artifact' })
  const mismatch = validCandidate({ artifact_hash: 'other-artifact' })
  assert.equal(verifyDeploymentProof({ candidate: matching, prior_proof: prior }).ok, true)
  assert.equal(verifyDeploymentProof({ candidate: mismatch, prior_proof: prior }).ok, false)
})

test('commit_sha equality check is required for deployment validation', () => {
  const prior = priorProof({ commit_sha: 'canonical-sha' })
  const matching = validCandidate({ commit_sha: 'canonical-sha' })
  const mismatch = validCandidate({ commit_sha: 'other-sha' })
  assert.equal(verifyDeploymentProof({ candidate: matching, prior_proof: prior }).ok, true)
  assert.equal(verifyDeploymentProof({ candidate: mismatch, prior_proof: prior }).ok, false)
})

test('deployment proof lineage equality check rejects lineage drift', () => {
  const prior = priorProof({ provenance_lineage_hash: 'canonical-lineage' })
  const matching = validCandidate({ provenance_lineage_hash: 'canonical-lineage' })
  const drift = validCandidate({ provenance_lineage_hash: 'drifted-lineage' })
  assert.equal(verifyDeploymentProof({ candidate: matching, prior_proof: prior }).ok, true)
  assert.equal(verifyDeploymentProof({ candidate: drift, prior_proof: prior }).ok, false)
  assert.equal(verifyDeploymentProof({ candidate: drift, prior_proof: prior }).reason, 'deployment_lineage_drift')
})

test('deployment without prior proof is not replay-checked but still validated', () => {
  const candidate = validCandidate()
  const result = verifyDeploymentProof({ candidate })
  assert.equal(result.ok, true)
})

test('replayed provenance is detected and rejected', () => {
  const record = {
    provenance_id: 'prov-1',
    commit_sha: 'sha1',
    workflow_hash: 'wf1',
    artifact_hash: 'art1',
    deploy_actor: 'actor',
    deployment_timestamp: '2026-01-01T00:00:00.000Z',
    environment_classification: 'production',
    deployment_proof_id: 'proof-1',
  }
  assert.equal(provenanceIsReplayed(record, record), true)
  assert.equal(provenanceIsReplayed(record, { ...record, commit_sha: 'sha2' }), false)
})

test('provenance validation fails closed: missing fields return NULL reason', () => {
  const requiredFields = ['commit_sha', 'workflow_hash', 'artifact_hash', 'deploy_actor', 'deployment_timestamp', 'environment_classification', 'deployment_proof_id']
  for (const field of requiredFields) {
    const r = verifyDeploymentProvenance({ commit_sha: 'x', workflow_hash: 'x', artifact_hash: 'x', deploy_actor: 'x', deployment_timestamp: 'x', environment_classification: 'x', deployment_proof_id: 'x', [field]: '' })
    assert.equal(r.ok, false)
    assert.ok(r.reason.startsWith('missing_'), `expected missing_ reason for ${field}, got ${r.reason}`)
  }
})
