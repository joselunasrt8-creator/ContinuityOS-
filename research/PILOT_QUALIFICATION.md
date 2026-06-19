Pilot Qualification Ledger

Purpose

Identify independent maintainers and teams whose workflows may become materially worse if ContinuityOS is removed.

Success condition:

A workflow depends on a ContinuityOS legitimacy primitive and experiences observable degradation when that primitive is removed.

---

Qualification Criteria

Required

- Independent maintainer or team
- Active repository
- Uses GitHub Actions
- Uses pull requests
- Uses branch protection or equivalent controls
- Willing to evaluate external tooling

Preferred

- AI-generated contributions
- Coding agents in workflow
- Multiple contributors
- Existing governance concerns
- Audit or compliance requirements

---

Candidate Template

Candidate Name

Repository:

Maintainer:

Contact Path:

Category:

- Open Source Maintainer
- AI Coding Agent User
- Engineering Team
- Infrastructure Team
- Other

---

Current Workflow

Describe current contribution path:

Contributor
→ PR
→ Review
→ Merge

Current controls:

- Branch Protection:
- Required Checks:
- AI Usage:
- Deployment Automation:

---

Observed Pain

Examples:

- AI-authored PR ambiguity
- Merge lineage uncertainty
- Agent attribution concerns
- Review burden
- Deployment trust concerns
- Workflow audit requirements

---

Current Alternative

How is the problem solved today?

Manual review:

Required checks:

Custom tooling:

Other:

---

Dependency Hypothesis

Proposed workflow:

Agent / Contributor
→ ContinuityOS Primitive
→ VALID | NULL
→ Merge Eligibility
→ Proof

Expected value:

- Improved trust
- Improved attribution
- Reduced ambiguity
- Stronger auditability
- Better workflow visibility

---

Pilot Plan

Install Surface:

Success Metric:

Evaluation Period:

Feedback Collection Method:

---

Qualification Result

Status:

- QUALIFIED
- PARKED
- REJECTED

Reason:

Date:

Owner:

---

Dependency Evidence

A dependency exists when:

Workflow with ContinuityOS
≠
Workflow without ContinuityOS

Evidence examples:

- Required check becomes load-bearing
- Attribution gate changes outcomes
- Merge eligibility changes
- Workflow is repeatedly used
- Maintainer requests continued availability

---

Current Objective

Find:

one independent maintainer
→ one governed workflow
→ one repeated use pattern
→ one observable degradation if removed

This is the next threshold beyond architecture proof and demonstration proof.

