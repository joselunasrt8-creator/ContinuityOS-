## Scope

- Issue:
- Branch:
- Invariant protected:
- Execution surface touched:

## Codex execution protocol

- [ ] One issue only.
- [ ] One issue-scoped branch only.
- [ ] One PR only.
- [ ] One invariant protected.
- [ ] One deterministic FATE/static expansion added or updated.
- [ ] No bundled refactors or unrelated cleanup.

## Runtime boundary confirmation

- [ ] Does not modify runtime logic unless explicitly scoped by the issue.
- [ ] Does not modify canonical routes unless explicitly scoped by the issue.
- [ ] Does not modify authority, proof, replay, validator, reconciliation, or schema behavior unless explicitly scoped by the issue.
- [ ] Does not create alternate execution paths, implicit authority, direct deploy paths, or proofless execution.

## Governance impact

- Replay implications:
- Proof implications:
- Bypass implications:
- Follow-up gaps as separate issue candidates:

## Verification

- [ ] `npm test`
- [ ] `npx tsc --noEmit`
