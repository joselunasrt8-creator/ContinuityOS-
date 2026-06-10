#!/usr/bin/env node
// Portable governed-execution demo.
//
// This is intentionally a demo shell around the existing Worker route, not a new
// execution surface. It bundles src/index.ts, calls POST /gateway/tool/filesystem-write
// with an in-memory D1-compatible adapter, and prints the VALID/NULL proof and
// lineage consequences for model-produced agent actions.

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildSync } from 'esbuild'

const ROUTE = '/gateway/tool/filesystem-write'
const SEED_PATH = 'governed/filesystem-write-gateway/seed.md'
const API_KEY = 'demo-key'
const DEFAULT_MODEL = 'any-model'

function parseArgs(argv) {
  const out = { model: DEFAULT_MODEL }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--model' && argv[i + 1]) {
      out.model = argv[i + 1]
      i += 1
    } else if (arg.startsWith('--model=')) {
      out.model = arg.slice('--model='.length)
    } else if (!arg.startsWith('-') && out.model === DEFAULT_MODEL) {
      out.model = arg
    }
  }
  return out
}

async function importWorker() {
  const entryPoint = fileURLToPath(new URL('../../src/index.ts', import.meta.url))
  const tmpDir = mkdtempSync(join(tmpdir(), 'mindshift-portability-demo-'))
  const outfile = join(tmpDir, 'worker.mjs')
  buildSync({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    outfile,
    platform: 'neutral',
  })
  try {
    return await import(pathToFileURL(outfile).href)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

function makePost(payload) {
  return new Request(`https://demo.local${ROUTE}`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function makeAgentAction({ model, nonce, path = SEED_PATH, content }) {
  return {
    agent_id: `model:${model}`,
    session_id: 'portable-demo-session',
    intent: `portable demo action emitted by ${model}`,
    path,
    content,
    replay_nonce: nonce,
  }
}

function makeFilesystemGatewayEnv() {
  const decisionRegistry = new Map()
  const nonceRegistry = new Map()
  const objectRegistry = new Map()
  const proofRegistry = new Map()
  const lineageRegistry = new Map()
  const writes = []

  const env = {
    API_KEY,
    decisionRegistry,
    nonceRegistry,
    objectRegistry,
    proofRegistry,
    lineageRegistry,
    writes,
    DB: {
      prepare(sql) {
        const statement = {
          args: [],
          bind(...args) {
            this.args = args
            return this
          },
          async run() {
            writes.push({ sql, args: this.args })

            if (/^\s*CREATE\s+/i.test(sql)) return { meta: { changes: 0 } }

            if (sql.includes('INSERT OR IGNORE INTO governed_filesystem_write_decision_registry')) {
              const [decision_id, authority_lineage_hash, created_at] = this.args
              if (!decisionRegistry.has(decision_id)) {
                decisionRegistry.set(decision_id, {
                  decision_id,
                  status: 'ACTIVE',
                  authority_lineage_hash,
                  scope: 'repository',
                  expires_at: null,
                  created_at,
                })
              }
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT OR IGNORE INTO governed_filesystem_object_registry')) {
              const [path, content, content_hash, bytes_written, updated_at] = this.args
              if (!objectRegistry.has(path)) {
                objectRegistry.set(path, { path, content, content_hash, bytes_written, updated_at })
              }
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_object_registry') && sql.includes('ON CONFLICT(path) DO UPDATE')) {
              const [path, content, content_hash, bytes_written, updated_at] = this.args
              objectRegistry.set(path, { path, content, content_hash, bytes_written, updated_at })
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_write_nonce_registry') && sql.includes('ON CONFLICT(replay_nonce) DO UPDATE')) {
              const [replay_nonce, decision_id, created_at, consumed_at] = this.args
              const existing = nonceRegistry.get(replay_nonce)
              nonceRegistry.set(replay_nonce, {
                replay_nonce,
                decision_id,
                state: 'CONSUMED',
                created_at: existing ? existing.created_at : created_at,
                consumed_at,
              })
              return { meta: { changes: 1 } }
            }

            if (sql.includes('INSERT INTO governed_filesystem_write_proof_registry')) {
              const [
                receipt_id,
                atao_id,
                validated_object_hash,
                executed_object_hash,
                execution_evidence_hash,
                adapter_surface,
                decision_id,
                replay_nonce,
                target_path,
                execution_result,
                emitted_at,
                created_at,
              ] = this.args
              proofRegistry.set(receipt_id, {
                receipt_id,
                atao_id,
                validated_object_hash,
                executed_object_hash,
                execution_evidence_hash,
                adapter_surface,
                decision_id,
                replay_nonce,
                target_path,
                execution_result,
                creates_authority: false,
                emitted_at,
                created_at,
              })
              return { meta: { changes: 1 } }
            }

            if (sql.includes('governed_filesystem_write_lineage_registry') && sql.includes('INSERT INTO')) {
              const [
                node_id,
                parent_id,
                canonical_aeo_hash,
                receipt_id,
                decision_id,
                replay_nonce,
                target_system,
                target_action,
                target_path,
                status,
                created_at,
              ] = this.args
              lineageRegistry.set(node_id, {
                node_id,
                parent_id,
                canonical_aeo_hash,
                receipt_id,
                decision_id,
                replay_nonce,
                target_system,
                target_action,
                target_path,
                status,
                created_at,
              })
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
              const [path] = this.args
              return objectRegistry.get(path) ?? null
            }
            return null
          },
          async all() {
            return { results: [] }
          },
        }
        return statement
      },
    },
  }

  return env
}

async function postJson(worker, env, payload) {
  const response = await worker.fetch(makePost(payload), env)
  return response.json()
}

function summarizeValid(out, env) {
  const receipt = out.receipt
  const lineage = env.lineageRegistry.get(`lineage:${receipt.receipt_id}`)
  const proof = env.proofRegistry.get(receipt.receipt_id)
  return {
    status: out.status,
    target_path: out.target_path,
    bytes_written: out.bytes_written,
    receipt_id: receipt.receipt_id,
    validated_object_hash: receipt.validated_object_hash,
    executed_object_hash: receipt.executed_object_hash,
    exact_object_preserved: receipt.validated_object_hash === receipt.executed_object_hash,
    proof_persisted: Boolean(proof),
    lineage_persisted: Boolean(lineage),
    proof_lineage_bound:
      Boolean(proof && lineage) &&
      lineage.receipt_id === proof.receipt_id &&
      lineage.canonical_aeo_hash === proof.executed_object_hash,
  }
}

function summarizeNull(out, env, before) {
  return {
    status: out.status,
    stage: out.stage,
    reason: out.reason ?? out.validator_denial?.failure_class ?? null,
    validator_failure_class: out.validator_denial?.failure_class ?? null,
    receipt: out.receipt ?? null,
    proof_count_before: before.proofCount,
    proof_count_after: env.proofRegistry.size,
    lineage_count_before: before.lineageCount,
    lineage_count_after: env.lineageRegistry.size,
    no_new_proof: env.proofRegistry.size === before.proofCount,
    no_new_lineage: env.lineageRegistry.size === before.lineageCount,
  }
}

async function main() {
  const { model } = parseArgs(process.argv.slice(2))
  const worker = (await importWorker()).default
  const env = makeFilesystemGatewayEnv()

  const validAction = makeAgentAction({
    model,
    nonce: 'portable-demo-valid-nonce',
    content: `Portable governed execution demo from ${model}.\n`,
  })

  const valid = await postJson(worker, env, validAction)
  assert.equal(valid.status, 'EXECUTED')
  assert.equal(valid.result, 'EXECUTED')
  assert.equal(valid.receipt.validated_object_hash, valid.receipt.executed_object_hash)
  assert.equal(env.proofRegistry.size, 1)
  assert.equal(env.lineageRegistry.size, 1)

  const replayBefore = { proofCount: env.proofRegistry.size, lineageCount: env.lineageRegistry.size }
  const replay = await postJson(worker, env, {
    ...validAction,
    content: `Replay attempt from ${model}; this content must not land.\n`,
  })
  assert.equal(replay.status, 'NULL')
  assert.equal(replay.stage, 'replay')
  assert.equal(replay.reason, 'REPLAY_NONCE_CONSUMED')
  assert.equal(env.proofRegistry.size, replayBefore.proofCount)
  assert.equal(env.lineageRegistry.size, replayBefore.lineageCount)

  const deniedBefore = { proofCount: env.proofRegistry.size, lineageCount: env.lineageRegistry.size }
  const denied = await postJson(worker, env, makeAgentAction({
    model,
    nonce: 'portable-demo-denied-path-nonce',
    path: 'wrangler.toml',
    content: 'Denied portability demo write.\n',
  }))
  assert.equal(denied.status, 'NULL')
  assert.equal(denied.stage, 'validate')
  assert.equal(denied.validator_denial.failure_class, 'PATH_NOT_ALLOWED')
  assert.equal(env.objectRegistry.has('wrangler.toml'), false)
  assert.equal(env.proofRegistry.size, deniedBefore.proofCount)
  assert.equal(env.lineageRegistry.size, deniedBefore.lineageCount)

  const validSummary = summarizeValid(valid, env)
  const replaySummary = summarizeNull(replay, env, replayBefore)
  const deniedSummary = summarizeNull(denied, env, deniedBefore)

  const output = {
    demo: 'filesystem-governed-execution-reference-adapter',
    model_input: model,
    route: ROUTE,
    invariant: 'validated_object_hash == executed_object_hash; NULL emits no proof and no lineage',
    valid: validSummary,
    null_replay: replaySummary,
    null_denied_path: deniedSummary,
    adapter_state: {
      virtual_filesystem_paths: [...env.objectRegistry.keys()].sort(),
      proof_receipts: [...env.proofRegistry.keys()].sort(),
      lineage_nodes: [...env.lineageRegistry.keys()].sort(),
    },
  }

  console.log(JSON.stringify(output, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
