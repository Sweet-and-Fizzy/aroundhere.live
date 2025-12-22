/**
 * POST /api/scrapers/:sourceId/versions
 * Create a new version (manual edit)
 *
 * Body: {
 *   code: string
 *   description: string
 *   setActive?: boolean  // Immediately activate this version
 * }
 */

import { prisma } from '../../../../utils/prisma'
import { validateScraperCode } from '../../../../services/agent/validator'
import crypto from 'crypto'

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

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
    select: { id: true, role: true },
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

  const body = await readBody(event)
  const { code, description, setActive = false } = body

  // Validate input
  if (!code || typeof code !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Code is required and must be a string',
    })
  }

  if (code.length > 500000) { // 500KB limit
    throw createError({
      statusCode: 400,
      message: 'Code is too large (max 500KB)',
    })
  }

  if (!description || typeof description !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Description is required and must be a string',
    })
  }

  if (description.length > 1000) {
    throw createError({
      statusCode: 400,
      message: 'Description is too long (max 1000 characters)',
    })
  }

  try {
    // Verify source exists and is a scraper
    const source = await prisma.source.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        name: true,
        type: true,
        config: true,
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

    // Validate code safety
    const validation = validateScraperCode(code, 'event')
    if (!validation.isValid) {
      throw createError({
        statusCode: 400,
        message: `Code validation failed: ${validation.errors.join(', ')}`,
      })
    }

    // Calculate hash
    const codeHash = hashCode(code)

    // Check for duplicate code
    const existingWithHash = await prisma.scraperVersion.findFirst({
      where: {
        sourceId,
        codeHash,
      },
      select: {
        versionNumber: true,
      },
    })

    if (existingWithHash) {
      throw createError({
        statusCode: 400,
        message: `This code is identical to version ${existingWithHash.versionNumber}`,
      })
    }

    // Get next version number
    const lastVersion = await prisma.scraperVersion.findFirst({
      where: { sourceId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    })

    const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1

    // Use transaction to ensure atomicity
    const newVersion = await prisma.$transaction(async (tx) => {
      // If setActive, deactivate all other versions first
      if (setActive) {
        await tx.scraperVersion.updateMany({
          where: {
            sourceId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        })
      }

      // Create new version
      const version = await tx.scraperVersion.create({
        data: {
          sourceId,
          versionNumber: nextVersionNumber,
          code,
          codeHash,
          description,
          createdBy: user.id,
          createdFrom: 'MANUAL_EDIT',
          isActive: setActive,
        },
        select: {
          id: true,
          versionNumber: true,
          description: true,
          createdBy: true,
          createdFrom: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      // If activated, update source config
      if (setActive) {
        const config = (source.config as Record<string, unknown>) || {}
        await tx.source.update({
          where: { id: sourceId },
          data: {
            config: {
              ...config,
              generatedCode: code,
            },
          },
        })
      }

      return version
    })

    return {
      success: true,
      version: newVersion,
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Error creating scraper version:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to create scraper version',
    })
  }
})
