import prisma from '../../../utils/prisma'
import { normalizeTownKey } from '../../../services/regions/town-key'
import { planTownReassign } from '../../../services/regions/reassign-plan'
import { createPrismaRegionStore } from '../../../services/regions/store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { regionId } = await readBody<{ regionId?: string }>(event)
  if (!regionId) throw createError({ statusCode: 400, message: 'regionId is required' })

  const town = await prisma.regionTown.findUnique({ where: { id } })
  if (!town) throw createError({ statusCode: 404, message: 'Town not found' })
  const target = await prisma.region.findUnique({ where: { id: regionId }, select: { id: true } })
  if (!target) throw createError({ statusCode: 400, message: 'Unknown region' })

  const candidates = await prisma.venue.findMany({ select: { id: true, name: true, slug: true, city: true, state: true, regionId: true } })
  const venues = candidates.filter(v => normalizeTownKey(v.city, v.state) === town.townKey && v.regionId !== regionId)
  const targetSlugs = new Set(candidates.filter(v => v.regionId === regionId).map(v => v.slug))
  const plan = planTownReassign({ venues, targetSlugs })
  if (!plan.ok) {
    throw createError({ statusCode: 409, message: `Slug already used in target region by: ${plan.conflicts.join(', ')}. Rename one venue first.` })
  }

  const venueIds = venues.map(v => v.id)
  await prisma.$transaction([
    prisma.regionTown.update({ where: { id }, data: { regionId, source: 'ADMIN' } }),
    prisma.venue.updateMany({ where: { id: { in: venueIds } }, data: { regionId } }),
    prisma.event.updateMany({ where: { venueId: { in: venueIds } }, data: { regionId } }),
  ])
  await createPrismaRegionStore(prisma).recomputeRegionStats([town.regionId, regionId])
  return { success: true, movedVenues: venueIds.length }
})
