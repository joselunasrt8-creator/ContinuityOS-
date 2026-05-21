# Deletion Report — 2026-05-21

## Scope
Repository surface-area reduction focused on non-authoritative artifacts outside runtime execution semantics.

## Removed artifact classes
- Binary runtime-adjacent PDFs and ZIP bundles.
- Transient scan outputs (`*.txt`) and trigger placeholders.
- Backup config artifact (`wrangler.jsonc.bak`).
- Archived snapshot dumps (`session_archives/*`).
- Regression-evidence mirror directory (`docs/regression-evidence/*`).
- Stale top-level system snapshot markdown.

## Safety constraints preserved
- No changes to `src/routes/*` execution pipeline.
- No changes to runtime mutation/validation/proof handlers.
- No schema semantic edits under `schemas/*`.
- No test logic mutation under `tests/*`.
