# Registry Mutation Containment — Issue #910

## Scope
Documentation-only inventory and classification of registry mutation surfaces (D1/KV/migrations/workflows/scripts), with bypass analysis against canonical legitimacy chain:

`/authority -> /compile -> /validate -> /execute -> /proof`

## 1) Registry write inventory
Primary runtime writes are implemented in `src/index.ts` and include INSERT/UPDATE paths for:
- session/continuity/authority/aeo/validation/invocation/execution/proof registries
- execution snapshot and proof propagation outbox
- attestation and governance observability registries

See machine-readable inventory: `governance/runtime/REGISTRY_MUTATION_SURFACE_INVENTORY.json`.

## 2) Mutable vs append-only classification
- **Append-only protected**: many governance/observability registries and `proof_registry` via triggers preventing UPDATE/DELETE in schema/migrations.
- **Mutable status-paths by design**: `authority_registry`, `invocation_registry`, `execution_snapshot_registry` use controlled UPDATE transitions.
- **Migration-time mutable paths**: historical migrations contain UPDATE/DELETE for proof dedupe/backfill.

## 3) Proof-gap analysis
- Runtime proof writes are bound to prior execution/validation lineage and use `INSERT OR IGNORE` + uniqueness/trigger constraints.
- Gap: migration-time proof cleanup/backfill (`0011`, `0041`) can rewrite/compact historical state outside live route-level authority checks (still PR/workflow governed).

## 4) Validator-gap analysis
- `/validate` persists validation records and reserves invocation nonce before execution path.
- Gap class: pre-authority surfaces (`/session`, `/continuity`) can create precursor state without validator coupling; they do not alone confer execution legitimacy, but are legitimacy-adjacent.

## 5) Replay-risk analysis
- Runtime replay protections present across invocation reservation, execution uniqueness checks, and proof duplicate guards.
- Residual replay risk surfaces: direct D1 CLI/manual migration re-run, out-of-band SQL shell writes, and migration reapplication semantics outside canonical runtime route chain.

## 6) Observability coverage analysis
- Observability registries are generally evidence-only, non-authoritative, append-only (trigger-guarded).
- Coverage is strong for read/evidence behavior, but observability depends on governance visibility for out-of-band migration/CLI writes.

## 7) Migration-surface analysis
- Migrations are schema mutation surfaces and not runtime-authority-bound.
- They are effectively PR/workflow-governed unless directly applied out-of-band.
- Potential bypass class: directly applying migrations to production-equivalent D1 without governed workflow boundary.

## 8) Direct-write bypass inventory
Potential bypass-capable classes:
1. direct SQL shell writes against D1
2. direct `wrangler d1 migrations apply` targeting uncontrolled environment
3. migration files with UPDATE/DELETE historical rewrites
4. runtime bootstrap DDL/DML helpers in worker startup path

## 9) Authority-gap analysis
- Canonical runtime mutation legitimacy is preserved for `/authority -> /compile -> /validate -> /execute -> /proof` writes.
- Authority-adjacent registries (session/continuity) are not authority-bound and must remain non-escalating.
- Migration/workflow/CLI paths are governance-bound rather than runtime-authority-bound.

## 10) Bounded closure proposal
1. Keep this inventory as control-plane artifact for #910 closure.
2. Mark migration/CLI/direct SQL paths as **OPEN** governance risks unless environment gating is externally enforced.
3. Preserve append-only triggers and proof replay constraints as non-regression checks.
4. Add/maintain CI assertions that no new runtime `UPDATE/DELETE` appears in legitimacy-critical registries without explicit exception review.
5. Treat any non-canonical mutation surface as governance-only and non-authoritative by policy.

## Conclusion
No new runtime bypass of validator/proof semantics was introduced in this patch scope (documentation only). Primary remaining concerns are governance-level direct-write/migration surfaces rather than canonical route semantics.
