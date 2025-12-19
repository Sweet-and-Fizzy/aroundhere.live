/**
 * GET /api/scrapers/:sourceId/versions
 * List all versions for a scraper source
 *
 * Returns version history with metadata and test results
 */

import { prisma } from '../../../../utils/prisma'

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

  const sourceId = getRouterParam(event, 'sourceId')
  if (!sourceId) {
    throw createError({
      statusCode: 400,
      message: 'Source ID is required',
    })
  }

  try {
    // Get source
    const source = await prisma.source.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        name: true,
        website: true,
        type: true,
      },
    })

    if (!source) {
      throw createError({
        statusCode: 404,
        message: 'Source not found',
      })
    }

    if (source.type !== 'SCRAPER') {
      throw createError({
        statusCode: 400,
        message: 'Source is not a scraper',
      })
    }

    // Get all versions
    const versions = await prisma.scraperVersion.findMany({
      where: { sourceId },
      select: {
        id: true,
        versionNumber: true,
        description: true,
        createdBy: true,
        createdFrom: true,
        agentSessionId: true,
        lastTestedAt: true,
        testResults: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        codeHash: true,
      },
      orderBy: {
        versionNumber: 'desc', // Latest first
      },
    })

    // Find active version
    const activeVersion = versions.find(v => v.isActive)

    return {
      source: {
        id: source.id,
        name: source.name,
        website: source.website,
      },
      versions: versions.map(v => ({
        id: v.id,
        versionNumber: v.versionNumber,
        description: v.description,
        createdBy: v.createdBy,
        createdFrom: v.createdFrom,
        agentSessionId: v.agentSessionId,
        lastTestedAt: v.lastTestedAt,
        testResults: v.testResults as unknown, // JSON type
        isActive: v.isActive,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        codeHash: v.codeHash,
      })),
      activeVersionNumber: activeVersion?.versionNumber ?? null,
      totalVersions: versions.length,
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Error fetching scraper versions:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch scraper versions',
    })
  }
})
