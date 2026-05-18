import { describe, expect, it } from 'vitest';

import {
  buildFec,
  buildSyscohadaBalance,
  fecAmount,
  fecDate,
} from './fec-format.js';

describe('fecDate', () => {
  it('format YYYYMMDD UTC', () => {
    expect(fecDate(new Date('2026-05-18T10:00:00Z'))).toBe('20260518');
  });

  it('padding mois et jour < 10', () => {
    expect(fecDate(new Date('2026-01-05T10:00:00Z'))).toBe('20260105');
  });
});

describe('fecAmount', () => {
  it('virgule decimale, jamais de separateur milliers', () => {
    expect(fecAmount(1234567.89)).toBe('1234567,89');
  });

  it('2 decimales obligatoires', () => {
    expect(fecAmount(100)).toBe('100,00');
    expect(fecAmount(100.5)).toBe('100,50');
  });

  it('0 = "0,00"', () => {
    expect(fecAmount(0)).toBe('0,00');
  });
});

describe('buildFec', () => {
  const NOW = new Date('2026-05-18T10:00:00Z');

  it('headers + 0 lignes', () => {
    const fec = buildFec([]);
    expect(fec.split('\n')).toHaveLength(1);
    expect(fec.startsWith('JournalCode|JournalLib|EcritureNum|EcritureDate|')).toBe(true);
  });

  it('1 ligne respecte 18 colonnes', () => {
    const fec = buildFec([
      {
        journalCode: 'BNQ',
        journalLib: 'Banque',
        ecritureNum: '2026-001',
        ecritureDate: NOW,
        compteNum: '401100',
        compteLib: 'Fournisseurs',
        pieceRef: 'RWA-PAY-0001',
        pieceDate: NOW,
        ecritureLib: 'Reglement F2026-A1',
        debit: 500_000,
        credit: 0,
        validDate: NOW,
      },
    ]);
    const dataLine = fec.split('\n')[1];
    expect(dataLine?.split('|')).toHaveLength(18);
  });

  it('echappe les pipes dans les valeurs', () => {
    const fec = buildFec([
      {
        journalCode: 'X',
        journalLib: 'lib|with|pipe',
        ecritureNum: '1',
        ecritureDate: NOW,
        compteNum: '401100',
        compteLib: 'Fournisseurs',
        pieceRef: 'p',
        pieceDate: NOW,
        ecritureLib: 'l',
        debit: 0,
        credit: 0,
        validDate: NOW,
      },
    ]);
    expect(fec).not.toMatch(/lib\|with\|pipe/);
    expect(fec).toMatch(/lib with with pipe|lib with pipe/);
  });

  it('cellules vides pour les champs auxiliaires non remplis', () => {
    const fec = buildFec([
      {
        journalCode: 'BNQ',
        journalLib: 'Banque',
        ecritureNum: '1',
        ecritureDate: NOW,
        compteNum: '512100',
        compteLib: 'Banque',
        pieceRef: 'p',
        pieceDate: NOW,
        ecritureLib: 'l',
        debit: 0,
        credit: 1000,
        validDate: NOW,
      },
    ]);
    const cells = fec.split('\n')[1]?.split('|') ?? [];
    expect(cells[6]).toBe(''); // CompAuxNum vide
    expect(cells[7]).toBe(''); // CompAuxLib vide
    expect(cells[13]).toBe(''); // EcritureLet vide
  });
});

describe('buildSyscohadaBalance', () => {
  it('headers + 1 ligne au format ; CSV', () => {
    const csv = buildSyscohadaBalance([
      {
        accountCode: '401100',
        accountLabel: 'Fournisseurs',
        totalDebit: 5_000_000,
        totalCredit: 4_000_000,
        balance: 1_000_000,
      },
    ]);
    expect(csv.split('\n')[0]).toBe('CompteNum;CompteLib;TotalDebit;TotalCredit;Solde');
    expect(csv.split('\n')[1]).toBe('401100;Fournisseurs;5000000,00;4000000,00;1000000,00');
  });
});
