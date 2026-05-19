# Roadmap d'implementation - Reliance Finance

> Decoupage en sessions Claude Code. Chaque session livre 1 ou 2 modules
> autonomes avec criteres d'acceptation testables. Les modules respectent
> la priorisation P0/P1 du brief de session bootstrap.

## Etat

| Etape              | Statut       | Date       | Commit |
| ------------------ | ------------ | ---------- | ------ |
| Bootstrap          | Livre        | 2026-05-18 | -      |
| Session 1 (M1)     | Livre        | 2026-05-18 | 86f80d4 |
| Session 2 (M2)     | Livre        | 2026-05-18 | 02f3576 |
| Session 3 (M3)     | Livre        | 2026-05-18 | 140ce35 |
| Session 4 (M4)     | Livre        | 2026-05-18 | 1eb7402 |
| Session 5 (M5+M6)  | Livre        | 2026-05-18 | baa41f1 |
| Session 6 (M7+M8)  | Livre        | 2026-05-18 | f65d0be |
| Session 7 (M10)    | Livre        | 2026-05-18 | 9f87c25 |
| Session 8 (M12)    | Livre        | 2026-05-18 | 1500443 |
| Session 9 (M13+M14)| Livre        | 2026-05-18 | 0c84b4b |
| Session 10 (M11)   | Livre        | 2026-05-18 | f4769de |
| Session 12 (Deploy)| Livre        | 2026-05-19 | b182bca |
| Polish post-prod   | Livre        | 2026-05-19 | 5a43e04, 3c1f546, 2c4e589 |
| Session 11 (PWA)   | Non commence | -          | -      |
| Sessions polishage | En cours     | 2026-05-19 | -      |

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

## Session 4 — M4 Demande FDA/FD + workflow validation (P0) - LIVRE 2026-05-18

**Livre** (commit 1eb7402)

- Formulaire `/expense-requests/new` (FDA et FD) avec items, pieces jointes
- Workflow declaratif `expense_request_standard_v1` (cf. ADR 0002)
- Service Signature avec chainage cryptographique
- Calcul dynamique de la chaine d'approbateurs selon seuils versionnees (M2)
- Variante `FD_URGENCE` avec garde des 4 conditions cumulatives + SLA 72h +
  Anomaly auto + notif CONTROLEUR_INTERNE
- Pages de validation (Filiale N1, N2, Groupe, AG) avec signatures
- Cron `/api/cron/stale-regularizations` detecte les urgences > 72h

**Criteres d'acceptation**

- [x] Une FD au-dessus du seuil Groupe declenche bien 4 signatures
      (resolveThreshold + can-act helpers + workflow declaratif)
- [x] Tenter de signer comme demandeur ET validateur = rejet (separation
      des fonctions via `canAct()` qui interdit `actorId == requesterId` +
      `actorId == precedentSignerId`)
- [x] Un dossier urgence non regularise apres 72h declenche une `Anomaly` auto
      (cron `/api/cron/stale-regularizations` toutes les heures + 12 tests
      `emergency-guards`)

**Reporte / non livre**

- Generation PDF du dossier : reporte (session polishage PDF generation)
- QR code de verification d'integrite : reporte (depend du PDF)

---

## Session 5 — M5 + M6 Comparatif d'offres + BC/Contrats (P0) - LIVRE 2026-05-18

**Livre** (commit baa41f1)

- M5 : `/offer-comparisons` formulaire 2-3 offres + tableau comparatif
- M5 : `/sole-source-justifications` formulaire obligatoire si 1 seule offre
       au-dessus du seuil 3 offres (`sourcing-check.test.ts` 7 tests)
- M6 : `/purchase-orders` creation BC + signatures cascadees via
       WorkflowDefinition + Signature service
- Snapshot du RIB fournisseur au moment du BC (anti-fraude)
- Validation comparatif/justification obligatoire avant signature finale BC

**Criteres d'acceptation**

- [x] Un BC au-dessus du seuil 3 offres exige un comparatif valide OU une
      justification offre unique signee (test sourcing-check)
- [x] Le BC est verrouille apres signature complete (transition workflow
      vers SIGNED puis ACTIVE bloque toute modification)

**Reporte**

- Generation PDF BC avec QR code : session polishage PDF

---

## Session 6 — M7 + M8 PV reception + Factures + 3-way match (P0) - LIVRE 2026-05-18

**Livre** (commit f65d0be)

- M7 : `/receptions` formulaire PV (biens, service fait, attachement)
- M7 : Signatures Operations + Technique + Finance via Signature service
- M8 : `/invoices` saisie/upload facture
- M8 : `3-way match` automatique (`three-way-match/match.ts` 17 tests) -
       tolerance configurable 5% prix / 1% total
- M8 : Anomaly auto si ecart > tolerance (`detectInvoicePriceVariance`)
- M8 : Statut `DISPUTED` + workflow de reconciliation
- M8 : Avoirs (CREDIT_NOTE) reduisent `amountPaid` cumule
       (`balance.test.ts` 16 tests)

**Criteres d'acceptation**

- [x] "Sans PV = pas de paiement final" : `can-sign.test.ts` valide le blocage
- [x] Un ecart de prix > 5% entre BC et facture leve une `Anomaly` AUTO
- [x] L'avoir (CREDIT_NOTE) reduit correctement le `amountPaid` cumule

**Reporte**

- Generation PDF PV + Facture : session polishage PDF

---

## Session 7 — M10 Tresorerie + anti-fraude beneficiaire (P0) - LIVRE 2026-05-18

**Livre** (commit 9f87c25)

- `/payments` planification + execution paiements
- Workflow anti-fraude `anti-fraud.test.ts` (15 tests) :
  - Verification beneficiaire = fournisseur du BC
  - RIB hors quarantaine
  - 2 personnes validant (segregation)
- Calcul automatique de la position de cash (`cash-position.test.ts` 7 tests)
- Rate limiting `5 req/min` sur l'execution paiement (`rate-limit.test.ts`
  10 tests)

**Criteres d'acceptation**

- [x] Tenter de payer un beneficiaire dont le RIB est en quarantaine = blocage
- [x] La preuve bancaire est obligatoire pour passer en statut `EXECUTED`
      (champs `proofUrl` requis + validation server action)
- [x] L'audit log enregistre chaque tentative (succes ou echec) via
      `appendAudit` dans transaction Serializable

---

## Session 8 — M12 Comptabilite + Export SYSCOHADA/FEC + Archivage (P0) - LIVRE 2026-05-18

**Livre** (commit 1500443)

- Generation automatique des `JournalEntry` depuis Payment executes
  (`build-entry.test.ts` 11 tests, debit/credit equilibre)
- Export FEC format 18 colonnes pipe-separated DGFiP-compliant
  (`fec-format.test.ts` 10 tests)
- Page `/accounting/periods` ouverture/cloture mensuelle
  (`period-locking.test.ts` 9 tests)
- Archivage automatique des pieces apres cloture (immutabilite via guard
  PeriodLocked dans server actions)

**Criteres d'acceptation**

- [x] Chaque paiement execute genere une ecriture debit/credit equilibree
- [x] L'export FEC respecte le format DGFiP (header + 17 colonnes data,
      separateur `|`, encoding UTF-8 BOM Excel-friendly)
- [x] La cloture d'une periode empeche toute modification retroactive
      (guard `assertPeriodOpen()` dans toutes les writes accounting)

**Reporte**

- Endpoint REST `/api/v1/accounting/entries` OpenAPI : session integration ERP
- Webhook sortant vers Sage/Odoo/Dolibarr : session integration ERP

---

## Session 9 — M13 + M14 Controle interne + Reporting (P1) - LIVRE 2026-05-18

**Livre** (commit 0c84b4b)

- 5 regles de detection d'anomalies (`control-checks/rules.test.ts` 19 tests) :
  - Factures dupliquees (meme fournisseur + meme montant proche)
  - Fractionnement des paiements (eclatement pour passer sous seuil)
  - PV manquant > X jours apres BC reception
  - Drafts stale (FDA en attente > N jours)
  - Urgences repetees (meme demandeur, > N urgences en 30 jours)
- Cron `/api/cron/control-checks` toutes les heures (commit 5a43e04)
- Page `/anomalies` + workflow resolution (ACK -> IN_PROGRESS -> RESOLVED)
- KPIs M14 (`kpis/compute.test.ts` 12 tests) :
  - Taux dossiers conformes
  - Delai moyen FD -> paiement
  - Urgences hors delai
  - Top 5 anomalies semaine

**Criteres d'acceptation**

- [x] Le DFG voit en un coup d'oeil le top 5 anomalies de la semaine
- [x] L'AG peut filtrer le reporting par entite/projet/periode
- [x] Les KPIs sont calcules en background (cron control-checks + cache)

---

## Session 10 — M11 Cash forecast 13 semaines (P1) - LIVRE 2026-05-18

**Livre** (commit f4769de)

- Saisie manuelle des entrees projetees (revenus contractuels) via
  `CashForecastLine` INFLOW
- Calcul auto des sorties projetees depuis Payments SCHEDULED + Invoices
  approved (`projection.test.ts` 12 tests)
- UI `/cash-forecast` 13 semaines
- Detection rupture (`detectRuptures`) + horizon `daysUntilFirstRupture`
- Cron `/api/cron/cash-rupture` quotidien 06h30 Africa/Lome (commit 5a43e04)
  cree Anomaly OTHER (CRITICAL si <= J+14, HIGH sinon) + notif DFG, dedup 24h
- Snapshots hebdo via `getWeekStart()` (`week-math.test.ts` 10 tests)

**Criteres d'acceptation**

- [x] Une rupture projetee a J+15 declenche une notification au DFG
      (cron quotidien + notifyHoldingRole(DFG))
- [x] Les snapshots permettent une comparaison previsionnel vs realise
      (CashForecast par weekStart + agregation des Lines)

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

## Session 12 — Deploiement Hostinger VPS + CI/CD - LIVRE 2026-05-19

**Livre** (commits b182bca, 5a43e04, 3c1f546, 2c4e589)

- Traefik (template Hostinger) + Let's Encrypt automatique (au lieu de Caddy)
- `scripts/bootstrap-vps.sh` idempotent (provisioning + 1er deploy)
- Workflow GitHub Actions `.github/workflows/deploy.yml` :
  test -> build Docker multi-stage -> push GHCR -> SSH deploy
- Dockerfile multi-stage Next.js standalone (~100 MB final)
- docker-compose.prod.yml : postgres + minio + minio-init + web + cron
- Container cron Alpine + crond + tzdata Africa/Lome :
  - */15 activate-quarantines
  - 0 * * * * control-checks
  - 15 * * * * stale-regularizations
  - 30 6 * * * cash-rupture
- 4 endpoints /api/cron/* securises avec `checkCronAuth` timing-safe
  (8 tests unitaires)
- Backups quotidiens `pg_dump` + chiffrement GPG + rotation 30 jours
  (`scripts/backup.sh`)
- Endpoint `/api/health` (liveness + readiness DB ping) + Docker healthcheck
  via node fetch (start_period 40s)
- Documentation `docs/deployment.md` complete
- Domaine `finances.rwa-core.com` (record A cree manuellement, DNS API
  hors scope du token Hostinger)

**Criteres d'acceptation**

- [x] Un push sur `main` declenche le deploiement (CI build + push GHCR
      + SSH deploy via secrets VPS_HOST/VPS_USER/VPS_SSH_KEY)
- [x] Rollback < 5 min : changer IMAGE_TAG dans .env.production + restart
- [ ] Backups testes par restauration : TODO test sur staging

**Restes / actions humaines**

- Configurer GitHub Secrets VPS_HOST / VPS_USER / VPS_SSH_KEY
- Premier bootstrap : SSH + `bootstrap-vps.sh`
- Tester restauration backup sur VPS staging
- Cron `/api/cron/*` : verifier en prod que les jobs se declenchent

---

## Sessions de polissage

### Session polishage P1 - PDF generation (en cours 2026-05-19)

**Perimetre**

- Lib PDF (@react-pdf/renderer ou pdf-lib + qrcode)
- Generateurs PDF cote serveur (Server Actions ou Route Handlers) :
  - FDA / FD dossier complet (Modele 1) + QR code chaine audit
  - Comparatif d'offres (Modele 2)
  - Justification offre unique (Modele 3)
  - BC / Contrat (Modele 4)
  - PV reception (Modele 5)
  - Facture / Avoir
  - Recu de paiement
- QR code lien public verification chaine audit (lit /api/audit/verify/...)
- Polices et template charte RWA (logo SVG + Space Grotesk + DM Sans)
- Endpoints `/api/[resource]/[id]/pdf` avec garde role

### Session polishage P2 - Observabilite prod

- Sentry SDK Next.js (errors + perfs + traces)
- Endpoint `/api/ready` (diff de `/health` = check S3 + SMTP + Postgres)
- Metriques Prometheus optionnelles (cron success rate, audit chain len)

### Session polishage P3 - Documentation utilisateur

- Guides par role dans `docs/user-guide/` (admin, DFG, demandeur, valideur,
  tresorier, controleur interne, AG)
- Premier login + setup admin
- FAQ + troubleshooting

### Session polishage P4 - Tests E2E

- Playwright setup (apps/web/e2e)
- Workflows critiques : FDA->BC->PV->Facture->Paiement, anti-fraude RIB,
  export FEC

### A planifier

- Audit a11y (axe-core, NVDA) sur les pages chaudes
- Performance audit (Lighthouse > 90)
- I18n EN/ZH (alignement avec `reliancewestafrica-website`)
- Session 11 PWA terrain chef de chantier

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
