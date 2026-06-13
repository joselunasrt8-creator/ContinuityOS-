export type AeoValidationDecision = 'VALID' | 'NULL'

export type AeoValidationContext = {
  readonly expected_authority: string
  readonly maximum_scope: readonly string[]
}

export function validateAeo(aeo: unknown, context: AeoValidationContext): AeoValidationDecision
