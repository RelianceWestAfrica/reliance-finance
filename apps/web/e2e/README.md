# Tests E2E Playwright - Reliance Finance

Tests de bout en bout sur les workflows critiques.

## Pre-requis

- Postgres + MinIO + Mailhog (docker compose dev)
- DB seedee : `pnpm db:seed` (cree les 4 users de test)
- Application demarree : `pnpm dev`

## Lancer les tests

```bash
# Tous les tests (headless)
pnpm test:e2e

# Mode UI interactif (debug)
pnpm test:e2e:ui

# Mode headed (voir le navigateur)
pnpm test:e2e:headed

# Un seul test
pnpm test:e2e auth.spec.ts

# Avec custom base URL (en staging par exemple)
PLAYWRIGHT_BASE_URL=https://staging.finances.rwa-core.com pnpm test:e2e
```

## Specs

| Spec | Couvre |
| ---- | ------ |
| `auth.spec.ts` | Login admin, mauvais mot de passe, session 15min, health |
| `expense-request-flow.spec.ts` | FDA -> validation N1 -> N2/Groupe, separation fonctions, FD_URGENCE |
| `rib-quarantine.spec.ts` | M3 : demande RIB -> double validation -> quarantaine 24h, blocage paiement RIB en QUARANTINE |
| `fec-export.spec.ts` | M12 : export FEC SYSCOHADA, format 18 colonnes |

## Strategie

- Series par defaut (`workers: 1`) car etats DB partages
- Pas de cleanup entre tests : les tests sont concus pour etre **idempotents**
  ou s'appuyer sur des fixtures uniques (timestamps, UUIDs)
- Retries 2x en CI (transitoires reseau / DB)
- Screenshots + videos en cas d'echec

## Tests skipped

Plusieurs tests sont marques `test.skip` car ils necessitent :

- Des **fixtures** de donnees specifiques (RIB en quarantaine au seed, periode
  cloturable, ...)
- Des **comptes** supplementaires (2eme DAF_PAYS pour tester separation des
  fonctions sur RIB change)
- Un **token API** pour tester les endpoints REST directement

A debloquer en construisant un seed e2e specifique (`prisma/seed-e2e.ts`).

## CI

```yaml
- name: Tests E2E
  run: |
    pnpm install
    docker compose -f docker-compose.dev.yml up -d postgres minio mailhog
    pnpm db:migrate:deploy
    pnpm db:seed
    pnpm exec playwright install chromium
    pnpm test:e2e
```

Voir `.github/workflows/deploy.yml` (job `test`) pour le hook complet.
