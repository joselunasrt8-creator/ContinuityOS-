# Repository Sovereignty Checklist

## Purpose

Track repository-level governance enforcement required to preserve governed mutation boundaries.

This artifact is non-operative.

It documents repository sovereignty expectations and enforcement evidence.

It does not:
- create authority
- mutate repository settings
- execute workflows
- alter deployment state
- enforce GitHub policy automatically

Canonical repository invariant:

```text
No direct mutation path to main
may bypass governed review.
```

---

## 1. Main Branch Protection Checklist

| Protection | Required | Status | Evidence |
|---|---|---|---|
| Require PR before merge | yes | pending manual verification | GitHub settings |
| Require maintainer/CODEOWNER review | yes | pending manual verification | GitHub settings |
| Require status checks before merge | yes | pending manual verification | GitHub settings |
| Block force pushes | yes | pending manual verification | GitHub settings |
| Block branch deletion | yes | pending manual verification | GitHub settings |
| Restrict direct pushes | yes | pending manual verification | GitHub settings |
| Require linear history if compatible | recommended | pending evaluation | GitHub settings |

---

## 2. Direct-Mutation Surface Classification

| Surface | Governance Status | Risk if Ungoverned |
|---|---|---|
| Direct push to main | prohibited | bypassed review |
| Force push | prohibited | lineage rewrite |
| Branch deletion | prohibited | governance evidence loss |
| Workflow dispatch | governed | unauthorized deployment |
| Release/tag creation | governed | unverifiable provenance |
| Admin override merge | high-risk | authority bypass |
| Local terminal push | governed by branch protection | hidden mutation path |

---

## 3. Release / Tag Provenance Checklist

| Requirement | Status | Evidence |
|---|---|---|
| Tagged releases reference merged PRs | pending verification | release metadata |
| Release notes map to governance issues | pending verification | release notes |
| Commit lineage remains append-only | pending verification | git history |
| Deployment artifacts trace to commits | pending verification | workflow logs |
| Provenance references preserved | pending verification | release records |

---

## 4. Governance Escalation Conditions

Escalate review if:
- direct push becomes available
- branch protection weakens
- CODEOWNERS bypass appears
- deployment bypass appears
- release provenance becomes unverifiable
- force-push capability is re-enabled

Required escalation output:

```text
approve
request changes
split issue
NULL
```

---

## 5. Sovereignty Closure Conditions

Queue A reaches closure when:
- branch protection settings are verified
- direct mutation paths are classified
- release provenance expectations are documented
- unresolved sovereignty gaps have bounded follow-up issues

Until then:

```text
repository sovereignty remains partially open
```

---

## Final Principle

```text
CODEOWNERS defines authority

branch protection enforces authority
```

---

## 6. AI-Generated Artifact Governance Checklist

Reference spec: `docs/ai-generated-artifact-governance-spec.md`

| Requirement | Required | Status |
|---|---|---|
| Proposal object treated as non-authoritative | yes | required for compliance |
| SimReady label treated as non-proof | yes | required for compliance |
| Canonical path enforced (`/authority -> /compile -> /validate -> /execute -> /proof`) | yes | required for compliance |
| Deterministic exact-object validation before use | yes | required for compliance |
| Proof persisted before registry acceptance | yes | required for compliance |
| Replay/idempotency protections enforced | yes | required for compliance |
| Missing authority/validation/proof/registry => fail-closed (`NULL`/`BLOCKED`/`QUARANTINED`) | yes | required for compliance |
