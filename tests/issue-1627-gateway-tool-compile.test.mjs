import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from './helpers/import-worker.mjs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

function baseTemplate(surface_type, status = 'ACTIVE', risk_floor = 'P2_BOUNDED_MUTATION') {
  return {
    template_id: `${surface_type}_v1`,
    schema_version: '1.0',
    surface_type,
    status,
    risk_floor,
    required_scope_fields: '[]',
    required_target_fields: '[]',
    required_validation_fields: '[]',
    required_finality_fields: '[]',
    predicate_set: '[]',
    failure_result: 'NULL',
    created_at: '2026-06-02T00:00:00.000Z',
  }
}

function makeRows(overrides = {}) {
  const scope = { allowed_paths: ['/workspace/demo.txt'], create_overwrite_policy: 'overwrite' }
  const constraints = { target: { exact_path: '/workspace/demo.txt', exact_content_hash: 'sha256:abc' } }
  const atao = {
    atao_id: 'atao-filesystem-write-1',
    review_id: 'review-approved-1',
    proposal_id: 'proposal-1',
    observation_id: 'observation-1',
    observation_hash: 'observation-hash-1',
    agent_id: 'agent-1',
    session_id: 'session-1',
    framework: 'langchain',
    tool_name: 'filesystem_write',
    tool_system: 'filesystem',
    risk_class: 'P2',
    intent: 'write bounded file',
    scope: JSON.stringify(scope),
    constraints: JSON.stringify(constraints),
    atao_status: 'FORMED',
    created_at: '2026-06-03T00:00:00.000Z',
  }
  const review = {
    review_id: 'review-approved-1',
    proposal_id: 'proposal-1',
    observation_id: 'observation-1',
    observation_hash: 'observation-hash-1',
    agent_id: 'agent-1',
    session_id: 'session-1',
    tool_name: 'filesystem_write',
    tool_system: 'filesystem',
    risk_class: 'P2',
    reviewer_id: 'reviewer-1',
    review_decision: 'APPROVED',
    review_rationale: 'bounded write approved',
    creates_atao: 1,
    created_at: '2026-06-03T00:00:00.000Z',
  }
  const authority = {
    authority_id: 'authority-1',
    decision_id: 'decision-1',
    session_id: 'session-1',
    owner: 'human-origin',
    intent: 'write bounded file',
    scope: JSON.stringify(scope),
    constraints: JSON.stringify(constraints),
    expiry: '2099-01-01T00:00:00.000Z',
    status: 'ACTIVE',
    created_at: '2026-06-03T00:00:00.000Z',
  }
  return {
    ataos: [atao],
    reviews: [review],
    authorities: [authority],
    templates: [
      baseTemplate('filesystem_write', 'ACTIVE', 'P2_BOUNDED_MUTATION'),
      baseTemplate('shell_exec', 'DRAFT', 'P4_PRIVILEGED_EXECUTION'),
    ],
    aeos: [],
    executions: [],
    proofs: [],
    ...overrides,
  }
}

function makeDB(rows = makeRows()) {
  return {
    rows,
    prepare(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      return {
        bind(...params) {
          return {
            async first() {
              if (normalized.includes('from agent_tool_atao_registry')) {
                return rows.ataos.find((r) => r.atao_id === params[0] && (!normalized.includes("atao_status='formed'") || r.atao_status === 'FORMED')) ?? null
              }
              if (normalized.includes('from authority_review_registry')) {
                return rows.reviews.find((r) => r.review_id === params[0] && r.proposal_id === params[1] && r.observation_id === params[2] && r.observation_hash === params[3]) ?? null
              }
              if (normalized.includes('from authority_registry')) {
                return rows.authorities.find((r) => r.decision_id === params[0]) ?? null
              }
              if (normalized.includes('from aeo_template_registry')) {
                return rows.templates.find((r) => r.surface_type === params[0]) ?? null
              }
              if (normalized.includes('from proof_registry')) return rows.proofs[0] ?? null
              if (normalized.includes('from execution_registry')) return rows.executions[0] ?? null
              return null
            },
            async all() {
              if (normalized.includes('from aeo_registry')) {
                return { results: rows.aeos.filter((r) => r.decision_id === params[0]) }
              }
              return { results: [] }
            },
            async run() {
              if (normalized.startsWith('insert into aeo_registry')) {
                rows.aeos.push({
                  aeo_id: params[0],
                  authority_id: params[1],
                  decision_id: params[2],
                  canonical_aeo: params[3],
                  validated_object_hash: params[4],
                  status: 'COMPILED',
                  created_at: params[5],
                })
                return { meta: { changes: 1 } }
              }
              return { meta: { changes: 0 } }
            },
          }
        },
        async run() { return { meta: { changes: 0 } } },
      }
    },
  }
}

function post(body) {
  return new Request('https://runtime.test/gateway/tool/compile', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-API-Key': 'test-key' },
    body: JSON.stringify(body),
  })
}

async function compile(rows, body = {}) {
  const worker = await importWorker()
  const db = makeDB(rows)
  const res = await worker.default.fetch(post({ atao_id: 'atao-filesystem-write-1', authority_decision_id: 'decision-1', ...body }), { DB: db, API_KEY: 'test-key' })
  return { status: res.status, json: await res.json(), rows }
}

test('index.ts declares and dispatches POST /gateway/tool/compile as a gateway mutation route', () => {
  assert.match(source, /AGENT_TOOL_GATEWAY_COMPILE_ROUTE\s*=\s*"\/gateway\/tool\/compile"/)
  assert.match(source, /handleAgentToolGatewayCompile/)
  assert.match(source, /agentToolGatewayCompileRoute.*request\.method === "POST"/s)
})

test('filesystem_write ATAO compiles into canonical AEO with scope.surface_type=filesystem_write', async () => {
  const rows = makeRows()
  const { json } = await compile(rows)
  assert.equal(json.status, 'COMPILED')
  assert.equal(json.result, 'OK')
  assert.equal(json.canonical_aeo.scope.surface_type, 'filesystem_write')
  assert.deepEqual(Object.keys(json.canonical_aeo).sort(), ['finality', 'intent', 'scope', 'target', 'validation'])
  assert.equal(rows.aeos.length, 1)
})

test('shell_exec ATAO fails closed because template is DRAFT / SCHEMA_INACTIVE', async () => {
  const rows = makeRows({})
  rows.ataos[0] = { ...rows.ataos[0], tool_name: 'shell_exec', tool_system: 'shell', risk_class: 'P3' }
  rows.reviews[0] = { ...rows.reviews[0], tool_name: 'shell_exec', tool_system: 'shell', risk_class: 'P3' }
  const { json } = await compile(rows)
  assert.equal(json.status, 'NULL')
  assert.equal(json.reason, 'schema_inactive')
  assert.equal(json.aeo_template_reason, 'SCHEMA_INACTIVE')
  assert.equal(rows.aeos.length, 0)
})

test('unknown surface fails NULL', async () => {
  const rows = makeRows({})
  rows.ataos[0] = { ...rows.ataos[0], tool_name: 'database_update', tool_system: 'database' }
  const { json } = await compile(rows)
  assert.equal(json.status, 'NULL')
  assert.equal(json.reason, 'unknown_surface_type')
  assert.equal(rows.aeos.length, 0)
})

test('unapproved authority review fails NULL', async () => {
  const rows = makeRows({})
  rows.reviews[0] = { ...rows.reviews[0], review_decision: 'REJECTED', creates_atao: 0 }
  const { json } = await compile(rows)
  assert.equal(json.status, 'NULL')
  assert.equal(json.reason, 'authority_review_not_approved')
  assert.equal(rows.aeos.length, 0)
})

test('caller cannot inject surface_type', async () => {
  const rows = makeRows()
  const { json } = await compile(rows, { surface_type: 'shell_exec', scope: { surface_type: 'shell_exec' } })
  assert.equal(json.status, 'COMPILED')
  assert.equal(json.canonical_aeo.scope.surface_type, 'filesystem_write')
})

test('compiled AEO hash is deterministic and duplicate compile reuses the existing canonical hash', async () => {
  const rows = makeRows()
  const first = await compile(rows)
  const second = await compile(rows)
  assert.equal(first.json.status, 'COMPILED')
  assert.equal(second.json.status, 'COMPILED')
  assert.equal(second.json.existing, true)
  assert.equal(first.json.validated_object_hash, second.json.validated_object_hash)
  assert.equal(rows.aeos.length, 1)
})

test('hash mismatch fails closed', async () => {
  const rows = makeRows()
  const { json } = await compile(rows, { validated_object_hash: 'sha256:not-the-canonical-aeo' })
  assert.equal(json.status, 'NULL')
  assert.equal(json.reason, 'hash_mismatch')
  assert.equal(rows.aeos.length, 0)
})

test('gateway compile does not create proof or execution rows', async () => {
  const rows = makeRows()
  const { json } = await compile(rows)
  assert.equal(json.status, 'COMPILED')
  assert.equal(rows.proofs.length, 0)
  assert.equal(rows.executions.length, 0)
  assert.equal(json.executes, false)
  assert.equal(json.proof_created, false)
})
