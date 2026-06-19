# Roadmap — One Board

> The single source of truth for active priorities. If work isn't here, it isn't a priority.

Status line:

**Architecture Proof ✓ · Demonstration Proof ✓ · Dependency Formation ?**

The organizing principle is dependency formation. Everything below is ranked by how
directly it moves an external owner along: Research → Demo → Sandbox → Pilot → Dependency.

## P0 — Prove external dependency

- **External Dependency** — get a repo outside this org to depend on Merge Guard as a
  required check, and keep depending on it.
- **Sandbox** — `continuityos-sandbox` as the external-validation surface (install,
  return, break-if-removed).
- **Agent Wedge** — the agent-facing entry that creates the first reason to install.

## P1 — Lower the cost of depending

- **Integrations** — connectors that make adoption incidental (CI, actions, SDK surfaces).
- **Installability** — a clean, short, repeatable install path.

## P2 — Broaden understanding

- **Visualization** — make topology/decisions legible.
- **Teaching Surface** — course/onboarding material that scales comprehension.

---

_Not on the board (by design): new canon, new ontology, new governance layers. See
[`ROOT.md`](../ROOT.md)._
