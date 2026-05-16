export type SovereigntyMode =
  | "observability_only"
  | "federated_projection"

export interface SovereignRuntime {
  runtime_id: string
  sovereignty_hash: string
  continuity_hash: string
  authority_scope: string
  federated: boolean
  runtime_authority: false
  replay_neutral: true
  append_only: true
}

export interface SovereigntyEnvelope {
  envelope_id: string
  source_runtime: string
  target_runtime: string
  equivalence_hash: string
  continuity_hash: string
  exported_at: string
  mode: SovereigntyMode
}

export interface SovereigntyState {
  sovereign_runtimes: SovereignRuntime[]
  federation_envelopes: SovereigntyEnvelope[]
}

export const CONTROL_GRAPH_SOVEREIGNTY_MODE =
  "observability_only"

export function deterministicSovereigntyHash(
  runtimeId: string,
  authorityScope: string,
): string {
  return [
    "sovereignty",
    runtimeId,
    authorityScope,
  ].join(":")
}

export function deterministicContinuityHash(
  sovereigntyHash: string,
  runtimeId: string,
): string {
  return [
    "continuity",
    sovereigntyHash,
    runtimeId,
  ].join(":")
}

export function deterministicEnvelopeId(
  sourceRuntime: string,
  targetRuntime: string,
): string {
  return [
    "envelope",
    sourceRuntime,
    targetRuntime,
  ].join(":")
}

export function createSovereignRuntime(
  runtimeId: string,
  authorityScope: string,
  federated = false,
): SovereignRuntime {
  const sovereigntyHash =
    deterministicSovereigntyHash(
      runtimeId,
      authorityScope,
    )

  return {
    runtime_id: runtimeId,
    sovereignty_hash: sovereigntyHash,
    continuity_hash:
      deterministicContinuityHash(
        sovereigntyHash,
        runtimeId,
      ),
    authority_scope: authorityScope,
    federated,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}

export function createFederationEnvelope(
  sourceRuntime: SovereignRuntime,
  targetRuntime: SovereignRuntime,
): SovereigntyEnvelope {
  return {
    envelope_id: deterministicEnvelopeId(
      sourceRuntime.runtime_id,
      targetRuntime.runtime_id,
    ),
    source_runtime:
      sourceRuntime.runtime_id,
    target_runtime:
      targetRuntime.runtime_id,
    equivalence_hash: [
      sourceRuntime.sovereignty_hash,
      targetRuntime.sovereignty_hash,
    ].join(":"),
    continuity_hash: [
      sourceRuntime.continuity_hash,
      targetRuntime.continuity_hash,
    ].join(":"),
    exported_at: new Date().toISOString(),
    mode: CONTROL_GRAPH_SOVEREIGNTY_MODE,
  }
}

export function initializeSovereigntyState():
  SovereigntyState {
  return {
    sovereign_runtimes: [],
    federation_envelopes: [],
  }
}

export function appendSovereignRuntime(
  state: SovereigntyState,
  runtime: SovereignRuntime,
): SovereigntyState {
  return {
    ...state,
    sovereign_runtimes: [
      ...state.sovereign_runtimes,
      runtime,
    ],
  }
}

export function appendFederationEnvelope(
  state: SovereigntyState,
  envelope: SovereigntyEnvelope,
): SovereigntyState {
  return {
    ...state,
    federation_envelopes: [
      ...state.federation_envelopes,
      envelope,
    ],
  }
}

export function verifyReplayNeutrality(
  runtimeA: SovereignRuntime,
  runtimeB: SovereignRuntime,
): boolean {
  return (
    runtimeA.sovereignty_hash ===
      runtimeB.sovereignty_hash &&
    runtimeA.continuity_hash ===
      runtimeB.continuity_hash
  )
}

export function verifyAppendOnlyInvariant(
  previousLength: number,
  nextLength: number,
): boolean {
  return nextLength >= previousLength
}

export function verifyObservabilityOnly(
  state: SovereigntyState,
): boolean {
  return state.sovereign_runtimes.every(
    (runtime) =>
      runtime.runtime_authority ===
        false &&
      runtime.replay_neutral ===
        true,
  )
}

export function exportSovereigntyProjection(
  state: SovereigntyState,
) {
  return {
    mode: CONTROL_GRAPH_SOVEREIGNTY_MODE,
    sovereign_runtimes:
      state.sovereign_runtimes.length,
    federation_envelopes:
      state.federation_envelopes.length,
    runtime_authority: false,
    replay_neutral: true,
    append_only: true,
  }
}
