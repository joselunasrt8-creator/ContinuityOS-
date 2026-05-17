#!/usr/bin/env python3
"""Extract a deterministic, observability-only repository graph.

This script reads local repository files and emits a graph JSON object suitable
for later Neo4j ingestion.

Boundary:
- no network calls
- no runtime execution
- no authority creation
- no validation decision
- no proof generation
- no registry mutation

Canonical invariant preserved:
visibility != authority
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


REPO_ROOT_DEFAULT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = Path("graph/repo_graph.json")

SCAN_GLOBS = (
    ".github/workflows/*",
    "src/index.ts",
    "src/routes/*",
    "src/lib/*",
    "tests/*.mjs",
    "tests/fate/*.mjs",
    "EXECUTION_SURFACES.json",
    "BYPASS_PATHS.json",
)

RUNTIME_ROUTE_RE = re.compile(r"/([A-Za-z0-9_\-]+)")
KEYWORD_CLASSES = {
    "Authority": ("authority", "decision_id", "authority_registry"),
    "ATAO": ("atao", "agent tool action"),
    "AEO": ("aeo", "validated_object_hash", "exact object"),
    "Validation": ("validate", "validator", "VALID", "NULL"),
    "Execution": ("execute", "execution", "invocation"),
    "Proof": ("proof", "proof-of-transfer", "pot", "proof_registry"),
    "Registry": ("registry", "ledger", "persist"),
    "Reconciliation": ("reconcile", "reconciliation", "drift"),
    "BypassPath": ("bypass", "direct deploy", "raw database", "wrangler deploy"),
    "ExecutionSurface": ("deploy", "workflow_dispatch", "database", "api", "mutation"),
    "GovernanceObject": ("preo", "sco", "policy", "governance"),
}


@dataclass(frozen=True)
class Node:
    id: str
    labels: tuple[str, ...]
    properties: dict[str, object]


@dataclass(frozen=True)
class Edge:
    source: str
    target: str
    type: str
    properties: dict[str, object]


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def stable_node_id(label: str, key: str) -> str:
    return f"{label}:{sha256_text(key)[:16]}"


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")


def iter_scan_files(repo_root: Path) -> list[Path]:
    files: set[Path] = set()
    for pattern in SCAN_GLOBS:
        for path in repo_root.glob(pattern):
            if path.is_file():
                files.add(path)
    return sorted(files, key=lambda p: p.as_posix())


def classify_file(path: Path, text: str) -> list[str]:
    labels = ["File"]
    normalized = path.as_posix().lower()
    lowered = text.lower()

    if ".github/workflows/" in normalized:
        labels.append("Workflow")
    if normalized.startswith("src/routes/") or normalized == "src/index.ts":
        labels.append("RuntimeRoute")
    if normalized.startswith("tests/fate/"):
        labels.append("FATESuite")
    elif normalized.startswith("tests/"):
        labels.append("Test")
    if "proof" in lowered:
        labels.append("ProofSurface")
    if "registry" in lowered or "ledger" in lowered:
        labels.append("RegistrySurface")
    if any(word in lowered for word in ("execute", "deploy", "mutation", "write", "workflow_dispatch")):
        labels.append("ExecutionSurface")
    if "bypass" in lowered:
        labels.append("BypassPath")
    if any(word in lowered for word in ("preo", "sco", "governance", "policy")):
        labels.append("GovernanceObject")

    return sorted(set(labels))


def extract_routes(text: str) -> list[str]:
    routes = set()
    for match in RUNTIME_ROUTE_RE.finditer(text):
        route = "/" + match.group(1)
        if route in {"/authority", "/compile", "/validate", "/execute", "/proof", "/session", "/continuity", "/reconcile"}:
            routes.add(route)
    return sorted(routes)


def keyword_nodes_for_file(file_node_id: str, text: str) -> tuple[list[Node], list[Edge]]:
    nodes: list[Node] = []
    edges: list[Edge] = []
    lowered = text.lower()

    for label, keywords in KEYWORD_CLASSES.items():
        hits = sorted({kw for kw in keywords if kw.lower() in lowered})
        if not hits:
            continue
        node_id = stable_node_id(label, label)
        nodes.append(
            Node(
                id=node_id,
                labels=(label,),
                properties={"name": label, "mode": "observability_only"},
            )
        )
        edges.append(
            Edge(
                source=file_node_id,
                target=node_id,
                type="REFERENCES",
                properties={"keywords": hits},
            )
        )
    return nodes, edges


def build_graph(repo_root: Path) -> dict[str, object]:
    nodes: dict[str, Node] = {}
    edges: dict[str, Edge] = {}

    def add_node(node: Node) -> None:
        nodes[node.id] = node

    def add_edge(edge: Edge) -> None:
        key = f"{edge.source}|{edge.type}|{edge.target}|{json.dumps(edge.properties, sort_keys=True)}"
        edges[sha256_text(key)] = edge

    root_id = stable_node_id("Repository", repo_root.resolve().as_posix())
    add_node(
        Node(
            id=root_id,
            labels=("Repository",),
            properties={
                "path": repo_root.resolve().as_posix(),
                "mode": "observability_only",
                "runtime_authority": False,
            },
        )
    )

    for path in iter_scan_files(repo_root):
        rel = path.relative_to(repo_root).as_posix()
        text = read_text(path)
        digest = sha256_text(text)
        labels = tuple(classify_file(path.relative_to(repo_root), text))
        file_id = stable_node_id("File", rel)

        add_node(
            Node(
                id=file_id,
                labels=labels,
                properties={
                    "path": rel,
                    "sha256": digest,
                    "bytes": path.stat().st_size,
                    "mode": "observability_only",
                    "runtime_authority": False,
                },
            )
        )
        add_edge(Edge(root_id, file_id, "CONTAINS", {"path": rel}))

        for route in extract_routes(text):
            route_id = stable_node_id("RuntimeRoute", route)
            add_node(
                Node(
                    id=route_id,
                    labels=("RuntimeRoute",),
                    properties={"route": route, "mode": "observability_only"},
                )
            )
            add_edge(Edge(file_id, route_id, "DECLARES", {"route": route}))

        extra_nodes, extra_edges = keyword_nodes_for_file(file_id, text)
        for node in extra_nodes:
            add_node(node)
        for edge in extra_edges:
            add_edge(edge)

        if "test" in labels or "FATESuite" in labels:
            add_edge(Edge(file_id, root_id, "TESTS", {"scope": "repo"}))
        if "BypassPath" in labels:
            add_edge(Edge(file_id, root_id, "OBSERVES", {"class": "bypass_path"}))
        if "ProofSurface" in labels:
            proof_id = stable_node_id("Proof", "Proof")
            add_node(Node(proof_id, ("Proof",), {"name": "Proof", "mode": "observability_only"}))
            add_edge(Edge(file_id, proof_id, "PRODUCES_PROOF", {}))

    return {
        "metadata": {
            "generated_by": "scripts/extract_repo_graph.py",
            "mode": "observability_only",
            "runtime_authority": False,
            "network_calls": False,
            "runtime_mutation": False,
            "canonical_boundary": "visibility != authority",
            "scan_globs": list(SCAN_GLOBS),
        },
        "nodes": [
            {"id": node.id, "labels": list(node.labels), "properties": node.properties}
            for node in sorted(nodes.values(), key=lambda n: n.id)
        ],
        "edges": [
            {
                "source": edge.source,
                "target": edge.target,
                "type": edge.type,
                "properties": edge.properties,
            }
            for edge in sorted(edges.values(), key=lambda e: (e.source, e.type, e.target, json.dumps(e.properties, sort_keys=True)))
        ],
    }


def write_graph(graph: dict[str, object], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(graph, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract observability-only repo graph JSON.")
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT_DEFAULT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--stdout", action="store_true", help="Print graph JSON instead of writing the output file.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.resolve()
    graph = build_graph(repo_root)

    if args.stdout:
        print(json.dumps(graph, indent=2, sort_keys=True))
        return 0

    output = args.output
    if not output.is_absolute():
        output = repo_root / output
    write_graph(graph, output)
    print(f"wrote {output.relative_to(repo_root).as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
