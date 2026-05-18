import { describe, expect, it, vi } from 'vitest';

import { RoleCode, DocumentType } from '@reliance-finance/database';
import {
  transitionWorkflow,
  type WorkflowDefinition,
} from '@reliance-finance/workflow-engine';

type Status = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

interface Ctx {
  amount: number;
  hasBudget: boolean;
}

const def: WorkflowDefinition<Status, Ctx> = {
  type: DocumentType.FD,
  key: 'test_workflow',
  version: 1,
  initialStatus: 'DRAFT',
  states: {
    DRAFT: {
      transitions: {
        submit: {
          to: 'SUBMITTED',
        },
        reject: {
          to: 'REJECTED',
          requiredRoles: [RoleCode.DAF_PAYS, RoleCode.DFG],
        },
      },
    },
    SUBMITTED: {
      transitions: {
        approve: {
          to: 'APPROVED',
          requiredRoles: [RoleCode.DFG],
          guards: [
            (ctx) =>
              ctx.hasBudget
                ? true
                : { blocked: 'Budget insuffisant' },
            (ctx) =>
              ctx.amount > 0
                ? true
                : { blocked: 'Montant doit etre > 0' },
          ],
        },
        reject: {
          to: 'REJECTED',
          requiredRoles: [RoleCode.DAF_PAYS, RoleCode.DFG],
        },
      },
    },
    APPROVED: { transitions: {} },
    REJECTED: { transitions: {} },
  },
};

const dfgActor = { id: 'u_dfg', roles: [RoleCode.DFG] };
const dafActor = { id: 'u_daf', roles: [RoleCode.DAF_PAYS] };
const noRoleActor = { id: 'u_x', roles: [RoleCode.DEMANDEUR] };

describe('transitionWorkflow', () => {
  it('OK : transition simple sans role ni guard', async () => {
    const r = await transitionWorkflow({
      definition: def,
      currentStatus: 'DRAFT',
      action: 'submit',
      context: { amount: 100, hasBudget: true },
      actor: noRoleActor,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.toStatus).toBe('SUBMITTED');
      expect(r.fromStatus).toBe('DRAFT');
    }
  });

  it('KO : etat inconnu', async () => {
    const r = await transitionWorkflow({
      definition: def,
      currentStatus: 'NONSENSE' as Status,
      action: 'submit',
      context: { amount: 100, hasBudget: true },
      actor: dfgActor,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('UNKNOWN_STATE');
  });

  it('KO : action interdite depuis l\'etat courant', async () => {
    const r = await transitionWorkflow({
      definition: def,
      currentStatus: 'DRAFT',
      action: 'approve',
      context: { amount: 100, hasBudget: true },
      actor: dfgActor,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('ACTION_NOT_ALLOWED');
      expect(r.details?.availableActions).toEqual(['submit', 'reject']);
    }
  });

  it('KO : role manquant', async () => {
    const r = await transitionWorkflow({
      definition: def,
      currentStatus: 'SUBMITTED',
      action: 'approve',
      context: { amount: 100, hasBudget: true },
      actor: dafActor,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ROLE_REQUIRED');
  });

  it('OK : approve avec DFG et budget', async () => {
    const r = await transitionWorkflow({
      definition: def,
      currentStatus: 'SUBMITTED',
      action: 'approve',
      context: { amount: 100, hasBudget: true },
      actor: dfgActor,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.toStatus).toBe('APPROVED');
  });

  it('KO : guard "budget insuffisant" bloque', async () => {
    const r = await transitionWorkflow({
      definition: def,
      currentStatus: 'SUBMITTED',
      action: 'approve',
      context: { amount: 100, hasBudget: false },
      actor: dfgActor,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('GUARD_FAILED');
      expect(r.message).toBe('Budget insuffisant');
    }
  });

  it('KO : 2e guard echoue meme si 1er passe', async () => {
    const r = await transitionWorkflow({
      definition: def,
      currentStatus: 'SUBMITTED',
      action: 'approve',
      context: { amount: 0, hasBudget: true },
      actor: dfgActor,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Montant doit etre > 0');
  });

  it('un guard async est attendu (await)', async () => {
    const slow: WorkflowDefinition<Status, Ctx> = {
      ...def,
      states: {
        ...def.states,
        SUBMITTED: {
          transitions: {
            approve: {
              to: 'APPROVED',
              requiredRoles: [RoleCode.DFG],
              guards: [
                async () => {
                  await new Promise((r) => setTimeout(r, 5));
                  return { blocked: 'Async fail' };
                },
              ],
            },
          },
        },
      },
    };
    const r = await transitionWorkflow({
      definition: slow,
      currentStatus: 'SUBMITTED',
      action: 'approve',
      context: { amount: 100, hasBudget: true },
      actor: dfgActor,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe('Async fail');
  });

  it('pendingSideEffects inclus dans le verdict OK', async () => {
    const sideFx = vi.fn();
    const withFx: WorkflowDefinition<Status, Ctx> = {
      ...def,
      states: {
        ...def.states,
        DRAFT: {
          transitions: {
            submit: { to: 'SUBMITTED', sideEffects: [sideFx] },
          },
        },
      },
    };
    const r = await transitionWorkflow({
      definition: withFx,
      currentStatus: 'DRAFT',
      action: 'submit',
      context: { amount: 100, hasBudget: true },
      actor: noRoleActor,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pendingSideEffects).toHaveLength(1);
      // L'engine ne les execute pas - le caller s'en charge
      expect(sideFx).not.toHaveBeenCalled();
    }
  });
});
