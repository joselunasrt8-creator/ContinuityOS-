# Reverse-Closure Mutation Map

**Issue:** [#383](https://github.com/joselunasrt8-creator/mindshift-demo/issues/383)
**Generated:** 2026-05-22
**Artifact:** `runtime/REVERSE_CLOSURE_MUTATION_MAP.json`

---

## Purpose

A reverse-closure map enumerates every path by which repository, runtime, workflow, release, credential, deployment, registry, proof, or infrastructure state could change without passing through the canonical governance boundary.

Starting from the final closure condition and working backward into concrete gaps.

**Final closure condition:**

```
no unauthorized reality mutation path exists
```

**Canonical invariant:**

```
If no valid object exists → nothing happens.
```

**NULL semantics invariant:**

```
UNDECLARED_MUTATION_SURFACE → NULL
INSERT / UPDATE / DELETE on undeclared surface → NULL
```

---

## Incorporated Work

This map reflects the current state of main after the following merged work:

| Issue | Work |
|---|---|
| #896 | Cloudflare production authority bypass containment (CF-001–CF-005 classified; wrangler.toml preview isolation; governed-deploy.ts shell-wrapped wrangler detection; AUTHORITY_EXPIRY dynamic) |
| #584 | Cloudflare Git Integration external disable + residual bypass matrix RB-001–RB-005 |
| #890–#893 | Governed deployment spine (deployment_provenance_registry, deployment_proof_registry, deployment_rollback_registry — append-only, trigger-blocked, UNIQUE hash guards) |
| #360 | Governed D1 migration legitimacy (migration_governance_registry with schema CHECK constraints) |
| #358 | Mutation surface exhaustiveness (63 surfaces declared; UNDECLARED → NULL enforced) |
| #935 | Semantic consistency closure and NULL semantics normalization |
| #939 | Authorized mutation surface exhaustiveness (AUTHORITATIVE / EVIDENCE_ONLY / NON_EXECUTABLE classification) |

---

## Canonical Execution Chain

```
/session
  → /continuity
    → /authority
      → /compile
        → /validate
          → /execute
            → /proof
```

All state-changing execution that creates legitimacy must traverse this chain.

---

## Surface Classification

| Surface ID | Surface Name | Mutation Capability | Current Gate | Canonical Chain Required | Bypass Risk | Status | Proof Required | Authority Capable | Execution Capable | Creates Legitimacy | Linked Issue |
|---|---|---|---|---|---|---|---|---|---|---|---|
| RCM-001 | repository_direct_push | Yes | Branch protection advisory only | No | P1 | **OPEN** | No | No | No | No | #380 |
| RCM-002 | pr_merge | Yes | merge-governance-check + PREO/SCO | No | P1 | CONTAINED | Yes | No | No | Yes | #380 |
| RCM-003 | branch_protection_enforcement | Yes | Policy document only, not enforced | No | P1 | **OPEN** | No | No | No | No | #380 |
| RCM-004 | codeowners_review | No | CODEOWNERS advisory (depends on #380) | No | P1 | CONTAINED | No | No | No | No | #380 |
| RCM-005 | github_actions_workflow_dispatch_governed | Yes | canonical chain + nonce + expiry | Yes | P1 | CONTAINED | Yes | No | Yes | Yes | #584 |
| RCM-006 | github_actions_workflow_dispatch_ungoverned | Yes | prepare-governed-deploy no deploy capability | Yes | P2 | CONTAINED | No | No | No | No | #584 |
| RCM-007 | github_actions_scheduled_automatic | No | No scheduled deploy workflows | No | P0 | **CLOSED** | No | No | No | No | #383 |
| RCM-008 | cloudflare_git_integration | No | External disable active + env isolation | No | P3 | CONTAINED | No | No | No | No | #584 |
| RCM-009 | wrangler_deploy_governed | Yes | governed-deploy.ts context guard + artifact | Yes | P1 | CONTAINED | Yes | No | Yes | Yes | #584 |
| RCM-010 | cloudflare_api_token_deploy | Yes | None (root credential) | No | P3 | **BREAK_GLASS** | No | Yes | Yes | No | #584 |
| RCM-011 | local_terminal_deploy | Yes | governed-deploy.ts context guard (bypassable) | No | P3 | **BREAK_GLASS** | No | Yes | Yes | No | #584 |
| RCM-012 | d1_migration_apply | Yes | migration_governance_registry (evidence only) | No | P2 | CONTAINED | No | No | No | No | #360 |
| RCM-013 | runtime_api_mutation_routes | Yes | 7-step canonical chain (auth+validator+proof bound) | Yes | P1 | CONTAINED | Yes | Yes | Yes | Yes | #358 |
| RCM-014 | proof_registry_writes | Yes | /proof route exclusive; append-only evidence surfaces trigger-blocked | Yes | P1 | CONTAINED | Yes | No | No | Yes | #891 |
| RCM-015 | deployment_provenance_proof_rollback_registries | No | Append-only, trigger-blocked, UNIQUE hash guards | Yes | P0 | **CLOSED** | No | No | No | No | #890 |
| RCM-016 | release_tag_creation | Yes | None (no governed release workflow) | No | P2 | **OPEN** | No | No | No | No | #382 |
| RCM-017 | package_artifact_publication | Yes | None (no publish workflow) | No | P2 | **OPEN** | No | No | No | No | #382 |
| RCM-018 | agent_codex_cursor_tool_mutation | Yes | AGENTS.md protocol + merge governance (advisory) | No | P1 | CONTAINED | No | No | Yes | No | #695 |
| RCM-019 | root_credential_break_glass | Yes | Explicit break-glass classification; audit log only | No | P3 | **BREAK_GLASS** | No | Yes | Yes | No | #584 |
| RCM-020 | reconciliation_observability_surfaces | No | GET-only routes; NON_EXECUTABLE classification | No | P0 | OBSERVABILITY_ONLY | No | No | No | No | #383 |
| RCM-021 | install_base_telemetry_surfaces | No | Append-only, trigger-blocked, non-authoritative | No | P0 | OBSERVABILITY_ONLY | No | No | No | No | #903 |
| RCM-022 | adversarial_verification | No | Not yet implemented | No | P1 | **OPEN** | No | No | No | No | #695 |

---

## Residual Gaps

### Critical (P1–P3 OPEN / BREAK_GLASS)

#### RCM-001 + RCM-003 — Branch Protection Not Enforced (#380)
- **Gap:** `BRANCH_PROTECTION_POLICY.json` is `policy_only_non_enforcing`. GitHub repository settings do not enforce required status checks, PR reviews, or block direct pushes to `main`.
- **Consequence:** Repository owner or admin can push directly to `main`, merge without PREO/SCO checks, and bypass CODEOWNERS review.
- **Closure:** Enable GitHub branch protection per `BRANCH_PROTECTION_POLICY.json`. Disable admin bypass. Require `merge-governance-check`, `generate-preo-candidate`, `generate-sco-candidate` as required checks.

#### RCM-010 — Cloudflare API Token Deploy (#584)
- **Gap:** `CLOUDFLARE_API_TOKEN` with `Workers:Write` scope allows direct `wrangler deploy` production mutation outside the canonical chain. No MindShift proof registry binding. Only observable in Cloudflare dashboard.
- **Consequence:** Root-level production mutation possible without session/authority/proof lineage. Classified BREAK_GLASS / non-normal execution.
- **Closure:** Scope token to GitHub Actions OIDC. Eliminate static token with `Workers:Write` scope.

#### RCM-011 — Local Terminal Deploy (#584)
- **Gap:** Developer with valid `CLOUDFLARE_API_TOKEN` can invoke `wrangler deploy` directly, bypassing `governed-deploy.ts` wrapper entirely. Wrapper is not cryptographically enforced.
- **Consequence:** Same as RCM-010. Classified BREAK_GLASS / non-normal execution.
- **Closure:** Resolved by RCM-010 closure (no local token = no local deploy).

#### RCM-016 + RCM-017 — Release/Tag and Package Publication (#382)
- **Gap:** No governed release or tag creation workflow. Tags can be created without canonical chain traversal, PREO validation, or proof lineage. No release provenance boundary.
- **Consequence:** Released artifacts cannot be traced back to governed repository state.
- **Closure:** Define release provenance and artifact attestation boundary per #382. Require signed tags, passing validation evidence, and proof lineage reference before release.

#### RCM-022 — Adversarial Verification Not Implemented (#695)
- **Gap:** No adversarial execution surface verification suite exists. Residual exploitability of bypass-capable mutation surfaces is unknown.
- **Consequence:** This map represents best-effort classification from available evidence. Undiscovered bypass vectors may exist.
- **Closure:** Implement adversarial verification infrastructure per #695. Regenerate adversarial verification after this map is merged.

---

## Required Invariants

| Invariant ID | Description | Satisfied |
|---|---|---|
| INV-001 | Cloudflare Git Integration is CONTAINED: external disable active + code-side isolation per #896/#584 | Yes |
| INV-002 | All break-glass/root credential paths are explicitly classified as non-normal execution (BREAK_GLASS status) | Yes |
| INV-003 | Observability and telemetry surfaces are OBSERVABILITY_ONLY and cannot create authority or gate execution | Yes |
| INV-004 | Release/tag creation is OPEN linked to #382 until release provenance governance is enforced | Yes |
| INV-005 | Main branch protection is OPEN linked to #380 until GitHub branch protection rules are enforced | Yes |
| INV-006 | Adversarial verification is OPEN linked to #695 until adversarial suite is implemented and regenerated after this map | Yes |
| INV-007 | NULL semantics normalization: undeclared mutation surface → NULL enforced by exhaustiveness scanner and schema CHECKs | Yes |
| INV-008 | Deployment provenance/proof/rollback registries are append-only, trigger-blocked, evidence-only (CLOSED) | Yes |

---

## Summary

| Status | Count | Surface IDs |
|---|---|---|
| CLOSED | 2 | RCM-007, RCM-015 |
| CONTAINED | 10 | RCM-002, RCM-004, RCM-005, RCM-006, RCM-008, RCM-009, RCM-012, RCM-013, RCM-014, RCM-018 |
| OPEN | 5 | RCM-001, RCM-003, RCM-016, RCM-017, RCM-022 |
| BREAK_GLASS | 3 | RCM-010, RCM-011, RCM-019 |
| OBSERVABILITY_ONLY | 2 | RCM-020, RCM-021 |

| Bypass Risk | Count |
|---|---|
| P0 (no mutation or contained) | 5 |
| P1 (governance controls in place) | 9 |
| P2 (partial; requires external action) | 4 |
| P3 (root authority bypass) | 4 |

---

## Closure Definition

This issue (#383) is complete when all known mutation-capable surfaces are declared, classified, and assigned a closure status. This map satisfies that condition.

**Remaining open issues for closure work:**

- **#380** — Enable main branch protection (closes RCM-001, RCM-003)
- **#382** — Define release provenance boundary (closes RCM-016, RCM-017)
- **#584** — Scope `CLOUDFLARE_API_TOKEN` to GitHub Actions OIDC (closes RCM-010, RCM-011)
- **#695** — Implement adversarial verification suite (closes RCM-022)

Each discovered gap is assigned to one issue, one branch, one PR, one invariant.
