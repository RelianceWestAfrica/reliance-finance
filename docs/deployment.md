# Deploiement Reliance Finance - VPS Hostinger

## Infrastructure

| Composant | Detail |
| --------- | ------ |
| VPS | Hostinger KVM 2 (2 CPU / 8 GB RAM / 100 GB disk) - srv1563947.hstgr.cloud |
| IP publique | 76.13.61.238 |
| OS | Ubuntu 24.04 LTS |
| Reverse proxy | Traefik (pre-installe via template Hostinger) - reseau Docker `traefik`, SSL Let's Encrypt automatique |
| URL prod | https://finances.rwa-core.com |
| Registry image | ghcr.io/reliancewestafrica/reliance-finance:latest |
| DNS A record | `finances.rwa-core.com` -> 76.13.61.238 (a creer manuellement, voir section "Configuration DNS") |

## Architecture

```
Internet -> Traefik (80/443) -> Reliance Finance container :3000
                                      |
                                      +-> Postgres 16 (internal network)
                                      +-> MinIO S3 (internal network)
                                      +-> SMTP Hostinger (port 587)
```

## Premier deploiement (one-shot)

### 1. Obtenir un PAT GitHub (lecture seule sur le repo)

GitHub > Settings > Developer settings > Personal access tokens > Fine-grained
- Scope : `Contents: Read-only` sur `RelianceWestAfrica/reliance-finance`
- Note : nomme-le `reliance-vps-pull`

### 2. SSH dans le VPS

```bash
ssh root@76.13.61.238
```

### 3. Lancer le bootstrap script

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxx
curl -fsSL https://raw.githubusercontent.com/RelianceWestAfrica/reliance-finance/main/scripts/bootstrap-vps.sh | bash
```

Si le repo est prive, le `curl` echouera. Alternative :

```bash
git clone https://x-access-token:${GITHUB_TOKEN}@github.com/RelianceWestAfrica/reliance-finance.git /opt/reliance-finance
cd /opt/reliance-finance
bash scripts/bootstrap-vps.sh
```

Ce script :
- Verifie Docker + Traefik OK
- Clone le repo dans `/opt/reliance-finance`
- Cree `.env.production` (te demande de remplir les secrets)
- Pull l'image GHCR + lance le compose
- Applique les migrations Prisma
- Propose de seeder (admin + plan SYSCOHADA)

### 4. Verifier le deploiement

- Resolution DNS : `dig finances.rwa-core.com` doit renvoyer 76.13.61.238
- HTTP : `curl -I https://finances.rwa-core.com` doit renvoyer 200
- Login : ouvrir `https://finances.rwa-core.com/login`
  - Email : `admin@reliancewestafrica.com`
  - Mot de passe : `ChangeMe123!` **(a changer immediatement !)**

## CI/CD automatique (deploiements suivants)

### Setup unique des GitHub Secrets

GitHub > Settings > Secrets and variables > Actions > New repository secret :

| Secret | Valeur |
| ------ | ------ |
| `VPS_HOST` | `76.13.61.238` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | contenu de la cle privee SSH (correspond a `claude-auxeo` deja attachee) |

### Workflow

Chaque `git push` sur `main` declenche `.github/workflows/deploy.yml` :
1. Tests + typecheck + lint (sinon abort)
2. Build de l'image Docker multi-stage
3. Push vers `ghcr.io/reliancewestafrica/reliance-finance:sha-XXXXXX` + `latest`
4. SSH sur le VPS : pull + restart container `web` (zero downtime via Traefik)
5. Healthcheck Postgres
6. Prune des images obsoletes

## Operations courantes

### Logs

```bash
ssh root@76.13.61.238 'docker compose -f /opt/reliance-finance/docker-compose.prod.yml logs -f --tail=100 web'
```

### Rollback rapide

```bash
ssh root@76.13.61.238 'cd /opt/reliance-finance && echo "IMAGE_TAG=sha-XXXXXX" > .env.runtime && docker compose --env-file .env.production --env-file .env.runtime -f docker-compose.prod.yml up -d --no-deps web'
```

### Migrations manuelles

```bash
ssh root@76.13.61.238 'cd /opt/reliance-finance && docker compose --env-file .env.production -f docker-compose.prod.yml exec web npx prisma migrate deploy --schema=/app/packages/database/prisma/schema.prisma'
```

### Backups

Configurer cron sur le VPS :

```bash
sudo crontab -e
# Ajoute :
0 3 * * * /opt/reliance-finance/scripts/backup.sh >> /var/log/reliance-backup.log 2>&1
```

Generer une cle GPG pour chiffrer les backups :

```bash
gpg --quick-generate-key admin@reliancewestafrica.com
export BACKUP_GPG_RECIPIENT=admin@reliancewestafrica.com
```

Restauration :

```bash
gpg -d /var/backups/reliance-finance/db-XXXXXX.sql.gz.gpg | gunzip | \
  docker compose -f docker-compose.prod.yml exec -T postgres psql -U reliance -d reliance_finance
```

## Configuration DNS (a faire avant le bootstrap)

Le domaine `rwa-core.com` est dans un compte Hostinger dont l'API DNS
n'est pas accessible depuis le token courant (scope restreint a
`auxeoagency.com`). Le record doit etre cree manuellement.

### Via le panel Hostinger
1. Se connecter sur https://hpanel.hostinger.com
2. Domains > rwa-core.com > DNS / Nameservers > Manage DNS records
3. Add record :
   - Type : `A`
   - Name : `finances`
   - Points to : `76.13.61.238`
   - TTL : `3600`
4. Save

### Verification
```bash
dig +short finances.rwa-core.com   # doit renvoyer 76.13.61.238
```

La propagation prend 5-15 min apres creation. Une fois resolue, Traefik
genere automatiquement le certificat Let's Encrypt au premier hit HTTPS.

## Configurer un alias reliancewestafrica.com (optionnel, plus tard)

`reliancewestafrica.com` est aussi dans le portefeuille mais DNS API non
accessible. Pour ajouter un alias :

1. Chez Hostinger (panel) : creer un CNAME
   - `finance` -> `finances.rwa-core.com.`
2. Sur le VPS, ajouter le host a `.env.production` via une regle Traefik
   multi-host, ou changer `APP_DOMAIN`
3. Restart : `docker compose -f docker-compose.prod.yml up -d web`

## Securite

- Mot de passe admin par defaut a changer **immediatement** au premier login
- Cle GPG des backups stockee hors VPS
- Rotation trimestrielle des secrets `.env.production` (genere via openssl)
- Audit log chaine SHA-256 active depuis l'application (cf. M1 ADR 0001 §2.6)
- Headers HSTS / X-Frame-Options / CSP configures dans `next.config.ts`
- Firewall VPS : seuls ports 22 / 80 / 443 / ICMP autorises

## Monitoring (a configurer en polish)

- Uptime Kuma : ping sur `https://finances.rwa-core.com`
- Sentry SDK : variable `SENTRY_DSN` dans `.env.production`
- OpenTelemetry : `OTEL_EXPORTER_OTLP_ENDPOINT` pour traces

## Couts mensuels

| Item | Cout |
| ---- | ---- |
| VPS KVM 2 | 21,49 EUR (deja paye, non-incremental) |
| Domaine `auxeoagency.com` | 14,30 EUR / an (deja paye) |
| Hostinger Email | 15,90 EUR / an (deja paye) |
| GitHub Container Registry | gratuit |
| Let's Encrypt | gratuit |
| **Total marginal pour Reliance Finance** | **0 EUR/mois** |

## Limites connues (sessions polish)

- Le repo est prive : il faut un PAT GitHub avec scope `read:packages` pour pull
  l'image GHCR sur le VPS
- Image GHCR initialement privee : si echec login, rendre publique via GitHub
  ou ajouter le secret GHCR_TOKEN dans le workflow
- Pas de Redis pour le rate limiting (in-memory single process pour l'instant)
- Pas de monitoring externe configure (Uptime Kuma a deployer separement)
- Pas de WAF / CloudFlare devant Traefik
