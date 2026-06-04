// Issue #1848: Bounded Agent Tool Gateway — filesystem write surface.
// Scope: ATAO capture, AEO compilation, execution boundary (VALID | NULL), proof emission.
// Required evidence:
//   - regression test: validated_object_hash == executed_object_hash
//   - negative test: mutation after validation → NULL (OBJECT_HASH_MISMATCH)
//   - negative test: direct execution without ATAO/AEO → blocked (null)

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

function makeExecutor() {
  let callCount = 0
  let lastInput = null
  return {
    fn: (input) => { callCount++; lastInput = input; return { bytes_written: input.content.length } },
    get callCount() { return callCount },
    get lastInput() { return lastInput },
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

test('TC-AEO-10 operation is create when pre_write_hash is empty', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding({ pre_write_hash: '' }))
  assert.notEqual(aeo, null)
  assert.equal(aeo.target.operation, 'create')
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

// ── Execution boundary ────────────────────────────────────────────────────────

test('TC-EXEC-01 null/undefined input returns null', () => {
  assert.equal(executeFilesystemWrite(null), null)
  assert.equal(executeFilesystemWrite(undefined), null)
})

test('TC-EXEC-02 null AEO returns null', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  assert.equal(
    executeFilesystemWrite({ aeo: null, validated_object_hash: hash, atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
})

test('TC-EXEC-03 null ATAO returns null', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  assert.equal(
    executeFilesystemWrite({ aeo, validated_object_hash: hash, atao: null, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
})

test('TC-EXEC-04 blank validated_object_hash returns null', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.equal(
    executeFilesystemWrite({ aeo, validated_object_hash: '', atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
  assert.equal(
    executeFilesystemWrite({ aeo, validated_object_hash: '   ', atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
})

test('TC-EXEC-05 missing executor returns null', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  assert.equal(
    executeFilesystemWrite({ aeo, validated_object_hash: hash, atao, executor: null, emitted_at: '2026-06-04T00:00:00.000Z' }),
    null,
  )
})

// ── TC-REG-01: Regression — validated_object_hash == executed_object_hash ─────

test('TC-REG-01 regression: validated_object_hash equals executed_object_hash on EXECUTED path', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  assert.notEqual(atao, null)

  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)

  // Compute hash exactly as Ω validator would return it
  const validated_object_hash = computeFilesystemAEOHash(aeo)

  const executor = makeExecutor()

  const proof = executeFilesystemWrite({
    aeo,
    validated_object_hash,
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'EXECUTED')

  // Core invariant: the object that was validated is exactly what was executed
  assert.equal(proof.validated_object_hash, proof.executed_object_hash,
    'validated_object_hash must equal executed_object_hash')

  // Executor was called exactly once
  assert.equal(executor.callCount, 1)
  assert.equal(executor.lastInput.path, 'src/example.ts')
})

// ── TC-NEG-01: Mutation after validation → NULL ────────────────────────────────

test('TC-NEG-01 mutation after validation returns NULL with OBJECT_HASH_MISMATCH', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)

  // Get the hash exactly as the Ω validator would produce it
  const validated_object_hash = computeFilesystemAEOHash(aeo)

  // Mutate the AEO after computing the validated hash (simulating a tamper attempt)
  const mutatedAeo = Object.freeze({
    ...aeo,
    target: Object.freeze({
      ...aeo.target,
      path: 'src/mutated-injection.ts',  // different path — mutation detected
    }),
  })

  const executor = makeExecutor()

  const proof = executeFilesystemWrite({
    aeo: mutatedAeo,                  // mutated object
    validated_object_hash,            // original validated hash
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.notEqual(proof, null)

  // Execution must be NULL
  assert.equal(proof.execution_result, 'NULL')
  assert.equal(proof.null_reason, 'OBJECT_HASH_MISMATCH')

  // Executor must NOT have been called — nothing executes when validation fails
  assert.equal(executor.callCount, 0, 'executor must not be called when hash check fails')

  // Hash comparison shows the mismatch — validated ≠ executed
  assert.notEqual(proof.validated_object_hash, proof.executed_object_hash,
    'hashes must differ to show mutation was detected')
})

// ── TC-NEG-02/03: Direct tool execution without ATAO/AEO → blocked ────────────

test('TC-NEG-02 direct execution without ATAO is blocked (returns null)', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)

  const executor = makeExecutor()

  // Attempt to bypass ATAO by passing null — simulates direct tool invocation
  const result = executeFilesystemWrite({
    aeo,
    validated_object_hash: hash,
    atao: null,           // no ATAO = no gateway origin = blocked at boundary
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.equal(result, null, 'execution without ATAO must be blocked at gateway boundary')
  assert.equal(executor.callCount, 0, 'executor must not be called when ATAO is absent')
})

test('TC-NEG-03 direct execution without AEO is blocked (returns null)', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const executor = makeExecutor()

  // Attempt to bypass AEO by passing null — no validated executable object exists
  const result = executeFilesystemWrite({
    aeo: null,                            // no AEO = no validated executable object
    validated_object_hash: 'sha256:some-hash',
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  assert.equal(result, null, 'execution without AEO must be blocked at gateway boundary')
  assert.equal(executor.callCount, 0, 'executor must not be called when AEO is absent')
})

test('TC-NEG-04 fabricated validated_object_hash (not from Ω validator) returns NULL proof', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  assert.notEqual(aeo, null)

  const executor = makeExecutor()

  // Attempt to supply a fabricated hash without going through the Ω validator
  const proof = executeFilesystemWrite({
    aeo,
    validated_object_hash: 'sha256:fabricated-hash-bypassing-omega-validator',
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T00:00:00.000Z',
  })

  // Must be blocked even though AEO and ATAO are structurally valid
  assert.notEqual(proof, null)
  assert.equal(proof.execution_result, 'NULL',
    'fabricated hash must be caught by exact-object comparison')
  assert.equal(proof.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.equal(executor.callCount, 0, 'executor must not be called with fabricated hash')
})

// ── Proof structure ───────────────────────────────────────────────────────────

test('TC-PROOF-01 EXECUTED proof is frozen', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validated_object_hash: hash, atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.ok(Object.isFrozen(proof))
})

test('TC-PROOF-02 proof contains required fields', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validated_object_hash: hash, atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  const keys = Object.keys(proof).sort()
  assert.deepEqual(keys, [
    'aeo_hash',
    'atao_id',
    'creates_authority',
    'emitted_at',
    'executed_object_hash',
    'execution_result',
    'null_reason',
    'proof_id',
    'target_action',
    'target_path',
    'target_surface',
    'validated_object_hash',
  ])
})

test('TC-PROOF-03 creates_authority is always false', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validated_object_hash: hash, atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.strictEqual(proof.creates_authority, false)
})

test('TC-PROOF-04 target_surface is always filesystem', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validated_object_hash: hash, atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.target_surface, 'filesystem')
})

test('TC-PROOF-05 EXECUTED proof links atao_id to ATAO', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validated_object_hash: hash, atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.atao_id, atao.atao_id)
})

test('TC-PROOF-06 EXECUTED proof aeo_hash links to AEO', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validated_object_hash: hash, atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.aeo_hash, hash)
})

test('TC-PROOF-07 proof_id is deterministic', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const executor = () => ({ bytes_written: 0 })
  const p1 = executeFilesystemWrite({ aeo, validated_object_hash: hash, atao, executor, emitted_at: '2026-06-04T00:00:00.000Z' })
  const p2 = executeFilesystemWrite({ aeo, validated_object_hash: hash, atao, executor, emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(p1, null)
  assert.notEqual(p2, null)
  assert.equal(p1.proof_id, p2.proof_id)
})

test('TC-PROOF-08 NULL proof has non-null null_reason; EXECUTED proof has null null_reason', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput())
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)

  const executedProof = executeFilesystemWrite({
    aeo, validated_object_hash: hash, atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z',
  })
  assert.equal(executedProof.null_reason, null)

  const mutatedAeo = Object.freeze({ ...aeo, target: Object.freeze({ ...aeo.target, path: 'src/other.ts' }) })
  const nullProof = executeFilesystemWrite({
    aeo: mutatedAeo, validated_object_hash: hash, atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z',
  })
  assert.notEqual(nullProof.null_reason, null)
  assert.equal(nullProof.null_reason, 'OBJECT_HASH_MISMATCH')
})

test('TC-PROOF-09 EXECUTED proof target_path matches AEO path', () => {
  const atao = captureFilesystemWriteATAO(makeATAOInput({ path: 'src/example.ts' }))
  const aeo = compileFilesystemWriteAEO(atao, makeBinding())
  const hash = computeFilesystemAEOHash(aeo)
  const proof = executeFilesystemWrite({ aeo, validated_object_hash: hash, atao, executor: () => ({ bytes_written: 0 }), emitted_at: '2026-06-04T00:00:00.000Z' })
  assert.notEqual(proof, null)
  assert.equal(proof.target_path, 'src/example.ts')
})

// ── End-to-end flow trace ─────────────────────────────────────────────────────

test('TC-E2E-01 VALID execution trace: ATAO → AEO → hash → execute → proof', () => {
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

  // Step 3: Ω validation (simulated — full validation tested in issue-1708 tests)
  const validated_object_hash = computeFilesystemAEOHash(aeo)
  assert.match(validated_object_hash, /^sha256:[0-9a-f]{64}$/)

  // Step 4: Execute exact validated object
  const executor = makeExecutor()
  const proof = executeFilesystemWrite({
    aeo,
    validated_object_hash,
    atao,
    executor: executor.fn,
    emitted_at: '2026-06-04T12:00:01.000Z',
  })

  // Step 5: Verify proof
  assert.notEqual(proof, null, 'proof must be emitted')
  assert.equal(proof.execution_result, 'EXECUTED')
  assert.equal(proof.validated_object_hash, proof.executed_object_hash)  // invariant
  assert.equal(proof.atao_id, atao.atao_id)
  assert.equal(proof.aeo_hash, validated_object_hash)
  assert.equal(proof.target_surface, 'filesystem')
  assert.equal(proof.target_path, 'src/auth.ts')
  assert.strictEqual(proof.creates_authority, false)
  assert.equal(executor.callCount, 1)
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
    validated_object_hash,  // original hash — will not match mutated AEO
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
})
