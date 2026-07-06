# SYNAPSE

## Structural Analysis Engine & Framework

> From questions to trusted structural insight.

SYNAPSE is a general-purpose structural analysis framework for transforming topology into deterministic structural insight through formal mathematical models, compiler architecture, and reusable analysis engines.

The Dependency Algebra Compiler is the first structural compiler implemented within SYNAPSE. It is the current reference implementation for the framework's contracts, compiler boundary, fixtures, conformance expectations, and deterministic artifact model.

---

## Current Status

SYNAPSE has reached the **architecture-closure compiler milestone** for the Dependency Algebra Compiler reference implementation.

The current implementation includes:

- frozen schemas and fixtures
- frontend validator and normalizer
- canonical intermediate representation (IR)
- immutable typed compiler artifacts
- complement projection
- reachability analysis
- dependency predicate evaluation
- structural classification
- serialization boundary
- deterministic hash receipts
- thin CLI / `argparse` adapter
- compatibility APIs

These components establish a stable compiler artifact boundary: compiler stages exchange typed structural artifacts, while serialized forms and public compatibility APIs remain explicit boundary crossings.

---

## Vision

SYNAPSE is intended to be a long-term framework for structural analysis across multiple formalisms and application domains.

```text
Question
→ Mathematical Model
→ Formal Specification
→ Compiler
→ Structural Analysis Engine
→ Applications
```

Dependency Algebra is the first implemented formalism. It provides the initial mathematical model, compiler contracts, analysis pipeline, fixtures, and conformance suite used to validate the framework's structural-analysis approach.

---

## Repository Boundary

### This repository owns

- topology JSON contracts
- mathematical definitions
- parser / AST / IR contracts
- reachability semantics
- complement projection semantics
- dependency predicate semantics
- structural classification semantics
- deterministic compiler artifact schemas
- canonical fixtures
- conformance tests

### This repository does not own

- ContinuityOS governance validation
- execution eligibility
- runtime authorization
- proof generation
- authority propagation
- runtime policy
- mutation execution
- external-state mutation

> [!WARNING]
> `VALID`, `DEGRADED`, and `NULL` are structural classifications only.
> They are not governance decisions, execution authorizations, runtime proofs, or legitimacy results.

---

## Compiler Pipeline

```text
Raw Input
→ Frontend Validation
→ Canonical IR
→ Projection
→ Reachability
→ Predicate
→ AnalysisResult
→ Serialization
→ Hash Receipt
→ CLI / Public API
```

Compiler stages exchange immutable typed artifacts. Each stage receives a defined structural object and emits a defined structural object; mutation of previously emitted artifacts is outside the compiler contract.

Serialization owns representation. It converts internal typed artifacts into stable external forms without changing structural meaning.

Hashing owns artifact identity. Deterministic hash receipts identify serialized compiler artifacts and provide reproducible artifact references.

Compatibility APIs cross the serialization boundary. They preserve existing consumer-facing behavior while keeping the compiler core organized around typed internal artifacts.

---

## Long-Term SYNAPSE Architecture

```text
Topology
→ Structural Compiler
→ Structural Analysis Engine
→ Visualization
→ Optimization
→ Simulation
```

The current repository implements the compiler layer through the Dependency Algebra Compiler. Later SYNAPSE layers can consume compiler artifacts to power structural analysis engines, visualization surfaces, optimization workflows, and simulation environments without redefining the underlying formal contracts.

---

## Validation

Validation is organized around deterministic structural checks:

- JSON Schema structural validation
- deterministic semantic validation
- conformance suite

Run the Python conformance and unit validation suite with:

```bash
python -m unittest discover -s tests -p '*_tests.py'
```

---

## Contracts

All contracts are structural-analysis contracts only. They do not introduce governance, proof, authority, execution, policy, runtime, or mutation behavior.

| Contract | Purpose | Boundary | Current status |
| --- | --- | --- | --- |
| [`AST_IR_CONTRACT.md`](AST_IR_CONTRACT.md) | Defines the parser, AST, and canonical IR expectations for structural compiler inputs. | Owns syntax-to-IR structure; does not own runtime execution or external mutation behavior. | Reference contract for the compiler frontend and canonical IR. |
| [`REACHABILITY_CONTRACT.md`](REACHABILITY_CONTRACT.md) | Defines deterministic reachability semantics over canonical topology. | Owns structural graph traversal meaning; does not own governance validation or authorization. | Reference contract for reachability analysis. |
| [`COMPILER_FRONTEND_CONTRACT.md`](COMPILER_FRONTEND_CONTRACT.md) | Defines frontend validation, normalization, and transition into canonical compiler artifacts. | Owns input acceptance and normalization for the compiler; does not own policy or runtime legitimacy. | Reference contract for the validator / normalizer layer. |
| [`COMPLEMENT_PROJECTION_CONTRACT.md`](COMPLEMENT_PROJECTION_CONTRACT.md) | Defines complement projection semantics used before downstream structural analysis. | Owns projection meaning and artifact shape; does not own visualization, optimization, or execution. | Reference contract for projection artifacts. |

---

## Structural Classifications

SYNAPSE classifications describe structural-analysis outcomes:

- `VALID` — the analyzed topology satisfies the structural predicate under the relevant model.
- `DEGRADED` — the topology remains analyzable but exhibits structural loss, ambiguity, incompleteness, or weakened guarantees.
- `NULL` — the topology does not satisfy the structural predicate or cannot produce a valid structural result.

These classifications are intentionally bounded to structural analysis. They are suitable for compiler outputs, fixtures, conformance tests, and downstream structural consumers; they are not sufficient to authorize execution or establish runtime legitimacy.

---

## Design Principles

- Model topology explicitly before deriving conclusions.
- Keep mathematical definitions separate from runtime policy.
- Preserve immutable compiler artifacts between stages.
- Treat serialization as a boundary, not an internal representation leak.
- Make artifact identity deterministic through hash receipts.
- Keep compatibility APIs thin and boundary-aware.
- Validate with schemas, semantic checks, fixtures, and conformance tests.

---

## Repository Role

SYNAPSE is the product framework. Dependency Algebra is the first reference implementation within that framework.

The repository should therefore be read as both:

1. a concrete compiler implementation for Dependency Algebra; and
2. the initial structural-analysis substrate for future SYNAPSE engines.

This distinction keeps the current implementation precise while leaving room for additional mathematical models and structural compilers to share the same framework architecture.
