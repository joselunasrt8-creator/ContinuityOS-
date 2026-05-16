export type ObservabilityMode =
  | "observability_only"
  | "telemetry_projection"

export interface ObservabilityEvent {
  event_id: string
  topology_hash: string
  continuity_hash: string
  telemetry_hash: string
  event_scope: string
  observed_at: string
  replay_neutral: true
  append_only: true
  runtime_authority: false
}

export interface ObservabilityEnvelope {
  envelope_id: string
  source_runtime: string
  target_runtime: string
  telemetry_hash: string
  exported_at: string
  mode: ObservabilityMode
}

export interface ObservabilityState {
  observability_events: ObservabilityEvent[]
  observability_envelopes: ObservabilityEnvelope[]
}

export const CONTROL_GRAPH_OBSERVABILITY_MODE =
  "observability_only"

export function deterministicEventId(
  topologyHash: string,
  telemetryHash: string,
): string {
  return [
    "observability",
    topologyHash,
    telemetryHash,
  ].join(":")
}

export function deterministicContinuityHash(
  topologyHash: string,
  eventId: string,
): string {
  return [
    "continuity",
    topologyHash,
    eventId,
  ].join(":")
}

export function deterministicEnvelopeId(
  sourceRuntime: string,
  targetRuntime: string,
): string {
  return [
    "observability-envelope",
    sourceRuntime,
    targetRuntime,
  ].join(":")
}

export function createObservabilityEvent(
  topologyHash: string,
  telemetryHash: string,
  eventScope: string,
): ObservabilityEvent {
  const eventId =
    deterministicEventId(
      topologyHash,
      telemetryHash,
    )

  return {
    event_id: eventId,
    topology_hash: topologyHash,
    continuity_hash:
      deterministicContinuityHash(
        topologyHash,
        eventId,
      ),
    telemetry_hash: telemetryHash,
    event_scope: eventScope,
    observed_at: new Date().toISOString(),
    replay_neutral: true,
    append_only: true,
    runtime_authority: false,
  }
}

export function createObservabilityEnvelope(
  sourceRuntime: string,
  targetRuntime: string,
  telemetryHash: string,
): ObservabilityEnvelope {
  return {
    envelope_id:
      deterministicEnvelopeId(
        sourceRuntime,
        targetRuntime,
      ),
    source_runtime: sourceRuntime,
    target_runtime: targetRuntime,
    telemetry_hash: telemetryHash,
    exported_at: new Date().toISOString(),
    mode: CONTROL_GRAPH_OBSERVABILITY_MODE,
  }
}

export function initializeObservabilityState():
  ObservabilityState {
  return {
    observability_events: [],
    observability_envelopes: [],
  }
}

export function appendObservabilityEvent(
  state: ObservabilityState,
  event: ObservabilityEvent,
): ObservabilityState {
  return {
    ...state,
    observability_events: [
      ...state.observability_events,
      event,
    ],
  }
}

export function appendObservabilityEnvelope(
  state: ObservabilityState,
  envelope: ObservabilityEnvelope,
): ObservabilityState {
  return {
    ...state,
    observability_envelopes: [
      ...state.observability_envelopes,
      envelope,
    ],
  }
}

export function verifyReplayNeutrality(
  eventA: ObservabilityEvent,
  eventB: ObservabilityEvent,
): boolean {
  return (
    eventA.event_id ===
      eventB.event_id &&
    eventA.telemetry_hash ===
      eventB.telemetry_hash
  )
}

export function verifyAppendOnlyInvariant(
  previousLength: number,
  nextLength: number,
): boolean {
  return nextLength >= previousLength
}

export function verifyObservabilityOnly(
  state: ObservabilityState,
): boolean {
  return state.observability_events.every(
    (event) =>
      event.runtime_authority ===
        false &&
      event.replay_neutral ===
        true,
  )
}

export function exportObservabilityProjection(
  state: ObservabilityState,
) {
  return {
    mode: CONTROL_GRAPH_OBSERVABILITY_MODE,
    observability_events:
      state.observability_events.length,
    observability_envelopes:
      state.observability_envelopes.length,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}
