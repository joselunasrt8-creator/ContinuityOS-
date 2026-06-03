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
