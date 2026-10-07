/**
 * Weekly region maintenance. POST /api/cron/regions-maintenance?token=$CRON_SECRET
 */
import prisma from '../../utils/prisma'
import { verifyCronAuth } from '../../utils/cron-auth'
import { llmService } from '../../services/llm'
import { sendSlackNotification } from '../../services/notifications'
import { createPrismaRegionStore } from '../../services/regions/store'
import { runRegionMaintenance, formatMaintenanceReport } from '../../services/regions/maintenance'
import { HOLDING_REGION_SLUG } from '../../utils/geo'

export default defineEventHandler(async (event) => {
  verifyCronAuth(event)
  const report = await runRegionMaintenance({
    store: createPrismaRegionStore(prisma),
    llm: llmService,
    io: {
      listHoldingVenues: () => prisma.venue.findMany({
        where: { isActive: true, region: { slug: HOLDING_REGION_SLUG } },
        select: { id: true, name: true, slug: true, city: true, state: true, latitude: true, longitude: true },
      }),
      venueSlugsInRegion: async regionId => new Set((await prisma.venue.findMany({ where: { regionId }, select: { slug: true } })).map(v => v.slug)),
      moveVenue: async (venueId, regionId, newSlug) => {
        await prisma.$transaction([
          prisma.venue.update({ where: { id: venueId }, data: { regionId, ...(newSlug ? { slug: newSlug } : {}) } }),
          prisma.event.updateMany({ where: { venueId }, data: { regionId } }),
        ])
      },
      allRegionIds: async () => (await prisma.region.findMany({ select: { id: true } })).map(r => r.id),
    },
  })
  if (report.moved.length || report.stillHolding.length) {
    await sendSlackNotification(formatMaintenanceReport(report))
  }
  return { success: true, ...report }
})
