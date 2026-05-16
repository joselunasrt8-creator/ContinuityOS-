/**
 * MindShift Control Graph Integration Runtime
 *
 * Status:
 * Observability-only
 * Non-authoritative
 * Non-mutating
 *
 * Purpose:
 * Convert runtime legitimacy events into
 * canonical graph topology primitives.
 */

export type GraphNodeKind =
  | "Authority"
  | "ATAO"
  | "AEO"
  | "Validator"
  | "Execution"
  | "Proof"
  | "Registry"
  | "Continuity"
  | "ReplayConstraint"
  | "MutationSurface"
  | "ExecutionBoundary"
  | "ReconciliationSnapshot";

export type GraphEdgeKind =
  | "AUTHORIZES"
  | "VALIDATES"
  | "EXECUTES"
  | "GENERATES_PROOF"
  | "PERSISTS_IN"
  | "BINDS"
  | "RECONCILES"
  | "DERIVES_FROM"
  | "REVOKES"
  | "PROTECTS";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  kind: GraphEdgeKind;
  from: string;
  to: string;
  properties?: Record<string, unknown>;
}

export interface RuntimeLegitimacyEvent {
  event_id: string;

  event_type:
    | "VALIDATION"
    | "EXECUTION"
    | "PROOF"
    | "RECONCILIATION"
    | "REVOCATION";

  source_object: string;

  target_object?: string;

  lineage_hash: string;

  timestamp: string;

  metadata?: Record<string, unknown>;
}

export interface GraphSnapshot {
  snapshot_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ReconciliationResult {
  valid: boolean;
  drift_detected: boolean;
  orphaned_nodes: string[];
  replay_collisions: string[];
  disconnected_lineage: string[];
}

export interface LegitimacyTraversal {
  root: string;
  lineage: string[];
  valid: boolean;
}

export const GRAPH_INVARIANTS = {
  VALIDATED_EQUALS_EXECUTED:
    "validated_object == executed_object",

  EXECUTION_REQUIRES_VALIDATION:
    "execution requires validated lineage",

  PROOF_REQUIRES_EXECUTION:
    "proof requires execution lineage",

  REVOKED_AUTHORITY_INVALIDATES_DESCENDANTS:
    "revoked authority invalidates descendants",

  LEGITIMACY_MUST_RECONCILE:
    "all legitimacy lineage must remain recursively reconcilable"
} as const;

export function classifyGraphNode(
  input: Record<string, unknown>
): GraphNode {
  const identifier = String(input.id ?? "unknown");

  const lowered = identifier.toLowerCase();

  let kind: GraphNodeKind = "MutationSurface";

  if (lowered.includes("authority")) {
    kind = "Authority";
  } else if (lowered.includes("atao")) {
    kind = "ATAO";
  } else if (lowered.includes("aeo")) {
    kind = "AEO";
  } else if (lowered.includes("validator")) {
    kind = "Validator";
  } else if (lowered.includes("proof")) {
    kind = "Proof";
  } else if (lowered.includes("registry")) {
    kind = "Registry";
  } else if (lowered.includes("continuity")) {
    kind = "Continuity";
  } else if (lowered.includes("boundary")) {
    kind = "ExecutionBoundary";
  } else if (lowered.includes("reconcile")) {
    kind = "ReconciliationSnapshot";
  }

  return {
    id: identifier,
    kind,
    properties: input
  };
}

export function deriveGraphEdges(
  event: RuntimeLegitimacyEvent
): GraphEdge[] {
  switch (event.event_type) {
    case "VALIDATION":
      return [
        {
          id: `${event.event_id}:validates`,
          kind: "VALIDATES",
          from: event.source_object,
          to: event.target_object ?? "unknown"
        }
      ];

    case "EXECUTION":
      return [
        {
          id: `${event.event_id}:executes`,
          kind: "EXECUTES",
          from: event.source_object,
          to: event.target_object ?? "unknown"
        }
      ];

    case "PROOF":
      return [
        {
          id: `${event.event_id}:proof`,
          kind: "GENERATES_PROOF",
          from: event.source_object,
          to: event.target_object ?? "unknown"
        }
      ];

    case "REVOCATION":
      return [
        {
          id: `${event.event_id}:revoke`,
          kind: "REVOKES",
          from: event.source_object,
          to: event.target_object ?? "unknown"
        }
      ];

    default:
      return [];
  }
}

export function ingestRuntimeEvent(
  event: RuntimeLegitimacyEvent
): {
  accepted: boolean;
  edges: GraphEdge[];
} {
  const edges = deriveGraphEdges(event);

  return {
    accepted: true,
    edges
  };
}

export function reconcileTopology(
  snapshot: GraphSnapshot
): ReconciliationResult {
  const orphaned_nodes = snapshot.nodes
    .filter(
      (node) =>
        !snapshot.edges.some(
          (edge) => edge.from === node.id || edge.to === node.id
        )
    )
    .map((node) => node.id);

  return {
    valid: orphaned_nodes.length === 0,
    drift_detected: orphaned_nodes.length > 0,
    orphaned_nodes,
    replay_collisions: [],
    disconnected_lineage: []
  };
}

export function traceLegitimacyLineage(
  objectId: string,
  snapshot: GraphSnapshot
): LegitimacyTraversal {
  const lineage = snapshot.edges
    .filter((edge) => edge.from === objectId || edge.to === objectId)
    .map((edge) => edge.id);

  return {
    root: objectId,
    lineage,
    valid: lineage.length > 0
  };
}

export const CONTROL_GRAPH_RUNTIME = {
  mode: "observability_only",
  runtime_authority: false,
  runtime_mutation: false,
  canonical_boundary: "visibility != authority"
} as const;
