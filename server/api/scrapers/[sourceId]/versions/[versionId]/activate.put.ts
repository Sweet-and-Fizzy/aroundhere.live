/**
 * PUT /api/scrapers/:sourceId/versions/:versionId/activate
 * Activate a specific version (make it the active/production version)
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
    // Get the version to activate
    const version = await prisma.scraperVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        sourceId: true,
        versionNumber: true,
        code: true,
        isActive: true,
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

    if (version.isActive) {
      return {
        success: true,
        message: 'Version is already active',
        version: {
          id: version.id,
          versionNumber: version.versionNumber,
          isActive: true,
        },
      }
    }

    // Get source to update config
    const source = await prisma.source.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        config: true,
      },
    })

    if (!source) {
      throw createError({
        statusCode: 404,
        message: 'Source not found',
      })
    }

    // Use transaction to ensure consistency
    await prisma.$transaction(async (tx) => {
      // Deactivate all versions for this source
      await tx.scraperVersion.updateMany({
        where: {
          sourceId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      })

      // Activate the target version
      await tx.scraperVersion.update({
        where: { id: versionId },
        data: {
          isActive: true,
          updatedAt: new Date(),
        },
      })

      // Update source config with the new code
      const config = (source.config as Record<string, unknown>) || {}
      await tx.source.update({
        where: { id: sourceId },
        data: {
          config: {
            ...config,
            generatedCode: version.code,
          },
        },
      })
    })

    return {
      success: true,
      message: `Version ${version.versionNumber} activated successfully`,
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        isActive: true,
      },
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Error activating version:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to activate version',
    })
  }
})
