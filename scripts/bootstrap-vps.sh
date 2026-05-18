#!/usr/bin/env bash
# =============================================================================
# Reliance Finance - Bootstrap initial du VPS Hostinger
# =============================================================================
# A executer UNE SEULE FOIS en SSH sur le VPS (premiere installation).
# Idempotent : peut etre relance sans casse.
#
# Prerequis (deja fournis par le template "Ubuntu 24.04 with Docker and
# Traefik" d'Hostinger) :
#   - Docker + docker compose v2
#   - Traefik en route sur reseau Docker `traefik`
#   - Acme/Let's Encrypt configure dans Traefik
#
# Usage :
#   sudo bash bootstrap-vps.sh
# =============================================================================

set -euo pipefail

APP_DIR=/opt/reliance-finance
REPO_URL=https://github.com/RelianceWestAfrica/reliance-finance.git
BRANCH=main

echo "==> 1. Verification des prerequis..."
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker missing"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: docker compose v2 missing"; exit 1; }
docker network ls | grep -q traefik || { echo "ERROR: docker network 'traefik' missing - check Hostinger template"; exit 1; }
command -v git >/dev/null 2>&1 || apt-get install -y git
echo "    OK"

echo "==> 2. Clone / pull du repo dans ${APP_DIR}..."
if [ -d "${APP_DIR}/.git" ]; then
  echo "    repo deja present, pull..."
  cd "${APP_DIR}"
  git fetch origin
  git reset --hard "origin/${BRANCH}"
else
  echo "    clone initial (besoin d'un PAT GitHub pour repo prive)..."
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "ERROR: exporter GITHUB_TOKEN avant lancement :"
    echo "       export GITHUB_TOKEN=ghp_XXXX (PAT avec scope repo)"
    exit 1
  fi
  mkdir -p "${APP_DIR}"
  git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/RelianceWestAfrica/reliance-finance.git" "${APP_DIR}"
  cd "${APP_DIR}"
  # Nettoie le token de la config remote
  git remote set-url origin "${REPO_URL}"
fi
echo "    OK : commit $(git rev-parse --short HEAD)"

echo "==> 3. Setup .env.production..."
if [ ! -f .env.production ]; then
  cp .env.production.example .env.production
  chmod 600 .env.production
  echo ""
  echo "    !!! IMPORTANT : edite manuellement /opt/reliance-finance/.env.production !!!"
  echo "    Variables a remplir :"
  echo "      - POSTGRES_PASSWORD    (openssl rand -base64 24)"
  echo "      - MINIO_ROOT_PASSWORD  (openssl rand -base64 32)"
  echo "      - AUTH_SECRET          (openssl rand -base64 32)"
  echo "      - EMAIL_SERVER_USER    (l'email Hostinger)"
  echo "      - EMAIL_SERVER_PASSWORD"
  echo ""
  read -p "Appuie sur Entree apres avoir edite .env.production..."
fi
echo "    OK"

echo "==> 4. Login GHCR pour pull de l'image..."
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "    WARN : GITHUB_TOKEN non export, skip login GHCR (l'image doit etre publique)"
else
  echo "${GITHUB_TOKEN}" | docker login ghcr.io -u Mabizaa --password-stdin
fi

echo "==> 5. Pull de l'image + lancement..."
docker compose --env-file .env.production -f docker-compose.prod.yml pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d

echo "==> 6. Attente que Postgres soit ready..."
for i in {1..30}; do
  if docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U reliance -d reliance_finance >/dev/null 2>&1; then
    echo "    Postgres ready"
    break
  fi
  echo "    waiting ($i/30)..."
  sleep 2
done

echo "==> 7. Migrations Prisma..."
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T web sh -c "cd /app && node node_modules/prisma/build/index.js migrate deploy --schema=/app/packages/database/prisma/schema.prisma" || {
  echo "    WARN : migrate deploy a echoue, essai avec npx..."
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T web sh -c "cd /app && npx prisma migrate deploy --schema=/app/packages/database/prisma/schema.prisma"
}

echo "==> 8. Seed (premier deploiement uniquement)..."
read -p "Lancer le seed initial (utilisateurs admin + plan SYSCOHADA) ? [y/N] " -r
if [[ $REPLY =~ ^[Yy]$ ]]; then
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T web sh -c "cd /app && node packages/database/prisma/seed.js" || \
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T web sh -c "cd /app && npx tsx packages/database/prisma/seed.ts"
fi

echo ""
echo "============================================================"
echo "  Reliance Finance deploye !"
echo "  URL : https://reliance.auxeoagency.com"
echo "  (DNS peut prendre 5-15 min a se propager)"
echo "============================================================"
echo ""
echo "Logs : docker compose -f /opt/reliance-finance/docker-compose.prod.yml logs -f web"
echo "Restart : docker compose -f /opt/reliance-finance/docker-compose.prod.yml restart web"
echo ""
echo "PROCHAINE ETAPE : changer le mot de passe admin (ChangeMe123!) au premier login"
