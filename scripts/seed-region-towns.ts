/**
 * Seed region_towns from current venue -> region assignments.
 * Dry run:  npx tsx scripts/seed-region-towns.ts
 * Write:    npx tsx scripts/seed-region-towns.ts --write
 */
import 'dotenv/config'
import prisma from '../server/utils/prisma'
import { normalizeTownKey, normalizeStateCode } from '../server/services/regions/town-key'
import { pickSeedRegion, type SeedVenue } from '../server/services/regions/seed'
import { HOLDING_REGION_SLUG } from '../server/utils/geo'

async function main() {
  const write = process.argv.includes('--write')
  const venues = await prisma.venue.findMany({
    where: { isActive: true, region: { slug: { not: HOLDING_REGION_SLUG } } },
    select: { name: true, city: true, state: true, latitude: true, longitude: true, regionId: true, region: { select: { name: true, createdAt: true } } },
  })

  const byTown = new Map<string, { city: string; state: string; venues: (SeedVenue & { lat: number | null; lng: number | null; name: string; regionName: string })[] }>()
  const noKey: string[] = []
  for (const v of venues) {
    const key = normalizeTownKey(v.city, v.state)
    if (!key) { noKey.push(`${v.name} (city=${v.city ?? '-'}, state=${v.state ?? '-'})`); continue }
    const entry = byTown.get(key) ?? { city: v.city!.trim(), state: normalizeStateCode(v.state)!.toUpperCase(), venues: [] }
    entry.venues.push({ regionId: v.regionId, regionCreatedAt: v.region.createdAt, lat: v.latitude, lng: v.longitude, name: v.name, regionName: v.region.name })
    byTown.set(key, entry)
  }

  const existing = new Set((await prisma.regionTown.findMany({ select: { townKey: true } })).map(t => t.townKey))
  const rows = []
  for (const [townKey, town] of byTown) {
    if (existing.has(townKey)) continue
    const pick = pickSeedRegion(town.venues)!
    if (pick.conflict) {
      console.log(`CONFLICT ${townKey}: ${town.venues.map(v => `${v.name} -> ${v.regionName}`).join('; ')} => using ${pick.regionId}`)
    }
    const withCoords = town.venues.filter(v => v.lat != null && v.lng != null)
    rows.push({
      townKey,
      city: town.city,
      state: town.state,
      regionId: pick.regionId,
      latitude: withCoords.length ? withCoords.reduce((s, v) => s + v.lat!, 0) / withCoords.length : null,
      longitude: withCoords.length ? withCoords.reduce((s, v) => s + v.lng!, 0) / withCoords.length : null,
      source: 'SEED' as const,
    })
  }

  console.log(`${rows.length} towns to seed, ${existing.size} already mapped, ${noKey.length} venues without a town key:`)
  for (const n of noKey) console.log(`  NO KEY ${n}`)
  for (const r of rows) console.log(`  ${r.townKey} -> ${r.regionId}`)

  if (!write) { console.log('Dry run. Re-run with --write to insert.'); return }
  await prisma.regionTown.createMany({ data: rows, skipDuplicates: true })
  console.log('Inserted.')
}

main().finally(() => prisma.$disconnect())
