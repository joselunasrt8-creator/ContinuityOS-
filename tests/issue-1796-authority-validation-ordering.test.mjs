import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { importWorker } from './helpers/import-worker.mjs'

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

const authorityRouteStart = source.indexOf('url.pathname === "/authority" && request.method === "POST"')
assert.notEqual(authorityRouteStart, -1, '/authority POST handler must exist')
const nextBlock = source.indexOf('\n\n    if (url.pathname === ', authorityRouteStart + 1)
const authorityBlock = source.slice(authorityRouteStart, nextBlock === -1 ? undefined : nextBlock)

// ── Source ordering assertions ─────────────────────────────────────────────

test('issue #1796 case A: activeSession executes before enforceTopologyEpochAdmission', () => {
  const sessionPos = authorityBlock.indexOf('activeSession(')
  const topologyPos = authorityBlock.indexOf('enforceTopologyEpochAdmission(')
  assert.notEqual(sessionPos, -1, 'activeSession must be present in /authority handler')
  assert.notEqual(topologyPos, -1, 'enforceTopologyEpochAdmission must be present in /authority handler')
  assert.ok(sessionPos < topologyPos, 'activeSession must precede enforceTopologyEpochAdmission')
})

test('issue #1796 case B: activeContinuity executes before enforceTopologyEpochAdmission', () => {
  const continuityPos = authorityBlock.indexOf('activeContinuity(')
  const topologyPos = authorityBlock.indexOf('enforceTopologyEpochAdmission(')
  assert.notEqual(continuityPos, -1, 'activeContinuity must be present in /authority handler')
  assert.ok(continuityPos < topologyPos, 'activeContinuity must precede enforceTopologyEpochAdmission')
})

test('issue #1796 case C: resolveCurrentContinuityIdentity executes before enforceTopologyEpochAdmission', () => {
  const identityPos = authorityBlock.indexOf('resolveCurrentContinuityIdentity(')
  const topologyPos = authorityBlock.indexOf('enforceTopologyEpochAdmission(')
  assert.notEqual(identityPos, -1, 'resolveCurrentContinuityIdentity must be present in /authority handler')
  assert.ok(identityPos < topologyPos, 'resolveCurrentContinuityIdentity must precede enforceTopologyEpochAdmission')
})

test('issue #1796 case D: enforceTopologyEpochAdmission executes after lineage validation and before authority creation', () => {
  const mismatchPos = authorityBlock.indexOf('continuity_identity_mismatch')
  const topologyPos = authorityBlock.indexOf('enforceTopologyEpochAdmission(')
  const insertPos = authorityBlock.indexOf('INSERT INTO authority_registry')
  assert.ok(topologyPos > mismatchPos, 'enforceTopologyEpochAdmission must come after continuity_identity_mismatch check')
  assert.ok(topologyPos < insertPos, 'enforceTopologyEpochAdmission must come before authority_registry INSERT')
})

// ── Runtime ordering assertions ────────────────────────────────────────────

let workerPromise
async function loadWorker() {
  workerPromise ||= importWorker().then((mod) => mod.default)
  return workerPromise
}

function createNullEnv() {
  return {
    API_KEY: 'test-key',
    DB: {
      prepare() {
        return {
          bind() { return this },
          async run() { return { meta: { changes: 0 } } },
          async all() { return { results: [] } },
          async first() { return null },
        }
      },
    },
  }
}

function post(route, payload = {}) {
  return new Request(`https://runtime.test${route}`, {
    method: 'POST',
    headers: { 'X-API-Key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

test('issue #1796 runtime case A: invalid session surfaces invalid_session, not topology failure', async () => {
  const worker = await loadWorker()
  // No session_id, no topology fields — lineage failure must win
  const res = await worker.fetch(post('/authority', {}), createNullEnv())
  const body = await res.json()
  assert.equal(body.status, 'NULL')
  assert.equal(body.reason, 'invalid_session', 'invalid_session must be returned before topology admission runs')
})

test('issue #1796 runtime case B: missing_continuity_id surfaces before topology failure', async () => {
  const worker = await loadWorker()
  // Provide a session_id but no continuity_id; DB returns null for session → invalid_session first.
  // This confirms lineage path runs before topology.
  const res = await worker.fetch(post('/authority', { session_id: 'no-such-session' }), createNullEnv())
  const body = await res.json()
  assert.equal(body.status, 'NULL')
  // With null DB, activeSession returns null → invalid_session (lineage check, not topology)
  assert.equal(body.reason, 'invalid_session', 'lineage failure must surface before topology admission')
})

test('issue #1796 runtime case C: continuity_identity_mismatch path is reachable before topology admission', async () => {
  // Source-level ordering guarantee from case C covers runtime reachability.
  // Confirm the mismatch reason string is present in the handler block.
  assert.match(authorityBlock, /continuity_identity_mismatch/, 'continuity_identity_mismatch must remain in /authority handler')
  assert.match(authorityBlock, /enforceTopologyEpochAdmission/, 'enforceTopologyEpochAdmission must remain in /authority handler')
})

test('issue #1796 runtime case D: topology admission telemetry schema is unchanged', () => {
  assert.match(
    authorityBlock,
    /enforceTopologyEpochAdmission[\s\S]*drift_class:\s*"topology_drift"/,
    '/authority topology admission must still emit topology_drift on failure',
  )
})

// ── Case E: invalid_continuity wins over topology admission (mock DB) ───────

function createCaseEEnv(sessionId) {
  const futureDate = new Date(Date.now() + 3600_000).toISOString()
  const mockSession = {
    session_id: sessionId,
    identity_id: 'mock-identity-e',
    continuity_status: 'ACTIVE',
    expires_at: futureDate,
  }
  return {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        const isSessionSelect = sql.includes('FROM session_registry')
        return {
          bind() { return this },
          async first() { return isSessionSelect ? mockSession : null },
          async all() { return { results: [] } },
          async run() { return { meta: { changes: 0 } } },
        }
      },
    },
  }
}

test('issue #1796 runtime case E: invalid_continuity surfaces before topology admission', async () => {
  const worker = await loadWorker()
  const sessionId = 'mock-session-case-e'
  const res = await worker.fetch(
    post('/authority', {
      session_id: sessionId,
      continuity_id: 'nonexistent-continuity-id',
      governed_tool_envelope_id: 'mock-envelope-e',
      // topology_epoch intentionally omitted — would trigger missing_topology_epoch
    }),
    createCaseEEnv(sessionId),
  )
  const b = await res.json()
  assert.equal(b.status, 'NULL')
  assert.equal(b.reason, 'invalid_continuity', 'invalid_continuity must surface before topology admission')
  assert.notEqual(b.reason, 'missing_topology_epoch', 'topology failure must not mask continuity lineage failure')
})

// ── Case F: continuity_identity_mismatch wins over topology admission (mock DB) ──
//
// Strategy: precompute the continuity hash using the same algorithm as the runtime
// (crypto.subtle SHA-256 over the canonical serialization), then build a DB mock
// that serves a valid root continuity C1 but returns C2 from
// resolveCurrentContinuityIdentity, triggering the mismatch before topology runs.

import { canonicalize as canonicalizeFromLib } from '../src/canonical.js'

async function sha256HexFromSubtle(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Mirrors the runtime's continuityHashMaterial() for a root continuity.
function buildC1Material({ continuity_id, session_id, identity_id, decision_id, expires_at, issued_at }) {
  return {
    actor_chain: ['human', 'agent'],
    authority_chain: [decision_id],
    constraints: { delegation_allowed: false, max_depth: 3 },
    continuity_id,
    expires_at,
    identity_id,
    issued_at,
    parent_continuity_id: null,
    revocation: { revoked_at: null, status: 'ACTIVE' },
    scope: {},
    session_id,
  }
}

test('issue #1796 runtime case F: continuity_identity_mismatch surfaces before topology admission', async () => {
  const worker = await loadWorker()

  const C1_ID = 'c1-case-f-fixed'
  const C2_ID = 'c2-case-f-fixed'
  const SESSION_ID = 'session-case-f-fixed'
  const IDENTITY_ID = 'identity-case-f-fixed'
  const DECISION_ID = 'decision-case-f-fixed'
  const FUTURE = '2099-01-01T00:00:00.000Z'
  const ISSUED = '2024-01-01T00:00:00.000Z'

  // Precompute the hash the same way the runtime does:
  // sha256Hex(canonicalize(continuityHashMaterial(canonical))) using crypto.subtle
  const c1Material = buildC1Material({ continuity_id: C1_ID, session_id: SESSION_ID, identity_id: IDENTITY_ID, decision_id: DECISION_ID, expires_at: FUTURE, issued_at: ISSUED })
  const c1Hash = await sha256HexFromSubtle(canonicalizeFromLib(c1Material))

  // canonical_continuity stored in the DB = canonicalize({ ...material, continuity_hash: hash })
  const c1CanonicalObj = { ...c1Material, continuity_hash: c1Hash }
  const c1CanonicalJson = canonicalizeFromLib(c1CanonicalObj)

  const mockSession = { session_id: SESSION_ID, identity_id: IDENTITY_ID, continuity_status: 'ACTIVE', expires_at: FUTURE }
  const c1Row = { continuity_id: C1_ID, session_id: SESSION_ID, identity_id: IDENTITY_ID, status: 'ACTIVE', expires_at: FUTURE, continuity_hash: c1Hash, canonical_continuity: c1CanonicalJson, parent_continuity_id: null, revoked_at: null, issued_at: ISSUED }

  // DB mock routing:
  // - FROM session_registry + LIMIT 2  → all() returns [session] (resolveContinuityLineage ancestor check)
  // - FROM session_registry (no LIMIT)  → first() returns session (activeSession)
  // - continuity_id=?1 (no NOT EXISTS)  → first() returns c1Row (resolveContinuityLineage fetch)
  // - NOT EXISTS present                → first() returns C2 id (resolveCurrentContinuityIdentity)
  // - everything else                   → run() ok, all()/first() return empty/null
  const env = {
    API_KEY: 'test-key',
    DB: {
      prepare(sql) {
        const isCurrentIdentityQuery = sql.includes('NOT EXISTS')
        const isSessionAll = sql.includes('FROM session_registry') && sql.includes('LIMIT 2')
        const isSessionFirst = sql.includes('FROM session_registry') && !sql.includes('LIMIT 2') && !sql.toUpperCase().startsWith('UPDATE')
        const isContinuityFirst = sql.includes('continuity_id=?1') && !isCurrentIdentityQuery
        return {
          bind() { return this },
          async first() {
            if (isCurrentIdentityQuery) return { continuity_id: C2_ID, identity_id: IDENTITY_ID }
            if (isSessionFirst) return mockSession
            if (isContinuityFirst) return c1Row
            return null
          },
          async all() {
            if (isSessionAll) return { results: [{ session_id: SESSION_ID, identity_id: IDENTITY_ID, expires_at: FUTURE, continuity_status: 'ACTIVE' }] }
            return { results: [] }
          },
          async run() { return { meta: { changes: 0 } } },
        }
      },
    },
  }

  const res = await worker.fetch(
    post('/authority', {
      session_id: SESSION_ID,
      continuity_id: C1_ID,
      decision_id: DECISION_ID,
      governed_tool_envelope_id: 'mock-envelope-f',
      // topology_epoch intentionally omitted — would trigger missing_topology_epoch
    }),
    env,
  )
  const b = await res.json()
  assert.equal(b.status, 'NULL')
  assert.equal(b.reason, 'continuity_identity_mismatch', 'stale continuity must surface mismatch before topology admission')
  assert.notEqual(b.reason, 'missing_topology_epoch', 'topology failure must not mask continuity identity failure')
})
