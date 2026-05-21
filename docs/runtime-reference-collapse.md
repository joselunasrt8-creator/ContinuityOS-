# Runtime Reference Collapse

## Canonical ownership model
`governance/runtime/CANONICAL_RUNTIME_OWNERSHIP.json` is the sole ownership registry for runtime/governance semantic domains. Each semantic domain is assigned exactly one authoritative source.

## Elimination strategy
Duplicate inventories and mirrored governance/runtime declarations are collapsed by:
- selecting one authoritative source per domain,
- marking former mirrors as deprecated duplicates,
- converting non-authoritative copies into either generated artifacts or archive-only objects.

## Duplicate collapse policy
If more than one authoritative source is detected for the same semantic domain, reconciliation fails closed (`FAIL_CLOSED`) and no regeneration is performed.

## Archive segregation semantics
Historical, evidentiary, generated, or non-authoritative files may be archived. Archive-only objects are explicitly blocked from authority escalation.

## Topology compression model
Topology semantics are owned by one canonical topology source. Other topology expressions must be derived from that owner and never become canonical.

## Validator drift prevention
The reconciler enforces one-way lineage from authoritative source to generated artifact so validators consume a single canonical semantic definition.

## Fail-closed reconciliation behavior
`scripts/runtime_reference_reconciler.mjs`:
1. validates singular ownership,
2. rejects archive/canonical escalation,
3. rejects derived/canonical escalation,
4. regenerates declared artifacts deterministically,
5. emits `governance/runtime/runtime_reference_reconciliation_report.json`.
