import { describe, expect, it } from 'vitest';

import { ReceptionStatus, RoleCode } from '@reliance-finance/database';

import { canActorSignReception } from './can-sign.js';

const BASE_CTX = {
  status: ReceptionStatus.DRAFT,
  createdById: 'u_creator',
  requiresTechnical: true,
  opsSignerId: null,
  techSignerId: null,
  financeSignerId: null,
};

describe('canActorSignReception', () => {
  it('DRAFT : DEMANDEUR signe OPS -> SIGNED_OPS', () => {
    const r = canActorSignReception(BASE_CTX, {
      id: 'u_ops',
      roles: [RoleCode.DEMANDEUR],
    });
    expect(r.canSign).toBe(true);
    if (r.canSign) {
      expect(r.stage).toBe('OPS');
      expect(r.nextStatus).toBe(ReceptionStatus.SIGNED_OPS);
    }
  });

  it('DRAFT sans requiresTechnical : OPS saute directement vers SIGNED_TECH', () => {
    const r = canActorSignReception(
      { ...BASE_CTX, requiresTechnical: false },
      { id: 'u_ops', roles: [RoleCode.AP_OFFICER] },
    );
    expect(r.canSign).toBe(true);
    if (r.canSign) expect(r.nextStatus).toBe(ReceptionStatus.SIGNED_TECH);
  });

  it('DRAFT : AUDITEUR ne peut pas signer OPS', () => {
    const r = canActorSignReception(BASE_CTX, {
      id: 'u_a',
      roles: [RoleCode.AUDITEUR],
    });
    expect(r.canSign).toBe(false);
  });

  it('SIGNED_OPS : TECHNIQUE signe TECH', () => {
    const r = canActorSignReception(
      { ...BASE_CTX, status: ReceptionStatus.SIGNED_OPS, opsSignerId: 'u_ops' },
      { id: 'u_tech', roles: [RoleCode.TECHNIQUE] },
    );
    expect(r.canSign).toBe(true);
    if (r.canSign) {
      expect(r.stage).toBe('TECH');
      expect(r.nextStatus).toBe(ReceptionStatus.SIGNED_TECH);
    }
  });

  it('SIGNED_OPS : OPS signer ne peut pas re-signer TECH (separation)', () => {
    const r = canActorSignReception(
      { ...BASE_CTX, status: ReceptionStatus.SIGNED_OPS, opsSignerId: 'u_ops' },
      { id: 'u_ops', roles: [RoleCode.TECHNIQUE] },
    );
    expect(r.canSign).toBe(false);
    if (!r.canSign) expect(r.reason).toMatch(/separation/i);
  });

  it('SIGNED_OPS sans requiresTechnical : pas de signature TECH attendue', () => {
    const r = canActorSignReception(
      { ...BASE_CTX, status: ReceptionStatus.SIGNED_OPS, requiresTechnical: false },
      { id: 'u_tech', roles: [RoleCode.TECHNIQUE] },
    );
    expect(r.canSign).toBe(false);
  });

  it('SIGNED_TECH : DAF_PAYS signe FINANCE', () => {
    const r = canActorSignReception(
      {
        ...BASE_CTX,
        status: ReceptionStatus.SIGNED_TECH,
        opsSignerId: 'u_ops',
        techSignerId: 'u_tech',
      },
      { id: 'u_daf', roles: [RoleCode.DAF_PAYS] },
    );
    expect(r.canSign).toBe(true);
    if (r.canSign) expect(r.stage).toBe('FINANCE');
  });

  it('SIGNED_TECH : OPS ou TECH ne peuvent pas viser FINANCE', () => {
    const ctx = {
      ...BASE_CTX,
      status: ReceptionStatus.SIGNED_TECH,
      opsSignerId: 'u_ops',
      techSignerId: 'u_tech',
    };
    expect(
      canActorSignReception(ctx, { id: 'u_ops', roles: [RoleCode.DAF_PAYS] }).canSign,
    ).toBe(false);
    expect(
      canActorSignReception(ctx, { id: 'u_tech', roles: [RoleCode.DAF_PAYS] }).canSign,
    ).toBe(false);
  });

  it('SIGNED_FINANCE : aucune signature attendue', () => {
    const r = canActorSignReception(
      { ...BASE_CTX, status: ReceptionStatus.SIGNED_FINANCE },
      { id: 'u_dfg', roles: [RoleCode.DFG] },
    );
    expect(r.canSign).toBe(false);
  });

  it('DEFINITIVE : aucune signature attendue', () => {
    const r = canActorSignReception(
      { ...BASE_CTX, status: ReceptionStatus.DEFINITIVE },
      { id: 'u_dfg', roles: [RoleCode.DFG] },
    );
    expect(r.canSign).toBe(false);
  });
});
