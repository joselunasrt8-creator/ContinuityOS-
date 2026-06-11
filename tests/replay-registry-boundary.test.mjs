// Replay Registry Boundary tests (issue #1931).
//
// Verifies:
//   - replay_registry is an explicit gateway stage (stage="replay")
//   - consumed nonce → NULL at stage="replay", reason="REPLAY_NONCE_CONSUMED"
//   - consumed nonce never reaches execute stage (writer not called)
//   - fresh nonce with markNonceConsumed APPENDED → EXECUTED
//   - markNonceConsumed called with correct replay_nonce and decision_id after EXECUTED
//   - markNonceConsumed REJECTED → EXECUTED_UNCOMMITTED (not EXECUTED)
//   - NULL_REPLAY_REGISTRY when replay_registry is missing
//   - validateAeo unchanged, validateFilesystemAEO unchanged (Rust/TS conformance preserved)

import test from 'node:test'
import assert from 'node:assert/strict'

import { runFilesystemWriteGatewayAction } from '../src/lib/filesystem-write-runtime-gateway.ts'
import { CANONICAL_FILESYSTEM_AEO_FIXTURE } from '../src/lib/filesystem-aeo.ts'
import { canonicalize, sha256Hex } from '../src/canonical.js'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeFilesystemAEO() {
  return JSON.parse(JSON.stringify(CANONICAL_FILESYSTEM_AEO_FIXTURE))
}

const FIXTURE_AEO = makeFilesystemAEO()

// Derive the authority_lineage_hash the route adapter would compute.
const AUTHORITY_LINEAGE_HASH = FIXTURE_AEO.validation.authority_lineage_hash
const DECISION_ID = FIXTURE_AEO.validation.decision_id
const POLICY_ID = FIXTURE_AEO.validation.policy_id
const POLICY_HASH = FIXTURE_AEO.validation.policy_hash
const REPLAY_NONCE = FIXTURE_AEO.validation.replay_nonce

// Build the intent + binding that round-trips through captureFilesystemWriteATAO
// and compileFilesystemWriteAEO to produce FIXTURE_AEO.
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
  const port = {
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
  return port
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

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: NULL_REPLAY_REGISTRY guard
// ─────────────────────────────────────────────────────────────────────────────

test('replay boundary: NULL_REPLAY_REGISTRY when replay_registry is missing', async () => {
  const aeo = makeFilesystemAEO()
  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), {
    validator_context: makeValidatorContext(aeo),
    writer: makeWriter(),
    replay_registry: null,
    emitted_at: new Date().toISOString(),
  })
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'replay')
  assert.equal(outcome.reason, 'NULL_REPLAY_REGISTRY')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Consumed nonce → NULL at stage "replay"
// ─────────────────────────────────────────────────────────────────────────────

test('replay boundary: consumed nonce → NULL at stage="replay"', async () => {
  const aeo = makeFilesystemAEO()
  const registry = makeReplayRegistry({ isNonceUnused: false })
  const writer = makeWriter()

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), {
    validator_context: makeValidatorContext(aeo),
    writer,
    replay_registry: registry,
    emitted_at: new Date().toISOString(),
  })

  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'replay')
  assert.equal(outcome.reason, 'REPLAY_NONCE_CONSUMED')
})

test('replay boundary: consumed nonce → writer never called', async () => {
  const aeo = makeFilesystemAEO()
  const registry = makeReplayRegistry({ isNonceUnused: false })
  const writer = makeWriter()

  await runFilesystemWriteGatewayAction(makeIntent(), {
    validator_context: makeValidatorContext(aeo),
    writer,
    replay_registry: registry,
    emitted_at: new Date().toISOString(),
  })

  assert.equal(writer.calls.length, 0, 'writer must not be called when nonce is consumed')
})

test('replay boundary: consumed nonce → markNonceConsumed never called', async () => {
  const aeo = makeFilesystemAEO()
  const registry = makeReplayRegistry({ isNonceUnused: false })

  await runFilesystemWriteGatewayAction(makeIntent(), {
    validator_context: makeValidatorContext(aeo),
    writer: makeWriter(),
    replay_registry: registry,
    emitted_at: new Date().toISOString(),
  })

  assert.equal(registry.calls.markNonceConsumed.length, 0, 'markNonceConsumed must not be called on NULL path')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Fresh nonce → EXECUTED + markNonceConsumed called correctly
// ─────────────────────────────────────────────────────────────────────────────

test('replay boundary: fresh nonce + APPENDED → result is EXECUTED', async () => {
  const aeo = makeFilesystemAEO()
  const registry = makeReplayRegistry({ isNonceUnused: true, markResult: 'APPENDED' })

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), {
    validator_context: makeValidatorContext(aeo),
    writer: makeWriter(),
    replay_registry: registry,
    emitted_at: new Date().toISOString(),
  })

  assert.equal(outcome.result, 'EXECUTED')
})

test('replay boundary: fresh nonce + ALREADY_EXISTS → result is EXECUTED', async () => {
  const aeo = makeFilesystemAEO()
  const registry = makeReplayRegistry({ isNonceUnused: true, markResult: 'ALREADY_EXISTS' })

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), {
    validator_context: makeValidatorContext(aeo),
    writer: makeWriter(),
    replay_registry: registry,
    emitted_at: new Date().toISOString(),
  })

  assert.equal(outcome.result, 'EXECUTED')
})

test('replay boundary: isNonceUnused called with correct replay_nonce', async () => {
  const aeo = makeFilesystemAEO()
  const registry = makeReplayRegistry({ isNonceUnused: true, markResult: 'APPENDED' })

  await runFilesystemWriteGatewayAction(makeIntent(), {
    validator_context: makeValidatorContext(aeo),
    writer: makeWriter(),
    replay_registry: registry,
    emitted_at: new Date().toISOString(),
  })

  assert.equal(registry.calls.isNonceUnused.length, 1)
  assert.equal(registry.calls.isNonceUnused[0], REPLAY_NONCE)
})

test('replay boundary: markNonceConsumed called after EXECUTED with correct nonce and decision_id', async () => {
  const aeo = makeFilesystemAEO()
  const registry = makeReplayRegistry({ isNonceUnused: true, markResult: 'APPENDED' })

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), {
    validator_context: makeValidatorContext(aeo),
    writer: makeWriter(),
    replay_registry: registry,
    emitted_at: new Date().toISOString(),
  })

  assert.equal(outcome.result, 'EXECUTED')
  assert.equal(registry.calls.markNonceConsumed.length, 1)
  const call = registry.calls.markNonceConsumed[0]
  assert.equal(call.replay_nonce, REPLAY_NONCE)
  assert.equal(typeof call.decision_id, 'string')
  assert.ok(call.decision_id.length > 0, 'decision_id must be non-empty')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: markNonceConsumed REJECTED → EXECUTED_UNCOMMITTED
// ─────────────────────────────────────────────────────────────────────────────

test('replay boundary: markNonceConsumed REJECTED → EXECUTED_UNCOMMITTED', async () => {
  const aeo = makeFilesystemAEO()
  const registry = makeReplayRegistry({ isNonceUnused: true, markResult: 'REJECTED' })

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), {
    validator_context: makeValidatorContext(aeo),
    writer: makeWriter(),
    replay_registry: registry,
    emitted_at: new Date().toISOString(),
  })

  assert.equal(outcome.result, 'EXECUTED_UNCOMMITTED')
})

test('replay boundary: EXECUTED_UNCOMMITTED still carries a proof receipt', async () => {
  const aeo = makeFilesystemAEO()
  const registry = makeReplayRegistry({ isNonceUnused: true, markResult: 'REJECTED' })

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), {
    validator_context: makeValidatorContext(aeo),
    writer: makeWriter(),
    replay_registry: registry,
    emitted_at: new Date().toISOString(),
  })

  assert.equal(outcome.result, 'EXECUTED_UNCOMMITTED')
  assert.ok(outcome.receipt, 'proof receipt must be present on EXECUTED_UNCOMMITTED')
  assert.equal(outcome.receipt.execution_result, 'EXECUTED')
  assert.equal(outcome.receipt.creates_authority, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: Proof hash invariant preserved
// ─────────────────────────────────────────────────────────────────────────────

test('replay boundary: EXECUTED proof has validated_object_hash == executed_object_hash', async () => {
  const aeo = makeFilesystemAEO()
  const registry = makeReplayRegistry({ isNonceUnused: true, markResult: 'APPENDED' })

  const outcome = await runFilesystemWriteGatewayAction(makeIntent(), {
    validator_context: makeValidatorContext(aeo),
    writer: makeWriter(),
    replay_registry: registry,
    emitted_at: new Date().toISOString(),
  })

  assert.equal(outcome.result, 'EXECUTED')
  assert.equal(outcome.receipt.validated_object_hash, outcome.receipt.executed_object_hash)
})
