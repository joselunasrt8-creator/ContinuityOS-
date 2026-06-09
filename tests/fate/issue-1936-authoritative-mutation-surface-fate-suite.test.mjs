// Issue #1936: Authoritative Mutation Surface Fate Suite.
//
// Proves, for every mutation-capable execution surface declared in
// runtime/AUTHORITATIVE_MUTATION_SURFACE_FATE_REGISTRY.json, that:
//
//   validated_object == executed_object   (validated_object_hash == executed_object_hash)
//   or
//   NULL
//
// and that the proof hash (receipt_id / proof_id) is bound to the executed hash,
// and that nothing happens (no executor/writer call, no mutation) when no valid
// object exists.
//
// Surfaces covered:
//   - filesystem        (executeFilesystemAdapter, via executeWithAdapter)
//   - cloudflare_worker (executeCloudflareAdapter, via executeWithAdapter)
//   - d1                (executeD1Adapter, via executeWithAdapter)
//   - github            (executeGitHubIssueComment, standalone)
//   - runtime_execute_route (canonical /execute route — static closure over
//                             existing source-level fate tests)
//
// Replay protection (REPLAYED_OBJECT_NULL) is exercised end-to-end for the
// filesystem surface via runFilesystemWriteGatewayAction + ReplayRegistryPort,
// the only surface in this repo with a local replay registry mock.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  computeAdapterAEOHash,
  executeWithAdapter,
} from '../../src/lib/adapter-contract.ts'
import { executeCloudflareAdapter, CLOUDFLARE_ADAPTER_SURFACE } from '../../src/lib/cloudflare-adapter.ts'
import { executeD1Adapter, D1_ADAPTER_SURFACE } from '../../src/lib/d1-storage-adapter.ts'
import { executeFilesystemAdapter, FILESYSTEM_ADAPTER_SURFACE } from '../../src/lib/filesystem-execution-adapter.ts'
import {
  captureGitHubIssueCommentATAO,
  compileGitHubIssueCommentAEO,
  computeGitHubIssueCommentAEOHash,
  executeGitHubIssueComment,
} from '../../src/lib/github-issue-comment-gateway.ts'
import { runFilesystemWriteGatewayAction } from '../../src/lib/filesystem-write-runtime-gateway.ts'
import { runAdapterFateMatrix, EMITTED_AT } from './authoritative-fate-matrix-helpers.mjs'

const registry = JSON.parse(
  readFileSync(new URL('../../runtime/AUTHORITATIVE_MUTATION_SURFACE_FATE_REGISTRY.json', import.meta.url), 'utf8'),
)

// ── Registry sanity ───────────────────────────────────────────────────────────

test('registry declares the five mutation-capable execution surfaces in scope', () => {
  const ids = registry.surfaces.map((s) => s.surface_id).sort()
  assert.deepEqual(ids, ['cloudflare_worker', 'd1', 'filesystem', 'github', 'runtime_execute_route'])
})

// ── Surface 1: filesystem (executeFilesystemAdapter / executeWithAdapter) ────

function makeFilesystemAEO(targetOverrides = {}) {
  return Object.freeze({
    intent: Object.freeze({ action: 'modify_file', purpose: 'bounded filesystem write' }),
    scope: Object.freeze({ allowed_paths: ['src/**'], max_files: 1 }),
    validation: Object.freeze({
      decision_id: 'AUTH-fs-001',
      authority_lineage_hash: 'sha256:fs-lineage-001',
      policy_id: 'filesystem-write-policy-v1',
      policy_hash: 'sha256:fs-policy-001',
      replay_nonce: 'nonce-fs-001',
      aeo_hash_required: true,
      requires_unused_nonce: true,
    }),
    target: Object.freeze({
      system: 'filesystem',
      path: 'src/example.ts',
      operation: 'modify',
      ...targetOverrides,
    }),
    finality: Object.freeze({
      proof_required: true,
      proof_type: 'filesystem_write_execution',
      replay_state_after_success: 'CONSUMED',
    }),
  })
}

function mutateFilesystemAEO(aeo) {
  return makeFilesystemAEO({ path: aeo.target.path + '.mutated' })
}

{
  let fsCallCount = 0
  function fsWriter(input) {
    fsCallCount++
    return { execution_id: `fs-write:sha256:fixture-${fsCallCount}`, executed_at: EMITTED_AT, bytes_written: input.content.length }
  }

  runAdapterFateMatrix({
    surfaceId: 'filesystem',
    makeAEO: makeFilesystemAEO,
    mutateAEO: mutateFilesystemAEO,
    callExecute: (aeo, hash) => executeFilesystemAdapter(aeo, hash, 'export const x = 1\n', fsWriter, EMITTED_AT),
    resetCallCount: () => { fsCallCount = 0 },
    getCallCount: () => fsCallCount,
  })
}

test('[filesystem] FILESYSTEM_ADAPTER_SURFACE constant is "filesystem"', () => {
  assert.equal(FILESYSTEM_ADAPTER_SURFACE, 'filesystem')
})

// ── Surface 2: cloudflare_worker (executeCloudflareAdapter / executeWithAdapter) ─

function makeCloudflareAEO(targetOverrides = {}) {
  return Object.freeze({
    intent: Object.freeze({ action: 'deploy_worker', purpose: 'bounded worker deployment' }),
    scope: Object.freeze({ worker_name: 'mindshift-demo', max_bundle_kb: 256 }),
    validation: Object.freeze({
      decision_id: 'AUTH-cf-1936',
      authority_lineage_hash: 'sha256:cf-lineage-1936',
      policy_id: 'cloudflare-deploy-policy-v1',
      policy_hash: 'sha256:cf-policy-1936',
      replay_nonce: 'nonce-cf-1936',
      aeo_hash_required: true,
      requires_unused_nonce: true,
    }),
    target: Object.freeze({
      system: 'cloudflare_worker',
      worker_url: 'https://api.cloudflare.com/client/v4/accounts/test-acct/workers/scripts/mindshift',
      method: 'PUT',
      path: '/scripts/mindshift-demo',
      request_body_hash: 'sha256:bundle-1936',
      ...targetOverrides,
    }),
    finality: Object.freeze({
      proof_required: true,
      proof_type: 'cloudflare_worker_deployment',
      replay_state_after_success: 'CONSUMED',
    }),
  })
}

function mutateCloudflareAEO(aeo) {
  return makeCloudflareAEO({ path: aeo.target.path + '-mutated' })
}

const GOOD_CF_EVIDENCE = Object.freeze({
  execution_id: 'ray-1936abcdef',
  executed_at: EMITTED_AT,
  adapter_surface: 'cloudflare_worker',
  adapter_specific: Object.freeze({ status_code: 200, response_hash: 'sha256:response-1936', worker_region: 'us-east-1' }),
})

{
  let cfCallCount = 0
  runAdapterFateMatrix({
    surfaceId: 'cloudflare_worker',
    makeAEO: makeCloudflareAEO,
    mutateAEO: mutateCloudflareAEO,
    callExecute: (aeo, hash) => executeCloudflareAdapter(aeo, hash, () => { cfCallCount++; return GOOD_CF_EVIDENCE }, EMITTED_AT),
    resetCallCount: () => { cfCallCount = 0 },
    getCallCount: () => cfCallCount,
  })
}

test('[cloudflare_worker] CLOUDFLARE_ADAPTER_SURFACE constant is "cloudflare_worker"', () => {
  assert.equal(CLOUDFLARE_ADAPTER_SURFACE, 'cloudflare_worker')
})

// ── Surface 3: d1 (executeD1Adapter / executeWithAdapter) ────────────────────

function makeD1AEO(targetOverrides = {}) {
  return Object.freeze({
    intent: Object.freeze({ action: 'store_proof_receipt', purpose: 'bounded proof storage' }),
    scope: Object.freeze({ database_id: 'd1-mindshift-prod', allowed_tables: ['proof_receipts'] }),
    validation: Object.freeze({
      decision_id: 'AUTH-d1-1936',
      authority_lineage_hash: 'sha256:d1-lineage-1936',
      policy_id: 'd1-insert-policy-v1',
      policy_hash: 'sha256:d1-policy-1936',
      replay_nonce: 'nonce-d1-1936',
      aeo_hash_required: true,
      requires_unused_nonce: true,
    }),
    target: Object.freeze({
      system: 'd1',
      database_id: 'd1-mindshift-prod',
      table_name: 'proof_receipts',
      operation: 'INSERT',
      parameter_hash: 'sha256:params-1936',
      ...targetOverrides,
    }),
    finality: Object.freeze({
      proof_required: true,
      proof_type: 'd1_storage_execution',
      replay_state_after_success: 'CONSUMED',
    }),
  })
}

function mutateD1AEO(aeo) {
  return makeD1AEO({ parameter_hash: aeo.target.parameter_hash + '-mutated' })
}

const GOOD_D1_EVIDENCE = Object.freeze({
  execution_id: 'query-1936xyz',
  executed_at: EMITTED_AT,
  adapter_surface: 'd1',
  adapter_specific: Object.freeze({ rows_affected: 1, table_name: 'proof_receipts', operation: 'INSERT' }),
})

{
  let d1CallCount = 0
  runAdapterFateMatrix({
    surfaceId: 'd1',
    makeAEO: makeD1AEO,
    mutateAEO: mutateD1AEO,
    callExecute: (aeo, hash) => executeD1Adapter(aeo, hash, () => { d1CallCount++; return GOOD_D1_EVIDENCE }, EMITTED_AT),
    resetCallCount: () => { d1CallCount = 0 },
    getCallCount: () => d1CallCount,
  })
}

test('[d1] D1_ADAPTER_SURFACE constant is "d1"', () => {
  assert.equal(D1_ADAPTER_SURFACE, 'd1')
})

// ── Surface 4: github (executeGitHubIssueComment, standalone) ───────────────

function makeGithubATAOInput(overrides = {}) {
  return {
    agent_id: 'agent-1936',
    session_id: 'session-1936',
    intent: 'reply to triage question on a bounded GitHub issue',
    owner: 'example-owner',
    repo: 'example-repo',
    issue_number: 42,
    body: 'Authoritative mutation surface fate suite check-in.',
    timestamp: '2026-06-09T00:00:00.000Z',
    ...overrides,
  }
}

function makeGithubBinding(overrides = {}) {
  return {
    decision_id: 'AUTH-github-1936',
    authority_lineage_hash: 'sha256:authority-lineage-1936',
    policy_id: 'github-issue-comment-policy-v1',
    policy_hash: 'sha256:policy-1936',
    replay_nonce: 'github-comment-nonce-1936',
    allowed_owner: 'example-owner',
    allowed_repo: 'example-repo',
    allowed_issue_numbers: [42],
    max_body_length: 280,
    ...overrides,
  }
}

function makeGithubAEO(bodyOverride) {
  const atao = captureGitHubIssueCommentATAO(makeGithubATAOInput(bodyOverride ? { body: bodyOverride } : {}))
  assert.notEqual(atao, null)
  const aeo = compileGitHubIssueCommentAEO(atao, makeGithubBinding())
  assert.notEqual(aeo, null)
  return { atao, aeo }
}

function makeGithubExecutor(state) {
  return (input) => {
    state.calls++
    return { comment_id: 'comment-1936', comment_url: `https://github.com/${input.owner}/${input.repo}/issues/${input.issue_number}#issuecomment-1936`, executed_at: EMITTED_AT }
  }
}

test('[github] INVALID_OBJECT_NULL: null/missing aeo returns NULL, executor not called', () => {
  const { atao } = makeGithubAEO()
  const state = { calls: 0 }
  const executor = makeGithubExecutor(state)

  assert.equal(executeGitHubIssueComment(null), null)
  assert.equal(executeGitHubIssueComment({ aeo: null, atao, validated_object_hash: 'sha256:x', executor, emitted_at: EMITTED_AT }), null)
  assert.equal(executeGitHubIssueComment({ aeo: undefined, atao, validated_object_hash: 'sha256:x', executor, emitted_at: EMITTED_AT }), null)
  assert.equal(state.calls, 0, 'executor must not run for an invalid object')
})

test('[github] UNAUTHORIZED_OBJECT_NULL: blank or forged validated_object_hash returns NULL, executor not called', () => {
  const { atao, aeo } = makeGithubAEO()
  const state = { calls: 0 }
  const executor = makeGithubExecutor(state)

  const blank = executeGitHubIssueComment({ aeo, atao, validated_object_hash: '', executor, emitted_at: EMITTED_AT })
  assert.equal(blank, null)

  const forged = executeGitHubIssueComment({ aeo, atao, validated_object_hash: 'sha256:' + '0'.repeat(64), executor, emitted_at: EMITTED_AT })
  assert.equal(forged, null)

  assert.equal(state.calls, 0, 'executor must not run for an unauthorized hash')
})

test('[github] MUTATED_AFTER_VALIDATION_NULL: aeo mutated after hash computed returns NULL, executor not called', () => {
  const { atao, aeo } = makeGithubAEO()
  const validHash = computeGitHubIssueCommentAEOHash(aeo)

  const { aeo: mutatedAeo } = makeGithubAEO('Authoritative mutation surface fate suite check-in — MUTATED.')
  const state = { calls: 0 }
  const executor = makeGithubExecutor(state)

  const out = executeGitHubIssueComment({ aeo: mutatedAeo, atao, validated_object_hash: validHash, executor, emitted_at: EMITTED_AT })
  assert.equal(out, null)
  assert.equal(state.calls, 0, 'executor must not run when the validated object was mutated')
})

test('[github] EXECUTED_HASH_EQUALS_VALIDATED_HASH: proof.validated_object_hash === proof.executed_object_hash', () => {
  const { atao, aeo } = makeGithubAEO()
  const hash = computeGitHubIssueCommentAEOHash(aeo)
  const state = { calls: 0 }
  const executor = makeGithubExecutor(state)

  const proof = executeGitHubIssueComment({ aeo, atao, validated_object_hash: hash, executor, emitted_at: EMITTED_AT })
  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'EXECUTED')
  assert.equal(proof.validated_object_hash, hash)
  assert.equal(proof.executed_object_hash, hash)
  assert.equal(proof.validated_object_hash, proof.executed_object_hash)
  assert.equal(state.calls, 1, 'executor must run exactly once for a valid object')
})

test('[github] PROOF_HASH_BOUND_TO_EXECUTED_HASH: proof_id changes when executed_object_hash changes', () => {
  const a = makeGithubAEO()
  const hashA = computeGitHubIssueCommentAEOHash(a.aeo)
  const stateA = { calls: 0 }
  const proofA = executeGitHubIssueComment({ aeo: a.aeo, atao: a.atao, validated_object_hash: hashA, executor: makeGithubExecutor(stateA), emitted_at: EMITTED_AT })

  const b = makeGithubAEO('Authoritative mutation surface fate suite check-in — different body.')
  const hashB = computeGitHubIssueCommentAEOHash(b.aeo)
  const stateB = { calls: 0 }
  const proofB = executeGitHubIssueComment({ aeo: b.aeo, atao: b.atao, validated_object_hash: hashB, executor: makeGithubExecutor(stateB), emitted_at: EMITTED_AT })

  assert.notEqual(proofA, null)
  assert.notEqual(proofB, null)
  assert.notEqual(hashA, hashB, 'fixture mutation must change the AEO hash')
  assert.notEqual(proofA.executed_object_hash, proofB.executed_object_hash)
  assert.notEqual(proofA.proof_id, proofB.proof_id, 'proof hash (proof_id) must be bound to executed_object_hash')
})

test('[github] NOTHING_HAPPENS_WITHOUT_VALID: executor never invoked across all NULL branches', () => {
  const { atao, aeo } = makeGithubAEO()
  const validHash = computeGitHubIssueCommentAEOHash(aeo)
  const { aeo: mutatedAeo } = makeGithubAEO('Authoritative mutation surface fate suite check-in — MUTATED 2.')
  const state = { calls: 0 }
  const executor = makeGithubExecutor(state)

  executeGitHubIssueComment(null)
  executeGitHubIssueComment({ aeo: null, atao, validated_object_hash: validHash, executor, emitted_at: EMITTED_AT })
  executeGitHubIssueComment({ aeo, atao, validated_object_hash: '', executor, emitted_at: EMITTED_AT })
  executeGitHubIssueComment({ aeo, atao, validated_object_hash: 'sha256:' + '0'.repeat(64), executor, emitted_at: EMITTED_AT })
  executeGitHubIssueComment({ aeo: mutatedAeo, atao, validated_object_hash: validHash, executor, emitted_at: EMITTED_AT })

  assert.equal(state.calls, 0, 'no NULL branch may invoke the github executor')
})

// ── Surface 1 (replay): filesystem REPLAYED_OBJECT_NULL via the runtime gateway ─

function makeGatewayATAOInput(overrides = {}) {
  return {
    agent_id: 'agent-1936',
    session_id: 'session-1936',
    intent: 'authoritative mutation surface fate suite probe',
    path: 'src/example-1936.ts',
    content: 'export const fateSuite1936 = true\n',
    repo: 'mindshift-demo',
    root: 'repository',
    timestamp: '2026-06-09T00:00:00.000Z',
    ...overrides,
  }
}

function makeGatewayBinding(overrides = {}) {
  return {
    decision_id: 'AUTH-fixture-1936',
    authority_lineage_hash: 'sha256:fixture-authority-lineage-1936',
    policy_id: 'filesystem-write-policy-v1',
    policy_hash: 'sha256:fixture-policy-hash-1936',
    pre_write_hash: 'sha256:fixture-pre-write-hash-1936',
    proposed_diff_hash: '',
    replay_nonce: 'fixture-nonce-1936',
    allowed_paths: ['src/**', 'tests/**', 'docs/**'],
    denied_paths: ['.github/workflows/**', 'wrangler.toml', '.env*', 'secrets/**'],
    allowed_operations: ['create', 'modify'],
    denied_operations: ['delete', 'chmod', 'rename', 'symlink'],
    max_files: 1,
    max_diff_lines: 300,
    ...overrides,
  }
}

function makeGatewayValidatorContext(overrides = {}) {
  const base = {
    authorityRegistry: {
      readDecision: async () => ({ ok: true, value: { decision_id: 'AUTH-fixture-1936', status: 'ACTIVE', authority_lineage_hash: 'sha256:fixture-authority-lineage-1936', scope: 'repository', expires_at: null } }),
      readAuthorityLineage: async () => ({ ok: true, value: { lineage_hash: 'sha256:fixture-authority-lineage-1936', status: 'ACTIVE' } }),
    },
    policyRegistry: {
      readPolicy: async () => ({ ok: true, value: makeGatewayBinding() }),
      readPolicyHash: async () => ({ ok: true, value: 'sha256:fixture-policy-hash-1936' }),
    },
    replayRegistry: {
      readNonceState: async () => ({ ok: true, value: 'UNUSED' }),
      readAeoState: async () => ({ ok: true, value: 'UNUSED' }),
    },
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => ({ ok: true, value: 'sha256:fixture-pre-write-hash-1936' }),
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
    diffInspector: {
      hashDiff: (diff) => ({ ok: true, value: diff.content }),
      inspectApplicability: async () => ({ ok: true, value: { applicable: true, post_write_hash: 'sha256:post-hash-1936' } }),
    },
    clock: {
      now: () => ({ ok: true, value: new Date().toISOString() }),
    },
  }
  return { ...base, ...overrides }
}

function makeGatewayWriter() {
  let callCount = 0
  const fn = (input) => {
    callCount++
    return { execution_id: `fs-write:sha256:fixture-1936-${callCount}`, executed_at: EMITTED_AT, bytes_written: input.content.length }
  }
  return { fn, get callCount() { return callCount } }
}

test('[filesystem] REPLAYED_OBJECT_NULL: a consumed replay nonce returns NULL before the adapter runs, writer never called', async () => {
  const writer = makeGatewayWriter()
  const replayedReplayRegistry = {
    async isNonceUnused() { return false },  // nonce already consumed
    async markNonceConsumed() { return { status: 'APPENDED', id: 'noop', hash: 'noop' } },
  }

  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeGatewayATAOInput(), binding: makeGatewayBinding() },
    { validator_context: makeGatewayValidatorContext(), writer: writer.fn, replay_registry: replayedReplayRegistry, emitted_at: EMITTED_AT },
  )

  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'replay')
  assert.equal(outcome.reason, 'REPLAY_NONCE_CONSUMED')
  assert.equal(outcome.receipt, null)
  assert.equal(writer.callCount, 0, 'a replayed nonce must never reach the adapter')
})

test('[filesystem] full gateway EXECUTED path: validated_object_hash === executed_object_hash and proof is bound', async () => {
  const writer = makeGatewayWriter()
  const freshReplayRegistry = {
    async isNonceUnused() { return true },
    async markNonceConsumed(nonce, did) { return { status: 'APPENDED', id: nonce, hash: did } },
  }

  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeGatewayATAOInput(), binding: makeGatewayBinding() },
    { validator_context: makeGatewayValidatorContext(), writer: writer.fn, replay_registry: freshReplayRegistry, emitted_at: EMITTED_AT },
  )

  assert.equal(outcome.result, 'EXECUTED')
  assert.notEqual(outcome.receipt, null)
  assert.equal(outcome.receipt.validated_object_hash, outcome.receipt.executed_object_hash)
  assert.match(outcome.receipt.receipt_id, /^sha256:[0-9a-f]{64}$/)
  assert.equal(writer.callCount, 1)
})

// ── Surface 5: runtime_execute_route (canonical /execute — static closure) ──

const indexSource = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')

test('[runtime_execute_route] canonical /execute route enforces hash-lineage and replay invariants', () => {
  // Execute requires a prior VALID validation row scoped to decision_id + validated_object_hash + invocation_nonce.
  assert.match(
    indexSource,
    /SELECT \* FROM validation_registry WHERE decision_id=\?1 AND validated_object_hash=\?2 AND invocation_nonce=\?3/,
    'execute must require a VALID validation_registry row scoped to decision_id + validated_object_hash + invocation_nonce',
  )

  // Mutated/unauthorized/uncompiled hashes fail closed with canonical hash_mismatch.
  assert.match(
    indexSource,
    /if \(!validation\) return rejectWithTelemetry\(env, \{ status:"NULL", result:"INVALID", reason:"hash_mismatch" \}/,
    'execute must reject unauthorized/missing validation with canonical hash_mismatch -> NULL',
  )

  // Execution persists the same validated_object_hash that passed validation.
  assert.match(
    indexSource,
    /INSERT INTO execution_registry[\s\S]*decision_id,validated_object_hash,invocation_nonce[\s\S]*\.bind\(execution_id, authority\.session_id, decision_id, validated_object_hash, invocation_nonce/,
    'execution_registry must persist the same validated_object_hash used for validation',
  )

  // Proof persists only when the execution row carries the same validated_object_hash.
  assert.match(
    indexSource,
    /INSERT OR IGNORE INTO proof_registry[\s\S]*validated_object_hash[\s\S]*EXISTS \(SELECT 1 FROM execution_registry WHERE execution_id=\?3 AND decision_id=\?4 AND validated_object_hash=\?5 AND invocation_nonce=\?25/,
    'proof must persist only when the execution row has the same validated_object_hash (proof hash bound to executed hash)',
  )
})

test('[runtime_execute_route] static closure: canonical fate tests for the /execute route exist', () => {
  for (const relativePath of registry.surfaces.find((s) => s.surface_id === 'runtime_execute_route').static_closure_sources) {
    const contents = readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8')
    assert.ok(contents.length > 0, `${relativePath} must exist and be non-empty`)
  }
})

// ── Closure: exhaustiveness over execution-capable surfaces ──────────────────

test('exhaustiveness: every executeWithAdapter-based adapter surface constant is declared in the registry', () => {
  const declaredAdapterSurfaces = new Set(
    registry.surfaces.map((s) => s.adapter_surface).filter((s) => s !== null),
  )
  assert.ok(declaredAdapterSurfaces.has(FILESYSTEM_ADAPTER_SURFACE), 'filesystem adapter surface must be declared')
  assert.ok(declaredAdapterSurfaces.has(CLOUDFLARE_ADAPTER_SURFACE), 'cloudflare_worker adapter surface must be declared')
  assert.ok(declaredAdapterSurfaces.has(D1_ADAPTER_SURFACE), 'd1 adapter surface must be declared')
  assert.ok(declaredAdapterSurfaces.has('github'), 'github surface must be declared')

  // Closure: the declared set must contain exactly these (plus the non-adapter route surface).
  assert.deepEqual(
    [...declaredAdapterSurfaces].sort(),
    [CLOUDFLARE_ADAPTER_SURFACE, D1_ADAPTER_SURFACE, FILESYSTEM_ADAPTER_SURFACE, 'github'].sort(),
    'no undeclared mutation-capable adapter surface may exist',
  )
})

test('exhaustiveness: every declared surface lists the full fate-matrix checks it claims', () => {
  const requiredChecks = new Set(registry.fate_matrix_checks)
  for (const surface of registry.surfaces) {
    for (const check of surface.checks) {
      assert.ok(requiredChecks.has(check), `${surface.surface_id} declares unknown check ${check}`)
    }
    // Every surface must at least cover the core hash/proof/no-op invariants.
    for (const mandatory of ['EXECUTED_HASH_EQUALS_VALIDATED_HASH', 'PROOF_HASH_BOUND_TO_EXECUTED_HASH', 'NOTHING_HAPPENS_WITHOUT_VALID', 'INVALID_OBJECT_NULL', 'UNAUTHORIZED_OBJECT_NULL', 'MUTATED_AFTER_VALIDATION_NULL']) {
      assert.ok(surface.checks.includes(mandatory), `${surface.surface_id} must declare ${mandatory}`)
    }
  }
})
