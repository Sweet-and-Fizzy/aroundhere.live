#!/bin/bash
# Sync production database to local development environment
# Usage: ./scripts/sync-prod-db.sh

set -e

echo "🔄 Syncing production database to local..."
echo ""

# Production server details
PROD_HOST="deploy@138.197.34.3"
CONTAINER_NAME="aroundhere-db"
DUMP_FILE="/tmp/prod_dump_$(date +%Y%m%d_%H%M%S).sql"

# Step 1: Dump production database
echo "📤 Dumping production database from $CONTAINER_NAME..."
ssh $PROD_HOST "docker exec $CONTAINER_NAME pg_dump -U postgres -d local_music --clean --if-exists" > "$DUMP_FILE"

echo "✅ Database dumped to $DUMP_FILE"
echo "📊 Dump size: $(du -h $DUMP_FILE | cut -f1)"
echo ""

# Step 2: Drop and recreate local database
echo "🗑️  Dropping local database..."
PGPASSWORD=postgres dropdb -h localhost -p 5433 -U postgres local_music --if-exists 2>/dev/null || true

echo "📝 Creating fresh local database..."
PGPASSWORD=postgres createdb -h localhost -p 5433 -U postgres local_music

# Step 3: Import to local database
echo "📥 Importing production data to local database..."
PGPASSWORD=postgres psql -h localhost -p 5433 -U postgres -d local_music < "$DUMP_FILE" 2>&1 | grep -v "^CREATE\|^ALTER\|^SET\|^--" || true

echo ""
echo "✅ Production database synced successfully!"
echo "🧹 Cleaning up dump file..."
rm "$DUMP_FILE"

echo ""
echo "✨ Done! Your local database now has production data."
echo ""
echo "💡 Run 'npx prisma studio' to explore the data"
