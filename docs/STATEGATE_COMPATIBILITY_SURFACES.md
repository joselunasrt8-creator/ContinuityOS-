# StateGate Compatibility Surfaces

Audit date: 2026-07-12

## Intent and scope

This inventory executes PR 2 of the Merge Guard → StateGate migration. It is documentation-only and records load-bearing workflow, required-check, branch-protection, proof, replay, and topology identifiers before any future rename. No workflow, required-check, proof, runtime, CI, branch-protection, generated-topology, or replay semantics are changed here.

Inputs inspected:

- `docs/audits/stategate-rename-compatibility-audit.md`
- `.github/workflows/*.yml`
- `governance/runtime/BRANCH_PROTECTION_POLICY.json`
- `governance/operational-risk/REQUIRED_CHECK_TOPOLOGY_AUDIT_2066.md`
- `evidence/check-topology/*`
- `actions/continuity-merge-guard/*`
- merge-proof, PREO, SCO, conformance, runtime-test, release, deployment, proof registry, schema, and fixture surfaces

Classification values used below: `PUBLIC BRANDING`, `COMPATIBILITY SURFACE`, `RUNTIME CONTRACT`, `GENERATED ARTIFACT`, `HISTORICAL EVIDENCE`, and `UNKNOWN`.

## Required Check Matrix

GitHub branch protection binds to emitted job/check-run names, not to marketing names. In this repository, the normative in-repo branch-protection policy currently declares four required status checks. The same policy also records an activation-time set of three checks and a later topology classification that recommends additional load-bearing checks. Because live GitHub ruleset export is not committed in this repository, `referenced by branch protection` below means referenced by the in-repo branch-protection policy and activation record, not independently verified live settings.

| Required check / status context | Workflow file | Workflow name | Job id | Explicit job `name` | Check-run name / status context | Referenced by documentation | Referenced by branch protection | Referenced by topology | Referenced by proof generation | Rename impact |
|---|---|---|---|---|---|---|---|---|---|---|
| `merge-governance-check` | `.github/workflows/merge-governance-check.yml` | `merge-governance-check` | `merge-governance-check` | none | `merge-governance-check` | Yes: branch-protection governance, reverse-closure map, release gate, topology audit | Yes: `required_status_checks`, `emitted_check_inventory`, activation record | Yes: check-topology evidence and operational-risk audit | Yes: `merge-proof.yml` requires classifier parity and proof admission lineage | Requires documentation updates, branch-protection migration, generated topology regeneration, and release-gate update; may break downstream scripts that require this context. |
| `generate-preo-candidate` | `.github/workflows/preo-candidate.yml` | `preo-candidate` | `generate-preo-candidate` | none | `generate-preo-candidate` | Yes: branch-protection governance, release gate | Yes: `required_status_checks`, `emitted_check_inventory`, activation record | Yes: check-topology evidence and operational-risk audit | Indirect: PREO legitimacy is consumed by merge-proof governance model | Requires documentation updates, branch-protection migration, topology regeneration, and release-gate update; existing evidence remains historical but new name would need a replay note. |
| `generate-sco-candidate` | `.github/workflows/sco-candidate.yml` | `sco-candidate` | `generate-sco-candidate` | none | `generate-sco-candidate` | Yes: branch-protection governance, release gate | Yes: `required_status_checks`, `emitted_check_inventory`, activation record | Yes: check-topology evidence and operational-risk audit | Indirect: SCO visibility protects proof-bound governed mutation lineage | Requires documentation updates, branch-protection migration, topology regeneration, and release-gate update. |
| `constitutional-integrity` | `.github/workflows/constitutional-integrity.yml` | `constitutional-integrity` | `constitutional-integrity` | none | `constitutional-integrity` | Yes: branch-protection policy and required-check topology classification | Yes: `required_status_checks`, `emitted_check_inventory` | Yes: required-check topology classification | No direct proof generation dependency found | Requires documentation updates and branch-protection migration; evidence impact is lower than proof-producing checks but topology must be regenerated. |

### Load-bearing but not confirmed as currently required by the normative required-status-check array

| Check / context | Workflow file | Workflow name | Job id | Explicit job `name` | Check-run name / status context | Current status | Rename impact |
|---|---|---|---|---|---|---|---|
| `merge-guard` | `.github/workflows/continuity-merge-guard.yml` | `continuity-merge-guard` | `merge-guard` | none | `merge-guard` | The topology classification marks it load-bearing and blocking-recommended; adoption docs instruct consumers to require it. It is not in the current `required_status_checks` array. | Do not rename in this PR. Renaming would require downstream branch-protection migration in any repository that installed the action, merge-proof sidecar lookup changes, docs updates, and topology regeneration. |
| `Runtime conformance suite (npm test)` | `.github/workflows/runtime-tests.yml` | `runtime-tests` | `runtime-tests` | `Runtime conformance suite (npm test)` | `Runtime conformance suite (npm test)` | Required-check topology classification marks it load-bearing; current required-status-check array does not include it. | Rename only via zero-gap required-check migration because explicit job name controls the check-run name. |
| `Run conformance pack-v1` | `.github/workflows/conformance.yml` | `conformance-pack-v1` | `conformance` | `Run conformance pack-v1` | `Run conformance pack-v1` | Informational non-blocking. | Documentation/topology update only unless a downstream repo made it required. |
| `Canonical conformance suite (npm run conformance)` | `.github/workflows/canonical-conformance.yml` | `canonical-conformance` | `canonical-conformance` | `Canonical conformance suite (npm run conformance)` | `Canonical conformance suite (npm run conformance)` | Conformance-supporting; not listed as required. | Documentation/topology update only unless made required later. |
| `Fresh-clone install + demo` | `.github/workflows/demo-freshness.yml` | `demo-freshness` | `demo-freshness` | `Fresh-clone install + demo` | `Fresh-clone install + demo` | Informational non-blocking. | No merge effect if not required; topology evidence would need regeneration. |

## Compatibility Surface Matrix

| Identifier | Classification | Location | Purpose | External dependency | Replay-sensitive | Branch-protection-sensitive | Safe to rename | Migration required |
|---|---|---|---|---|---:|---:|---:|---:|
| `StateGate` | PUBLIC BRANDING | action metadata, current product docs | Public product/action brand replacing Merge Guard language | Marketplace/readme/users | No | No | Yes, with docs only | No for replay |
| `ContinuityOS StateGate` | PUBLIC BRANDING | `actions/continuity-merge-guard/action.yml` | GitHub Action display name | GitHub Marketplace UI | No | No | Yes | No |
| `actions/continuity-merge-guard/` | COMPATIBILITY SURFACE | action directory, local workflow `uses` path, docs | Existing repository-local action path and historical install path | Local workflow and older external examples | Yes for evidence paths | Indirect | No | Yes, if path is ever moved |
| `.github/workflows/continuity-merge-guard.yml` | COMPATIBILITY SURFACE | workflow file and merge-proof sidecar lookup | Runs StateGate/Merge Guard compatibility check | GitHub Actions API lookup by `merge-proof.yml`; topology evidence | Yes | Indirect/current downstream | No | Yes |
| `continuity-merge-guard` | COMPATIBILITY SURFACE | workflow `name`, topology evidence | Workflow identity and displayed check suite | GitHub Actions UI/API, topology artifacts | Yes | Indirect | No | Yes |
| `merge-guard` | COMPATIBILITY SURFACE | workflow job id, action step id, README/adoption docs | Check-run name consumers can require; step id for action outputs | Downstream branch protection and workflow expressions | Yes | Yes in downstream/adoption; blocking-recommended in repo topology | No | Yes |
| `agent-merge-guard` | COMPATIBILITY SURFACE | adoption examples/docs | External agent-lane required check | Downstream branch protection | Yes | Yes downstream | No | Yes |
| `MERGE_GUARD_PROOF` | RUNTIME CONTRACT | artifact name, action README, upload-artifact config | Stable proof artifact name | GitHub artifact consumers, docs, proofs | Yes | No | No | Yes |
| `MERGE_GUARD_PROOF.json` | RUNTIME CONTRACT | `check.mjs`, action upload path, README | Stable proof filename | Merge-proof sidecar consumers and manual evidence | Yes | No | No | Yes |
| `MERGE_GUARD-*` | RUNTIME CONTRACT | `check.mjs`, README, tests | Deterministic StateGate proof id prefix | Proof consumers and historical evidence | Yes | No | No | Yes |
| `MERGE_GUARD_*` env vars | RUNTIME CONTRACT | `action.yml`, `check.mjs` | Composite-action input contract for proof generation | Existing forks/local action invocations | Yes | No | No | Yes |
| `record_type: MERGE_GUARD_PROOF` | RUNTIME CONTRACT | `check.mjs`, README, proof examples/tests | Proof object discriminator | Proof parsers and fixture assertions | Yes | No | No | Yes |
| `MERGE_GUARD_CONFORMANCE_COMPLETE` | RUNTIME CONTRACT | action tests/conformance sentinel | Test completion sentinel | Test harness expectations | Yes | No | No | Yes |
| `merge-guard-v1` | RUNTIME CONTRACT | action proof schema/version references when present in evidence/docs | Algorithm/version identifier for first proof line | Proof replay and parser compatibility | Yes | No | No | Yes |
| `PROOF-{pr_number}-{merge_sha[:8]}` | RUNTIME CONTRACT | `merge-proof.yml`, `merge_proof_registry.jsonl` | Merge proof id | Proof registry, release/audit consumers | Yes | No | No | Yes |
| `_record_type: proof_entry` | RUNTIME CONTRACT | `governance/merge-legitimacy/merge_proof_registry.jsonl` | Append-only merge proof registry discriminator | Registry readers and lineage checks | Yes | No | No | Yes |
| `merge_proof_registry.jsonl` | RUNTIME CONTRACT | governance merge-legitimacy registry | Append-only proof persistence ledger | Merge-proof workflow, audits, lineage docs | Yes | No | No | Yes |
| `MERGE_PROOF_SPEC` | RUNTIME CONTRACT | merge-proof workflow policy comments/spec | Names merge-proof governance policy | Workflow comments/docs/governance | Yes | No | No | Yes |
| `MERGE_PROOF_PR_TOKEN` | COMPATIBILITY SURFACE | branch-protection policy, merge-proof workflow | Token for proof registry PR creation | GitHub secrets configuration | No | No | No without secret migration | Yes |
| `merge-governance-check` | RUNTIME CONTRACT | required workflow/job/check | Central merge admission gate | Branch protection, release workflow, docs | Yes | Yes | No | Yes |
| `generate-preo-candidate` | RUNTIME CONTRACT | required workflow/job/check | PREO candidate generation | Branch protection, release workflow | Yes | Yes | No | Yes |
| `generate-sco-candidate` | RUNTIME CONTRACT | required workflow/job/check | SCO candidate generation | Branch protection, release workflow | Yes | Yes | No | Yes |
| `constitutional-integrity` | RUNTIME CONTRACT | required workflow/job/check | Constitutional integrity gate | Branch protection/docs | Yes | Yes | No | Yes |
| `runtime-tests` / `Runtime conformance suite (npm test)` | COMPATIBILITY SURFACE | runtime tests workflow/check topology | FATE/runtime validation signal | Topology classification; possible future required check | Yes | Potential | No if required | Yes if required |
| `conformance-pack-v1` / `PACK_V1_CONFORMANCE_COMPLETE` | RUNTIME CONTRACT | conformance workflow/pack evidence | Portable deterministic conformance pack | External adopters and conformance evidence | Yes | No | No | Yes |
| `joselunasrt8-creator/stategate@v1` | PUBLIC BRANDING | current install examples/docs | New public install identity | External users | No | No | Yes with docs | No for replay |
| `joselunasrt8-creator/ContinuityOS-/actions/continuity-merge-guard@...` | HISTORICAL EVIDENCE | legacy examples/audits | Historical/compat install path | Existing older consumers | Yes historically | Yes downstream if installed | No in historical evidence | Yes for current docs only |
| `joselunasrt8-creator/continuity-merge-guard` | HISTORICAL EVIDENCE | marketplace/audit docs | Legacy standalone repo reference | Historical links | Yes historically | Unknown downstream | No in dated evidence | Only for current-facing docs |
| `mindshift-demo*` | COMPATIBILITY SURFACE | wrangler/deploy identifiers and identity residue docs | Cloudflare/D1 deploy identifiers intentionally retained | Cloudflare Worker/D1 bindings | Yes operationally | No | No | Yes |

## Runtime Contract Matrix

| Contract | Identifier(s) | Producer | Consumer | Why it remains |
|---|---|---|---|---|
| StateGate proof artifact contract | `MERGE_GUARD_PROOF`, `MERGE_GUARD_PROOF.json`, `record_type: MERGE_GUARD_PROOF` | `actions/continuity-merge-guard/check.mjs` and `action.yml` | GitHub artifact UI, merge-proof sidecar evidence, tests, docs | Existing proof evidence and consumers rely on these exact names; renaming would create a v2 proof schema, not a cosmetic change. |
| StateGate proof-id contract | `MERGE_GUARD-{pr_number}-{head_sha[:8]}` | `check.mjs` | Proof readers, tests, historical evidence | Prefix is part of deterministic replay identity. A StateGate alias can be added only by versioned migration. |
| Action input/env contract | `MERGE_GUARD_REPO`, `MERGE_GUARD_PR_NUMBER`, `MERGE_GUARD_HEAD_SHA`, `MERGE_GUARD_BASE_SHA`, `MERGE_GUARD_ACTOR`, attribution env vars | `action.yml` | `check.mjs`, copied/forked actions | Env names are private-ish but runtime-canonical inside the composite action; changing them risks silent NULL proofs. |
| Required merge gate contract | `merge-governance-check`, `generate-preo-candidate`, `generate-sco-candidate`, `constitutional-integrity` | GitHub Actions jobs | Branch protection, release verification, governance docs | Branch protection status contexts are exact string contracts. |
| Merge proof registry contract | `PROOF-*`, `_record_type: proof_entry`, `merge_proof_registry.jsonl` | `merge-proof.yml` | Governance/audit/release proof readers | Append-only evidence must remain replayable; changing discriminators would require dual readers and registry migration. |
| Release verification contract | `merge-governance-check`, `generate-preo-candidate`, `generate-sco-candidate` | `governed-release.yml` status check query | Release workflow | Release gate explicitly requires these check-run names to pass on the source commit. |
| Deployment replay contract | `governed-deploy.yml`, `REPLAY_ID`, `LINEAGE_BINDING_ID`, `gd-{run}-{attempt}-{sha}` | governed deployment workflow | Runtime endpoints and artifact readers | Names are included in replay and artifact identity; not part of Merge Guard branding. |

## Replay-Sensitive Objects

The following objects must not be renamed by mechanical brand migration:

- StateGate/Merge Guard proof artifact and record names: `MERGE_GUARD_PROOF`, `MERGE_GUARD_PROOF.json`, `MERGE_GUARD-*`, `record_type: MERGE_GUARD_PROOF`, and all `MERGE_GUARD_*` env names.
- Merge proof registry records: `PROOF-*`, `_record_type: proof_entry`, `proof_hash`, `merge_commit_sha`, `appended_at`, and `merge_proof_registry.jsonl`.
- Required-check status contexts listed in branch-protection policy and release verification.
- Workflow file names that are queried by API (`continuity-merge-guard.yml`) or named in replay/proof metadata (`governed-deploy.yml`, `merge-proof.yml`).
- Generated topology evidence under `evidence/check-topology/*`, including `workflow_headers.txt`, `workflow_inventory.txt`, and `CHECK_TOPOLOGY_CLASSIFICATION.md`.
- Conformance pack identifiers such as `conformance-pack-v1`, `PACK_V1_CONFORMANCE_COMPLETE`, suite/vector IDs, and fixture filenames.
- Cloudflare/deployment compatibility identifiers intentionally retained as operational surfaces (`mindshift-demo*`).

## Branch Protection Impact

Current in-repo branch-protection policy requires these status contexts:

1. `merge-governance-check`
2. `generate-preo-candidate`
3. `generate-sco-candidate`
4. `constitutional-integrity`

The activation record also records the first three checks at activation time. Required-check topology further classifies `merge-guard` and `Runtime conformance suite (npm test)` as load-bearing, but this inventory does not prove that they are live required checks in GitHub settings. A live GitHub branch-protection/ruleset export is still required before any actual required-check migration.

Changing any required status-context string before branch protection accepts the replacement would deadlock or de-gate merges. Changing a check after branch protection is migrated but before topology/proof/release docs are updated would create stale evidence and possible release failures. Changing downstream documented checks such as `merge-guard` or `agent-merge-guard` without consumer migration can break downstream repositories even if this repository's branch protection does not require them today.

## Topology

Topology artifacts encode workflow names, check names, repository/action names, and action paths.

| Artifact | Encodes workflow names | Encodes check names | Encodes repository/action names | Regenerate after future rename? | Notes |
|---|---:|---:|---:|---:|---|
| `evidence/check-topology/workflow_headers.txt` | Yes | Yes | Yes | Yes | Snapshot includes workflow headers, job ids, and local action path. |
| `evidence/check-topology/workflow_inventory.txt` | Yes | Indirect | No | Yes | Lists workflow filenames. |
| `evidence/check-topology/CHECK_TOPOLOGY_CLASSIFICATION.md` | Yes | Yes | No | Yes | Classifies load-bearing/informational/manual/post-merge checks. |
| `docs/issues/external-dependency-topology-graph.md` | Yes | Yes | Yes | Yes, if current-facing | Contains dependency graph nodes for install path and required check. |
| Generated runtime topology snapshots such as root/runtime graph inputs when present | Yes/unknown | Unknown | Unknown | Yes if they include renamed identifiers | Do not regenerate in this PR. |

No topology artifact was regenerated in this PR. Future rename PRs must regenerate topology only after the old and new checks overlap and branch protection has moved to the replacement contexts.

## Future Migration Plan

Required-check migration can be safe only as a staged, overlapping, evidence-preserving migration:

1. Export live GitHub branch protection and repository rulesets for `main`, including exact required status-check contexts and app bindings.
2. Add replacement StateGate-branded workflow/job/check names in parallel with the existing contexts; do not remove existing checks.
3. Run at least one PR where old and new checks both emit successful check runs for the same head SHA.
4. Update branch protection/rulesets to require both old and new contexts temporarily.
5. Verify merge queue, branch update requirement, release verification, and proof-generation sidecar behavior with both contexts present.
6. Update release verification and in-repo policy documents to recognize the new contexts.
7. Regenerate check topology and update current-facing docs/examples.
8. Keep proof identifiers (`MERGE_GUARD_*`, `MERGE_GUARD-*`, `MERGE_GUARD_PROOF`) stable unless a separate v2 proof schema adds aliases and dual-read replay support.
9. After multiple successful merges with both contexts, remove old required contexts from branch protection.
10. Only then retire old workflow/job names, preserving historical evidence and adding a migration note that maps old contexts to new contexts.

## Determination

Can required-check migration safely occur now? **No.** The repository has a detailed in-repo policy and topology inventory, but this PR does not include a live GitHub branch-protection/ruleset export proving the exact currently enforced required checks. Required-check migration is therefore **BLOCKED** until live branch-protection evidence is captured and a zero-gap overlapping check sequence is approved.

Final determination for this documentation-only PR: **READY TO MERGE**. The inventory is complete enough to preserve replay safety for PR 2 because it changes no runtime, proof, CI, topology, or branch-protection behavior.
