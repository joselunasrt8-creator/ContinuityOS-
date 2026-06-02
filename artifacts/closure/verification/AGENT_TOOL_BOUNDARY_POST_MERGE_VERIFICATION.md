---
issue_lineage: #1737/#1744 post-merge verification; retained under #1609 topology compression
phase_lineage: Historical post-merge verification evidence; predecessor artifact identified by #1760 reduction eligibility
status: Archived historical verification; non-authoritative evidence
archive_classification: archive/closure/post-merge-verification
relocated_from: /AGENT_TOOL_BOUNDARY_POST_MERGE_VERIFICATION.md
relocated_to: /artifacts/closure/verification/AGENT_TOOL_BOUNDARY_POST_MERGE_VERIFICATION.md
relocation_date: 2026-06-02
authority_note: This artifact is observational/archive evidence only; it does not grant authority or alter governance enforcement.
---

# Agent Tool Boundary Post-Merge Verification

Verification context: repository state after merge commit `966292b Close agent tool call governance boundary (#1735)`.

## Scope and invariants verified

- Intent: verify closure integrity for the merged agent tool-call boundary only.
- Scope: static source/migration/test evidence plus the targeted agent tool boundary test file.
- Mutated surface for this verification: this report file only.
- Preserved invariants: no feature implementation, no authority widening, no execution semantics mutation, no replay-surface mutation.
- Mutation-capable surfaces inspected: `/agent/tool-call`, `agent_tool_call_atao_registry`, `agent_tool_invocation_registry`, canonical authority/validation/execution/proof registries.
- Proof requirements: exact source lines, migration constraints, tests, and merge-proof registry state.
- Validation requirements: targeted tests covering fail-closed authority, missing validation/proof, replay, read-only observability, and exact-object equality.
- Unresolved ambiguity: PR #1737 merge state cannot be proven from local Git history because this checkout has no configured remote; local merge-proof registry has no PR #1737 proof entry.

## Findings

| Check | Finding | Exact evidence |
| --- | --- | --- |
| `/agent/tool-call` route exists | PASS | `src/index.ts` defines `AGENT_TOOL_INVOCATION_ROUTE = "/agent/tool-call"` at line 549. Request dispatch classifies that pathname as `agentToolInvocationRoute` and includes it in governed mutation routes at lines 7675-7677. POST requests to that route call `handleAgentToolInvocationBoundary` at lines 7682-7683. |
| Migration 0063 exists | PASS | `migrations/0063_agent_tool_invocation_boundary.sql` exists and declares the agent tool invocation closure boundary at lines 1-4. It creates `agent_tool_invocation_registry` at lines 6-17. Note: a second local migration with the same numeric prefix, `migrations/0063_openclaw_govern_projection_hash.sql`, also exists; this verification did not alter migration ordering. |
| Append-only registry constraints exist | PASS | ATAO capture registry has append-only update/delete triggers in `migrations/0062_agent_tool_call_atao_capture.sql` lines 29-39 and runtime mirror triggers in `src/index.ts` lines 181-184. Invocation registry has a uniqueness constraint at `migrations/0063_agent_tool_invocation_boundary.sql` lines 6-17 and append-only update/delete triggers at lines 22-32. Runtime mirror DDL also creates the unique binding and triggers in `src/index.ts` lines 254-258. |
| Mutation tools fail closed without authority | PASS | The boundary queries `authority_registry` and returns `authority_missing` when no matching authority is present in `src/index.ts` lines 321-323. Targeted test asserts `status == NULL` and `reason == authority_missing` in `tests/issue-ungoverned-agent-tool-call-closure.test.mjs` lines 101-108. |
| Missing validation returns NULL | PASS | The boundary requires a `VALID` validation row from `validation_registry` and returns `validation_missing` when absent in `src/index.ts` lines 334-335. Targeted test asserts `status == NULL` and `reason == validation_missing` in `tests/issue-ungoverned-agent-tool-call-closure.test.mjs` lines 110-117. |
| Missing proof returns incomplete/NULL | PASS | The boundary requires a matching `proof_registry` row and returns `proof_missing` when absent in `src/index.ts` lines 341-342. Targeted test labels the condition as rejected as incomplete and asserts `status == NULL` plus `reason == proof_missing` in `tests/issue-ungoverned-agent-tool-call-closure.test.mjs` lines 119-126. |
| Replayed invocation returns NULL | PASS | The invocation registry has `UNIQUE(atao_hash, decision_id, validated_object_hash, invocation_nonce)` in `migrations/0063_agent_tool_invocation_boundary.sql` lines 6-17. Runtime inserts with `INSERT OR IGNORE` and returns `agent_tool_invocation_replay` when no row is inserted in `src/index.ts` lines 344-346. Targeted test proves first invocation is `PROVEN`, replay is `NULL`, and reason is `agent_tool_invocation_replay` in `tests/issue-ungoverned-agent-tool-call-closure.test.mjs` lines 128-138. |
| Read-only tool remains observability-only | PASS | `TOOL_RECONCILIATION_READONLY` returns `READONLY_OBSERVED`, `evidence_only: true`, `mutation_capable: false`, `execution_authority_required: false`, `runtime_mutated: false`, and `governance_state_altered: false` without reaching mutation insertion logic in `src/index.ts` lines 267-280. Targeted test asserts the read-only path does not require authority, does not report runtime mutation, and performs zero DB writes in `tests/issue-ungoverned-agent-tool-call-closure.test.mjs` lines 140-149. |
| `validated_object == executed_object` is enforced | PASS | The boundary rejects validation/execution hash mismatch as `validated_object_execution_mismatch` in `src/index.ts` lines 337-339. Proven responses expose both hashes and `validated_object_equals_executed_object` in `src/index.ts` lines 360-365. Targeted test asserts the proven invocation returns the same validated and executed object hash and equality flag `true` in `tests/issue-ungoverned-agent-tool-call-closure.test.mjs` lines 151-160. |
| PR #1737 merge proof exists or is still pending | PARTIAL | Local merge-proof registry contains entries only through PR #1729; `governance/merge-legitimacy/merge_proof_registry.jsonl` lines 2-10 list PRs 1712, 1713, 1716, 1718, 1719, 1717, 1725, 1728, and 1729. Local command evidence: `proof_count=9`, `latest_pr=1729`, `pr_1737_proof=ABSENT`. The workflow that would generate merge proofs is configured for merged PR close events in `.github/workflows/merge-proof.yml` lines 7-20, but this checkout has no configured Git remote, so PR #1737's live merge state could not be verified from the local repository. Finding remains PARTIAL / pending from local evidence. |

## Validation evidence

```text
$ npm test -- tests/issue-ungoverned-agent-tool-call-closure.test.mjs
✔ ungoverned_agent_tool_call: mutation tool without authority returns NULL
✔ ungoverned_agent_tool_call: mutation tool without validation returns NULL
✔ ungoverned_agent_tool_call: mutation tool without proof is rejected as incomplete
✔ ungoverned_agent_tool_call: replayed mutation invocation returns NULL
✔ ungoverned_agent_tool_call: read-only tool does not require execution authority and does not mutate state
✔ ungoverned_agent_tool_call: validated_object equals executed_object for proven invocation
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

## Overall closure status

PARTIAL.

The merged `/agent/tool-call` boundary itself verifies PASS against the requested closure properties with targeted tests passing. The only non-PASS item is PR #1737 merge-proof status: no local proof entry exists, and no remote is configured in this checkout to determine whether PR #1737 is merged and proof-pending or simply not yet present in this post-#1735 local history.
