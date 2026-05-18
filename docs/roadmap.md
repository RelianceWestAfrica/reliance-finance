# Roadmap d'implementation - Reliance Finance

> Decoupage en sessions Claude Code. Chaque session livre 1 ou 2 modules
> autonomes avec criteres d'acceptation testables. Les modules respectent
> la priorisation P0/P1 du brief de session bootstrap.

## Etat

| Etape              | Statut       | Date       |
| ------------------ | ------------ | ---------- |
| Bootstrap          | Livre        | 2026-05-18 |
| Session 1 (M1)     | Livre        | 2026-05-18 |
| Session 2 (M2)     | Livre        | 2026-05-18 |
| Session 3 (M3)     | Livre        | 2026-05-18 |
| Session 4 (M4)     | Livre        | 2026-05-18 |
| Session 5 (M5+M6)  | A planifier  | -          |
| ...                | ...          | ...        |

---

## Bootstrap (livre)

**Livre en session du 2026-05-18.**

- Monorepo pnpm + Turborepo + TypeScript strict
- Schema Prisma exhaustif (40+ tables, M1-M14)
- Seed de reference (entites, roles, SYSCOHADA, seuils, comptes demo)
- App web Next.js 15 + NextAuth v5 (Credentials + Magic Link)
- Login + dashboard squelette + RBAC helpers
- Docker compose dev (postgres + minio + mailhog)
- ADR 0001 (data model) + ADR 0002 (workflow engine)
- Matrice RBAC documentee
- README + scripts pnpm

---

## Session 1 — M1 Auth & RBAC complet (P0) - LIVRE 2026-05-18

**Livre**

- Extension Prisma de tenancy applicative (`apps/web/src/lib/tenancy/`) :
  filtre `entityId IN [...]` injecte automatiquement sur findFirst/findMany/
  findUnique/count/update/delete/aggregate/groupBy pour 18 modeles
  tenant-scoped. Bypass explicite via `getRawDb()`.
- Audit log avec chainage cryptographique SHA-256 par dossier
  (`apps/web/src/lib/audit/`) : `appendAudit()` transaction Serializable,
  `verifyChain()` detecte HASH_MISMATCH et PREV_HASH_MISMATCH.
- Endpoint `/api/audit/verify/[entityType]/[entityId]` (admin / DFG /
  controleur interne / auditeur seulement).
- Hooks NextAuth events : `signIn` -> LOGIN_SUCCESS, `signOut` -> LOGOUT,
  `authorize` -> LOGIN_FAILURE sur mauvais mot de passe.
- Flow d'invitation utilisateur :
  - `inviteUser()` cree User + Membership + envoie magic link via NextAuth
  - `/set-password` force la creation du mot de passe a la 1ere connexion
  - (app)/layout.tsx redirige vers /set-password si `hashedPassword = null`
- Page `/settings/users` : liste + invitation + desactivation.
- Page `/settings/memberships` : ajout + revocation de roles.
- Page `/audit` : filtres par entityType / entityId / action + liens vers
  l'endpoint de verification.
- Dashboard mis a jour pour utiliser le client tenante (`getTenantedDb`).
- Vitest setup avec coverage v8 (seuils 80%) - 35 tests passants.

**Criteres d'acceptation**

- [x] Code de l'invitation cable de bout en bout (envoi email + setup mot de
      passe + journalisation USER_INVITED + MEMBERSHIP_ADDED) - validation
      e2e en attente d'un environnement Docker
- [x] Toute requete via `getTenantedDb()` est automatiquement filtree par
      entityId IN scope - garanti par le typage Prisma + tests unitaires
      sur `buildTenancyWhere` (12 cas)
- [x] L'audit log produit une chaine inviolable - tests unitaires
      verifient detection HASH_MISMATCH et PREV_HASH_MISMATCH
- [x] Tests passent : `pnpm test` (3 fichiers, 35 cas, coverage 98.5%
      lines / 97.6% branches sur la logique pure tenancy + audit)

**Restes pour validation production** (a faire en session 2 ou test e2e dedie)

- Tests d'integration avec Postgres reel : verifier que la chaine audit
  survit a une coupure DB en cours de transaction
- Test e2e Playwright du flow complet invitation -> magic link -> setup
  password -> dashboard
- Audit log retroactif : seeder quelques entrees de demo dans seed.ts

---

## Session 2 — M2 Referentiel (P0) - LIVRE 2026-05-18

**Livre**

- Extension tenancy : `expandVisibleEntities()` etend automatiquement le
  scope aux descendants (Filiale -> SPV) + bypass `GROUP_LEVEL_ROLES`
  (DFG, AG, ADMIN, AUDITEUR, etc.) qui voient tout le Groupe.
- Helper `resolveThreshold()` : priorite seuil entite > global, filtre
  par effectiveFrom <= now < effectiveTo, tri desc.
- `/settings/entities` : CRUD complet entites avec hierarchie editable
  (Holding unique, Filiales et SPV rattaches a un parent). Gardes :
  Holding sans parent, Filiale/SPV avec parent, pas d'archivage si
  enfants actifs.
- `/settings/projects` : CRUD projets (par entite) + centres de cout
  (avec ou sans projet).
- `/settings/thresholds` : versioning natif - chaque modification cree un
  nouveau seuil et cloture l'ancien (effectiveTo = now). Historique
  consultable, seuil actif mis en evidence. Distingue montants (XOF) et
  valeurs (heures, %).
- `/settings/chart-accounts` : plan SYSCOHADA extensible (ajout sans code),
  filtres par classe, toggle active/inactive avec audit.
- `/profile` : preferences user (timezone parmi 15 zones africaines + UTC,
  locale fr-FR / en-US / fr-CI, nom affiche).
- Tous les changements (entites, projets, CC, seuils, comptes, prefs)
  generent un AuditLog dans la chaine cryptographique.
- Settings layout etendu : 6 entrees de nav.

**Criteres d'acceptation**

- [x] Le DFG peut creer une Filiale puis y rattacher des SPV via UI
      (action `createEntity` couvre les 3 kinds avec gardes)
- [x] Le plan SYSCOHADA est extensible sans toucher au code
      (action `createChartAccount` accepte tout code numerique)
- [x] La modification d'un seuil est journalisee (THRESHOLD_REPLACED) et
      preserve l'historique (seuil precedent cloture, dossiers en cours
      preserves de fait)
- [x] Tests : 58/58 cas, coverage 98.97% lines sur logique pure
      (filter + models + expand + hash + log + types + threshold/resolve)

**Restes** (a faire en sessions ulterieures)

- CRUD Devises + taux de change : reporte (seed suffit pour M3-M8 ;
  UI optionnelle car les taux indicatifs sont rarement modifies)
- Import CSV du plan SYSCOHADA : reporte (DBA peut INSERT direct ;
  UI suffisante pour ajouts ponctuels)
- Tests d'integration des actions Server (avec Postgres) : session
  M9 ou test e2e dedie

---

## Session 3 — M3 Cycle fournisseur + anti-fraude RIB (P0) - LIVRE 2026-05-18

**Livre**

- Logique pure d'utilisabilite RIB : `isBankAccountUsable(account, now)`
  -> 3 raisons d'interdiction (INACTIVE / NOT_VERIFIED / QUARANTINE) avec
  message explicite. 7 tests.
- Logique pure du workflow change RIB :
  - `canApproveLevel1()` : statut REQUESTED + acteur != demandeur +
    role N1 (DAF Pays / FIN_FIL)
  - `canApproveLevel2()` : statut DUAL_VALIDATION_PENDING + acteur !=
    demandeur + acteur != N1 + role N2 (DFG / Finance Groupe / Tresorier)
  - `computeQuarantineUntil()` : approbation N2 + N heures (24h par defaut,
    configurable via ANTI_FRAUD_RIB_QUARANTINE_HOURS)
  - 13 tests, couvrent separation des fonctions stricte (N1 != N2 != demandeur)
- Logique pure detection anomalies : `detectSuspiciousRibChange()` -> 3 regles
  combinables (changements recurrents, changement post-creation, fournisseur
  strategique amplifie en CRITICAL). 7 tests.
- Service notifications in-app + helper `notifyHoldingRole(role)` qui notifie
  tous les utilisateurs ayant un role donne sur la Holding active.
- Server Actions Supplier : `createSupplier` (avec RIB initial optionnel),
  `updateSupplier`, `archiveSupplier`.
- Server Actions BankAccountChangeRequest :
  - `requestBankAccountChange` : cree la demande + notifie DFG/Tresorier
  - `approveChangeLevel1` : visa N1 -> DUAL_VALIDATION_PENDING + notifie DFG
  - `approveChangeLevel2` : visa N2 -> cree le nouveau RIB en QUARANTAINE
    + desactive l'ancien + calcule la date de fin de quarantaine + lance
    la detection d'anomalies + cree une `Anomaly` si suspect + notifie le
    controleur interne
  - `rejectChange` : tracable par audit
  - `activateMatureQuarantines` : batch d'activation des RIB dont la
    quarantaine est echue (a appeler en cron ou manuellement)
  - `verifyExistingBankAccount` : verification d'un RIB initial cree a
    l'onboarding (appel retour / email officiel)
- Pages :
  - `/suppliers` : liste tenantee + filtres (statut, sensibilite, q text)
    + badge utilisabilite RIB
  - `/suppliers/new` : onboarding complet avec RIB initial optionnel
  - `/suppliers/[id]` : fiche + edition + archivage (zone dangereuse)
  - `/suppliers/[id]/bank-accounts` : liste RIBs avec utilisabilite,
    workflow change (demande + valider N1 + valider N2 + rejeter),
    bouton activer-quarantaines-echues
  - `/suppliers/[id]/history` : audit log consolide (Supplier +
    BankAccount + BankAccountChangeRequest), verification de chaine
    Supplier en temps reel, lien export CSV + verify endpoint
- Endpoint REST `/api/suppliers/[id]/rib-history` : export CSV UTF-8 BOM
  separateur `;` (Excel FR), garde de role (DFG/Auditeur/CTRL_INT/...),
  garde de tenancy (entite visible).
- Nav (app) etendu : lien Fournisseurs.

**Criteres d'acceptation**

- [x] Un nouveau RIB n'est utilisable qu'apres double validation + quarantaine
      24h : `approveChangeLevel2` met systematiquement `quarantineUntil = now +
      24h` ; `isBankAccountUsable` retourne `QUARANTINE` tant que non
      echue ; UI bank-accounts affiche le delai restant.
- [x] L'historique des changements RIB est immuable (table AuditLog chainee)
      et exportable (endpoint CSV avec BOM UTF-8).
- [x] Tests : 86/86 cas (3 helpers M3 ajoutes = 27 cas), coverage 99.37%
      lines / 96.52% branches sur logique pure.

**A garde pour validation paiement (M10)**

- "Toute tentative de payer un beneficiaire different du fournisseur du BC
  est bloquee" : utilise `isBankAccountUsable` + verification stricte du
  beneficiaire. Foundation pose (BankAccount.holderName, snapshot dans
  PaymentRequest, helper d'usability). UI bloquante en M10.

**Restes pour completion 100%**

- Upload des documents fournisseurs (RCCM scans, etc.) vers MinIO : la
  table SupplierDocument existe, mais l'UX upload + S3 SDK est reporte
  (session de raffinement UX dediee).
- Job cron qui appelle `activateMatureQuarantines` automatiquement
  (toutes les heures par exemple) : session M9/M12.
- Email reel des notifications (le service ecrit dans la table
  Notification ; l'envoi via nodemailer est a cabler en M9).

---

## Session 4 — M4 Demande FDA/FD + workflow validation (P0)

**Perimetre**

- Formulaire `/expense-requests/new` (FDA et FD) avec items, pieces jointes
- Workflow declaratif `expense_request_standard_v1` (cf. ADR 0002)
- Calcul dynamique de la chaine d'approbateurs selon seuils
- Variante `FD_URGENCE` avec garde des 4 conditions cumulatives + SLA 72h
- Pages de validation (Filiale N1, N2, Groupe, AG) avec signatures
- Generation PDF du dossier (puppeteer-core ou playwright server-side)
- QR code de verification d'integrite sur le PDF

**Dependances** : M1, M2, M3, packages/workflow-engine implementation reelle

**Criteres d'acceptation**

- [ ] Une FD au-dessus du seuil Groupe declenche bien 4 signatures
- [ ] Tenter de signer comme demandeur ET validateur = rejet (separation
      des fonctions)
- [ ] Un dossier urgence non regularise apres 72h declenche une `Anomaly` auto

---

## Session 5 — M5 + M6 Comparatif d'offres + BC/Contrats (P0)

**Perimetre**

- M5 : `/offer-comparisons` formulaire 2-3 offres + tableau comparatif PDF
       (Modele 1)
- M5 : `/sole-source-justifications` formulaire (Modele 2) - obligatoire si
       1 seule offre au-dessus du seuil 3 offres
- M6 : `/purchase-orders` creation BC ou Contrat + signatures cascadees
       (Modele 3)
- Snapshot du RIB fournisseur au moment du BC (anti-fraude)
- Generation PDF BC avec QR code

**Dependances** : M3, M4

**Criteres d'acceptation**

- [ ] Un BC au-dessus du seuil 3 offres exige un comparatif valide OU une
      justification offre unique signee
- [ ] Le BC est verrouille apres signature complete (versions ulterieures =
      avenant)

---

## Session 6 — M7 + M8 PV reception + Factures + 3-way match (P0)

**Perimetre**

- M7 : `/receptions` formulaire PV (biens, service fait, attachement) (Modele 4)
- M7 : Signatures Operations + Technique + Finance
- M8 : `/invoices` saisie/upload facture
- M8 : `3-way match` automatique (BC vs PV vs Facture) avec ecarts mis en
       evidence
- M8 : Blocage du passage en paiement si match KO ou PV manquant
- M8 : Statut `DISPUTED` + workflow de reconciliation

**Dependances** : M6

**Criteres d'acceptation**

- [ ] Le test "Sans PV = pas de paiement final" est appliqué au runtime
- [ ] Un ecart de prix > 5% entre BC et facture leve une `Anomaly` AUTO
- [ ] L'avoir (CREDIT_NOTE) reduit correctement le `amountPaid` cumulé

---

## Session 7 — M10 Tresorerie + anti-fraude beneficiaire (P0)

**Perimetre**

- `/payments` planification + execution paiements (en lots `PaymentBatch`)
- Workflow anti-fraude au moment de l'execution :
  - Verification beneficiaire = fournisseur du BC
  - RIB hors quarantaine
  - 2 personnes validant (segregation)
- Upload preuves bancaires (SWIFT, avis debit) sur MinIO
- Calcul automatique de la position de cash apres execution
- Rate limiting `5 req/min` sur l'execution paiement

**Dependances** : M3, M8

**Criteres d'acceptation**

- [ ] Tenter de payer un beneficiaire dont le RIB est en quarantaine = blocage
- [ ] La preuve bancaire est obligatoire pour passer en statut `EXECUTED`
- [ ] L'audit log enregistre chaque tentative (succes ou echec)

---

## Session 8 — M12 Comptabilite + Export SYSCOHADA/FEC + Archivage (P0)

**Perimetre**

- Generation automatique des `JournalEntry` depuis les `Payment` executes
- Export CSV SYSCOHADA + FEC (Fichier Ecritures Comptables)
- Endpoint REST `/api/v1/accounting/entries` (OpenAPI documentation)
- Webhook sortant configurable vers ERP externe (Sage/Odoo/Dolibarr)
- Page `/accounting/periods` ouverture/cloture mensuelle
- Archivage automatique des pieces apres cloture (immutabilite renforcee)

**Dependances** : M10

**Criteres d'acceptation**

- [ ] Chaque paiement execute genere une ecriture debit/credit equilibree
- [ ] L'export FEC passe le validateur officiel (a verifier avec un outil tiers)
- [ ] La cloture d'une periode empeche toute modification retroactive

---

## Session 9 — M13 + M14 Controle interne + Reporting (P1)

**Perimetre**

- `ControlCheck` definitions : 10+ regles paramétrables (doublons, prix
  anormal, fractionnement, urgences repetees, RIB recurrents...)
- Job de cron qui execute les regles + cree les `Anomaly`
- Page `/anomalies` filtres + assignation + workflow de resolution
- KPIs : taux dossiers conformes, delai moyen FD-paiement, urgences hors delai
- Dashboards (recharts ou tremor) : budget vs reel, cash position, conformite

**Dependances** : M4, M8, M10

**Criteres d'acceptation**

- [ ] Le DFG voit en un coup d'oeil le top 5 anomalies de la semaine
- [ ] L'AG peut filtrer le reporting par entite/projet/periode
- [ ] Les KPIs sont calcules en background (pas de chiffre live cher)

---

## Session 10 — M11 Cash forecast 13 semaines (P1)

**Perimetre**

- Saisie manuelle des entrees projetees (revenus contractuels)
- Calcul auto des sorties projetees (paiements planifies + recurrents)
- UI de visualisation 13 semaines (heatmap + courbe)
- Alertes proactives : risque de rupture de tresorerie a J+N
- Snapshots hebdo (capture pour audit / comparaison previsionnel-realise)

**Dependances** : M10

**Criteres d'acceptation**

- [ ] Une rupture projetée a J+15 declenche une notification au DFG
- [ ] Les snapshots permettent une comparaison previsionnel vs realise sur
      les 13 dernieres semaines

---

## Session 11 — PWA terrain chef de chantier (P1)

**Perimetre**

- Nouvelle app `apps/mobile-pwa` (Next.js standalone ou Vite + PWA plugin)
- SSO avec l'app web (NextAuth partage)
- Offline-first : creation FDA et PV hors ligne, sync a la reconnexion
- Capture photo + compression cote client + EXIF (avec consentement)
- Signature manuscrite tactile (canvas -> SVG -> hash)
- Notifications push (web push API)

**Dependances** : M4, M7

**Criteres d'acceptation**

- [ ] Un chef de chantier peut creer un PV hors reseau et le syncer ensuite
- [ ] Les photos capturent timestamp + geoloc + hash dans `Attachment.metadata`
- [ ] L'app fonctionne en standalone sur Android Chrome et iOS Safari

---

## Session 12 — Deploiement Hostinger VPS + CI/CD (P0 pour la mise en service)

**Perimetre**

- `Caddyfile` avec TLS auto + HTTP/3 + headers securite
- `scripts/provision-vps.sh` (idempotent) : Docker, fail2ban, ufw, swap
- Workflow GitHub Actions `.github/workflows/deploy.yml` :
  build -> tests -> push image GHCR -> SSH deploy
- Backups quotidiens `pg_dump` + chiffrement GPG + rotation 30 jours
  (`scripts/backup.sh`)
- Documentation `docs/deployment.md` complete (DNS, certificats, rollback)
- Monitoring : Uptime Kuma + Sentry SDK + endpoints `/health` + `/ready`

**Dependances** : M1 a M10 fonctionnels en local

**Criteres d'acceptation**

- [ ] Un push sur `main` declenche le deploiement
- [ ] Le rollback documente prend < 5 minutes
- [ ] Les backups sont testes par restauration sur un VPS de staging

---

## Sessions de polissage (a planifier)

- Tests E2E (Playwright) sur les workflows critiques
- Audit a11y (axe-core, NVDA)
- Performance audit (Lighthouse > 90 sur les pages chaudes)
- I18n EN/ZH (alignement avec `reliancewestafrica-website`)
- Documentation utilisateur (Storybook + guides par role)

---

## Ordre recommande

```
Bootstrap (livre)
  -> Session 1 (M1)
     -> Session 2 (M2)
        -> Session 3 (M3)
           -> Session 4 (M4)
              -> Session 5 (M5+M6)
                 -> Session 6 (M7+M8)
                    -> Session 7 (M10)
                       -> Session 8 (M12)
                          -> Session 9 (M13+M14)
                             -> Session 10 (M11)
                                -> Session 11 (PWA)
                                   -> Session 12 (Deploiement)
```

Sessions parallelisables uniquement apres M4 (squelette dossier present) :
M5+M6 peuvent etre faits avant M7+M8, et M11 peut commencer en parallele de
M9 si des devs distincts s'en chargent.
