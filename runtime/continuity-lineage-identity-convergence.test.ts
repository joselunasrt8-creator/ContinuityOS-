import test from "node:test"
import assert from "node:assert/strict"
import { verifyContinuityLineage, type ContinuityNode, type SessionNode } from "../src/runtime/continuity/verifyContinuityLineage.ts"

const computeLineageHash = (lineage: ContinuityNode[]) => lineage.map((node) => node.continuity_id).join("->")

function makeInput(overrides?: Partial<{ session: SessionNode | null; continuity: ContinuityNode | null; continuityById: Map<string, ContinuityNode | ContinuityNode[]> }>) {
  const session: SessionNode = {
    session_id: "s-1",
    identity_id: "id-1",
    continuity_status: "ACTIVE",
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null,
  }
  const root: ContinuityNode = {
    continuity_id: "c-root",
    session_id: "s-1",
    identity_id: "id-1",
    parent_continuity_id: null,
    continuity_hash: "h-root",
    status: "ACTIVE",
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null,
  }
  const child: ContinuityNode = {
    continuity_id: "c-child",
    session_id: "s-1",
    identity_id: "id-1",
    parent_continuity_id: "c-root",
    continuity_hash: "h-child",
    status: "ACTIVE",
    expires_at: "2099-01-01T00:00:00.000Z",
    revoked_at: null,
  }
  return {
    now: new Date("2026-01-01T00:00:00.000Z"),
    session,
    continuity: child,
    continuityById: new Map<string, ContinuityNode | ContinuityNode[]>([["c-root", root]]),
    computeLineageHash,
    ...overrides,
  }
}

test("continuity lineage rejects missing identity on any node when session identity exists", () => {
  const input = makeInput()
  const parent = input.continuityById.get("c-root") as ContinuityNode
  parent.identity_id = ""

  const result = verifyContinuityLineage(input)
  assert.equal(result.ok, false)
  assert.equal(result.reason, "continuity_identity_mismatch")
})

test("continuity lineage rejects identity drift across ancestry", () => {
  const input = makeInput()
  const parent = input.continuityById.get("c-root") as ContinuityNode
  parent.identity_id = "id-2"

  const result = verifyContinuityLineage(input)
  assert.equal(result.ok, false)
  assert.equal(result.reason, "continuity_identity_mismatch")
})

test("continuity lineage remains valid when every lineage node identity converges", () => {
  const input = makeInput()
  const result = verifyContinuityLineage(input)

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.lineage_hash, "c-child->c-root")
  }
})
