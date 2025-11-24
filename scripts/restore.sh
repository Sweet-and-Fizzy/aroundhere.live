#!/bin/bash
# Database restore script
# Usage: ./scripts/restore.sh <backup_file.sql.gz>

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo ""
  echo "Available backups:"
  ls -lh /opt/local-music/backups/*.sql.gz 2>/dev/null || echo "No backups found"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  # Try looking in backups directory
  BACKUP_FILE="/opt/local-music/backups/$1"
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $1"
  exit 1
fi

echo "WARNING: This will overwrite the current database!"
echo "Backup file: $BACKUP_FILE"
read -p "Are you sure? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo "Restoring database from $BACKUP_FILE..."

# Stop the app to prevent writes during restore
docker compose -f /opt/local-music/docker-compose.prod.yml stop app worker 2>/dev/null || true

# Drop and recreate database
docker compose -f /opt/local-music/docker-compose.prod.yml exec -T db \
  psql -U postgres -c "DROP DATABASE IF EXISTS local_music;"

docker compose -f /opt/local-music/docker-compose.prod.yml exec -T db \
  psql -U postgres -c "CREATE DATABASE local_music;"

docker compose -f /opt/local-music/docker-compose.prod.yml exec -T db \
  psql -U postgres -d local_music -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Restore from backup
gunzip -c "$BACKUP_FILE" | docker compose -f /opt/local-music/docker-compose.prod.yml exec -T db \
  psql -U postgres -d local_music

# Start the app again
docker compose -f /opt/local-music/docker-compose.prod.yml start app

echo "Restore completed!"
