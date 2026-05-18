---
name: "Constitutional-Integrity Guard Invariant Documentation"
about: "Document invariants for path-based and declaration-based detection in constitutional-integrity guards."
labels: ["documentation", "constitutional-integrity", "path-scoping"]
---

### Summary
This issue documents invariants for the constitutional-integrity guard to ensure it functions without relying on raw diff content scanning. 

Raw content matching in diffs, including string searches outside scoped route declarations, must not trigger route mutation detection.

#### Allowed Detection:
- Path-based detection over files related to canonical runtime (e.g., `src/runtime/*`, `governance/cross-registry-*`).
- Explicit whitelisted checks for `CANONICAL_RUNTIME_ROUTES = [...]` declarations.
- Tests validating lifecycle conformance between `/session`, `/continuity`, `/authority`, `/compile`, `/validate`, `/execute`, `/proof`.

#### Forbidden Detection:
- Any `grep`-style pattern matching over the contents of a raw diff affecting runtime mutation detection.
- False failures triggered by generated inventory/diagnostic artifact files referencing non-runtime strings (`OUTSIDE_CANONICAL_RUNTIME_ROUTES`).
- String matches in `inventory.json` or routes unrelated to runtime mutation lifecycle.

### Verification
No current need for code changes if tests such as:
- `.github/workflows/constitutional-integrity.yml`
- `tests/constitutional-guard.test`, lock behavior preventing regressions or false positives.

### Issue Type:
- Documentation-update-only unless gaps exist in automated locking criteria.