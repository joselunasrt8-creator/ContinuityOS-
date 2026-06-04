import test from 'node:test'
import assert from 'node:assert/strict'

import { materializeFilesystemAEO, computeFilesystemAEOHash, CANONICAL_FILESYSTEM_AEO_FIXTURE } from '../src/lib/filesystem-aeo.ts'
import { validateFilesystemAEO } from '../src/lib/filesystem-aeo-validator.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeValidInput() {
  return JSON.parse(JSON.stringify(CANONICAL_FILESYSTEM_AEO_FIXTURE))
}

function makePolicy(overrides = {}) {
  return {
    policy_id: 'filesystem-write-policy-v1',
    policy_hash: 'sha256:fixture-policy-hash',
    allowed_paths: ['src/**', 'tests/**', 'docs/**'],
    denied_paths: ['.github/workflows/**', 'wrangler.toml', '.env*', 'secrets/**', 'package-lock.json'],
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

function makeContext(overrides = {}) {
  let readHashCallCount = 0

  const ctx = {
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
      readHash: async (_path) => {
        readHashCallCount++
        return { ok: true, value: 'sha256:fixture-pre-write-hash' }
      },
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
    diffInspector: {
      hashDiff: (diff) => ({ ok: true, value: diff.content }),
      inspectApplicability: async () => ({ ok: true, value: { applicable: true, post_write_hash: 'sha256:post-hash' } }),
    },
    clock: {
      now: () => ({ ok: true, value: new Date().toISOString() }),
    },
    getReadHashCallCount: () => readHashCallCount,
    ...overrides,
  }
  return ctx
}

// ─────────────────────────────────────────────────────────────────────────────
// Issue #1709 — AEO Materialization
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1709 canonical fixture materializes successfully with exactly five top-level fields', () => {
  const result = materializeFilesystemAEO(makeValidInput())
  assert.equal(result.ok, true)
  if (!result.ok) return
  const keys = Object.keys(result.aeo).sort()
  assert.deepEqual(keys, ['finality', 'intent', 'scope', 'target', 'validation'])
})

test('issue #1709 materialization returns aeo_hash prefixed with sha256:', () => {
  const result = materializeFilesystemAEO(makeValidInput())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.match(result.aeo_hash, /^sha256:[0-9a-f]{64}$/)
})

test('issue #1709 extra top-level field returns extra_field_present failure', () => {
  const input = { ...makeValidInput(), extra_field: 'should not be here' }
  const result = materializeFilesystemAEO(input)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.failure, 'extra_field_present')
})

test('issue #1709 missing required field returns missing_required_field failure', () => {
  const { intent: _unused, ...input } = makeValidInput()
  const result = materializeFilesystemAEO(input)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.failure, 'missing_required_field')
})

test('issue #1709 nested extra validation field fails exact-object materialization', () => {
  const input = makeValidInput()
  input.validation.hidden_authority = 'must-not-be-dropped'
  const result = materializeFilesystemAEO(input)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.failure, 'authority_binding_missing')
})

test('issue #1709 missing decision_id in validation returns authority_binding_missing', () => {
  const input = makeValidInput()
  delete input.validation.decision_id
  const result = materializeFilesystemAEO(input)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.failure, 'authority_binding_missing')
})

test('issue #1709 aeo hash is deterministic for equal objects', () => {
  const a = materializeFilesystemAEO(makeValidInput())
  const b = materializeFilesystemAEO(makeValidInput())
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (!a.ok || !b.ok) return
  assert.equal(a.aeo_hash, b.aeo_hash)
})

test('issue #1709 aeo hash differs when any field changes', () => {
  const base = materializeFilesystemAEO(makeValidInput())
  const modified = makeValidInput()
  modified.target.path = 'src/different-file.ts'
  const changed = materializeFilesystemAEO(modified)
  assert.equal(base.ok, true)
  assert.equal(changed.ok, true)
  if (!base.ok || !changed.ok) return
  assert.notEqual(base.aeo_hash, changed.aeo_hash)
})

test('issue #1709 computeFilesystemAEOHash matches materializeFilesystemAEO aeo_hash', () => {
  const result = materializeFilesystemAEO(makeValidInput())
  assert.equal(result.ok, true)
  if (!result.ok) return
  const direct = computeFilesystemAEOHash(result.aeo)
  assert.equal(direct, result.aeo_hash)
})

test('issue #1709 target.system must be "filesystem"', () => {
  const input = makeValidInput()
  input.target.system = 'terminal'
  const result = materializeFilesystemAEO(input)
  assert.equal(result.ok, false)
})

test('issue #1709 finality.proof_required must be true', () => {
  const input = makeValidInput()
  input.finality.proof_required = false
  const result = materializeFilesystemAEO(input)
  assert.equal(result.ok, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// Issue #1708 — Ω Validator Eligibility — Happy Path
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1708 valid filesystem AEO returns VALID', async () => {
  const ctx = makeContext()
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'VALID')
  assert.equal(result.denial_result, null)
})

test('issue #1708 VALID result carries aeo_hash', async () => {
  const ctx = makeContext()
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'VALID')
  if (result.result !== 'VALID') return
  assert.match(result.aeo_hash, /^sha256:[0-9a-f]{64}$/)
})

// ─────────────────────────────────────────────────────────────────────────────
// Issue #1708 — Step 1: Structural Shape
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1708 null input returns NULL with INVALID_AEO_SHAPE before any adapter call', async () => {
  const ctx = makeContext()
  const result = await validateFilesystemAEO(null, ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'INVALID_AEO_SHAPE')
  assert.equal(result.denial_result.mutation_performed, false)
  assert.equal(ctx.getReadHashCallCount(), 0)
})

test('issue #1708 extra top-level field returns NULL with INVALID_AEO_SHAPE', async () => {
  const ctx = makeContext()
  const result = await validateFilesystemAEO({ ...makeValidInput(), extra: 'x' }, ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'INVALID_AEO_SHAPE')
  assert.equal(result.denial_result.mutation_performed, false)
})

test('issue #1708 missing required field returns NULL before any adapter call', async () => {
  const ctx = makeContext()
  const { intent: _unused, ...input } = makeValidInput()
  const result = await validateFilesystemAEO(input, ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.mutation_performed, false)
  assert.equal(ctx.getReadHashCallCount(), 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// Issue #1708 — Step 5: Scope / Path / Operation Policy
// These must fail BEFORE filesystem.readHash is called
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1708 denied workflow path returns NULL without calling readHash', async () => {
  const ctx = makeContext()
  const input = makeValidInput()
  input.target.path = '.github/workflows/deploy.yml'
  const result = await validateFilesystemAEO(input, ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.mutation_performed, false)
  assert.equal(ctx.getReadHashCallCount(), 0, 'readHash must not be called for denied path')
})

test('issue #1708 outside-root path returns NULL without calling readHash', async () => {
  const ctx = makeContext({
    filesystem: {
      normalizePath: (_path) => ({ ok: true, value: '../secrets.env' }),
      readHash: async () => { throw new Error('readHash must not be called') },
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
  })
  const input = makeValidInput()
  input.target.path = '../secrets.env'
  const result = await validateFilesystemAEO(input, ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'PATH_OUTSIDE_ROOT')
  assert.equal(result.denial_result.mutation_performed, false)
})

test('issue #1708 path not in allowed_paths returns NULL without calling readHash', async () => {
  const ctx = makeContext({
    policyRegistry: {
      readPolicy: async () => ({ ok: true, value: makePolicy({ allowed_paths: ['docs/**'] }) }),
      readPolicyHash: async () => ({ ok: true, value: 'sha256:fixture-policy-hash' }),
    },
  })
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'PATH_NOT_ALLOWED')
  assert.equal(result.denial_result.mutation_performed, false)
  assert.equal(ctx.getReadHashCallCount(), 0, 'readHash must not be called when path is not allowed')
})

test('issue #1708 disallowed operation returns NULL without calling readHash', async () => {
  const ctx = makeContext()
  const input = makeValidInput()
  input.target.operation = 'delete'
  const result = await validateFilesystemAEO(input, ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.mutation_performed, false)
  assert.equal(ctx.getReadHashCallCount(), 0, 'readHash must not be called for denied operation')
})

test('issue #1708 ambiguous path normalization returns NULL without calling readHash', async () => {
  const ctx = makeContext({
    filesystem: {
      normalizePath: (_path) => ({
        ok: false,
        observation_error: 'AMBIGUOUS_PATH',
        topology_visible: true,
        safe_to_disclose: true,
      }),
      readHash: async () => { throw new Error('readHash must not be called for ambiguous path') },
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
  })
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'PATH_AMBIGUOUS')
  assert.equal(result.denial_result.mutation_performed, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// Issue #1708 — Step 7: Runtime Pre-State Integrity
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1708 pre_write_hash mismatch returns NULL with failure_class STALE_PRESTATE', async () => {
  const ctx = makeContext({
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => ({ ok: true, value: 'sha256:different-current-hash' }),
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
  })
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'STALE_PRESTATE')
  assert.equal(result.denial_result.denial_reason, 'PRE_WRITE_HASH_MISMATCH')
  assert.equal(result.denial_result.mutation_performed, false)
  assert.equal(result.denial_result.retry_same_aeo_allowed, false)
  assert.equal(result.denial_result.required_agent_action, 'RE_MATERIALIZE_AEO_FROM_CURRENT_STATE')
})

test('issue #1708 NOT_FOUND + modify returns NULL with TARGET_PRESTATE_UNOBSERVABLE', async () => {
  const ctx = makeContext({
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => ({
        ok: false,
        observation_error: 'NOT_FOUND',
        topology_visible: true,
        safe_to_disclose: true,
      }),
      readMetadata: async () => ({ ok: true, value: { exists: false, is_symlink: false } }),
    },
  })
  const input = makeValidInput()
  input.target.operation = 'modify'
  const result = await validateFilesystemAEO(input, ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'TARGET_PRESTATE_UNOBSERVABLE')
  assert.equal(result.denial_result.mutation_performed, false)
  assert.equal(result.denial_result.retry_same_aeo_allowed, false)
})

test('issue #1708 NOT_FOUND + create allowed continues past pre-state check', async () => {
  const ctx = makeContext({
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => ({
        ok: false,
        observation_error: 'NOT_FOUND',
        topology_visible: true,
        safe_to_disclose: true,
      }),
      readMetadata: async () => ({ ok: true, value: { exists: false, is_symlink: false } }),
    },
  })
  const input = makeValidInput()
  input.target.operation = 'create'
  const result = await validateFilesystemAEO(input, ctx)
  // create on non-existent file should succeed past pre-state
  assert.equal(result.result, 'VALID')
})

test('issue #1708 READ_DENIED returns NULL with OBSERVATION_DENIED', async () => {
  const ctx = makeContext({
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => ({
        ok: false,
        observation_error: 'READ_DENIED',
        topology_visible: false,
        safe_to_disclose: false,
      }),
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
  })
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'OBSERVATION_DENIED')
  assert.equal(result.denial_result.mutation_performed, false)
})

test('issue #1708 TIMEOUT returns NULL with OBSERVATION_TIMEOUT', async () => {
  const ctx = makeContext({
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => ({
        ok: false,
        observation_error: 'TIMEOUT',
        topology_visible: false,
        safe_to_disclose: true,
      }),
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
  })
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'OBSERVATION_TIMEOUT')
  assert.equal(result.denial_result.mutation_performed, false)
  assert.equal(result.denial_result.retry_same_aeo_allowed, false)
})

test('issue #1708 IO_ERROR returns NULL with OBSERVATION_UNAVAILABLE', async () => {
  const ctx = makeContext({
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => ({
        ok: false,
        observation_error: 'IO_ERROR',
        topology_visible: false,
        safe_to_disclose: true,
      }),
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
  })
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'OBSERVATION_UNAVAILABLE')
  assert.equal(result.denial_result.mutation_performed, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// Issue #1708 — Step 3: Authority
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1708 invalid authority status returns NULL with AUTHORITY_INVALID', async () => {
  const ctx = makeContext({
    authorityRegistry: {
      readDecision: async () => ({ ok: true, value: makeDecision({ status: 'REVOKED' }) }),
      readAuthorityLineage: async () => ({ ok: true, value: { lineage_hash: 'sha256:fixture-authority-lineage-hash', status: 'ACTIVE' } }),
    },
  })
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'AUTHORITY_INVALID')
  assert.equal(result.denial_result.mutation_performed, false)
})

test('issue #1708 authority lineage hash mismatch returns NULL', async () => {
  const ctx = makeContext({
    authorityRegistry: {
      readDecision: async () => ({ ok: true, value: makeDecision({ authority_lineage_hash: 'sha256:wrong-lineage-hash' }) }),
      readAuthorityLineage: async () => ({ ok: true, value: { lineage_hash: 'sha256:wrong-lineage-hash', status: 'ACTIVE' } }),
    },
  })
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.mutation_performed, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// Issue #1708 — Step 4: Policy
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1708 policy hash mismatch returns NULL with POLICY_HASH_MISMATCH', async () => {
  const ctx = makeContext({
    policyRegistry: {
      readPolicy: async () => ({ ok: true, value: makePolicy({ policy_hash: 'sha256:wrong-policy-hash' }) }),
      readPolicyHash: async () => ({ ok: true, value: 'sha256:wrong-policy-hash' }),
    },
  })
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'POLICY_HASH_MISMATCH')
  assert.equal(result.denial_result.mutation_performed, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// Issue #1708 — Step 6: Replay Eligibility
// Replay check occurs BEFORE runtime pre-state
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1708 consumed replay nonce returns NULL with REPLAY_NOT_ALLOWED before readHash', async () => {
  const ctx = makeContext({
    replayRegistry: {
      readNonceState: async () => ({ ok: true, value: 'CONSUMED' }),
      readAeoState: async () => ({ ok: true, value: 'UNUSED' }),
    },
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => { throw new Error('readHash must not be called when replay is consumed') },
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
  })
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'REPLAY_NONCE_CONSUMED_OR_RESERVED')
  assert.equal(result.denial_result.mutation_performed, false)
})

test('issue #1708 REPLAY_STATE_UNKNOWN returns NULL: REPLAY_NOT_DETERMINABLE', async () => {
  const ctx = makeContext({
    replayRegistry: {
      readNonceState: async () => ({
        ok: false,
        observation_error: 'REPLAY_STATE_UNKNOWN',
        topology_visible: false,
        safe_to_disclose: true,
      }),
      readAeoState: async () => ({ ok: true, value: 'UNUSED' }),
    },
  })
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'REPLAY_STATE_UNKNOWN')
  assert.equal(result.denial_result.mutation_performed, false)
})

test('issue #1708 unobservable AEO replay state fails closed before pre-state read', async () => {
  const ctx = makeContext({
    replayRegistry: {
      readNonceState: async () => ({ ok: true, value: 'UNUSED' }),
      readAeoState: async () => ({
        ok: false,
        observation_error: 'REPLAY_STATE_UNKNOWN',
        topology_visible: false,
        safe_to_disclose: true,
      }),
    },
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => { throw new Error('readHash must not be called when AEO replay state is unobservable') },
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
  })
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'NULL')
  assert.equal(result.denial_result.failure_class, 'AEO_REPLAY_STATE_UNKNOWN')
  assert.equal(result.denial_result.denial_reason, 'REPLAY_NOT_DETERMINABLE')
  assert.equal(result.denial_result.mutation_performed, false)
})

// ─────────────────────────────────────────────────────────────────────────────
// Issue #1708 — Universal invariants
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1708 all NULL results include mutation_performed: false', async () => {
  const scenarios = [
    [null, makeContext()],
    [{ ...makeValidInput(), extra: 'x' }, makeContext()],
    [makeValidInput(), makeContext({
      authorityRegistry: {
        readDecision: async () => ({ ok: true, value: makeDecision({ status: 'REVOKED' }) }),
        readAuthorityLineage: async () => ({ ok: true, value: { lineage_hash: 'sha256:fixture-authority-lineage-hash', status: 'ACTIVE' } }),
      },
    })],
    [makeValidInput(), makeContext({
      policyRegistry: {
        readPolicy: async () => ({ ok: true, value: makePolicy({ policy_hash: 'sha256:wrong-hash' }) }),
        readPolicyHash: async () => ({ ok: true, value: 'sha256:wrong-hash' }),
      },
    })],
    [makeValidInput(), makeContext({
      filesystem: {
        normalizePath: (path) => ({ ok: true, value: path }),
        readHash: async () => ({ ok: true, value: 'sha256:different-hash' }),
        readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
      },
    })],
  ]

  for (const [input, ctx] of scenarios) {
    const result = await validateFilesystemAEO(input, ctx)
    if (result.result === 'NULL') {
      assert.equal(result.denial_result.mutation_performed, false, `mutation_performed must be false for ${result.denial_result.failure_class}`)
    }
  }
})

test('issue #1708 validator does not mutate the input AEO object', async () => {
  const ctx = makeContext()
  const input = makeValidInput()
  const originalJson = JSON.stringify(input)
  await validateFilesystemAEO(input, ctx)
  assert.equal(JSON.stringify(input), originalJson, 'validator must not mutate AEO input')
})

test('issue #1708 VALID result has no denial_result', async () => {
  const ctx = makeContext()
  const result = await validateFilesystemAEO(makeValidInput(), ctx)
  assert.equal(result.result, 'VALID')
  assert.equal(result.denial_result, null)
})

// ─────────────────────────────────────────────────────────────────────────────
// Issue #1708 — Predicate ordering proof: scope → then runtime observation
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1708 predicate ordering: scope failure occurs before filesystem.readHash for denied wrangler.toml', async () => {
  let readHashCalled = false
  const ctx = makeContext({
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => {
        readHashCalled = true
        return { ok: true, value: 'sha256:fixture-pre-write-hash' }
      },
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
  })
  const input = makeValidInput()
  input.target.path = 'wrangler.toml'
  await validateFilesystemAEO(input, ctx)
  assert.equal(readHashCalled, false, 'readHash must not be called for denied wrangler.toml path')
})

test('issue #1708 predicate ordering: scope failure occurs before filesystem.readHash for denied secrets/', async () => {
  let readHashCalled = false
  const ctx = makeContext({
    filesystem: {
      normalizePath: (path) => ({ ok: true, value: path }),
      readHash: async () => {
        readHashCalled = true
        return { ok: true, value: 'sha256:fixture-pre-write-hash' }
      },
      readMetadata: async () => ({ ok: true, value: { exists: true, is_symlink: false } }),
    },
  })
  const input = makeValidInput()
  input.target.path = 'secrets/key.pem'
  await validateFilesystemAEO(input, ctx)
  assert.equal(readHashCalled, false, 'readHash must not be called for denied secrets/ path')
})

test('issue #1708 adapter context interfaces have no mutation methods', () => {
  const ctx = makeContext()
  // Read-only adapters must not expose mutation methods
  const authorityMethods = Object.keys(ctx.authorityRegistry)
  const policyMethods = Object.keys(ctx.policyRegistry)
  const replayMethods = Object.keys(ctx.replayRegistry)
  const fsMethods = Object.keys(ctx.filesystem)
  const diffMethods = Object.keys(ctx.diffInspector)
  const clockMethods = Object.keys(ctx.clock)

  const mutationMethodNames = ['write', 'create', 'delete', 'update', 'mutate', 'consume', 'reserve', 'revoke', 'activate', 'persist', 'emit']

  for (const method of [...authorityMethods, ...policyMethods, ...replayMethods, ...fsMethods, ...diffMethods, ...clockMethods]) {
    for (const mutationWord of mutationMethodNames) {
      assert.equal(
        method.toLowerCase().includes(mutationWord.toLowerCase()),
        false,
        `Adapter must not expose mutation method: ${method}`
      )
    }
  }
})
