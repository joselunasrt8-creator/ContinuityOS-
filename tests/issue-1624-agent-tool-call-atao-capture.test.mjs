import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../migrations/0062_agent_tool_call_atao_capture.sql', import.meta.url), 'utf8')

test('issue #1624 /govern captures agent tool call ATAO before authority execution', () => {
  assert.match(source, /type AgentToolCallATAO = /)
  assert.match(source, /async function captureAgentToolCallATAO/)
  assert.match(source, /if \(url\.pathname === "\/govern" && request\.method === "POST"\)[\s\S]*captureAgentToolCallATAO/)
})

test('issue #1624 ATAO capture is evidence-only and does not create operative execution authority', () => {
  assert.match(source, /tool_surface_descriptor: \{ route: "\/govern", workflow: GOVERNED_WORKFLOW, executable: false \}/)
  assert.match(source, /non_operative: true/)
  assert.match(source, /agent_tool_call_atao_registry[\s\S]*'CAPTURED'/)
})

test('issue #1624 ATAO capture binds to govern envelope, nonce domain, and candidate hash for replay visibility', () => {
  assert.match(source, /atao_id: `atao:\$\{input\.candidate_hash\}:\$\{input\.nonce_domain\}:\$\{input\.nonce\}`/)
  assert.match(source, /govern_envelope_id TEXT NOT NULL/)
  assert.match(source, /candidate_hash,govern_envelope_id,nonce,nonce_domain/)
  assert.match(source, /atao_hash: ataoCapture\?\.atao_hash/)
})

test('issue #1624 migration creates append-only ATAO capture registry', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS agent_tool_call_atao_registry/)
  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS agent_tool_call_atao_registry_append_only_update/)
  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS agent_tool_call_atao_registry_append_only_delete/)
})
