import assert from "node:assert/strict"
import test from "node:test"

import {
  compile,
  validate,
  execute,
  proofLineage,
  inspectAuthority,
  inspectTopology,
  reconcile,
  hashCanonical,
  normalize,
} from "../cli/sdk/index.mjs"

// ── Compile ──────────────────────────────────────────────────────────────────

test("compile: produces CompiledLegitimacyObject with canonical_hash", () => {
  const obj = { intent: "test", scope: { env: "test" }, target: { action: "noop" }, finality: { proof_required: false } }
  const compiled = compile(obj)

  assert.equal(compiled.object_type, "CompiledLegitimacyObject")
  assert.ok(compiled.canonical_hash, "canonical_hash must be present")
  assert.match(compiled.canonical_hash, /^[a-f0-9]{64}$/, "canonical_hash must be sha256 hex")
  assert.equal(compiled.executed, false)
  assert.equal(compiled.validated, false)
  assert.equal(compiled.replay_safe, true)
  assert.equal(compiled.mutation_locked, true)
})

test("compile: hash is deterministic for same input", () => {
  const obj = { intent: "x", scope: { a: 1 }, target: { b: 2 }, finality: { proof_required: false } }
  const c1 = compile(obj)
  const c2 = compile(obj)
  assert.equal(c1.canonical_hash, c2.canonical_hash)
})

test("compile: key ordering does not affect hash", () => {
  const obj1 = { intent: "x", scope: { a: 1 }, target: { b: 2 }, finality: { proof_required: false } }
  const obj2 = { finality: { proof_required: false }, target: { b: 2 }, scope: { a: 1 }, intent: "x" }
  const c1 = compile(obj1)
  const c2 = compile(obj2)
  assert.equal(c1.canonical_hash, c2.canonical_hash, "canonical form must be order-independent")
})

test("compile: returns frozen object", () => {
  const compiled = compile({ intent: "x", scope: {}, target: {}, finality: {} })
  assert.ok(Object.isFrozen(compiled))
})

// ── Validate ─────────────────────────────────────────────────────────────────

test("validate: valid compiled object produces ok receipt", () => {
  const obj = { intent: "deploy", scope: { env: "prod" }, target: { action: "apply" }, finality: { proof_required: false } }
  const compiled = compile(obj)
  const receipt = validate(compiled)

  assert.equal(receipt.object_type, "ValidationReceipt")
  assert.equal(receipt.ok, true)
  assert.equal(receipt.issues.length, 0)
  assert.equal(receipt.object_hash, compiled.canonical_hash, "receipt hash must match compiled hash")
  assert.ok(receipt.validated_object, "validated_object must be present when ok")
  assert.equal(receipt.executed, false)
  assert.equal(receipt.replay_safe, true)
})

test("validate: missing required fields produces issues", () => {
  const compiled = compile({ intent: "x" }) // missing scope, target, finality
  const receipt = validate(compiled)
  assert.equal(receipt.ok, false)
  assert.ok(receipt.issues.length > 0)
  const codes = receipt.issues.map((i) => i.code)
  assert.ok(codes.includes("MISSING_FIELD"))
})

test("validate: non-CompiledLegitimacyObject is rejected", () => {
  const receipt = validate({ object_type: "Something", object: {} })
  assert.equal(receipt.ok, false)
  const codes = receipt.issues.map((i) => i.code)
  assert.ok(codes.includes("NOT_COMPILED_OBJECT"))
})

test("validate: post-compile mutation (hash tampered) is detected", () => {
  const compiled = compile({ intent: "x", scope: {}, target: {}, finality: {} })
  // Tamper with the canonical_hash to simulate post-compile mutation detection
  const tampered = { ...compiled, canonical_hash: "a".repeat(64) }
  const receipt = validate(tampered)
  assert.equal(receipt.ok, false)
  const codes = receipt.issues.map((i) => i.code)
  assert.ok(codes.includes("HASH_MISMATCH"))
})

// ── Execute ───────────────────────────────────────────────────────────────────

test("execute: valid receipt produces ok execution result", () => {
  const obj = { intent: "test", scope: { env: "ci" }, target: { action: "run" }, finality: { proof_required: false } }
  const compiled = compile(obj)
  const receipt = validate(compiled)
  const result = execute(receipt)

  assert.equal(result.object_type, "ExecutionResult")
  assert.equal(result.ok, true)
  assert.equal(result.executed, true)
  assert.equal(result.violations.length, 0)
  assert.equal(result.hidden_paths, false)
  assert.equal(result.implicit_topology_trust, false)
  assert.equal(result.replay_restoration, false)
  assert.deepEqual(result.executed_object, receipt.validated_object, "executed_object must equal validated_object")
})

test("execute: core invariant — executed_object equals validated_object", () => {
  const obj = { intent: "invariant-check", scope: { s: 1 }, target: { t: 1 }, finality: { proof_required: false } }
  const compiled = compile(obj)
  const receipt = validate(compiled)
  const result = execute(receipt)

  assert.equal(result.ok, true)
  // The core invariant: validated_object == executed_object
  assert.equal(
    hashCanonical(result.executed_object),
    receipt.object_hash,
    "executed_object hash must equal receipt.object_hash",
  )
  assert.deepEqual(result.executed_object, receipt.validated_object)
})

test("execute: failed receipt is rejected", () => {
  const compiled = compile({ intent: "x" }) // missing required fields
  const receipt = validate(compiled)
  assert.equal(receipt.ok, false)

  const result = execute(receipt)
  assert.equal(result.ok, false)
  const codes = result.violations.map((v) => v.code)
  assert.ok(codes.includes("VALIDATION_FAILED"))
})

test("execute: dry-run does not set executed=true", () => {
  const obj = { intent: "test", scope: {}, target: {}, finality: { proof_required: false } }
  const receipt = validate(compile(obj))
  const result = execute(receipt, { dryRun: true })

  assert.equal(result.ok, true)
  assert.equal(result.executed, false)
  assert.equal(result.dry_run, true)
})

test("execute: replay blocked — used receipt", () => {
  const obj = { intent: "test", scope: {}, target: {}, finality: { proof_required: false } }
  const receipt = validate(compile(obj))
  // Simulate already-used receipt
  const used = { ...receipt, executed: true }
  const result = execute(used)
  assert.equal(result.ok, false)
  const codes = result.violations.map((v) => v.code)
  assert.ok(codes.includes("REPLAY_BLOCKED"))
})

// ── Proof Lineage ─────────────────────────────────────────────────────────────

test("proofLineage: consistent chain across lifecycle", () => {
  const obj = { intent: "chain", scope: {}, target: {}, finality: { proof_required: false } }
  const compiled = compile(obj)
  const receipt = validate(compiled)
  const result = execute(receipt)

  const lineage = proofLineage([compiled, receipt, result])

  assert.equal(lineage.object_type, "ProofLineage")
  assert.equal(lineage.chain.length, 3)
  assert.equal(lineage.ok, true, `lineage issues: ${JSON.stringify(lineage.issues)}`)
})

test("proofLineage: detects hash discontinuity", () => {
  const obj = { intent: "test", scope: {}, target: {}, finality: { proof_required: false } }
  const compiled = compile(obj)
  const receipt = validate(compile({ intent: "different", scope: {}, target: {}, finality: {} }))

  const lineage = proofLineage([compiled, receipt])
  assert.equal(lineage.ok, false)
  const codes = lineage.issues.map((i) => i.code)
  assert.ok(codes.includes("LINEAGE_DISCONTINUITY"))
})

// ── Authority Inspection ──────────────────────────────────────────────────────

test("inspectAuthority: valid authority record is ok", () => {
  const record = {
    authority_id: "auth-001",
    authority_scope: "deploy",
    topology_hash: "abc123",
    created_at: new Date().toISOString(),
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
  const inspection = inspectAuthority(record)

  assert.equal(inspection.object_type, "AuthorityInspection")
  assert.equal(inspection.ok, true)
  assert.equal(inspection.creates_authority, false)
  assert.equal(inspection.runtime_authority, false)
})

test("inspectAuthority: runtime_authority=true is flagged", () => {
  const record = {
    authority_id: "auth-bad",
    authority_scope: "all",
    runtime_authority: true,
    replay_neutral: true,
  }
  const inspection = inspectAuthority(record)
  assert.equal(inspection.ok, false)
  assert.ok(inspection.issues.some((i) => i.includes("runtime_authority")))
})

test("inspectAuthority: cannot create authority", () => {
  const inspection = inspectAuthority({ authority_id: "x", authority_scope: "y", replay_neutral: true, runtime_authority: false })
  assert.equal(inspection.creates_authority, false)
})

// ── Topology Inspection ───────────────────────────────────────────────────────

test("inspectTopology: valid manifest passes", () => {
  const manifest = {
    object_type: "TopologyManifest",
    topology_status: "CANONICAL_EVIDENCE_RECONCILED",
    executable: false,
    creates_authority: false,
    fail_closed_on_ambiguity: true,
    evidence_only: true,
  }
  const inspection = inspectTopology(manifest)
  assert.equal(inspection.ok, true)
  assert.equal(inspection.implicit_topology_trust, false)
})

test("inspectTopology: executable topology is flagged", () => {
  const manifest = { executable: true, creates_authority: false, fail_closed_on_ambiguity: true }
  const inspection = inspectTopology(manifest)
  assert.equal(inspection.ok, false)
  const codes = inspection.issues.map((i) => i.code)
  assert.ok(codes.includes("EXECUTABLE_TOPOLOGY"))
})

test("inspectTopology: fail-open topology is flagged", () => {
  const manifest = { executable: false, creates_authority: false, fail_closed_on_ambiguity: false }
  const inspection = inspectTopology(manifest)
  assert.equal(inspection.ok, false)
  const codes = inspection.issues.map((i) => i.code)
  assert.ok(codes.includes("FAIL_OPEN"))
})

// ── Reconcile ─────────────────────────────────────────────────────────────────

test("reconcile: consistent lifecycle chain is ok", () => {
  const obj = { intent: "reconcile-test", scope: {}, target: {}, finality: { proof_required: false } }
  const compiled = compile(obj)
  const receipt = validate(compiled)
  const result = execute(receipt)

  const check = reconcile(compiled, receipt, result)
  assert.equal(check.ok, true, `reconcile issues: ${JSON.stringify(check.issues)}`)
  assert.equal(check.hash_parity, true)
  assert.equal(check.replay_restoration, false)
  assert.equal(check.mutation, false)
})

test("reconcile: compile-validate hash drift is detected", () => {
  const obj = { intent: "test", scope: {}, target: {}, finality: { proof_required: false } }
  const compiled = compile(obj)
  const differentReceipt = validate(compile({ intent: "different", scope: {}, target: {}, finality: {} }))

  const check = reconcile(compiled, differentReceipt)
  assert.equal(check.ok, false)
  const codes = check.issues.map((i) => i.code)
  assert.ok(codes.includes("COMPILE_VALIDATE_DRIFT"))
})

// ── Canonical Primitives ──────────────────────────────────────────────────────

test("hashCanonical: sha256 hex output for canonical form", () => {
  const hash = hashCanonical({ a: 1, b: 2 })
  assert.match(hash, /^[a-f0-9]{64}$/)
})

test("normalize: sorts keys deterministically", () => {
  const a = normalize({ z: 1, a: 2 })
  const b = normalize({ a: 2, z: 1 })
  assert.deepEqual(Object.keys(a), Object.keys(b))
  assert.deepEqual(a, b)
})
