#!/bin/bash
# Run all scrapers
# Usage: ./scripts/run-scrapers.sh

set -e

cd /opt/local-music

# Load environment variables
source .env

echo "$(date): Starting scraper run..."

# Run the scraper container (it will exit when done)
docker compose -f docker-compose.prod.yml --profile scraper run --rm scraper

echo "$(date): Scraper run complete"
