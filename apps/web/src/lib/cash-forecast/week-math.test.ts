import { describe, expect, it } from 'vitest';

import {
  getWeekStart,
  getWeekEnd,
  nextNWeekStarts,
  weekLabel,
  getIsoWeekNumber,
} from './week-math.js';

describe('getWeekStart', () => {
  it('renvoie le lundi de la semaine pour un dimanche', () => {
    // 2026-05-17 est un dimanche
    expect(getWeekStart(new Date('2026-05-17T15:00:00Z'))).toEqual(
      new Date('2026-05-11T00:00:00Z'),
    );
  });

  it('renvoie le lundi pour un mercredi de la meme semaine', () => {
    expect(getWeekStart(new Date('2026-05-13T15:00:00Z'))).toEqual(
      new Date('2026-05-11T00:00:00Z'),
    );
  });

  it('renvoie lui-meme pour un lundi a 00:00', () => {
    const monday = new Date('2026-05-11T00:00:00Z');
    expect(getWeekStart(monday)).toEqual(monday);
  });

  it('cas limite annee : 1er janvier vendredi', () => {
    // 1er janvier 2027 est un vendredi -> semaine commence lundi 28 dec 2026
    expect(getWeekStart(new Date('2027-01-01T12:00:00Z'))).toEqual(
      new Date('2026-12-28T00:00:00Z'),
    );
  });
});

describe('getWeekEnd', () => {
  it('renvoie le dimanche 23:59:59.999 UTC', () => {
    expect(getWeekEnd(new Date('2026-05-13T15:00:00Z'))).toEqual(
      new Date('2026-05-17T23:59:59.999Z'),
    );
  });
});

describe('nextNWeekStarts', () => {
  it('renvoie 13 lundis consecutifs', () => {
    const weeks = nextNWeekStarts(new Date('2026-05-13T10:00:00Z'), 13);
    expect(weeks).toHaveLength(13);
    expect(weeks[0]).toEqual(new Date('2026-05-11T00:00:00Z'));
    expect(weeks[12]).toEqual(new Date('2026-08-03T00:00:00Z'));
  });

  it('renvoie 0 elements si N=0', () => {
    expect(nextNWeekStarts(new Date('2026-05-13'), 0)).toEqual([]);
  });
});

describe('getIsoWeekNumber', () => {
  it('semaine 1 du 4 jan 2027 (jeudi)', () => {
    expect(getIsoWeekNumber(new Date('2027-01-04T12:00:00Z'))).toBe(1);
  });

  it('semaine 20 du 11 mai 2026 (lundi)', () => {
    expect(getIsoWeekNumber(new Date('2026-05-11T12:00:00Z'))).toBe(20);
  });
});

describe('weekLabel', () => {
  it('format S<n> (<jour> <mois>)', () => {
    expect(weekLabel(new Date('2026-05-11T00:00:00Z'))).toBe('S20 (11 mai)');
  });
});
