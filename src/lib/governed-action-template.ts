// Governed Action Template — the scaling unit for ContinuityOS.
//
// Every governed surface implements GovernedActionSurface<...>.
// The lifecycle is identical across all surfaces:
//
//   captureATAO    (non-operative: no authority, no execution eligibility)
//   compileAEO     (ATAO + authority binding → AEO candidate)
//   computeAEOHash (deterministic SHA-256 over canonical AEO)
//   execute        (exact-object boundary: validated_object_hash == executed_object_hash)
//
// Core invariants (must hold on every surface):
//   If no valid object exists → nothing happens
//   validated_object_hash == executed_object_hash
//   Mismatch, null input, or blank required field → NULL proof, executor never called
//
// Adding a new surface:
//   1. Add surface literal to GovernedSurfaceType
//   2. Implement GovernedActionSurface<...> for that surface
//   3. Register in surface-registry.ts

// ── Surface type discriminated union ─────────────────────────────────────────
// Each surface is a stable literal. Union grows; nothing else changes.
export type GovernedSurfaceType =
  | "filesystem"
  | "github_comment"
  | "github_pr_review"
  | "terminal_command"
  | "deploy"
  | "mcp_tool_call"
  | "langchain_action"

// ── Base types shared across all surfaces ─────────────────────────────────────

// Every ATAO — regardless of surface — must carry these fields.
// creates_authority and creates_execution_eligibility are type-level constants,
// not runtime booleans, so they cannot be accidentally set to true.
export type GovernedATAOBase = {
  readonly atao_id: string
  readonly agent_id: string
  readonly session_id: string
  readonly intent: string
  readonly risk_class: "P0" | "P1" | "P2" | "P3"
  readonly timestamp: string
  readonly creates_authority: false
  readonly creates_execution_eligibility: false
}

// Every proof — regardless of surface — must carry these fields.
// validated_object_hash and executed_object_hash are the cross-surface
// identity invariant: they must be equal on the EXECUTED path.
export type GovernedProofBase = {
  readonly proof_id: string
  readonly atao_id: string
  readonly aeo_hash: string
  readonly validated_object_hash: string
  readonly executed_object_hash: string
  readonly target_surface: GovernedSurfaceType
  readonly execution_result: "EXECUTED" | "NULL"
  readonly null_reason: string | null
  readonly creates_authority: false
  readonly emitted_at: string
}

// ── GovernedActionSurface interface ──────────────────────────────────────────
// TAtao:         surface-specific ATAO (must extend GovernedATAOBase)
// TAtaoInput:    raw input fields used to form the ATAO
// TBinding:      authority binding fields carrying governance constraints
// TProposal:     the compiled AEO type for this surface (exactly 5 top-level keys)
// TExecuteInput: everything needed at the execution boundary
// TResult:       surface-specific proof (must extend GovernedProofBase)
export interface GovernedActionSurface<
  TAtao extends GovernedATAOBase,
  TAtaoInput,
  TBinding,
  TProposal,
  TExecuteInput,
  TResult extends GovernedProofBase,
> {
  readonly surfaceType: GovernedSurfaceType

  // Stage 1: Observe — non-operative capture.
  // Fails closed on null/undefined/blank required fields.
  // Does not create authority or execution eligibility.
  captureATAO(input: TAtaoInput | null | undefined): TAtao | null

  // Stage 2: Compile — ATAO + authority binding → AEO candidate.
  // Fails closed on null ATAO, null binding, or missing/blank binding fields.
  // Does not validate, execute, or produce proof.
  compileAEO(
    atao: TAtao | null | undefined,
    binding: TBinding | null | undefined,
  ): TProposal | null

  // AEO hash — deterministic SHA-256 over the canonical AEO.
  // Used by the Omega validator boundary to enforce exact-object identity.
  computeAEOHash(aeo: TProposal): string

  // Stage 3: Execute — exact-object boundary gate.
  // Recomputes AEO hash inside the boundary.
  // Mismatch → NULL proof, executor never called.
  // Match    → executor called, EXECUTED proof emitted.
  execute(input: TExecuteInput | null | undefined): TResult | null
}

// ── createGovernedAction factory ─────────────────────────────────────────────
// Returns a frozen surface object. This is the extension point for future
// cross-cutting concerns (telemetry injection, lineage wrapping, audit hooks)
// without requiring each surface to know about them.
export function createGovernedAction<
  TAtao extends GovernedATAOBase,
  TAtaoInput,
  TBinding,
  TProposal,
  TExecuteInput,
  TResult extends GovernedProofBase,
>(
  surface: GovernedActionSurface<TAtao, TAtaoInput, TBinding, TProposal, TExecuteInput, TResult>,
): GovernedActionSurface<TAtao, TAtaoInput, TBinding, TProposal, TExecuteInput, TResult> {
  return Object.freeze({ ...surface })
}
