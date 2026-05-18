# Reliance Finance

Plateforme de gestion financiere Holding / Filiales / SPV — Reliance West Africa.

Implementation du **cadre normatif Departement Finance** (Fevrier 2026) couvrant
les 14 modules fonctionnels P0/P1 : referentiel, cycle fournisseur, demande de
depense (FDA/FD), comparatif d'offres, BC/contrats, PV de reception, factures
(3-way match), workflow de validation par seuils, tresorerie & anti-fraude RIB,
cash forecast 13 semaines, comptabilite SYSCOHADA, controle interne, reporting.

> Repo prive. Voir [`docs/cadre-normatif.md`](./docs/cadre-normatif.md) pour la
> source de verite metier, [`docs/adr/`](./docs/adr/) pour les decisions
> d'architecture, et [`docs/roadmap.md`](./docs/roadmap.md) pour le decoupage en
> sessions d'implementation.

---

## Stack

| Couche             | Choix                                                              |
| ------------------ | ------------------------------------------------------------------ |
| Runtime            | Node.js 22 LTS                                                     |
| Monorepo           | pnpm 11 workspaces + Turborepo 2                                   |
| Web app            | Next.js 15 (App Router) + React 19 + Tailwind v4                   |
| Auth               | NextAuth v5 / Auth.js (Credentials + Magic Link nodemailer)        |
| Hash mots de passe | Argon2id                                                           |
| DB                 | PostgreSQL 16 + Prisma 6                                           |
| Storage            | MinIO en dev (S3-compatible) - Hostinger / S3 en prod              |
| Mail dev           | Mailhog (capture SMTP localhost:1025, UI sur :8025)                |
| Lint               | ESLint 9 + Prettier 3 + TypeScript strict                          |

---

## Demarrage local (pas-a-pas)

### Prerequis

- Node.js 22 LTS (`nvm install 22 && nvm use 22`)
- pnpm 11 (`npm i -g pnpm@11`)
- Docker Desktop (pour postgres + minio + mailhog)
- Git

### 1. Cloner & installer

```bash
git clone https://github.com/RelianceWestAfrica/reliance-finance.git
cd reliance-finance
pnpm install
```

### 2. Lancer les services de dev

```bash
docker compose up -d
```

Services exposes :

- PostgreSQL  : `localhost:5432` (user `reliance`, pass `reliance_dev`, db `reliance_finance`)
- MinIO API   : `localhost:9000` (S3-compatible, bucket auto-cree au boot)
- MinIO Console : `localhost:9001` (user `reliance`, pass `reliance_dev_minio`)
- Mailhog SMTP : `localhost:1025`
- Mailhog UI   : http://localhost:8025

### 3. Configurer les variables d'environnement

```bash
cp .env.example .env.local
cp apps/web/.env.example apps/web/.env.local
```

Generez ensuite un secret NextAuth et collez-le dans `apps/web/.env.local` :

```bash
# Sur Linux/macOS :
openssl rand -base64 32

# Sur Windows PowerShell :
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

### 4. Migrer la DB et seeder

```bash
pnpm db:generate          # Genere le client Prisma TypeScript
pnpm db:migrate           # Cree la DB et applique le schema (creation init)
pnpm db:seed              # Charge les donnees de reference
```

Le seed cree 6 comptes de demonstration :

| Email                                           | Role(s)              | Entite       |
| ----------------------------------------------- | -------------------- | ------------ |
| admin@reliancewestafrica.com                    | ADMIN                | Holding      |
| dfg@reliancewestafrica.com                      | DFG                  | Holding      |
| tresorier@reliancewestafrica.com                | TRESORIER_GROUPE     | Holding      |
| controleur@reliancewestafrica.com               | CONTROLEUR_INTERNE   | Holding      |
| daf.togo@reliancewestafrica.com                 | DAF_PAYS             | Togo         |
| demandeur.togo@reliancewestafrica.com           | DEMANDEUR            | Togo + SPV   |

**Mot de passe par defaut** : `ChangeMe123!` — **A CHANGER avant utilisation reelle.**

### 5. Lancer l'app web

```bash
pnpm dev
```

Application sur http://localhost:3000.

### 6. Outils utiles

```bash
pnpm db:studio            # Ouvre Prisma Studio sur http://localhost:5555
pnpm typecheck            # Verifie tous les packages
pnpm lint                 # Lint
pnpm format               # Prettier ecriture
pnpm format:check         # Prettier check
pnpm db:reset             # Detruit la DB et la recree (efface tout)
```

---

## Structure du monorepo

```
reliance-finance/
├── apps/
│   └── web/                              # Next.js 15 - App Router
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/login/         # Page de login (Credentials + Magic Link)
│       │   │   ├── (app)/                # Layout protege par auth
│       │   │   │   └── dashboard/        # Tableau de bord (squelette)
│       │   │   └── api/auth/[...nextauth]/
│       │   ├── lib/
│       │   │   ├── auth.config.ts        # NextAuth edge-safe config
│       │   │   ├── auth.ts               # NextAuth complet (adapter + providers)
│       │   │   ├── rbac.ts               # Helpers de roles
│       │   │   └── format.ts             # Formatage devise / date FCFA
│       │   ├── middleware.ts             # Auth middleware (Edge)
│       │   └── styles/globals.css        # Tailwind v4 + design tokens
│       └── package.json
├── packages/
│   ├── database/                         # Schema Prisma + client + seed
│   │   ├── prisma/
│   │   │   ├── schema.prisma             # 40+ tables couvrant M1-M14
│   │   │   └── seed.ts
│   │   └── src/index.ts                  # Singleton Prisma client
│   ├── workflow-engine/                  # Squelette du moteur (impl. M9)
│   └── config/
│       ├── eslint/                       # ESLint config partagee
│       └── typescript/                   # tsconfig partages
├── docs/
│   ├── cadre-normatif.md                 # Source de verite metier (texte du PDF)
│   ├── rbac-matrix.md                    # Matrice des permissions
│   ├── roadmap.md                        # Decoupage en sessions d'impl.
│   └── adr/
│       ├── 0001-data-model.md            # Decisions modele de donnees
│       └── 0002-workflow-engine.md       # Decisions moteur de workflow
├── scripts/                              # Scripts ops (backup, provisioning)
├── docker-compose.yml                    # Dev local
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── .env.example
```

---

## Securite

- **Aucun secret en clair dans le repo.** Tous les secrets vivent dans
  `.env.local` (gitignored) en dev, et dans les variables d'environnement
  Hostinger en prod.
- **Hash mots de passe** : Argon2id (`packages/database/prisma/seed.ts`).
- **Sessions JWT courtes** : 15 minutes (`AUTH_SESSION_MAX_AGE_SECONDS`).
- **RBAC** : matrice documentee dans [`docs/rbac-matrix.md`](./docs/rbac-matrix.md),
  appliquee par helpers `requireRole`/`requireAnyRole` dans `apps/web/src/lib/rbac.ts`.
- **Separation des fonctions** : enforcee par le moteur de workflow (cf. ADR 0002 §2.4).
- **Anti-fraude RIB** : workflow `BankAccountChangeRequest` avec double validation +
  delai de carence 24h (`ANTI_FRAUD_RIB_QUARANTINE_HOURS`).
- **Audit log immuable** : table `AuditLog` avec chainage cryptographique
  (cf. ADR 0001 §2.6).
- **Headers de securite** : CSP / HSTS / X-Frame-Options definis dans
  `apps/web/next.config.ts`.

Toute connexion utilisateur est journalisee. La rotation des secrets exposes
accidentellement (token GitHub, Hostinger, etc.) est imperative.

---

## Conformite & localisation

- **Cadre normatif** : Procedure Departement Finance Holding/Filiales, Fevrier 2026.
  Conserve verbatim dans [`docs/cadre-normatif.md`](./docs/cadre-normatif.md).
- **Plan comptable** : SYSCOHADA revise (compatible OHADA) — chargement initial
  dans le seed.
- **Devises** : XOF (Franc CFA BCEAO), XAF (Franc CFA BEAC), USD, EUR avec taux
  configurables.
- **Fuseau horaire** : UTC en stockage, `Africa/Lome` par defaut a l'affichage,
  configurable par utilisateur (`User.preferredTimezone`).
- **Conservation des pieces** : 10 ans (cadre §9). Politique de purge ecrite mais
  desactivee par defaut.

---

## Livraison par sessions

Le projet est livre en **sessions d'implementation successives** (Claude Code),
chacune couvrant 1 ou 2 modules avec critere d'acceptation autonome. Voir
[`docs/roadmap.md`](./docs/roadmap.md) pour le sequencement complet.

Cette premiere session (bootstrap) a livre :

- Le monorepo (pnpm workspaces + Turborepo)
- Le schema Prisma exhaustif (40+ tables couvrant M1-M14)
- Le seed de reference (entites, roles, plan SYSCOHADA, seuils, comptes demo)
- L'app web avec NextAuth (Credentials + Magic Link)
- Le squelette du moteur de workflow (typage + stub)
- Docker Compose dev (postgres + minio + mailhog)
- Les ADR 0001 et 0002

---

## Licence

Code proprietaire — Reliance West Africa. Tous droits reserves.
