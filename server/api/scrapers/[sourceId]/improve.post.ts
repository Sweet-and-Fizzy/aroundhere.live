/**
 * POST /api/scrapers/:sourceId/improve
 * Use AI to improve an existing scraper based on user feedback and test results
 */

import crypto from 'crypto'
import { prisma } from '../../../utils/prisma'
import { AgentService } from '../../../services/agent'

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
        .filter((f: any) => f.percentage < 100)
        .map((f: any) => f.field)
      if (missing.length > 0) {
        feedbackMessage = `${feedback}\n\nMissing or incomplete fields: ${missing.join(', ')}`
      }
    }

    // Use environment-configured LLM or fallback to default
    const llmProvider = (process.env.SCRAPER_LLM_PROVIDER || 'anthropic') as 'anthropic' | 'openai' | 'google' | 'deepseek'
    const llmModel = process.env.SCRAPER_LLM_MODEL || 'claude-sonnet-4-5-20250929'

    // Start AI generation in background
    const agentService = new AgentService()

    // Kick off generation in background (don't await completion)
    // The promise will handle version creation when complete
    const generationPromise = agentService.generateEventScraper({
      url: source.website,
      llmProvider,
      llmModel,
      maxIterations: 2,
      previousCode: code || undefined,
      userFeedback: feedbackMessage,
      venueInfo: {
        name: source.name,
        website: source.website,
      },
      sourceId, // Pass sourceId so AgentService can check for existing session
    })

    // Handle completion in background - create version when done
    generationPromise.then(async (result) => {
      if (result.success && result.generatedCode) {
        try {
          const lastVersion = await prisma.scraperVersion.findFirst({
            where: { sourceId },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
          })

          const nextVersionNumber = (lastVersion?.versionNumber ?? 0) + 1

          await prisma.scraperVersion.create({
            data: {
              sourceId,
              versionNumber: nextVersionNumber,
              code: result.generatedCode,
              codeHash: crypto.createHash('sha256').update(result.generatedCode).digest('hex'),
              description: `AI improvement: ${feedback.substring(0, 100)}`,
              createdBy: user.id,
              createdFrom: 'AI_GENERATED',
              agentSessionId: result.sessionId,
              isActive: false,
            },
          })
          console.log('[Improve] Created version', nextVersionNumber, 'for session', result.sessionId)
        } catch (error) {
          console.error('[Improve] Failed to create version:', error)
        }
      }
    }).catch((error) => {
      console.error('[Improve] Generation failed:', error)
    })

    // The AgentService creates/finds the session synchronously at the start
    // Give it a moment to initialize, then query for the session
    await new Promise(resolve => setTimeout(resolve, 100))

    const session = await prisma.agentSession.findFirst({
      where: {
        sourceId,
        sessionType: 'EVENT_SCRAPER',
        status: 'IN_PROGRESS',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })

    if (!session) {
      throw createError({
        statusCode: 500,
        message: 'Failed to create AI generation session',
      })
    }

    return {
      success: true,
      sessionId: session.id,
      message: 'AI generation started',
    }
  } catch (error: any) {
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
