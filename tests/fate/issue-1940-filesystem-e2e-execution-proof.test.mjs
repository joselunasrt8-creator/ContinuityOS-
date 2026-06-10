// Issue #1940: Authoritative end-to-end execution proof for the filesystem path.
//
// This is a composition proof, not a new boundary. It proves that the boundaries
// established by issues #1890, #1928, #1932/#1931, #1934/#1935, and #1925/#1936
// operate as one uninterrupted legitimacy chain:
//
//   ATAO → FilesystemAEO → CanonicalAEO → validateAeo → replay eligibility
//        → Ω validation → executeWithAdapter → proof persistence → lineage append
//
// Required invariant (Validation-to-Execution Equivalence — priority #1):
//
//   canonical_aeo_hash computed before validateAeo
//   == canonical_aeo_hash passed into executeWithAdapter
//   == receipt.validated_object_hash
//   == receipt.executed_object_hash
//   or NULL
//
// Required invariant (Proof-to-Lineage Binding — priority #2):
//
//   lineage.receipt_id == proof.receipt_id
//   lineage.canonical_aeo_hash == proof.executed_object_hash
//
// Constraints honored: no new adapter, no new registry, validateAeo /
// validateFilesystemAEO / replay / proof / lineage semantics unchanged,
// scope limited to the filesystem path.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  captureFilesystemWriteATAO,
  compileFilesystemWriteAEO,
} from '../../src/lib/filesystem-write-gateway.ts'
import { compileCanonicalAEOFromFilesystem } from '../../src/lib/compile-canonical-aeo.ts'
import { validateAeo } from '../../src/continuity-core.js'
import { runFilesystemWriteGatewayAction } from '../../src/lib/filesystem-write-runtime-gateway.ts'
import { executeFilesystemAdapter } from '../../src/lib/filesystem-execution-adapter.ts'
import { importWorker } from '../helpers/import-worker.mjs'

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixtures (Part A — kernel-level)
// ─────────────────────────────────────────────────────────────────────────────

const EMITTED_AT = '2026-06-09T00:00:00.000Z'

function makeAtaoInput(overrides = {}) {
  return {
    agent_id: 'agent-1940',
    session_id: 'session-1940',
    intent: 'authoritative end-to-end filesystem execution proof',
    path: 'src/issue-1940-example.ts',
    content: 'export const issue1940 = true\n',
    repo: 'mindshift-demo',
    root: 'repository',
    timestamp: '2026-06-09T00:00:00.000Z',
    ...overrides,
  }
}

function makeBinding(overrides = {}) {
  return {
    decision_id: 'AUTH-fixture-1940',
    authority_lineage_hash: 'sha256:fixture-authority-lineage-1940',
    policy_id: 'filesystem-write-policy-v1',
    policy_hash: 'sha256:fixture-policy-hash-1940',
    pre_write_hash: 'sha256:fixture-pre-write-hash-1940',
    proposed_diff_hash: 'sha256:fixture-diff-hash-1940',
    replay_nonce: 'fixture-nonce-1940',
    allowed_paths: ['src/**', 'tests/**', 'docs/**'],
    denied_paths: ['.github/workflows/**', 'wrangler.toml', '.env*', 'secrets/**', 'package-lock.json'],
    allowed_operations: ['create', 'modify'],
    denied_operations: ['delete', 'chmod', 'rename', 'symlink'],
    max_files: 1,
    max_diff_lines: 300,
    ...overrides,
  }
}

// Builds a kernel context that records call order so that ordering invariants
// (replay eligibility before execution; execution before nonce consumption)
// can be asserted directly.
function makeKernelContext({ nonceUnused = true, writerResult = 'ok' } = {}) {
  const callOrder = []
  let writerCalled = false

  return {
    callOrder,
    isWriterCalled: () => writerCalled,
    context: {
      validator_context: {
        authorityRegistry: {
          readDecision: async () => ({
            ok: true,
            value: {
              decision_id: 'AUTH-fixture-1940',
              status: 'ACTIVE',
              authority_lineage_hash: 'sha256:fixture-authority-lineage-1940',
              scope: 'repository',
              expires_at: null,
            },
          }),
          readAuthorityLineage: async () => ({
            ok: true,
            value: { lineage_hash: 'sha256:fixture-authority-lineage-1940', status: 'ACTIVE' },
          }),
        },
        policyRegistry: {
          readPolicy: async () => ({
            ok: true,
            value: {
              policy_id: 'filesystem-write-policy-v1',
              policy_hash: 'sha256:fixture-policy-hash-1940',
              allowed_paths: ['src/**', 'tests/**', 'docs/**'],
              denied_paths: ['.github/workflows/**', 'wrangler.toml', '.env*', 'secrets/**', 'package-lock.json'],
              allowed_operations: ['create', 'modify'],
              denied_operations: ['delete', 'chmod', 'rename', 'symlink'],
              max_files: 1,
              max_diff_lines: 300,
            },
          }),
          readPolicyHash: async () => ({ ok: true, value: 'sha256:fixture-policy-hash-1940' }),
        },
        replayRegistry: {
          readNonceState: async () => ({ ok: true, value: nonceUnused ? 'UNUSED' : 'CONSUMED' }),
          readAeoState: async () => ({ ok: true, value: 'UNUSED' }),
        },
        filesystem: {
          normalizePath: (path) => ({ ok: true, value: path }),
          readHash: async () => ({ ok: true, value: 'sha256:fixture-pre-write-hash-1940' }),
          readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
        },
        diffInspector: {
          hashDiff: (diff) => ({ ok: true, value: diff.content }),
          inspectApplicability: async () => ({ ok: true, value: { applicable: true, post_write_hash: 'sha256:post-hash-1940' } }),
        },
        clock: {
          now: () => ({ ok: true, value: EMITTED_AT }),
        },
      },
      writer: (input) => {
        writerCalled = true
        callOrder.push('writer')
        if (writerResult === 'null') return null
        return { execution_id: `fs-write:sha256:fixture-1940`, executed_at: EMITTED_AT, bytes_written: input.content.length }
      },
      replay_registry: {
        isNonceUnused: async () => {
          callOrder.push('replay_check')
          return nonceUnused
        },
        markNonceConsumed: async (nonce, decision_id) => {
          callOrder.push('replay_consume')
          return { status: 'APPENDED', id: nonce, hash: decision_id }
        },
      },
      emitted_at: EMITTED_AT,
    },
  }
}

function compileChain(ataoInput, binding) {
  const atao = captureFilesystemWriteATAO(ataoInput)
  const aeo = compileFilesystemWriteAEO(atao, binding)
  const canonicalResult = compileCanonicalAEOFromFilesystem(aeo)
  return { atao, aeo, canonicalResult }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Validation-to-Execution Equivalence (priority #1)
//
//   canonical_aeo_hash computed before validateAeo
//   == canonical_aeo_hash passed into executeWithAdapter
//   == receipt.validated_object_hash
//   == receipt.executed_object_hash
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1940 [equivalence] full chain: ATAO -> AEO -> CanonicalAEO -> validateAeo -> replay -> Ω -> executeWithAdapter -> EXECUTED', async () => {
  const ataoInput = makeAtaoInput()
  const binding = makeBinding()

  // Build the chain exactly as the kernel will, so we can independently observe
  // canonical_aeo_hash *before* it is ever passed to validateAeo or executeWithAdapter.
  const { atao, aeo, canonicalResult } = compileChain(ataoInput, binding)
  assert.notEqual(atao, null, 'ATAO capture must succeed')
  assert.notEqual(aeo, null, 'AEO compilation must succeed')
  assert.equal(canonicalResult.ok, true, 'CanonicalAEO projection must succeed')

  const canonical_aeo_hash_before_validate = canonicalResult.canonical_aeo_hash

  // canonical_aeo_hash at validateAeo
  const decision = validateAeo(canonicalResult.canonical_aeo, canonicalResult.context)
  assert.equal(decision, 'VALID', 'validateAeo must accept the projected CanonicalAEO')

  // Run the full kernel chain (replay eligibility -> Ω -> executeWithAdapter).
  const { context, callOrder } = makeKernelContext({ nonceUnused: true })
  const outcome = await runFilesystemWriteGatewayAction({ atao_input: ataoInput, binding }, context)

  assert.equal(outcome.result, 'EXECUTED', 'full chain must reach EXECUTED')

  // canonical_aeo_hash passed to executeWithAdapter == receipt.validated_object_hash
  // (the kernel passes canonicalResult.canonical_aeo_hash as validated_object_hash)
  assert.equal(outcome.receipt.validated_object_hash, canonical_aeo_hash_before_validate,
    'validated_object_hash must equal the canonical_aeo_hash computed before validateAeo')

  // receipt.executed_object_hash == receipt.validated_object_hash (exact-object invariant)
  assert.equal(outcome.receipt.executed_object_hash, outcome.receipt.validated_object_hash,
    'executed_object_hash must equal validated_object_hash')

  // Transitively: canonical_aeo_hash at validateAeo == ... == receipt.executed_object_hash
  assert.equal(outcome.receipt.executed_object_hash, canonical_aeo_hash_before_validate)

  // Replay eligibility was checked before execution (writer call).
  const replayIdx = callOrder.indexOf('replay_check')
  const writerIdx = callOrder.indexOf('writer')
  assert.ok(replayIdx !== -1, 'replay eligibility must be checked')
  assert.ok(writerIdx !== -1, 'writer must be invoked on EXECUTED path')
  assert.ok(replayIdx < writerIdx, 'replay eligibility must be checked before execution')
})

test('issue #1940 [equivalence] mutated-after-validation: a different CanonicalAEO presented to executeWithAdapter -> NULL, writer never called', async () => {
  const ataoInput = makeAtaoInput({ path: 'src/issue-1940-mutation.ts' })
  const binding = makeBinding({ replay_nonce: 'fixture-nonce-1940-mutation' })
  const { aeo, canonicalResult } = compileChain(ataoInput, binding)
  assert.equal(canonicalResult.ok, true)

  // The hash that validateAeo approved.
  const validated_object_hash = canonicalResult.canonical_aeo_hash
  assert.equal(validateAeo(canonicalResult.canonical_aeo, canonicalResult.context), 'VALID')

  // Simulate drift: a CanonicalAEO that differs from the one validateAeo approved
  // (e.g. tampered target.path) is presented to executeWithAdapter via
  // executeFilesystemAdapter, but validated_object_hash still reflects the original.
  const tampered = {
    ...canonicalResult.canonical_aeo,
    target: { ...canonicalResult.canonical_aeo.target, path: canonicalResult.canonical_aeo.target.path + '.mutated' },
  }

  let writerCalled = false
  const outcome = executeFilesystemAdapter(
    tampered,
    validated_object_hash,
    'export const issue1940 = true\n',
    () => { writerCalled = true; return { execution_id: 'fs-write:should-not-happen', executed_at: EMITTED_AT, bytes_written: 1 } },
    EMITTED_AT,
  )

  assert.equal(outcome.ok, false, 'mutated-after-validation must return NULL')
  assert.equal(outcome.null_result.null_reason, 'OBJECT_HASH_MISMATCH')
  assert.equal(writerCalled, false, 'writer/adapter must never be called when the executed object differs from the validated object')
})

test('issue #1940 [equivalence] replayed nonce: NULL at replay stage, before Ω validation and before writer/adapter call', async () => {
  const ataoInput = makeAtaoInput({ path: 'src/issue-1940-replay.ts' })
  const binding = makeBinding({ replay_nonce: 'fixture-nonce-1940-replay' })

  const { context, callOrder, isWriterCalled } = makeKernelContext({ nonceUnused: false })
  const outcome = await runFilesystemWriteGatewayAction({ atao_input: ataoInput, binding }, context)

  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'replay', 'a consumed nonce must short-circuit at the replay stage')
  assert.equal(outcome.reason, 'REPLAY_NONCE_CONSUMED')
  assert.equal(isWriterCalled(), false, 'writer/adapter must not be called for a replayed nonce')
  assert.equal(callOrder.includes('replay_consume'), false, 'nonce consumption must not run on a replay-rejected path')
})

test('issue #1940 [equivalence] Ω-denied path: NULL at validate stage, after canonical validateAeo VALID, before writer/adapter call', async () => {
  // A path outside the allowed scope passes canonical validateAeo (which only checks
  // the projected bounds) but is denied by validateFilesystemAEO (Ω).
  const ataoInput = makeAtaoInput({ path: 'wrangler.toml' })
  const binding = makeBinding({ replay_nonce: 'fixture-nonce-1940-omega-denied' })

  const { canonicalResult } = compileChain(ataoInput, binding)
  assert.equal(canonicalResult.ok, true)
  assert.equal(validateAeo(canonicalResult.canonical_aeo, canonicalResult.context), 'VALID',
    'canonical validateAeo does not perform Ω path-policy checks')

  const { context, isWriterCalled } = makeKernelContext({ nonceUnused: true })
  const outcome = await runFilesystemWriteGatewayAction({ atao_input: ataoInput, binding }, context)

  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'validate', 'Ω validator must still run and deny the path')
  assert.notEqual(outcome.validator_denial, null)
  assert.equal(isWriterCalled(), false, 'writer/adapter must not be called when Ω denies')
})

test('issue #1940 [equivalence] NULL paths emit no receipt', async () => {
  const ataoInput = makeAtaoInput({ path: 'src/issue-1940-no-receipt.ts' })
  const binding = makeBinding({ replay_nonce: 'fixture-nonce-1940-no-receipt' })
  const { context } = makeKernelContext({ nonceUnused: false })
  const outcome = await runFilesystemWriteGatewayAction({ atao_input: ataoInput, binding }, context)
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.receipt, null, 'NULL replay outcome carries no receipt')
})

test('issue #1940 [equivalence] execution occurs only through executeFilesystemAdapter / executeWithAdapter', () => {
  const src = readFileSync(new URL('../../src/lib/filesystem-write-runtime-gateway.ts', import.meta.url), 'utf8')
  // context.writer is only ever passed into executeFilesystemAdapter — never invoked directly.
  const writerUses = [...src.matchAll(/context\.writer/g)]
  assert.ok(writerUses.length >= 2, 'context.writer must be referenced (type guard + execution call)')
  assert.match(src, /executeFilesystemAdapter\(\s*\n?\s*canonicalResult\.canonical_aeo[\s\S]{0,200}context\.writer/,
    'context.writer must be passed into executeFilesystemAdapter, not invoked directly')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Proof-to-Lineage Binding (priority #2) — route level
//
//   lineage.receipt_id == proof.receipt_id
//   lineage.canonical_aeo_hash == proof.executed_object_hash
//
//   ordering: validation -> execution -> proof -> lineage
// ─────────────────────────────────────────────────────────────────────────────

let _worker
async function getWorker() {
  if (!_worker) _worker = (await importWorker()).default
  return _worker
}

const ROUTE = '/gateway/tool/filesystem-write'

function post(payload) {
  return new Request(`https://runtime.test${ROUTE}`, {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function makeRequestBody(overrides = {}) {
  return {
    agent_id: 'agent-1940',
    session_id: 'session-1940',
    intent: 'issue #1940 end-to-end composition proof',
    path: 'governed/filesystem-write-gateway/seed.md',
    content: 'Issue #1940 end-to-end composition proof content.\n',
    replay_nonce: `nonce-1940-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  }
}

// Mock D1 environment — same shape as tests/lineage-registry-boundary.test.mjs,
// reused here so the lineage <-> proof binding can be inspected end-to-end.
function makeEnv() {
  const decisionRegistry = new Map()
  const nonceRegistry = new Map()
  const objectRegistry = new Map()
  const proofRegistry = new Map()
  const lineageRegistry = new Map()
  const writes = []

  const env = {
    API_KEY: 'test-key',
    decisionRegistry,
    nonceRegistry,
    objectRegistry,
    proofRegistry,
    lineageRegistry,
    writes,
    DB: {
      prepare(sql) {
        const stmt = {
          args: [],
          bind(...args) { this.args = args; return this },
          async run() {
            writes.push({ sql, args: this.args })

            if (/^\s*CREATE /i.test(sql)) return { meta: { changes: 0 } }

            if (sql.includes('INSERT OR IGNORE INTO governed_filesystem_write_decision_registry')) {
              const [decision_id, authority_lineage_hash, created_at] = this.args
              if (!decisionRegistry.has(decision_id)) {
                decisionRegistry.set(decision_id, { decision_id, status: 'ACTIVE', authority_lineage_hash, scope: 'repository', expires_at: null, created_at })
              }
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT OR IGNORE INTO governed_filesystem_object_registry')) {
              const [p, content, content_hash, bytes_written, updated_at] = this.args
              if (!objectRegistry.has(p)) {
                objectRegistry.set(p, { path: p, content, content_hash, bytes_written, updated_at })
              }
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_write_nonce_registry')
                && sql.includes('ON CONFLICT(replay_nonce) DO UPDATE')) {
              const [replay_nonce, decision_id, created_at] = this.args
              const existing = nonceRegistry.get(replay_nonce)
              nonceRegistry.set(replay_nonce, { replay_nonce, decision_id, state: 'CONSUMED', created_at: existing ? existing.created_at : created_at, consumed_at: created_at })
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_object_registry') && sql.includes('ON CONFLICT(path) DO UPDATE')) {
              const [p, content, content_hash, bytes_written, updated_at] = this.args
              objectRegistry.set(p, { path: p, content, content_hash, bytes_written, updated_at })
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_write_proof_registry')) {
              const [receipt_id] = this.args
              proofRegistry.set(receipt_id, this.args)
              return { meta: { changes: 1 } }
            }

            if (sql.includes('governed_filesystem_write_lineage_registry') && sql.includes('INSERT INTO')) {
              const [node_id] = this.args
              lineageRegistry.set(node_id, this.args)
              return { meta: { changes: 1 } }
            }

            return { meta: { changes: 1 } }
          },
          async first() {
            if (sql.includes('FROM governed_filesystem_write_decision_registry')) {
              const [decision_id] = this.args
              return decisionRegistry.get(decision_id) ?? null
            }
            if (sql.includes('FROM governed_filesystem_write_nonce_registry')) {
              const [replay_nonce] = this.args
              return nonceRegistry.get(replay_nonce) ?? null
            }
            if (sql.includes('FROM governed_filesystem_object_registry')) {
              const [p] = this.args
              return objectRegistry.get(p) ?? null
            }
            return null
          },
          async all() { return { results: [] } },
        }
        return stmt
      },
    },
  }
  return env
}

test('issue #1940 [proof-to-lineage] EXECUTED: lineage.receipt_id == proof.receipt_id and lineage.canonical_aeo_hash == proof.executed_object_hash', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()

  assert.equal(out.status, 'EXECUTED')
  assert.ok(out.receipt)

  // Validation-to-execution equivalence holds at the receipt level.
  assert.equal(out.receipt.validated_object_hash, out.receipt.executed_object_hash)
  assert.match(out.receipt.executed_object_hash, /^sha256:[0-9a-f]{64}$/)

  assert.equal(env.lineageRegistry.size, 1, 'exactly one lineage record must be appended')
  const [node_id, parent_id, canonical_aeo_hash, receipt_id] = [...env.lineageRegistry.values()][0]

  assert.equal(receipt_id, out.receipt.receipt_id, 'lineage.receipt_id must equal proof.receipt_id')
  assert.equal(canonical_aeo_hash, out.receipt.executed_object_hash, 'lineage.canonical_aeo_hash must equal proof.executed_object_hash')
  assert.equal(node_id, 'lineage:' + receipt_id)

  // Confirm the proof row was actually persisted (registry, not just the response).
  assert.equal(env.proofRegistry.size, 1)
  const [persisted_receipt_id, , persisted_validated_hash, persisted_executed_hash] = [...env.proofRegistry.values()][0]
  assert.equal(persisted_receipt_id, out.receipt.receipt_id)
  assert.equal(persisted_validated_hash, out.receipt.validated_object_hash)
  assert.equal(persisted_executed_hash, out.receipt.executed_object_hash)
})

test('issue #1940 [proof-to-lineage] ordering: execution write -> proof persistence -> lineage append', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody()), env)
  const out = await res.json()
  assert.equal(out.status, 'EXECUTED')

  const objectWriteIdx = env.writes.findIndex(w =>
    w.sql.includes('governed_filesystem_object_registry') && w.sql.includes('ON CONFLICT(path) DO UPDATE'))
  const proofIdx = env.writes.findIndex(w =>
    w.sql.includes('governed_filesystem_write_proof_registry') && w.sql.includes('INSERT INTO'))
  const lineageIdx = env.writes.findIndex(w =>
    w.sql.includes('governed_filesystem_write_lineage_registry') && w.sql.includes('INSERT INTO'))

  assert.ok(objectWriteIdx !== -1, 'execution write must occur')
  assert.ok(proofIdx !== -1, 'proof must be persisted')
  assert.ok(lineageIdx !== -1, 'lineage must be appended')

  assert.ok(objectWriteIdx < proofIdx, 'execution must precede proof persistence')
  assert.ok(proofIdx < lineageIdx, 'proof persistence must precede lineage append')
})

test('issue #1940 [proof-to-lineage] NULL path (malformed input): no proof, no lineage', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post({ agent_id: '', session_id: '', intent: '', path: '', replay_nonce: '' }), env)
  const out = await res.json()

  assert.equal(out.result, 'NULL')
  assert.match(out.correlation_id, /^null_evt_[0-9a-f]{32}$/)
  assert.equal(env.proofRegistry.size, 0, 'no proof on NULL path')
  assert.equal(env.lineageRegistry.size, 0, 'no lineage on NULL path')
})

test('issue #1940 [proof-to-lineage] NULL path (Ω-denied path): no proof, no lineage, no execution write', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const res = await worker.fetch(post(makeRequestBody({ path: 'wrangler.toml' })), env)
  const out = await res.json()

  assert.equal(out.result, 'NULL')
  assert.match(out.correlation_id, /^null_evt_[0-9a-f]{32}$/)
  assert.equal(env.proofRegistry.size, 0)
  assert.equal(env.lineageRegistry.size, 0)
  assert.equal(env.objectRegistry.has('wrangler.toml'), false, 'denied path must never be written')
})

test('issue #1940 [proof-to-lineage] replayed nonce: NULL at replay stage, no proof, no lineage, no execution write', async () => {
  const worker = await getWorker()
  const env = makeEnv()

  const body = makeRequestBody()

  // First call consumes the nonce.
  const first = await (await worker.fetch(post(body), env)).json()
  assert.equal(first.status, 'EXECUTED')
  assert.equal(env.lineageRegistry.size, 1)
  assert.equal(env.proofRegistry.size, 1)

  // Second call with the same nonce must be rejected before execution.
  const second = await (await worker.fetch(post({ ...body, content: 'A second, different write attempt.\n' }), env)).json()

  assert.equal(second.result, 'NULL')
  assert.match(second.correlation_id, /^null_evt_[0-9a-f]{32}$/)

  // No new proof or lineage record was created for the replayed attempt.
  assert.equal(env.proofRegistry.size, 1, 'replayed attempt must not add a new proof record')
  assert.equal(env.lineageRegistry.size, 1, 'replayed attempt must not add a new lineage record')
})
