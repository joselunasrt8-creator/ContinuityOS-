import {
  writeFileSync,
  readdirSync,
} from "node:fs";

import { join } from "node:path";

type NodeType =
  | "SESSION"
  | "CONTINUITY"
  | "AUTHORITY"
  | "ATAO"
  | "AEO"
  | "VALIDATION"
  | "EXECUTION"
  | "PROOF"
  | "REGISTRY";

type EdgeType =
  | "COMPILES_TO"
  | "VALIDATES"
  | "EXECUTES"
  | "PROVES"
  | "PERSISTS"
  | "DEPENDS_ON";

interface TopologyNode {
  id: string;
  type: NodeType;
}

interface TopologyEdge {
  from: string;
  to: string;
  type: EdgeType;
}

interface RuntimeTopology {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

const topology: RuntimeTopology = {
  nodes: [
    { id: "session", type: "SESSION" },
    { id: "continuity", type: "CONTINUITY" },
    { id: "authority", type: "AUTHORITY" },
    { id: "aeo", type: "AEO" },
    { id: "validation", type: "VALIDATION" },
    { id: "execution", type: "EXECUTION" },
    { id: "proof", type: "PROOF" },
  ],

  edges: [
    {
      from: "authority",
      to: "aeo",
      type: "COMPILES_TO",
    },

    {
      from: "aeo",
      to: "validation",
      type: "VALIDATES",
    },

    {
      from: "validation",
      to: "execution",
      type: "EXECUTES",
    },

    {
      from: "execution",
      to: "proof",
      type: "PROVES",
    },

    {
      from: "continuity",
      to: "authority",
      type: "DEPENDS_ON",
    },

    {
      from: "session",
      to: "continuity",
      type: "DEPENDS_ON",
    },
  ],
};

const routesPath = "src/runtime";

try {
  const runtimeEntries = readdirSync(routesPath, {
    withFileTypes: true,
  });

  for (const entry of runtimeEntries) {
    const nodeId = `runtime:${entry.name}`;

    topology.nodes.push({
      id: nodeId,
      type: "EXECUTION",
    });

    topology.edges.push({
      from: "validation",
      to: nodeId,
      type: "DEPENDS_ON",
    });

    if (entry.isDirectory()) {
      topology.edges.push({
        from: nodeId,
        to: "continuity",
        type: "DEPENDS_ON",
      });
    }
  }
} catch (err) {
  console.error("Runtime discovery failed:", err);
}

const topologyJson = JSON.stringify(
  topology,
  null,
  2
);

writeFileSync(
  "runtime-topology.json",
  topologyJson,
  "utf8"
);

console.log(topologyJson);
