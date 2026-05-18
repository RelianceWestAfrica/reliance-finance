import { describe, expect, it } from 'vitest';

import { ThresholdType } from '@reliance-finance/database';

import { resolveThreshold, thresholdAmount } from './resolve.js';

const NOW = new Date('2026-05-18T12:00:00Z');
const YESTERDAY = new Date('2026-05-17T12:00:00Z');
const LAST_MONTH = new Date('2026-04-18T12:00:00Z');
const TOMORROW = new Date('2026-05-19T12:00:00Z');

function makeT(overrides: Partial<Parameters<typeof resolveThreshold>[2][number]>) {
  return {
    id: 'th_' + Math.random().toString(36).slice(2, 8),
    type: ThresholdType.GROUPE_REQUIRED_ABOVE,
    entityId: null,
    amount: { toString: () => '5000000' },
    value: null,
    currency: 'XOF',
    effectiveFrom: YESTERDAY,
    effectiveTo: null,
    isActive: true,
    ...overrides,
  };
}

describe('resolveThreshold', () => {
  it('renvoie null si aucun candidat', () => {
    expect(resolveThreshold(ThresholdType.GROUPE_REQUIRED_ABOVE, null, [], NOW)).toBeNull();
  });

  it('renvoie le seuil global si pas de specifique', () => {
    const global = makeT({});
    const result = resolveThreshold(ThresholdType.GROUPE_REQUIRED_ABOVE, 'ent_togo', [global], NOW);
    expect(result?.id).toBe(global.id);
  });

  it('prefere le seuil specifique a l\'entite quand les deux existent', () => {
    const global = makeT({ entityId: null, amount: { toString: () => '5000000' } });
    const specific = makeT({ entityId: 'ent_togo', amount: { toString: () => '3000000' } });
    const result = resolveThreshold(
      ThresholdType.GROUPE_REQUIRED_ABOVE,
      'ent_togo',
      [global, specific],
      NOW,
    );
    expect(result?.id).toBe(specific.id);
  });

  it('ignore un seuil inactif', () => {
    const inactive = makeT({ isActive: false });
    expect(
      resolveThreshold(ThresholdType.GROUPE_REQUIRED_ABOVE, null, [inactive], NOW),
    ).toBeNull();
  });

  it('ignore un seuil futur (effectiveFrom > now)', () => {
    const future = makeT({ effectiveFrom: TOMORROW });
    expect(
      resolveThreshold(ThresholdType.GROUPE_REQUIRED_ABOVE, null, [future], NOW),
    ).toBeNull();
  });

  it('ignore un seuil expire (effectiveTo <= now)', () => {
    const expired = makeT({ effectiveTo: YESTERDAY });
    expect(
      resolveThreshold(ThresholdType.GROUPE_REQUIRED_ABOVE, null, [expired], NOW),
    ).toBeNull();
  });

  it('prend le seuil le plus recent (effectiveFrom desc) en cas de plusieurs candidats', () => {
    const old = makeT({ effectiveFrom: LAST_MONTH, amount: { toString: () => '4000000' } });
    const recent = makeT({ effectiveFrom: YESTERDAY, amount: { toString: () => '5000000' } });
    const result = resolveThreshold(
      ThresholdType.GROUPE_REQUIRED_ABOVE,
      null,
      [old, recent],
      NOW,
    );
    expect(result?.id).toBe(recent.id);
  });

  it('filtre par type (n\'utilise pas un seuil d\'un autre type)', () => {
    const wrongType = makeT({ type: ThresholdType.AG_REQUIRED_ABOVE });
    expect(
      resolveThreshold(ThresholdType.GROUPE_REQUIRED_ABOVE, null, [wrongType], NOW),
    ).toBeNull();
  });
});

describe('thresholdAmount', () => {
  it('renvoie amount converti en number quand non null', () => {
    const t = { amount: { toString: () => '500000' }, value: null } as never;
    expect(thresholdAmount(t)).toBe(500000);
  });

  it('fallback sur value pour les seuils non-monetaires (heures, pourcentages)', () => {
    const t = { amount: null, value: { toString: () => '72' } } as never;
    expect(thresholdAmount(t)).toBe(72);
  });

  it('renvoie null si amount et value sont null', () => {
    const t = { amount: null, value: null } as never;
    expect(thresholdAmount(t)).toBeNull();
  });
});
