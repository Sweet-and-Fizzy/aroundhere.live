/**
 * GET /api/scrapers/list
 * List all scrapers with AI-generated code
 */

import { prisma } from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  // Check authentication
  const session = await getUserSession(event)
  if (!session?.user?.email) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    })
  }

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  })

  if (!user || user.role !== 'ADMIN') {
    throw createError({
      statusCode: 403,
      message: 'Forbidden: Admin access required',
    })
  }

  try {
    const sources = await prisma.source.findMany({
      where: {
        type: 'SCRAPER',
      },
      select: {
        id: true,
        name: true,
        website: true,
        lastRunAt: true,
        lastRunStatus: true,
        isActive: true,
        config: true,
        scraperVersions: {
          where: {
            isActive: true,
          },
          select: {
            versionNumber: true,
          },
          take: 1,
        },
      },
      orderBy: {
        name: 'asc',
      },
    })

    return {
      scrapers: sources.map(s => ({
        id: s.id,
        name: s.name,
        website: s.website,
        lastRunAt: s.lastRunAt,
        lastRunStatus: s.lastRunStatus,
        isActive: s.isActive,
        hasCode: !!(s.config as Record<string, unknown>)?.generatedCode,
        activeVersion: s.scraperVersions[0]?.versionNumber ?? null,
      })),
    }
  } catch (error) {
    console.error('Error listing scrapers:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to list scrapers',
    })
  }
})
