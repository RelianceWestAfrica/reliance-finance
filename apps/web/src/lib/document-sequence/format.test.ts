import { describe, expect, it } from 'vitest';

import { DocumentType } from '@reliance-finance/database';

import { formatReference } from './allocate.js';

describe('formatReference', () => {
  it('format complet avec projet', () => {
    expect(
      formatReference({
        type: DocumentType.FD,
        entityCode: 'TOGO',
        projectCode: 'CIDPE',
        year: 2026,
        seq: 42,
      }),
    ).toBe('RWA-FD-TOGO-CIDPE-2026-0042');
  });

  it('format sans projet (skip le segment)', () => {
    expect(
      formatReference({
        type: DocumentType.PV,
        entityCode: 'HOLDING',
        projectCode: null,
        year: 2026,
        seq: 7,
      }),
    ).toBe('RWA-PV-HOLDING-2026-0007');
  });

  it('padding sur 4 chiffres minimum', () => {
    expect(
      formatReference({
        type: DocumentType.BC,
        entityCode: 'CI',
        projectCode: 'RWA1',
        year: 2026,
        seq: 1,
      }),
    ).toBe('RWA-BC-CI-RWA1-2026-0001');
  });

  it('numero > 9999 garde tous les chiffres (pas tronque)', () => {
    expect(
      formatReference({
        type: DocumentType.FDA,
        entityCode: 'TOGO',
        projectCode: null,
        year: 2026,
        seq: 12345,
      }),
    ).toBe('RWA-FDA-TOGO-2026-12345');
  });
});
