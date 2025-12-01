const fs = require('fs');
const data = JSON.parse(fs.readFileSync('scrapers-export.json', 'utf8'));

console.log(`-- Import AI-generated scrapers
-- Run: cat import.sql | docker compose -f docker-compose.prod.yml exec -T db psql -U postgres -d local_music
`);

// Venues
for (const v of data.venues) {
  const name = v.name.replace(/'/g, "''");
  const addr = (v.address || '').replace(/'/g, "''");
  console.log(`
INSERT INTO venues (id, "regionId", name, slug, address, city, state, "postalCode", website, latitude, longitude, "venueType", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, r.id, '${name}', '${v.slug}', '${addr}', '${v.city || ''}', '${v.state || ''}', '${v.postalCode || ''}', '${v.website || ''}', ${v.latitude || 'NULL'}, ${v.longitude || 'NULL'}, '${v.venueType}'::"VenueType", true, NOW(), NOW()
FROM regions r WHERE r."isActive" = true ORDER BY r."createdAt" LIMIT 1
ON CONFLICT ("regionId", slug) DO NOTHING;`);
}

console.log('');

// Sources
for (const s of data.sources) {
  const name = s.name.replace(/'/g, "''");
  const configJson = JSON.stringify(s.config).replace(/'/g, "''");
  console.log(`
INSERT INTO sources (id, name, slug, type, category, website, config, "isActive", priority, "trustScore", "parserVersion", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, '${name}', '${s.slug}', '${s.type}'::"SourceType", '${s.category}'::"SourceCategory", '${s.website || ''}', '${configJson}'::jsonb, ${s.isActive}, 10, 0.8, '1.0.0-ai', NOW(), NOW())
ON CONFLICT (slug) DO UPDATE SET config = EXCLUDED.config, website = EXCLUDED.website, "isActive" = EXCLUDED."isActive", "updatedAt" = NOW();`);
}

console.log('\n-- Done!');
