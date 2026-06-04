# Execution Surface Compression

**Audit Date:** 2026-06-04
**Purpose:** Classify governance artifacts as canonical, derived, or duplicated to reduce future governance drift

---

## Problem Statement

**Issue #1837** ("Declare canonical sources for EXECUTION_SURFACES, BYPASS_PATHS, and schemas") directly tracks this problem and identifies:
- 5 copies of `EXECUTION_SURFACES` across root, `governance/`, `governance/runtime/`, `runtime/`, `runtime/surfaces/`
- 4 copies of `BYPASS_PATHS` across the same locations
- Multiple schema copies across `schemas/`, `runtime/legitimacy/schemas/`, and namespace directories

This audit performs the classification that #1837 requires: canonical vs. derived vs. duplicated.

The repository contains multiple overlapping inventories:

- `BYPASS_PATHS.json`
- `EXECUTION_SURFACES.json`
- `GOVERNANCE_REQUIREMENTS.json`
- `GOVERNANCE_GAP_REGISTRY.md`
- `ROOT_AUTHORITY_INVENTORY.json`
- `AGENT_BYPASS_INVENTORY.json`
- `PHASE3_EXECUTION_SURFACE_INVENTORY.json`
- `governance/ROOT_BYPASS_PATH_INVENTORY.json`
- `governance/ROOT_AUTHORITY_CONTAINMENT_RULES.json`

When multiple artifacts classify the same surfaces independently, they drift. The question is: which are authoritative (enforcement-linked), which are derived (regenerable from canonical sources), and which are duplicated (overlap without clear ownership)?

---

## Classification

### CANONICAL — Single source of truth, enforcement-linked, actively maintained

| Artifact | Path | Rationale |
|---|---|---|
| `BYPASS_PATHS.json` | `/BYPASS_PATHS.json` | v2.0; directly referenced by enforcement (`merge-governance-check.yml`, runtime `AGENT_TOOL_MUTATION_UNCLASSIFIED → NULL`); drift taxonomy anchored here |
| `EXECUTION_SURFACES.json` | `/EXECUTION_SURFACES.json` | Canonical surface map; classification categories used in reconciliation |
| `GOVERNANCE_GAP_REGISTRY.md` | `/GOVERNANCE_GAP_REGISTRY.md` | Single canonical gap registry; gap IDs (GAP-001 through GAP-006) are the enforcement anchor; all other gap references derive from this |
| `MERGE_ACTOR_REGISTRY.json` | `governance/merge-legitimacy/MERGE_ACTOR_REGISTRY.json` | Single canonical merge actor allowlist; referenced by `merge-governance-check.yml` |

---

### DERIVED — Generated from canonical sources; can be regenerated; not enforcement-linked

| Artifact | Path | Derives from | Governance risk if stale |
|---|---|---|---|
| `PHASE3_EXECUTION_SURFACE_INVENTORY.json` | `/PHASE3_EXECUTION_SURFACE_INVENTORY.json` | Phase 3 audit of `EXECUTION_SURFACES.json` + codebase scan | Low — historical audit artifact; not enforcement-linked |
| `AGENT_BYPASS_INVENTORY.json` | `/AGENT_BYPASS_INVENTORY.json` | Phase 3A audit of `BYPASS_PATHS.json` + agent gateway surfaces | Medium — overlaps with BYPASS_PATHS; divergence not auto-detected |
| `runtime-topology.json` | `/runtime-topology.json` | Runtime topology graph derived from surface classification | Low — observational; not authoritative for enforcement |
| `ROOT_AUTHORITY_INVENTORY.json` | `governance/ROOT_AUTHORITY_INVENTORY.json` | Derived from root authority surfaces classified in BYPASS_PATHS + GAP_REGISTRY | Medium — some entries may duplicate BYPASS_PATHS classifications |
| Closure audit files (`CLOSURE_AUDIT_1626.md`, etc.) | `governance/merge-legitimacy/` | Derived from issue acceptance criteria + GitHub ruleset evidence | Low — historical audit records |

---

### DUPLICATED — Overlapping content with canonical sources; governance drift risk

| Artifact | Path | Overlap | Recommended action |
|---|---|---|---|
| `governance/ROOT_BYPASS_PATH_INVENTORY.json` | `governance/ROOT_BYPASS_PATH_INVENTORY.json` | Classifies bypass paths; overlaps with `/BYPASS_PATHS.json`; both are independently maintained | **Consolidate into `BYPASS_PATHS.json` or explicitly designate one as canonical, one as derived view** |
| `governance/ROOT_AUTHORITY_CONTAINMENT_RULES.json` | `governance/ROOT_AUTHORITY_CONTAINMENT_RULES.json` | Rules overlap with GAP-002 closure conditions in `GOVERNANCE_GAP_REGISTRY.md` | **Mark as derived from GOVERNANCE_GAP_REGISTRY.md; add `derived_from` field** |
| `GOVERNANCE_REQUIREMENTS.json` | `/GOVERNANCE_REQUIREMENTS.json` | Marked as "non-operative governance artifact" in own content; overlaps with GAP_REGISTRY canonical invariants | **Deprecate or redirect to GOVERNANCE_GAP_REGISTRY.md** |

---

## Drift Risk Classification

### Highest drift risk (two canonical-looking artifacts classifying same surface)

**`BYPASS_PATHS.json` vs `governance/ROOT_BYPASS_PATH_INVENTORY.json`**

Both classify bypass-capable paths. If they are updated independently:
- A new bypass path added to `ROOT_BYPASS_PATH_INVENTORY.json` but not `BYPASS_PATHS.json` is undetected by enforcement
- A path reclassified in `BYPASS_PATHS.json` but not `ROOT_BYPASS_PATH_INVENTORY.json` creates a visible inconsistency

**Resolution:** Designate `BYPASS_PATHS.json` as the single canonical bypass source. Convert `ROOT_BYPASS_PATH_INVENTORY.json` to a derived view with explicit `"canonical_source": "BYPASS_PATHS.json"` field and a regeneration note.

---

### Medium drift risk (phase audit not reconciled with canonical)

**`AGENT_BYPASS_INVENTORY.json` vs `BYPASS_PATHS.json`**

The Phase 3 bypass inventory classifies ~100+ surfaces against V1–V7 verification criteria. The canonical BYPASS_PATHS has 26 entries. The two are not kept in sync:
- New entries added to BYPASS_PATHS may not appear in AGENT_BYPASS_INVENTORY
- Entries in AGENT_BYPASS_INVENTORY with classification diverging from BYPASS_PATHS have no reconciliation mechanism

**Resolution:** Add an explicit reconciliation step to the governance mutation workflow or audit cycle: any BYPASS_PATHS entry must have a corresponding AGENT_BYPASS_INVENTORY verification classification, and vice versa.

---

### Low drift risk (non-operative artifacts)

**`GOVERNANCE_REQUIREMENTS.json`** — marks itself as non-operative; no enforcement binding. Safe to deprecate without breaking anything.

**`PHASE3_EXECUTION_SURFACE_INVENTORY.json`** — historical phase record; not enforcement-linked. Can remain as an audit artifact with an explicit `"artifact_type": "historical_audit"` field.

---

## Recommended Canonical Topology

```
Enforcement-linked (canonical, must be updated atomically):
  BYPASS_PATHS.json
  EXECUTION_SURFACES.json
  GOVERNANCE_GAP_REGISTRY.md
  governance/merge-legitimacy/MERGE_ACTOR_REGISTRY.json

Governance-classification reference (canonical, referenced but not enforcement-linked):
  governance/ROOT_AUTHORITY_INVENTORY.json

Derived (must NOT be independently updated — regenerate from canonical):
  AGENT_BYPASS_INVENTORY.json        ← derived from BYPASS_PATHS.json
  PHASE3_EXECUTION_SURFACE_INVENTORY.json  ← historical; read-only
  runtime-topology.json              ← derived from runtime state
  governance/ROOT_BYPASS_PATH_INVENTORY.json  ← SHOULD BE derived from BYPASS_PATHS.json

To be deprecated (non-operative, superseded):
  GOVERNANCE_REQUIREMENTS.json       ← superseded by GOVERNANCE_GAP_REGISTRY.md
  governance/ROOT_AUTHORITY_CONTAINMENT_RULES.json  ← add derived_from field or consolidate
```

---

## Actions Required to Prevent Future Drift

| Action | Priority | Effort |
|---|---|---|
| Add `"canonical_source": "BYPASS_PATHS.json"` to `ROOT_BYPASS_PATH_INVENTORY.json` | P1 | Low |
| Deprecate `GOVERNANCE_REQUIREMENTS.json` with redirect note to GAP_REGISTRY | P2 | Low |
| Add `"artifact_type": "historical_audit"` to `PHASE3_EXECUTION_SURFACE_INVENTORY.json` | P2 | Low |
| Define reconciliation trigger: BYPASS_PATHS update → AGENT_BYPASS_INVENTORY sync | P1 | Medium |
| Add `derived_from` to `ROOT_AUTHORITY_CONTAINMENT_RULES.json` | P2 | Low |

---

## Audit Statement

This document is an audit artifact only. It does not modify runtime behavior, schemas, execution semantics, or authority state.
