import { describe, expect, it } from 'vitest';

import { BankAccountChangeStatus, RoleCode } from '@reliance-finance/database';

import {
  canApproveLevel1,
  canApproveLevel2,
  computeQuarantineUntil,
} from './change-validation.js';

const requester = 'u_requester';
const n1 = 'u_n1';
const n2 = 'u_n2';

const REQUESTED = {
  status: BankAccountChangeStatus.REQUESTED,
  requestedById: requester,
  approvedBy1Id: null,
  approvedBy2Id: null,
};

const PENDING_N2 = {
  status: BankAccountChangeStatus.DUAL_VALIDATION_PENDING,
  requestedById: requester,
  approvedBy1Id: n1,
  approvedBy2Id: null,
};

const dafTogo = {
  id: n1,
  memberships: [
    { entityId: 'ent_togo', entityCode: 'TOGO', role: RoleCode.DAF_PAYS },
  ],
};

const dfg = {
  id: n2,
  memberships: [
    { entityId: 'ent_holding', entityCode: 'HOLDING', role: RoleCode.DFG },
  ],
};

const requesterActor = {
  id: requester,
  memberships: [
    { entityId: 'ent_togo', entityCode: 'TOGO', role: RoleCode.AP_OFFICER },
  ],
};

describe('canApproveLevel1', () => {
  it('OK : DAF Pays valide une demande REQUESTED', () => {
    expect(canApproveLevel1(REQUESTED, dafTogo)).toEqual({ ok: true });
  });

  it('KO : le demandeur ne peut pas valider sa propre demande', () => {
    const result = canApproveLevel1(REQUESTED, requesterActor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/demandeur/i);
  });

  it('KO : statut autre que REQUESTED', () => {
    const result = canApproveLevel1(PENDING_N2, dafTogo);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/N1/);
  });

  it('KO : utilisateur sans role autorise (DEMANDEUR seul)', () => {
    const plainDemandeur = {
      id: 'u_other',
      memberships: [
        { entityId: 'ent_togo', entityCode: 'TOGO', role: RoleCode.DEMANDEUR },
      ],
    };
    const result = canApproveLevel1(REQUESTED, plainDemandeur);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Role/i);
  });

  it('OK : Finance Filiale N1 valide en N1', () => {
    const fil = {
      id: 'u_fil',
      memberships: [
        { entityId: 'ent_togo', entityCode: 'TOGO', role: RoleCode.FINANCE_FIL_N1 },
      ],
    };
    expect(canApproveLevel1(REQUESTED, fil)).toEqual({ ok: true });
  });
});

describe('canApproveLevel2', () => {
  it('OK : DFG valide N2 sur changement en DUAL_VALIDATION_PENDING', () => {
    expect(canApproveLevel2(PENDING_N2, dfg)).toEqual({ ok: true });
  });

  it('KO : statut autre que DUAL_VALIDATION_PENDING', () => {
    const result = canApproveLevel2(REQUESTED, dfg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/N2/);
  });

  it('KO : N1 ne peut pas etre N2 (separation des fonctions)', () => {
    const sameUser = {
      ...dafTogo,
      id: n1, // meme que approvedBy1Id
      memberships: [
        ...dafTogo.memberships,
        { entityId: 'ent_holding', entityCode: 'HOLDING', role: RoleCode.DFG },
      ],
    };
    const result = canApproveLevel2(PENDING_N2, sameUser);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/N1.*N2|separation/i);
  });

  it('KO : demandeur ne peut pas etre N2', () => {
    const requesterAsDfg = {
      id: requester,
      memberships: [
        { entityId: 'ent_holding', entityCode: 'HOLDING', role: RoleCode.DFG },
      ],
    };
    const result = canApproveLevel2(PENDING_N2, requesterAsDfg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/demandeur/i);
  });

  it('KO : role groupe sans privilege approprie (AUDITEUR readonly)', () => {
    const auditor = {
      id: 'u_auditor',
      memberships: [
        { entityId: 'ent_holding', entityCode: 'HOLDING', role: RoleCode.AUDITEUR },
      ],
    };
    const result = canApproveLevel2(PENDING_N2, auditor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Role/i);
  });

  it('OK : Tresorier Groupe valide en N2', () => {
    const tresorier = {
      id: 'u_tresorier',
      memberships: [
        {
          entityId: 'ent_holding',
          entityCode: 'HOLDING',
          role: RoleCode.TRESORIER_GROUPE,
        },
      ],
    };
    expect(canApproveLevel2(PENDING_N2, tresorier)).toEqual({ ok: true });
  });
});

describe('computeQuarantineUntil', () => {
  it('ajoute N heures a la date d\'approbation', () => {
    const approvedAt = new Date('2026-05-18T12:00:00Z');
    expect(computeQuarantineUntil(approvedAt, 24)).toEqual(
      new Date('2026-05-19T12:00:00Z'),
    );
    expect(computeQuarantineUntil(approvedAt, 48)).toEqual(
      new Date('2026-05-20T12:00:00Z'),
    );
  });

  it('gere 0 heure (pas de carence)', () => {
    const approvedAt = new Date('2026-05-18T12:00:00Z');
    expect(computeQuarantineUntil(approvedAt, 0).getTime()).toBe(approvedAt.getTime());
  });
});
