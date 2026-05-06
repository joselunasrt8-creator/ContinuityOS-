# MindShift Repository Regression Report

## Finding

The regression is an interface drift between the GitHub workflow layer and the Worker runtime layer.

- Last known aligned late checkpoint: `mindshift-demo-main 12.zip`
- First observed late broken checkpoint: `mindshift-demo-main 13.zip`

## Exact mismatch

`mindshift-demo-main 13.zip` preserved the PR workflow caller:

```text
.github/workflows/mindshift-validate-pr.yml → POST /validate-pr
```

But its Worker runtime no longer exposes:

```text
POST /validate-pr
```

The Worker runtime exposes the canonical path only:

```text
POST /authority
POST /compile
POST /validate
POST /execute
POST /proof
```

## Regression type

```text
Interface Drift / Breaking Contract
```

The workflow depended on a route that no longer existed.

## Final canonical restoration

The stale PR workflow has been removed from the operational workflow directory.

Operational workflows retained:

```text
.github/workflows/prepare-governed-deploy.yml
.github/workflows/governed-deploy.yml
```

This restores the repository to the canonical deploy path:

```text
/authority → /compile → /validate → /execute → /proof
```

## Why not restore /validate-pr?

Restoring `/validate-pr` would preserve a side validation surface outside the canonical execution chain. The canonical restoration removes the stale dependency instead of reintroducing the legacy endpoint.

## Evidence files

Extracted evidence is stored under:

```text
docs/regression-evidence/
```

Included:

- `main12/src.index.ts`
- `main13/src.index.ts`
- `main12/mindshift-validate-pr.yml`
- `main13/mindshift-validate-pr.yml`
- unified diffs for Worker and workflow files
