/**
 * POST /api/scrapers/:sourceId/improve
 * Use AI to improve an existing scraper based on user feedback and test results
 */

import { prisma } from '../../../utils/prisma'
import { addScraperJob } from '../../../queues/scraper'

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
  const { code, testResults, feedback } = body

  if (!feedback || typeof feedback !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Feedback is required',
    })
  }

  try {
    // Get source info
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

    if (!source.website) {
      throw createError({
        statusCode: 400,
        message: 'Source has no website URL',
      })
    }

    // Build feedback message including test results
    let feedbackMessage = feedback
    if (testResults?.success === false && testResults?.error) {
      feedbackMessage = `${feedback}\n\nPrevious test error: ${testResults.error}`
    } else if (testResults?.fieldsAnalysis) {
      const missing = testResults.fieldsAnalysis.coverage
        .filter((f: { percentage: number }) => f.percentage < 100)
        .map((f: { field: string }) => f.field)
      if (missing.length > 0) {
        feedbackMessage = `${feedback}\n\nMissing or incomplete fields: ${missing.join(', ')}`
      }
    }

    // Use environment-configured LLM or fallback to default
    const llmProvider = process.env.SCRAPER_LLM_PROVIDER || 'anthropic'
    const llmModel = process.env.SCRAPER_LLM_MODEL || 'claude-sonnet-4-5-20250929'

    // Create agent session first
    const agentSession = await prisma.agentSession.create({
      data: {
        url: source.website,
        sessionType: 'EVENT_SCRAPER',
        llmProvider,
        llmModel,
        maxIterations: 2,
        status: 'IN_PROGRESS',
        sourceId,
      },
    })

    // Add job to queue - worker will process it
    await addScraperJob({
      type: 'improve-scraper',
      sourceId,
      sessionId: agentSession.id,
      url: source.website,
      llmProvider,
      llmModel,
      maxIterations: 2,
      venueInfo: {
        name: source.name,
        website: source.website,
      },
      code: code || undefined,
      userFeedback: feedbackMessage,
      userId: user.id,
    })

    console.log(`[Improve] Queued job for session ${agentSession.id}`)

    return {
      success: true,
      sessionId: agentSession.id,
      message: 'AI generation queued',
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Error improving scraper with AI:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to improve scraper',
    })
  }
})
