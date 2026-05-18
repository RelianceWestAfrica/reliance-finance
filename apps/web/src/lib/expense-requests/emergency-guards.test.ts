import { describe, expect, it } from 'vitest';

import {
  checkEmergencyConditions,
  computeRegularizationDeadline,
  isStaleRegularization,
} from './emergency-guards.js';

const TH = { maxAmount: 10_000_000, maxRegularizationHours: 72 };

const VALID_CTX = {
  hasImminentRisk: true,
  riskType: 'CHANTIER' as const,
  riskJustification:
    'Arret chantier RWA1 imminent suite a rupture stock ciment ; cout d\'arret estime > montant urgence',
  amountInGroupCurrency: 2_000_000,
  commitsToRegularization: true,
};

describe('checkEmergencyConditions', () => {
  it('OK quand toutes les 4 conditions sont reunies', () => {
    expect(checkEmergencyConditions(VALID_CTX, TH)).toEqual({
      ok: true,
      deadlineHours: 72,
    });
  });

  it('KO : pas de risque imminent', () => {
    const r = checkEmergencyConditions(
      { ...VALID_CTX, hasImminentRisk: false },
      TH,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations[0]).toMatch(/risque imminent/i);
  });

  it('KO : risque coche mais type null', () => {
    const r = checkEmergencyConditions(
      { ...VALID_CTX, riskType: null },
      TH,
    );
    expect(r.ok).toBe(false);
  });

  it('KO : justification trop courte (< 30 chars)', () => {
    const r = checkEmergencyConditions(
      { ...VALID_CTX, riskJustification: 'Trop court' },
      TH,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.includes('30 caracteres'))).toBe(true);
  });

  it('KO : montant depasse le plafond', () => {
    const r = checkEmergencyConditions(
      { ...VALID_CTX, amountInGroupCurrency: 15_000_000 },
      TH,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.includes('plafond'))).toBe(true);
  });

  it('KO : pas d\'engagement de regularisation', () => {
    const r = checkEmergencyConditions(
      { ...VALID_CTX, commitsToRegularization: false },
      TH,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.some((v) => v.includes('regularisation'))).toBe(true);
  });

  it('cumulatif : 3 violations simultanees -> 3 messages', () => {
    const r = checkEmergencyConditions(
      {
        ...VALID_CTX,
        hasImminentRisk: false,
        commitsToRegularization: false,
        amountInGroupCurrency: 20_000_000,
      },
      TH,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.length).toBeGreaterThanOrEqual(3);
  });
});

describe('computeRegularizationDeadline', () => {
  it('72h ajoutees a la date d\'approbation', () => {
    const t0 = new Date('2026-05-18T10:00:00Z');
    expect(computeRegularizationDeadline(t0, 72)).toEqual(
      new Date('2026-05-21T10:00:00Z'),
    );
  });
});

describe('isStaleRegularization', () => {
  const deadline = new Date('2026-05-20T10:00:00Z');

  it('non stale si deadline pas encore passee', () => {
    expect(isStaleRegularization(deadline, null, new Date('2026-05-19T10:00:00Z'))).toBe(false);
  });

  it('stale si deadline passee et pas regularise', () => {
    expect(isStaleRegularization(deadline, null, new Date('2026-05-21T10:00:00Z'))).toBe(true);
  });

  it('non stale si regularise meme apres deadline', () => {
    expect(
      isStaleRegularization(deadline, new Date('2026-05-22'), new Date('2026-05-23')),
    ).toBe(false);
  });

  it('non stale si pas de deadline (= non urgence)', () => {
    expect(isStaleRegularization(null, null, new Date())).toBe(false);
  });
});
