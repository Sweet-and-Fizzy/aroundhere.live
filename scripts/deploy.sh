#!/bin/bash
# Deploy script for local-music
# Run from your local machine: ./scripts/deploy.sh
# Or on the server: ./deploy.sh

set -e

# Configuration
REMOTE_USER="${REMOTE_USER:-deploy}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_DIR="/opt/local-music"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}==>${NC} $1"; }
warn() { echo -e "${YELLOW}==>${NC} $1"; }
error() { echo -e "${RED}==>${NC} $1"; exit 1; }

# Check if running locally or on server
if [ -z "$REMOTE_HOST" ] && [ -f "/opt/local-music/docker-compose.prod.yml" ]; then
    # Running on server
    log "Running deployment on server..."
    cd /opt/local-music

    log "Pulling latest images..."
    docker compose -f docker-compose.prod.yml pull

    log "Starting services..."
    docker compose -f docker-compose.prod.yml up -d

    log "Running database migrations..."
    docker compose -f docker-compose.prod.yml exec -T app npx prisma migrate deploy

    log "Cleaning up old images..."
    docker image prune -f

    log "Deployment complete!"
    docker compose -f docker-compose.prod.yml ps
    exit 0
fi

# Running locally - deploy to remote server
if [ -z "$REMOTE_HOST" ]; then
    error "REMOTE_HOST is required. Usage: REMOTE_HOST=your-server-ip ./scripts/deploy.sh"
fi

log "Deploying to $REMOTE_USER@$REMOTE_HOST..."

# Sync docker-compose and Caddyfile to server
log "Syncing configuration files..."
rsync -avz --progress \
    docker-compose.prod.yml \
    Caddyfile \
    "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/"

# Check if .env exists on server
ssh "$REMOTE_USER@$REMOTE_HOST" "test -f $REMOTE_DIR/.env" || {
    warn ".env file not found on server!"
    warn "Creating template .env file..."
    ssh "$REMOTE_USER@$REMOTE_HOST" "cat > $REMOTE_DIR/.env << 'EOF'
# Production environment variables
# IMPORTANT: Update these values!

POSTGRES_PASSWORD=CHANGE_ME_TO_SECURE_PASSWORD

# Your domain (used by Caddy for automatic HTTPS)
DOMAIN=yourdomain.com

# API Keys
ANTHROPIC_API_KEY=
GOOGLE_MAPS_API_KEY=
PARSER_FAILURE_WEBHOOK_URL=

# Image settings (if using GitHub Container Registry)
# GITHUB_REPOSITORY=yourusername/local-music
# IMAGE_TAG=latest
EOF"
    error "Please SSH to server and edit $REMOTE_DIR/.env with your production values, then run deploy again."
}

# Run deployment on server
log "Running deployment on server..."
ssh "$REMOTE_USER@$REMOTE_HOST" "cd $REMOTE_DIR && bash -s" << 'DEPLOY_SCRIPT'
set -e

echo "==> Pulling latest images..."
docker compose -f docker-compose.prod.yml pull

echo "==> Starting services..."
docker compose -f docker-compose.prod.yml up -d

echo "==> Waiting for database to be ready..."
sleep 10

echo "==> Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T app npx prisma migrate deploy || echo "Migration failed or no migrations to run"

echo "==> Cleaning up old images..."
docker image prune -f

echo "==> Current status:"
docker compose -f docker-compose.prod.yml ps
DEPLOY_SCRIPT

log "Deployment complete!"
echo ""
echo "Your app should be available at https://\$(ssh $REMOTE_USER@$REMOTE_HOST 'source $REMOTE_DIR/.env && echo \$DOMAIN')"
