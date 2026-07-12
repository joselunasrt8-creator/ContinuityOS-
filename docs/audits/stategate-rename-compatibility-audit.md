# StateGate Rename and Compatibility Audit

Audit date: 2026-07-12

## Intent

Determine whether the repository has fully migrated the former **Merge Guard** GitHub Action identity to **StateGate** (`joselunasrt8-creator/stategate`) while preserving replay-sensitive compatibility surfaces.

## Scope

Searched source code, workflows, documentation, README files, scripts, tests, examples, templates, issue templates, generated evidence files, governance policy, runtime registries, and CI configuration for:

- `Merge Guard`
- `merge-guard`
- `MERGE_GUARD`
- `continuity-merge-guard`
- `joselunasrt8-creator/ContinuityOS-/actions/continuity-merge-guard`
- `joselunasrt8-creator/continuity-merge-guard`
- `joselunasrt8-creator/stategate`
- `StateGate`

## Preserved invariants

- Runtime replay identifiers are not renamed by this audit.
- Existing generated evidence and historical audit artifacts are not mutated by this audit.
- Required-check names are treated as compatibility-sensitive until branch protection migration is explicitly sequenced.
- `MERGE_GUARD_*` proof identifiers, proof artifact names, environment variables, conformance sentinels, and canonical record types are compatibility-sensitive replay surfaces unless a versioned proof migration is designed.

## Mutation-capable surfaces observed

- `.github/workflows/continuity-merge-guard.yml` runs the local action on pull requests.
- `.github/workflows/merge-proof.yml` reads/emits `MERGE_GUARD_*` evidence into merge proof governance.
- `actions/continuity-merge-guard/action.yml` defines the composite action metadata, inputs, outputs, environment variables, and uploaded proof artifact.
- `actions/continuity-merge-guard/check.mjs` generates proof IDs, proof artifact content, output names, and job summary text.
- Governance/runtime registries contain check topology and branch-protection references that can affect merge eligibility if renamed without migration.

## Rename Audit Matrix

| Surface class | Files observed | Classification | Finding | Required action |
|---|---|---:|---|---|
| Public installation examples | `README.md`, `actions/continuity-merge-guard/README.md`, `actions/continuity-merge-guard/ADOPT_AGENT_ATTRIBUTION_GATE.md`, `actions/continuity-merge-guard/examples/*.yml`, `actions/continuity-merge-guard/EXTERNAL_DEPENDENCY_PROOF_CHECKLIST.md`, `docs/dependency-formation/external-dependency-loop-closure.md`, `DEPENDENCY_TRACKER.md` | Accidental legacy reference / broken rebrand reference | Examples still use `joselunasrt8-creator/ContinuityOS-/actions/continuity-merge-guard@...`, not `joselunasrt8-creator/stategate@v1`. | Update all non-historical install examples to `uses: joselunasrt8-creator/stategate@v1`; mark old examples as historical only if retained for migration evidence. |
| Marketplace identity | `actions/continuity-merge-guard/action.yml`, `actions/continuity-merge-guard/MARKETPLACE_AUDIT.md` | Accidental legacy reference | Action display name and Marketplace audit still say ContinuityOS Merge Guard / standalone `continuity-merge-guard`. | Update current Marketplace-facing metadata/docs to StateGate; preserve dated audit history in a migration section. |
| Current workflow/check topology | `.github/workflows/continuity-merge-guard.yml`, `governance/runtime/BRANCH_PROTECTION_POLICY.json`, `governance/operational-risk/REQUIRED_CHECK_TOPOLOGY_AUDIT_2066.md`, evidence topology files | Required compatibility surface | Workflow and job names remain `continuity-merge-guard` / `merge-guard`. These names may be required branch-protection checks. | Do not rename blindly. Sequence branch-protection migration to a StateGate check name or explicitly document legacy check name compatibility. |
| Runtime/proof identifiers | `actions/continuity-merge-guard/check.mjs`, `action.yml`, `test.mjs`, merge-proof workflow, governance merge-legitimacy docs | Required compatibility surface | `MERGE_GUARD_PROOF`, `MERGE_GUARD-*`, `MERGE_GUARD_*` env vars, record type, and conformance sentinels remain. | Keep unless a versioned StateGate proof schema introduces aliases and replay migration. Document as intentional compatibility. |
| Product/adoption docs | `docs/product/*`, `docs/adoption/*`, `docs/strategy/*`, `docs/roadmap.md` | Accidental legacy reference unless dated/historical | Most current positioning and outreach docs still brand the product as Merge Guard. | Rename current product language to StateGate; keep Merge Guard only in a migration-history note. |
| Historical dependency evidence | `docs/dependency-formation/external-dependency-loop-closure.md`, `docs/audits/issue-2238-*`, `evidence/dependency-formation/*`, `governance/authorizations/gma_registry.jsonl` | Historical reference | These files record prior experiments, dated audit evidence, and authorization history. | Leave raw historical evidence unchanged; add forward pointers if needed. |
| Tests bound to fixture strings | `tests/issue-2013-dependency-formation-spine.test.mjs`, `actions/continuity-merge-guard/test.mjs` | Required compatibility / historical | Tests assert historical evidence strings and conformance sentinel names. | Preserve until the underlying evidence fixture is versioned; do not rename test literals without fixture migration. |
| Links and old repository URLs | `actions/continuity-merge-guard/MARKETPLACE_AUDIT.md`, `docs/audits/issue-2238-two-repo-determinism-evidence.md`, install examples | Broken/current or historical depending context | Old standalone repo `joselunasrt8-creator/continuity-merge-guard` appears in dated audits; install docs use old ContinuityOS subpath. | Replace current install/docs links with `joselunasrt8-creator/stategate`; keep dated evidence links with migration labels. |
| Badges/images/diagrams/screenshots/generated docs | `evidence/check-topology/*`, `docs/issues/external-dependency-topology-graph.md` | Generated/historical or stale generated reference | Generated check topology still shows `continuity-merge-guard` workflow/job. No StateGate badge/image evidence was found. | Regenerate after workflow/check migration; until then classify as accurate legacy topology evidence. |

## Remaining legacy references

The audit found legacy references in 48 tracked files. Notable current-facing files that still require migration are:

- `README.md`: product table, section heading, install example, live consumer language, and actions directory description still say Merge Guard / old action path.
- `actions/continuity-merge-guard/action.yml`: Marketplace-facing action name remains `ContinuityOS Merge Guard`; runtime env/output identifiers remain compatibility-sensitive.
- `actions/continuity-merge-guard/README.md`: public README still brands the action as Merge Guard and shows old `uses:` paths.
- `actions/continuity-merge-guard/ADOPT_AGENT_ATTRIBUTION_GATE.md`: adoption instructions still require old action `uses:` paths.
- `actions/continuity-merge-guard/examples/continuity-agent-attribution-gate.yml` and `.report-only.yml`: examples still use the old action path.
- `docs/product/MERGE_GUARD_POSITIONING.md`, `docs/product/PILOT_PERSONA.md`, and `docs/product/PILOT_FUNNEL.md`: product-facing language still centers Merge Guard.
- `docs/strategy/DEPENDENCY_FORMATION.md`, `docs/strategy/COOLDOWN_DEPENDENCY_WORK_QUEUE.md`, and `docs/roadmap.md`: strategy language still uses Merge Guard.
- `.github/ISSUE_TEMPLATE/merge-guard-validation-.md`: issue template name and text remain legacy-branded.
- `.github/workflows/continuity-merge-guard.yml`: current workflow and required-check topology still use legacy names.

## Intentional compatibility surfaces

These should not be flagged for mechanical rename without a versioned compatibility plan:

- `MERGE_GUARD_PROOF.json` artifact path and `MERGE_GUARD_PROOF` artifact name.
- `MERGE_GUARD-*` proof IDs.
- `record_type: MERGE_GUARD_PROOF`.
- `MERGE_GUARD_*` environment variables consumed by `check.mjs`.
- `MERGE_GUARD_CONFORMANCE_COMPLETE` test sentinel.
- Required status check/job IDs such as `merge-guard` and `agent-merge-guard` until branch protection is migrated.
- Historical generated evidence and dated governance records that prove prior Merge Guard behavior.

## Broken references

The migration is not complete because all current installation examples are required to use:

```yaml
uses: joselunasrt8-creator/stategate@v1
```

Current install examples still reference the legacy ContinuityOS subdirectory action path. These are broken for the new StateGate identity unless they are explicitly relabeled as historical migration evidence.

## Documentation inconsistencies

- The repository contains no current `StateGate` adoption surface outside this audit, while many current-facing docs still say Merge Guard.
- The action directory, workflow name, job IDs, issue template, product docs, and adoption examples are still legacy-branded.
- The Marketplace audit still names the old standalone repository instead of the published `joselunasrt8-creator/stategate` repository.
- Product docs do not yet explain the split between the new StateGate brand and retained `MERGE_GUARD_*` replay identifiers.

## Required follow-up issues

1. Update all current installation examples to `uses: joselunasrt8-creator/stategate@v1`.
2. Update Marketplace-facing metadata and current documentation to use `StateGate`.
3. Add a compatibility note documenting retained `MERGE_GUARD_*` proof/environment/schema identifiers.
4. Decide whether required check names remain `merge-guard` for compatibility or migrate to a StateGate check name with branch-protection sequencing.
5. Rename or supersede current-facing issue templates, examples, and product docs that still use Merge Guard.
6. Regenerate topology evidence after any workflow/check-name migration.
7. Preserve dated historical audit/evidence files but label them as migration history where linked from current docs.

## Conclusion

The Merge Guard → StateGate migration is **not complete**.

The repository still has broad current-facing legacy branding, old installation examples, old Marketplace references, old workflow/check names, and no complete documentation explaining which `MERGE_GUARD_*` identifiers are intentionally retained for replay safety. Compatibility-sensitive identifiers appear intentionally retainable, but that intent is not yet documented in a canonical StateGate migration note.
