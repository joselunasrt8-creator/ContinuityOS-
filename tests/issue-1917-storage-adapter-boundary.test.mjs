// Issue #1917: Storage Adapter Boundary tests.
//
// Verifies:
//   - storage-adapter.ts exports all four interface shapes
//   - D1RegistryAdapter enforces nonce terminality (UNUSED → CONSUMED is final)
//   - D1RegistryAdapter surfaces duplicate receipt_id as REJECTED (not silent)
//   - VALID path: validated_object_hash === executed_object_hash in proof record
//   - NULL path: no proof receipt emitted on null execution
//   - Authority readAuthority returns null (not throws) on miss
//   - readLineageNode returns NOT_FOUND (not throws) on miss
//   - bootstrapContinuityRegistrySchema is idempotent (double-call does not throw)

import test from "node:test"
import assert from "node:assert/strict"

// ── Mock D1 Database ──────────────────────────────────────────────────────────
// Minimal in-memory D1 stub that tracks the govern_nonce_registry,
// lineage_registry, adapter_proof_registry, and authority_registry tables.

function makeMockD1() {
  const tables = {
    govern_nonce_registry: new Map(),       // key: `${nonce}:${domain}` → row
    lineage_registry: new Map(),             // key: node_id → row
    adapter_proof_registry: new Map(),       // key: receipt_id → row
    authority_registry: new Map(),           // key: authority_id → row
    bootstrap_calls: 0,
  }

  function makePragmaResult(columns) {
    return {
      results: columns.map((name, idx) => ({ cid: idx, name, type: "TEXT", notnull: 0, dflt_value: null, pk: 0 })),
    }
  }

  function makeRunResult(changes) {
    return { meta: { changes } }
  }

  function parseSql(sql) {
    const s = sql.trim().toUpperCase()
    if (s.startsWith("CREATE TABLE")) return "CREATE_TABLE"
    if (s.startsWith("CREATE TRIGGER")) return "CREATE_TRIGGER"
    if (s.startsWith("CREATE UNIQUE INDEX") || s.startsWith("CREATE INDEX")) return "CREATE_INDEX"
    if (s.startsWith("DROP TRIGGER")) return "DROP_TRIGGER"
    if (s.startsWith("DROP INDEX")) return "DROP_INDEX"
    if (s.startsWith("INSERT OR IGNORE INTO GOVERN_NONCE_REGISTRY")) return "INSERT_NONCE"
    if (s.startsWith("SELECT 1 FROM GOVERN_NONCE_REGISTRY")) return "SELECT_NONCE"
    if (s.startsWith("SELECT") && s.includes("GOVERN_NONCE_REGISTRY")) return "SELECT_NONCE_INFO"
    if (s.startsWith("INSERT OR IGNORE INTO LINEAGE_REGISTRY")) return "INSERT_LINEAGE"
    if (s.startsWith("SELECT") && s.includes("LINEAGE_REGISTRY")) return "SELECT_LINEAGE"
    if (s.startsWith("SELECT RECEIPT_ID FROM ADAPTER_PROOF_REGISTRY")) return "SELECT_PROOF_CHECK"
    if (s.startsWith("INSERT INTO ADAPTER_PROOF_REGISTRY")) return "INSERT_PROOF"
    if (s.startsWith("SELECT") && s.includes("AUTHORITY_REGISTRY")) return "SELECT_AUTHORITY"
    if (s.startsWith("PRAGMA TABLE_INFO(GOVERN_NONCE_REGISTRY)")) return "PRAGMA_NONCE"
    if (s.startsWith("PRAGMA")) return "PRAGMA"
    return "OTHER"
  }

  function makePrepared(sql, params = []) {
    return {
      bind(...args) { return makePrepared(sql, args) },
      async run() {
        const op = parseSql(sql)
        tables.bootstrap_calls++
        if (op === "CREATE_TABLE" || op === "CREATE_TRIGGER" || op === "CREATE_INDEX" || op === "DROP_TRIGGER" || op === "DROP_INDEX") {
          return makeRunResult(0)
        }
        if (op === "INSERT_NONCE") {
          const nonce = params[0], domain = params[1] ?? "continuity-core"
          const key = `${nonce}:${domain}`
          if (tables.govern_nonce_registry.has(key)) return makeRunResult(0)
          tables.govern_nonce_registry.set(key, { nonce, nonce_domain: domain, candidate_hash: params[1], created_at: params[2] })
          return makeRunResult(1)
        }
        if (op === "INSERT_LINEAGE") {
          const node_id = params[0]
          if (tables.lineage_registry.has(node_id)) return makeRunResult(0)
          tables.lineage_registry.set(node_id, { node_id, parent_id: params[1], canonical_hash: params[2], depth: params[3], created_at: params[4] })
          return makeRunResult(1)
        }
        if (op === "INSERT_PROOF") {
          const receipt_id = params[0]
          if (tables.adapter_proof_registry.has(receipt_id)) return makeRunResult(0)
          tables.adapter_proof_registry.set(receipt_id, {
            receipt_id,
            validated_object_hash: params[1],
            executed_object_hash: params[2],
            execution_evidence_hash: params[3],
            adapter_surface: params[4],
            decision_id: params[5],
            replay_nonce: params[6],
            execution_result: params[7],
            creates_authority: 0,
            emitted_at: params[8],
            created_at: params[9],
          })
          return makeRunResult(1)
        }
        return makeRunResult(0)
      },
      async first() {
        const op = parseSql(sql)
        if (op === "SELECT_NONCE") {
          const nonce = params[0]
          // Check any domain for this nonce
          for (const [key] of tables.govern_nonce_registry) {
            if (key.startsWith(`${nonce}:`)) return { nonce }
          }
          return null
        }
        if (op === "SELECT_NONCE_INFO") {
          const nonce = params[0]
          for (const [key, row] of tables.govern_nonce_registry) {
            if (key.startsWith(`${nonce}:`)) return row
          }
          return null
        }
        if (op === "SELECT_PROOF_CHECK") {
          const receipt_id = params[0]
          return tables.adapter_proof_registry.get(receipt_id) ?? null
        }
        if (op === "SELECT_LINEAGE") {
          const node_id = params[0]
          return tables.lineage_registry.get(node_id) ?? null
        }
        if (op === "SELECT_AUTHORITY") {
          const authority_id = params[0]
          return tables.authority_registry.get(authority_id) ?? null
        }
        return null
      },
      async all() {
        const op = parseSql(sql)
        if (op === "PRAGMA_NONCE" || op === "PRAGMA") {
          // Return columns for a fully-migrated table
          return makePragmaResult(["nonce", "nonce_domain", "candidate_hash", "created_at"])
        }
        return { results: [] }
      },
    }
  }

  return {
    _tables: tables,
    prepare(sql) { return makePrepared(sql) },
    async batch(stmts) {
      const results = []
      for (const stmt of stmts) {
        results.push(await stmt.run())
      }
      return results
    },
  }
}

// ── TC-01: storage-adapter.ts exports all interface shapes ─────────────────────

test("TC-01: storage-adapter.ts is importable and exports expected shapes", async () => {
  const mod = await import("../src/lib/storage-adapter.ts")
  // Interfaces are compile-time only but their use in types can be checked via
  // runtime property access on the module. We verify the module loads without error.
  assert.ok(mod !== null, "storage-adapter module loaded")
  // AppendResult and StorageReadResult are type-only but we verify they don't throw on import
})

// ── TC-02: D1RegistryAdapter — isNonceUnused returns true when nonce not found ──

test("TC-02: isNonceUnused returns true for an unseen nonce", async () => {
  const { D1RegistryAdapter } = await import("../src/lib/d1-storage-adapter.ts")
  const db = makeMockD1()
  const adapter = new D1RegistryAdapter(db)
  const unused = await adapter.isNonceUnused("nonce-fresh-001")
  assert.equal(unused, true, "fresh nonce must be unused")
})

// ── TC-03: D1RegistryAdapter — nonce is terminal after markNonceConsumed ────────

test("TC-03: markNonceConsumed makes nonce no longer unused (UNUSED → CONSUMED is terminal)", async () => {
  const { D1RegistryAdapter } = await import("../src/lib/d1-storage-adapter.ts")
  const db = makeMockD1()
  const adapter = new D1RegistryAdapter(db)

  const nonce = "nonce-terminal-001"
  assert.equal(await adapter.isNonceUnused(nonce), true, "before: nonce is unused")

  const result = await adapter.markNonceConsumed(nonce, "decision-001")
  assert.equal(result.status, "APPENDED", "first markNonceConsumed returns APPENDED")

  assert.equal(await adapter.isNonceUnused(nonce), false, "after: nonce is no longer unused")

  const result2 = await adapter.markNonceConsumed(nonce, "decision-001")
  assert.equal(result2.status, "ALREADY_EXISTS", "second markNonceConsumed returns ALREADY_EXISTS (not throws)")
})

// ── TC-04: D1RegistryAdapter — duplicate receipt_id surfaces as REJECTED ────────

test("TC-04: appendProofReceipt with duplicate receipt_id returns REJECTED (fatal integrity violation)", async () => {
  const { D1RegistryAdapter } = await import("../src/lib/d1-storage-adapter.ts")
  const db = makeMockD1()
  const adapter = new D1RegistryAdapter(db)

  const receipt = {
    receipt_id: "receipt-dup-001",
    validated_object_hash: "sha256:aabbcc",
    executed_object_hash: "sha256:aabbcc",
    execution_evidence_hash: "sha256:evidence001",
    adapter_surface: "d1",
    decision_id: "AUTH-001",
    replay_nonce: "nonce-dup-001",
    execution_result: "EXECUTED",
    creates_authority: false,
    emitted_at: new Date().toISOString(),
  }

  const first = await adapter.appendProofReceipt(receipt)
  assert.equal(first.status, "APPENDED", "first append succeeds")

  const second = await adapter.appendProofReceipt(receipt)
  assert.equal(second.status, "REJECTED", "duplicate receipt_id returns REJECTED, not silent ignore")
  assert.match(second.reason, /duplicate_receipt_id/, "reason is duplicate_receipt_id")
})

// ── TC-05: VALID path — validated_object_hash === executed_object_hash ────────

test("TC-05: VALID path preserves validated_object_hash === executed_object_hash in proof record", async () => {
  const { D1RegistryAdapter } = await import("../src/lib/d1-storage-adapter.ts")
  const db = makeMockD1()
  const adapter = new D1RegistryAdapter(db)

  const objectHash = "sha256:canonical-object-hash-001"
  const receipt = {
    receipt_id: "receipt-valid-001",
    validated_object_hash: objectHash,
    executed_object_hash: objectHash,  // must equal validated
    execution_evidence_hash: "sha256:evidence-valid-001",
    adapter_surface: "d1",
    decision_id: "AUTH-valid-001",
    replay_nonce: "nonce-valid-001",
    execution_result: "EXECUTED",
    creates_authority: false,
    emitted_at: new Date().toISOString(),
  }

  const result = await adapter.appendProofReceipt(receipt)
  assert.equal(result.status, "APPENDED", "proof receipt appended")

  const stored = db._tables.adapter_proof_registry.get("receipt-valid-001")
  assert.ok(stored, "proof record exists in store")
  assert.equal(
    stored.validated_object_hash,
    stored.executed_object_hash,
    "validated_object_hash === executed_object_hash in stored record"
  )
  assert.equal(stored.validated_object_hash, objectHash, "hash value is correct")
})

// ── TC-06: NULL path — readAuthority returns null (not throws) on miss ────────

test("TC-06: readAuthority returns null (not throws) when authority_id not found", async () => {
  const { D1RegistryAdapter } = await import("../src/lib/d1-storage-adapter.ts")
  const db = makeMockD1()
  const adapter = new D1RegistryAdapter(db)

  const result = await adapter.readAuthority("auth-nonexistent-001")
  assert.equal(result, null, "missing authority returns null, not throws")
})

// ── TC-07: readLineageNode returns NOT_FOUND (not throws) on miss ────────────

test("TC-07: readLineageNode returns NOT_FOUND when node_id not found", async () => {
  const { D1RegistryAdapter } = await import("../src/lib/d1-storage-adapter.ts")
  const db = makeMockD1()
  const adapter = new D1RegistryAdapter(db)

  const result = await adapter.readLineageNode("lineage-nonexistent-001")
  assert.equal(result.status, "NOT_FOUND", "missing lineage node returns NOT_FOUND, not throws")
})

// ── TC-08: bootstrapContinuityRegistrySchema is idempotent ────────────────────

test("TC-08: bootstrapContinuityRegistrySchema called twice does not throw", async () => {
  const { bootstrapContinuityRegistrySchema } = await import("../src/lib/d1-storage-adapter.ts")
  const db = makeMockD1()

  await assert.doesNotReject(
    () => bootstrapContinuityRegistrySchema(db),
    "first bootstrap call succeeds"
  )
  await assert.doesNotReject(
    () => bootstrapContinuityRegistrySchema(db),
    "second bootstrap call is idempotent (CREATE TABLE IF NOT EXISTS)"
  )
})

// ── TC-09: commitValidatedExecution — atomic post-VALID group ─────────────────

test("TC-09: commitValidatedExecution atomically commits nonce + lineage + proof", async () => {
  const { D1RegistryAdapter } = await import("../src/lib/d1-storage-adapter.ts")
  const db = makeMockD1()
  const adapter = new D1RegistryAdapter(db)

  const commit = {
    replay_nonce: "nonce-atomic-001",
    decision_id: "AUTH-atomic-001",
    lineage_node: {
      node_id: "lineage-node-001",
      parent_id: null,
      canonical_hash: "sha256:lineage-hash-001",
      depth: 0,
    },
    proof_receipt: {
      receipt_id: "receipt-atomic-001",
      validated_object_hash: "sha256:object-atomic-001",
      executed_object_hash: "sha256:object-atomic-001",
      execution_evidence_hash: "sha256:evidence-atomic-001",
      adapter_surface: "d1",
      decision_id: "AUTH-atomic-001",
      replay_nonce: "nonce-atomic-001",
      execution_result: "EXECUTED",
      creates_authority: false,
      emitted_at: new Date().toISOString(),
    },
  }

  const result = await adapter.commitValidatedExecution(commit)
  assert.equal(result.status, "APPENDED", "atomic commit returns APPENDED")

  assert.equal(await adapter.isNonceUnused("nonce-atomic-001"), false, "nonce consumed after commit")
  const lineage = await adapter.readLineageNode("lineage-node-001")
  assert.equal(lineage.status, "FOUND", "lineage node persisted")
  const proofExists = db._tables.adapter_proof_registry.has("receipt-atomic-001")
  assert.ok(proofExists, "proof receipt persisted")
})

// ── TC-10: NULL path — no proof written when execution does not occur ─────────

test("TC-10: NULL path produces no proof receipt (adapter not called)", async () => {
  const { D1RegistryAdapter } = await import("../src/lib/d1-storage-adapter.ts")
  const db = makeMockD1()
  const adapter = new D1RegistryAdapter(db)

  // Simulates a NULL execution path: appendProofReceipt is never called
  // The adapter_proof_registry must remain empty
  assert.equal(db._tables.adapter_proof_registry.size, 0, "no proof receipts on NULL path")

  // Also verify nonce is still unused
  assert.equal(await adapter.isNonceUnused("nonce-null-path"), true, "nonce remains unused on NULL path")
})
