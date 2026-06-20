# ContinuityOS Rebrand

## 1) Why this repository is rebranding

This repository is rebranding to clarify product identity at the runtime layer:
- **ContinuityOS** names the operational runtime infrastructure.
- **MindShift** remains the canon and research umbrella.

This aligns project language with external positioning:

> ContinuityOS is distributed legitimacy infrastructure for execution-capable systems.

## 2) MindShift vs ContinuityOS relationship

- MindShift discovered the canon.
- ContinuityOS operationalizes it.
- MindShift remains the canon and research umbrella.
- ContinuityOS is the runtime substrate.

The repository now uses ContinuityOS-first naming for runtime surfaces while preserving MindShift references for canon lineage, ontology, and research origin.

## 2.5) Company layer (Continufy)

The ecosystem has three brand layers, not two. The 2026-06-20 branding audit
([`docs/branding/CONTINUFY_REBRANDING_AUDIT_AND_MIGRATION_PLAN.md`](branding/CONTINUFY_REBRANDING_AUDIT_AND_MIGRATION_PLAN.md))
adds **Continufy** as the company / parent brand above the existing research and
product layers:

- **Continufy** — Company / parent brand (the owning entity).
- **MindShift** — Research & cognition canon (research layer).
- **ContinuityOS** — Trusted action platform / product (runtime substrate).

Canonical attribution string:

> **ContinuityOS is a Continufy product, built on MindShift research.**

Continufy is introduced **additively**: it does not rename ContinuityOS or
MindShift, and it does not create or rename any repository. It is, in this pass,
an attribution and governance layer expressed in documentation prose. Company
repositories (`continufy`, `continufy-brand`, `continufy-website`) and any
domain remain deferred behind explicit governance approval.

## 3) Runtime naming map

Preferred runtime-facing naming:

- MindShift runtime → **ContinuityOS runtime**
- MindShift validator → **ContinuityOS validator**
- MindShift gateway → **ContinuityOS gateway**
- MindShift proof ledger → **ContinuityOS proof ledger**
- MindShift topology → **ContinuityOS topology**
- MindShift reconciliation → **ContinuityOS reconciliation**

Canon-facing naming that remains valid:

- MindShift canon
- execution ontology
- sealed canon artifacts
- research lineage
- foundational invariants

## 4) Terms that must not change

The following terms are canonical and must remain stable unless explicitly re-governed:

- AEO
- ATAO
- PREO
- SCO
- Omega Validator
- Proof-of-Transfer
- authority
- continuity
- reconciliation
- registry
- replay

## 5) Terms that may change

These surfaces can be updated during identity migration when semantics stay unchanged:

- project/repo branding text
- runtime-facing documentation labels
- package namespace planning labels
- repository description and metadata language

## 6) Migration stages

- **Stage 1 — Identity Layer:** README, security/contribution docs, package metadata, and top-level positioning become ContinuityOS-first.
- **Stage 2 — Documentation + Developer Surface:** developer docs adopt ContinuityOS runtime terminology while preserving MindShift canon references.
- **Stage 3 — Package / Namespace Preparation:** define package/module migration plan without destructive filesystem or import renames.

## 7) Non-goals

This rebrand does **not**:
- change runtime behavior
- change validator semantics
- change authority semantics
- change replay semantics
- change proof behavior
- alter database migrations
- create alternate execution paths
- imply deployment occurred

## 8) Canonical invariants preserved

All canonical invariants remain unchanged:

- If no valid object exists → nothing happens
- validated_object == executed_object
- authority-bound execution
- replay-safe execution
- proof-bound finality
- continuity lineage
- recursive reconciliation
- fail-closed semantics
- no bypass path

Runtime spine remains unchanged:

```text
/session
→ /continuity
→ /authority
→ /compile
→ /validate
→ /execute
→ /proof
```
