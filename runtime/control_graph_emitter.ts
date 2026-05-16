/**
 * MindShift Control Graph Emitter
 *
 * MODE: observability_only
 * BOUNDARY: visibility != authority
 *
 * Purpose:
 * Emit canonical runtime legitimacy events into the
 * MindShift Control Graph without mutating authority.
 */

export const CONTROL_GRAPH_MODE = "observability_only"

export type LegitimacyEventType =
  | "SESSION_CREATED"
  | "CONTINUITY_BOUND"
  | "AUTHORITY_GRANTED"
  | "ATAO_CREATED"
  | "AEO_COMPILED"
  | "VALIDATION_COMPLETED"
  | "EXECUTION_STARTED"
  | "EXECUTION_COMPLETED"
  | "PROOF_GENERATED"
  | "REGISTRY_PERSISTED"
  | "RECONCILIATION_COMPLETED"
  | "DRIFT_DETECTED"
  | "QUARANTINE_TRIGGERED"
  | "REPLAY_DETECTED"

export interface ControlGraphEvent {
  id: string
  timestamp: string
  type: LegitimacyEventType
  object_id: string
  lineage_parent?: string
  authority_id?: string
  continuity_id?: string
  proof_id?: string
  registry_id?: string
  reconciliation_id?: string
  metadata: Record<string, unknown>
}

export interface GraphNode {
  id: string
  labels: string[]
  properties: Record<string, unknown>
}

export interface GraphEdge {
  from: string
  to: string
  type: string
  properties: Record<string, unknown>
}

export interface RuntimeTopologySnapshot {
  generated_at: string
  mode: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  invariants: string[]
}

export const CANONICAL_INVARIANTS = [
  "VALIDATED_OBJECT_EQUALS_EXECUTED_OBJECT",
  "EXECUTION_REQUIRES_VALIDATION",
  "AUTHORITY_REQUIRED_FOR_MUTATION",
  "PROOF_REQUIRED_FOR_COMPLETION",
  "REPLAY_INVALID",
  "VISIBILITY_IS_NOT_AUTHORITY",
  "OBSERVABILITY_ONLY_RUNTIME",
]

export class ControlGraphEmitter {
  private events: ControlGraphEvent[] = []

  emit(event: ControlGraphEvent): void {
    this.assertObservabilityBoundary(event)

    this.events.push(event)

    this.logEvent(event)
  }

  private assertObservabilityBoundary(
    event: ControlGraphEvent,
  ): void {
    if (
      event.metadata?.runtime_authority === true
    ) {
      throw new Error(
        "runtime authority mutation prohibited",
      )
    }

    if (
      event.metadata?.state_mutation === true
    ) {
      throw new Error(
        "state mutation prohibited",
      )
    }
  }

  private logEvent(event: ControlGraphEvent): void {
    console.log(
      JSON.stringify({
        mode: CONTROL_GRAPH_MODE,
        event,
      }),
    )
  }

  getEvents(): ControlGraphEvent[] {
    return [...this.events]
  }

  buildTopologySnapshot(): RuntimeTopologySnapshot {
    const nodes: GraphNode[] = []
    const edges: GraphEdge[] = []

    for (const event of this.events) {
      nodes.push({
        id: event.object_id,
        labels: [event.type],
        properties: {
          timestamp: event.timestamp,
          authority_id: event.authority_id,
          continuity_id: event.continuity_id,
        },
      })

      if (event.lineage_parent) {
        edges.push({
          from: event.lineage_parent,
          to: event.object_id,
          type: "LINEAGE",
          properties: {
            event_type: event.type,
          },
        })
      }
    }

    return {
      generated_at: new Date().toISOString(),
      mode: CONTROL_GRAPH_MODE,
      nodes,
      edges,
      invariants: CANONICAL_INVARIANTS,
    }
  }
}

export function createLegitimacyEvent(
  type: LegitimacyEventType,
  object_id: string,
  metadata: Record<string, unknown> = {},
): ControlGraphEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    object_id,
    metadata,
  }
}

export function lineageEdge(
  from: string,
  to: string,
  type: string,
): GraphEdge {
  return {
    from,
    to,
    type,
    properties: {},
  }
}

export function reconciliationEvent(
  reconciliation_id: string,
  metadata: Record<string, unknown> = {},
): ControlGraphEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: "RECONCILIATION_COMPLETED",
    object_id: reconciliation_id,
    reconciliation_id,
    metadata,
  }
}

export function driftEvent(
  object_id: string,
  metadata: Record<string, unknown> = {},
): ControlGraphEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: "DRIFT_DETECTED",
    object_id,
    metadata,
  }
}

export function replayEvent(
  object_id: string,
  metadata: Record<string, unknown> = {},
): ControlGraphEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: "REPLAY_DETECTED",
    object_id,
    metadata,
  }
}

export function quarantineEvent(
  object_id: string,
  metadata: Record<string, unknown> = {},
): ControlGraphEvent {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type: "QUARANTINE_TRIGGERED",
    object_id,
    metadata,
  }
}
