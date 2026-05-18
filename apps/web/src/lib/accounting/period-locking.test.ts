import { describe, expect, it } from 'vitest';

import {
  isEntryInClosedPeriod,
  isEntryBeforeOldestClosedPeriod,
} from './period-locking.js';

const TOGO = 'ent_togo';

const PERIODS = [
  { entityId: TOGO, year: 2026, month: 3, isClosed: true },
  { entityId: TOGO, year: 2026, month: 4, isClosed: true },
  { entityId: TOGO, year: 2026, month: 5, isClosed: false },
];

describe('isEntryInClosedPeriod', () => {
  it('locked : ecriture en periode close', () => {
    const r = isEntryInClosedPeriod(TOGO, new Date('2026-04-15T10:00:00Z'), PERIODS);
    expect(r.locked).toBe(true);
    expect(r.reason).toContain('2026-04');
  });

  it('non locked : ecriture en periode ouverte', () => {
    const r = isEntryInClosedPeriod(TOGO, new Date('2026-05-10T10:00:00Z'), PERIODS);
    expect(r.locked).toBe(false);
  });

  it('non locked : periode pas declaree (avant ouverture)', () => {
    const r = isEntryInClosedPeriod(TOGO, new Date('2026-06-01T10:00:00Z'), PERIODS);
    expect(r.locked).toBe(false);
  });

  it('isole par entite : Togo close, CI ouverte', () => {
    const periods = [
      { entityId: TOGO, year: 2026, month: 4, isClosed: true },
      { entityId: 'ent_ci', year: 2026, month: 4, isClosed: false },
    ];
    expect(isEntryInClosedPeriod(TOGO, new Date('2026-04-15Z'), periods).locked).toBe(true);
    expect(isEntryInClosedPeriod('ent_ci', new Date('2026-04-15Z'), periods).locked).toBe(false);
  });

  it('limite : derniere journee periode close = bloquee', () => {
    const r = isEntryInClosedPeriod(TOGO, new Date('2026-04-30T23:59:59Z'), PERIODS);
    expect(r.locked).toBe(true);
  });

  it('limite : premiere journee periode ouverte = OK', () => {
    const r = isEntryInClosedPeriod(TOGO, new Date('2026-05-01T00:00:00Z'), PERIODS);
    expect(r.locked).toBe(false);
  });
});

describe('isEntryBeforeOldestClosedPeriod', () => {
  it('locked : ecriture anterieure a la plus ancienne periode close', () => {
    const r = isEntryBeforeOldestClosedPeriod(
      TOGO,
      new Date('2026-01-15T10:00:00Z'),
      PERIODS,
    );
    expect(r.locked).toBe(true);
    expect(r.reason).toContain('2026-03');
  });

  it('non locked : aucune periode close', () => {
    const r = isEntryBeforeOldestClosedPeriod(
      TOGO,
      new Date('2025-01-15Z'),
      [{ entityId: TOGO, year: 2026, month: 5, isClosed: false }],
    );
    expect(r.locked).toBe(false);
  });

  it('non locked : ecriture posterieure', () => {
    const r = isEntryBeforeOldestClosedPeriod(
      TOGO,
      new Date('2026-05-15Z'),
      PERIODS,
    );
    expect(r.locked).toBe(false);
  });
});
