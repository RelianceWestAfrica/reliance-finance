# ADR 0001 — Modele de donnees

- **Statut** : Accepted
- **Date** : 2026-05-18
- **Auteurs** : Bootstrap automatise (session Claude Code)
- **Sources** : [docs/cadre-normatif.md](../cadre-normatif.md) (Cadre normatif Fevrier 2026), brief de session

## 1. Contexte

La plateforme couvre un cycle achats-paiements multi-entites pour le Groupe RWA
(Holding Lome + filiales pays + SPV/projets + chantiers). Le cadre normatif
impose :

- **Zero paiement sans dossier complet, valide et tracable** (principe central, §1)
- Separation stricte des fonctions (Demandeur != Validateur != Executeur != Comptable != Controleur, §12)
- Tracabilite cryptographique des decaissements (§5 etape 7)
- Conservation 10 ans des pieces (§9)
- Identification multi-niveaux : Holding / Filiale pays / SPV / Chantier (§2.2)
- 14 modules fonctionnels (M1 a M14) avec 30+ entites metier

Le modele doit supporter le multi-tenancy (filiale Togo ne voit pas Cote d'Ivoire
sauf role transverse Groupe), tout en permettant les consolidations (Holding voit
tout).

## 2. Decision

### 2.1. Stack persistance

- **PostgreSQL 16** (relationnel ACID, JSONB pour payloads d'audit)
- **Prisma 6** comme ORM (type safety end-to-end avec TypeScript, migrations versionnees)
- **Pas de NoSQL** dans le scope P0 : la coherence transactionnelle prime sur le throughput

### 2.2. Tenancy : discriminateur `entityId`

Chaque table metier porte une colonne `entityId` (FK vers `Entity`). L'isolement
est applique par un **middleware Prisma** qui injecte la clause `WHERE entityId IN (...)`
sur tous les reads selon les `Membership` de l'utilisateur courant.

```
User --(Membership: roles[])--> Entity (Holding|Subsidiary|SPV)
```

Un utilisateur peut avoir plusieurs Memberships (ex : DAF Pays Togo + Auditeur Groupe).

**Rejete** : RLS PostgreSQL natif (`POLICY`). Avantage : impossible a contourner.
Inconvenients : (1) couplage fort au moteur DB, complique la portabilite et les
tests ; (2) un seul rolemap par connexion DB rend penible le partage de pool entre
utilisateurs ; (3) Prisma n'offre pas de support natif aux RLS sur tous les
adapters. Le middleware applicatif est suffisant a condition d'avoir une couverture
de tests d'isolation systematique (a livrer en M1).

### 2.3. Hierarchie des entites (Holding / Filiale / SPV)

Table `Entity` auto-referentielle :

```
Entity {
  id, code (unique), kind: HOLDING|SUBSIDIARY|SPV, country, currency,
  parentEntityId? -> Entity
}
```

- **Holding** : `parentEntityId = null`, `kind = HOLDING`. Un seul attendu (RWA).
- **Filiale pays** : `parentEntityId = holding.id`, `kind = SUBSIDIARY`, `country` obligatoire.
- **SPV/projet vehicule** : `parentEntityId = filiale.id` (ou holding selon montage), `kind = SPV`.

**Pourquoi SPV = `Entity` et pas `Project`** : le cadre §2.2 traite explicitement
les SPV comme entites comptables (RIB propre, signataires, escrow). Un `Project`
est un sous-decoupage operationnel a l'interieur d'une Filiale/SPV (chantier,
contrat, lot). Decoupler permet aux SPV d'avoir leur propre plan comptable
local, leurs propres seuils, et leur propre tresorerie projet.

### 2.4. Numerotation des dossiers : `DocumentSequence` atomique

Format : `RWA-{TYPE}-{ENTITY_CODE}-{PROJECT_CODE}-{YYYY}-{SEQ:04d}`

Exemples :

- `RWA-FDA-TOGO-CIDPE-2026-0001` (Fiche Demande d'Achat, Filiale Togo, projet CIDPE)
- `RWA-BC-CI-RWA1-2026-0042` (Bon de Commande, Filiale Cote d'Ivoire, SPV RWA1)
- `RWA-PV-TOGO-2026-0017` (PV reception, Filiale Togo, sans projet specifique)
- `RWA-PAY-HOLDING-2026-0003` (Paiement, Holding)

Table dediee :

```
DocumentSequence {
  id, type, entityId, projectId?, year, nextSeq,
  @@unique([type, entityId, projectId, year])
}
```

Allocation atomique via transaction Prisma + `SELECT ... FOR UPDATE` (verrou
pessimiste). L'allocation se fait en debut de transaction de creation du dossier
pour eviter les trous de numerotation en cas de rollback metier.

**Trous tolerees** uniquement si la transaction echoue apres commit du seq
(extremement rare). Un job de nuit produit un rapport des trous detectes pour
controle interne.

### 2.5. Statuts : machines a etats explicites par type de dossier

Chaque type de dossier porte un champ `status` (enum) representant un noeud d'une
machine a etats finis. Les transitions sont validees par le `WorkflowEngine`
(cf. ADR 0002). Aperçu :

| Type dossier      | Etats principaux                                                               |
| ----------------- | ------------------------------------------------------------------------------ |
| `ExpenseRequest`  | `DRAFT → SUBMITTED → CONTROL_DOC → BUDGET_OK → FINANCE_FIL_VISA → FINANCE_GROUPE_VISA → AG_APPROVAL → APPROVED → ARCHIVED / REJECTED / CANCELLED` |
| `OfferComparison` | `DRAFT → SUBMITTED → APPROVED / REJECTED`                                      |
| `PurchaseOrder`   | `DRAFT → SIGNED → SENT_TO_SUPPLIER → PARTIAL → CLOSED / CANCELLED`             |
| `Reception`       | `DRAFT → SIGNED_OPERATIONS → SIGNED_TECHNICAL → SIGNED_FINANCE → DEFINITIVE / PROVISIONAL / REJECTED` |
| `Invoice`         | `RECEIVED → MATCHED_3WAY → APPROVED → SCHEDULED → PAID → ARCHIVED / DISPUTED`  |
| `Payment`         | `DRAFT → ANTI_FRAUD_CHECK → SCHEDULED → EXECUTED → RECONCILED / FAILED / CANCELLED` |
| `BankAccountChange` | `REQUESTED → DUAL_VALIDATION → QUARANTINE_24H → ACTIVE / REJECTED`           |

Les transitions interdites lancent une exception au niveau Server Action ; le
client ne voit que les transitions autorisees pour le role courant.

### 2.6. Audit : chainage cryptographique

Table `AuditLog` :

```
AuditLog {
  id, entityType, entityId, action, actorId, payload (JSONB),
  prevHash (string|null), hash (string, NOT NULL),
  createdAt
}
```

A chaque insertion : `hash = sha256(prevHash + canonicalJson(payload) + actorId + createdAt)`.
Le `prevHash` reference le `hash` du log precedent **dans le meme `entityType+entityId`**,
ce qui produit une chaine par dossier (et une chaine globale par tenant via une vue
materialisee si besoin de l'inviolabilite globale).

L'insertion passe par une **transaction unique** qui verrouille la derniere ligne
du dossier (FOR UPDATE) et ecrit la nouvelle avec son hash calcule. Toute
modification ulterieure d'une ligne `AuditLog` est detectable car elle casse la
chaine — exposee via un endpoint `/api/audit/verify/{entityType}/{entityId}`.

**Limites assumees** : l'integrite est verifiable mais non protegee contre un
admin DB malveillant qui reecrirait toute la chaine. Pour aller plus loin (M13
roadmap), ancrer le hash de tete dans un journal externe (S3 immutable object lock,
ou bien notarisation blockchain — hors scope P0).

### 2.7. Soft delete

Aucune suppression physique sur les entites metier. Chaque table porte :

- `status` (inclut `ARCHIVED` et `CANCELLED`)
- `archivedAt`, `archivedById`, `archiveReason` (quand `status = ARCHIVED`)

L'index unique sur le numero de dossier reste actif meme apres archivage : on ne
peut pas reutiliser un numero. Les seules tables avec `DELETE` autorise sont :
`Session`, `VerificationToken`, `Notification` (apres TTL).

### 2.8. Conservation 10 ans

Politique de retention : aucune purge automatique avant 10 ans (`AUDIT_RETENTION_YEARS=10`,
`ARCHIVE_RETENTION_YEARS=10`). Apres 10 ans : eligible a archivage froid (export
chiffre vers cold storage S3) + suppression a la demande. Le job de purge est
**ecrit mais desactive** par defaut.

### 2.9. Devises

Table `Currency` (XOF, XAF, USD, EUR a minima) + `ExchangeRate` (devise source ×
devise cible × date → taux). Tous les montants sont stockes en :

- `amount` : `Decimal(18,4)` (Prisma `Decimal`)
- `currency` : code ISO 4217 (FK vers `Currency`)

Conversions calculees a la demande (pas de denormalisation), avec taux au plus
proche de la date de la transaction.

## 3. Tables (mapping vers les 14 modules)

| Module                    | Tables principales                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| M1 Auth & RBAC            | `User`, `Account`, `Session`, `VerificationToken`, `Role`, `Permission`, `Membership`                 |
| M2 Referentiel            | `Entity`, `Project`, `CostCenter`, `ChartAccount` (SYSCOHADA), `Threshold`, `Currency`, `ExchangeRate` |
| M3 Cycle fournisseur      | `Supplier`, `SupplierContact`, `BankAccount`, `BankAccountChangeRequest`, `SupplierDocument`          |
| M4 Demande FDA/FD         | `ExpenseRequest`, `ExpenseRequestItem`, `Attachment`                                                  |
| M5 Comparatif offres      | `OfferComparison`, `Offer`, `SoleSourceJustification`                                                 |
| M6 BC / Contrats          | `PurchaseOrder`, `PurchaseOrderItem`, `Contract`                                                      |
| M7 PV reception           | `Reception`, `ReceptionItem`                                                                          |
| M8 Factures + 3-way match | `Invoice`, `InvoiceLine`, `ThreeWayMatch`                                                             |
| M9 Workflow validation    | `WorkflowInstance`, `WorkflowStep`, `Signature`                                                       |
| M10 Tresorerie            | `Payment`, `PaymentBatch`, `BankProof`                                                                |
| M11 Cash forecast 13s     | `CashForecast`, `CashForecastLine`                                                                    |
| M12 Comptabilite          | `JournalEntry`, `JournalEntryLine`, `AccountingPeriod`                                                |
| M13 Controle interne      | `Anomaly`, `ControlCheck`, `KPISnapshot`                                                              |
| M14 Reporting             | (vues materialisees + tables d'agregats : `BudgetVsActual`, `CashPosition`)                           |
| Transverses               | `AuditLog`, `Notification`, `Attachment`, `DocumentSequence`                                          |

Au total : ~40 tables (NextAuth incluses).

## 4. Conventions

- **Noms** : `PascalCase` pour les tables (Prisma `model`), `camelCase` pour les colonnes
- **IDs** : `cuid()` (collision-safe, lexicographiquement triable) — pas d'UUID v4
  (uniquement quand l'externalite l'exige)
- **Timestamps** : tous les enregistrements portent `createdAt` et `updatedAt`
  (`@default(now())` / `@updatedAt`)
- **Devise dans une transaction** : la devise du `Payment` doit egaler celle de
  l'`Invoice` ; sinon, transaction `currencyExchangeOf` explicite avec taux fige
- **Champs monetaires** : `Decimal(18, 4)` — jamais `Float`
- **Indexes** : index sur tous les FK + `entityId` + `status` + champs de filtre
  frequent. Composites quand pertinent.

## 5. Consequences

### Positives

- Type-safety end-to-end (Prisma genere les types TypeScript)
- Audit trail inviolable par dossier
- Multi-tenancy clair, testable
- Numerotation atomique et tracable

### Negatives

- Le middleware Prisma de tenancy est un point de defaillance critique :
  un bug = fuite de donnees inter-filiales. Tests obligatoires (M1 livrable).
- Le chainage d'audit ajoute une lecture + ecriture par mutation. Acceptable
  pour le volume vise (< 10k decaissements/an).
- Prisma `Decimal` n'est pas natif JS : conversions explicites en serialisation
  JSON. Helper `serializeDecimal` a fournir dans `packages/database`.

### Neutres

- Choix de PostgreSQL vs autres : compatible avec l'ecosysteme Hostinger
  (extensions VPS), avec les autres apps Reliance (`reliance-domains-backend`).

## 6. Alternatives considerees

1. **Drizzle ORM** au lieu de Prisma : plus leger, SQL-first, mais ecosysteme
   moins mature (adapters NextAuth, Prisma Studio, accelerate). Rejete.
2. **PostgreSQL RLS** au lieu de middleware Prisma : voir §2.2. Rejete pour
   couplage fort.
3. **Event Sourcing** pour l'audit : plus puissant mais surcout cognitif et
   operationnel disproportionne pour ce scope. Rejete.
4. **MongoDB** : facilite le JSONB des payloads d'audit mais perd ACID
   multi-document, complique la conformite OHADA. Rejete.
5. **Un seul table `Document`** polymorphe (au lieu de `ExpenseRequest`, `BC`, `PV`...) :
   simplifie l'audit mais rend les contraintes referentielles impossibles
   (un BC ne peut etre rattache qu'a une FD validee). Rejete.

## 7. Ouvertures / chantiers ulterieurs

- **M11 cash forecast** : les vues materialisees PostgreSQL (`MATERIALIZED VIEW`)
  ne sont pas natives a Prisma. Soit migrations SQL brutes, soit denormalisation.
  A trancher en session M11.
- **Multi-region** : aucun besoin identifie a court terme. Si plusieurs VPS,
  reads-only replicas suffisent.
- **Branchement ERP externe (Sage, Odoo, Dolibarr)** : voir M12. Format pivot
  CSV SYSCOHADA + FEC + JSON via webhook.
