# Stage 2 Developer Primitive Packaging Plan v1

**Artifact Type:** Stage 2 Developer Primitive Packaging Plan  
**Status:** NON-OPERATIVE PLANNING ARTIFACT  
**Issue:** #1427  
**Depends on:** #1422 (CLI/SDK surface definition)  
**Repository:** joselunasrt8-creator/mindshift-demo  
**Branch:** `claude/primitive-packaging-plan-Q69Be`  
**Date:** 2026-05-27

---

## Context

Stage 1 governed CI/CD enforcement is complete. Stage 2 distributed legitimacy enforcement is complete, with all 15 CONF-DIST checks passing. Stage 3 external conformance pack v1 has shipped.

The remaining gap is **packaging**: internal legitimacy primitives exist as runtime modules inside this repo. No external developer can consume them without cloning the entire monorepo. This plan defines the boundaries, surfaces, formats, sequencing, and compatibility rules required to move internal primitives into portable, reusable developer-facing packages — without creating authority, widening execution capability, or collapsing controlled-runtime boundaries.

**Stage 2 closure target:**

```
internal runtime primitives → portable developer legitimacy infrastructure
```

**Core invariants that packaging must not violate:**

```
validated_object == executed_object
replay safety must survive portability
open protocol ≠ open authority
conformance ≠ execution authority
capability ≠ authority
```

---

## 1. Executive Determination

### Primitive scope in scope for packaging

| Primitive | Current location | Package target |
|-----------|-----------------|----------------|
| Canonical serializer + hash | `cli/lib/canonical.mjs` | `@mindshift/canonical` |
| Replay registry | `src/runtime/` + replay-related modules | `@mindshift/replay` |
| Append-only proof log | `src/lib/proof-finality-metadata.ts` | `@mindshift/proof` |
| Continuity lineage graph | `src/lib/reconciliation-state-machine.ts` + lineage modules | `@mindshift/lineage` |
| Governed runner | `conformance/runner.mjs` + governed-deploy surface | `@mindshift/runner` |
| Conformance pack | `conformance/pack-v1/` | `@mindshift/conformance` |
| CLI wrapper | `cli/index.mjs` + `cli/commands/` | `mindshift` (npm binary) |
| SDK module | `cli/sdk/index.mjs` | `@mindshift/sdk` |
| Topology export | `runtime-topology.json` + `runtime/` topology modules | `@mindshift/topology` |

### What this plan does NOT do

- Does not publish packages
- Does not deploy services
- Does not create authority
- Does not widen execution capability
- Does not expose hidden execution paths
- Does not collapse controlled runtime boundaries
- Does not propose consensus protocol implementation
- Does not imply GLOBAL_VALID has been reached

---

## 2. Package Map

### Logical package graph

```
@mindshift/canonical
    └─ no internal deps (leaf)

@mindshift/replay
    └─ depends on: @mindshift/canonical

@mindshift/proof
    └─ depends on: @mindshift/canonical

@mindshift/lineage
    └─ depends on: @mindshift/canonical, @mindshift/proof

@mindshift/topology
    └─ depends on: @mindshift/canonical, @mindshift/lineage

@mindshift/conformance
    └─ depends on: @mindshift/canonical (observability-only, zero runtime deps)

@mindshift/runner
    └─ depends on: @mindshift/canonical, @mindshift/replay, @mindshift/proof

@mindshift/sdk
    └─ depends on: @mindshift/canonical, @mindshift/replay,
                   @mindshift/proof, @mindshift/lineage, @mindshift/topology

mindshift (CLI)
    └─ depends on: @mindshift/sdk (thin shell over SDK exports)
```

### Package classifications

| Package | Layer | Authority-creating | Execution-capable | Observability-only |
|---------|-------|--------------------|-------------------|--------------------|
| `@mindshift/canonical` | Open | false | false | true |
| `@mindshift/conformance` | Open | false | false | true |
| `@mindshift/proof` | Open | false | false | true |
| `@mindshift/replay` | Controlled | false | false | true |
| `@mindshift/lineage` | Controlled | false | false | true |
| `@mindshift/topology` | Controlled | false | false | true |
| `@mindshift/runner` | Controlled-runtime | false | **true (bounded)** | false |
| `@mindshift/sdk` | Open protocol | false | **true (bounded)** | false |
| `mindshift` (CLI) | Open protocol | false | **true (bounded)** | false |

All execution-capable packages enforce: `validated_object == executed_object`. No package grants authority. Execution in runner/SDK/CLI is bounded by receipt-gated dispatch only.

---

## 3. Module Boundaries

### 3.1 `@mindshift/canonical` (leaf, open)

**Exports:**
```
normalize(object) → NormalizedObject
canonicalize(normalized) → string (JSON canonical form)
sha256Hex(input) → string
hashCanonical(object) → string (SHA-256 hex of canonical form)
```

**Boundary rules:**
- Zero runtime deps
- Pure deterministic functions only
- No I/O, no network, no authority
- Portable to any JS runtime (Node 18+, Deno, browser)
- Output is stable across package versions within a schema epoch

### 3.2 `@mindshift/replay` (controlled)

**Exports:**
```
ReplayRegistry (class)
  .consume(nonce) → ConsumeResult { ok, nonce, consumed_at }
  .isConsumed(nonce) → boolean
  .inspect(nonce) → ReplayRecord | null

ReplayRecord (type)
  { nonce, replay_state: "CONSUMED" | "UNUSED", restoration_eligible: false, consumed_at }
```

**Boundary rules:**
- `restoration_eligible` is permanently `false` — not configurable
- No method to undo or reset a consumed nonce
- Registry is not exposed directly; only ConsumeResult and inspection are exported
- Controlled: external consumers may inspect, not configure, replay state

### 3.3 `@mindshift/proof` (open, observability-only)

**Exports:**
```
ProofRecord (type)
ProofLineage (type)
buildProofLineage(objects[]) → ProofLineage
classifyProofState(record) → ProofStateClassification
  → "LOCAL_VALID" | "GLOBAL_VALID" | "PARTITION_SUSPENDED" | "CONFLICTED" |
     "AMBIGUOUS" | "STALE_VISIBLE" | "CONVERGENCE_VALID" | "NULL"
```

**Boundary rules:**
- `buildProofLineage` is observability-only — does not emit proof records
- `classifyProofState` applies append-only transition rules; backward transitions return NULL
- GLOBAL_VALID is only returned when topology-visible quorum evidence is present
- Proof existence does not imply distributed finality

### 3.4 `@mindshift/lineage` (controlled)

**Exports:**
```
ContinuityLineage (type)
LineageNode (type)
buildLineage(nodes[]) → ContinuityLineage
classifyLineage(lineage) → LineageClassification
  → "ACTIVE" | "DETACHED" | "STALE" | "REVOKED"
verifyLineageContinuity(lineage) → ContinuityVerification
```

**Boundary rules:**
- Null predecessor → DETACHED; no valid authority path
- Revocation propagates recursively; no partial revocation
- Controlled: external consumers inspect, not mutate, lineage

### 3.5 `@mindshift/topology` (controlled)

**Exports:**
```
TopologyManifest (type)
inspectTopology(manifest) → TopologyInspection
exportTopology(runtime) → TopologyManifest (observability-only)
```

**Boundary rules:**
- `executable` field on manifest must always be `false`
- `creates_authority` must always be `false`
- `fail_closed_on_ambiguity` must always be `true`
- Topology export is read-only; no write path is exported

### 3.6 `@mindshift/conformance` (open, zero deps)

**Exports:**
```
fixtures/              — canonical fixture files (JSON)
vectors/               — test vector suites (JSON)
harness.mjs            — self-contained portable runner (Node 18+, no deps)
```

**Boundary rules:**
- Zero npm dependencies
- All fixtures are `_non_operative: true`
- All suites are `non_operative: true, observability_only: true`
- Harness exit 0 on full pass, exit 1 on any failure
- Pack is copy-installable without npm (sparse checkout pattern)

### 3.7 `@mindshift/runner` (controlled-runtime)

**Exports:**
```
GovernedRunner (class)
  .run(receipt, options) → ExecutionResult
  .dryRun(receipt) → ExecutionResult
```

**Boundary rules:**
- Run requires a valid ValidationReceipt — no receipt, no execution
- DryRun validates invariants without mutating state
- Does not create authority
- Replay consumption is enforced before execution
- Receipt-gated dispatch only: `validated_object == executed_object`

### 3.8 `@mindshift/sdk` (open protocol)

**Exports (current surface, from `cli/sdk/index.mjs`):**
```
compile(object, sourceRef?) → CompiledLegitimacyObject
validate(compiled) → ValidationReceipt
execute(receipt, options?) → ExecutionResult
proofLineage(objects[]) → ProofLineage
inspectAuthority(record) → AuthorityInspection
inspectTopology(manifest) → TopologyInspection
reconcile(compiled, receipt, result?) → ReconciliationCheck

normalize(object) → NormalizedObject
canonicalize(normalized) → string
sha256Hex(input) → string
hashCanonical(object) → string
```

**Boundary rules:**
- All object types are frozen (Object.freeze) — mutation blocked
- `execute` requires a passed ValidationReceipt; no receipt = no execution
- `inspectAuthority` and `inspectTopology` are observability-only
- `proofLineage` and `reconcile` are observability-only
- `creates_authority: false` is a static invariant on all returned objects

### 3.9 `mindshift` CLI (open protocol)

**Exports (binary, via `bin.mindshift`):**
```
mindshift authority [--file <path>]
mindshift compile <file> [--out <path>]
mindshift validate <compiled-file> [--out <path>]
mindshift execute <receipt-file> [--dry-run] [--out <path>]
mindshift proof [--file <path>]
mindshift topology [--export] [--out <path>]
mindshift reconcile <compiled> <receipt> [<result>]
```

---

## 4. CLI Command Specification

### Command contract table

| Command | Input | Output | Authority-creating | Execution-capable | Observability |
|---------|-------|--------|--------------------|-------------------|---------------|
| `authority` | authority record (JSON) | AuthorityInspection | false | false | true |
| `compile` | raw object (JSON) | CompiledLegitimacyObject | false | false | false |
| `validate` | CompiledLegitimacyObject | ValidationReceipt | false | false | false |
| `execute` | ValidationReceipt | ExecutionResult | false | **true (bounded)** | false |
| `proof` | lifecycle objects (JSON) | ProofLineage | false | false | true |
| `topology` | topology manifest (JSON) | TopologyInspection | false | false | true |
| `reconcile` | compiled + receipt [+ result] | ReconciliationCheck | false | false | true |

### Command constraints (all commands)

```
MUST NOT create authority
MUST NOT execute without a valid ValidationReceipt
MUST NOT restore consumed replay nonces
MUST NOT trust topology implicitly
MUST NOT expose hidden execution paths
MUST exit non-zero on any invariant violation
MUST write structured JSON output when --out is provided
```

### `execute` command: receipt gate

The `execute` command enforces the core invariant at the CLI boundary:

```
validated_object == executed_object
```

Gate order:
1. Parse and type-check receipt as ValidationReceipt
2. Verify `receipt.ok === true`
3. Verify `receipt.executed !== true` (replay block)
4. Verify `receipt.validated_object` is present
5. Only then: dispatch to GovernedRunner

Any gate failure → `BLOCKED` exit code, structured violation output, no execution.

---

## 5. SDK Surface Definition

### Type inventory

```typescript
type NormalizedObject = Record<string, unknown>

type CompiledLegitimacyObject = {
  readonly object_type: "CompiledLegitimacyObject"
  readonly compiled_at: string        // ISO-8601
  readonly source_file: string
  readonly canonical_hash: string     // SHA-256 hex
  readonly canonical_form: string     // JSON canonical string
  readonly object: NormalizedObject
  readonly replay_safe: true
  readonly mutation_locked: true
  readonly executed: false
  readonly validated: false
}

type ValidationReceipt = {
  readonly object_type: "ValidationReceipt"
  readonly validated_at: string
  readonly source_file: string | null
  readonly object_hash: string
  readonly canonical_form: string | null
  readonly ok: boolean
  readonly issues: ValidationIssue[]
  readonly validated_object: NormalizedObject | null
  readonly executed: false
  readonly replay_safe: true
}

type ExecutionResult = {
  readonly object_type: "ExecutionResult"
  readonly executed_at: string
  readonly dry_run: boolean
  readonly object_hash: string | null
  readonly validated_object_hash_confirmed: boolean
  readonly executed: boolean
  readonly violations: ExecutionViolation[]
  readonly ok: boolean
  readonly execution_surface: string
  readonly hidden_paths: false
  readonly implicit_topology_trust: false
  readonly replay_restoration: false
  readonly executed_object: NormalizedObject | null
  readonly execution_note: string
}

type ProofLineage = {
  readonly object_type: "ProofLineage"
  readonly mode: "observability_only"
  readonly proof_generating: false
  readonly chain: ProofChainEntry[]
  readonly issues: LineageIssue[]
  readonly ok: boolean
}

type AuthorityInspection = {
  readonly object_type: "AuthorityInspection"
  readonly mode: "observability_only"
  readonly runtime_authority: false
  readonly creates_authority: false
  readonly authority_id: string | null
  readonly authority_scope: string | null
  readonly topology_hash: string | null
  readonly computed_hash: string
  readonly issues: string[]
  readonly ok: boolean
}

type TopologyInspection = {
  readonly object_type: "TopologyInspection"
  readonly mode: "observability_only"
  readonly implicit_topology_trust: false
  readonly topology_status: string | null
  readonly invariant: string | null
  readonly fail_closed: boolean
  readonly manifest_hash: string
  readonly issues: TopologyIssue[]
  readonly ok: boolean
}

type ReconciliationCheck = {
  readonly object_type: "ReconciliationCheck"
  readonly mode: "observability_only"
  readonly replay_restoration: false
  readonly mutation: false
  readonly compiled_hash: string | null
  readonly receipt_hash: string | null
  readonly execute_hash: string | null
  readonly hash_parity: boolean
  readonly issues: ReconciliationIssue[]
  readonly ok: boolean
}
```

### SDK stability contracts

- All exported types are `readonly` — mutation at the boundary is a violation
- `executed: false` on CompiledLegitimacyObject and ValidationReceipt is a static type constraint
- `hidden_paths: false`, `implicit_topology_trust: false`, `replay_restoration: false` on ExecutionResult are static invariants
- `mode: "observability_only"` on inspection types is non-configurable
- `creates_authority: false` on AuthorityInspection is non-configurable

---

## 6. Fixture Format Definition

### Fixture file schema

All fixture files used in conformance suites must conform to:

```json
{
  "_fixture_id": "<suite>-<name>-v<N>",
  "_non_operative": true,
  "_description": "Human-readable description of what this fixture represents",
  "_expected_classification": "<expected state label>",
  "_forbidden_classifications": ["<label>", "..."],
  "...": "domain-specific fields"
}
```

### Required fixture fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_fixture_id` | string | yes | Unique ID, format `<suite>-<name>-v<N>` |
| `_non_operative` | true | yes | Must be literal `true` |
| `_description` | string | yes | Human description of the fixture's intent |
| `_expected_classification` | string | yes | The canonical classification the harness expects |
| `_forbidden_classifications` | string[] | yes | Classifications that must not result |

### Fixture classification vocabulary

Permitted `_expected_classification` values:

```
VALID                   — object passes all required field checks
NULL                    — object fails closed; no result
LOCAL_VALID             — valid under local view only
GLOBAL_VALID            — valid with topology-visible quorum (requires evidence)
CONVERGENCE_VALID       — valid with epoch binding
PARTITION_SUSPENDED     — execution suspended under partition
CONFLICTED              — conflicting proof roots detected
AMBIGUOUS               — causal ordering or quorum cannot be determined
STALE_VISIBLE           — stale lineage preserved for audit; not executable
CONVERGED               — settlement reached; not GLOBAL_VALID without quorum
CONSUMED                — replay nonce consumed; reuse → NULL
UNUSED                  — replay nonce available for first-and-only use
DETACHED                — null predecessor; no valid authority path
APPEND_ONLY_ENFORCED    — proof transitions are forward-only
NO_AUTHORITY            — operation produces no authority
CONFORMANCE_ONLY        — classification without execution eligibility
```

### Fixture suite structure

```
conformance/
  pack-v1/                     (released)
    fixtures/
      aeo-valid.json
      aeo-mutated.json
      aeo-missing-key.json
      continuity-intact.json
      continuity-detached.json
      replay-consumed.json
      replay-resurrection-attempt.json
    vectors/
      validator.json
      replay.json
      proof.json
      convergence.json
    harness.mjs
    README.md

  pack-v2/                     (planned — packaging primitives)
    fixtures/
      canonical-hash-stable.json
      compile-lifecycle.json
      validate-gate.json
      execute-receipt-gate.json
      execute-replay-block.json
      topology-fail-closed.json
      authority-observability-only.json
      reconcile-drift-detection.json
    vectors/
      canonical.json
      compile.json
      validate.json
      execute.json
      topology.json
      authority.json
      reconcile.json
    harness.mjs
    README.md
```

### Vector file schema

```json
{
  "suite_id": "<suite>-v<N>",
  "non_operative": true,
  "observability_only": true,
  "runtime_mutation_capable": false,
  "vectors": [
    {
      "id": "<SUITE>-<NN>",
      "label": "snake_case_description",
      "fixture": "<fixture-file>.json",
      "expected": "<classification>",
      "forbidden": ["<classification>", "..."],
      "module": "<source module path>",
      "status": "PENDING | PASS | FAIL"
    }
  ]
}
```

---

## 7. Schema Compatibility Policy

### Schema epoch model

All schemas are versioned by epoch. An epoch is a named, frozen compatibility boundary.

```
epoch_v1    — current (all existing schema files in schemas/)
epoch_v2    — next planned (packaging surface schemas)
```

Epoch transitions are non-breaking within an epoch. Cross-epoch migration requires an explicit migration path.

### Backward compatibility rules

| Change type | Policy |
|------------|--------|
| Add optional field | ALLOWED in same epoch |
| Add required field | REQUIRES new epoch + migration |
| Remove field | FORBIDDEN without new epoch |
| Rename field | FORBIDDEN without new epoch |
| Change field type | FORBIDDEN without new epoch |
| Tighten validation | ALLOWED (fail-closed tightening is non-breaking) |
| Loosen validation | REQUIRES review; may require new epoch |
| Change canonical hash algorithm | REQUIRES new epoch + migration |
| Change canonical form format | REQUIRES new epoch + migration |

### Hash stability guarantee

```
hashCanonical(object) is stable for the lifetime of an epoch.
```

This means: if a CompiledLegitimacyObject was compiled in epoch_v1, its `canonical_hash` remains valid for validation and reconciliation in any epoch_v1-compatible SDK version.

Cross-epoch hash comparison is undefined behavior and MUST be rejected.

### Versioning surface

Each package exposes a `SCHEMA_EPOCH` constant:

```javascript
export const SCHEMA_EPOCH = "v1"
export const SCHEMA_VERSION = "1.0.0"
```

The conformance harness verifies epoch consistency across fixtures and the SDK at runtime.

### Deprecation policy

- Deprecated fields are marked with `_deprecated: true` in fixture files
- Deprecated exports are retained for one full minor version series before removal
- Removal is only permitted at a major version boundary coinciding with an epoch transition
- No field or export is removed without a migration path documented in `docs/`

---

## 8. Open vs Controlled Layer Boundary

### Layer definitions

```
Open Protocol Layer
  — readable, inspectable, verifiable by external developers
  — no runtime capability
  — no authority
  — portable: runs without the canonical runtime

Controlled Runtime Layer
  — execution-capable but receipt-gated
  — replay-enforcement enforced internally
  — no external configuration of replay, authority, or topology trust
  — portable: runs without the canonical runtime, but bounded by its rules

Canonical Runtime (not packaged)
  — MindShift production endpoints (/session, /continuity, /authority,
    /compile, /validate, /execute, /proof)
  — governed-deploy.yml CI/CD surface
  — D1 databases, KV, Workers
  — authority records (root, scoped)
  — This layer is NOT exported; it is controlled
```

### Package layer assignments

| Package | Layer | Can be used without canonical runtime |
|---------|-------|--------------------------------------|
| `@mindshift/canonical` | Open Protocol | yes |
| `@mindshift/conformance` | Open Protocol | yes |
| `@mindshift/proof` | Open Protocol | yes |
| `@mindshift/replay` | Controlled Runtime | yes (in-memory registry only) |
| `@mindshift/lineage` | Controlled Runtime | yes |
| `@mindshift/topology` | Controlled Runtime | yes |
| `@mindshift/runner` | Controlled Runtime | yes (bounded execution) |
| `@mindshift/sdk` | Open Protocol + Controlled Runtime | yes |
| `mindshift` CLI | Open Protocol + Controlled Runtime | yes |
| Production endpoints | Canonical Runtime | NO — not packaged |

### What "open protocol" means here

```
open protocol ≠ open authority
```

External developers can:
- Read schema definitions
- Run conformance fixtures
- Compile and validate legitimacy objects
- Inspect proof lineage, authority records, topology
- Execute bounded, receipt-gated objects
- Integrate SDK into their own CI/CD workflows

External developers cannot:
- Create authority records
- Access the canonical runtime directly via packages
- Configure replay registry behavior
- Bypass receipt-gated execution
- Access hidden execution paths
- Produce GLOBAL_VALID classifications (only the canonical runtime can)

---

## 9. Release Sequencing

### Release order (from issue #1427)

```
Release 1: canonical object + hash package
Release 2: conformance fixtures
Release 3: proof object examples
Release 4: GitHub Action template
Release 5: CLI wrapper
Release 6: topology export
```

### Detailed release gate conditions

**Release 1 — `@mindshift/canonical`**

Gate conditions:
- `normalize`, `canonicalize`, `sha256Hex`, `hashCanonical` are covered by conformance vectors
- Hash stability across Node versions is verified
- Zero external dependencies confirmed
- Schema epoch v1 anchor is set
- README includes invariant statement

**Release 2 — `@mindshift/conformance` pack-v2**

Gate conditions:
- All fixture files include `_non_operative: true`
- All vectors include `non_operative: true, runtime_mutation_capable: false`
- Harness exits 0 on full pass, 1 on any failure
- Harness has zero npm dependencies
- README documents copy-install pattern
- Fixture format matches schema defined in §6

**Release 3 — Proof object examples**

Gate conditions:
- Proof lifecycle examples (compile → validate → execute) are present as fixture files
- `ProofLineage` observability-only contract is documented
- Append-only state transition rules are documented
- `proof existence ≠ distributed finality` invariant is explicit in all examples

**Release 4 — GitHub Action template**

Gate conditions:
- Template invokes `mindshift validate` before `mindshift execute`
- Template does not call `wrangler deploy` directly
- Template exits on any validation failure
- Template documents: "This action does not create authority"
- Template does not expose execution surface beyond the governed workflow boundary

**Release 5 — `mindshift` CLI + `@mindshift/sdk`**

Gate conditions:
- All 7 commands documented in §4 are present and covered by conformance
- `execute` command enforces the 5-step receipt gate (§4, execute command)
- SDK exports match type inventory in §5
- All returned objects are frozen
- `mindshift --version` returns semantic version
- `mindshift <command> --help` works for all commands

**Release 6 — `@mindshift/topology`**

Gate conditions:
- `inspectTopology` returns `executable: false, creates_authority: false` unconditionally
- `fail_closed_on_ambiguity` is enforced
- Topology export is read-only
- No write path is exported
- Topology inspection vectors are passing

---

## 10. Implementation Slice Ordering

### Slice table

| Slice | ID | Description | Depends on | Open/Controlled |
|-------|----|-------------|------------|-----------------|
| 1 | PKG-01 | Extract `@mindshift/canonical` from `cli/lib/canonical.mjs` | — | Open |
| 2 | PKG-02 | Write conformance pack-v2 fixture set (canonical + lifecycle) | PKG-01 | Open |
| 3 | PKG-03 | Write conformance pack-v2 harness | PKG-02 | Open |
| 4 | PKG-04 | Define `package.json` for `@mindshift/canonical` (exports map, epoch constant) | PKG-01 | Open |
| 5 | PKG-05 | Extract `@mindshift/proof` from `src/lib/proof-finality-metadata.ts` | PKG-01 | Open |
| 6 | PKG-06 | Extract `@mindshift/replay` from replay registry modules | PKG-01 | Controlled |
| 7 | PKG-07 | Extract `@mindshift/lineage` from reconciliation + lineage modules | PKG-01, PKG-05 | Controlled |
| 8 | PKG-08 | Extract `@mindshift/topology` from topology runtime modules | PKG-01, PKG-07 | Controlled |
| 9 | PKG-09 | Stabilize `@mindshift/sdk` package boundary (types, exports map, epoch) | PKG-01–PKG-08 | Open+Controlled |
| 10 | PKG-10 | Stabilize `mindshift` CLI package boundary (bin, commands, help text) | PKG-09 | Open+Controlled |
| 11 | PKG-11 | Write GitHub Action template (`governed-legitimacy.yml`) | PKG-10 | Open |
| 12 | PKG-12 | Write topology export documentation and examples | PKG-08 | Controlled |
| 13 | PKG-13 | Schema version lock: freeze epoch_v1 across all packages | PKG-01–PKG-12 | Open |
| 14 | PKG-14 | Conformance pack-v2 vector completion (all 7 suites passing) | PKG-02, PKG-03, PKG-09 | Open |
| 15 | PKG-15 | Backward compatibility audit: verify no auth surface widened | PKG-01–PKG-14 | Open |

### Slice dependency graph

```
PKG-01 (canonical)
  ├─ PKG-02 (pack-v2 fixtures)
  │    └─ PKG-03 (pack-v2 harness)
  │         └─ PKG-14 (pack-v2 vectors complete)
  ├─ PKG-04 (canonical package.json)
  ├─ PKG-05 (proof)
  │    └─ PKG-07 (lineage)
  │         └─ PKG-08 (topology)
  │              └─ PKG-12 (topology export docs)
  ├─ PKG-06 (replay)
  └─ [PKG-01–08] → PKG-09 (sdk)
       └─ PKG-10 (cli)
            └─ PKG-11 (github action)
[PKG-01–12] → PKG-13 (schema lock)
[PKG-01–14] → PKG-15 (compat audit)
```

### Non-operative slice marker

All slices are non-operative until a production release decision is made. Each slice produces:

- Source files (code or fixtures)
- A conformance vector update
- A schema epoch annotation

No slice produces:
- A published npm package
- A deployed service
- An authority record
- An execution surface wider than what existed before the slice

---

## 11. Portability Guarantees

### What portability means in this context

A primitive is **portable** if:

1. It can run in any Node 18+ environment without modification
2. It produces the same canonical hash for the same input, regardless of runtime host
3. It does not require access to the canonical runtime (D1, KV, Workers)
4. It does not require network access
5. Its conformance fixtures pass in isolation

### Replay-safe portability

Replay safety must survive portability. This is enforced by:

1. `restoration_eligible` is `false` as a static invariant — not configurable
2. The `ReplayRegistry` class maintains consumed nonces in-memory and does not expose a reset method
3. When integrated with an external runtime, the external runtime is responsible for persisting consumed nonces across invocations — the package does not provide this persistence, but it does enforce the invariant within a session
4. Fixture REPLAY-01 and REPLAY-02 in pack-v1 (and pack-v2 equivalents) verify this in isolation

### Hash portability

`hashCanonical` is deterministic across:
- Different Node versions (18, 20, 22)
- Different operating systems
- Different architectures

It is NOT guaranteed to be identical across:
- Different schema epochs (epoch_v1 vs epoch_v2)
- Different canonical form specifications

### Topology portability

Exported topology manifests are snapshots. They:
- Do not carry execution authority
- Do not carry implicit trust
- Are observability-only when consumed by `@mindshift/topology`
- Fail closed on ambiguity in any portable context

---

## 12. Replay-Safe Integration Constraints

### Constraint table for external integrators

| Constraint | Enforcement | Consequence of violation |
|------------|-------------|--------------------------|
| Compile before validate | SDK type gate | `validate` returns NOT_COMPILED_OBJECT issue |
| Validate before execute | Receipt gate | `execute` returns VALIDATION_FAILED violation |
| Do not re-execute a receipt | `executed` flag check | `execute` returns REPLAY_BLOCKED violation |
| Do not mutate a compiled object | Object.freeze | TypeError at mutation point |
| Do not mutate a receipt | Object.freeze | TypeError at mutation point |
| Do not restore consumed nonces | Static invariant | No API exists to do so |
| Do not trust topology implicitly | `fail_closed_on_ambiguity` enforced | Ambiguous topology → NULL |
| Do not compare hashes across epochs | Epoch constant check | Cross-epoch comparison returns EPOCH_MISMATCH |

### Integration lifecycle (external developer view)

```
1. Install: npm install @mindshift/sdk
            npm install -g mindshift

2. Compile:  const compiled = compile(rawObject, "my-workflow")
             // → CompiledLegitimacyObject (frozen, replay_safe: true)

3. Validate: const receipt = validate(compiled)
             // → ValidationReceipt (frozen)
             // if receipt.ok === false → stop; do not execute

4. Execute:  const result = execute(receipt, { dryRun: false })
             // → ExecutionResult (frozen)
             // validates: validated_object == executed_object

5. Reconcile: const check = reconcile(compiled, receipt, result)
              // → ReconciliationCheck (observability-only)

6. Inspect:  const lineage = proofLineage([compiled, receipt, result])
             // → ProofLineage (observability-only)
```

### What external integrators must not do

```
MUST NOT: call execute() without a valid ValidationReceipt
MUST NOT: modify compiled objects or receipts
MUST NOT: attempt to reconstruct a consumed nonce
MUST NOT: compare hashes across schema epochs
MUST NOT: use topology as execution authority
MUST NOT: assume GLOBAL_VALID without quorum evidence
MUST NOT: call the canonical runtime endpoints directly via SDK
```

---

## 13. Conformance Acceptance Checklist

Issue #1427 acceptance criteria — mapped to plan sections:

| Criterion | Section | Status |
|-----------|---------|--------|
| Package boundaries are defined | §2 Package Map, §3 Module Boundaries | DEFINED |
| CLI/SDK surfaces are specified | §4 CLI Command Specification, §5 SDK Surface Definition | DEFINED |
| Fixture formats are specified | §6 Fixture Format Definition | DEFINED |
| Open vs controlled layers are defined | §8 Open vs Controlled Layer Boundary | DEFINED |
| Release order is specified | §9 Release Sequencing | DEFINED |
| Replay-safe portability rules are documented | §11 Portability Guarantees, §12 Replay-Safe Integration Constraints | DEFINED |
| No authority surfaces are widened | §1 Non-goals, §2 Package classifications (authority-creating: false on all), §8 | VERIFIED |

### Invariant checklist

```
[ ] validated_object == executed_object         — enforced by SDK execute() receipt gate
[ ] replay safety must survive portability      — enforced by restoration_eligible: false invariant
[ ] open protocol ≠ open authority              — enforced by layer boundary (§8)
[ ] conformance ≠ execution authority           — enforced by all fixture _non_operative: true
[ ] capability ≠ authority                      — enforced by creates_authority: false on all types
[ ] no hidden execution paths                   — enforced by hidden_paths: false static invariant
[ ] no implicit topology trust                  — enforced by implicit_topology_trust: false static invariant
```

### Non-goal verification

```
[ ] No packages published by this plan              — PLAN ONLY
[ ] No services deployed by this plan               — PLAN ONLY
[ ] No authority created by this plan               — PLAN ONLY
[ ] No execution capability widened by this plan    — PLAN ONLY
[ ] No hidden execution paths introduced            — PLAN ONLY
[ ] No controlled runtime boundaries collapsed      — PLAN ONLY
```

---

## Closure

```
Stage 2 closure: internal primitives → reusable developer legitimacy surfaces
```

This plan is a non-operative planning artifact. It does not implement, deploy, mutate, or publish. It defines the bounded surface from which implementation slices (PKG-01 through PKG-15) may be executed in order, each remaining non-operative until a production release decision is separately authorized.
