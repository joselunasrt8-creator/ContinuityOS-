// Issue #1848: Bounded Agent Tool Gateway — filesystem write surface.
// Scope: ATAO capture, AEO compilation, execution boundary (VALID | NULL), proof emission.
//
// Fix-review hardening (5 fixes):
//   1. Content binding: executed content must match validated content_hash
//   2. Validation evidence required: caller must supply {result:"VALID",aeo_hash}
//   3. PRE_WRITE_HASH_ABSENT sentinel for create semantics
//   4. Expanded proof fields: all AEO-declared proof_fields present in proof
//   5. Executor failures produce NULL proof (not propagated throw)
//
// Required evidence:
//   - validated_object_hash == executed_object_hash (TC-REG-01)
//   - validated_content_hash == executed_content_hash (TC-REG-02)
//   - mutation after validation → NULL (OBJECT_HASH_MISMATCH)
//   - content substitution → NULL (CONTENT_HASH_MISMATCH)
//   - direct execution without ATAO/AEO → blocked (null)
//   - no validation evidence → blocked (null)
//   - executor throws → NULL proof (EXECUTOR_FAILURE)

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gatewaySource = readFileSync(
  new URL('../src/lib/filesystem-write-gateway.ts', import.meta.url),
  'utf8'
)

const {
  captureFilesystemWriteATAO,
  compileFilesystemWriteAEO,
  executeFilesystemWrite,
  PRE_WRITE_HASH_ABSENT,
} = await import('../src/lib/filesystem-write-gateway.ts')

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
    timestamp: '2026-06-04T00:00:00.000Z',
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
    proposed_diff_hash: 'sha256:fixture-diff-hash',
    replay_nonce: 'fixture-nonce-001',
    allowed_paths: ['src/**', 'tests/**', 'docs/**'],
    denied_paths: ['.github/workflows/**', 'wrangler.toml', '.env*', 'secrets/**', 'package-lock.json'],
    allowed_operations: ['create', 'modify'],
    denied_operations: ['delete', 'chmod', 'rename', 'symlink'],
    max_files: 1,
    max_diff_lines: 300,
    ...overrides,
  }
}

function makeValidationEvidence(aeoHash) {
  return { result: 'VALID', aeo_hash: aeoHash }
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

function makeThrowingExecutor() {
  return {
    fn: () => { throw new Error('simulated executor failure') },
  }
}

// ── Source structure ──────────────────────────────────────────────────────────

test('source exports captureFilesystemWriteATAO with non-operative contract', () => {
  assert.match(gatewaySource, /export function captureFilesystemWriteATAO/)
  assert.match(gatewaySource, /creates_authority: false/)
  assert.match(gatewaySource, /creates_execution_eligibility: false/)
  assert.match(gatewaySource, /Does not create authority/)
})

test('source exports compileFilesystemWriteAEO with compilation non-goals', () => {
  assert.match(gatewaySource, /export function compileFilesystemWriteAEO/)
  assert.match(gatewaySource, /Does not validate, execute, or produce proof/)
})

test('source exports executeFilesystemWrite with exact-object invariant', () => {
  assert.match(gatewaySource, /export function executeFilesystemWrite/)
  assert.match(gatewaySource, /validated_object_hash == executed_object_hash/)
  assert.match(gatewaySource, /OBJECT_HASH_MISMATCH/)
  assert.match(gatewaySource, /executor never called/)
})

test('source declares core invariants', () => {
  assert.match(gatewaySource, /If no valid object exists → nothing happens/)
  assert.match(gatewaySource, /validated_object_hash == executed_object_hash/)
})

// ── ATAO capture ──────────────────────────────────────────────────────────────

test('TC-ATAO-01 null/undefined input returns null', () => {
  assert.equal(captureFilesystemWriteATAO(null), null)
  assert.equal(captureFilesystemWriteATAO(undefined), null)
})

test('TC-ATAO-02 blank required fields return null', () => {
  assert.equal(captureFilesystemWriteATAO(makeATAOInput({ agent_id: '' })), null)
  assert.equal(captureFilesystemWriteATAO(makeATAOInput({ session_id: '   ' })), null)
  assert.equal(captureFilesystemWriteATAO(makeATAOInput({ intent: '' })), null)
  assert.equal(captureFilesystemWriteATAO(makeATAOInput({ path: '' })), null)
  assert.equal(captureFilesystemWriteATAO(makeATAOInput({ repo: '' })), null)
  assert.equal(captureFilesystemWriteATAO(makeATAOInput({ root: '' })), null)
  assert.equal(captureFilesystemWriteATAO(makeATAOInput({ timestamp: '' })), null)
})

test('TC-ATAO-03 non-string content field returns null', () => {
  assert.equal(captureFilesystemWriteATAO(makeATAOInput({ content: null })), null)
  assert.equal(captureFilesystemWriteATAO(makeATAOInput({ content: 42 })), null)
})

test('TC-ATAO-04 valid input produces frozen ATAO', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  assert.notEqual(atao, null)
  assert.ok(Object.isFrozen(atao))
})

test('TC-ATAO-05 ATAO fields match input', () => {
  const input = makeATAOInput()
  const atao = captureFilesystemWriteATAO(input)
  assert.notEqual(atao, null)
  assert.equal(atao.agent_id, input.agent_id)
  assert.equal(atao.session_id, input.session_id)
  assert.equal(atao.intent, input.intent)
  assert.equal(atao.proposed_action.parameters.path, input.path)
  assert.equal(atao.proposed_action.parameters.content, input.content)
  assert.equal(atao.scope.repo, input.repo)
  assert.equal(atao.scope.root, input.root)
  assert.equal(atao.timestamp, input.timestamp)
})

test('TC-ATAO-06 ATAO surface is always filesystem / write_file / P2', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  assert.notEqual(atao, null)
  assert.equal(atao.proposed_action.system, 'filesystem')
  assert.equal(atao.proposed_action.action, 'write_file')
  assert.equal(atao.risk_class, 'P2')
})

test('TC-ATAO-07 ATAO is non-operative', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  assert.notEqual(atao, null)
  assert.strictEqual(atao.creates_authority, false)
  assert.strictEqual(atao.creates_execution_eligibility, false)
})

test('TC-ATAO-08 atao_id is deterministic for equal inputs', () => {
  const a = captureFilesystemWriteATAO(makeATAOInput())
  const b = captureFilesystemWriteATAO(makeATAOInput())
  assert.notEqual(a, null)
  assert.notEqual(b, null)
  assert.equal(a.atao_id, b.atao_id)
})

test('TC-ATAO-09 atao_id changes when path changes', () => {
  const a = captureFilesystemWriteATAO(makeATAOInput({ path: 'src/file-a.ts' }))
  const b = captureFilesystemWriteATAO(makeATAOInput({ path: 'src/file-b.ts' }))
  assert.notEqual(a, null)
  assert.notEqual(b, null)
  assert.notEqual(a.atao_id, b.atao_id)
})

test('TC-ATAO-10 atao_id is sha256-prefixed', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  assert.notEqual(atao, null)
  assert.match(atao.atao_id, /^sha256:[0-9a-f]{64}$/)
})

// ── AEO compilation ───────────────────────────────────────────────────────────

test('TC-AEO-01 null ATAO returns null', () => {
  assert.equal(compileFilesystemWriteAEO(null, makeBinding()), null)
  assert.equal(compileFilesystemWriteAEO(undefined, makeBinding()), null)
})

test('TC-AEO-02 null binding returns null', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  assert.equal(compileFilesystemWriteAEO(atao, null), null)
  assert.equal(compileFilesystemWriteAEO(atao, undefined), null)
})

test('TC-AEO-03 blank required binding fields return null', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  assert.equal(compileFilesystemWriteAEO(atao, makeBinding({ decision_id: '' })), null)
  assert.equal(compileFilesystemWriteAEO(atao, makeBinding({ authority_lineage_hash: '' })), null)
  assert.equal(compileFilesystemWriteAEO(atao, makeBinding({ policy_id: '' })), null)
  assert.equal(compileFilesystemWriteAEO(atao, makeBinding({ policy_hash: '' })), null)
  assert.equal(compileFilesystemWriteAEO(atao, makeBinding({ replay_nonce: '' })), null)
})

test('TC-AEO-04 empty allowed_paths or allowed_operations returns null', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  assert.equal(compileFilesystemWriteAEO(atao, makeBinding({ allowed_paths: [] })), null)
  assert.equal(compileFilesystemWriteAEO(atao, makeBinding({ allowed_operations: [] })), null)
})

test('TC-AEO-05 valid ATAO + binding produces frozen AEO', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  assert.ok(Object.isFrozen(aeo))
})

test('TC-AEO-06 compiled AEO has exactly five top-level fields', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  const keys = Object.keys(aeo).sort()
  assert.deepEqual(keys, ['finality', 'intent', 'scope', 'target', 'validation'])
})

test('TC-AEO-07 compiled target.system is filesystem', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  assert.equal(aeo.target.system, 'filesystem')
})

test('TC-AEO-08 compiled target.path matches ATAO path', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput({ path: 'src/example.ts' }))
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  assert.equal(aeo.target.path, 'src/example.ts')
})

test('TC-AEO-09 operation is modify when pre_write_hash is present', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding({ pre_write_hash: 'sha256:existing-hash' }))
  assert.notEqual(aeo, null)
  assert.equal(aeo.target.operation, 'modify')
})

test('TC-AEO-10 operation is create when pre_write_hash is empty — uses PRE_WRITE_HASH_ABSENT sentinel', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding({ pre_write_hash: '' }))
  assert.notEqual(aeo, null)
  assert.equal(aeo.target.operation, 'create')
  // Fix 3: blank pre_write_hash → PRE_WRITE_HASH_ABSENT sentinel (not blank)
  assert.equal(aeo.validation.pre_write_hash, PRE_WRITE_HASH_ABSENT)
  assert.notEqual(aeo.validation.pre_write_hash, '')
})

test('TC-AEO-11 compiled AEO finality requires proof and registry', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  assert.strictEqual(aeo.finality.proof_required, true)
  assert.strictEqual(aeo.finality.registry_required, true)
  assert.equal(aeo.finality.replay_state_after_success, 'CONSUMED')
})

test('TC-AEO-12 AEO hash is deterministic for equal inputs', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const a = compileFilesystemWriteAEO(atao, makeBinding())
  const b = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(a, null)
  assert.notEqual(b, null)
  assert.equal(computeFilesystemAEOHash(a), computeFilesystemAEOHash(b))
})

test('TC-AEO-13 AEO hash changes when path changes', () => {
  const atao1 = captureFilesystemWriteATAO(makeATAOInput({ path: 'src/file-a.ts' }))
  const atao2 = captureFilesystemWriteATAO(makeATAOInput({ path: 'src/file-b.ts' }))
  const aeo1 = compileFilesystemWriteAEO(atao1, makeBinding())
  const aeo2 = compileFilesystemWriteAEO(atao2, makeBinding())
  assert.notEqual(aeo1, null)
  assert.notEqual(aeo2, null)
  assert.notEqual(computeFilesystemAEOHash(aeo1), computeFilesystemAEOHash(aeo2))
})

// Fix 1: content_hash bound in validation section
test('TC-AEO-14 compiled AEO validation.content_hash is sha256 of ATAO content', () => {
  const content = 'export const x = 1\n'
  const atao = captureFilesystemWriteATAO(makeATAOInput({ content }))
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  assert.match(aeo.validation.content_hash, /^sha256:[0-9a-f]{64}$/)
  // Hash changes with content
  const atao2 = captureFilesystemWriteATAO(makeATAOInput({ content: 'different content' }))
  const aeo2 = compileFilesystemWriteAEO(atao2, makeBinding())
  assert.notEqual(aeo.validation.content_hash, aeo2.validation.content_hash)
})

test('TC-AEO-15 AEO finality.proof_fields includes all required fields', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)
  const declared = [...aeo.finality.proof_fields]
  const required = ['decision_id', 'aeo_hash', 'atao_id', 'target_path', 'operation',
    'pre_write_hash', 'post_write_hash', 'diff_hash', 'execution_id', 'timestamp']
  for (const field of required) {
    assert.ok(declared.includes(field), `proof_fields must include ${field}`)
  }
})

// ── Execution boundary ────────────────────────────────────────────────────────

test('TC-EXEC-01 null/undefined input returns null', () => {
  assert.equal(executeFilesystemWrite(null), null)
  assert.equal(executeFilesystemWrite(undefined), null)
})

test('TC-EXEC-02 null AEO returns null', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const evidence = makeValidationEvidence(computeFilesystemAEOHash(aeo))
  assert.equal(
    executeFilesystemWrite({ aeo: null, validation_evidence: evidence, atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
})

test('TC-EXEC-03 null ATAO returns null', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const evidence = makeValidationEvidence(computeFilesystemAEOHash(aeo))
  assert.equal(
    executeFilesystemWrite({ aeo, validation_evidence: evidence, atao: null, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
})

// Fix 2: validation_evidence required — no hash-string bypass
test('TC-EXEC-04 null validation_evidence returns null (blocks hash-string bypass)', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const executor = makeExecutor()
  assert.equal(
    executeFilesystemWrite({ aeo, validation_evidence: null, atao, executor: executor.fn, emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
    'null validation_evidence must be blocked',
  )
  assert.equal(
    executeFilesystemWrite({ aeo, validation_evidence: undefined, atao, executor: executor.fn, emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
    'undefined validation_evidence must be blocked',
  )
  assert.equal(executor.callCount, 0, 'executor must not be called')
})

test('TC-EXEC-05 missing executor returns null', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const evidence = makeValidationEvidence(computeFilesystemAEOHash(aeo))
  assert.equal(
    executeFilesystemWrite({ aeo, validation_evidence: evidence, atao, executor: null, emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
})

// ── TC-REG-01: Regression — validated_object_hash == executed_object_hash ─────

test('TC-REG-01 regression: validated_object_hash equals executed_object_hash on EXECUTED path', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  assert.notEqual(atao, null)

  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)

  const validated_object_hash = computeFilesystemAEOHash(aeo)
  const executor = makeExecutor()

  const proof = executeFilesystemWrite({
    aeo,
    validation_evidence: makeValidationEvidence(validated_object_hash),
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'EXECUTED')

  // Core invariant: the object that was validated is exactly what was executed
  assert.equal(proof.validated_object_hash, proof.executed_object_hash,
    'validated_object_hash must equal executed_object_hash')

  assert.equal(executor.callCount, 1)
  assert.equal(executor.lastInput.path, 'src/example.ts')
})

// ── TC-REG-02: Regression — validated_content_hash == executed_content_hash ───

test('TC-REG-02 regression: validated_content_hash equals executed_content_hash on EXECUTED path', () => {
  const content = 'export const hello = "world"\n'
  const atao = captureFilesystemWriteATAO(makeATAOInput({ content }))
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)

  const validated_object_hash = computeFilesystemAEOHash(aeo)
  const executor = makeExecutor()

  const proof = executeFilesystemWrite({
    aeo,
    validation_evidence: makeValidationEvidence(validated_object_hash),
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'EXECUTED')

  // validated_content_hash = what was bound in the AEO at compile time
  const validatedContentHash = aeo.validation.content_hash
  // executed_content_hash = post_write_hash (what was actually written)
  const executedContentHash = proof.post_write_hash

  assert.equal(validatedContentHash, executedContentHash,
    'validated_content_hash must equal executed_content_hash')
  assert.match(executedContentHash, /^sha256:[0-9a-f]{64}$/)
})

// ── TC-NEG-01: Mutation after validation → NULL ────────────────────────────────

test('TC-NEG-01 mutation after validation returns NULL with OBJECT_HASH_MISMATCH', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)

  const validated_object_hash = computeFilesystemAEOHash(aeo)

  // Mutate the AEO after computing the validated hash
  const mutatedAeo = Object.freeze({
    ...aeo,
    target: Object.freeze({
      ...aeo.target,
      path: 'src/mutated-injection.ts',
    }),
  })

  const executor = makeExecutor()

  const proof = executeFilesystemWrite({
    aeo: mutatedAeo,
    validation_evidence: makeValidationEvidence(validated_object_hash),
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'NULL')
  assert.equal(proof.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.equal(executor.callCount, 0, 'executor must not be called when hash check fails')
  assert.notEqual(proof.validated_object_hash, proof.executed_object_hash,
    'hashes must differ to show mutation was detected')
  assert.strictEqual(proof.mutation_performed, false)
})

// ── TC-NEG-02/03: Direct tool execution without ATAO/AEO → blocked ────────────

test('TC-NEG-02 direct execution without ATAO is blocked (returns null)', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const evidence = makeValidationEvidence(computeFilesystemAEOHash(aeo))
  const executor = makeExecutor()

  const result = executeFilesystemWrite({
    aeo,
    validation_evidence: evidence,
    atao: null,
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.equal(result, null, 'execution without ATAO must be blocked at gateway boundary')
  assert.equal(executor.callCount, 0, 'executor must not be called when ATAO is absent')
})

test('TC-NEG-03 direct execution without AEO is blocked (returns null)', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const executor = makeExecutor()

  const result = executeFilesystemWrite({
    aeo: null,
    validation_evidence: { result: 'VALID', aeo_hash: 'sha256:some-hash' },
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.equal(result, null, 'execution without AEO must be blocked at gateway boundary')
  assert.equal(executor.callCount, 0, 'executor must not be called when AEO is absent')
})

test('TC-NEG-04 fabricated validation_evidence aeo_hash returns NULL proof', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)

  const executor = makeExecutor()

  // Fabricated hash that doesn't match the actual AEO hash
  const proof = executeFilesystemWrite({
    aeo,
    validation_evidence: { result: 'VALID', aeo_hash: 'sha256:fabricated-hash-bypassing-omega-validator' },
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'NULL',
    'fabricated hash must be caught by exact-object comparison')
  assert.equal(proof.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.equal(executor.callCount, 0, 'executor must not be called with fabricated hash')
})

// ── Fix 2: No validation evidence → blocked ────────────────────────────────────

test('TC-FIX-02 caller supplies no validation_evidence (hash-string bypass attempt) returns null', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const executor = makeExecutor()

  // Attempt to supply VALID AEO and ATAO but no validation result — blocked
  const result = executeFilesystemWrite({
    aeo,
    validation_evidence: null,
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.equal(result, null, 'no validation evidence must block execution entirely')
  assert.equal(executor.callCount, 0, 'executor must not be called without validation evidence')
})

// ── Fix 1: Content binding — mutated ATAO content ─────────────────────────────

test('TC-FIX-01 content substitution after validation returns NULL with CONTENT_HASH_MISMATCH', () => {
  // Validate an AEO compiled with 'original content'
  const originalAtao = captureFilesystemWriteATAO(makeATAOInput({ content: 'original content' }))
  const aeo = compileFilesystemWriteAEO(originalAtao, makeBinding())
  assert.notEqual(aeo, null)

  const validated_object_hash = computeFilesystemAEOHash(aeo)

  // Attacker substitutes a different ATAO with different content at execution time
  const tamperedAtao = captureFilesystemWriteATAO(makeATAOInput({ content: 'tampered content' }))
  assert.notEqual(tamperedAtao, null)

  const executor = makeExecutor()

  const proof = executeFilesystemWrite({
    aeo,
    validation_evidence: makeValidationEvidence(validated_object_hash),
    atao: tamperedAtao,  // different content from what was validated
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'NULL')
  assert.equal(proof.null_reason, 'CONTENT_HASH_MISMATCH',
    'content substitution must be detected and blocked')
  assert.equal(executor.callCount, 0, 'executor must not be called when content hash mismatches')
  assert.strictEqual(proof.mutation_performed, false)
})

// ── Fix 5: Executor failure → NULL proof ──────────────────────────────────────

test('TC-FIX-05 executor throw produces NULL proof with EXECUTOR_FAILURE', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)

  const validated_object_hash = computeFilesystemAEOHash(aeo)

  const proof = executeFilesystemWrite({
    aeo,
    validation_evidence: makeValidationEvidence(validated_object_hash),
    atao,
    executor: makeThrowingExecutor().fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.notEqual(proof, null, 'NULL proof must be emitted on executor failure (not thrown)')
  assert.equal(proof.execution_result, 'NULL')
  assert.equal(proof.null_reason, 'EXECUTOR_FAILURE')
  assert.strictEqual(proof.mutation_performed, false)
  assert.equal(proof.post_write_hash, null, 'post_write_hash must be null when write failed')
})

// ── Fix 3: Create flow with PRE_WRITE_HASH_ABSENT ─────────────────────────────

test('TC-FIX-03-CREATE VALID create flow with absent pre-state sentinel', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput({
    path: 'tmp/agent-output.txt',
    content: 'example',
  }))
  const aeo = compileFilesystemWriteAEO(atao, makeBinding({ pre_write_hash: '' }))
  assert.notEqual(aeo, null)
  assert.equal(aeo.target.operation, 'create')
  assert.equal(aeo.validation.pre_write_hash, PRE_WRITE_HASH_ABSENT)

  const validated_object_hash = computeFilesystemAEOHash(aeo)
  const executor = makeExecutor()

  const proof = executeFilesystemWrite({
    aeo,
    validation_evidence: makeValidationEvidence(validated_object_hash),
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'EXECUTED')
  assert.equal(proof.operation, 'create')
  assert.equal(proof.pre_write_hash, PRE_WRITE_HASH_ABSENT)
  assert.notEqual(proof.post_write_hash, null)
  assert.match(proof.post_write_hash, /^sha256:[0-9a-f]{64}$/)
  assert.equal(executor.callCount, 1)
  assert.equal(executor.lastInput.path, 'tmp/agent-output.txt')
  assert.equal(executor.lastInput.content, 'example')
})

// ── Fix 4: Proof contains all AEO-declared proof_fields ───────────────────────

test('TC-PROOF-01 EXECUTED proof is frozen', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.ok(Object.isFrozen(proof))
})

test('TC-PROOF-02 proof contains all required fields including AEO-declared proof_fields', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  const keys = Object.keys(proof).sort()
  assert.deepEqual(keys, [
    'aeo_hash',
    'atao_id',
    'creates_authority',
    'decision_id',
    'diff_hash',
    'executed_object_hash',
    'execution_id',
    'execution_result',
    'mutation_performed',
    'null_reason',
    'operation',
    'post_write_hash',
    'pre_write_hash',
    'proof_id',
    'target_path',
    'target_surface',
    'timestamp',
    'validated_object_hash',
  ])
  // All AEO-declared proof_fields are present
  for (const field of aeo.finality.proof_fields) {
    assert.ok(Object.prototype.hasOwnProperty.call(proof, field), `proof must include AEO-declared field: ${field}`)
  }
})

test('TC-PROOF-03 creates_authority is always false', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.strictEqual(proof.creates_authority, false)
})

test('TC-PROOF-04 target_surface is always filesystem', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.target_surface, 'filesystem')
})

test('TC-PROOF-05 EXECUTED proof links atao_id to ATAO', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.atao_id, atao.atao_id)
})

test('TC-PROOF-06 EXECUTED proof aeo_hash links to AEO', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.aeo_hash, hash)
})

test('TC-PROOF-07 proof_id is deterministic', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const executor = () => ({ bytes_written: 0 })
  const p1 = executeFilesystemWrite({ aeo, validation_evidence: makeValidationEvidence(hash), atao, executor, emitted_at: '2026-06-04T00:00:00.000Z' })
  const p2 = executeFilesystemWrite({ aeo, validation_evidence: makeValidationEvidence(hash), atao, executor, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(p1, null)
  assert.notEqual(p2, null)
  assert.equal(p1.proof_id, p2.proof_id)
})

test('TC-PROOF-08 NULL proof has non-null null_reason; EXECUTED proof has null null_reason', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)

  const executedProof = executeFilesystemWrite({
    aeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z',
  })
  assert.equal(executedProof.null_reason, null)
  assert.strictEqual(executedProof.mutation_performed, true)

  const mutatedAeo = Object.freeze({ ...aeo, target: Object.freeze({ ...aeo.target, path: 'src/other.ts' }) })
  const nullProof = executeFilesystemWrite({
    aeo: mutatedAeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z',
  })
  assert.notEqual(nullProof.null_reason, null)
  assert.equal(nullProof.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.strictEqual(nullProof.mutation_performed, false)
})

test('TC-PROOF-09 EXECUTED proof target_path matches AEO path', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput({ path: 'src/example.ts' }))
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.target_path, 'src/example.ts')
})

test('TC-PROOF-10 EXECUTED proof decision_id matches AEO validation.decision_id', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding({ decision_id: 'AUTH-proof-test-001' }))
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.decision_id, 'AUTH-proof-test-001')
})

test('TC-PROOF-11 EXECUTED proof operation matches AEO target.operation', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding({ pre_write_hash: 'sha256:existing' }))
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.operation, 'modify')
})

test('TC-PROOF-12 EXECUTED proof post_write_hash is non-null sha256; NULL proof has null post_write_hash', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)

  const executedProof = executeFilesystemWrite({ aeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(executedProof, null)
  assert.match(executedProof.post_write_hash, /^sha256:[0-9a-f]{64}$/)

  const mutatedAeo = Object.freeze({ ...aeo, target: Object.freeze({ ...aeo.target, path: 'src/other.ts' }) })
  const nullProof = executeFilesystemWrite({ aeo: mutatedAeo, validation_evidence: makeValidationEvidence(hash), atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(nullProof, null)
  assert.equal(nullProof.post_write_hash, null)
})

// ── End-to-end flow trace ─────────────────────────────────────────────────────

test('TC-E2E-01 VALID execution trace: ATAO → AEO → Ω evidence → execute → proof', () => {
  // Step 1: Agent proposes action — ATAO capture
  const atao = captureFilesystemWriteATAO({
    agent_id: 'agent-e2e',
    session_id: 'session-e2e',
    intent: 'add logging to auth module',
    path: 'src/auth.ts',
    content: 'export function log() { console.log("auth") }\n',
    repo: 'mindshift-demo',
    root: 'repository',
    timestamp: '2026-06-04T12:00:00.000Z',
  })
  assert.notEqual(atao, null, 'ATAO capture must succeed')
  assert.strictEqual(atao.creates_authority, false)
  assert.strictEqual(atao.creates_execution_eligibility, false)

  // Step 2: Authority binding — compile ATAO → AEO
  const aeo = compileFilesystemWriteAEO(atao, {
    decision_id: 'AUTH-e2e-001',
    authority_lineage_hash: 'sha256:e2e-authority-lineage',
    policy_id: 'filesystem-write-policy-v1',
    policy_hash: 'sha256:e2e-policy-hash',
    pre_write_hash: 'sha256:e2e-pre-write-hash',
    proposed_diff_hash: 'sha256:e2e-diff-hash',
    replay_nonce: 'e2e-nonce-001',
    allowed_paths: ['src/**', 'tests/**', 'docs/**'],
    denied_paths: ['.github/workflows/**', 'wrangler.toml', '.env*'],
    allowed_operations: ['create', 'modify'],
    denied_operations: ['delete', 'chmod'],
    max_files: 1,
    max_diff_lines: 300,
  })
  assert.notEqual(aeo, null, 'AEO compilation must succeed')
  assert.equal(aeo.target.path, 'src/auth.ts')
  assert.match(aeo.validation.content_hash, /^sha256:[0-9a-f]{64}$/, 'AEO must bind content_hash')

  // Step 3: Ω validation (simulated — full validation tested in issue-1708 tests)
  const validated_object_hash = computeFilesystemAEOHash(aeo)
  assert.match(validated_object_hash, /^sha256:[0-9a-f]{64}$/)
  const validation_evidence = makeValidationEvidence(validated_object_hash)

  // Step 4: Execute exact validated object
  const executor = makeExecutor()
  const proof = executeFilesystemWrite({
    aeo,
    validation_evidence,
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T12:00:01.000Z',
  })

  // Step 5: Verify proof
  assert.notEqual(proof, null, 'proof must be emitted')
  assert.equal(proof.execution_result, 'EXECUTED')
  assert.equal(proof.validated_object_hash, proof.executed_object_hash)  // core invariant
  assert.equal(proof.atao_id, atao.atao_id)
  assert.equal(proof.aeo_hash, validated_object_hash)
  assert.equal(proof.target_surface, 'filesystem')
  assert.equal(proof.target_path, 'src/auth.ts')
  assert.strictEqual(proof.creates_authority, false)
  assert.strictEqual(proof.mutation_performed, true)
  assert.equal(executor.callCount, 1)
  // content invariant
  assert.equal(aeo.validation.content_hash, proof.post_write_hash)
})

test('TC-E2E-02 NULL blocked trace: mutation intercepted before execution', () => {
  // Build valid pipeline
  const atao = captureFilesystemWriteATAO(makeATAOInput({ path: 'src/target.ts' }))
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const validated_object_hash = computeFilesystemAEOHash(aeo)

  // Adversary mutates AEO after validation
  const adversarialAeo = Object.freeze({
    ...aeo,
    target: Object.freeze({ ...aeo.target, path: 'src/injected.ts' }),
  })

  const executor = makeExecutor()
  const proof = executeFilesystemWrite({
    aeo: adversarialAeo,
    validation_evidence: makeValidationEvidence(validated_object_hash),
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T12:00:01.000Z',
  })

  assert.notEqual(proof, null, 'NULL proof must be emitted (not null)')
  assert.equal(proof.execution_result, 'NULL')
  assert.equal(proof.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.equal(executor.callCount, 0, 'adversarial write must be blocked')
  assert.notEqual(proof.validated_object_hash, proof.executed_object_hash)
  assert.strictEqual(proof.creates_authority, false)
  assert.strictEqual(proof.mutation_performed, false)
})
