// =============================================================================
// Erreurs metier - communes aux Server Actions
// =============================================================================

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class BusinessRuleError extends Error {
  constructor(
    message: string,
    public readonly rule?: string,
  ) {
    super(message);
    this.name = 'BusinessRuleError';
  }
}
