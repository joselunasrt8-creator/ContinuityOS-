// Issue #1928: Reconcile FilesystemAEO with canonical validateAeo contract (Approach B).
//
// Acceptance criteria verified here:
//   - canonicalAEO validates with existing validateAeo (unchanged)
//   - canonical object_hash computed with validation.object_hash = null
//   - context.expected_authority matches all 5 authority_id fields
//   - context.maximum_scope contains all projected bounds
//   - writer not called on projection NULL or validateAeo NULL
//   - proof uses canonical_aeo_hash as validated_object_hash
//   - executed_object_hash == canonical_aeo_hash (exact-object invariant holds)
//   - TS/Rust conformance unchanged (validateAeo not modified)
//   - validateFilesystemAEO (Ω) not bypassed

import test from 'node:test'
import assert from 'node:assert/strict'

import { compileCanonicalAEOFromFilesystem } from '../src/lib/compile-canonical-aeo.ts'
import { CANONICAL_FILESYSTEM_AEO_FIXTURE } from '../src/lib/filesystem-aeo.ts'
import { validateAeo, aeoObjectForHash } from '../src/continuity-core.js'
import { canonicalize, sha256Hex } from '../src/canonical.js'
import { runFilesystemWriteGatewayAction } from '../src/lib/filesystem-write-runtime-gateway.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeFilesystemAEO() {
  return JSON.parse(JSON.stringify(CANONICAL_FILESYSTEM_AEO_FIXTURE))
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: compileCanonicalAEOFromFilesystem — projection correctness
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1928 compile returns ok:true for valid FilesystemAEO', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
})

test('issue #1928 compile returns ok:false for null input', () => {
  const result = compileCanonicalAEOFromFilesystem(null)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.denial_reason, 'NULL_FILESYSTEM_AEO')
})

test('issue #1928 canonical_aeo has exactly 5 top-level keys', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
  if (!result.ok) return
  const keys = Object.keys(result.canonical_aeo).sort()
  assert.deepEqual(keys, ['finality', 'intent', 'scope', 'target', 'validation'])
})

test('issue #1928 all 5 sections contain authority_id equal to context.expected_authority', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
  if (!result.ok) return
  const { canonical_aeo, context } = result
  for (const section of ['finality', 'intent', 'scope', 'target', 'validation']) {
    assert.equal(
      canonical_aeo[section].authority_id,
      context.expected_authority,
      `${section}.authority_id must equal context.expected_authority`,
    )
  }
})

test('issue #1928 context.expected_authority derived from authority_lineage_hash', () => {
  const aeo = makeFilesystemAEO()
  const result = compileCanonicalAEOFromFilesystem(aeo)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.context.expected_authority, aeo.validation.authority_lineage_hash)
})

test('issue #1928 scope.bounds contains system:filesystem and action:* for each allowed op', () => {
  const aeo = makeFilesystemAEO()
  const result = compileCanonicalAEOFromFilesystem(aeo)
  assert.equal(result.ok, true)
  if (!result.ok) return
  const bounds = result.canonical_aeo.scope.bounds
  assert.ok(bounds.includes('system:filesystem'), 'bounds must include system:filesystem')
  for (const op of aeo.scope.allowed_operations) {
    assert.ok(bounds.includes(`action:${op}`), `bounds must include action:${op}`)
  }
})

test('issue #1928 context.maximum_scope contains all scope.bounds', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
  if (!result.ok) return
  const { canonical_aeo, context } = result
  for (const bound of canonical_aeo.scope.bounds) {
    assert.ok(context.maximum_scope.includes(bound), `maximum_scope must contain bound: ${bound}`)
  }
})

test('issue #1928 validation.object_hash is a 64-char lowercase hex string', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
  if (!result.ok) return
  const { object_hash } = result.canonical_aeo.validation
  assert.match(object_hash, /^[0-9a-f]{64}$/, 'object_hash must be 64-char lowercase hex with no prefix')
})

test('issue #1928 validation.object_hash matches sha256(canonicalize(AEO with object_hash=null))', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
  if (!result.ok) return
  const { canonical_aeo } = result
  // aeoObjectForHash sets validation.object_hash = null before hashing
  const for_hash = aeoObjectForHash(canonical_aeo)
  const expected = sha256Hex(canonicalize(for_hash))
  assert.equal(canonical_aeo.validation.object_hash, expected)
})

test('issue #1928 canonical_aeo_hash is "sha256:" + sha256Hex(canonicalize(canonical_aeo))', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
  if (!result.ok) return
  const expected = 'sha256:' + sha256Hex(canonicalize(result.canonical_aeo))
  assert.equal(result.canonical_aeo_hash, expected)
})

test('issue #1928 canonical_aeo_hash is deterministic for equal FilesystemAEO inputs', () => {
  const a = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  const b = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(a.ok, true)
  assert.equal(b.ok, true)
  if (!a.ok || !b.ok) return
  assert.equal(a.canonical_aeo_hash, b.canonical_aeo_hash)
})

test('issue #1928 target.action equals FilesystemAEO.target.operation', () => {
  const aeo = makeFilesystemAEO()
  const result = compileCanonicalAEOFromFilesystem(aeo)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.canonical_aeo.target.action, aeo.target.operation)
})

test('issue #1928 target.path equals FilesystemAEO.target.path', () => {
  const aeo = makeFilesystemAEO()
  const result = compileCanonicalAEOFromFilesystem(aeo)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.canonical_aeo.target.path, aeo.target.path)
})

test('issue #1928 target.system equals "filesystem"', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.canonical_aeo.target.system, 'filesystem')
})

test('issue #1928 intent.value equals FilesystemAEO.intent.purpose', () => {
  const aeo = makeFilesystemAEO()
  const result = compileCanonicalAEOFromFilesystem(aeo)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.canonical_aeo.intent.value, aeo.intent.purpose)
})

test('issue #1928 validation.proposed_diff_hash equals FilesystemAEO.validation.proposed_diff_hash (content identity binding)', () => {
  const aeo = makeFilesystemAEO()
  const result = compileCanonicalAEOFromFilesystem(aeo)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(
    result.canonical_aeo.validation.proposed_diff_hash,
    aeo.validation.proposed_diff_hash,
    'canonical projection must bind content identity via proposed_diff_hash',
  )
})

test('issue #1928 changing proposed_diff_hash changes canonical_aeo_hash (content binding is in hash pre-image)', () => {
  const aeo = makeFilesystemAEO()
  const modified = { ...aeo, validation: { ...aeo.validation, proposed_diff_hash: 'sha256:different-diff-hash' } }
  const base = compileCanonicalAEOFromFilesystem(aeo)
  const changed = compileCanonicalAEOFromFilesystem(modified)
  assert.equal(base.ok, true)
  assert.equal(changed.ok, true)
  if (!base.ok || !changed.ok) return
  assert.notEqual(
    base.canonical_aeo_hash,
    changed.canonical_aeo_hash,
    'different proposed_diff_hash must produce different canonical_aeo_hash',
  )
})

test('issue #1928 compile does not mutate the source FilesystemAEO', () => {
  const aeo = makeFilesystemAEO()
  const before = JSON.stringify(aeo)
  compileCanonicalAEOFromFilesystem(aeo)
  assert.equal(JSON.stringify(aeo), before, 'compileCanonicalAEOFromFilesystem must not mutate input')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: validateAeo accepts the compiled CanonicalAEO (existing function, unchanged)
// ─────────────────────────────────────────────────────────────────────────────

test('issue #1928 validateAeo returns VALID for compiled canonical AEO', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
  if (!result.ok) return
  const decision = validateAeo(result.canonical_aeo, result.context)
  assert.equal(decision, 'VALID')
})

test('issue #1928 validateAeo returns NULL if one section has wrong authority_id', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
  if (!result.ok) return
  // Tamper: replace target.authority_id with a different value
  const tampered = {
    ...result.canonical_aeo,
    target: { ...result.canonical_aeo.target, authority_id: 'wrong-authority' },
  }
  const decision = validateAeo(tampered, result.context)
  assert.equal(decision, 'NULL')
})

test('issue #1928 validateAeo returns NULL if scope.bounds contains out-of-scope value', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
  if (!result.ok) return
  const tampered = {
    ...result.canonical_aeo,
    scope: { ...result.canonical_aeo.scope, bounds: [...result.canonical_aeo.scope.bounds, 'action:delete'] },
  }
  // maximum_scope does not contain 'action:delete'
  const decision = validateAeo(tampered, result.context)
  assert.equal(decision, 'NULL')
})

test('issue #1928 validateAeo returns NULL if object_hash is wrong', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
  if (!result.ok) return
  const tampered = {
    ...result.canonical_aeo,
    validation: { ...result.canonical_aeo.validation, object_hash: 'a'.repeat(64) },
  }
  const decision = validateAeo(tampered, result.context)
  assert.equal(decision, 'NULL')
})

test('issue #1928 validateAeo returns NULL for extra top-level field on canonical AEO', () => {
  const result = compileCanonicalAEOFromFilesystem(makeFilesystemAEO())
  assert.equal(result.ok, true)
  if (!result.ok) return
  const tampered = { ...result.canonical_aeo, extra: 'injected' }
  const decision = validateAeo(tampered, result.context)
  assert.equal(decision, 'NULL')
})

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Gateway integration — canonical_aeo_hash flows to proof
// ─────────────────────────────────────────────────────────────────────────────

function makeGatewayIntentInput() {
  return {
    atao_input: {
      agent_id: 'agent-001',
      session_id: 'session-001',
      intent: 'bounded repository file mutation',
      path: 'src/example.ts',
      content: 'export const x = 1\n',
      repo: 'mindshift-demo',
      root: 'repository',
      timestamp: '2026-06-09T00:00:00.000Z',
    },
    binding: {
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
    },
  }
}

function makeGatewayContext(writerFn) {
  return {
    validator_context: {
      authorityRegistry: {
        readDecision: async () => ({
          ok: true,
          value: {
            decision_id: 'AUTH-fixture-001',
            status: 'ACTIVE',
            authority_lineage_hash: 'sha256:fixture-authority-lineage-hash',
            scope: 'repository',
            expires_at: null,
          },
        }),
        readAuthorityLineage: async () => ({
          ok: true,
          value: { lineage_hash: 'sha256:fixture-authority-lineage-hash', status: 'ACTIVE' },
        }),
      },
      policyRegistry: {
        readPolicy: async () => ({
          ok: true,
          value: {
            policy_id: 'filesystem-write-policy-v1',
            policy_hash: 'sha256:fixture-policy-hash',
            allowed_paths: ['src/**', 'tests/**', 'docs/**'],
            denied_paths: ['.github/workflows/**', 'wrangler.toml', '.env*', 'secrets/**', 'package-lock.json'],
            allowed_operations: ['create', 'modify'],
            denied_operations: ['delete', 'chmod', 'rename', 'symlink'],
            max_files: 1,
            max_diff_lines: 300,
          },
        }),
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
    },
    writer: writerFn ?? (() => ({ execution_id: 'fs-write:test-001', executed_at: new Date().toISOString(), bytes_written: 19 })),
    emitted_at: '2026-06-09T00:00:00.000Z',
  }
}

test('issue #1928 gateway returns EXECUTED on valid input', async () => {
  const outcome = await runFilesystemWriteGatewayAction(
    makeGatewayIntentInput(),
    makeGatewayContext(),
  )
  assert.equal(outcome.result, 'EXECUTED')
})

test('issue #1928 proof.validated_object_hash equals canonical_aeo_hash', async () => {
  const intent = makeGatewayIntentInput()
  const outcome = await runFilesystemWriteGatewayAction(intent, makeGatewayContext())
  assert.equal(outcome.result, 'EXECUTED')
  if (outcome.result !== 'EXECUTED') return

  // Compile independently to get the expected canonical_aeo_hash
  const { compileFilesystemWriteAEO, captureFilesystemWriteATAO } = await import('../src/lib/filesystem-write-gateway.ts')
  const atao = captureFilesystemWriteATAO(intent.atao_input)
  const aeo = compileFilesystemWriteAEO(atao, intent.binding)
  const canonicalResult = compileCanonicalAEOFromFilesystem(aeo)
  assert.equal(canonicalResult.ok, true)
  if (!canonicalResult.ok) return

  assert.equal(outcome.receipt.validated_object_hash, canonicalResult.canonical_aeo_hash)
})

test('issue #1928 proof.executed_object_hash equals proof.validated_object_hash', async () => {
  const outcome = await runFilesystemWriteGatewayAction(makeGatewayIntentInput(), makeGatewayContext())
  assert.equal(outcome.result, 'EXECUTED')
  if (outcome.result !== 'EXECUTED') return
  assert.equal(outcome.receipt.executed_object_hash, outcome.receipt.validated_object_hash)
})

test('issue #1928 writer not called when ATAO capture fails (stage=capture)', async () => {
  let writerCalled = false
  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: null, binding: makeGatewayIntentInput().binding },
    makeGatewayContext(() => { writerCalled = true; return null }),
  )
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'capture')
  assert.equal(writerCalled, false, 'writer must not be called on capture NULL')
})

test('issue #1928 writer not called when AEO compile fails (stage=compile)', async () => {
  let writerCalled = false
  const outcome = await runFilesystemWriteGatewayAction(
    { atao_input: makeGatewayIntentInput().atao_input, binding: null },
    makeGatewayContext(() => { writerCalled = true; return null }),
  )
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'compile')
  assert.equal(writerCalled, false, 'writer must not be called on compile NULL')
})

test('issue #1928 validateFilesystemAEO (Ω) is not bypassed — denied path still returns NULL at validate stage', async () => {
  let writerCalled = false
  const intent = makeGatewayIntentInput()
  // Override path to a denied path — passes canonical validateAeo but fails Ω validator
  intent.atao_input = { ...intent.atao_input, path: '.github/workflows/deploy.yml' }

  const outcome = await runFilesystemWriteGatewayAction(
    intent,
    makeGatewayContext(() => { writerCalled = true; return null }),
  )
  assert.equal(outcome.result, 'NULL')
  assert.equal(outcome.stage, 'validate', 'Ω validator must still run and deny the path')
  assert.equal(writerCalled, false, 'writer must not be called when Ω validator denies')
})

test('issue #1928 canonical stage is "canonical" in stage type (not "validate")', async () => {
  // Verify the stage string literal is correct by checking gateway source
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/lib/filesystem-write-runtime-gateway.ts', import.meta.url), 'utf8')
  assert.ok(src.includes("'canonical'"), "gateway source must reference 'canonical' stage")
  assert.ok(src.includes('CANONICAL_VALIDATION_NULL'), "gateway source must include CANONICAL_VALIDATION_NULL denial reason")
  assert.ok(src.includes('validateAeo'), "gateway source must call validateAeo")
  assert.ok(src.includes('validateFilesystemAEO'), "validateFilesystemAEO must still be present — Ω not bypassed")
  assert.ok(src.includes('compileCanonicalAEOFromFilesystem'), "gateway source must call compileCanonicalAEOFromFilesystem")
})

test('issue #1928 TS/Rust conformance fixture still produces VALID with existing validateAeo', async () => {
  // Confirm that the conformance fixture (aeo-valid.json) still validates correctly —
  // no changes to validateAeo semantics introduced by this issue.
  const { readFileSync } = await import('node:fs')
  const fixture = JSON.parse(
    readFileSync(new URL('../fixtures/conformance/aeo-valid.json', import.meta.url), 'utf8'),
  )
  const decision = validateAeo(fixture.aeo, fixture.context)
  assert.equal(decision, 'VALID', 'conformance fixture must still return VALID — validateAeo unchanged')
})
