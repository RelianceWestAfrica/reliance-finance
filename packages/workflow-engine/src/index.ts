// =============================================================================
// Workflow engine - Reliance Finance
// =============================================================================
// Squelette du moteur de workflow declaratif (cf. ADR 0002).
// L'implementation complete arrive en session M9 (cf. docs/roadmap.md).
//
// Ce fichier expose les TYPES qui contraignent les definitions de workflows
// pour que les modules en aval (M4 ExpenseRequest, M6 BC, M7 Reception,
// M8 Invoice, M10 Payment) puissent deja referencer la signature attendue.
// =============================================================================

import type { RoleCode, SignatureStage, DocumentType } from '@reliance-finance/database';

export type GuardResult = true | { blocked: string };

export type Guard<TContext> = (ctx: TContext) => GuardResult | Promise<GuardResult>;

export type SideEffect<TContext> = (ctx: TContext) => Promise<void> | void;

export interface SignatureSlot {
  role: RoleCode;
  stage: SignatureStage;
  required: boolean;
}

export interface TransitionDefinition<TStatus extends string, TContext> {
  to: TStatus;
  guards?: Guard<TContext>[];
  requiredRoles?: RoleCode[];
  requiredSignatures?: SignatureSlot[];
  sideEffects?: SideEffect<TContext>[];
}

export interface StateDefinition<TStatus extends string, TContext> {
  transitions: Record<string, TransitionDefinition<TStatus, TContext>>;
  onEnter?: SideEffect<TContext>[];
  onExit?: SideEffect<TContext>[];
  sla?: {
    hours: number;
    onBreach: 'NOTIFY' | 'ESCALATE' | 'AUTO_REJECT';
  };
}

export interface WorkflowDefinition<TStatus extends string, TContext> {
  type: DocumentType;
  key: string;
  version: number;
  initialStatus: TStatus;
  states: Record<TStatus, StateDefinition<TStatus, TContext>>;
}

export class WorkflowEngine {
  // TODO (M9) : load definition by key+version, transition, validate guards,
  // record steps, collect signatures with cryptographic chaining.
  constructor() {
    // Stub - implementation arrive en session M9
  }

  async transition<TStatus extends string, TContext>(
    _definition: WorkflowDefinition<TStatus, TContext>,
    _currentStatus: TStatus,
    _action: string,
    _ctx: TContext,
  ): Promise<{ ok: false; reason: 'NOT_IMPLEMENTED' }> {
    return { ok: false, reason: 'NOT_IMPLEMENTED' };
  }
}

export * from './states/index.js';
export {
  transitionWorkflow,
  type TransitionActor,
  type TransitionInput,
  type TransitionOk,
  type TransitionKo,
  type TransitionResult,
} from './transition.js';
