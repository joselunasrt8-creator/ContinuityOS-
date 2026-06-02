# Phase 3A Agent Gateway Specification

## 1. Purpose

This artifact specifies the Phase 3A architecture for the Canonical Agent Tool Gateway without implementing runtime gateway execution. It is a documentation-only classification and binding artifact for the parent/child issue pair:

- **#1627 Phase 3A Parent — Canonical Agent Tool Gateway** is the parent implementation/specification surface for canonicalizing agent tool requests before any legitimacy-bearing execution boundary.
- **#1628 Phase 3A Child — OpenClaw Execution Surface Classification** is the child classification surface for mapping OpenClaw execution-adjacent surfaces into the gateway vocabulary.

The specification captures the relationship between the canonical gateway, framework-specific adapters, OpenClaw execution-surface classification, surface-to-AEO template mapping, and validator/template binding requirements. It does not create authority, execute tools, mutate runtime legitimacy state, generate proof, or claim enforcement exists.

## 2. Core Invariants

Phase 3A preserves these invariants:

- **Capability ≠ authority.** A runtime's ability to invoke a tool does not create permission to execute it.
- **Tool selection ≠ authority.** Choosing a tool or operation is only a proposed action, not a legitimacy grant.
- **Agent plan ≠ execution permission.** Planning text, task decomposition, or chain-of-thought-equivalent orchestration is not authorization.
- **Validation ≠ execution.** Validator acceptance is an admission decision for a bounded object, not execution of that object.
- **Visibility ≠ legitimacy.** Observability improves auditability but does not itself legitimize state mutation.
- **No ATAO → No AEO → NULL.** Without an Agent Tool Action Object (ATAO), no Action Execution Object (AEO) may be produced, and the canonical result is `NULL`.
- **`validated_object == executed_object`.** The object validated at the boundary must be the exact object presented at execution; any post-validation mutation returns `NULL`.

## 3. Canonical Gateway Flow

The Phase 3A canonical gateway flow is descriptive, not implemented here:

```text
framework action
→ adapter normalization
→ ATAO
→ authority binding
→ AEO
→ Ω Validator
→ execution boundary
→ proof
→ registry / reconciliation
```

Flow semantics:

1. **Framework action:** A framework or runtime proposes an action using its native tool/action model.
2. **Adapter normalization:** A framework-specific adapter normalizes the action into canonical fields.
3. **ATAO:** The normalized proposal becomes an Agent Tool Action Object.
4. **Authority binding:** The ATAO is bound to pre-existing authority, if such authority exists; the gateway does not create authority.
5. **AEO:** A bound action is shaped into an Action Execution Object using the selected template.
6. **Ω Validator:** The validator admits only a template-bound, exact-object AEO or returns `NULL`.
7. **Execution boundary:** Execution remains outside this artifact; this specification introduces no execution behavior.
8. **Proof:** Proof is a required finality category where applicable, but this artifact generates no proof.
9. **Registry / reconciliation:** Registry and reconciliation are conceptual sinks for template identity, predicate identity, and finality metadata; this artifact mutates no registry.

## 4. Adapter Boundary

LangChain, OpenClaw, Cursor, Codex, Claude, and future runtimes enter the Phase 3A architecture through **framework-specific adapters**, not through framework-specific legitimacy models.

Adapters normalize proposed actions into canonical gateway vocabulary. They must not infer authority, widen scope, execute tools, or bypass the validator. A runtime may have native tool capabilities, but those capabilities remain descriptive until normalized into an ATAO and bound to pre-existing authority.

Minimum adapter fields:

| Field | Requirement |
| --- | --- |
| `framework_identifier` | Identifies the originating runtime or framework, for example `openclaw`, `langchain`, `cursor`, `codex`, or `claude`. |
| `agent_identifier` | Identifies the proposing agent or runtime actor. |
| `session_identifier` | Identifies the session or continuity envelope for replay and reconciliation. |
| `surface_type` | Names the execution surface being proposed, such as `shell_exec` or `filesystem_write`. |
| `proposed_action` | Contains the normalized action intent without treating it as permission. |
| `scope` | Defines declared bounds such as working directory, network domain, environment, timeout, or file path constraints. |
| `risk_class` | Classifies the surface using the Phase 3A taxonomy. |
| `identity_anchor` | References the actor/session identity material used for continuity checks. |
| `replay_domain_ref` | References the replay domain used to determine replay safety and idempotency expectations. |

## 5. Surface Taxonomy

The Phase 3A risk taxonomy is ordered from visibility-only surfaces to recursive autonomy surfaces:

| Risk class | Definition |
| --- | --- |
| `P0_READ_ONLY` | Observation-only surface that reads existing state without mutation, authority creation, or execution. |
| `P1_EXECUTION_ADJACENT` | Surface that influences execution context, routing, prompts, plans, or visibility but does not directly mutate external state. |
| `P2_BOUNDED_MUTATION` | Surface capable of bounded, local, or reversible mutation within declared constraints. |
| `P3_EXTERNAL_MUTATION` | Surface capable of mutating state outside the local execution envelope, including remote services, browser state, or network-facing systems. |
| `P4_PRIVILEGED_EXECUTION` | Surface capable of privileged process, shell, filesystem, environment, credential, or host-level effects. |
| `P5_AUTONOMOUS_RECURSIVE` | Surface capable of spawning or scheduling further autonomous activity, recursive agents, recurring actions, or delegated execution chains. |

## 6. OpenClaw Surface Inventory

OpenClaw surfaces are classified as capability surfaces only. `authority_capable` is always `false`; authority must be bound from outside the surface classification. `validator_bound` and `proof_generating` reflect current enforcement state: both are `false` because no OpenClaw adapter or gateway enforcement exists at classification time. `closure_state` uses the canonical enum — `OPEN` means the path is currently ungoverned and no boundary enforcement exists; `OBSERVABILITY_ONLY` means the surface is non-mutating and read-only. No mutation-capable surface is marked `CLOSED` because no repository evidence proves enforcement.

| `surface_id` | OpenClaw surface | `surface_type` | `risk_class` | `closure_state` | `mutation_capable` | `authority_capable` | `validator_bound` | `proof_generating` | `required_boundary` | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `oc-fs-read` | filesystem read | `filesystem_read` | `P0_READ_ONLY` | `OBSERVABILITY_ONLY` | `false` | `false` | `false` | `false` | ATAO visibility boundary | Non-mutating; reads may expose sensitive state. Visibility is not legitimacy. |
| `oc-fs-write` | filesystem write | `filesystem_write` | `P2_BOUNDED_MUTATION` | `OPEN` | `true` | `false` | `false` | `false` | AEO exact-object validation boundary | No enforcement exists; requires path, content hash, scope, and replay constraints before closure. |
| `oc-shell` | shell / exec | `shell_exec` | `P4_PRIVILEGED_EXECUTION` | `OPEN` | `true` | `false` | `false` | `false` | AEO privileged execution boundary | No enforcement exists; requires command allowlist, environment bounds, timeout, resource limits, and exact-object hash before closure. |
| `oc-browser` | browser | `browser` | `P3_EXTERNAL_MUTATION` | `OPEN` | `true` | `false` | `false` | `false` | AEO external mutation boundary | No enforcement exists; browser actions may alter remote state, authenticated sessions, or third-party systems. |
| `oc-cron` | cron / scheduled action | `scheduled_action` | `P5_AUTONOMOUS_RECURSIVE` | `OPEN` | `true` | `false` | `false` | `false` | AEO autonomous recurrence boundary | No enforcement exists; scheduled actions can recur beyond the initiating session and require finality and cancellation constraints. |
| `oc-gw-route` | gateway routing | `gateway_routing` | `P1_EXECUTION_ADJACENT` | `OPEN` | `false` | `false` | `false` | `false` | ATAO routing visibility boundary | No enforcement exists; routing affects which boundary receives a request and must not become implicit authority. |
| `oc-session` | session spawn | `session_spawn` | `P5_AUTONOMOUS_RECURSIVE` | `OPEN` | `true` | `false` | `false` | `false` | AEO recursive session boundary | No enforcement exists; spawning sessions creates delegated continuity surfaces requiring identity and replay domain constraints. |
| `oc-proc` | process control | `process_control` | `P4_PRIVILEGED_EXECUTION` | `OPEN` | `true` | `false` | `false` | `false` | AEO privileged process boundary | No enforcement exists; process start, stop, signal, or lifecycle mutation can affect host-level state. |
| `oc-behavioral` | behavioral files | `behavioral_files` | `P1_EXECUTION_ADJACENT` | `OPEN` | `true` | `false` | `false` | `false` | ATAO/AEO behavioral configuration boundary | No enforcement exists; behavioral files may reshape future agent behavior. Mutation requires exact content and scope constraints. |
| `oc-node-rt` | node / runtime | `node_runtime` | `P4_PRIVILEGED_EXECUTION` | `OPEN` | `true` | `false` | `false` | `false` | AEO privileged execution boundary | No enforcement exists; Node.js runtime invocations can execute arbitrary module code, spawn child processes, and access host resources without adapter normalization. |
| `oc-net-api` | network / API | `network_api` | `P3_EXTERNAL_MUTATION` | `OPEN` | `true` | `false` | `false` | `false` | AEO external mutation boundary | No enforcement exists; outbound HTTP/API calls cross the local execution envelope and require domain allowlists, idempotency key binding, and proof linkage before closure. |

## 7. Surface-to-AEO Mapping

AEO mappings require exact-object language: the exact target, scope, validation metadata, and finality fields validated by the Ω Validator are the only fields admissible at the execution boundary. Any substitution, implicit expansion, or post-validation mutation returns `NULL`.

| `surface_type` | Required AEO scope constraints | Required target constraints | Required validation constraints | Required finality / proof type | `NULL` / `UNKNOWN` conditions |
| --- | --- | --- | --- | --- | --- |
| `filesystem_read` | Allowed root/path set, symlink policy, max bytes, sensitivity label. | Exact path list or glob expansion hash; read mode; expected object identity where available. | ATAO id, decision id, active authority reference if required by policy, exact request hash, replay-domain reference. | Read receipt hash or observation log reference; proof optional unless policy requires. | Unknown path, unresolved glob, symlink escape, sensitivity mismatch, missing replay domain, exact-object hash mismatch. |
| `filesystem_write` | Allowed root/path set, create/overwrite/delete policy, content size limit, atomicity expectation. | Exact path, exact content hash or patch hash, file mode, expected preimage hash when overwriting. | ATAO id, decision id, require active authority, require exact-object hash, require replay safe, preimage check. | Write finality receipt; postimage hash; proof type `content_postimage_hash`. | Missing path/content/preimage where required, path escape, content hash mismatch, post-validation content mutation, replay-unsafe write. |
| `shell_exec` | Working directory, environment bounds, timeout, resource limits, network policy. | Exact `argv`, command allowlist reference, stdin hash if present. | ATAO id, decision id, require active authority, require exact-object hash, require replay safe, command allowlist decision. | Exit code, stdout hash, stderr hash, proof type `process_receipt_hash`. | Unknown command, shell string without parsed `argv`, environment escape, timeout missing, resource limits missing, exact-object hash mismatch. |
| `browser` | Allowed origin/domain set, credential policy, session isolation, navigation bounds. | Exact URL/action tuple, selector or target element hash where applicable, form payload hash. | ATAO id, decision id, require active authority for mutating browser actions, exact-object hash, replay safety classification. | Browser action receipt; DOM/state observation hash; proof type `external_interaction_receipt`. | Unknown origin, credential ambiguity, form payload mutation, non-idempotent action without authority, replay-unsafe external mutation. |
| `scheduled_action` | Schedule bounds, recurrence limit, cancellation condition, owner/session bounds, replay domain. | Exact schedule expression, exact action template hash, recurrence count, start/end bounds. | ATAO id, decision id, require active authority, exact-object hash, replay-safe recurrence, cancellation predicate. | Schedule registration receipt; recurrence ledger reference; proof type `scheduled_finality_receipt`. | Unbounded recurrence, missing cancellation, action template mismatch, ambiguous owner, post-validation schedule mutation. |
| `gateway_routing` | Allowed adapter set, target gateway boundary, routing policy version. | Exact route key, destination boundary id, normalized ATAO hash. | ATAO id, decision id if policy-bound, exact-object hash, replay-domain reference. | Routing receipt hash; proof optional unless policy requires. | Unknown adapter, unsupported route, route/template mismatch, normalized ATAO mutation, implicit authority inference. |
| `session_spawn` | Parent session id, child session bounds, identity anchor, replay domain, max delegation depth. | Exact child session request, delegated scope hash, adapter/runtime identifier. | ATAO id, decision id, require active authority, exact-object hash, replay-safe delegation, lineage check. | Child session receipt; lineage edge hash; proof type `session_lineage_receipt`. | Missing parent lineage, unknown identity anchor, unbounded delegation, recursive depth exceeded, post-validation delegated scope mutation. |
| `process_control` | Process namespace, allowed signal/action set, timeout, resource and owner bounds. | Exact process identifier or spawn spec hash, exact control action, expected pre-state where required. | ATAO id, decision id, require active authority, exact-object hash, replay safety, process identity check. | Process control receipt; exit/state transition hash; proof type `process_state_receipt`. | Unknown process identity, unauthorized signal/action, pre-state mismatch, resource escape, post-validation control mutation. |
| `behavioral_files` | Allowed behavioral file set, policy namespace, owner/session bounds, activation timing. | Exact file path, exact content hash or patch hash, expected preimage hash. | ATAO id, decision id, require active authority for mutation, exact-object hash, replay safety, behavioral impact classification. | Behavioral configuration receipt; postimage hash; proof type `behavioral_config_receipt`. | Unknown behavioral file, unbounded policy namespace, content/preimage mismatch, activation ambiguity, post-validation mutation. |
| `node_runtime` | Module/package allowlist, working directory, environment bounds, timeout, resource limits, network policy. | Exact module path or entrypoint hash, argv/invocation hash, expected module identity. | ATAO id, decision id, require active authority, require exact-object hash, require replay safe, module allowlist decision. | Exit code, stdout hash, stderr hash; proof type `runtime_execution_receipt`. | Unknown module, unallowlisted entrypoint, environment escape, resource limits missing, exact-object hash mismatch, side-loading detected. |
| `network_api` | Allowed origin/domain set, HTTP method allowlist, request size limit, credential policy, idempotency key policy. | Exact URL, HTTP method, request body hash, headers hash if credential-bearing. | ATAO id, decision id, require active authority for mutating requests, exact-object hash, replay safety via idempotency key. | HTTP status, response hash, external idempotency key; proof type `external_api_receipt`. | Unknown domain, unauthorized method, credential ambiguity, missing idempotency key for non-idempotent mutation, response ambiguity, timeout without confirmation. |

## 8. AEO Template Selection Rule

Template selection is deterministic:

- `surface_type` selects the AEO template.
- `risk_class` sets the enforcement floor.

Failure rules:

- Unknown `surface_type` → `UNKNOWN` / `NULL`.
- `surface_type` has no AEO template → `NULL`.
- `risk_class` below required floor → `NULL`.
- Missing required template fields → `NULL`.
- Post-validation mutation → `NULL`.

## 9. Template Registry Schema

A minimum template registry entry has this shape:

```json
{
  "template_id": "shell_exec_v1",
  "schema_version": "1.0",
  "surface_type": "shell_exec",
  "status": "ACTIVE",
  "risk_floor": "P4_PRIVILEGED_EXECUTION",
  "required_scope_fields": [
    "working_directory",
    "environment_bounds",
    "timeout_ms",
    "resource_limits"
  ],
  "required_target_fields": [
    "argv",
    "command_allowlist_ref"
  ],
  "required_validation_fields": [
    "decision_id",
    "atao_id",
    "require_active_authority",
    "require_exact_object_hash",
    "require_replay_safe"
  ],
  "required_finality_fields": [
    "proof_required",
    "proof_type",
    "exit_code_required",
    "stdout_hash_required",
    "stderr_hash_required"
  ],
  "predicate_set": [
    "check_required_scope_fields",
    "check_required_target_fields",
    "check_required_validation_fields",
    "check_required_finality_fields",
    "check_command_allowlist",
    "check_environment_bounds",
    "check_timeout",
    "check_resource_limits",
    "check_exact_object_hash",
    "check_replay_safe"
  ],
  "failure_result": "NULL"
}
```

This schema is illustrative and specification-only. It does not mutate any registry or activate enforcement.

## 10. Validator Binding Semantics

Validator/template binding semantics:

- The gateway selects the template.
- The AEO carries `template_id` + `schema_version`.
- The validator resolves the `ACTIVE` template.
- The validator loads the registered `predicate_set`.
- The validator executes predicates in registry-defined order.
- The validator returns `VALID | NULL`.

Failure rules:

- Missing `template_id` → `NULL`.
- Unknown `template_id` → `NULL`.
- Inactive `schema_version` → `NULL`.
- Template/surface mismatch → `NULL`.
- `risk_class` below template floor → `NULL`.
- Missing `predicate_set` → `NULL`.
- Unknown predicate → `NULL`.
- Duplicate predicate → `NULL`.
- Predicate failure → `NULL`.
- Post-validation mutation → `NULL`.

## 11. Two-Phase Validation

Validation is two-phase:

### Phase 1: structural validation

- Required scope fields.
- Required target fields.
- Required validation fields.
- Required finality fields.

### Phase 2: semantic/security validation

- Command allowlist.
- Environment bounds.
- Timeout.
- Resource limits.
- Exact object hash.
- Replay safety.

Rule:

> Shape first. Meaning second.

## 12. Validator Predicate Test Matrix

The following matrix is a specification target for validator predicate behavior. It is not an implemented test suite in this artifact.

| Test case | Condition | Expected result | Expected reason |
| --- | --- | --- | --- |
| TC-01 | Missing `template_id` | `NULL` | `INVALID_AEO_SHAPE` |
| TC-02 | Unknown `template_id` | `NULL` | `TEMPLATE_NOT_FOUND` |
| TC-03 | Missing `schema_version` | `NULL` | `INVALID_AEO_SHAPE` |
| TC-04 | `schema_version` not found | `NULL` | `SCHEMA_VERSION_NOT_FOUND` |
| TC-05 | Deprecated template | `NULL` | `SCHEMA_INACTIVE` |
| TC-06 | Draft template | `NULL` | `SCHEMA_INACTIVE` |
| TC-07 | Surface/template mismatch | `NULL` | `TEMPLATE_SURFACE_MISMATCH` |
| TC-08 | `risk_class` below template floor | `NULL` | `RISK_FLOOR_VIOLATION` |
| TC-09 | Missing required scope field | `NULL` | `MISSING_SCOPE_FIELD` |
| TC-10 | Missing required target field | `NULL` | `MISSING_TARGET_FIELD` |
| TC-11 | Missing required validation field | `NULL` | `MISSING_VALIDATION_FIELD` |
| TC-12 | Missing required finality field | `NULL` | `MISSING_FINALITY_FIELD` |
| TC-13 | Predicate hash mismatch | `NULL` | `PREDICATE_FAILURE` |
| TC-14 | Post-validation mutation | `NULL` | `OBJECT_MUTATION_DETECTED` |
| TC-15 | Complete `shell_exec` template-bound AEO | `VALID` | `VALID_TEMPLATE_BOUND_AEO` |
| TC-16 | Complete `filesystem_write` template-bound AEO | `VALID` | `VALID_TEMPLATE_BOUND_AEO` |

## 13. Closure Recommendation

- **#1627 remains open** as the Phase 3A parent implementation/specification surface.
- **#1628 remains open** as the OpenClaw child classification surface and is subject to maintainer closure review. The surface inventory (§6) has been updated to include `surface_id`, `closure_state` from the canonical enum, `validator_bound`, `proof_generating`, and explicit `node_runtime` and `network_api` surface entries. Classification is complete at specification scope; enforcement, adapter implementation, and runtime boundary integration belong to #1627 and future issues.
- **#1708 and #1709 are closed specification anchors.**
- This artifact does not close #1627 or #1628 unless maintainers decide the current scope is specification-only.

## 14. AEO Template Registry — Implementation Note

The AEO Template Registry has been introduced as a registry-backed template selection layer in migration `0067_aeo_template_registry.sql` and runtime helper `selectAEOTemplate` in `src/lib/agent-tool-gateway.ts`.

**What this introduces:**

- `aeo_template_registry` table with append-only enforcement (UPDATE/DELETE triggers raise ABORT).
- ACTIVE templates for: `filesystem_read_v1`, `filesystem_write_v1`, `browser_v1`, `gateway_routing_v1`, `behavioral_files_v1`.
- DRAFT templates for: `shell_exec_v1`, `process_control_v1`, `session_spawn_v1`, `scheduled_action_v1`, `node_runtime_v1`, `network_api_v1`.
- `selectAEOTemplate(surface_type, risk_class, db)` helper resolving `surface_type → predicate_set → VALID_TEMPLATE | NULL`.
- Template check wired into `handleAgentToolInvocationBoundary`, using `surface_type` derived from the hash-verified compiled AEO scope — not from caller-provided input.

**Anti-spoof property:** `surface_type` is derived from `exactCanonicalAeo.scope.surface_type` (authenticated by AEO hash). Caller-provided `surface_type` that disagrees with the AEO-scope-derived value is rejected as `TEMPLATE_SURFACE_MISMATCH`. A caller cannot substitute a lower-risk template by claiming a different `surface_type` than what is recorded in the authenticated AEO.

**What this does NOT do:**

- This does not authorize execution. `VALID_TEMPLATE` only confirms the schema predicate subject exists.
- This does not close #1627.
- This does not implement OpenClaw execution.
- This does not implement framework-neutral adapters.
- This does not enable P4/P5 execution. P4/P5 templates remain DRAFT.
- This does not create authority.
- This does not generate proof.

Execution still requires: authority binding, AEO validation, replay safety, topology visibility, reconciliation, and proof — all enforced by the existing downstream boundary checks.

## Boundary Statement

This artifact is documentation/specification only. It introduces no runtime code, validators, gateway implementation, tests, package changes, workflow changes, generated proof, registry mutation, live gateway execution, runtime legitimacy mutation, authority creation, or enforcement claim.
