import type { PrismaClient } from '@prisma/client'
import { HOLDING_REGION_SLUG } from '../../utils/geo'
import type { RegionSummary } from './types'

export type NewTownRow = { townKey: string; city: string; state: string; regionId: string; latitude: number | null; longitude: number | null; source: 'SEED' | 'LLM' | 'ADMIN' }

export interface RegionStore {
  findTown(townKey: string): Promise<{ regionId: string } | null>
  insertTown(row: NewTownRow): Promise<void>
  listRegionsWithCentroids(): Promise<RegionSummary[]>
  getHoldingRegionId(): Promise<string>
  recomputeRegionStats(regionIds: string[]): Promise<void>
}

export function createPrismaRegionStore(prisma: PrismaClient): RegionStore {
  return {
    async findTown(townKey) {
      return prisma.regionTown.findUnique({ where: { townKey }, select: { regionId: true } })
    },
    async insertTown(row) {
      await prisma.regionTown.create({ data: row })
    },
    async listRegionsWithCentroids() {
      const regions = await prisma.region.findMany({
        where: { isActive: true, slug: { not: HOLDING_REGION_SLUG }, centroidLat: { not: null }, centroidLng: { not: null } },
        select: { id: true, name: true, centroidLat: true, centroidLng: true, towns: { select: { townKey: true }, take: 25, orderBy: { createdAt: 'asc' } } },
      })
      return regions.map(r => ({ id: r.id, name: r.name, centroidLat: r.centroidLat!, centroidLng: r.centroidLng!, towns: r.towns.map(t => t.townKey) }))
    },
    async getHoldingRegionId() {
      const region = await prisma.region.upsert({
        where: { slug: HOLDING_REGION_SLUG },
        update: {},
        create: { name: 'Other', slug: HOLDING_REGION_SLUG, isActive: true },
        select: { id: true },
      })
      return region.id
    },
    async recomputeRegionStats(regionIds) {
      for (const id of new Set(regionIds)) {
        const region = await prisma.region.findUnique({ where: { id }, select: { slug: true } })
        if (!region) continue
        const agg = await prisma.venue.aggregate({
          where: { regionId: id, isActive: true, latitude: { not: null }, longitude: { not: null } },
          _avg: { latitude: true, longitude: true },
        })
        const activeCount = await prisma.venue.count({ where: { regionId: id, isActive: true } })
        await prisma.region.update({
          where: { id },
          data: {
            centroidLat: agg._avg.latitude,
            centroidLng: agg._avg.longitude,
            isActive: region.slug === HOLDING_REGION_SLUG ? true : activeCount > 0,
          },
        })
      }
    },
  }
}
