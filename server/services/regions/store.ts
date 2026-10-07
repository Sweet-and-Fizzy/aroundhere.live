import type { PrismaClient } from '@prisma/client'
import { HOLDING_REGION_SLUG } from '../../utils/geo'
import type { RegionSummary } from './types'

export interface RegionStore {
  listRegionsWithCentroids(): Promise<RegionSummary[]>
  getHoldingRegionId(): Promise<string>
}

export function createPrismaRegionStore(prisma: PrismaClient): RegionStore {
  return {
    async listRegionsWithCentroids() {
      const regions = await prisma.region.findMany({
        where: { isActive: true, slug: { not: HOLDING_REGION_SLUG }, centroidLat: { not: null }, centroidLng: { not: null } },
        select: { id: true, name: true, centroidLat: true, centroidLng: true },
      })
      return regions.map(r => ({ id: r.id, name: r.name, centroidLat: r.centroidLat!, centroidLng: r.centroidLng!, towns: [] }))
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
  }
}
