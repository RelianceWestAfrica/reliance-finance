import { describe, expect, it } from 'vitest';

import { RoleCode } from '@reliance-finance/database';

import { canActorSignNext, nextPendingSlot } from './can-act.js';
import type { ApprovalSlot } from './approval-chain.js';

const CHAIN: ApprovalSlot[] = [
  {
    stage: 'VISA_FILIALE_N1',
    allowedRoles: [RoleCode.FINANCE_FIL_N1, RoleCode.DAF_PAYS],
    reason: '',
    position: 1,
  },
  {
    stage: 'VISA_FILIALE_N2',
    allowedRoles: [RoleCode.FINANCE_FIL_N2, RoleCode.DAF_PAYS],
    reason: '',
    position: 2,
  },
  {
    stage: 'VISA_GROUPE',
    allowedRoles: [RoleCode.FINANCE_GROUPE, RoleCode.DFG],
    reason: '',
    position: 3,
  },
];

describe('nextPendingSlot', () => {
  it('renvoie le premier slot si aucune signature', () => {
    expect(nextPendingSlot(CHAIN, [])?.stage).toBe('VISA_FILIALE_N1');
  });

  it('saute les slots deja signes', () => {
    expect(
      nextPendingSlot(CHAIN, [{ stage: 'VISA_FILIALE_N1', actorId: 'u1' }])?.stage,
    ).toBe('VISA_FILIALE_N2');
  });

  it('renvoie null si tout signe', () => {
    const all = CHAIN.map((s) => ({ stage: s.stage, actorId: 'u' + s.position }));
    expect(nextPendingSlot(CHAIN, all)).toBeNull();
  });
});

describe('canActorSignNext', () => {
  it('OK : DAF Pays signe N1 quand rien n\'est signe', () => {
    const r = canActorSignNext(
      { approvalChain: CHAIN, existingSignatures: [], requesterId: 'requester' },
      { id: 'u_daf', roles: [RoleCode.DAF_PAYS] },
    );
    expect(r.canAct).toBe(true);
    if (r.canAct) expect(r.slot.stage).toBe('VISA_FILIALE_N1');
  });

  it('KO : demandeur ne peut pas signer (separation §12)', () => {
    const r = canActorSignNext(
      { approvalChain: CHAIN, existingSignatures: [], requesterId: 'u_daf' },
      { id: 'u_daf', roles: [RoleCode.DAF_PAYS] },
    );
    expect(r.canAct).toBe(false);
    if (!r.canAct) expect(r.reason).toMatch(/demandeur/i);
  });

  it('KO : role manquant pour le prochain slot', () => {
    const r = canActorSignNext(
      { approvalChain: CHAIN, existingSignatures: [], requesterId: 'requester' },
      { id: 'u_x', roles: [RoleCode.DEMANDEUR] },
    );
    expect(r.canAct).toBe(false);
    if (!r.canAct) expect(r.reason).toMatch(/Role/i);
  });

  it('KO : acteur a deja signe une etape precedente (separation)', () => {
    const r = canActorSignNext(
      {
        approvalChain: CHAIN,
        existingSignatures: [{ stage: 'VISA_FILIALE_N1', actorId: 'u_daf' }],
        requesterId: 'requester',
      },
      { id: 'u_daf', roles: [RoleCode.DAF_PAYS] },
    );
    expect(r.canAct).toBe(false);
    if (!r.canAct) expect(r.reason).toMatch(/deja signe/i);
  });

  it('OK : DFG signe Groupe apres signature N1+N2 d\'autres', () => {
    const r = canActorSignNext(
      {
        approvalChain: CHAIN,
        existingSignatures: [
          { stage: 'VISA_FILIALE_N1', actorId: 'u_daf' },
          { stage: 'VISA_FILIALE_N2', actorId: 'u_fin_n2' },
        ],
        requesterId: 'requester',
      },
      { id: 'u_dfg', roles: [RoleCode.DFG] },
    );
    expect(r.canAct).toBe(true);
    if (r.canAct) expect(r.slot.stage).toBe('VISA_GROUPE');
  });

  it('KO : toutes les signatures sont posees', () => {
    const r = canActorSignNext(
      {
        approvalChain: CHAIN,
        existingSignatures: CHAIN.map((s, i) => ({
          stage: s.stage,
          actorId: 'u' + i,
        })),
        requesterId: 'requester',
      },
      { id: 'u_dfg', roles: [RoleCode.DFG] },
    );
    expect(r.canAct).toBe(false);
  });

  it('un acteur avec plusieurs roles : suffit qu\'un soit autorise', () => {
    const r = canActorSignNext(
      { approvalChain: CHAIN, existingSignatures: [], requesterId: 'requester' },
      {
        id: 'u_multi',
        roles: [RoleCode.DEMANDEUR, RoleCode.DAF_PAYS, RoleCode.AUDITEUR],
      },
    );
    expect(r.canAct).toBe(true);
  });
});
