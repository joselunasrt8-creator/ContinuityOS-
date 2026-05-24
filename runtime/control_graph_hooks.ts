/**
 * MindShift Control Graph Hooks
 *
 * MODE: observability_only
 * BOUNDARY: visibility != authority
 */

import {
  ControlGraphEmitter,
  createLegitimacyEvent,
  reconciliationEvent,
  driftEvent,
  replayEvent,
  quarantineEvent,
} from "./control_graph_emitter.ts"

export const emitter = new ControlGraphEmitter()

export interface ValidationHookInput {
  validation_id: string
  authority_id?: string
  continuity_id?: string
  metadata?: Record<string, unknown>
}

export interface ExecutionHookInput {
  execution_id: string
  aeo_id: string
  authority_id?: string
  metadata?: Record<string, unknown>
}

export interface ProofHookInput {
  proof_id: string
  execution_id: string
  registry_id?: string
  metadata?: Record<string, unknown>
}

export interface ReconciliationHookInput {
  reconciliation_id: string
  metadata?: Record<string, unknown>
}

export interface DriftHookInput {
  object_id: string
  drift_vector?: string[]
  metadata?: Record<string, unknown>
}

export interface ReplayHookInput {
  object_id: string
  replay_source?: string
  metadata?: Record<string, unknown>
}

export interface QuarantineHookInput {
  object_id: string
  quarantine_reason?: string
  metadata?: Record<string, unknown>
}

export function onValidationCompleted(
  input: ValidationHookInput,
): void {
  emitter.emit(
    createLegitimacyEvent(
      "VALIDATION_COMPLETED",
      input.validation_id,
      {
        authority_id: input.authority_id,
        continuity_id: input.continuity_id,
        runtime_authority: false,
        state_mutation: false,
        ...(input.metadata ?? {}),
      },
    ),
  )
}

export function onExecutionStarted(
  input: ExecutionHookInput,
): void {
  emitter.emit(
    createLegitimacyEvent(
      "EXECUTION_STARTED",
      input.execution_id,
      {
        aeo_id: input.aeo_id,
        authority_id: input.authority_id,
        runtime_authority: false,
        state_mutation: false,
        ...(input.metadata ?? {}),
      },
    ),
  )
}

export function onExecutionCompleted(
  input: ExecutionHookInput,
): void {
  emitter.emit(
    createLegitimacyEvent(
      "EXECUTION_COMPLETED",
      input.execution_id,
      {
        aeo_id: input.aeo_id,
        authority_id: input.authority_id,
        runtime_authority: false,
        state_mutation: false,
        ...(input.metadata ?? {}),
      },
    ),
  )
}

export function onProofGenerated(
  input: ProofHookInput,
): void {
  emitter.emit(
    createLegitimacyEvent(
      "PROOF_GENERATED",
      input.proof_id,
      {
        execution_id: input.execution_id,
        registry_id: input.registry_id,
        runtime_authority: false,
        state_mutation: false,
        ...(input.metadata ?? {}),
      },
    ),
  )
}

export function onRegistryPersisted(
  registry_id: string,
  metadata: Record<string, unknown> = {},
): void {
  emitter.emit(
    createLegitimacyEvent(
      "REGISTRY_PERSISTED",
      registry_id,
      {
        runtime_authority: false,
        state_mutation: false,
        ...metadata,
      },
    ),
  )
}

export function onReconciliationCompleted(
  input: ReconciliationHookInput,
): void {
  emitter.emit(
    reconciliationEvent(
      input.reconciliation_id,
      {
        runtime_authority: false,
        state_mutation: false,
        ...(input.metadata ?? {}),
      },
    ),
  )
}

export function onDriftDetected(
  input: DriftHookInput,
): void {
  emitter.emit(
    driftEvent(
      input.object_id,
      {
        drift_vector: input.drift_vector ?? [],
        runtime_authority: false,
        state_mutation: false,
        ...(input.metadata ?? {}),
      },
    ),
  )
}

export function onReplayDetected(
  input: ReplayHookInput,
): void {
  emitter.emit(
    replayEvent(
      input.object_id,
      {
        replay_source: input.replay_source,
        runtime_authority: false,
        state_mutation: false,
        ...(input.metadata ?? {}),
      },
    ),
  )
}

export function onQuarantineTriggered(
  input: QuarantineHookInput,
): void {
  emitter.emit(
    quarantineEvent(
      input.object_id,
      {
        quarantine_reason:
          input.quarantine_reason,
        runtime_authority: false,
        state_mutation: false,
        ...(input.metadata ?? {}),
      },
    ),
  )
}

export function topologySnapshot() {
  return emitter.buildTopologySnapshot()
}

export function runtimeGraphState() {
  return {
    mode: "observability_only",
    event_count: emitter.getEvents().length,
    topology: emitter.buildTopologySnapshot(),
  }
}
