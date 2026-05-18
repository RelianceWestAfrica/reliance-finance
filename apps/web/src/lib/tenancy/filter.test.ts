import { describe, expect, it } from 'vitest';

import { buildTenancyWhere, postFilterUniqueResult } from './filter.js';

const VISIBLE = ['ent_togo', 'ent_spv1'];

describe('buildTenancyWhere', () => {
  it('renvoie uniquement la clause de tenancy si aucun where existant', () => {
    expect(buildTenancyWhere('ExpenseRequest', undefined, VISIBLE)).toEqual({
      entityId: { in: VISIBLE },
    });
  });

  it('renvoie uniquement la clause de tenancy si where vide', () => {
    expect(buildTenancyWhere('ExpenseRequest', {}, VISIBLE)).toEqual({
      entityId: { in: VISIBLE },
    });
  });

  it('preserve les conditions caller dans un AND', () => {
    const result = buildTenancyWhere(
      'ExpenseRequest',
      { status: 'APPROVED', amount: { gt: 100 } },
      VISIBLE,
    );
    expect(result).toEqual({
      AND: [
        { status: 'APPROVED', amount: { gt: 100 } },
        { entityId: { in: VISIBLE } },
      ],
    });
  });

  it('etend un AND existant sans l\'ecraser', () => {
    const result = buildTenancyWhere(
      'PurchaseOrder',
      {
        AND: [{ status: 'SIGNED' }, { totalTtc: { gt: 1000 } }],
      },
      VISIBLE,
    );
    expect(result).toEqual({
      AND: [
        { status: 'SIGNED' },
        { totalTtc: { gt: 1000 } },
        { entityId: { in: VISIBLE } },
      ],
    });
  });

  it('utilise le champ `id` pour le modele Entity', () => {
    expect(buildTenancyWhere('Entity', { kind: 'SUBSIDIARY' }, VISIBLE)).toEqual({
      AND: [{ kind: 'SUBSIDIARY' }, { id: { in: VISIBLE } }],
    });
  });

  it('utilise le champ `entityId` pour les autres modeles tenant-scoped', () => {
    expect(buildTenancyWhere('Supplier', undefined, VISIBLE)).toEqual({
      entityId: { in: VISIBLE },
    });
    expect(buildTenancyWhere('Invoice', undefined, VISIBLE)).toEqual({
      entityId: { in: VISIBLE },
    });
  });

  it('genere un filtre vide quand visibleEntityIds est vide (= zero acces)', () => {
    expect(buildTenancyWhere('ExpenseRequest', undefined, [])).toEqual({
      entityId: { in: [] },
    });
  });
});

describe('postFilterUniqueResult', () => {
  it('renvoie null si le resultat initial est null', () => {
    expect(postFilterUniqueResult('Supplier', null, VISIBLE)).toBeNull();
  });

  it('renvoie le resultat si entityId est visible', () => {
    const supplier = { id: 'sup1', entityId: 'ent_togo', name: 'BTP' };
    expect(postFilterUniqueResult('Supplier', supplier, VISIBLE)).toEqual(supplier);
  });

  it('renvoie null si entityId hors scope (anti-leak)', () => {
    const supplier = { id: 'sup1', entityId: 'ent_ci', name: 'Fournisseur CI' };
    expect(postFilterUniqueResult('Supplier', supplier, VISIBLE)).toBeNull();
  });

  it('renvoie null si le champ tenancy est manquant ou non-string', () => {
    const broken = { id: 'sup1', entityId: 42 };
    expect(postFilterUniqueResult('Supplier', broken, VISIBLE)).toBeNull();
  });

  it('utilise le champ `id` pour le modele Entity', () => {
    const entity = { id: 'ent_togo', name: 'Togo SARL' };
    expect(postFilterUniqueResult('Entity', entity, VISIBLE)).toEqual(entity);
    const hidden = { id: 'ent_ci', name: 'CI SARL' };
    expect(postFilterUniqueResult('Entity', hidden, VISIBLE)).toBeNull();
  });
});
