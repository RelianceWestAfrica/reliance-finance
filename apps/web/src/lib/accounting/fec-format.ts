// =============================================================================
// Accounting - Export au format FEC (Fichier des Ecritures Comptables)
// =============================================================================
// Source : LegiFrance article LEGIARTI000027779284
// Format : pipe-separated (`|`), encoding UTF-8 avec BOM, 18 colonnes,
// premiere ligne = headers.
//
// Note : FEC est francais (DGFiP). Pour OHADA / SYSCOHADA pur, le format
// "Balance Generale" et "Grand Livre" sont preferes - exposes en CSV
// avec separateur `;` ici. Le FEC reste utile comme format pivot vers
// les outils tiers.
//
// Logique PURE : prend les entries, retourne string. Aucune I/O.
// =============================================================================

export interface FecLine {
  journalCode: string;
  journalLib: string;
  ecritureNum: string;
  ecritureDate: Date;
  compteNum: string;
  compteLib: string;
  compAuxNum?: string;
  compAuxLib?: string;
  pieceRef: string;
  pieceDate: Date;
  ecritureLib: string;
  debit: number;
  credit: number;
  ecritureLet?: string;
  dateLet?: Date | null;
  validDate: Date;
  montantDevise?: number;
  iDevise?: string;
}

const FEC_HEADERS = [
  'JournalCode',
  'JournalLib',
  'EcritureNum',
  'EcritureDate',
  'CompteNum',
  'CompteLib',
  'CompAuxNum',
  'CompAuxLib',
  'PieceRef',
  'PieceDate',
  'EcritureLib',
  'Debit',
  'Credit',
  'EcritureLet',
  'DateLet',
  'ValidDate',
  'Montantdevise',
  'Idevise',
] as const;

/** Format YYYYMMDD requis par FEC */
export function fecDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return '' + y + m + day;
}

/** Format montant : ',' decimal, jamais de separateur milliers */
export function fecAmount(value: number): string {
  if (value === 0) return '0,00';
  return value.toFixed(2).replace('.', ',');
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Pipes interdits dans les valeurs FEC. Remplaces par espace.
  return str.replace(/\|/g, ' ').replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Renvoie le contenu FEC complet (headers + lignes), pret a etre ecrit en
 * UTF-8 BOM dans la response HTTP.
 */
export function buildFec(lines: FecLine[]): string {
  const rows: string[] = [FEC_HEADERS.join('|')];

  for (const line of lines) {
    rows.push(
      [
        escapeCell(line.journalCode),
        escapeCell(line.journalLib),
        escapeCell(line.ecritureNum),
        fecDate(line.ecritureDate),
        escapeCell(line.compteNum),
        escapeCell(line.compteLib),
        escapeCell(line.compAuxNum ?? ''),
        escapeCell(line.compAuxLib ?? ''),
        escapeCell(line.pieceRef),
        fecDate(line.pieceDate),
        escapeCell(line.ecritureLib),
        fecAmount(line.debit),
        fecAmount(line.credit),
        escapeCell(line.ecritureLet ?? ''),
        line.dateLet ? fecDate(line.dateLet) : '',
        fecDate(line.validDate),
        line.montantDevise ? fecAmount(line.montantDevise) : '',
        escapeCell(line.iDevise ?? ''),
      ].join('|'),
    );
  }

  return rows.join('\n');
}

// =============================================================================
// Export "Balance generale" SYSCOHADA (plus simple - CSV `;`)
// =============================================================================

export interface BalanceLine {
  accountCode: string;
  accountLabel: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export function buildSyscohadaBalance(lines: BalanceLine[]): string {
  const headers = ['CompteNum', 'CompteLib', 'TotalDebit', 'TotalCredit', 'Solde'];
  const rows: string[] = [headers.join(';')];
  for (const line of lines) {
    rows.push(
      [
        line.accountCode,
        escapeCell(line.accountLabel),
        fecAmount(line.totalDebit),
        fecAmount(line.totalCredit),
        fecAmount(line.balance),
      ].join(';'),
    );
  }
  return rows.join('\n');
}
