# Dependency Formation — Operational State

Compressed operational summary. The full research artifact lives in the
sandbox:
[`continuityos-sandbox/dependency-formation/FROM_TOOL_TO_DEPENDENCY.md`](https://github.com/joselunasrt8-creator/continuityos-sandbox/blob/main/dependency-formation/FROM_TOOL_TO_DEPENDENCY.md).

## Classification status

```text
Architecture Proof      COMPLETE
Execution Proof         COMPLETE
Governance Proof        COMPLETE
Dependency Proof        OPEN   (same-owner only)
```

The first three are no longer the bottleneck. The open question is not whether
ContinuityOS can govern execution in principle, but whether an external owner
will decide it *must* be present for a PR to remain mergeable.

## Frontier

```text
Outside-owner dependency proof
```

An **unaffiliated** repository makes ContinuityOS Merge Guard a required status
check on a protected branch and reports it as load-bearing — keeping it enabled
because removal would make its workflow worse. Current proof
(`continuityos-sandbox`) is real but **same-owner**, i.e. controlled
dependency proof, not the final frontier.

## Highest-leverage controllable work

Cooldown execution queue: [`COOLDOWN_DEPENDENCY_WORK_QUEUE.md`](./COOLDOWN_DEPENDENCY_WORK_QUEUE.md).

External pilot acquisition, treated as a **packaging / dependency-conversion**
exercise, not an architecture exercise:

- Canonical, consistent public install path (remove stale `mindshift-demo`
  snippets; converge on pinned `@v0.1.0`).
- Evidence visibility at the merge boundary (proof in the PR check run).
- A clear required-check configuration story for an outside owner.

## Acceptance criteria

- [ ] An outside-owner repository enables `merge-guard` as a required status
      check on a protected branch.
- [ ] A real PR in that repo exercises both `VALID → mergeable` and
      `NULL → blocked` under the required check.
- [ ] An independent operator reports that their merge workflow is materially
      worse if Merge Guard is removed (retention signal).

## Open question

```text
What specific event causes an outside-owner repository to make
merge-guard a required status check — and keep it?
```

## References

- Full research artifact:
  [`FROM_TOOL_TO_DEPENDENCY.md`](https://github.com/joselunasrt8-creator/continuityos-sandbox/blob/main/dependency-formation/FROM_TOOL_TO_DEPENDENCY.md)
  (sandbox).
- Merge Guard action:
  [`actions/continuity-merge-guard/README.md`](../../actions/continuity-merge-guard/README.md).
- Sandbox dependency evidence:
  `continuityos-sandbox` → `DEPENDENCY_ASSESSMENT.md`,
  `LOAD_BEARING_READINESS.md`, `NULL_ENFORCEMENT_PROOF.md`,
  `EXTERNAL_DEPENDENCY_PROOF.md`.
