import { resolveRegionForVenue, type ResolveDeps } from './resolve'
import { deriveVenueSlug } from './slug'
import { normalizeTownKey } from './town-key'

export type MaintenanceVenue = { id: string; name: string; slug: string; city: string | null; state: string | null; latitude: number | null; longitude: number | null }
export type MaintenanceIO = {
  listHoldingVenues(): Promise<MaintenanceVenue[]>
  venueSlugsInRegion(regionId: string): Promise<Set<string>>
  moveVenue(venueId: string, regionId: string, newSlug: string | null): Promise<void>
  allRegionIds(): Promise<string[]>
}
export type MaintenanceReport = { moved: { venue: string; regionId: string }[]; stillHolding: { venue: string; townKey: string | null }[]; failed: { venue: string; error: string }[] }

/** Weekly: place holding-region venues whose towns can now be assigned, then refresh region stats. Never creates regions. */
export async function runRegionMaintenance(deps: ResolveDeps & { io: MaintenanceIO }): Promise<MaintenanceReport> {
  const { io } = deps
  const report: MaintenanceReport = { moved: [], stillHolding: [], failed: [] }
  for (const venue of await io.listHoldingVenues()) {
    try {
      const result = await resolveRegionForVenue(deps, venue)
      const holdingId = await deps.store.getHoldingRegionId()
      if (result.via === 'holding' || result.regionId === holdingId) {
        report.stillHolding.push({ venue: venue.name, townKey: normalizeTownKey(venue.city, venue.state) })
        continue
      }
      const taken = await io.venueSlugsInRegion(result.regionId)
      const slug = deriveVenueSlug(venue.slug, taken)
      await io.moveVenue(venue.id, result.regionId, slug === venue.slug ? null : slug)
      report.moved.push({ venue: venue.name, regionId: result.regionId })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      report.failed.push({ venue: venue.name, error })
    }
  }
  await deps.store.recomputeRegionStats(await io.allRegionIds())
  return report
}

export function formatMaintenanceReport(r: MaintenanceReport): string {
  const lines = [`Regions maintenance: Moved ${r.moved.length} ${r.moved.length === 1 ? 'venue' : 'venues'} out of the holding region.`]
  if (r.stillHolding.length) {
    lines.push(`${r.stillHolding.length} ${r.stillHolding.length === 1 ? 'venue still needs' : 'venues still need'} a partition run:`)
    for (const h of r.stillHolding) lines.push(`• ${h.venue} (${h.townKey ?? 'no town key'})`)
  }
  if (r.failed.length) {
    lines.push(`${r.failed.length} ${r.failed.length === 1 ? 'venue' : 'venues'} failed:`)
    for (const f of r.failed) lines.push(`• ${f.venue}: ${f.error}`)
  }
  return lines.join('\n')
}
