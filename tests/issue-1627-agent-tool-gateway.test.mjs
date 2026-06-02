import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from './helpers/import-worker.mjs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const gatewayLib = readFileSync(new URL('../src/lib/agent-tool-gateway.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../migrations/0065_agent_tool_gateway.sql', import.meta.url), 'utf8')

// ── Static source analysis ────────────────────────────────────────────────

test('issue #1627 gateway lib defines AgentToolObservationArtifact (not ATAO)', () => {
  assert.match(gatewayLib, /AgentToolObservationArtifact/)
  assert.doesNotMatch(gatewayLib, /AgentToolGatewayATAO/)
})

test('issue #1627 gateway lib defines GatewayClassifiedInterceptionProposal (CIP = Cognitive Interface Protocol)', () => {
  assert.match(gatewayLib, /GatewayClassifiedInterceptionProposal/)
  assert.match(gatewayLib, /Cognitive Interface Protocol/)
})

test('issue #1627 gateway lib defines AgentToolGovernanceProposal as the output artifact', () => {
  assert.match(gatewayLib, /AgentToolGovernanceProposal/)
  assert.match(gatewayLib, /proposal_class.*GOVERNANCE_PROPOSAL/)
  assert.match(gatewayLib, /proposal_status.*PENDING_AUTHORITY_REVIEW/)
})

test('issue #1627 gateway lib enforces proposal_space only — no authority_space or execution_space', () => {
  assert.match(gatewayLib, /proposal_space.*populated/)
  assert.match(gatewayLib, /authority_space.*not_populated/)
  assert.match(gatewayLib, /execution_space.*not_populated/)
})

test('issue #1627 gateway lib marks GovernanceProposal as non-operative (creates_atao: false, creates_aeo: false)', () => {
  assert.match(gatewayLib, /creates_atao.*false/)
  assert.match(gatewayLib, /creates_aeo.*false/)
  assert.match(gatewayLib, /non_operative.*true/)
})

test('issue #1627 gateway lib exports interceptToolCall as the gateway entry point', () => {
  assert.match(gatewayLib, /export function interceptToolCall/)
})

test('issue #1627 gateway lib exports formObservationArtifact, formCIPProposal, formGovernanceProposal', () => {
  assert.match(gatewayLib, /export function formObservationArtifact/)
  assert.match(gatewayLib, /export function formCIPProposal/)
  assert.match(gatewayLib, /export function formGovernanceProposal/)
})

test('issue #1627 gateway lib exports classifyGatewayToolSurface for deterministic risk classification', () => {
  assert.match(gatewayLib, /export function classifyGatewayToolSurface/)
  assert.match(gatewayLib, /GATEWAY_TOOL_RISK_TABLE/)
})

test('issue #1627 gateway lib exports checkOmegaValidatorBoundary with 7-condition check', () => {
  assert.match(gatewayLib, /export function checkOmegaValidatorBoundary/)
  assert.match(gatewayLib, /conditions\.valid/)
  assert.match(gatewayLib, /conditions\.authorized/)
  assert.match(gatewayLib, /conditions\.unused/)
  assert.match(gatewayLib, /conditions\.policy_valid/)
  assert.match(gatewayLib, /conditions\.replay_safe/)
  assert.match(gatewayLib, /conditions\.topology_visible/)
  assert.match(gatewayLib, /conditions\.reconcilable/)
})

test('issue #1627 gateway lib Ω Validator returns VALID | NULL only', () => {
  assert.match(gatewayLib, /OmegaValidatorResult.*=.*"VALID".*\|.*"NULL"/)
})

test('issue #1627 index.ts imports from agent-tool-gateway', () => {
  assert.match(source, /from.*["']\.\/lib\/agent-tool-gateway/)
  assert.match(source, /interceptToolCall/)
  assert.match(source, /classifyGatewayToolSurface/)
  assert.match(source, /checkOmegaValidatorBoundary/)
})

test('issue #1627 index.ts declares gateway intercept and propose routes', () => {
  assert.match(source, /AGENT_TOOL_GATEWAY_INTERCEPT_ROUTE.*=.*"\/gateway\/tool\/intercept"/)
  assert.match(source, /AGENT_TOOL_GATEWAY_PROPOSE_ROUTE.*=.*"\/gateway\/tool\/propose"/)
})

test('issue #1627 index.ts /gateway/tool/intercept handler is non-operative (creates_atao: false)', () => {
  assert.match(source, /AGENT_TOOL_GATEWAY_INTERCEPT_ROUTE/)
  assert.match(source, /agentToolGatewayInterceptRoute.*request\.method.*POST[\s\S]{0,200}handleAgentToolGatewayIntercept/)
  assert.match(source, /creates_atao.*false/)
  assert.match(source, /creates_aeo.*false/)
})

test('issue #1627 index.ts /gateway/tool/intercept persists to observation and proposal registries', () => {
  assert.match(source, /agent_tool_observation_registry/)
  assert.match(source, /agent_tool_proposal_registry/)
})

test('issue #1627 index.ts /gateway/tool/propose returns PENDING_AUTHORITY_REVIEW without creating ATAO', () => {
  assert.match(source, /PENDING_AUTHORITY_REVIEW/)
  assert.match(source, /next_step.*authority_review/)
})

test('issue #1627 migration creates agent_tool_observation_registry (append-only)', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS agent_tool_observation_registry/)
  assert.match(migration, /agent_tool_observation_registry_append_only_update/)
  assert.match(migration, /agent_tool_observation_registry_append_only_delete/)
})

test('issue #1627 migration creates agent_tool_proposal_registry (append-only, creates_atao=0 enforced)', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS agent_tool_proposal_registry/)
  assert.match(migration, /creates_atao INTEGER NOT NULL DEFAULT 0 CHECK \(creates_atao = 0\)/)
  assert.match(migration, /creates_aeo INTEGER NOT NULL DEFAULT 0 CHECK \(creates_aeo = 0\)/)
  assert.match(migration, /agent_tool_proposal_registry_append_only_update/)
  assert.match(migration, /agent_tool_proposal_registry_append_only_delete/)
})

// ── Runtime tests ─────────────────────────────────────────────────────────

async function getWorker() {
  return (await importWorker()).default
}

function post(path, body) {
  return new Request(`https://runtime.test${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

function makeEnv() {
  return {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        return {
          bind(..._params) { return this },
          async first() { return null },
          async run() { return { meta: { changes: 1 } } },
          async all() { return { results: [] } }
        }
      },
      async batch(stmts) { return stmts.map(() => ({ meta: { changes: 1 } })) }
    }
  }
}

// Core architectural test: Capability ≠ Permission
// Agent requests GitHub Issue Create → Gateway → Observation + CIP Proposal → No ATAO → No AEO → No execution
test('issue #1627 CORE: github create_issue → INTERCEPTED with proposal only — no ATAO, no AEO, no authority', async () => {
  const worker = await getWorker()
  const env = makeEnv()
  const res = await worker.fetch(post('/gateway/tool/intercept', {
    agent_id: 'agent-1',
    session_id: 'session-1',
    tool_name: 'create_issue',
    tool_input: { title: 'Test issue', body: 'description' },
    intent: 'create a github issue for tracking',
    scope: { repo: 'owner/repo' },
    constraints: {}
  }), env)
  const data = await res.json()
  assert.equal(data.status, 'INTERCEPTED')
  assert.equal(data.creates_atao, false)
  assert.equal(data.creates_aeo, false)
  assert.equal(data.non_operative, true)
  assert.equal(data.proposal_class, 'GOVERNANCE_PROPOSAL')
  assert.equal(data.proposal_status, 'PENDING_AUTHORITY_REVIEW')
  assert.equal(data.authority_space, 'not_populated')
  assert.equal(data.execution_space, 'not_populated')
  assert.equal(data.proposal_space, 'populated')
  assert.equal(data.tool_system, 'github')
  assert.equal(data.risk_class, 'P2')
  assert.equal(data.requires_authority_binding, true)
  assert.ok(data.observation_id)
  assert.ok(data.observation_hash)
  assert.ok(data.cip_id)
  assert.ok(data.proposal_id)
})

test('issue #1627 read-only tool (list_issues) → INTERCEPTED, risk P0, requires_authority_binding false', async () => {
  const worker = await getWorker()
  const env = makeEnv()
  const res = await worker.fetch(post('/gateway/tool/intercept', {
    agent_id: 'agent-1',
    session_id: 'session-1',
    tool_name: 'list_issues',
    tool_input: { repo: 'owner/repo' },
    intent: 'list open issues',
    scope: { repo: 'owner/repo' },
    constraints: {}
  }), env)
  const data = await res.json()
  assert.equal(data.status, 'INTERCEPTED')
  assert.equal(data.tool_system, 'github')
  assert.equal(data.risk_class, 'P0')
  assert.equal(data.requires_authority_binding, false)
  assert.equal(data.creates_atao, false)
  assert.equal(data.creates_aeo, false)
})

test('issue #1627 shell terminal_command → INTERCEPTED, risk P3 (highest risk)', async () => {
  const worker = await getWorker()
  const env = makeEnv()
  const res = await worker.fetch(post('/gateway/tool/intercept', {
    agent_id: 'agent-1',
    session_id: 'session-1',
    tool_name: 'terminal_command',
    tool_input: { command: 'rm -rf /' },
    intent: 'run terminal command',
    scope: {},
    constraints: {}
  }), env)
  const data = await res.json()
  assert.equal(data.status, 'INTERCEPTED')
  assert.equal(data.tool_system, 'shell')
  assert.equal(data.risk_class, 'P3')
  assert.equal(data.requires_authority_binding, true)
  assert.equal(data.creates_atao, false)
})

test('issue #1627 missing tool_name → NULL (no ATAO, no execution)', async () => {
  const worker = await getWorker()
  const env = makeEnv()
  const res = await worker.fetch(post('/gateway/tool/intercept', {
    agent_id: 'agent-1',
    session_id: 'session-1',
    tool_input: {},
    intent: 'something',
    scope: {},
    constraints: {}
  }), env)
  const data = await res.json()
  assert.equal(data.status, 'NULL')
  assert.equal(data.non_operative, true)
  assert.equal(data.creates_atao, false)
  assert.equal(data.creates_aeo, false)
})

test('issue #1627 missing agent_id or session_id → NULL', async () => {
  const worker = await getWorker()
  const env = makeEnv()
  const res = await worker.fetch(post('/gateway/tool/intercept', {
    tool_name: 'write_file',
    tool_input: { path: '/tmp/x', content: 'y' },
    intent: 'write file',
    scope: {},
    constraints: {}
  }), env)
  const data = await res.json()
  assert.equal(data.status, 'NULL')
  assert.equal(data.non_operative, true)
})

test('issue #1627 /gateway/tool/propose with missing fields → NULL', async () => {
  const worker = await getWorker()
  const env = makeEnv()
  const res = await worker.fetch(post('/gateway/tool/propose', {
    proposal_id: 'p-1'
    // missing observation_id and observation_hash
  }), env)
  const data = await res.json()
  assert.equal(data.status, 'NULL')
  assert.equal(data.non_operative, true)
})

test('issue #1627 /gateway/tool/intercept requires auth — unauthorized without API key', async () => {
  const worker = await getWorker()
  const env = makeEnv()
  const res = await worker.fetch(new Request('https://runtime.test/gateway/tool/intercept', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agent_id: 'a', session_id: 's', tool_name: 'write_file', tool_input: {}, intent: 'x', scope: {}, constraints: {} })
  }), env)
  assert.equal(res.status, 403)
})

// ── Unit tests for gateway library ────────────────────────────────────────

test('issue #1627 classifyGatewayToolSurface: merge_pull_request → github P2', async () => {
  const { classifyGatewayToolSurface: classify } = await import('../src/lib/agent-tool-gateway.ts')
  const result = classify('merge_pull_request')
  assert.equal(result.system, 'github')
  assert.equal(result.risk_class, 'P2')
})

test('issue #1627 classifyGatewayToolSurface: deploy_action → deploy P3', async () => {
  const { classifyGatewayToolSurface: classify } = await import('../src/lib/agent-tool-gateway.ts')
  const result = classify('deploy_action')
  assert.equal(result.system, 'deploy')
  assert.equal(result.risk_class, 'P3')
})

test('issue #1627 classifyGatewayToolSurface: read_file → filesystem P0', async () => {
  const { classifyGatewayToolSurface: classify } = await import('../src/lib/agent-tool-gateway.ts')
  const result = classify('read_file')
  assert.equal(result.system, 'filesystem')
  assert.equal(result.risk_class, 'P0')
})

test('issue #1627 interceptToolCall produces observation (non-operative) not ATAO', async () => {
  const { interceptToolCall } = await import('../src/lib/agent-tool-gateway.ts')
  const outcome = interceptToolCall({
    agent_id: 'agent-1', session_id: 'session-1',
    tool_name: 'create_issue', tool_input: { title: 'test' },
    intent: 'create issue', scope: { repo: 'r/r' }, constraints: {},
    timestamp: '2026-06-02T00:00:00.000Z'
  })
  assert.equal(outcome.status, 'INTERCEPTED')
  assert.ok(outcome.observation)
  assert.ok(outcome.observation_hash)
  assert.ok(outcome.cip)
  assert.ok(outcome.proposal)
  assert.equal(outcome.non_operative, true)
  // Observation must not carry ATAO fields
  assert.ok(!('atao_id' in outcome.observation))
  assert.ok(!('framework_authority' in outcome.observation))
})

test('issue #1627 interceptToolCall: observation creates_authority=false, creates_execution_eligibility=false', async () => {
  const { interceptToolCall } = await import('../src/lib/agent-tool-gateway.ts')
  const outcome = interceptToolCall({
    agent_id: 'a', session_id: 's', tool_name: 'push_files', tool_input: {},
    intent: 'push', scope: {}, constraints: {}, timestamp: '2026-06-02T00:00:00.000Z'
  })
  assert.equal(outcome.status, 'INTERCEPTED')
  assert.equal(outcome.observation.creates_authority, false)
  assert.equal(outcome.observation.creates_execution_eligibility, false)
})

test('issue #1627 interceptToolCall: CIP populates proposal_space not authority_space', async () => {
  const { interceptToolCall } = await import('../src/lib/agent-tool-gateway.ts')
  const outcome = interceptToolCall({
    agent_id: 'a', session_id: 's', tool_name: 'workflow_dispatch', tool_input: {},
    intent: 'trigger workflow', scope: {}, constraints: {}, timestamp: '2026-06-02T00:00:00.000Z'
  })
  assert.equal(outcome.status, 'INTERCEPTED')
  assert.equal(outcome.cip.proposal_space, 'populated')
  assert.equal(outcome.cip.authority_space, 'not_populated')
  assert.equal(outcome.cip.execution_space, 'not_populated')
})

test('issue #1627 GovernanceProposal creates_atao=false, creates_aeo=false', async () => {
  const { interceptToolCall } = await import('../src/lib/agent-tool-gateway.ts')
  const outcome = interceptToolCall({
    agent_id: 'a', session_id: 's', tool_name: 'create_issue', tool_input: {},
    intent: 'create issue', scope: {}, constraints: {}, timestamp: '2026-06-02T00:00:00.000Z'
  })
  assert.equal(outcome.status, 'INTERCEPTED')
  assert.equal(outcome.proposal.creates_atao, false)
  assert.equal(outcome.proposal.creates_aeo, false)
  assert.equal(outcome.proposal.proposal_status, 'PENDING_AUTHORITY_REVIEW')
})

test('issue #1627 checkOmegaValidatorBoundary: all conditions true → VALID', async () => {
  const { checkOmegaValidatorBoundary } = await import('../src/lib/agent-tool-gateway.ts')
  const result = checkOmegaValidatorBoundary({
    valid: true, authorized: true, unused: true,
    policy_valid: true, replay_safe: true, topology_visible: true, reconcilable: true
  })
  assert.equal(result, 'VALID')
})

test('issue #1627 checkOmegaValidatorBoundary: any false condition → NULL (fail-closed)', async () => {
  const { checkOmegaValidatorBoundary } = await import('../src/lib/agent-tool-gateway.ts')
  const base = { valid: true, authorized: true, unused: true, policy_valid: true, replay_safe: true, topology_visible: true, reconcilable: true }
  const keys = ['valid', 'authorized', 'unused', 'policy_valid', 'replay_safe', 'topology_visible', 'reconcilable']
  for (const key of keys) {
    const conditions = { ...base, [key]: false }
    assert.equal(checkOmegaValidatorBoundary(conditions), 'NULL', `Expected NULL when ${key}=false`)
  }
})

test('issue #1627 interceptToolCall missing tool_name → NULL', async () => {
  const { interceptToolCall } = await import('../src/lib/agent-tool-gateway.ts')
  const outcome = interceptToolCall({
    agent_id: 'a', session_id: 's', tool_name: '', tool_input: {},
    intent: 'do something', scope: {}, constraints: {}, timestamp: '2026-06-02T00:00:00.000Z'
  })
  assert.equal(outcome.status, 'NULL')
  assert.equal(outcome.non_operative, true)
})

test('issue #1627 interceptToolCall missing intent → NULL', async () => {
  const { interceptToolCall } = await import('../src/lib/agent-tool-gateway.ts')
  const outcome = interceptToolCall({
    agent_id: 'a', session_id: 's', tool_name: 'write_file', tool_input: {},
    intent: '', scope: {}, constraints: {}, timestamp: '2026-06-02T00:00:00.000Z'
  })
  assert.equal(outcome.status, 'NULL')
  assert.equal(outcome.non_operative, true)
})
