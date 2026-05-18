// =============================================================================
// Workflow engine - Logique PURE de transition
// =============================================================================
// Aucune I/O. Retourne un verdict structure (`{ ok, newStatus, sideEffects }`
// ou `{ ok: false, error }`) que le caller persiste dans une transaction
// Prisma cote Server Action.
//
// Garanties verifiees :
//   1. L'etat courant existe dans la definition
//   2. L'action est autorisee depuis cet etat
//   3. Le role de l'acteur est dans `requiredRoles` (si specifie)
//   4. Tous les `guards` retournent `true`
//
// Source : ADR 0002.
// =============================================================================

import type { RoleCode } from '@reliance-finance/database';

import type {
  WorkflowDefinition,
  TransitionDefinition,
  Guard,
  GuardResult,
  SideEffect,
} from './index.js';

export interface TransitionActor {
  id: string;
  /** Les RoleCode actifs de l'utilisateur dans le scope du dossier (ex: roles
   *  sur l'entite du dossier, ou roles "Groupe" qui voient tout). */
  roles: RoleCode[];
}

export interface TransitionInput<TStatus extends string, TContext> {
  definition: WorkflowDefinition<TStatus, TContext>;
  currentStatus: TStatus;
  action: string;
  context: TContext;
  actor: TransitionActor;
}

export interface TransitionOk<TStatus extends string, TContext> {
  ok: true;
  fromStatus: TStatus;
  toStatus: TStatus;
  action: string;
  transition: TransitionDefinition<TStatus, TContext>;
  /** Effets a executer cote caller (notifications, audit log, etc.) */
  pendingSideEffects: SideEffect<TContext>[];
}

export interface TransitionKo {
  ok: false;
  code:
    | 'UNKNOWN_STATE'
    | 'ACTION_NOT_ALLOWED'
    | 'ROLE_REQUIRED'
    | 'GUARD_FAILED';
  message: string;
  details?: Record<string, unknown>;
}

export type TransitionResult<TStatus extends string, TContext> =
  | TransitionOk<TStatus, TContext>
  | TransitionKo;

export async function transitionWorkflow<TStatus extends string, TContext>(
  input: TransitionInput<TStatus, TContext>,
): Promise<TransitionResult<TStatus, TContext>> {
  const state = input.definition.states[input.currentStatus];
  if (!state) {
    return {
      ok: false,
      code: 'UNKNOWN_STATE',
      message: 'Etat inconnu dans la definition : ' + input.currentStatus,
    };
  }

  const transition = state.transitions[input.action];
  if (!transition) {
    return {
      ok: false,
      code: 'ACTION_NOT_ALLOWED',
      message:
        'Action "' +
        input.action +
        '" interdite depuis l\'etat ' +
        input.currentStatus,
      details: {
        availableActions: Object.keys(state.transitions),
      },
    };
  }

  // Verif role
  if (transition.requiredRoles && transition.requiredRoles.length > 0) {
    const hasRole = transition.requiredRoles.some((r) => input.actor.roles.includes(r));
    if (!hasRole) {
      return {
        ok: false,
        code: 'ROLE_REQUIRED',
        message:
          'Role requis pour cette transition : ' +
          transition.requiredRoles.join(', '),
        details: {
          actorRoles: input.actor.roles,
          requiredRoles: transition.requiredRoles,
        },
      };
    }
  }

  // Guards (sync ou async)
  if (transition.guards) {
    for (let i = 0; i < transition.guards.length; i++) {
      const guard = transition.guards[i] as Guard<TContext>;
      const result: GuardResult = await guard(input.context);
      if (result !== true) {
        return {
          ok: false,
          code: 'GUARD_FAILED',
          message: result.blocked,
          details: { guardIndex: i },
        };
      }
    }
  }

  return {
    ok: true,
    fromStatus: input.currentStatus,
    toStatus: transition.to,
    action: input.action,
    transition,
    pendingSideEffects: transition.sideEffects ?? [],
  };
}
