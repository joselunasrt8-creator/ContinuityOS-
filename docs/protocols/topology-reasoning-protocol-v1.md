# Topology Reasoning Protocol v1

**Status:** NON-OPERATIVE  
**Layer:** Cognition Governance → Topology Reasoning Protocol  
**Runtime Authority:** NONE  
**Execution Authority:** NONE  
**Legitimacy Effect:** NONE

```
creates_authority:  false
executable:         false
mutation_capable:   false
```

## Classification

Layer: Observation / Lineage Analysis / Topology Reconstruction

Purpose: Failure discovery, topology analysis, and evidence-based closure.

This protocol is descriptive, not authoritative.

It grants no execution eligibility and introduces no runtime behavior.

---

## Structural Position

```
Intent
→ Cognition Governance
→ Topology Reasoning Protocol       ← this document
→ Continuity
→ Authority
→ ATAO
→ AEO
→ Ω Validator
→ Execution Boundary
→ Proof
→ Reconciliation
```

The protocol is read-oriented. It sits within Cognition Governance as a
parallel analytical framework alongside FATE, Breakglass, and Red Team analysis.
It does not subsume those frameworks.

```
Cognition Governance
├─ Topology Reasoning Protocol   ← observation, lineage, topology, constraint proposal
├─ FATE Analysis                 ← counterfactual paths, blast radius
├─ Breakglass Analysis           ← exceptional authority paths, recovery conditions
└─ Red Team Analysis             ← adversarial paths, bypass opportunities, invariant resilience
```

---

## Protocol

```
Observe
→ Trace Lineage
→ Reconstruct Topology
→ Extract Invariant
→ Locate Boundary Failure
→ Apply Smallest Corrective Constraint
→ Verify Closure
```

---

## Phase Definitions

### Phase 1 — Observe

Identify the anomaly, defect, or anomalous condition that triggered the
investigation.

Inputs:
- Event trace (CI logs, workflow run history, issue lineage, registry state)
- Observed behavior diverging from expected behavior

Outputs:
- Observed condition statement
- Scope of observation (what was seen, not what was inferred)

Boundary: Observation produces a description, not an explanation.
`Observation ≠ Explanation`

### Phase 2 — Trace Lineage

Reconstruct the causal chain of issues, PRs, merges, and workflow runs that
produced the observed condition.

Inputs:
- Observed condition from Phase 1
- Issue and PR history
- Merge event log
- Workflow run log

Outputs:
- Ordered lineage sequence (e.g. #N → #M → #P)
- Identified originating event
- Known gaps in lineage (if any)

Boundary: Lineage tracing is evidence-collection only.
`Visibility ≠ Legitimacy`

### Phase 3 — Reconstruct Topology

Map the execution path and structural relationships that enabled the
condition to manifest.

Inputs:
- Lineage from Phase 2
- Workflow definitions, branch patterns, trigger rules
- Registry and execution surface inventory

Outputs:
- Topology description (node → edge → node sequence)
- Identified re-entry points or cyclic paths
- Structural context for the boundary failure

Boundary: Topology description does not authorize or constrain anything.
`Topology ≠ Authority`

### Phase 4 — Extract Invariant

Identify the violated or absent rule that the topology failure implies.

Inputs:
- Topology from Phase 3
- Known invariants (docs/governance/invariant-registry.md)
- Expected system behavior

Outputs:
- Invariant statement (what should be true)
- Current state vs. required state
- Classification of violation (absent invariant, violated invariant, undefined boundary)

Boundary: An extracted invariant is a descriptive claim, not an enforcement mechanism.
`Analysis ≠ Legitimacy`

### Phase 5 — Locate Boundary Failure

Identify the specific execution surface or governance boundary at which
the invariant is not enforced.

Inputs:
- Invariant from Phase 4
- Topology from Phase 3
- Execution surface inventory

Outputs:
- Named boundary (e.g. workflow eligibility boundary, branch pattern filter)
- Description of why the boundary permits the failing condition
- Classification:

| Classification | Description |
|---|---|
| `LINEAGE_BREAK` | Causal chain cannot be established |
| `TOPOLOGY_DEFECT` | Structural path enables unintended behavior |
| `GOVERNANCE_BYPASS` | Execution surface reachable without authority gate |
| `REPLAY_ANOMALY` | Replay eligibility extends beyond intended scope |
| `RECURSIVE_ELIGIBILITY_PATH` | Execution outcome re-enters its own eligibility trigger |
| `INVARIANT_ABSENT` | No governing rule exists for the observed surface |
| `BOUNDARY_UNDEFINED` | Boundary exists but scope is unspecified |

Boundary: Locating a failure does not resolve it. The protocol may not
invoke enforcement or alter system state.
`Detection ≠ Decision`

### Phase 6 — Apply Smallest Corrective Constraint

Propose the minimal constraint that, if enforced, would terminate the
failure mode without altering unrelated system behavior.

Inputs:
- Boundary failure from Phase 5
- Invariant from Phase 4
- Execution surface inventory

Outputs:
- Constraint proposal (descriptive artifact)
- Expected effect if accepted
- Explicit scope: what changes, what is preserved

Form of a constraint proposal:

```
Failure Classification: <class>
Observed Invariant: <invariant statement>
Proposed Constraint: <minimal rule change>
Expected Effect: <failure mode terminated, scope unaffected>
```

Boundary: A constraint proposal is an analysis artifact, not a command.
`Proposal ≠ Permission`

The Authority layer may accept, reject, modify, or ignore any proposal.
The protocol has no ability to enforce outcomes.

Allowed flow:
```
Observation → Classification → Proposal → Authority Review
```

Disallowed flow:
```
Observation → Classification → Execution
```

### Phase 7 — Verify Closure

Assess whether the proposed constraint, if accepted and applied, would
produce a closed topology with respect to the identified failure mode.

Inputs:
- Constraint proposal from Phase 6
- Original topology from Phase 3
- Expected effect statement

Outputs:
- Closure assessment (descriptive): does the proposed constraint produce
  a topology in which the failure mode is unreachable?
- Residual paths (if any): known paths not addressed by the proposed constraint
- Confidence classification: CLOSED / PARTIAL / OPEN

Boundary: A closure assessment is not a closure state.
`Closure Analysis ≠ Closure State`

Actual closure requires Authority acceptance of the proposal and
independent implementation, validation, and enforcement.

---

## Functional Permissibility

### The protocol MAY:

- Observe
- Trace lineage
- Reconstruct topology
- Identify invariants
- Classify boundary failures
- Propose constraints
- Support closure analysis

### The protocol MAY NOT:

- Create authority
- Grant execution eligibility
- Validate execution
- Create proof
- Mutate registry state
- Authorize actions
- Declare legitimacy
- Declare convergence

---

## Hard-Stop Invariants

Violation of any hard stop indicates scope drift toward an authority surface.
The protocol must not proceed past a hard stop in the direction of authority.

```
Observation ≠ Explanation
Topology    ≠ Authority
Analysis    ≠ Legitimacy
Proposal    ≠ Permission
Closure Analysis ≠ Closure State
Detection   ≠ Decision
Classification ≠ Validation
Visibility  ≠ Legitimacy
```

---

## Canonical Compression

```
Topology Reasoning Protocol v1
=
the governed methodology
by which anomalous conditions are observed,
traced to their causal origin,
reconstructed as structural topology,
reduced to a violated invariant,
localized to a boundary failure,
and proposed for minimal corrective constraint —

without becoming execution,
without becoming authority,
without becoming legitimacy.
```

---

## Worked Example: Proof-Registry Recursion

**Source:** Issues #1734 → #1736 → #1743

### Phase 1 — Observe

Observed Condition: Proof persistence generated additional proof persistence.

A merge into a non-proof-registry branch triggered the `merge-proof` workflow,
which persisted proof into `proof-registry/*`. That persistence triggered
`merge-proof` again, which generated another proof-registry PR.

### Phase 2 — Trace Lineage

Known Lineage:
```
#1734 → #1736 → #1743
```

Origin: merge-proof workflow triggered on proof-registry PR merge.

### Phase 3 — Reconstruct Topology

```
PR Merge
→ merge-proof workflow
→ proof-registry PR
→ merge-proof workflow          ← re-entry
→ proof-registry PR             ← cycle
```

The `merge-proof` workflow eligibility included `proof-registry/*` branches.
Merges into `proof-registry/*` were not excluded from the trigger pattern.

### Phase 4 — Extract Invariant

Suspected Invariant: Proof persistence should be terminal.

Proof generation is the final step of the execution spine. An action
that generates proof should not itself become eligible to generate
further proof in a cycle.

### Phase 5 — Locate Boundary Failure

Boundary: Workflow Eligibility Boundary

```
Failure Classification: RECURSIVE_ELIGIBILITY_PATH
Observed Invariant: Proof persistence should be terminal.
Topology Context: Workflow eligibility included proof-registry/* branches.
Affected Boundary: Workflow Eligibility Boundary
Evidence: #1734 → #1736 → #1743
```

The boundary permits `proof-registry/*` branch merges to trigger
`merge-proof`, which creates the re-entry path.

### Phase 6 — Apply Smallest Corrective Constraint

```
Failure Classification: RECURSIVE_ELIGIBILITY_PATH
Observed Invariant: Proof persistence should be terminal.
Proposed Constraint: Exclude proof-registry/* branches from merge-proof
                     workflow trigger eligibility.
Expected Effect: Terminates recursive proof-generation chains while
                 preserving normal proof generation for all non-proof-registry merges.
```

### Phase 7 — Verify Closure

With the proposed constraint applied, the topology becomes:

```
PR Merge (non-proof-registry)
→ merge-proof workflow
→ proof-registry PR
→ [merge-proof workflow: NOT TRIGGERED — proof-registry/* excluded]
```

Closure Assessment: CLOSED — the re-entry path is unreachable under the
proposed constraint.

Residual Paths: None identified.

This artifact is descriptive only. It does not authorize execution, mutate
state, create legitimacy, or enforce constraints. Authority remains
responsible for accepting, rejecting, modifying, or ignoring the proposal.

---

## Relationship to Adjacent Protocols

| Protocol | Discovers | Does Not |
|---|---|---|
| Topology Reasoning Protocol | What is | Determine what happens next |
| FATE Analysis | What could happen | Describe current state |
| Breakglass Analysis | Exceptional conditions | Cover normal-path topology |
| Red Team Analysis | Adversarial conditions | Propose corrective constraints |
| Authority | What happens next | Observe or classify |

These protocols are parallel, not hierarchical. None subsumes another.
All are non-operative within Cognition Governance.

---

## Operative Boundary

This protocol is **NON-OPERATIVE**.

- Runtime legitimacy is **not instantiated** by this artifact.
- No execution authority is created.
- No execution paths are altered.
- No schema changes are introduced.
- No registry state is mutated.
- No authority changes are made.
- No legitimacy-state changes occur.

Future use of analysis artifacts produced under this protocol requires
separate Authority review, implementation, validation, and enforcement work.

---

*Status: NON-OPERATIVE. Evidence-only methodology. No authority created.*  
*creates_authority: false | executable: false | mutation_capable: false*  
*Canonical position: Intent → Cognition Governance → Topology Reasoning Protocol*
