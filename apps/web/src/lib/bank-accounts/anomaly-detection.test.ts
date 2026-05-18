import { describe, expect, it } from 'vitest';

import {
  detectSuspiciousRibChange,
  DEFAULT_CONFIG,
} from './anomaly-detection.js';

const NOW = new Date('2026-05-18T12:00:00Z');

const STANDARD_SUPPLIER = {
  isStrategic: false,
  createdAt: new Date('2025-01-01T00:00:00Z'), // 16 mois avant NOW
  sensitivity: 'STANDARD' as const,
};

const STRATEGIC_SUPPLIER = {
  isStrategic: true,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  sensitivity: 'STRATEGIC' as const,
};

const NEW_SUPPLIER = {
  isStrategic: false,
  createdAt: new Date('2026-05-15T00:00:00Z'), // 3 jours avant NOW
  sensitivity: 'STANDARD' as const,
};

describe('detectSuspiciousRibChange', () => {
  it('non suspect : pas d\'historique', () => {
    expect(detectSuspiciousRibChange(STANDARD_SUPPLIER, [], NOW)).toEqual({
      suspicious: false,
    });
  });

  it('non suspect : 1 changement actif sur fournisseur ancien', () => {
    expect(
      detectSuspiciousRibChange(
        STANDARD_SUPPLIER,
        [{ id: 'c1', status: 'ACTIVE', createdAt: new Date('2026-04-15') }],
        NOW,
      ),
    ).toEqual({ suspicious: false });
  });

  it('HIGH : 2+ changements en 30 jours', () => {
    const result = detectSuspiciousRibChange(
      STANDARD_SUPPLIER,
      [
        { id: 'c1', status: 'ACTIVE', createdAt: new Date('2026-05-01') },
        { id: 'c2', status: 'ACTIVE', createdAt: new Date('2026-05-10') },
      ],
      NOW,
    );
    expect(result.suspicious).toBe(true);
    if (result.suspicious) {
      expect(result.severity).toBe('HIGH');
      expect(result.reasons[0]).toContain('2 changements');
    }
  });

  it('MEDIUM : changement RIB juste apres creation (< 7 jours)', () => {
    const result = detectSuspiciousRibChange(
      NEW_SUPPLIER,
      [{ id: 'c1', status: 'ACTIVE', createdAt: new Date('2026-05-16') }],
      NOW,
    );
    expect(result.suspicious).toBe(true);
    if (result.suspicious) {
      expect(result.severity).toBe('MEDIUM');
      expect(result.reasons[0]).toContain('apres creation');
    }
  });

  it('CRITICAL : combinaison strategique + autre regle', () => {
    const result = detectSuspiciousRibChange(
      STRATEGIC_SUPPLIER,
      [
        { id: 'c1', status: 'ACTIVE', createdAt: new Date('2026-05-01') },
        { id: 'c2', status: 'ACTIVE', createdAt: new Date('2026-05-10') },
      ],
      NOW,
    );
    expect(result.suspicious).toBe(true);
    if (result.suspicious) {
      expect(result.severity).toBe('CRITICAL');
      expect(result.reasons).toHaveLength(2);
      expect(result.reasons[1]).toContain('strategique');
    }
  });

  it('ignore les changements REJECTED dans le compteur', () => {
    const result = detectSuspiciousRibChange(
      STANDARD_SUPPLIER,
      [
        { id: 'c1', status: 'REJECTED', createdAt: new Date('2026-05-01') },
        { id: 'c2', status: 'REJECTED', createdAt: new Date('2026-05-10') },
      ],
      NOW,
    );
    expect(result.suspicious).toBe(false);
  });

  it('config personnalisee : maxChangesInWindow = 1', () => {
    const result = detectSuspiciousRibChange(
      STANDARD_SUPPLIER,
      [{ id: 'c1', status: 'ACTIVE', createdAt: new Date('2026-05-01') }],
      NOW,
      { ...DEFAULT_CONFIG, maxChangesInWindow: 1 },
    );
    expect(result.suspicious).toBe(true);
  });

  it('config DEFAULT exposee', () => {
    expect(DEFAULT_CONFIG.windowDays).toBe(30);
    expect(DEFAULT_CONFIG.maxChangesInWindow).toBe(2);
    expect(DEFAULT_CONFIG.minDaysSinceSupplierCreation).toBe(7);
  });
});
