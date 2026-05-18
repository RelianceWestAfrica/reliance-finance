// =============================================================================
// Reliance Finance - Seed de reference
// =============================================================================
// Donnees minimales pour demarrer en developpement :
//   - 4 devises (XOF, XAF, USD, EUR) + taux de change indicatifs
//   - Plan comptable SYSCOHADA minimal (classes 1 a 7, comptes les plus courants)
//   - Holding RWA (Lome) + Filiale Togo + 1 SPV pilote
//   - Centres de cout + 1 projet pilote
//   - Seuils par defaut (filiale N2, groupe, AG, urgence, plafond cash)
//   - 4 utilisateurs : 1 admin, 1 DFG, 1 DAF Togo, 1 demandeur
//   - 2 fournisseurs de demonstration (1 standard, 1 sensible)
//
// Mot de passe admin par defaut : "ChangeMe123!" (a changer en premier login)
// =============================================================================

import { PrismaClient, EntityKind, RoleCode, ThresholdType, SupplierSensitivity, SupplierStatus } from '../src/generated/client/index.js';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const DEFAULT_ADMIN_PASSWORD = 'ChangeMe123!';

async function main() {
  console.info('Seed - Reliance Finance');
  console.info('======================\n');

  // ---------------------------------------------------------------------------
  // Devises + taux
  // ---------------------------------------------------------------------------
  console.info('-> Devises et taux de change...');
  const currencies = [
    { code: 'XOF', name: 'Franc CFA BCEAO', symbol: 'F CFA', decimals: 0 },
    { code: 'XAF', name: 'Franc CFA BEAC', symbol: 'F CFA', decimals: 0 },
    { code: 'EUR', name: 'Euro', symbol: 'EUR', decimals: 2 },
    { code: 'USD', name: 'Dollar US', symbol: '$', decimals: 2 },
  ];
  for (const c of currencies) {
    await prisma.currency.upsert({ where: { code: c.code }, update: c, create: c });
  }

  const today = new Date();
  await prisma.exchangeRate.upsert({
    where: { fromCurrency_toCurrency_effectiveDate: { fromCurrency: 'EUR', toCurrency: 'XOF', effectiveDate: today } },
    update: { rate: 655.957 },
    create: { fromCurrency: 'EUR', toCurrency: 'XOF', rate: 655.957, effectiveDate: today, source: 'BCEAO peg' },
  });
  await prisma.exchangeRate.upsert({
    where: { fromCurrency_toCurrency_effectiveDate: { fromCurrency: 'USD', toCurrency: 'XOF', effectiveDate: today } },
    update: { rate: 600.0 },
    create: { fromCurrency: 'USD', toCurrency: 'XOF', rate: 600.0, effectiveDate: today, source: 'indicatif' },
  });

  // ---------------------------------------------------------------------------
  // Plan comptable SYSCOHADA minimal
  // ---------------------------------------------------------------------------
  console.info('-> Plan comptable SYSCOHADA (echantillon)...');
  const chartAccounts = [
    // Classe 1 : Comptes de ressources durables
    { code: '101000', label: 'Capital social', classCode: '1', className: 'Comptes de ressources durables', type: 'EQUITY' },
    { code: '161000', label: 'Emprunts obligataires', classCode: '1', className: 'Comptes de ressources durables', type: 'LIABILITY' },
    { code: '162000', label: 'Emprunts et dettes aupres etablissements de credit', classCode: '1', className: 'Comptes de ressources durables', type: 'LIABILITY' },
    // Classe 2 : Comptes d'actif immobilise
    { code: '211000', label: 'Terrains', classCode: '2', className: 'Comptes d\'actif immobilise', type: 'ASSET' },
    { code: '213000', label: 'Batiments', classCode: '2', className: 'Comptes d\'actif immobilise', type: 'ASSET' },
    { code: '244000', label: 'Materiel et mobilier de bureau', classCode: '2', className: 'Comptes d\'actif immobilise', type: 'ASSET' },
    // Classe 4 : Comptes de tiers
    { code: '401100', label: 'Fournisseurs - achats de biens et services', classCode: '4', className: 'Comptes de tiers', type: 'LIABILITY' },
    { code: '401200', label: 'Fournisseurs - factures non parvenues', classCode: '4', className: 'Comptes de tiers', type: 'LIABILITY' },
    { code: '409100', label: 'Fournisseurs - avances et acomptes verses', classCode: '4', className: 'Comptes de tiers', type: 'ASSET' },
    { code: '411100', label: 'Clients', classCode: '4', className: 'Comptes de tiers', type: 'ASSET' },
    { code: '421000', label: 'Personnel - remunerations dues', classCode: '4', className: 'Comptes de tiers', type: 'LIABILITY' },
    { code: '422000', label: 'Personnel - avances et acomptes', classCode: '4', className: 'Comptes de tiers', type: 'ASSET' },
    { code: '431000', label: 'CNSS', classCode: '4', className: 'Comptes de tiers', type: 'LIABILITY' },
    { code: '441000', label: 'Etat - impots sur les benefices', classCode: '4', className: 'Comptes de tiers', type: 'LIABILITY' },
    { code: '443000', label: 'TVA collectee', classCode: '4', className: 'Comptes de tiers', type: 'LIABILITY' },
    { code: '445000', label: 'TVA recuperable', classCode: '4', className: 'Comptes de tiers', type: 'ASSET' },
    { code: '447000', label: 'Etat - retenues a la source', classCode: '4', className: 'Comptes de tiers', type: 'LIABILITY' },
    // Classe 5 : Comptes de tresorerie
    { code: '512100', label: 'Banque - compte principal', classCode: '5', className: 'Comptes de tresorerie', type: 'ASSET' },
    { code: '521000', label: 'Banques (escrow / projet)', classCode: '5', className: 'Comptes de tresorerie', type: 'ASSET' },
    { code: '571000', label: 'Caisse', classCode: '5', className: 'Comptes de tresorerie', type: 'ASSET' },
    // Classe 6 : Comptes de charges
    { code: '601000', label: 'Achats de marchandises', classCode: '6', className: 'Comptes de charges', type: 'EXPENSE' },
    { code: '604000', label: 'Achats de matieres premieres', classCode: '6', className: 'Comptes de charges', type: 'EXPENSE' },
    { code: '605000', label: 'Autres achats (fournitures, energie)', classCode: '6', className: 'Comptes de charges', type: 'EXPENSE' },
    { code: '614000', label: 'Sous-traitance generale', classCode: '6', className: 'Comptes de charges', type: 'EXPENSE' },
    { code: '622000', label: 'Locations et charges locatives', classCode: '6', className: 'Comptes de charges', type: 'EXPENSE' },
    { code: '624000', label: 'Entretien, reparations et maintenance', classCode: '6', className: 'Comptes de charges', type: 'EXPENSE' },
    { code: '626000', label: 'Etudes, recherches et documentation', classCode: '6', className: 'Comptes de charges', type: 'EXPENSE' },
    { code: '628000', label: 'Honoraires conseils', classCode: '6', className: 'Comptes de charges', type: 'EXPENSE' },
    { code: '641000', label: 'Impots et taxes', classCode: '6', className: 'Comptes de charges', type: 'EXPENSE' },
    { code: '661000', label: 'Salaires bruts', classCode: '6', className: 'Comptes de charges', type: 'EXPENSE' },
    { code: '664000', label: 'Charges sociales', classCode: '6', className: 'Comptes de charges', type: 'EXPENSE' },
    { code: '671000', label: 'Frais financiers (interets emprunts)', classCode: '6', className: 'Comptes de charges', type: 'EXPENSE' },
    // Classe 7 : Comptes de produits
    { code: '701000', label: 'Ventes de marchandises', classCode: '7', className: 'Comptes de produits', type: 'INCOME' },
    { code: '706000', label: 'Services vendus', classCode: '7', className: 'Comptes de produits', type: 'INCOME' },
    { code: '707000', label: 'Produits accessoires', classCode: '7', className: 'Comptes de produits', type: 'INCOME' },
  ];
  for (const a of chartAccounts) {
    await prisma.chartAccount.upsert({
      where: { code: a.code },
      update: a,
      create: a,
    });
  }

  // ---------------------------------------------------------------------------
  // Entites : Holding + Filiale Togo + SPV pilote
  // ---------------------------------------------------------------------------
  console.info('-> Entites...');
  const holding = await prisma.entity.upsert({
    where: { code: 'HOLDING' },
    update: {},
    create: {
      code: 'HOLDING',
      name: 'Reliance West Africa - Holding',
      kind: EntityKind.HOLDING,
      country: 'TG',
      defaultCurrency: 'XOF',
      address: 'Lome, Togo',
    },
  });

  const togoSubsidiary = await prisma.entity.upsert({
    where: { code: 'TOGO' },
    update: { parentEntityId: holding.id },
    create: {
      code: 'TOGO',
      name: 'Reliance Togo SARL',
      kind: EntityKind.SUBSIDIARY,
      country: 'TG',
      defaultCurrency: 'XOF',
      parentEntityId: holding.id,
      address: 'Lome, Togo',
    },
  });

  const spvPilote = await prisma.entity.upsert({
    where: { code: 'RWA1' },
    update: { parentEntityId: togoSubsidiary.id },
    create: {
      code: 'RWA1',
      name: 'SPV Pilote RWA1',
      kind: EntityKind.SPV,
      country: 'TG',
      defaultCurrency: 'XOF',
      parentEntityId: togoSubsidiary.id,
    },
  });

  // ---------------------------------------------------------------------------
  // Projets + Centres de cout (filiale Togo)
  // ---------------------------------------------------------------------------
  console.info('-> Projets et centres de cout...');
  const projectCidpe = await prisma.project.upsert({
    where: { entityId_code: { entityId: togoSubsidiary.id, code: 'CIDPE' } },
    update: {},
    create: {
      entityId: togoSubsidiary.id,
      code: 'CIDPE',
      name: 'Chantier CIDPE - Lome',
      description: 'Projet pilote de demonstration',
      budget: 250000000,
      currency: 'XOF',
    },
  });

  const costCenters = [
    { code: 'CC-ADMIN', name: 'Administration generale' },
    { code: 'CC-TECH', name: 'Technique et IT' },
    { code: 'CC-CHANTIER', name: 'Chantier' },
    { code: 'CC-RH', name: 'Ressources Humaines' },
  ];
  for (const cc of costCenters) {
    await prisma.costCenter.upsert({
      where: { entityId_code: { entityId: togoSubsidiary.id, code: cc.code } },
      update: {},
      create: { entityId: togoSubsidiary.id, code: cc.code, name: cc.name },
    });
  }

  // ---------------------------------------------------------------------------
  // Seuils par defaut (cadre normatif §3, §5, §6)
  // ---------------------------------------------------------------------------
  console.info('-> Seuils de validation...');
  const thresholds: { type: ThresholdType; entityId: string | null; amount?: number; value?: number; description: string }[] = [
    { type: ThresholdType.FILIALE_N2_REQUIRED_ABOVE, entityId: null, amount: 500_000, description: 'Visa filiale N2 requis au-dessus de 500 000 FCFA' },
    { type: ThresholdType.GROUPE_REQUIRED_ABOVE, entityId: null, amount: 5_000_000, description: 'Visa Finance Groupe requis au-dessus de 5 000 000 FCFA' },
    { type: ThresholdType.AG_REQUIRED_ABOVE, entityId: null, amount: 50_000_000, description: 'Autorisation AG requise au-dessus de 50 000 000 FCFA' },
    { type: ThresholdType.CASH_PAYMENT_MAX, entityId: null, amount: 100_000, description: 'Plafond paiement cash (caisse) - cadre §2.2' },
    { type: ThresholdType.URGENCY_MAX_AMOUNT, entityId: null, amount: 10_000_000, description: 'Plafond procedure urgence - cadre §7' },
    { type: ThresholdType.URGENCY_REGULARIZATION_HOURS, entityId: null, value: 72, description: 'Delai max regularisation urgence (heures) - cadre §7' },
    { type: ThresholdType.THREE_OFFERS_REQUIRED_ABOVE, entityId: null, amount: 1_000_000, description: 'Comparatif 3 offres obligatoire au-dessus de 1 000 000 FCFA' },
    { type: ThresholdType.PROVIDER_ONBOARDING_REQUIRED_ABOVE, entityId: null, amount: 2_000_000, description: 'Onboarding fournisseur complet requis au-dessus de 2 000 000 FCFA' },
    { type: ThresholdType.ADVANCE_MAX_PERCENT, entityId: null, value: 30, description: 'Pourcentage max d\'acompte sur BC (cadre §6)' },
  ];
  for (const t of thresholds) {
    const existing = await prisma.threshold.findFirst({
      where: { type: t.type, entityId: t.entityId, isActive: true },
    });
    if (!existing) {
      await prisma.threshold.create({
        data: {
          type: t.type,
          entityId: t.entityId,
          amount: t.amount,
          value: t.value,
          currency: t.amount ? 'XOF' : null,
          description: t.description,
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Utilisateurs de demonstration + memberships
  // ---------------------------------------------------------------------------
  console.info('-> Utilisateurs et roles...');
  const hashedPassword = await argon2.hash(DEFAULT_ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const users = [
    {
      email: 'admin@reliancewestafrica.com',
      name: 'Admin Systeme',
      roles: [{ entityId: holding.id, role: RoleCode.ADMIN }],
    },
    {
      email: 'dfg@reliancewestafrica.com',
      name: 'Directeur Financier Groupe',
      roles: [{ entityId: holding.id, role: RoleCode.DFG }],
    },
    {
      email: 'tresorier@reliancewestafrica.com',
      name: 'Tresorier Groupe',
      roles: [{ entityId: holding.id, role: RoleCode.TRESORIER_GROUPE }],
    },
    {
      email: 'controleur@reliancewestafrica.com',
      name: 'Controleur Interne',
      roles: [{ entityId: holding.id, role: RoleCode.CONTROLEUR_INTERNE }],
    },
    {
      email: 'daf.togo@reliancewestafrica.com',
      name: 'DAF Togo',
      roles: [{ entityId: togoSubsidiary.id, role: RoleCode.DAF_PAYS }],
    },
    {
      email: 'demandeur.togo@reliancewestafrica.com',
      name: 'Demandeur Togo',
      roles: [
        { entityId: togoSubsidiary.id, role: RoleCode.DEMANDEUR },
        { entityId: spvPilote.id, role: RoleCode.DEMANDEUR },
      ],
    },
  ];

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, hashedPassword, isActive: true, emailVerified: new Date() },
      create: {
        email: u.email,
        name: u.name,
        hashedPassword,
        isActive: true,
        emailVerified: new Date(),
      },
    });
    for (const r of u.roles) {
      await prisma.membership.upsert({
        where: { userId_entityId_role: { userId: user.id, entityId: r.entityId, role: r.role } },
        update: { isActive: true },
        create: { userId: user.id, entityId: r.entityId, role: r.role, isActive: true },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Fournisseurs de demonstration
  // ---------------------------------------------------------------------------
  console.info('-> Fournisseurs de demonstration...');
  await prisma.supplier.upsert({
    where: { entityId_code: { entityId: togoSubsidiary.id, code: 'RWA-SUP-TOGO-0001' } },
    update: {},
    create: {
      entityId: togoSubsidiary.id,
      code: 'RWA-SUP-TOGO-0001',
      name: 'BTP Materiaux SARL',
      rccm: 'TG-LFW-2020-A-1234',
      ifu: '1234567890123',
      email: 'contact@btpmateriaux.tg',
      phone: '+228 22 21 00 00',
      address: 'Zone industrielle, Lome',
      country: 'TG',
      sensitivity: SupplierSensitivity.STANDARD,
      status: SupplierStatus.ACTIVE,
      bankAccounts: {
        create: [
          {
            bankName: 'Ecobank Togo',
            holderName: 'BTP MATERIAUX SARL',
            iban: 'TG53 TG13 1011 0001 2345 6789 012',
            rib: '13101 00012 34567890123 45',
            swift: 'ECOCTGTG',
            country: 'TG',
            currency: 'XOF',
            isPrimary: true,
            verifiedAt: new Date(),
            verifiedMethod: 'CALL_BACK',
          },
        ],
      },
    },
  });

  await prisma.supplier.upsert({
    where: { entityId_code: { entityId: togoSubsidiary.id, code: 'RWA-SUP-TOGO-0002' } },
    update: {},
    create: {
      entityId: togoSubsidiary.id,
      code: 'RWA-SUP-TOGO-0002',
      name: 'Cabinet Conseil Strategique',
      rccm: 'TG-LFW-2018-B-0042',
      email: 'contact@ccs.tg',
      phone: '+228 22 22 33 44',
      country: 'TG',
      sensitivity: SupplierSensitivity.SENSITIVE,
      status: SupplierStatus.ACTIVE,
      isStrategic: true,
      notes: 'Fournisseur sensible - validation Groupe systematique',
    },
  });

  // ---------------------------------------------------------------------------
  // Periode comptable courante
  // ---------------------------------------------------------------------------
  console.info('-> Periode comptable courante...');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  for (const entity of [holding, togoSubsidiary, spvPilote]) {
    await prisma.accountingPeriod.upsert({
      where: { entityId_year_month: { entityId: entity.id, year, month } },
      update: {},
      create: { entityId: entity.id, year, month, isClosed: false },
    });
  }

  console.info('\nSeed termine avec succes.');
  console.info('-------------------------');
  console.info('Comptes de demonstration crees (mot de passe : ' + DEFAULT_ADMIN_PASSWORD + ') :');
  for (const u of users) {
    console.info('  - ' + u.email);
  }
  console.info('\nCHANGEZ LE MOT DE PASSE ADMIN AVANT TOUTE UTILISATION EN PROD.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
