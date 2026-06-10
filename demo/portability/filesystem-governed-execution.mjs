#!/usr/bin/env node
// Portable governed-execution demo.
//
// This is intentionally a demo shell around the existing Worker route, not a new
// execution surface. It bundles src/index.ts, calls POST /gateway/tool/filesystem-write
// with an in-memory D1-compatible adapter, and prints the VALID/NULL proof and
// lineage consequences for model-produced agent actions.

import assert from 'node:assert/strict'
import { ROUTE, importWorker, makeFilesystemGatewayEnv, postJson } from '../lib/governed-worker-harness.mjs'

const SEED_PATH = 'governed/filesystem-write-gateway/seed.md'
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
  const audit = env.nullAuditRegistry.get(out.correlation_id) ?? null
  return {
    agent_visible_response: out,
    operator_audit_record: audit,
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
  assert.equal(replay.result, 'NULL')
  assert.equal(replay.execution_performed, false)
  assert.equal(replay.proof_emitted, false)
  const replayAudit = env.nullAuditRegistry.get(replay.correlation_id)
  assert.equal(replayAudit.reason_class, 'REPLAY_NULL')
  assert.equal(replayAudit.stage, 'replay')
  assert.equal(replayAudit.denial_reason, 'REPLAY_NONCE_CONSUMED')
  assert.equal(env.proofRegistry.size, replayBefore.proofCount)
  assert.equal(env.lineageRegistry.size, replayBefore.lineageCount)

  const deniedBefore = { proofCount: env.proofRegistry.size, lineageCount: env.lineageRegistry.size }
  const denied = await postJson(worker, env, makeAgentAction({
    model,
    nonce: 'portable-demo-denied-path-nonce',
    path: 'wrangler.toml',
    content: 'Denied portability demo write.\n',
  }))
  assert.equal(denied.result, 'NULL')
  assert.equal(denied.execution_performed, false)
  assert.equal(denied.proof_emitted, false)
  const deniedAudit = env.nullAuditRegistry.get(denied.correlation_id)
  assert.equal(deniedAudit.reason_class, 'POLICY_NULL')
  assert.equal(deniedAudit.stage, 'validate')
  assert.equal(deniedAudit.denial_reason, 'PATH_NOT_ALLOWED')
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
