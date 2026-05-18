# Deploiement - Reliance Finance

> Document a etoffer en session 12. Cette ebauche fixe les choix structurants.

## Cible

- **Production** : VPS Hostinger (Ubuntu LTS) provisionne par
  `scripts/provision-vps.sh` (a livrer)
- **Staging** : optionnel, second VPS ou container compose isole
- **Dev**     : docker-compose.yml (cf. README)

## Stack runtime (prod)

- Docker + docker-compose v2
- Caddy 2 (reverse proxy + TLS Let's Encrypt + HTTP/3)
- PostgreSQL 16 (containerise pour MVP, externalise vers Hostinger Postgres pour scale)
- MinIO ou S3 Hostinger (a evaluer cout/perf)
- Node 22 LTS (image runtime alpine)

## Secrets

- En clair dans le VPS : `/etc/reliance-finance/.env` (chmod 600, owner deploy user)
- En clair dans GitHub Actions : secrets (`AUTH_SECRET`, `DATABASE_URL`, `SSH_PRIVATE_KEY`)
- **Aucun secret committe** (cf. `.gitignore`)
- Rotation reguliere (90 jours) documentee

## Pipeline CI/CD

`.github/workflows/deploy.yml` (a livrer) :

1. Trigger : push sur `main`
2. Steps :
   - Checkout
   - Setup Node + pnpm
   - `pnpm install --frozen-lockfile`
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm build`
   - `pnpm test` (si tests presents)
   - Build image Docker (multi-stage)
   - Push vers GHCR (`ghcr.io/reliancewestafrica/reliance-finance:sha`)
   - SSH deploy : `ssh deploy@vps "cd /srv/reliance-finance && ./deploy.sh ${SHA}"`

## Backups

`scripts/backup.sh` (a livrer) :

- `pg_dump` quotidien -> `/srv/backups/db-$(date).sql.gz.gpg`
- Chiffrement GPG (cle publique en clair, prive ailleurs)
- Rotation 30 jours locale + sync vers Hostinger Object Storage
- Test de restauration mensuel obligatoire

## Monitoring

- `/health` (lite) + `/ready` (DB + S3 + SMTP) endpoints
- Sentry SDK pour erreurs runtime
- Uptime Kuma externalise pour pings

## Rollback

- `./deploy.sh` garde les 3 dernieres images
- `./rollback.sh ${PREVIOUS_SHA}` en cas de probleme
- Tag git `prod-rollback-YYYY-MM-DD` cree automatiquement

A detailler en session 12.
