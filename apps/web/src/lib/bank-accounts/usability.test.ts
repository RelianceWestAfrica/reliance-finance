import { describe, expect, it } from 'vitest';

import { isBankAccountUsable, isBankAccountUsableSimple } from './usability.js';

const NOW = new Date('2026-05-18T12:00:00Z');
const YESTERDAY = new Date('2026-05-17T12:00:00Z');
const TOMORROW = new Date('2026-05-19T12:00:00Z');

describe('isBankAccountUsable', () => {
  it('usable: true sur compte actif, verifie, hors quarantaine', () => {
    expect(
      isBankAccountUsable(
        { isActive: true, verifiedAt: YESTERDAY, quarantineUntil: null },
        NOW,
      ),
    ).toEqual({ usable: true });
  });

  it('usable: true sur compte avec quarantaine echue', () => {
    expect(
      isBankAccountUsable(
        { isActive: true, verifiedAt: YESTERDAY, quarantineUntil: YESTERDAY },
        NOW,
      ),
    ).toEqual({ usable: true });
  });

  it('usable: false avec reason INACTIVE si isActive=false', () => {
    const result = isBankAccountUsable(
      { isActive: false, verifiedAt: YESTERDAY, quarantineUntil: null },
      NOW,
    );
    expect(result.usable).toBe(false);
    if (!result.usable) expect(result.reason).toBe('INACTIVE');
  });

  it('usable: false avec reason NOT_VERIFIED si verifiedAt=null', () => {
    const result = isBankAccountUsable(
      { isActive: true, verifiedAt: null, quarantineUntil: null },
      NOW,
    );
    expect(result.usable).toBe(false);
    if (!result.usable) {
      expect(result.reason).toBe('NOT_VERIFIED');
      expect(result.message).toContain('non verifie');
    }
  });

  it('usable: false avec reason QUARANTINE si quarantineUntil > now', () => {
    const result = isBankAccountUsable(
      { isActive: true, verifiedAt: YESTERDAY, quarantineUntil: TOMORROW },
      NOW,
    );
    expect(result.usable).toBe(false);
    if (!result.usable) {
      expect(result.reason).toBe('QUARANTINE');
      expect(result.message).toContain('quarantaine');
    }
  });

  it('priorite des reasons : INACTIVE > NOT_VERIFIED > QUARANTINE', () => {
    // Inactif, non verifie, en quarantaine -> renvoie INACTIVE
    const r1 = isBankAccountUsable(
      { isActive: false, verifiedAt: null, quarantineUntil: TOMORROW },
      NOW,
    );
    if (!r1.usable) expect(r1.reason).toBe('INACTIVE');

    // Actif mais non verifie + quarantaine -> renvoie NOT_VERIFIED en priorite
    const r2 = isBankAccountUsable(
      { isActive: true, verifiedAt: null, quarantineUntil: TOMORROW },
      NOW,
    );
    if (!r2.usable) expect(r2.reason).toBe('NOT_VERIFIED');
  });
});

describe('isBankAccountUsableSimple', () => {
  it('renvoie boolean direct', () => {
    expect(
      isBankAccountUsableSimple(
        { isActive: true, verifiedAt: YESTERDAY, quarantineUntil: null },
        NOW,
      ),
    ).toBe(true);
    expect(
      isBankAccountUsableSimple(
        { isActive: false, verifiedAt: YESTERDAY, quarantineUntil: null },
        NOW,
      ),
    ).toBe(false);
  });
});
