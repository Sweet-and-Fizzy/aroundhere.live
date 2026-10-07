/**
 * Propose and write region partitions for new areas.
 *
 * Input JSON: array of { city, state?, lat?, lng?, name? } (survey files and feed venue lists both fit).
 *   npx tsx scripts/partition-regions.ts --input docs/research/eastern-ma/survey-north-shore.json --default-state MA
 *   npx tsx scripts/partition-regions.ts --from proposal.json --write
 *   add --recut to re-partition towns that are already mapped (ADMIN rows stay fixed)
 *   add --include-holding to also partition towns of venues currently in the holding region
 *
 * Without --write it prints a review and saves proposal.json ({ regions, towns }) for editing.
 */
import 'dotenv/config'
import { readFileSync, writeFileSync } from 'node:fs'
import prisma from '../server/utils/prisma'
import { llmService } from '../server/services/llm'
import { geocodeAddress } from '../server/services/geocoding'
import { HOLDING_REGION_SLUG, haversineDistance, selectCandidateRegions } from '../server/utils/geo'
import { cleanTownCity, normalizeStateCode, normalizeTownKey } from '../server/services/regions/town-key'
import { buildPartitionPrompt } from '../server/services/regions/prompts'
import { validatePartition } from '../server/services/regions/validate'
import { checkProposal, findNameCollisions, planPartitionWrite } from '../server/services/regions/partition-plan'
import { createPrismaRegionStore } from '../server/services/regions/store'
import type { CandidateRegion, PartitionRegion, TownInput } from '../server/services/regions/types'

const PARTITION_MODEL = 'claude-sonnet-5-5'
const BATCH = 150

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const flag = (name: string) => process.argv.includes(name)

async function loadTowns(): Promise<Map<string, TownInput>> {
  const towns = new Map<string, TownInput>()
  const defaultState = arg('--default-state')
  const rows: Array<{ city?: string; state?: string; lat?: number; lng?: number }> = arg('--input') ? JSON.parse(readFileSync(arg('--input')!, 'utf8')) : []
  if (flag('--include-holding')) {
    const held = await prisma.venue.findMany({ where: { isActive: true, region: { slug: HOLDING_REGION_SLUG } }, select: { city: true, state: true, latitude: true, longitude: true } })
    rows.push(...held.map(v => ({ city: v.city ?? undefined, state: v.state ?? undefined, lat: v.latitude ?? undefined, lng: v.longitude ?? undefined })))
  }
  const coords = new Map<string, { lat: number; lng: number }[]>()
  for (const r of rows) {
    const key = normalizeTownKey(r.city, r.state ?? defaultState)
    const city = cleanTownCity(r.city, r.state ?? defaultState)
    const st = normalizeStateCode(r.state ?? defaultState)
    if (!key || !city || !st) continue
    if (!towns.has(key)) towns.set(key, { townKey: key, city, state: st.toUpperCase(), lat: NaN, lng: NaN })
    const lat = r.lat == null ? NaN : Number(r.lat)
    const lng = r.lng == null ? NaN : Number(r.lng)
    if (Number.isFinite(lat) && Number.isFinite(lng)) coords.set(key, [...(coords.get(key) ?? []), { lat, lng }])
  }
  for (const town of towns.values()) {
    const pts = coords.get(town.townKey)
    if (pts?.length) {
      town.lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length
      town.lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length
    } else {
      const g = await geocodeAddress(`${town.city}, ${town.state}`)
      if (!g) { console.warn(`Could not geocode ${town.townKey}; skipping`); towns.delete(town.townKey); continue }
      town.lat = g.lat
      town.lng = g.lng
    }
  }
  return towns
}

async function propose(towns: Map<string, TownInput>): Promise<PartitionRegion[]> {
  const mapped = await prisma.regionTown.findMany({ select: { townKey: true, regionId: true, source: true } })
  const mappedKeys = new Map(mapped.map(m => [m.townKey, m]))
  const recut = flag('--recut')
  const input = [...towns.values()].filter(t => {
    const m = mappedKeys.get(t.townKey)
    return !m || (recut && m.source !== 'ADMIN')
  })
  const fixed = recut ? mapped.filter(m => m.source === 'ADMIN' && towns.has(m.townKey)).map(m => ({ townKey: m.townKey, regionId: m.regionId })) : []
  if (input.length === 0) { console.log('No unmapped towns in input.'); return [] }

  const regions = await createPrismaRegionStore(prisma).listRegionsWithCentroids()
  const all: PartitionRegion[] = []
  // Batches are geographic: sort west-to-east so each batch is contiguous.
  input.sort((a, b) => a.lng - b.lng)
  for (let i = 0; i < input.length; i += BATCH) {
    const batch = input.slice(i, i + BATCH)
    const nearbyMap = new Map<string, CandidateRegion>()
    for (const t of batch) {
      for (const c of selectCandidateRegions(regions, t.lat, t.lng, { maxMiles: 60, limit: 5 })) {
        const prev = nearbyMap.get(c.id)
        if (!prev || c.distanceMiles < prev.distanceMiles) nearbyMap.set(c.id, { id: c.id, name: c.name, distanceMiles: c.distanceMiles, towns: c.towns })
      }
    }
    const nearby = [...nearbyMap.values()]
    const batchFixed = fixed.filter(f => batch.some(t => t.townKey === f.townKey))
    const response = await llmService.complete({
      provider: 'anthropic',
      model: PARTITION_MODEL,
      messages: [{ role: 'user', content: buildPartitionPrompt(batch, nearby, batchFixed) }],
      temperature: 0,
      maxTokens: 8000,
    })
    const result = validatePartition(response.content, batch.map(t => t.townKey), nearby, batchFixed)
    if (!result.ok) {
      console.error(`Batch ${i / BATCH + 1} invalid:\n  ${result.errors.join('\n  ')}`)
      process.exit(1)
    }
    all.push(...result.value)
  }
  return all
}

async function review(proposal: PartitionRegion[], towns: Map<string, TownInput>) {
  const plan = await buildPlan(proposal, towns)
  const slugOfNew = new Map(plan.newRegions.map((r, i) => [i, r.slug]))
  const collisions = await nameCollisions(proposal)
  if (collisions.length) {
    console.log(`\nNAME COLLISIONS (new region names that match an existing region): ${collisions.join(', ')}`)
    console.log('  Edit proposal.json: reuse the existing region id or rename the region. --write will refuse until fixed.')
  }
  for (const region of proposal) {
    const pts = region.townKeys.map(k => towns.get(k)).filter((t): t is TownInput => !!t)
    if (pts.length === 0) { console.log(`\n${region.name}: no resolvable towns`); continue }
    const cLat = pts.reduce((s, t) => s + t.lat, 0) / pts.length
    const cLng = pts.reduce((s, t) => s + t.lng, 0) / pts.length
    const far = [...pts].sort((a, b) => haversineDistance(b.lat, b.lng, cLat, cLng) - haversineDistance(a.lat, a.lng, cLat, cLng)).slice(0, 3)
    const newIndex = proposal.filter(r => !r.existingRegionId).indexOf(region)
    const label = region.existingRegionId ? `${region.name} (existing)` : `${region.name} (NEW, slug ${slugOfNew.get(newIndex)})`
    console.log(`\n${label}: ${pts.length} towns`)
    console.log(`  towns: ${region.townKeys.join(', ')}`)
    console.log(`  farthest from center: ${far.map(t => `${t.townKey} (${haversineDistance(t.lat, t.lng, cLat, cLng).toFixed(0)} mi)`).join(', ')}`)
  }
  const oldSlugs = new Map((await prisma.venue.findMany({ select: { id: true, slug: true } })).map(v => [v.id, v.slug]))
  console.log(`\n${plan.venueMoves.length} venues would move; slug changes:`)
  for (const m of plan.venueMoves.filter(m => m.newSlug)) console.log(`  venue ${m.venueId}: ${oldSlugs.get(m.venueId)} -> ${m.newSlug}`)
}

async function nameCollisions(proposal: PartitionRegion[]): Promise<string[]> {
  const existing = await prisma.region.findMany({ select: { name: true } })
  return findNameCollisions(proposal, existing.map(r => r.name))
}

async function buildPlan(proposal: PartitionRegion[], towns: Map<string, TownInput>) {
  const keys = new Set(proposal.flatMap(r => r.townKeys))
  const defaultState = arg('--default-state')
  const venues = (await prisma.venue.findMany({ where: { isActive: true }, orderBy: { id: 'asc' }, select: { id: true, slug: true, regionId: true, city: true, state: true } }))
    .map(v => ({ id: v.id, slug: v.slug, regionId: v.regionId, townKey: normalizeTownKey(v.city, v.state ?? defaultState) ?? '' }))
    .filter(v => keys.has(v.townKey))
  const allVenues = await prisma.venue.findMany({ select: { slug: true, regionId: true } })
  const venueSlugsByRegion = new Map<string, Set<string>>()
  for (const v of allVenues) venueSlugsByRegion.set(v.regionId, (venueSlugsByRegion.get(v.regionId) ?? new Set()).add(v.slug))
  const admin = await prisma.regionTown.findMany({ where: { source: 'ADMIN' }, select: { townKey: true } })
  const regions = await prisma.region.findMany({ select: { slug: true } })
  return planPartitionWrite({
    proposal,
    towns,
    adminTownKeys: new Set(admin.map(a => a.townKey)),
    venues,
    venueSlugsByRegion,
    takenRegionSlugs: new Set(regions.map(r => r.slug)),
  })
}

async function write(proposal: PartitionRegion[], towns: Map<string, TownInput>) {
  const collisions = await nameCollisions(proposal)
  if (collisions.length) {
    console.error(`Refusing to write: new region names collide with existing regions: ${collisions.join(', ')}. Edit proposal.json to reuse the existing region id or rename.`)
    process.exit(1)
  }
  const plan = await buildPlan(proposal, towns)
  const touched = await prisma.$transaction(async (tx) => {
    const created: { id: string }[] = []
    for (const r of plan.newRegions) created.push(await tx.region.create({ data: { name: r.name, slug: r.slug, isActive: true }, select: { id: true } }))
    const idOf = (ref: { existingId: string } | { newIndex: number }) => ('existingId' in ref ? ref.existingId : created[ref.newIndex]!.id)
    for (const u of plan.townUpserts) {
      const regionId = idOf(u.region)
      await tx.regionTown.upsert({
        where: { townKey: u.townKey },
        update: { regionId, source: 'LLM' },
        create: { townKey: u.townKey, city: u.city, state: u.state, regionId, latitude: u.lat, longitude: u.lng, source: 'LLM' },
      })
    }
    const touchedIds = new Set<string>()
    for (const m of plan.venueMoves) {
      const regionId = idOf(m.region)
      await tx.venue.update({ where: { id: m.venueId }, data: { regionId, ...(m.newSlug ? { slug: m.newSlug } : {}) } })
      await tx.event.updateMany({ where: { venueId: m.venueId }, data: { regionId } })
      touchedIds.add(regionId)
      touchedIds.add(m.fromRegionId)
    }
    for (const c of created) touchedIds.add(c.id)
    return [...touchedIds]
  }, { timeout: 120_000 })
  await createPrismaRegionStore(prisma).recomputeRegionStats(touched)
  console.log(`Wrote ${plan.newRegions.length} new regions, ${plan.townUpserts.length} towns, ${plan.venueMoves.length} venue moves.`)
}

async function checked(regions: PartitionRegion[], towns: TownInput[]): Promise<PartitionRegion[]> {
  const all = await prisma.region.findMany({ select: { id: true, slug: true } })
  const holding = all.find(r => r.slug === HOLDING_REGION_SLUG)
  const result = checkProposal({
    regions,
    towns,
    holdingRegionId: holding?.id ?? '',
    existingRegionIds: new Set(all.map(r => r.id)),
  })
  if (!result.ok) {
    console.error(`Invalid proposal:\n  ${result.errors.join('\n  ')}`)
    process.exit(1)
  }
  return result.regions
}

async function main() {
  let towns: Map<string, TownInput>
  let proposal: PartitionRegion[]
  if (arg('--from')) {
    const file = JSON.parse(readFileSync(arg('--from')!, 'utf8')) as { regions: PartitionRegion[]; towns: TownInput[] }
    towns = new Map(file.towns.map(t => [t.townKey, t]))
    proposal = await checked(file.regions, file.towns)
  } else {
    towns = await loadTowns()
    proposal = await checked(await propose(towns), [...towns.values()])
    writeFileSync('proposal.json', JSON.stringify({ regions: proposal, towns: [...towns.values()] }, null, 2))
    console.log('Saved proposal.json')
  }
  await review(proposal, towns)
  if (flag('--write')) await write(proposal, towns)
  else {
    const defaultState = arg('--default-state')
    const hint = defaultState
      ? `npx tsx scripts/partition-regions.ts --from proposal.json --write --default-state ${defaultState}`
      : 'npx tsx scripts/partition-regions.ts --from proposal.json --write'
    console.log(`\nDry run. Edit proposal.json if needed, then: ${hint}`)
  }
}

main().finally(() => prisma.$disconnect())
