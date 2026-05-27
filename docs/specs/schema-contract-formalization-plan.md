# MODE B — STRUCTURED ARTIFACT

## 1. Determination

This is **planning-only / non-operative** scope. The repository already contains runtime-canonical object semantics (ATAO, AEO, authority, validation, proof) and hash-bound invariants. Recommended work is to formalize and consolidate these into explicit machine-verifiable contract layers (JSON Schema + protobuf + serialization governance docs + conformance suites) **without changing runtime enforcement semantics**.

## 2. Existing Inventory

### Core schema artifacts
- `schemas/aeo.schema.json` — AEO shape with exactly five top-level required fields (`intent`, `scope`, `validation`, `target`, `finality`) and `additionalProperties: false` at top-level. **Status:** canonical baseline for exact AEO envelope; partial for nested strictness/enums/version governance.
- `schemas/atao.schema.json` — ATAO pre-execution object with required metadata and `risk_class` enum. **Status:** canonical intent-capture baseline; partial (no explicit schema version governance wrapper).
- `schemas/authority.schema.json` — authority object with lifecycle `status` enum and continuity/session binding fields. **Status:** canonical baseline; partial for explicit contract IDs and machine-verifiable version coupling.
- `schemas/proof.schema.json` — proof object with execution/authority/hash lineage fields and optional finality metadata. **Status:** canonical baseline; partial due to permissive nested objects (`proof_reference`, lineages) and potential duplication risk versus federated/reconciliation schemas.
- `schemas/continuity.schema.json`, `schemas/session.schema.json`, `schemas/identity.schema.json`, `schemas/preo.schema.json`, `schemas/sco.schema.json`. **Status:** canonical-adjacent supporting contracts.
- `schemas/federation/*` and `schemas/reconciliation/*` — envelope/evidence portability and reconciliation contracts. **Status:** canonical supporting layers; potential overlap with proof/finality representations.

### Runtime canonicalization + exact-object binding
- `src/lib/aeo-governance.ts` — defines `CanonicalAEO`, `REQUIRED_AEO_KEYS`, `toCanonicalAeo()` enforcing exact five-field AEO top-level discipline. **Status:** canonical.
- `src/canonical.js` — deterministic `normalize()`, `canonicalize()`, `sha256Hex()`, `hashCanonical()`. **Status:** canonical baseline serialization/hash primitive; partial vs explicit Unicode/timestamp/number normative policy text.
- `src/runtime/lineage/verifyLineageOrigin.ts` — compile/validate/execute/proof lineage origin checks. **Status:** canonical lineage guard.

### Database/lineage persistence surfaces
- `migrations/0001_init.sql`, `0006_enforcement_reboot_v1.sql`, `0008_canonical_runtime_registry_rebuild.sql` and follow-on migrations referencing `validated_object_hash`, replay/idempotency, lineage coupling. **Status:** canonical persistence lineage enforcement history.

### Tests/spec evidence
- `tests/enforcement-reboot-v1.test.mjs` and `tests/issue-569-*.test.mjs` — assert exact five-field AEO discipline.
- `tests/cicd-replay.test.mjs` — hash mismatch rejection + deterministic hash across key order.
- `tests/issue-1145-*.test.mjs` — canonicalize/hash boundary checks.

### Protobuf inventory
- No `.proto` files found in repository. **Status:** gap.

## 3. Gap Analysis

1. **Schema namespace/layout drift:** current schemas are flat (`schemas/*.schema.json`) plus federation/reconciliation folders; no explicit `schemas/json/<domain>/<version>` governed structure.
2. **Version governance gap:** no uniform schema version governance spec (semver rules, compatibility matrix, deprecation gates, changelog mandate).
3. **Contract strictness inconsistency:** top-level AEO is strict; several nested objects remain broad (`type: object` without strict sub-shapes).
4. **Canonical serialization policy is code-first, not spec-first:** behavior exists in `src/canonical.js`, but no canonical RFC-like policy doc for timestamps/unicode/number normalization semantics.
5. **No protobuf contract layer:** prevents typed binary interchange and cross-runtime contract conformance.
6. **Cross-format equivalence gap:** no conformance suite proving JSON Schema ↔ protobuf round-trip semantic equivalence for canonical fields.

## 4. Proposed File Layout

```text
schemas/
  json/
    continuityos/
      v1/
        atao.schema.json
        aeo.schema.json
        authority.schema.json
        validation-result.schema.json
        proof.schema.json
        decision-artifact.schema.json
  proto/
    continuityos/
      v1/
        atao.proto
        aeo.proto
        authority.proto
        validation_result.proto
        proof.proto
        decision_artifact.proto

docs/specs/
  machine-object-contracts.md
  canonical-serialization.md
  schema-version-governance.md
  protobuf-json-equivalence.md

tests/conformance/
  schemas/
  protobuf/
  canonicalization/
```

Notes:
- Keep existing `schemas/*.schema.json` as compatibility layer initially; add deprecation headers and references to canonical paths.
- Prefer package/path family `continuityos/v1` given existing docs naming trend, unless maintainers intentionally retain `mindshift` namespace.

## 5. Canonical Contract Rules

1. Required-field exactness for governed objects (no missing required fields).
2. Unknown-field rejection (`additionalProperties: false`) at governed object boundaries.
3. Deterministic canonicalization before any object hash calculation.
4. `object_hash` / `validated_object_hash` binds exact executable canonical bytes.
5. Validation boundary and execution boundary must operate on the same canonical object (`validated_object == executed_object`).
6. Execution must reject if recomputed canonical hash differs from validated hash.
7. Proof contract must bind at minimum: `execution_id + aeo_hash(validated_object_hash) + decision_id + target surface`.
8. Contracts must remain non-authoritative data models: no field may itself mint or widen authority.

## 6. JSON Schema Plan

### Global requirements
- Draft: JSON Schema 2020-12.
- Use `$id`, `$schema`, `title`, and immutable contract comments.
- Enforce `additionalProperties: false` for canonical envelopes and strict nested shapes where canon is already defined.
- Introduce `schema_version` only in wrapper metadata (or versioned path), not inside exact AEO core unless canon explicitly permits.

### AEO-specific requirement
- Enforce exactly five top-level fields: `intent`, `scope`, `validation`, `target`, `finality`.
- No top-level extension fields.
- Keep canonical core isolated from transport metadata.

### ATAO / Authority / Proof / ValidationResult
- ATAO: retain pre-execution nature; disallow fields implying post-validation legitimacy.
- Authority: include bounded status vocabulary and continuity linkage; avoid runtime-generated authority claims in input contracts.
- Proof: require lineage-binding fields; keep optional metadata evidence-only and non-authoritative.
- ValidationResult: explicit enum for `VALID` and fail-closed `NULL` outcomes/reasons aligned to current runtime reason taxonomy.

## 7. Protobuf Plan

### Package decision
- Preferred: `package continuityos.v1;`
- Alternative only if maintainers choose consistency with legacy branding: `mindshift.v1`.

### Required messages
- `ATAO`
- `AEO`
- `Authority`
- `DecisionArtifact` (or authority-bound decision envelope)
- `ValidationResult`
- `ProofOfTransfer`

### Required enums
- `RiskClass`
- `RuntimeOrigin`
- `TargetSystem`
- `ProofType`
- `ValidationOutcome`

### Constraints
- Proto messages must not admit semantically unknown top-level fields that JSON schema forbids; document strict parsing/unknown-field rejection in adapters.
- Define canonical JSON mapping profile for proto ↔ JSON boundaries so round-trip cannot alter hash-relevant semantics.

## 8. Canonical Serialization Plan

Define spec text (docs/specs/canonical-serialization.md) with normative MUST rules:
- UTF-8 encoding.
- Deterministic object key ordering (lexicographic).
- No insignificant whitespace.
- Stable array ordering where array order is semantically meaningful (do not reorder).
- Timestamp normalization profile (e.g., RFC3339 UTC `Z`, fixed precision policy).
- Unicode normalization policy (NFC baseline unless existing canon says otherwise).
- Deterministic number formatting and finite-number policy.
- Explicit null policy (`undefined` normalization already maps to `null` in runtime utility).
- Hash over canonical bytes; SHA-256 baseline unless canon formally upgrades.

Integration points:
- Keep `src/canonical.js` as implementation reference.
- Reference `src/lib/aeo-governance.ts` for exact AEO boundary normalization.
- Add conformance vectors to ensure same canonical bytes across environments.

## 9. Schema-Version Governance Plan

Create `docs/specs/schema-version-governance.md` with:
1. Versioned path rules (`.../v1/...`).
2. Semantic versioning policy:
   - MAJOR: breaking required/enum/shape changes.
   - MINOR: backward-compatible additive optional fields (where allowed).
   - PATCH: clarifications/non-semantic corrections.
3. Compatibility matrix:
   - runtime version ↔ accepted schema majors.
4. Deprecation policy:
   - announce, dual-validate period, removal date.
5. Migration policy:
   - explicit object translators with canonical equivalence tests.
6. Conformance gate:
   - no schema merge without fixtures + negative tests + changelog entry.
7. Sealed canon references:
   - immutable tagged references for normative contracts used by validator releases.

## 10. Conformance Test Plan

Recommended tests (non-operative; no runtime semantics expansion):
1. valid ATAO accepts.
2. ATAO missing required field rejects.
3. ATAO extra field rejects.
4. valid AEO accepts.
5. AEO extra top-level field rejects.
6. AEO missing top-level field rejects.
7. mutated AEO hash rejects at validation/execute boundary.
8. canonicalization stability across key order.
9. protobuf encode/decode round-trip preserves canonical semantics.
10. schema version mismatch triggers reject or explicit suspend policy.
11. proof lacking matching AEO hash lineage rejects.

## 11. Implementation Sequence

- **Stage 0 — inventory existing definitions** (this report; confirm canonical sources).
- **Stage 1 — add canonical schema directory** (`schemas/json/continuityos/v1`).
- **Stage 2 — add JSON Schema files** (AEO strict-first, then ATAO/authority/proof/validation).
- **Stage 3 — add protobuf files** (`schemas/proto/continuityos/v1/*.proto`).
- **Stage 4 — add canonical serialization spec** (`docs/specs/canonical-serialization.md`).
- **Stage 5 — add schema-version governance** (`docs/specs/schema-version-governance.md`).
- **Stage 6 — add conformance tests** (schema + canonicalization + proto round-trip vectors).
- **Stage 7 — update docs index** (cross-link old/new schema locations and governance docs).
- **Stage 8 — open PR with NON-OPERATIVE schema formalization** (docs/contracts/tests only).

## 12. Risk Controls

- Do not modify `/compile`, `/validate`, `/execute`, `/proof` runtime acceptance semantics in this phase.
- Preserve invariant chain: no ATAO → no AEO → NULL; invalid continuity/authority/validation/replay/proof predicates → NULL.
- Ensure adapter layers cannot inject authority-bearing fields outside canonical schemas.
- Keep migration of schema files additive-first with compatibility aliases; remove aliases only after deprecation window.
- Require reproducible conformance vectors in CI to avoid canonical drift.

## 13. Final Recommendation

**Recommendation: multiple PRs.**
1. **PR-1 (docs/contracts formalization first):** add governance docs + canonical layout scaffolding + mapped inventory (no runtime behavior edits).
2. **PR-2 (schema + conformance):** add versioned JSON schemas + negative/positive tests.
3. **PR-3 (protobuf + equivalence):** add `.proto` contracts and JSON/protobuf semantic parity tests.
4. **Optional PR-4 (runtime binding later):** only if maintainers explicitly scope adapter enforcement changes.

This sequencing best preserves bounded mutation, topology visibility, replay safety, and non-operative legitimacy semantics.
