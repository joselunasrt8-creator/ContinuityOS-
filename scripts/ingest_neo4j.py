#!/usr/bin/env python3
"""Ingest observability-only repo graph JSON into Neo4j.

Boundary:
- no runtime authority creation
- no validation execution
- no proof generation
- no registry mutation
- Neo4j state is observability state only

Canonical invariant:
visibility != authority
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

try:
    from neo4j import GraphDatabase
except ImportError as exc:
    raise SystemExit(
        "neo4j package missing. Install with: python3 -m pip install neo4j"
    ) from exc

DEFAULT_GRAPH = Path("graph/repo_graph.json")


CREATE_NODE_QUERY = """
MERGE (n:GraphNode {id: $id})
SET n += $properties
SET n.labels = $labels
RETURN n
"""

CREATE_EDGE_QUERY = """
UNWIND $edges AS edge
MATCH (a:GraphNode {id: edge.source})
MATCH (b:GraphNode {id: edge.target})
MERGE (a)-[r:GRAPH_EDGE {type: edge.type, edge_key: edge.edge_key}]->(b)
SET r += edge.properties
RETURN count(r) AS count
"""


def load_graph(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_graph(graph: dict[str, Any]) -> None:
    metadata = graph.get("metadata", {})

    if metadata.get("mode") != "observability_only":
        raise SystemExit("graph mode must equal observability_only")

    if metadata.get("runtime_authority") is not False:
        raise SystemExit("runtime_authority must be false")


def neo4j_driver() -> Any:
    uri = os.environ.get("NEO4J_URI")
    username = os.environ.get("NEO4J_USERNAME")
    password = os.environ.get("NEO4J_PASSWORD")

    if not uri or not username or not password:
        raise SystemExit(
            "Missing NEO4J_URI, NEO4J_USERNAME, or NEO4J_PASSWORD"
        )

    return GraphDatabase.driver(uri, auth=(username, password))


def ingest_nodes(tx: Any, nodes: list[dict[str, Any]]) -> None:
    for node in nodes:
        properties = dict(node.get("properties", {}))
        properties["mode"] = "observability_only"
        properties["runtime_authority"] = False

        tx.run(
            CREATE_NODE_QUERY,
            id=node["id"],
            labels=node.get("labels", []),
            properties=properties,
        )


def ingest_edges(tx: Any, edges: list[dict[str, Any]]) -> None:
    batch = []

    for edge in edges:
        properties = dict(edge.get("properties", {}))
        properties["mode"] = "observability_only"

        batch.append({
            "source": edge["source"],
            "target": edge["target"],
            "type": edge["type"],
            "edge_key": f"{edge['source']}|{edge['type']}|{edge['target']}",
            "properties": properties,
        })

    tx.run(CREATE_EDGE_QUERY, edges=batch)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Ingest observability-only graph JSON into Neo4j"
    )
    parser.add_argument(
        "--graph",
        type=Path,
        default=DEFAULT_GRAPH,
        help="Path to repo graph JSON",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    graph_path = args.graph.resolve()

    graph = load_graph(graph_path)
    validate_graph(graph)

    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])

    driver = neo4j_driver()

    with driver.session() as session:
        session.execute_write(ingest_nodes, nodes)
        session.execute_write(ingest_edges, edges)

    print(
        f"ingested {len(nodes)} nodes and {len(edges)} edges into Neo4j"
    )

    print("mode=observability_only")
    print("runtime_authority=false")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
