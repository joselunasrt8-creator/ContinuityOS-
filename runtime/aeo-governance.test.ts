import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { canonicalize, toCanonicalAeo } from "../src/lib/aeo-governance.ts"

const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex")

test("missing required AEO field returns NULL-equivalent", () => {
  const aeo = toCanonicalAeo({
    intent: "deploy",
    scope: { repo: "a" },
    validation: { workflow: "governed-deploy.yml" },
    target: { repo: "a", branch: "main", workflow: "governed-deploy.yml" }
  })
  assert.equal(aeo, null)
})

test("extra AEO field returns NULL-equivalent", () => {
  const aeo = toCanonicalAeo({
    intent: "deploy",
    scope: { repo: "a" },
    validation: { workflow: "governed-deploy.yml" },
    target: { repo: "a", branch: "main", workflow: "governed-deploy.yml" },
    finality: { proof_required: true },
    unexpected: true
  })
  assert.equal(aeo, null)
})

test("canonical hashing is deterministic across field order and detects drift", () => {
  const aeoA = toCanonicalAeo({
    intent: "deploy",
    scope: { z: 1, a: 2 },
    validation: { workflow: "governed-deploy.yml" },
    target: { branch: "main", repo: "mindshift-demo", workflow: "governed-deploy.yml" },
    finality: { proof_required: true }
  })
  const aeoB = toCanonicalAeo({
    finality: { proof_required: true },
    target: { workflow: "governed-deploy.yml", repo: "mindshift-demo", branch: "main" },
    validation: { workflow: "governed-deploy.yml" },
    scope: { a: 2, z: 1 },
    intent: "deploy"
  })

  assert.ok(aeoA)
  assert.ok(aeoB)
  const hashA = sha256Hex(canonicalize(aeoA))
  const hashB = sha256Hex(canonicalize(aeoB))
  assert.equal(hashA, hashB)

  const drifted = { ...aeoA, intent: "rollback" }
  const driftHash = sha256Hex(canonicalize(drifted))
  assert.notEqual(hashA, driftHash)
})
