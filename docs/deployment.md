# Deploiement Reliance Finance - VPS Hostinger

> Etat : **en production**, https://finances.rwa-core.com
> Ce document decrit l'infrastructure reelle. (Historique : un plan initial
> basait le reverse proxy sur Traefik et l'IP 76.13.61.238 ; ce n'est PAS la
> realite - voir ci-dessous.)

## Infrastructure

| Composant | Detail |
| --------- | ------ |
| VPS | Hostinger KVM 4 - Ubuntu 24.04 LTS - hostname `srv1072103.hstgr.cloud` (VPS ID 1072103) |
| IP publique | **77.37.121.56** |
| Reverse proxy | **nginx (systeme) + certbot** - PAS Traefik. Vhost : `/etc/nginx/sites-available/finances.rwa-core.com`, certificat Let's Encrypt actif |
| App | `/opt/reliance-finance` sur le VPS |
| Exposition | conteneur `web` sur `127.0.0.1:3001` -> nginx proxie `finances.rwa-core.com` -> `127.0.0.1:3001` |
| URL prod | https://finances.rwa-core.com |
| Healthcheck | `GET /api/health` -> `{"status":"ok","db":"up"}` |
| Registry image | `ghcr.io/reliancewestafrica/reliance-finance:latest` (package GHCR **public** temporairement) |
| DNS A record | `finances.rwa-core.com` -> 77.37.121.56 |

### Conteneurs (4, tous `healthy`)

| Conteneur | Role |
| --------- | ---- |
| `reliance-web` | Next.js 15 (port interne 3000, mappe sur 127.0.0.1:3001) |
| `reliance-postgres` | PostgreSQL 16 (reseau Docker interne) |
| `reliance-minio` | Stockage objet S3 (reseau interne) |
| `reliance-cron` | Taches planifiees (`crond -b`) |

## Architecture

```
Internet -> nginx (80/443, certbot/Let's Encrypt) -> 127.0.0.1:3001 -> reliance-web :3000
                                                                              |
                                                                              +-> reliance-postgres (reseau interne)
                                                                              +-> reliance-minio S3 (reseau interne)
                                                                              +-> SMTP Hostinger (port 587)
```

## Secrets

- Fichier : `/opt/reliance-finance/.env.production`
- SMTP : app password Hostinger pour `noreply@reliancewestafrica.com` (dans `.env.production`)

## Deployer une nouvelle version (procedure manuelle ACTUELLE)

Le job `deploy` du CI (`.github/workflows/deploy.yml`) est present mais **inactif** :
les GitHub Secrets `VPS_*` ne sont pas encore configures (voir "CI/CD automatique").
En attendant, le deploiement est manuel.

1. `git push` sur `main`.
2. Attendre que le CI build l'image (jobs `test` + `build` verts, ~5 min).
   Une image `ghcr.io/.../reliance-finance:latest` (+ tag `sha-XXXXXXX`) est publiee.
3. Sur le VPS :

```bash
cd /opt/reliance-finance \
  && git fetch origin && git reset --hard origin/main \
  && docker compose --env-file .env.production -f docker-compose.prod.yml pull \
  && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --force-recreate web
```

4. Verifier :

```bash
curl -s https://finances.rwa-core.com/api/health   # -> {"status":"ok","db":"up"}
```

> Note : `git reset --hard origin/main` met a jour le `docker-compose.prod.yml` et
> les configs versionnees. Cette etape suppose un acces git au repo. Si le repo
> repasse en **prive**, le `git fetch` du VPS echouera sans credential -> ajouter
> une deploy key en lecture seule, OU activer le deploiement automatique (qui ne
> depend que de l'image GHCR, pas du git pull). Voir ci-dessous.

## Acces VPS

- Hostinger hPanel -> VPS 1072103 -> bouton "Terminal" (terminal web root).
  Le terminal web coupe souvent (403 / deconnexion) : le rouvrir via hPanel.
- Alternative : `ssh root@77.37.121.56` (mot de passe root via hPanel > Modifier).

## CI/CD automatique (a activer)

Le workflow `.github/workflows/deploy.yml` se declenche sur push `main`
(hors `docs/**` et `*.md`) et enchaine : `test` -> `build`+push image GHCR ->
`deploy` (SSH sur le VPS, `docker compose pull` + restart `web`, healthcheck DB).

Le job `deploy` ne fait **pas** de `git pull` : il se contente de pull l'image
GHCR et de redemarrer le conteneur `web`. Il ne depend donc pas de l'acces git
au repo.

### Setup unique des GitHub Secrets

GitHub > repo > Settings > Secrets and variables > Actions > New repository secret :

| Secret | Valeur |
| ------ | ------ |
| `VPS_HOST` | `77.37.121.56` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | cle privee SSH dont la cle publique est dans `~/.ssh/authorized_keys` du root VPS |

Une fois ces 3 secrets en place, chaque push sur `main` deploie automatiquement.

## Operations courantes

### Logs

```bash
ssh root@77.37.121.56 'cd /opt/reliance-finance && docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=100 web'
```

### Etat des conteneurs

```bash
ssh root@77.37.121.56 'cd /opt/reliance-finance && docker compose --env-file .env.production -f docker-compose.prod.yml ps'
```

### Rollback rapide (revenir a un tag image precedent)

```bash
cd /opt/reliance-finance
echo "IMAGE_TAG=sha-XXXXXXX" > .env.runtime
docker compose --env-file .env.production --env-file .env.runtime -f docker-compose.prod.yml up -d --force-recreate --no-deps web
```

### Migrations manuelles

```bash
cd /opt/reliance-finance
docker compose --env-file .env.production -f docker-compose.prod.yml exec web npx prisma migrate deploy --schema=/app/packages/database/prisma/schema.prisma
```

### Recharger nginx apres modif du vhost

```bash
nginx -t && systemctl reload nginx
```

### Renouvellement TLS (certbot, normalement automatique)

```bash
certbot renew --dry-run
```

## Configuration DNS

Record A a maintenir chez le registrar du domaine `rwa-core.com` :

| Type | Name | Points to | TTL |
| ---- | ---- | --------- | --- |
| A | `finances` | `77.37.121.56` | 3600 |

Verification :

```bash
dig +short finances.rwa-core.com   # doit renvoyer 77.37.121.56
```

## Pieges deja resolus (NE PAS re-casser)

- `pnpm-workspace.yaml` : `@sentry/cli: true` dans `allowBuilds` (sinon `pnpm install` echoue)
- `next.config.ts` : `webpack resolve.extensionAlias` `.js` -> `.ts/.tsx` (imports ESM)
- `"use server"` : un fichier `'use server'` ne peut exporter QUE des fonctions async
- `apps/web/public/.gitkeep` doit exister (sinon le `COPY` du Dockerfile echoue)
- `docker-compose.prod.yml` : `HOSTNAME=0.0.0.0` + `PORT=3000` +
  `AUTH_URL`/`NEXTAUTH_URL=https://${APP_DOMAIN}` + ports `127.0.0.1:3001:3000` +
  healthcheck via `127.0.0.1` + chemin du Prisma query engine
- cron : lancer `crond -b` (pas `&`) sinon boucle de redemarrage

## Securite

- Mot de passe admin par defaut `ChangeMe123!` (documente publiquement) -> a changer
  **immediatement** via Profil > Securite
- Repo GitHub et package GHCR actuellement **publics** (temporaire) -> repasser en
  prive une fois le deploiement automatique en place
- Rotation periodique des secrets `.env.production`
- Audit log chaine SHA-256 actif (cf. M1 ADR 0001 §2.6)
- Headers HSTS / X-Frame-Options / CSP configures dans `next.config.ts`
- Firewall VPS : seuls ports 22 / 80 / 443 / ICMP autorises

## Backups

Cron de sauvegarde sur le VPS (a verifier / configurer) :

```bash
0 3 * * * /opt/reliance-finance/scripts/backup.sh >> /var/log/reliance-backup.log 2>&1
```

Restauration (exemple) :

```bash
gunzip < db-XXXXXX.sql.gz | \
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres psql -U reliance -d reliance_finance
```

## Monitoring (a configurer)

- Uptime externe : ping sur `https://finances.rwa-core.com/api/health`
- Sentry SDK : variable `SENTRY_DSN` dans `.env.production`
- OpenTelemetry : `OTEL_EXPORTER_OTLP_ENDPOINT` pour les traces

## Limites connues / a faire

- Deploiement automatique inactif tant que les secrets `VPS_*` ne sont pas poses
- Repo + package GHCR publics temporairement (a re-privatiser)
- Abonnement email Hostinger `reliancewestafrica.com` expire le 2026-06-03 (a renouveler)
- Pas de Redis pour le rate limiting (in-memory mono-process)
- Pas de monitoring externe ni de WAF/CDN devant nginx
