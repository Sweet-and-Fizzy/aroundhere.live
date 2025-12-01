/**
 * Get available regions
 * GET /api/regions
 */

import prisma from '../utils/prisma'

export default defineEventHandler(async () => {
  const regions = await prisma.region.findMany({
    where: {
      isActive: true,
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
