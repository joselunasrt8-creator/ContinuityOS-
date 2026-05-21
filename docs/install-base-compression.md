# Install-Base Compression (Developer Framing)

**Classification:** `NON_OPERATIVE` · `DOCUMENTATION_ONLY` · `INSTALL_BASE_COMPRESSION` · `NO_RUNTIME_MUTATION`

## Core framing

In MindShift, **install base is not user count**.

Install base is the amount of real-world execution that is **dependent on legitimacy infrastructure**.

### Compressed definition

```text
install base =
  workflow dependency
+ execution dependency
+ governance dependency
```

- **Workflow dependency:** teams structure delivery through the canonical legitimacy flow instead of ad hoc mutation.
- **Execution dependency:** state changes are blocked unless validated objects pass authority, policy, and replay constraints.
- **Governance dependency:** release and runtime trust are tied to proof, lineage, and append-only legitimacy evidence.

## Short concept map

- **Governed execution:** execution is permitted only after canonical checks, not by operator intent alone.
- **Legitimacy dependency:** capability to run code is insufficient; legitimacy artifacts are required for state change.
- **Exact-object discipline:** the object that validates must be the exact object that executes (`validated_object == executed_object`).
- **Proof lineage:** each execution produces durable evidence linking authority, validation, execution, and proof.
- **Observability vs authority:** GET observability exposes evidence; it never grants permission.
- **Runtime closure:** mutation surfaces are constrained to the canonical path (`/authority → /compile → /validate → /execute → /proof`).
- **Distributed legitimacy visibility:** multiple systems can independently verify legitimacy status from shared evidence without inheriting mutation rights.

## Practical reading for developers

When evaluating install-base growth, ask:

1. How many workflows now require legitimacy checks before mutation?
2. How many execution paths are structurally unable to bypass validation?
3. How many governance decisions are anchored to proof lineage rather than informal trust?

If those dependencies rise, install base rises—even if user count does not.
