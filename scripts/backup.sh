#!/bin/bash
# Nightly database backup: dump, verify, copy off the droplet, prune.
# Install on the droplet (deploy user's crontab):
#   15 2 * * * bash /opt/local-music/scripts/backup.sh >> /opt/local-music/backups/backup.log 2>&1
# Restore steps: docs/runbooks/database-backup-restore.md
#
# Reads from /opt/local-music/.env:
#   SLACK_WEBHOOK_URL                  failure alerts
#   BACKUP_R2_ACCOUNT_ID, BACKUP_R2_ACCESS_KEY_ID, BACKUP_R2_SECRET_ACCESS_KEY, BACKUP_R2_BUCKET
#                                      private bucket for off-box copies (NOT the public uploads bucket)

set -Eeuo pipefail

APP_DIR="/opt/local-music"
BACKUP_DIR="$APP_DIR/backups"
RETENTION_DAYS=7
MIN_BYTES=10000000 # the ~151 MB database dumps to ~65 MB
FILE="local_music_$(date +%Y%m%d_%H%M%S).dump"
STEP="starting"

env_get() {
  # Read one KEY=value from .env without sourcing it (values may contain shell metacharacters)
  grep -E "^$1=" "$APP_DIR/.env" | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

SLACK_WEBHOOK_URL="$(env_get SLACK_WEBHOOK_URL || true)"

notify() {
  echo "$1"
  if [ -n "$SLACK_WEBHOOK_URL" ]; then
    curl -fsS -X POST -H 'Content-Type: application/json' \
      --data "{\"text\": \"$1\"}" "$SLACK_WEBHOOK_URL" >/dev/null || echo "Slack notification failed"
  fi
}

trap 'notify ":floppy_disk: Database backup FAILED during: $STEP (host $(hostname), file $FILE)"' ERR

mkdir -p "$BACKUP_DIR"
echo "Starting backup at $(date)"

STEP="pg_dump"
# Custom format is compressed and restorable table-by-table with pg_restore.
docker exec aroundhere-db pg_dump -U postgres -d local_music -Fc -f "/backups/$FILE"

STEP="verify"
SIZE=$(stat -c %s "$BACKUP_DIR/$FILE")
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  echo "Dump is only $SIZE bytes"
  false
fi
TABLES=$(docker exec aroundhere-db pg_restore --list "/backups/$FILE" | grep -c "TABLE DATA")
echo "Backup created: $FILE ($SIZE bytes, $TABLES tables with data)"

r2() {
  AWS_ACCESS_KEY_ID="$(env_get BACKUP_R2_ACCESS_KEY_ID)" \
  AWS_SECRET_ACCESS_KEY="$(env_get BACKUP_R2_SECRET_ACCESS_KEY)" \
  docker run --rm -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION=auto \
    -v "$BACKUP_DIR:/b:ro" amazon/aws-cli "$@" \
    --endpoint-url "https://$R2_ACCOUNT.r2.cloudflarestorage.com"
}

STEP="off-box upload"
R2_ACCOUNT="$(env_get BACKUP_R2_ACCOUNT_ID || true)"
R2_BUCKET="$(env_get BACKUP_R2_BUCKET || true)"
if [ -z "$R2_ACCOUNT" ] || [ -z "$R2_BUCKET" ]; then
  notify ":warning: Database backup $FILE saved on the droplet only: BACKUP_R2_* is not configured, so there is no off-box copy."
else
  r2 s3 cp "/b/$FILE" "s3://$R2_BUCKET/$FILE" --only-show-errors

  STEP="off-box verify"
  REMOTE_SIZE=$(r2 s3api head-object --bucket "$R2_BUCKET" --key "$FILE" --query ContentLength --output text)
  if [ "$REMOTE_SIZE" != "$SIZE" ]; then
    echo "Off-box copy is $REMOTE_SIZE bytes, local is $SIZE"
    false
  fi
  echo "Uploaded to R2 bucket $R2_BUCKET"
fi

STEP="prune"
# Only reached after the new dump verified, so a failed night never deletes good backups.
find "$BACKUP_DIR" -name "local_music_*.dump" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "local_music_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Backup completed at $(date)"
