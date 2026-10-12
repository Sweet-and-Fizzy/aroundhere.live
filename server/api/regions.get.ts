/**
 * Get available regions
 * GET /api/regions
 */

import prisma from '../utils/prisma'
import { HOLDING_REGION_SLUG } from '../utils/geo'

export default defineEventHandler(async () => {
  const regions = await prisma.region.findMany({
    where: {
      isActive: true,
      slug: { not: HOLDING_REGION_SLUG },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
    },
    orderBy: {
      name: 'asc',
    },
  })

  return {
    regions,
  }
})
