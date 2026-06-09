// Lineage Registry Boundary tests (issue #1934).
//
// Verifies the LineageRegistryPort boundary on the filesystem-write gateway path:
//
//   CanonicalAEO
//   → validateAeo
//   → replay eligibility
//   → Ω validation
//   → executeWithAdapter
//   → markNonceConsumed
//   → appendLineageNode  (EXECUTED path only)
//
// Acceptance criteria:
//   - appendLineageNode not called on NULL path
//   - appendLineageNode not called on EXECUTED_UNCOMMITTED
//   - appendLineageNode called exactly once on EXECUTED path
//   - lineage node binds: canonical_aeo_hash, receipt_id, decision_id, replay_nonce, target_identity
//   - lineage node_id is deterministic ("lineage:" + receipt_id)
//   - lineage append failure does not invalidate the EXECUTED proof receipt
//   - proof hash invariant (validated_object_hash == executed_object_hash) unchanged
//   - lineage semantics live in kernel; persistence is delegated to the port
//   - proof remains authoritative execution evidence; lineage is traceability only

import test from 'node:test'
import assert from 'node:assert/strict'

import { runFilesystemWriteGatewayAction } from '../src/lib/filesystem-write-runtime-gateway.ts'
import { CANONICAL_FILESYSTEM_AEO_FIXTURE } from '../src/lib/filesystem-aeo.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeFilesystemAEO() {
  return JSON.parse(JSON.stringify(CANONICAL_FILESYSTEM_AEO_FIXTURE))
}

const FIXTURE_AEO = makeFilesystemAEO()
const AUTHORITY_LINEAGE_HASH = FIXTURE_AEO.validation.authority_lineage_hash
const DECISION_ID = FIXTURE_AEO.validation.decision_id
const POLICY_ID = FIXTURE_AEO.validation.policy_id
const POLICY_HASH = FIXTURE_AEO.validation.policy_hash
const REPLAY_NONCE = FIXTURE_AEO.validation.replay_nonce

function makeIntent() {
  const aeo = makeFilesystemAEO()
  return {
    atao_input: {
      agent_id: 'test-agent',
      session_id: 'test-session',
      intent: aeo.intent.purpose,
      path: aeo.target.path,
      content: '',
      repo: 'mindshift-demo',
      root: 'repository',
      timestamp: new Date().toISOString(),
    },
    binding: {
      decision_id: DECISION_ID,
      authority_lineage_hash: AUTHORITY_LINEAGE_HASH,
      policy_id: POLICY_ID,
      policy_hash: POLICY_HASH,
      pre_write_hash: aeo.validation.pre_write_hash,
      proposed_diff_hash: aeo.validation.proposed_diff_hash,
      replay_nonce: REPLAY_NONCE,
      allowed_paths: aeo.scope.allowed_paths,
      denied_paths: [],
      allowed_operations: aeo.scope.allowed_operations,
      denied_operations: [],
      max_files: 1,
      max_diff_lines: 300,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock builders
// ─────────────────────────────────────────────────────────────────────────────

function makeReplayRegistry({ isNonceUnused = true, markResult = 'APPENDED' } = {}) {
  const calls = { isNonceUnused: [], markNonceConsumed: [] }
  return {
    async isNonceUnused(replay_nonce) {
      calls.isNonceUnused.push(replay_nonce)
      return isNonceUnused
    },
    async markNonceConsumed(replay_nonce, decision_id) {
      calls.markNonceConsumed.push({ replay_nonce, decision_id })
      if (markResult === 'APPENDED') return { status: 'APPENDED', id: replay_nonce, hash: decision_id }
      if (markResult === 'ALREADY_EXISTS') return { status: 'ALREADY_EXISTS', id: replay_nonce, hash: decision_id }
      return { status: 'REJECTED', reason: 'mock_rejection' }
    },
    calls,
  }
}

function makeLineageRegistry({ appendResult = 'APPENDED' } = {}) {
  const calls = []
  return {
    async appendLineageNode(node) {
      calls.push({ ...node })
      if (appendResult === 'APPENDED') return { status: 'APPENDED', id: node.node_id, hash: node.canonical_aeo_hash }
      if (appendResult === 'ALREADY_EXISTS') return { status: 'ALREADY_EXISTS', id: node.node_id, hash: node.canonical_aeo_hash }
      return { status: 'REJECTED', reason: 'mock_lineage_rejection' }
    },
    calls,
  }
}

function makeValidatorContext(aeo) {
  return {
    authorityRegistry: {
      readDecision: async () => ({
        ok: true,
        value: {
          decision_id: aeo.validation.decision_id,
          status: 'ACTIVE',
          authority_lineage_hash: aeo.validation.authority_lineage_hash,
          scope: 'repository',
          expires_at: null,
        },
      }),
      readAuthorityLineage: async () => ({
        ok: true,
        value: { lineage_hash: aeo.validation.authority_lineage_hash, status: 'ACTIVE' },
      }),
    },
    policyRegistry: {
      readPolicy: async () => ({
        ok: true,
        value: {
          policy_id: aeo.validation.policy_id,
          policy_hash: aeo.validation.policy_hash,
          allowed_paths: aeo.scope.allowed_paths,
          denied_paths: [],
          allowed_operations: aeo.scope.allowed_operations,
          denied_operations: [],
          max_files: 1,
          max_diff_lines: 300,
        },
      }),
      readPolicyHash: async () => ({ ok: true, value: aeo.validation.policy_hash }),
    },
    replayRegistry: {
      readNonceState: async () => ({ ok: true, value: 'UNUSED' }),
      readAeoState: async () => ({ ok: true, value: 'UNUSED' }),
    },
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => ({ ok: true, value: aeo.validation.pre_write_hash }),
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
    diffInspector: {
      hashDiff: (diff) => ({ ok: true, value: diff.content }),
      inspectApplicability: async () => ({ ok: true, value: { applicable: true, post_write_hash: '' } }),
    },
    clock: {
      now: () => ({ ok: true, value: new Date().toISOString() }),
    },
  }
}

function makeWriter() {
  const calls = []
  const writer = ({ path, content }) => {
    calls.push({ path, content })
    return { execution_id: 'exec-1', executed_at: new Date().toISOString(), bytes_written: content.length }
  }
  writer.calls = calls
  return writer
}

function makeContext(overrides = {}) {
  const aeo = makeFilesystemAEO()
  return {
    validator_context: makeValidatorContext(aeo),
    writer: makeWriter(),
    replay_registry: makeReplayRegistry({ isNonceUnused: true, markResult: 'APPENDED' }),
    lineage_registry: makeLineageRegistry(),
    emitted_at: new Date().toISOString(),
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: NULL path — appendLineageNode never called
// ─────────────────────────────────────────────────────────────────────────────

test('lineage boundary: appendLineageNode not called on NULL gateway input', async () => {
  const lineage = makeLineageRegistry()
  const ctx = makeContext({ lineage_registry: lineage })

  const outcome = await runFilesystemWriteGatewayAction(null, ctx)
  assert.equal(outcome.result, 'NULL')
  assert.equal(lineage.calls.length, 0, 'appendLineageNode must not be called on NULL input')
})

test('lineage boundary: appendLineageNode not called when ATAO capture fails', async () => {
  const lineage = makeLineageRegistry()
  const intent = makeIntent()
  intent.atao_input.path = ''  // blank path fails capture

  const outcome = await runFilesystemWriteGatewayAction(intent, makeContext({ lineage_registry: lineage }))
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'capture')
  assert.equal(lineage.calls.length, 0)
})

test('lineage boundary: appendLineageNode not called when nonce is consumed', async () => {
  const lineage = makeLineageRegistry()
  const replay = makeReplayRegistry({ isNonceUnused: false })

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ replay_registry: replay, lineage_registry: lineage }))
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'replay')
  assert.equal(lineage.calls.length, 0, 'appendLineageNode must not be called on NULL path')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: EXECUTED_UNCOMMITTED — appendLineageNode not called
// ─────────────────────────────────────────────────────────────────────────────

test('lineage boundary: appendLineageNode not called on EXECUTED_UNCOMMITTED', async () => {
  const lineage = makeLineageRegistry()
  const replay = makeReplayRegistry({ isNonceUnused: true, markResult: 'REJECTED' })

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ replay_registry: replay, lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED_UNCOMMITTED')
  assert.equal(lineage.calls.length, 0, 'EXECUTED_UNCOMMITTED must not claim lineage convergence')
})

test('lineage boundary: EXECUTED_UNCOMMITTED still carries a proof receipt', async () => {
  const lineage = makeLineageRegistry()
  const replay = makeReplayRegistry({ isNonceUnused: true, markResult: 'REJECTED' })

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ replay_registry: replay, lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED_UNCOMMITTED')
  assert.ok(outcome.receipt, 'proof receipt must still be present on EXECUTED_UNCOMMITTED')
  assert.equal(outcome.receipt.execution_result, 'EXECUTED')
  assert.equal(lineage.calls.length, 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: EXECUTED path — appendLineageNode called with correct binding
// ─────────────────────────────────────────────────────────────────────────────

test('lineage boundary: appendLineageNode called exactly once on EXECUTED', async () => {
  const lineage = makeLineageRegistry()

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED')
  assert.equal(lineage.calls.length, 1, 'appendLineageNode must be called exactly once on EXECUTED')
})

test('lineage boundary: lineage node binds canonical_aeo_hash', async () => {
  const lineage = makeLineageRegistry()

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED')

  const node = lineage.calls[0]
  assert.ok(node.canonical_aeo_hash, 'canonical_aeo_hash must be present')
  assert.match(node.canonical_aeo_hash, /^sha256:[0-9a-f]{64}$/, 'canonical_aeo_hash must be a sha256 hex string')
  assert.equal(node.canonical_aeo_hash, outcome.receipt.validated_object_hash,
    'canonical_aeo_hash must equal the proof receipt validated_object_hash')
})

test('lineage boundary: lineage node binds receipt_id', async () => {
  const lineage = makeLineageRegistry()

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED')

  const node = lineage.calls[0]
  assert.ok(node.receipt_id, 'receipt_id must be present')
  assert.equal(node.receipt_id, outcome.receipt.receipt_id, 'lineage receipt_id must match the proof receipt')
})

test('lineage boundary: lineage node binds decision_id', async () => {
  const lineage = makeLineageRegistry()

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED')

  const node = lineage.calls[0]
  assert.ok(node.decision_id, 'decision_id must be present')
  assert.equal(node.decision_id, outcome.receipt.decision_id, 'lineage decision_id must match the proof receipt')
})

test('lineage boundary: lineage node binds replay_nonce', async () => {
  const lineage = makeLineageRegistry()

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED')

  const node = lineage.calls[0]
  assert.ok(node.replay_nonce, 'replay_nonce must be present')
  assert.equal(node.replay_nonce, outcome.receipt.replay_nonce, 'lineage replay_nonce must match the proof receipt')
  assert.equal(node.replay_nonce, REPLAY_NONCE)
})

test('lineage boundary: lineage node binds target_identity', async () => {
  const lineage = makeLineageRegistry()
  const aeo = makeFilesystemAEO()

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED')

  const node = lineage.calls[0]
  assert.ok(node.target_identity, 'target_identity must be present')
  assert.equal(node.target_identity, aeo.target.path, 'target_identity must bind the target path from the AEO')
})

test('lineage boundary: lineage node_id is deterministic "lineage:" + receipt_id', async () => {
  const lineage = makeLineageRegistry()

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED')

  const node = lineage.calls[0]
  assert.equal(node.node_id, 'lineage:' + outcome.receipt.receipt_id, 'node_id must be deterministic')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: Lineage failure does not invalidate proof
// ─────────────────────────────────────────────────────────────────────────────

test('lineage boundary: appendLineageNode REJECTED does not change EXECUTED to NULL', async () => {
  const lineage = makeLineageRegistry({ appendResult: 'REJECTED' })

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED', 'proof evidence survives lineage persistence failure')
  assert.ok(outcome.receipt, 'proof receipt must be present even when lineage append fails')
})

test('lineage boundary: appendLineageNode ALREADY_EXISTS does not change EXECUTED to NULL', async () => {
  const lineage = makeLineageRegistry({ appendResult: 'ALREADY_EXISTS' })

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED')
  assert.ok(outcome.receipt)
  assert.equal(lineage.calls.length, 1, 'appendLineageNode was still called')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: Proof hash invariant preserved
// ─────────────────────────────────────────────────────────────────────────────

test('lineage boundary: EXECUTED proof still has validated_object_hash == executed_object_hash', async () => {
  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext())
  assert.equal(outcome.result, 'EXECUTED')
  assert.equal(outcome.receipt.validated_object_hash, outcome.receipt.executed_object_hash,
    'proof hash invariant must not be affected by lineage boundary')
})

test('lineage boundary: canonical_aeo_hash in lineage node equals proof validated_object_hash', async () => {
  const lineage = makeLineageRegistry()

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED')
  assert.equal(lineage.calls[0].canonical_aeo_hash, outcome.receipt.validated_object_hash)
  assert.equal(lineage.calls[0].canonical_aeo_hash, outcome.receipt.executed_object_hash)
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 6: Lineage appended after markNonceConsumed (ordering invariant)
// ─────────────────────────────────────────────────────────────────────────────

test('lineage boundary: appendLineageNode is called after markNonceConsumed succeeds', async () => {
  const callOrder = []
  const replay = {
    async isNonceUnused() { return true },
    async markNonceConsumed(nonce, did) {
      callOrder.push('markNonceConsumed')
      return { status: 'APPENDED', id: nonce, hash: did }
    },
  }
  const lineage = {
    async appendLineageNode(node) {
      callOrder.push('appendLineageNode')
      return { status: 'APPENDED', id: node.node_id, hash: node.canonical_aeo_hash }
    },
  }

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), makeContext({ replay_registry: replay, lineage_registry: lineage }))
  assert.equal(outcome.result, 'EXECUTED')
  assert.deepEqual(callOrder, ['markNonceConsumed', 'appendLineageNode'],
    'appendLineageNode must be called after markNonceConsumed')
})

test('lineage boundary: appendLineageNode is not called when markNonceConsumed is never reached (writer NULL)', async () => {
  const lineage = makeLineageRegistry()

  const outcome = await runFilesystemWriteGatewayAction(
    makeIntent(),
    makeContext({ writer: null, lineage_registry: lineage }),
  )
  assert.equal(outcome.result, 'NULL')
  assert.equal(lineage.calls.length, 0)
})
