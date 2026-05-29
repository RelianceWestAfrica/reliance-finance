# ADR 0003 — Pont financier inter-plateformes (réception entrante)

- **Statut** : Accepted
- **Date** : 2026-05-28
- **Auteurs** : session Architecte Tech Lead (Claude Opus)
- **Sources** : [docs/cadre-normatif.md](../cadre-normatif.md), [ADR 0001](./0001-data-model.md),
  [ADR 0002](./0002-workflow-engine.md), proposition d'architecture du pont (validée 2026-05-28)

## 1. Contexte

L'écosystème RWA est composé d'applications métier séparées qui produisent des flux
financiers mais **ne doivent pas** valider/payer elles-mêmes (séparation des fonctions,
cadre §12) :

- **Chantier** (`rwa-btp`, Next/Prisma/PostgreSQL) — initie un besoin (`FicheDemande`),
  valide techniquement + opérationnellement, réceptionne (BR/PV).
- **Logistique** (`rwa-achats-logistique`, Next/Prisma/PostgreSQL) — consultation 3 devis,
  BC, réception, NC.
- **Immobilier** (`reliance-domains-backend`, **AdonisJS/Lucid/MySQL**) — encaissements
  (`Acquisition` → `PaymentPlan` → `PaymentInstallment`).
- **RH/SIRH** (futur, `rh.rwa-core.com` déjà provisionné) — paie.

`reliance-finance` est la **plateforme cible unique** de validation (6 lignes de défense),
trésorerie, comptabilité et contrôle interne. Elle implémente déjà tout le cycle
(`ExpenseRequest`, workflow engine, seuils, anti-fraude RIB, `Payment`, `JournalEntry`,
`CashForecastLine`, `AuditLog` chaîné).

**Manque** : un **point d'entrée entrant** standardisé pour qu'une app externe pousse un
flux financier. Aucun n'existe (tout passe par des Server Actions à session NextAuth).

**Contraintes structurantes :**

- **Multi-stack / multi-DB** : PostgreSQL _et_ MySQL. ⇒ aucun partage de schéma ni de base.
- **Cohabitation VPS** : toutes les apps sont derrière le même nginx (`77.37.121.56`),
  chacune en conteneur sur un port loopback dédié (`finances`→3001, `chantier`→3011, …).
- **Précédent org** : le `rwa-portal` pousse déjà rôles/scope vers les apps via un contrat
  **HMAC signé** (`X-IAM-Signature` = HMAC sur `<timestamp>.<rawBody>`). Le pont calque
  cette convention pour la cohérence et la réutilisation.

## 2. Décision

### 2.1. Contrat de données générique — `FinancialIntent`

Une **« Intention Financière Inter-Plateforme »** décrit _un flux financier que la source a
validé sur son périmètre opérationnel et confie à Finance_. Le contrat est **agnostique au
stack** (JSON transporté en HTTP) et **versionné** (`schemaVersion`). Il vit dans un package
partagé `packages/bridge-contract` (types + validation Zod + helpers HMAC), réutilisable par
toutes les sources.

Champs structurants :

- `flowType` : `DISBURSEMENT` (sortie → `ExpenseRequest`) | `COLLECTION` (entrée immobilier →
  `CashForecastLine{INFLOW}` + écriture comptable) | `PAYROLL_BATCH` / `INTERCO` (réservés).
- `source` : `{ app, objectType, objectId, objectRef, deepLink }` — provenance native.
- `target` : `{ entityCode, projectCode?, costCenterCode? }` — résolution **par codes**, jamais
  par ID (découplage total des PK entre apps).
- `amount` : `{ value (Decimal string), currency }`.
- `counterparty` : fournisseur (DISBURSEMENT) ou client (COLLECTION) — rapprochement côté Finance.
- `upstreamValidations[]` : trail Ligne 1 (visa technique/ops) horodaté + `evidenceHash`.
- `documentTrail` : références FDA/BC/BR/PV/facture.
- `attachments[]` : **références** `{ fileName, mimeType, sizeBytes, sha256, downloadUrl, expiresAt }`
  (jamais de binaire inline ; Finance pull → vérifie sha256 → stocke MinIO).
- `idempotencyKey` (= `Idempotency-Key` header) : dédup côté Finance.

### 2.2. Mécanisme de synchronisation — webhook signé + outbox + callback

- **Push HTTP signé** de la source vers `POST /api/v1/bridge/intents`.
- **Outbox transactionnel** côté source : l'intention est écrite _dans la même transaction_
  que la validation métier ⇒ at-least-once ; un worker rejoue les échecs (backoff).
- **Idempotence** côté Finance (`BridgeInbox.idempotencyKey UNIQUE`) ⇒ effet exactly-once.
  Rejouer une intention committée renvoie `200` avec la même `financeRef`.
- **Callback de statut** : Finance notifie la source des transitions (`APPROVED/REJECTED/PAID`)
  via un endpoint inbound de la source, signé pareillement. **Fallback** :
  `GET /api/v1/bridge/intents/{idempotencyKey}` (réconciliation).

**Alternatives rejetées** : base/événements partagés (impossible PG+MySQL, casse la tenancy) ;
API+polling seul (latent ; conservé en fallback) ; bus de messages Kafka/RabbitMQ/Temporal
(surcoût opérationnel disproportionné pour < 10k opérations/an, SPOF partagé).

### 2.3. Authentification inter-services

- **Secret par source** (`BRIDGE_SECRET__<APP>`, ≥ 32 chars), HMAC-SHA256 sur
  `${timestamp}.${rawBody}`, header `X-RWA-Bridge-Signature: sha256=<hex>`.
- Comparaison **timing-safe** (réutilise le helper de `lib/cron/auth.ts`).
- **Anti-replay** : `X-RWA-Bridge-Timestamp` (fenêtre ±300 s) + `Idempotency-Key`.
- Header `X-RWA-Bridge-Source` identifie l'émetteur (sélectionne le secret + autorisation).
- Durcissement optionnel : restriction IP nginx (toutes les apps cohabitent sur le VPS).

### 2.4. Réception côté Finance (modèle + flux)

Nouveau modèle **`BridgeInbox`** (staging + idempotence + traçabilité), enums `BridgeFlowType`
et `BridgeInboxStatus`. Champs de provenance optionnels sur `ExpenseRequest`
(`originApp`, `originRef`, `bridgeInboxId`).

Flux `DISBURSEMENT` :

1. Vérif HMAC + timestamp + autorisation source.
2. Upsert `BridgeInbox` par `idempotencyKey` (si déjà `COMMITTED` → réponse idempotente).
3. Validation Zod du `FinancialIntent` + résolution `target` (codes→IDs) + garde devise/montant.
4. Création **système** d'un `ExpenseRequest` (réutilise `allocateReference` +
   `computeApprovalChain` + `transitionWorkflow`) ⇒ statut `FINANCE_FIL_VISA_PENDING`
   (la Ligne 1 ayant déjà eu lieu côté source). Les Lignes 2→6 restent gérées par Finance.
5. `appendAudit(BRIDGE_INTENT_RECEIVED)` (chaîne SHA-256, provenance tracée).
6. `BridgeInbox.status = COMMITTED` + réponse `202 { financeRef, financeObjectId, status }`.

La **séparation des fonctions est préservée** : la source _demande_ ; Finance _valide, paie,
comptabilise, contrôle_. `upstreamValidations` est archivé comme preuve d'origine mais
**n'est pas** compté comme un visa Finance.

### 2.5. Acteur système

Les `ExpenseRequest` issues du pont sont créées par un **acteur système** (pas de session
NextAuth) identifié dans l'audit par `actorId = null` + `payload.bridgeSource`. La fonction de
création système (`lib/bridge/create-expense-request-from-intent.ts`) duplique volontairement
la logique des Server Actions `createExpenseRequest`/`submitExpenseRequest` mais sans la couche
session/formData (celles-ci restant le chemin UI humain).

## 3. Conséquences

### Positives

- **Aucune infra nouvelle** ; réutilise nginx cohabit + la convention HMAC org.
- **Découplage total** des stacks/bases (contrat HTTP+JSON).
- **Fiabilité** at-least-once (outbox) + exactly-once (idempotence).
- **Généricité** : ajouter RH/SIRH ou BD = nouveau `flowType` + mapping, **sans changer le contrat**.
- **Auditabilité** : provenance pont tracée dans la chaîne SHA-256 existante.

### Négatives / risques

- La fonction de création système **duplique** une partie de la logique des Server Actions ⇒
  risque de dérive. Mitigation : extraire à terme un noyau commun `lib/expense-requests/core`.
- Endpoint exposé sur le domaine public ⇒ dépend de la robustesse de la vérif HMAC + anti-replay.
- L'écriture comptable d'encaissement (COLLECTION, immobilier) touche `AccountingPeriod` ⇒
  doit respecter les périodes ouvertes (garde `assertPeriodOpen`).

### Neutres

- Les migrations Prisma `dev` sont gitignorées (cf. `.gitignore`) ; le schéma committé est la
  source de vérité, synchronisé au déploiement (`prisma db push` / `migrate deploy`). Le PR
  ajoute des structures **additives** (nouveau modèle + colonnes optionnelles) — sûr.

## 4. Périmètre & ordre (validé)

- **P0** — Socle Finance entrant : contrat + `BridgeInbox` + endpoints + mapping `DISBURSEMENT`
  → `ExpenseRequest` + tests. **Aucune source branchée** (sûr à déployer : inerte tant qu'aucun
  secret source n'est configuré).
- **P1** — Chantier émetteur (outbox + « Envoyer en Finance » + bascule lecture seule
  `validate.fin`/paiement, feature-flag).
- **P2** — Callback de statut Finance → sources.
- **P3** — Logistique émetteur.
- **P4** — Immobilier `COLLECTION` (INFLOW + écriture comptable d'encaissement, dès v1).
- **P5** — RH/SIRH `PAYROLL_BATCH`.

## 5. Ouvertures / chantiers ultérieurs

- Mapping `COLLECTION` → `JournalEntry` d'encaissement (compte 521/411 SYSCOHADA) — P4.
- Extraction d'un noyau `expense-requests/core` partagé UI + pont (anti-duplication).
- Identité commune via Keycloak (`sub`) pour relier `actorExternalId` ↔ utilisateurs Finance.
- Rejouabilité/observabilité : dashboard `BridgeInbox` (taux de rejet par code, latence d'ACK).
  </content>
