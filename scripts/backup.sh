#!/bin/bash
# Database backup script
# Usage: ./scripts/backup.sh
# Cron example (daily at 2am): 0 2 * * * /opt/local-music/scripts/backup.sh

set -e

# Configuration
BACKUP_DIR="/opt/local-music/backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="local_music_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting backup at $(date)"

# Run pg_dump inside the container and compress
docker compose -f /opt/local-music/docker-compose.prod.yml exec -T db \
  pg_dump -U postgres -d local_music | gzip > "$BACKUP_DIR/$BACKUP_FILE"

# Check if backup was successful
if [ -f "$BACKUP_DIR/$BACKUP_FILE" ] && [ -s "$BACKUP_DIR/$BACKUP_FILE" ]; then
  echo "Backup created: $BACKUP_FILE ($(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1))"
else
  echo "ERROR: Backup failed!"
  exit 1
fi

# Remove old backups
echo "Removing backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "local_music_*.sql.gz" -mtime +$RETENTION_DAYS -delete

# List current backups
echo "Current backups:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No backups found"

echo "Backup completed at $(date)"
