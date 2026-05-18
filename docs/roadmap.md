# Roadmap d'implementation - Reliance Finance

> Decoupage en sessions Claude Code. Chaque session livre 1 ou 2 modules
> autonomes avec criteres d'acceptation testables. Les modules respectent
> la priorisation P0/P1 du brief de session bootstrap.

## Etat

| Etape    | Statut        | Date       |
| -------- | ------------- | ---------- |
| Bootstrap| Livre         | 2026-05-18 |
| Session 1 (M1)     | A planifier  | -          |
| Session 2 (M2)     | A planifier  | -          |
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

## Session 1 — M1 Auth & RBAC complet (P0)

**Periimetre**

- Page `/settings/users` (admin) : lister, inviter, desactiver utilisateurs
- Workflow d'invitation : email + lien de premiere connexion + setup mot de passe
- Page `/settings/memberships` : assigner roles a utilisateurs sur entites
- Helpers `requireAnyRole` cables sur toutes les Server Actions sensibles
- Middleware applicatif Prisma pour le multi-tenancy (cf. ADR 0001 §2.2)
- Tests unitaires d'isolation : un user Togo ne voit pas les data Cote d'Ivoire
- Auth audit : table `AuditLog` cablée sur les events `LOGIN_SUCCESS`,
  `LOGIN_FAILURE`, `LOGOUT`, `PASSWORD_CHANGE`, `MEMBERSHIP_ADDED`,
  `MEMBERSHIP_REVOKED`
- Page `/audit` (auditeurs + controleur interne) : recherche dans l'audit log
- Verification du chainage cryptographique : endpoint `/api/audit/verify/...`

**Dependances** : Bootstrap

**Criteres d'acceptation**

- [ ] Un admin peut inviter un user, le user recoit un email, definit son mot
      de passe et se connecte
- [ ] Un DAF Togo ne voit aucune ressource Cote d'Ivoire dans aucune liste
- [ ] L'audit log enregistre chaque action sensible avec hash chaine valide
- [ ] Tests passent : `pnpm test` (couverture > 80% sur le middleware)

---

## Session 2 — M2 Referentiel (P0)

**Perimetre**

- CRUD Entites (Holding, Filiales, SPV) avec hierarchie editable
- CRUD Projets et Centres de cout (scope filiale)
- Plan comptable SYSCOHADA : import CSV + UI de gestion
- CRUD Seuils de validation (DFG / Admin)
- CRUD Devises + taux de change
- Page utilisateur : preferences (fuseau, devise affichage)

**Dependances** : M1

**Criteres d'acceptation**

- [ ] Le DFG peut creer une nouvelle filiale et y rattacher des SPV
- [ ] Le plan SYSCOHADA est extensible sans toucher au code
- [ ] La modification d'un seuil est journalisee et impacte les nouveaux dossiers

---

## Session 3 — M3 Cycle fournisseur + anti-fraude RIB (P0)

**Perimetre**

- CRUD fournisseurs avec onboarding KYC light (RCCM, IFU, RIB, contacts)
- Upload des documents fournisseurs (MinIO/S3)
- Workflow `BankAccountChangeRequest` : double validation + delai 24h
- Endpoint de detection des changements RIB suspects
- Page `/suppliers/[id]/history` : historique des RIB + signaux d'alerte
- Notifications email + in-app au DFG sur changement RIB

**Dependances** : M1, M2

**Criteres d'acceptation**

- [ ] Un nouveau RIB n'est utilisable pour un paiement qu'apres 24h + 2 visas
- [ ] Toute tentative de payer un beneficiaire different du fournisseur du BC
      est bloquee
- [ ] L'historique des changements RIB est immuable et exportable

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
