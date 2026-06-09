// Issue #1890: Enforce first runtime Agent Tool Gateway action — filesystem write.
//
// Scope: runFilesystemWriteGatewayAction — the composed, mandatory chain that wires
//   captureFilesystemWriteATAO → compileFilesystemWriteAEO → validateFilesystemAEO
//   → executeFilesystemWrite into a single path with no bypass branch.
//
// Required evidence (issue acceptance criteria):
//   - a filesystem-write request cannot execute unless an ATAO is captured
//   - the ATAO compiles into an exact AEO before validation
//   - the exact AEO is validated before the adapter is invoked
//   - the adapter is invoked only after VALID
//   - validated_object_hash == executed_object_hash on the EXECUTED path
//   - invalid / bypass / denied requests return NULL and never reach the executor
//   - successful execution emits proof containing the AEO hash, target path,
//     action, and result

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gatewaySource = readFileSync(
  new URL('../src/lib/filesystem-write-runtime-gateway.ts', import.meta.url),
  'utf8'
)

const { runFilesystemWriteGatewayAction } = await import('../src/lib/filesystem-write-runtime-gateway.ts')
const { computeFilesystemAEOHash } = await import('../src/lib/filesystem-aeo.ts')

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeATAOInput(overrides = {}) {
  return {
    agent_id: 'agent-001',
    session_id: 'session-001',
    intent: 'update example source file',
    path: 'src/example.ts',
    content: 'export const x = 1\n',
    repo: 'mindshift-demo',
    root: 'repository',
    timestamp: '2026-06-08T00:00:00.000Z',
    ...overrides,
  }
}

function makeBinding(overrides = {}) {
  return {
    decision_id: 'AUTH-fixture-001',
    authority_lineage_hash: 'sha256:fixture-authority-lineage-hash',
    policy_id: 'filesystem-write-policy-v1',
    policy_hash: 'sha256:fixture-policy-hash',
    pre_write_hash: 'sha256:fixture-pre-write-hash',
    proposed_diff_hash: '',
    replay_nonce: 'fixture-nonce-001',
    allowed_paths: ['src/**', 'tests/**', 'docs/**'],
    denied_paths: ['.github/workflows/**', 'wrangler.toml', '.env*', 'secrets/**'],
    allowed_operations: ['create', 'modify'],
    denied_operations: ['delete', 'chmod', 'rename', 'symlink'],
    max_files: 1,
    max_diff_lines: 300,
    ...overrides,
  }
}

function makeDecision(overrides = {}) {
  return {
    decision_id: 'AUTH-fixture-001',
    status: 'ACTIVE',
    authority_lineage_hash: 'sha256:fixture-authority-lineage-hash',
    scope: 'repository',
    expires_at: null,
    ...overrides,
  }
}

function makePolicy(overrides = {}) {
  return {
    policy_id: 'filesystem-write-policy-v1',
    policy_hash: 'sha256:fixture-policy-hash',
    allowed_paths: ['src/**', 'tests/**', 'docs/**'],
    denied_paths: ['.github/workflows/**', 'wrangler.toml', '.env*', 'secrets/**'],
    allowed_operations: ['create', 'modify'],
    denied_operations: ['delete', 'chmod', 'rename', 'symlink'],
    max_files: 1,
    max_diff_lines: 300,
    ...overrides,
  }
}

function makeValidatorContext(overrides = {}) {
  const base = {
    authorityRegistry: {
      readDecision: async () => ({ ok: true, value: makeDecision() }),
      readAuthorityLineage: async () => ({ ok: true, value: { lineage_hash: 'sha256:fixture-authority-lineage-hash', status: 'ACTIVE' } }),
    },
    policyRegistry: {
      readPolicy: async () => ({ ok: true, value: makePolicy() }),
      readPolicyHash: async () => ({ ok: true, value: 'sha256:fixture-policy-hash' }),
    },
    replayRegistry: {
      readNonceState: async () => ({ ok: true, value: 'UNUSED' }),
      readAeoState: async () => ({ ok: true, value: 'UNUSED' }),
    },
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => ({ ok: true, value: 'sha256:fixture-pre-write-hash' }),
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
    diffInspector: {
      hashDiff: (diff) => ({ ok: true, value: diff.content }),
      inspectApplicability: async () => ({ ok: true, value: { applicable: true, post_write_hash: 'sha256:post-hash' } }),
    },
    clock: {
      now: () => ({ ok: true, value: new Date().toISOString() }),
    },
  }
  return { ...base, ...overrides }
}

function makeExecutor() {
  let callCount = 0
  let lastInput = null
  return {
    fn: (input) => { callCount++; lastInput = input; return { bytes_written: input.content.length } },
    get callCount() { return callCount },
    get lastInput() { return lastInput },
  }
}

const EMITTED_AT = '2026-06-08T00:00:01.000Z'

// ── Source structure: the composition is the gate ────────────────────────────

test('source declares runFilesystemWriteGatewayAction as the mandatory chain', () => {
  assert.match(gatewaySource, /export (?:async )?function runFilesystemWriteGatewayAction/)
  assert.match(gatewaySource, /captureFilesystemWriteATAO/)
  assert.match(gatewaySource, /compileFilesystemWriteAEO/)
  assert.match(gatewaySource, /validateFilesystemAEO/)
  assert.match(gatewaySource, /executeFilesystemWrite/)
  assert.match(gatewaySource, /the ONLY function in this codebase that can\s*\n\/\/ produce an EXECUTED filesystem-write proof/)
})

// ── Fail-closed at every stage, executor never reached early ─────────────────

test('TC-RUN-01 null/undefined gateway input returns NULL at capture, executor never called', async () => {
  const executor = makeExecutor()
  const context = { validator_context: makeValidatorContext(), executor: executor.fn, emitted_at: EMITTED_AT }
  for (const bad of [null, undefined]) {
    const outcome = await runFilesystemWriteGatewayAction(bad, context)
    assert.equal(outcome.result, 'NULL')
    assert.equal(outcome.stage, 'capture')
  }
  assert.equal(executor.callCount, 0)
})

test('TC-RUN-02 a request that cannot form an ATAO is blocked at capture — no AEO, no validation, no execution', async () => {
  const executor = makeExecutor()
  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeATAOInput({ path: '' }), binding: makeBinding() },   // blank path → captureFilesystemWriteATAO returns null
    { validator_context: makeValidatorContext(), executor: executor.fn, emitted_at: EMITTED_AT },
  )
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'capture')
  assert.equal(outcome.reason, 'ATAO_CAPTURE_FAILED')
  assert.equal(outcome.proof, null)
  assert.equal(executor.callCount, 0, 'executor must not be called when ATAO capture fails')
})

test('TC-RUN-03 a captured ATAO with no usable authority binding is blocked at compile — never reaches the validator or the executor', async () => {
  const executor = makeExecutor()
  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeATAOInput(), binding: makeBinding({ allowed_paths: [] }) },  // compileFilesystemWriteAEO fails closed
    { validator_context: makeValidatorContext(), executor: executor.fn, emitted_at: EMITTED_AT },
  )
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'compile')
  assert.equal(outcome.reason, 'AEO_COMPILE_FAILED')
  assert.equal(outcome.proof, null)
  assert.equal(executor.callCount, 0, 'executor must not be called when AEO compilation fails')
})

test('TC-RUN-04 a compiled AEO that the Ω validator denies is blocked at validate — adapter is never invoked on a non-VALID object', async () => {
  const executor = makeExecutor()
  const deniedContext = makeValidatorContext({
    policyRegistry: {
      readPolicy: async () => ({ ok: true, value: makePolicy({ allowed_paths: ['docs/**'] }) }), // src/example.ts not allowed
      readPolicyHash: async () => ({ ok: true, value: 'sha256:fixture-policy-hash' }),
    },
  })
  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeATAOInput(), binding: makeBinding() },
    { validator_context: deniedContext, executor: executor.fn, emitted_at: EMITTED_AT },
  )
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'validate')
  assert.equal(outcome.reason, 'PATH_OR_OPERATION_NOT_ALLOWED')
  assert.notEqual(outcome.validator_denial, null)
  assert.equal(outcome.validator_denial.failure_class, 'PATH_NOT_ALLOWED')
  assert.equal(outcome.proof, null)
  assert.equal(executor.callCount, 0, 'executor must not be called when the Ω validator returns NULL')
})

test('TC-RUN-05 replay-consumed nonce is denied at validate — replay cannot reach the adapter', async () => {
  const executor = makeExecutor()
  const replayedContext = makeValidatorContext({
    replayRegistry: {
      readNonceState: async () => ({ ok: true, value: 'CONSUMED' }),
      readAeoState: async () => ({ ok: true, value: 'UNUSED' }),
    },
  })
  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeATAOInput(), binding: makeBinding() },
    { validator_context: replayedContext, executor: executor.fn, emitted_at: EMITTED_AT },
  )
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'validate')
  assert.equal(outcome.validator_denial.failure_class, 'REPLAY_NONCE_CONSUMED_OR_RESERVED')
  assert.equal(executor.callCount, 0, 'a replayed nonce must never reach the adapter')
})

// ── The mandatory chain succeeds end-to-end exactly once VALID is reached ────

test('TC-RUN-06 VALID end-to-end: ATAO captured → AEO compiled → validated → adapter invoked → proof emitted', async () => {
  const executor = makeExecutor()
  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeATAOInput(), binding: makeBinding() },
    { validator_context: makeValidatorContext(), executor: executor.fn, emitted_at: EMITTED_AT },
  )

  assert.equal(outcome.result, 'EXECUTED')
  assert.notEqual(outcome.proof, null)

  const proof = outcome.proof
  assert.equal(proof.execution_result, 'EXECUTED')
  assert.equal(proof.null_reason, null)

  // Core invariant carried through the composed chain
  assert.equal(proof.validated_object_hash, proof.executed_object_hash,
    'validated_object_hash must equal executed_object_hash through the runtime gateway')

  // Proof contains AEO hash, target path, action, and result (closure condition)
  assert.match(proof.aeo_hash, /^sha256:[0-9a-f]{64}$/)
  assert.equal(proof.target_path, 'src/example.ts')
  assert.equal(proof.target_action, 'modify')
  assert.equal(proof.target_surface, 'filesystem')
  assert.strictEqual(proof.creates_authority, false)

  // Adapter invoked exactly once, with exactly the validated content
  assert.equal(executor.callCount, 1)
  assert.equal(executor.lastInput.path, 'src/example.ts')
  assert.equal(executor.lastInput.content, 'export const x = 1\n')
})

test('TC-RUN-07 the validated_object_hash handed to the adapter boundary is the hash the Ω validator produced — not a fabricated or pre-computed one', async () => {
  const executor = makeExecutor()
  const atao_input = makeATAOInput({ path: 'src/auth.ts', content: 'export function log() {}\n' })
  const binding = makeBinding()

  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input, binding },
    { validator_context: makeValidatorContext(), executor: executor.fn, emitted_at: EMITTED_AT },
  )
  assert.equal(outcome.result, 'EXECUTED')

  // Independently recompile the same ATAO+binding to recompute the AEO hash exactly
  // as compileFilesystemWriteAEO + the Ω validator would — and confirm the proof's
  // aeo_hash matches it (i.e. the gateway did not substitute a different object).
  const { captureFilesystemWriteATAO, compileFilesystemWriteAEO } = await import('../src/lib/filesystem-write-gateway.ts')
  const independentAtao = captureFilesystemWriteATAO(atao_input)
  const independentAeo = compileFilesystemWriteAEO(independentAtao, binding)
  const independentHash = computeFilesystemAEOHash(independentAeo)

  assert.equal(outcome.proof.aeo_hash, independentHash)
  assert.equal(outcome.proof.validated_object_hash, independentHash)
  assert.equal(outcome.proof.executed_object_hash, independentHash)
})

// ── Direct / bypass paths cannot reach EXECUTED ───────────────────────────────

test('TC-BYPASS-01 supplying a binding/context without a capturable ATAO can never produce EXECUTED, regardless of how "valid" the rest looks', async () => {
  const executor = makeExecutor()
  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: null, binding: makeBinding() },  // no proposed action — nothing to govern
    { validator_context: makeValidatorContext(), executor: executor.fn, emitted_at: EMITTED_AT },
  )
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'capture')
  assert.equal(executor.callCount, 0)
})

test('TC-BYPASS-02 a denied-path attempt cannot be smuggled through by skipping straight to a "valid-looking" validator result', async () => {
  // Even if every other input is well-formed, a path inside a denied glob must be
  // rejected by the Ω validator — and the composed gateway must surface that NULL
  // without ever invoking the adapter.
  const executor = makeExecutor()
  // src/secrets/** sits inside the allowed src/** tree but is independently denied
  // by the bound policy — the policy lives in the registry the Ω validator reads,
  // not in the AEO the gateway compiles. The only way to reject it is to actually
  // evaluate that registry-bound policy, which only the validator does. A bypass
  // that merely trusted the compiled scope would let this through; the gateway must not.
  const overlappingPolicyContext = makeValidatorContext({
    policyRegistry: {
      readPolicy: async () => ({ ok: true, value: makePolicy({ allowed_paths: ['src/**'], denied_paths: ['src/secrets/**'] }) }),
      readPolicyHash: async () => ({ ok: true, value: 'sha256:fixture-policy-hash' }),
    },
  })
  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeATAOInput({ path: 'src/secrets/key.ts' }), binding: makeBinding() },
    { validator_context: overlappingPolicyContext, executor: executor.fn, emitted_at: EMITTED_AT },
  )
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'validate')
  assert.equal(outcome.validator_denial.failure_class, 'PATH_DENIED')
  assert.equal(executor.callCount, 0, 'a denied path must never reach the filesystem-write adapter')
})

test('TC-BYPASS-03 missing executor cannot be papered over by an otherwise-valid chain', async () => {
  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeATAOInput(), binding: makeBinding() },
    { validator_context: makeValidatorContext(), executor: null, emitted_at: EMITTED_AT },
  )
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'execute')
  assert.equal(outcome.reason, 'NULL_EXECUTOR')
})

test('TC-BYPASS-04 missing validator context fails closed before any chain stage runs', async () => {
  const executor = makeExecutor()
  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeATAOInput(), binding: makeBinding() },
    { validator_context: null, executor: executor.fn, emitted_at: EMITTED_AT },
  )
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'validate')
  assert.equal(outcome.reason, 'NULL_VALIDATOR_CONTEXT')
  assert.equal(executor.callCount, 0)
})
