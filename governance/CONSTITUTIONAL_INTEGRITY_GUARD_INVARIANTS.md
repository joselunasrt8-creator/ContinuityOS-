# Constitutional Integrity Guard Invariants

## Issue Reference

#1846

## Core Invariant

```text
raw diff content reference ≠ runtime route mutation
```

A pull request must fail constitutional-integrity checks only when it mutates governed runtime lifecycle structure or canonical route declarations — not when it merely references route-like strings in evidence, inventory, diagnostics, or generated artifacts.

## Allowed Detection

The constitutional-integrity guard may detect mutation through:

### Path-scoped detection
Detects changes to governed files:
- `governance/**`
- `src/runtime/validate.ts`
- `src/runtime/execute.ts`
- `src/runtime/canonicalize.ts`
- `src/runtime/authority.ts`
- `src/runtime/continuity.ts`

Implemented in `.github/workflows/constitutional-integrity.yml` step: "Detect constitutional drift".

### Declaration-scoped detection
Checks the canonical route declaration in `src/index.ts` directly:
```bash
grep -E '^const CANONICAL_RUNTIME_ROUTES = ' src/index.ts
```

Expected value is compared exactly. Any modification to the canonical lifecycle declaration triggers failure.

Implemented in `.github/workflows/constitutional-integrity.yml` step: "Verify canonical runtime routes unchanged".

### Lifecycle conformance tests
Tests across canonical routes:
- `/session`, `/continuity`, `/authority`, `/compile`, `/validate`, `/execute`, `/proof`

### Framework route registration detection (scoped)
Checks for addition of new express/router-style route registrations in the diff:
- `app.post(`, `router.post(`, `app.put(`, `router.put(`, `app.delete(`, `router.delete(`

These patterns are specific to framework-style route registration syntax and cannot match the codebase's actual direct pathname dispatch pattern (`if (url.pathname === ...)`). This check detects new framework-style routes being introduced, not generic route string references.

## Forbidden Detection

The guard must not detect runtime mutation through:

- grep-style pattern matching over raw diff contents for route strings (e.g., `/session`, `/continuity`)
- String matches in non-runtime generated artifacts
- Diagnostic or inventory references such as `OUTSIDE_CANONICAL_RUNTIME_ROUTES`
- Matches inside files such as:
  - `inventory.json`
  - `topology snapshots`
  - `generated reports`
  - `non-runtime route inventories`
- References to runtime-like strings outside scoped route declarations or governed runtime lifecycle files

## Preserved Distinction

```text
route declaration mutation ≠ route string reference
```

## Locking Mechanism

`tests/constitutional-integrity-guard.test.mjs` locks these invariants:

| Test | Invariant Locked |
|---|---|
| `constitutional guard scopes canonical route checks to the executable route declaration` | Confirms detection uses `src/index.ts` source, not raw diff grep |
| `artifact mentions of OUTSIDE_CANONICAL_RUNTIME_ROUTES do not fail scoped route guard` | Confirms inventory artifact references don't trigger false positives |
| `canonical route mutation still fails closed` | Confirms mutation is still detected correctly |
| `canonical lifecycle remains exactly ordered` | Confirms current state is clean |

Additional regression test added in `tests/constitutional-integrity-guard.test.mjs`:
- `route expansion detection uses framework-pattern scoped grep, not generic route string grep`
- `direct pathname dispatch pattern does not match forbidden route expansion patterns`
