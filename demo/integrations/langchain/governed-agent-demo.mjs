#!/usr/bin/env node
// LangChain agent runtime integration demo.
//
// Flow demonstrated:
//
//   LangChain Tool.invoke()
//   -> ContinuityOS gateway (POST /gateway/tool/filesystem-write)
//   -> ATAO -> AEO -> Validator -> Execution Boundary -> Proof
//   -> VALID (EXECUTED + proof) | NULL (bounded, no execution, no proof)
//
// The LangChain tool (governed-filesystem-tool.mjs) has no filesystem-write
// capability of its own. Its `func` does nothing but call the same governed
// route used by demo/portability/filesystem-governed-execution.mjs. Every
// outcome shown below -- VALID and NULL -- is produced entirely by that
// route; the tool cannot bypass it.
//
// This script does not require any LLM API key: it exercises the LangChain
// Tool interface directly (tool.invoke), which is exactly how a LangChain
// agent executor calls a tool once an LLM has selected it and produced
// matching arguments.

import assert from 'node:assert/strict'
import { importWorker, makeFilesystemGatewayEnv } from '../../lib/governed-worker-harness.mjs'
import { createGovernedFilesystemWriteTool } from './governed-filesystem-tool.mjs'

const AGENT_ID = 'langchain:governed-agent-demo'
const SESSION_ID = 'langchain-demo-session'
// Same path used by demo/portability/filesystem-governed-execution.mjs: the
// gateway pre-seeds this object on first use, which is required for the
// "modify" operation path through the Ω validator's pre-state check.
const TARGET_PATH = 'governed/filesystem-write-gateway/seed.md'

async function main() {
  const worker = (await importWorker()).default
  const env = makeFilesystemGatewayEnv()

  const tool = createGovernedFilesystemWriteTool({ worker, env, agentId: AGENT_ID, sessionId: SESSION_ID })

  // --- VALID: agent proposes a first-time write with a fresh nonce -------
  const validRaw = await tool.invoke({
    path: TARGET_PATH,
    content: 'Written by a LangChain tool call through the ContinuityOS gateway.\n',
    intent: 'LangChain agent demo: first write to governed path',
    replay_nonce: 'langchain-demo-valid-nonce',
  })
  const valid = JSON.parse(validRaw)
  assert.equal(valid.result, 'EXECUTED')
  assert.equal(valid.receipt.validated_object_hash, valid.receipt.executed_object_hash)
  assert.equal(env.proofRegistry.size, 1)
  assert.equal(env.lineageRegistry.size, 1)

  // --- NULL (replay): agent (or a malicious tool-call) reuses the nonce --
  const replayBefore = { proofCount: env.proofRegistry.size, lineageCount: env.lineageRegistry.size }
  const replayRaw = await tool.invoke({
    path: TARGET_PATH,
    content: 'Replay attempt via LangChain tool call; must not land.\n',
    intent: 'LangChain agent demo: replayed nonce',
    replay_nonce: 'langchain-demo-valid-nonce',
  })
  const replay = JSON.parse(replayRaw)
  assert.equal(replay.result, 'NULL')
  assert.equal(replay.execution_performed, false)
  assert.equal(replay.proof_emitted, false)
  const replayAudit = env.nullAuditRegistry.get(replay.correlation_id)
  assert.equal(replayAudit.reason_class, 'REPLAY_NULL')
  assert.equal(env.proofRegistry.size, replayBefore.proofCount)
  assert.equal(env.lineageRegistry.size, replayBefore.lineageCount)

  // --- NULL (policy): agent proposes a write to a denied path ------------
  const deniedBefore = { proofCount: env.proofRegistry.size, lineageCount: env.lineageRegistry.size }
  const deniedRaw = await tool.invoke({
    path: 'wrangler.toml',
    content: 'Denied write attempted via LangChain tool call.\n',
    intent: 'LangChain agent demo: denied path',
    replay_nonce: 'langchain-demo-denied-path-nonce',
  })
  const denied = JSON.parse(deniedRaw)
  assert.equal(denied.result, 'NULL')
  assert.equal(denied.execution_performed, false)
  assert.equal(denied.proof_emitted, false)
  const deniedAudit = env.nullAuditRegistry.get(denied.correlation_id)
  assert.equal(deniedAudit.reason_class, 'POLICY_NULL')
  assert.equal(deniedAudit.denial_reason, 'PATH_NOT_ALLOWED')
  assert.equal(env.objectRegistry.has('wrangler.toml'), false)
  assert.equal(env.proofRegistry.size, deniedBefore.proofCount)
  assert.equal(env.lineageRegistry.size, deniedBefore.lineageCount)

  const output = {
    demo: 'langchain-governed-filesystem-tool',
    runtime: 'langchain',
    tool_name: tool.name,
    route: '/gateway/tool/filesystem-write',
    invariant: 'validated_object_hash == executed_object_hash; NULL emits no proof and no lineage',
    valid: {
      result: valid.result,
      target_path: valid.target_path,
      receipt_id: valid.receipt.receipt_id,
      validated_object_hash: valid.receipt.validated_object_hash,
      executed_object_hash: valid.receipt.executed_object_hash,
      exact_object_preserved: valid.receipt.validated_object_hash === valid.receipt.executed_object_hash,
    },
    null_replay: {
      agent_visible_response: replay,
      operator_audit_record: replayAudit,
    },
    null_denied_path: {
      agent_visible_response: denied,
      operator_audit_record: deniedAudit,
    },
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
