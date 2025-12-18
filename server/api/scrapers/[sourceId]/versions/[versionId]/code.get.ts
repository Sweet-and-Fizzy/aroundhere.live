/**
 * GET /api/scrapers/:sourceId/versions/:versionId/code
 * Get the code for a specific version
 */

import { prisma } from '../../../../../utils/prisma'

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
  const versionId = getRouterParam(event, 'versionId')

  if (!sourceId || !versionId) {
    throw createError({
      statusCode: 400,
      message: 'Source ID and Version ID are required',
    })
  }

  try {
    const version = await prisma.scraperVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        sourceId: true,
        versionNumber: true,
        code: true,
        description: true,
        createdBy: true,
        createdFrom: true,
        agentSessionId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!version) {
      throw createError({
        statusCode: 404,
        message: 'Version not found',
      })
    }

    if (version.sourceId !== sourceId) {
      throw createError({
        statusCode: 400,
        message: 'Version does not belong to this source',
      })
    }

    return {
      id: version.id,
      versionNumber: version.versionNumber,
      code: version.code,
      description: version.description,
      createdBy: version.createdBy,
      createdFrom: version.createdFrom,
      agentSessionId: version.agentSessionId,
      isActive: version.isActive,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }

    console.error('Error fetching version code:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch version code',
    })
  }
})
