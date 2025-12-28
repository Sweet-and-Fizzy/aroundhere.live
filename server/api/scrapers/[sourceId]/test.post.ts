/**
 * POST /api/scrapers/:sourceId/test
 * Test/preview a scraper version without saving to database
 *
 * Body: {
 *   versionId?: string  // Test specific version
 *   code?: string       // Test unsaved code from editor
 * }
 */

import { prisma } from '../../../utils/prisma'
import { executeScraperCode } from '../../../services/agent/executor'
import { validateScraperCode } from '../../../services/agent/validator'
import { analyzeEventFields, getSampleEvents } from '../../../utils/scraper-analysis'

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

  const body = await readBody(event)
  const { versionId, code: providedCode } = body

  try {
    // Get source
    const source = await prisma.source.findUnique({
      where: { id: sourceId },
      select: {
        id: true,
        name: true,
        type: true,
        website: true,
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

    if (!source.website) {
      throw createError({
        statusCode: 400,
        message: 'Source does not have a website URL configured',
      })
    }

    // Determine which code to test
    let testCode: string

    if (providedCode) {
      // Testing unsaved code from editor
      testCode = providedCode
    } else if (versionId) {
      // Testing specific version
      const version = await prisma.scraperVersion.findUnique({
        where: { id: versionId },
        select: {
          code: true,
          sourceId: true,
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

      testCode = version.code
    } else {
      // Test active version (from config)
      const config = source.config as Record<string, unknown>
      if (!config?.generatedCode) {
        throw createError({
          statusCode: 400,
          message: 'No active scraper code found for this source',
        })
      }
      testCode = config.generatedCode as string
    }

    // Validate code safety
    const validation = validateScraperCode(testCode, 'event')
    if (!validation.isValid) {
      return {
        success: false,
        error: `Code validation failed: ${validation.errors.join(', ')}`,
        executionTime: 0,
      }
    }

    // Execute scraper
    const startTime = Date.now()
    const execResult = await executeScraperCode(
      testCode,
      source.website,
      'America/New_York', // TODO: Get from venue/region
      180000 // 3 minute timeout for testing
    )

    const executionTime = Date.now() - startTime

    if (!execResult.success) {
      return {
        success: false,
        error: execResult.error,
        executionTime: execResult.executionTime,
      }
    }

    const events = (execResult.data as Array<Record<string, unknown>>) || []

    // Analyze results
    const fieldsAnalysis = analyzeEventFields(events as Parameters<typeof analyzeEventFields>[0])
    const sampleEvents = getSampleEvents(events as Parameters<typeof getSampleEvents>[0], 50) // First 50 for preview

    return {
      success: true,
      executionTime,
      eventCount: events.length,
      events: sampleEvents,
      fieldsAnalysis: {
        coverage: Object.values(fieldsAnalysis.coverage),
        completenessScore: fieldsAnalysis.completenessScore,
        requiredFieldsCoverage: fieldsAnalysis.requiredFieldsCoverage,
        optionalFieldsCoverage: fieldsAnalysis.optionalFieldsCoverage,
      },
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }

    console.error('Error testing scraper:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to test scraper',
    })
  }
})
