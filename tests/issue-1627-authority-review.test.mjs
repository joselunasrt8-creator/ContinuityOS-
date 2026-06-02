import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from './helpers/import-worker.mjs'

const authorityReviewLib = readFileSync(new URL('../src/lib/authority-review.ts', import.meta.url), 'utf8')
const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../migrations/0066_authority_review_gateway.sql', import.meta.url), 'utf8')

// ── Static source analysis — Authority Boundary Definition ────────────────

test('authority-review lib defines AuthorityReviewArtifact as discriminated union (APPROVED | REJECTED)', () => {
  assert.match(authorityReviewLib, /ApprovedAuthorityReviewArtifact/)
  assert.match(authorityReviewLib, /RejectedAuthorityReviewArtifact/)
  assert.match(authorityReviewLib, /AuthorityReviewArtifact.*=.*ApprovedAuthorityReviewArtifact.*\|.*RejectedAuthorityReviewArtifact/)
})

// Single ATAO primitive — no "GatewayATAO" variant
test('authority-review lib defines AgentToolATAO as the single canonical ATAO type (no GatewayATAO)', () => {
  assert.match(authorityReviewLib, /AgentToolATAO/)
  assert.doesNotMatch(authorityReviewLib, /GatewayATAO/)
  assert.match(authorityReviewLib, /atao_status.*FORMED/)
})

// ATAO Ownership Model — review_id is required lineage field
test('authority-review lib: AgentToolATAO carries review_id as required authority lineage field', () => {
  assert.match(authorityReviewLib, /readonly review_id: string/)
  assert.match(authorityReviewLib, /readonly proposal_id: string/)
  assert.match(authorityReviewLib, /readonly observation_id: string/)
})

// Authority Review Artifact exports
test('authority-review lib exports conductAuthorityReview as the authority review entry point', () => {
  assert.match(authorityReviewLib, /export function conductAuthorityReview/)
})

test('authority-review lib exports formAuthorityReviewArtifact and formAgentToolATAO', () => {
  assert.match(authorityReviewLib, /export function formAuthorityReviewArtifact/)
  assert.match(authorityReviewLib, /export function formAgentToolATAO/)
})

// ATAO Formation Requirements — type-enforced: only APPROVED review can form ATAO
test('authority-review lib: formAgentToolATAO parameter requires ApprovedAuthorityReviewArtifact (type-enforced)', () => {
  assert.match(authorityReviewLib, /function formAgentToolATAO\s*\([\s\S]{0,80}ApprovedAuthorityReviewArtifact/)
})

// Verify ATAO not creatable by gateway, CIP, observation, proposal registry
test('authority-review lib does not import from agent-tool-gateway (no dependency collapse)', () => {
  assert.doesNotMatch(authorityReviewLib, /import.*from.*agent-tool-gateway/)
})

test('authority-review lib: REJECTED review creates_atao typed false; APPROVED typed true', () => {
  assert.match(authorityReviewLib, /RejectedAuthorityReviewArtifact[\s\S]{0,400}creates_atao.*false/)
  assert.match(authorityReviewLib, /ApprovedAuthorityReviewArtifact[\s\S]{0,400}creates_atao.*true/)
})

// Topology Validation — migration schema

test('migration creates authority_review_registry (append-only)', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS authority_review_registry/)
  assert.match(migration, /authority_review_registry_append_only_update/)
  assert.match(migration, /authority_review_registry_append_only_delete/)
})

test('migration creates agent_tool_atao_registry — single canonical ATAO registry, no gateway prefix', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS agent_tool_atao_registry/)
  assert.doesNotMatch(migration, /agent_tool_gateway_atao_registry/)
  assert.match(migration, /agent_tool_atao_registry_append_only_update/)
  assert.match(migration, /agent_tool_atao_registry_append_only_delete/)
})

test('migration: authority_review_registry CHECK enforces creates_atao semantics', () => {
  assert.match(migration, /review_decision.*=.*'APPROVED'.*AND.*creates_atao.*=.*1/)
  assert.match(migration, /review_decision.*=.*'REJECTED'.*AND.*creates_atao.*=.*0/)
})

test('migration: agent_tool_atao_registry requires review_id FK to authority_review_registry', () => {
  assert.match(migration, /FOREIGN KEY \(review_id\) REFERENCES authority_review_registry\(review_id\)/)
})

test('migration: agent_tool_atao_registry requires proposal_id FK to agent_tool_proposal_registry', () => {
  assert.match(migration, /FOREIGN KEY \(proposal_id\) REFERENCES agent_tool_proposal_registry\(proposal_id\)/)
})

test('migration: agent_tool_atao_registry atao_status CHECK constraint (FORMED only)', () => {
  assert.match(migration, /atao_status TEXT NOT NULL CHECK \(atao_status IN \('FORMED'\)\)/)
})

// index.ts wiring
test('index.ts imports conductAuthorityReview and AgentToolATAO from authority-review', () => {
  assert.match(source, /from.*["']\.\/lib\/authority-review/)
  assert.match(source, /conductAuthorityReview/)
  assert.match(source, /AgentToolATAO/)
})

test('index.ts declares AGENT_TOOL_GATEWAY_AUTHORITY_REVIEW_ROUTE and AGENT_TOOL_GATEWAY_ATAO_ROUTE', () => {
  assert.match(source, /AGENT_TOOL_GATEWAY_AUTHORITY_REVIEW_ROUTE.*=.*"\/gateway\/authority\/review"/)
  assert.match(source, /AGENT_TOOL_GATEWAY_ATAO_ROUTE.*=.*"\/gateway\/authority\/atao"/)
})

test('index.ts uses agent_tool_atao_registry (not gateway_atao_registry)', () => {
  assert.match(source, /agent_tool_atao_registry/)
  assert.doesNotMatch(source, /agent_tool_gateway_atao_registry/)
})

test('index.ts wires authority review route as POST with auth', () => {
  assert.match(source, /agentToolGatewayAuthorityReviewRoute.*&&.*request\.method.*"POST"/)
  assert.match(source, /handleAgentToolGatewayAuthorityReview/)
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

function makeEnv(opts = {}) {
  const hasProposal = opts.hasProposal !== false
  return {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        return {
          bind(..._params) { return this },
          async first() {
            if (sql.includes('agent_tool_proposal_registry') && sql.includes('PENDING_AUTHORITY_REVIEW')) {
              return hasProposal ? {
                proposal_id: 'proposal:cip:obs:agent-1:2026-06-02T00:00:00.000Z:abc123',
                cip_id: 'cip:obs:agent-1:2026-06-02T00:00:00.000Z:abc123',
                observation_id: 'obs:gateway:create_issue:agent-1:2026-06-02T00:00:00.000Z',
                observation_hash: 'abc123',
                agent_id: 'agent-1',
                session_id: 'session-1',
                framework: 'langchain',
                tool_name: 'create_issue',
                tool_system: 'github',
                risk_class: 'P2',
                intent: 'create a github issue',
                scope: '{"repo":"owner/repo"}',
                constraints: '{}',
                requires_authority_binding: 1,
              } : null
            }
            if (sql.includes('agent_tool_atao_registry')) {
              return opts.ataoRow || null
            }
            return null
          },
          async run() { return { meta: { changes: 1 } } },
          async all() { return { results: [] } }
        }
      },
      async batch(stmts) { return stmts.map(() => ({ meta: { changes: 1 } })) }
    }
  }
}

// CORE: Proposal → APPROVED → ATAO formed (the only permitted path)
test('CORE: Proposal → APPROVED authority review → ATAO formed', async () => {
  const worker = await getWorker()
  const res = await worker.fetch(post('/gateway/authority/review', {
    proposal_id: 'proposal:cip:obs:agent-1:2026-06-02T00:00:00.000Z:abc123',
    observation_id: 'obs:gateway:create_issue:agent-1:2026-06-02T00:00:00.000Z',
    observation_hash: 'abc123',
    reviewer_id: 'authority-reviewer-1',
    review_decision: 'APPROVED',
    review_rationale: 'issue creation is policy-compliant',
  }), makeEnv())
  const data = await res.json()
  assert.equal(data.status, 'APPROVED')
  assert.equal(data.review_decision, 'APPROVED')
  assert.ok(data.review_id, 'review_id must be present')
  assert.ok(data.atao_id, 'atao_id must be present on APPROVED')
  assert.equal(data.atao_status, 'FORMED')
  assert.ok(data.review_lineage, 'review_lineage must be present')
  assert.equal(data.review_lineage.review_id, data.review_id)
})

// CORE: Proposal → REJECTED → no ATAO (Proposal ≠ Permission)
test('CORE: Proposal → REJECTED authority review → no ATAO', async () => {
  const worker = await getWorker()
  const res = await worker.fetch(post('/gateway/authority/review', {
    proposal_id: 'proposal:cip:obs:agent-1:2026-06-02T00:00:00.000Z:abc123',
    observation_id: 'obs:gateway:create_issue:agent-1:2026-06-02T00:00:00.000Z',
    observation_hash: 'abc123',
    reviewer_id: 'authority-reviewer-1',
    review_decision: 'REJECTED',
    review_rationale: 'not authorized in this session',
  }), makeEnv())
  const data = await res.json()
  assert.equal(data.status, 'REJECTED')
  assert.equal(data.atao_id, null)
  assert.equal(data.creates_atao, false)
})

// No proposal → NULL (no bypass path to ATAO)
test('authority review without existing proposal → NULL (no ATAO without proposal lineage)', async () => {
  const worker = await getWorker()
  const res = await worker.fetch(post('/gateway/authority/review', {
    proposal_id: 'nonexistent',
    observation_id: 'obs-id',
    observation_hash: 'hash',
    reviewer_id: 'reviewer-1',
    review_decision: 'APPROVED',
    review_rationale: 'rationale',
  }), makeEnv({ hasProposal: false }))
  const data = await res.json()
  assert.equal(data.status, 'NULL')
  assert.equal(data.reason, 'proposal_not_found')
})

// Missing reviewer_id → NULL
test('authority review missing reviewer_id → NULL', async () => {
  const worker = await getWorker()
  const res = await worker.fetch(post('/gateway/authority/review', {
    proposal_id: 'proposal:cip:obs:agent-1:2026-06-02T00:00:00.000Z:abc123',
    observation_id: 'obs:gateway:create_issue:agent-1:2026-06-02T00:00:00.000Z',
    observation_hash: 'abc123',
    review_decision: 'APPROVED',
    review_rationale: 'rationale',
  }), makeEnv())
  const data = await res.json()
  assert.equal(data.status, 'NULL')
  assert.equal(data.reason, 'missing_reviewer_id')
})

// Invalid decision → NULL
test('authority review with invalid review_decision → NULL', async () => {
  const worker = await getWorker()
  const res = await worker.fetch(post('/gateway/authority/review', {
    proposal_id: 'proposal:cip:obs:agent-1:2026-06-02T00:00:00.000Z:abc123',
    observation_id: 'obs:gateway:create_issue:agent-1:2026-06-02T00:00:00.000Z',
    observation_hash: 'abc123',
    reviewer_id: 'reviewer-1',
    review_decision: 'MAYBE',
    review_rationale: 'rationale',
  }), makeEnv())
  const data = await res.json()
  assert.equal(data.status, 'NULL')
  assert.equal(data.reason, 'invalid_review_decision')
})

// Unauthorized → 403
test('/gateway/authority/review requires auth — 403 without API key', async () => {
  const worker = await getWorker()
  const res = await worker.fetch(new Request('https://runtime.test/gateway/authority/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ proposal_id: 'p', observation_id: 'o', observation_hash: 'h', reviewer_id: 'r', review_decision: 'APPROVED', review_rationale: 'r' })
  }), makeEnv())
  assert.equal(res.status, 403)
})

// ── Unit tests for authority-review library ────────────────────────────────

test('conductAuthorityReview: APPROVED → review (creates_atao=true) + ATAO (atao_status=FORMED)', async () => {
  const { conductAuthorityReview } = await import('../src/lib/authority-review.ts')
  const proposal = {
    proposal_id: 'p-1', cip_id: 'cip-1', observation_id: 'obs-1', observation_hash: 'hash-1',
    agent_id: 'agent-1', session_id: 'session-1', framework: 'langchain',
    tool_name: 'create_issue', tool_system: 'github', risk_class: 'P2',
    intent: 'create an issue', scope: { repo: 'r/r' }, constraints: {}, requires_authority_binding: true,
  }
  const outcome = conductAuthorityReview({ proposal, reviewer_id: 'reviewer-1', review_decision: 'APPROVED', review_rationale: 'approved', timestamp: '2026-06-02T00:00:00.000Z' })
  assert.equal(outcome.status, 'APPROVED')
  assert.equal(outcome.review.creates_atao, true)
  assert.ok(outcome.atao)
  assert.equal(outcome.atao.atao_status, 'FORMED')
  assert.equal(outcome.atao.review_id, outcome.review.review_id)
  assert.ok(outcome.atao.atao_id.startsWith('atao:'))
})

test('conductAuthorityReview: REJECTED → review (creates_atao=false) + atao=null', async () => {
  const { conductAuthorityReview } = await import('../src/lib/authority-review.ts')
  const proposal = {
    proposal_id: 'p-2', cip_id: 'cip-2', observation_id: 'obs-2', observation_hash: 'hash-2',
    agent_id: 'agent-1', session_id: 'session-1', framework: 'langchain',
    tool_name: 'terminal_command', tool_system: 'shell', risk_class: 'P3',
    intent: 'run command', scope: {}, constraints: {}, requires_authority_binding: true,
  }
  const outcome = conductAuthorityReview({ proposal, reviewer_id: 'reviewer-1', review_decision: 'REJECTED', review_rationale: 'shell not authorized', timestamp: '2026-06-02T00:00:00.000Z' })
  assert.equal(outcome.status, 'REJECTED')
  assert.equal(outcome.atao, null)
  assert.equal(outcome.review.creates_atao, false)
})

test('conductAuthorityReview: ATAO carries review_id, proposal_id, observation_id (lineage preserved)', async () => {
  const { conductAuthorityReview } = await import('../src/lib/authority-review.ts')
  const proposal = {
    proposal_id: 'p-4', cip_id: 'cip-4', observation_id: 'obs-4', observation_hash: 'hash-4',
    agent_id: 'agent-1', session_id: 'session-1', framework: 'langchain',
    tool_name: 'push_files', tool_system: 'github', risk_class: 'P2',
    intent: 'push', scope: {}, constraints: {}, requires_authority_binding: true,
  }
  const outcome = conductAuthorityReview({ proposal, reviewer_id: 'reviewer-1', review_decision: 'APPROVED', review_rationale: 'ok', timestamp: '2026-06-02T00:00:00.000Z' })
  assert.equal(outcome.status, 'APPROVED')
  assert.equal(outcome.atao.review_id, outcome.review.review_id)
  assert.equal(outcome.atao.proposal_id, 'p-4')
  assert.equal(outcome.atao.observation_id, 'obs-4')
  assert.equal(outcome.atao.observation_hash, 'hash-4')
})

test('conductAuthorityReview: missing reviewer_id → NULL', async () => {
  const { conductAuthorityReview } = await import('../src/lib/authority-review.ts')
  const proposal = { proposal_id: 'p', cip_id: 'c', observation_id: 'o', observation_hash: 'h', agent_id: 'a', session_id: 's', framework: 'langchain', tool_name: 't', tool_system: 'github', risk_class: 'P1', intent: 'i', scope: {}, constraints: {}, requires_authority_binding: false }
  const outcome = conductAuthorityReview({ proposal, reviewer_id: '', review_decision: 'APPROVED', review_rationale: 'r', timestamp: '2026-06-02T00:00:00.000Z' })
  assert.equal(outcome.status, 'NULL')
  assert.equal(outcome.reason, 'missing_reviewer_id')
})

test('conductAuthorityReview: invalid review_decision → NULL', async () => {
  const { conductAuthorityReview } = await import('../src/lib/authority-review.ts')
  const proposal = { proposal_id: 'p', cip_id: 'c', observation_id: 'o', observation_hash: 'h', agent_id: 'a', session_id: 's', framework: 'langchain', tool_name: 't', tool_system: 'github', risk_class: 'P1', intent: 'i', scope: {}, constraints: {}, requires_authority_binding: false }
  const outcome = conductAuthorityReview({ proposal, reviewer_id: 'r', review_decision: 'UNKNOWN', review_rationale: 'r', timestamp: '2026-06-02T00:00:00.000Z' })
  assert.equal(outcome.status, 'NULL')
  assert.equal(outcome.reason, 'invalid_review_decision')
})

// formAgentToolATAO type-safety: produces canonical ATAO with correct shape
test('formAgentToolATAO with APPROVED review produces canonical AgentToolATAO', async () => {
  const { formAuthorityReviewArtifact, formAgentToolATAO } = await import('../src/lib/authority-review.ts')
  const proposal = {
    proposal_id: 'p-5', cip_id: 'cip-5', observation_id: 'obs-5', observation_hash: 'hash-5',
    agent_id: 'a', session_id: 's', framework: 'langchain',
    tool_name: 'deploy_action', tool_system: 'deploy', risk_class: 'P3',
    intent: 'deploy', scope: { env: 'prod' }, constraints: {}, requires_authority_binding: true,
  }
  const review = formAuthorityReviewArtifact({ proposal, reviewer_id: 'senior-reviewer', review_decision: 'APPROVED', review_rationale: 'approved', created_at: '2026-06-02T12:00:00.000Z' })
  assert.equal(review.review_decision, 'APPROVED')
  const atao = formAgentToolATAO(review, proposal)
  // Canonical ATAO shape — no "class" prefix, no "Gateway" prefix
  assert.ok(atao.atao_id.startsWith('atao:'))
  assert.equal(atao.atao_status, 'FORMED')
  assert.equal(atao.tool_name, 'deploy_action')
  assert.equal(atao.tool_system, 'deploy')
  assert.equal(atao.risk_class, 'P3')
  assert.equal(atao.review_id, review.review_id)
  assert.equal(atao.framework, 'langchain')
})
