#!/usr/bin/env bash
# =============================================================================
# Backup Postgres + MinIO -> fichier chiffre + rotation 30 jours
# =============================================================================
# A planifier en cron : 0 3 * * * /opt/reliance-finance/scripts/backup.sh
#
# Restauration manuelle :
#   gpg -d backup-XXX.sql.gz.gpg | gunzip | psql ...
# =============================================================================

set -euo pipefail

APP_DIR=/opt/reliance-finance
BACKUP_DIR=/var/backups/reliance-finance
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS=30
GPG_RECIPIENT="${BACKUP_GPG_RECIPIENT:-admin@reliancewestafrica.com}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Backup Reliance Finance ${TIMESTAMP}"

# 1. Dump Postgres
cd "${APP_DIR}"
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U reliance -d reliance_finance --clean --if-exists | \
  gzip > "${BACKUP_DIR}/db-${TIMESTAMP}.sql.gz"

# 2. Chiffrement GPG (si cle dispo)
if gpg --list-keys "${GPG_RECIPIENT}" >/dev/null 2>&1; then
  gpg --batch --yes --trust-model always --encrypt -r "${GPG_RECIPIENT}" \
    -o "${BACKUP_DIR}/db-${TIMESTAMP}.sql.gz.gpg" \
    "${BACKUP_DIR}/db-${TIMESTAMP}.sql.gz"
  rm "${BACKUP_DIR}/db-${TIMESTAMP}.sql.gz"
  echo "  Backup chiffre : ${BACKUP_DIR}/db-${TIMESTAMP}.sql.gz.gpg"
else
  echo "  WARN : cle GPG ${GPG_RECIPIENT} introuvable - backup non chiffre"
fi

# 3. MinIO attachments (rsync vers volume backup)
docker compose -f docker-compose.prod.yml exec -T minio sh -c "mc mirror --overwrite local/reliance-finance-attachments /backup-mount/attachments-${TIMESTAMP}/" 2>/dev/null || \
  echo "  INFO : skip MinIO backup (mount /backup-mount absent dans le container)"

# 4. Rotation
find "${BACKUP_DIR}" -name "db-*.sql.gz*" -mtime +${RETENTION_DAYS} -delete
echo "  Rotation : suppression > ${RETENTION_DAYS} jours"

echo "[$(date)] Backup termine"
