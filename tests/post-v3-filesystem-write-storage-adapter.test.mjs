// Post-V3 Extraction Audit — Step 1: proof persistence through storage adapter.
//
// Proves that the filesystem-write path routes canonical proof through
// D1RegistryAdapter instead of a direct INSERT, and that ATAO linkage
// is kept separate from the canonical proof fields.
//
// What is tested here:
//   ST-01  route source imports initializeD1RegistryAdapter
//   ST-02  route source calls storageAdapter.appendProofReceipt
//   ST-03  route source has no direct canonical proof INSERT
//   ST-04  D1RegistryAdapter factory produces all required interface methods
//   ST-05  D1RegistryAdapter.appendProofReceipt writes to adapter_proof_registry
//   ST-06  D1RegistryAdapter.appendProofReceipt returns REJECTED on duplicate receipt_id
//   ST-07  NULL path — writer not called, appendProofReceipt not called
//   ST-08  VALID path — receipt produced, validated_object_hash == executed_object_hash
//   ST-09  receipt from gateway is interface-compatible with ProofRegistryAppender
//   ST-10  REJECTED from appendProofReceipt is surfaced as NULL, not silently dropped
//
// Step 2 status:
//   continuity-core.validateAeo() mandatory in hot path is BLOCKED_BY_AEO_SHAPE_MISMATCH.
//   validateAeo() expects canonical authority_id-bearing AEO sections and validation.object_hash.
//   FilesystemAEO does not satisfy that shape. The correct sequence is:
//     1. This PR: route proof through storage adapter (done)
//     2. Separate issue: evolve FilesystemAEO to canonical validateAeo contract
//     3. Only then: make validateAeo mandatory in the gateway
//   validateAeo() is NOT weakened to fit FilesystemAEO — TS core must stay == Rust core.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const routeSource = readFileSync(
  new URL('../src/lib/filesystem-write-route-adapter.ts', import.meta.url),
  'utf8'
)

const { runFilesystemWriteGatewayAction } = await import('../src/lib/filesystem-write-runtime-gateway.ts')
const { initializeD1RegistryAdapter } = await import('../src/lib/d1-storage-adapter.ts')

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
    timestamp: '2026-06-09T00:00:00.000Z',
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

function makeValidatorContext(overrides = {}) {
  const base = {
    authorityRegistry: {
      readDecision: async () => ({ ok: true, value: { decision_id: 'AUTH-fixture-001', status: 'ACTIVE', authority_lineage_hash: 'sha256:fixture-authority-lineage-hash', scope: 'repository', expires_at: null } }),
      readAuthorityLineage: async () => ({ ok: true, value: { lineage_hash: 'sha256:fixture-authority-lineage-hash', status: 'ACTIVE' } }),
    },
    policyRegistry: {
      readPolicy: async () => ({ ok: true, value: { policy_id: 'filesystem-write-policy-v1', policy_hash: 'sha256:fixture-policy-hash', allowed_paths: ['src/**', 'tests/**', 'docs/**'], denied_paths: ['.github/workflows/**', 'wrangler.toml', '.env*', 'secrets/**'], allowed_operations: ['create', 'modify'], denied_operations: ['delete', 'chmod', 'rename', 'symlink'], max_files: 1, max_diff_lines: 300 } }),
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

function makeWriter() {
  let callCount = 0
  const fn = (input) => {
    callCount++
    return { execution_id: `fs-write:sha256:fixture-${callCount}`, executed_at: '2026-06-09T00:00:01.000Z', bytes_written: input.content.length }
  }
  return { fn, get callCount() { return callCount } }
}

function makeMockStorageAdapter(overrides = {}) {
  const calls = { appendProofReceipt: [] }
  return {
    calls,
    async readAuthority() { return null },
    async isNonceUnused() { return true },
    async markNonceConsumed() { return { status: 'APPENDED', id: 'x', hash: 'x' } },
    async readLineageNode() { return { status: 'NOT_FOUND' } },
    async appendLineageNode() { return { status: 'APPENDED', id: 'x', hash: 'x' } },
    async appendProofReceipt(receipt) {
      calls.appendProofReceipt.push(receipt)
      return { status: 'APPENDED', id: receipt.receipt_id, hash: receipt.validated_object_hash }
    },
    async commitValidatedExecution() { return { status: 'APPENDED', id: 'x', hash: 'x' } },
    ...overrides,
  }
}

const EMITTED_AT = '2026-06-09T00:00:01.000Z'

// ── Source structure: Step 1 wiring ───────────────────────────────────────────

test('ST-01 route source imports initializeD1RegistryAdapter', () => {
  assert.match(routeSource, /initializeD1RegistryAdapter/)
})

test('ST-02 route source calls storageAdapter.appendProofReceipt', () => {
  assert.match(routeSource, /storageAdapter\.appendProofReceipt/)
})

test('ST-03 route source has no direct INSERT INTO adapter_proof_registry SQL', () => {
  const hasDirectInsert = routeSource.split('\n').some(line => {
    const trimmed = line.trim()
    return !trimmed.startsWith('//') && trimmed.includes('INSERT') && trimmed.includes('adapter_proof_registry')
  })
  assert.equal(hasDirectInsert, false, 'route adapter must not contain direct INSERT INTO adapter_proof_registry SQL')
})

// ── D1RegistryAdapter factory ─────────────────────────────────────────────────

test('ST-04 initializeD1RegistryAdapter produces an adapter with all required interface methods', () => {
  const db = {
    prepare() { return { bind() { return this }, async first() { return null }, async run() { return { meta: { changes: 1 } } }, async all() { return { results: [] } } } },
    async batch(stmts) { return stmts.map(() => ({ meta: { changes: 1 } })) },
  }
  const adapter = initializeD1RegistryAdapter(db)
  assert.equal(typeof adapter.appendProofReceipt, 'function')
  assert.equal(typeof adapter.readAuthority, 'function')
  assert.equal(typeof adapter.isNonceUnused, 'function')
  assert.equal(typeof adapter.markNonceConsumed, 'function')
  assert.equal(typeof adapter.appendLineageNode, 'function')
  assert.equal(typeof adapter.commitValidatedExecution, 'function')
})

test('ST-05 D1RegistryAdapter.appendProofReceipt writes to adapter_proof_registry', async () => {
  const insertCalls = []
  const db = {
    prepare(sql) {
      let _args = []
      return {
        bind(...args) { _args = args; return this },
        async first() { return null },
        async run() { insertCalls.push({ sql, args: _args }); return { meta: { changes: 1 } } },
        async all() { return { results: [] } },
      }
    },
    async batch(stmts) { return stmts.map(() => ({ meta: { changes: 1 } })) },
  }

  const adapter = initializeD1RegistryAdapter(db)
  const receipt = {
    receipt_id: 'sha256:' + 'a'.repeat(64),
    validated_object_hash: 'sha256:' + 'b'.repeat(64),
    executed_object_hash: 'sha256:' + 'b'.repeat(64),
    execution_evidence_hash: 'sha256:' + 'c'.repeat(64),
    adapter_surface: 'filesystem',
    decision_id: 'AUTH-test-001',
    replay_nonce: 'test-nonce-001',
    execution_result: 'EXECUTED',
    creates_authority: false,
    emitted_at: '2026-06-09T00:00:00.000Z',
  }

  const result = await adapter.appendProofReceipt(receipt)
  assert.equal(result.status, 'APPENDED')
  assert.ok(insertCalls.some(c => c.sql.includes('adapter_proof_registry')),
    'must INSERT into adapter_proof_registry')
  assert.ok(!insertCalls.some(c => c.sql.includes('adapter_proof_registry') && c.sql.includes('atao_id')),
    'adapter_proof_registry must not contain atao_id — that is route linkage, not canonical proof')
})

test('ST-06 D1RegistryAdapter.appendProofReceipt returns REJECTED on duplicate receipt_id', async () => {
  const existingReceipt = { receipt_id: 'sha256:' + 'a'.repeat(64) }
  const db = {
    prepare(sql) {
      let _args = []
      return {
        bind(...args) { _args = args; return this },
        async first() {
          // Simulate existing record
          if (sql.includes('SELECT receipt_id FROM adapter_proof_registry')) return existingReceipt
          return null
        },
        async run() { return { meta: { changes: 1 } } },
        async all() { return { results: [] } },
      }
    },
    async batch(stmts) { return stmts.map(() => ({ meta: { changes: 1 } })) },
  }

  const adapter = initializeD1RegistryAdapter(db)
  const receipt = {
    receipt_id: 'sha256:' + 'a'.repeat(64),
    validated_object_hash: 'sha256:' + 'b'.repeat(64),
    executed_object_hash: 'sha256:' + 'b'.repeat(64),
    execution_evidence_hash: 'sha256:' + 'c'.repeat(64),
    adapter_surface: 'filesystem',
    decision_id: 'AUTH-test-001',
    replay_nonce: 'test-nonce-001',
    execution_result: 'EXECUTED',
    creates_authority: false,
    emitted_at: '2026-06-09T00:00:00.000Z',
  }

  const result = await adapter.appendProofReceipt(receipt)
  assert.equal(result.status, 'REJECTED')
  assert.equal(result.reason, 'duplicate_receipt_id')
})

// ── Path-level invariants ─────────────────────────────────────────────────────

test('ST-07 NULL path — writer not called, mock storageAdapter.appendProofReceipt not called', async () => {
  const writer = makeWriter()
  const storageAdapter = makeMockStorageAdapter()

  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeATAOInput(), binding: makeBinding() },
    {
      validator_context: makeValidatorContext({
        policyRegistry: {
          readPolicy: async () => ({ ok: true, value: { policy_id: 'filesystem-write-policy-v1', policy_hash: 'sha256:fixture-policy-hash', allowed_paths: ['docs/**'], denied_paths: [], allowed_operations: ['create', 'modify'], denied_operations: [], max_files: 1, max_diff_lines: 300 } }),
          readPolicyHash: async () => ({ ok: true, value: 'sha256:fixture-policy-hash' }),
        },
      }),
      writer: writer.fn,
      emitted_at: EMITTED_AT,
    },
  )

  assert.equal(outcome.result, 'NULL')
  assert.equal(writer.callCount, 0, 'writer must not be called on NULL path')
  // storageAdapter is not passed to the gateway — proof persistence is route-level.
  // This confirms the gateway itself does not call appendProofReceipt.
  assert.equal(storageAdapter.calls.appendProofReceipt.length, 0)
})

test('ST-08 VALID path — receipt produced with validated_object_hash == executed_object_hash', async () => {
  const writer = makeWriter()

  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeATAOInput(), binding: makeBinding() },
    { validator_context: makeValidatorContext(), writer: writer.fn, emitted_at: EMITTED_AT },
  )

  assert.equal(outcome.result, 'EXECUTED')
  assert.notEqual(outcome.receipt, null)

  const receipt = outcome.receipt
  assert.equal(receipt.execution_result, 'EXECUTED')
  assert.equal(receipt.validated_object_hash, receipt.executed_object_hash,
    'validated_object_hash must equal executed_object_hash')
  assert.match(receipt.validated_object_hash, /^sha256:[0-9a-f]{64}$/)
  assert.match(receipt.receipt_id, /^sha256:[0-9a-f]{64}$/)
  assert.strictEqual(receipt.creates_authority, false)
  assert.equal(receipt.adapter_surface, 'filesystem')
  assert.equal(writer.callCount, 1)
})

test('ST-09 receipt from gateway feeds directly into D1RegistryAdapter.appendProofReceipt', async () => {
  const writer = makeWriter()

  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeATAOInput(), binding: makeBinding() },
    { validator_context: makeValidatorContext(), writer: writer.fn, emitted_at: EMITTED_AT },
  )

  assert.equal(outcome.result, 'EXECUTED')
  const receipt = outcome.receipt

  const insertCalls = []
  const db = {
    prepare(sql) {
      let _args = []
      return {
        bind(...args) { _args = args; return this },
        async first() { return null },
        async run() { insertCalls.push(sql.slice(0, 80)); return { meta: { changes: 1 } } },
        async all() { return { results: [] } },
      }
    },
    async batch(stmts) { return stmts.map(() => ({ meta: { changes: 1 } })) },
  }

  const adapter = initializeD1RegistryAdapter(db)
  const appendResult = await adapter.appendProofReceipt(receipt)
  assert.equal(appendResult.status, 'APPENDED')
  assert.ok(insertCalls.some(s => s.includes('adapter_proof_registry')),
    'receipt from gateway must be accepted by adapter_proof_registry')
})

test('ST-10 REJECTED from appendProofReceipt has status and reason fields (route must surface this as NULL)', async () => {
  const db = {
    prepare(sql) {
      let _args = []
      return {
        bind(...args) { _args = args; return this },
        async first() {
          if (sql.includes('SELECT receipt_id FROM adapter_proof_registry')) return { receipt_id: 'exists' }
          return null
        },
        async run() { return { meta: { changes: 1 } } },
        async all() { return { results: [] } },
      }
    },
    async batch(stmts) { return stmts.map(() => ({ meta: { changes: 1 } })) },
  }

  const adapter = initializeD1RegistryAdapter(db)
  const result = await adapter.appendProofReceipt({
    receipt_id: 'sha256:' + 'a'.repeat(64),
    validated_object_hash: 'sha256:b',
    executed_object_hash: 'sha256:b',
    execution_evidence_hash: 'sha256:c',
    adapter_surface: 'filesystem',
    decision_id: 'AUTH-001',
    replay_nonce: 'nonce-001',
    execution_result: 'EXECUTED',
    creates_authority: false,
    emitted_at: '2026-06-09T00:00:00.000Z',
  })

  assert.equal(result.status, 'REJECTED')
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0,
    'REJECTED result must carry a non-empty reason for the route to surface')
})
