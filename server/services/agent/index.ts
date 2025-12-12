/**
 * AI Agent Service
 * Generates scrapers iteratively using LLMs
 */

import { llmService } from '../llm'
import { prisma } from '../../utils/prisma'
import { validateScraperCode, extractCode } from './validator'
import { executeScraperCode, fetchPageHtml } from './executor'
import { evaluateVenueData, evaluateEventData } from './evaluator'
import {
  VENUE_SCRAPER_SYSTEM_PROMPT,
  EVENT_SCRAPER_SYSTEM_PROMPT,
  createVenueScraperUserPrompt,
  createEventScraperUserPrompt,
} from './prompts'
import type {
  ScraperGenerationOptions,
  ScraperGenerationResult,
  AgentThinkingStep,
  VenueInfo,
  FieldEvaluationResult,
} from './types'
import type { LLMProvider } from '../llm/types'
import crypto from 'crypto'

export * from './types'

export class AgentService {
  /**
   * Generate a venue information scraper
   */
  async generateVenueScraper(
    options: Omit<ScraperGenerationOptions, 'sessionType'>
  ): Promise<ScraperGenerationResult> {
    return this.generateScraper({ ...options, sessionType: 'VENUE_INFO' })
  }

  /**
   * Generate an event scraper
   */
  async generateEventScraper(
    options: Omit<ScraperGenerationOptions, 'sessionType'> & { venueInfo: VenueInfo }
  ): Promise<ScraperGenerationResult> {
    return this.generateScraper({ ...options, sessionType: 'EVENT_SCRAPER' })
  }

  /**
   * Main scraper generation loop
   */
  private async generateScraper(options: ScraperGenerationOptions): Promise<ScraperGenerationResult> {
    const {
      url,
      llmProvider,
      llmModel,
      maxIterations = 2,
      sessionType,
      venueInfo,
      userFeedback,
      previousCode,
      onThinking,
      onProgress,
    } = options

    const thinking: AgentThinkingStep[] = []

    // If no previousCode provided, look for best previous session for this URL
    let bestPreviousCode = previousCode
    if (!bestPreviousCode) {
      const bestPreviousSession = await prisma.agentSession.findFirst({
        where: {
          url,
          sessionType,
          status: { in: ['SUCCESS', 'APPROVED'] },
          generatedCode: { not: null },
        },
        orderBy: {
          completenessScore: 'desc',
        },
        select: {
          generatedCode: true,
          completenessScore: true,
        },
      })

      if (bestPreviousSession?.generatedCode) {
        bestPreviousCode = bestPreviousSession.generatedCode
        console.log(`[Agent] Found previous session with ${(bestPreviousSession.completenessScore * 100).toFixed(0)}% score, using as baseline`)
      }
    }

    // Get or create agent session in database
    let session = await prisma.agentSession.findFirst({
      where: {
        url,
        sessionType,
        llmProvider,
        llmModel,
        status: 'IN_PROGRESS',
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (!session) {
      session = await prisma.agentSession.create({
        data: {
          url,
          sessionType,
          llmProvider,
          llmModel,
          maxIterations,
          status: 'IN_PROGRESS',
        },
      })
    }

    // Define addThinking after session is created
    const addThinking = async (step: Omit<AgentThinkingStep, 'timestamp'>) => {
      const fullStep = { ...step, timestamp: new Date() }
      thinking.push(fullStep)
      onThinking?.(fullStep)

      // Save to database in real-time for SSE streaming
      try {
        await prisma.agentSession.update({
          where: { id: session.id },
          data: { thinking: JSON.parse(JSON.stringify(thinking)) },
        })
      } catch (error) {
        console.error('Failed to save thinking step:', error)
      }
    }

    console.log(`[Agent] Starting ${sessionType} generation for ${url}`)

    addThinking({
      type: 'analysis',
      message: `Starting ${sessionType === 'VENUE_INFO' ? 'venue information' : 'event'} scraper generation for ${url}`,
    })

    try {
      // Fetch page HTML for analysis
      console.log('[Agent] Fetching page HTML...')
      addThinking({
        type: 'analysis',
        message: 'Fetching page HTML to analyze structure...',
      })

      const pageHtml = await fetchPageHtml(url)
      console.log('[Agent] Page HTML fetched:', pageHtml ? `${pageHtml.length} bytes` : 'null')

      if (!pageHtml) {
        throw new Error('Failed to fetch page HTML. The URL may be invalid or inaccessible.')
      }

      addThinking({
        type: 'analysis',
        message: `Successfully fetched page HTML (${Math.round(pageHtml.length / 1024)}KB)`,
      })

      // Iterative generation loop
      let bestCode: string | undefined = undefined
      let bestScore: number = 0
      let bestData: VenueInfo | Record<string, unknown>[] | null = null
      let bestEvaluation: FieldEvaluationResult | null = null
      let lastError: string | null = null // Track last error to provide feedback
      let detailPageHtml: { url: string; html: string } | undefined = undefined // Sample detail page for event scrapers

      for (let attempt = 1; attempt <= maxIterations; attempt++) {
        onProgress?.(attempt, maxIterations)

        addThinking({
          type: 'planning',
          message: `Iteration ${attempt}/${maxIterations}: Generating scraper code...`,
        })

        // Generate code - include previous errors as feedback
        let previousFeedback: { code: string; feedback: string } | undefined
        if (attempt > 1) {
          if (lastError) {
            // If last attempt had an error (syntax/execution), tell the LLM
            previousFeedback = {
              code: bestCode || '',
              feedback: `Previous attempt failed with error: ${lastError}. Please fix this issue and generate valid JavaScript code.`,
            }
          } else if (bestCode && bestEvaluation) {
            // If we have working code but incomplete data
            previousFeedback = {
              code: bestCode,
              feedback: `Previous attempt scored ${(bestScore * 100).toFixed(0)}%. ${bestEvaluation.feedback} Focus on extracting the missing required fields: ${bestEvaluation.requiredFieldsMissing.join(', ')}. Try different CSS selectors, check for JSON-LD structured data, or parse address text.`,
            }
          }
        }

        // On first attempt with existing scraper code, use it as the "previous attempt"
        const attemptToUse = previousFeedback ?? (attempt === 1 && bestPreviousCode ? {
          code: bestPreviousCode,
          feedback: userFeedback || 'This is the best previous scraper for this URL. Improve it or use it as a reference for the new implementation.',
        } : undefined)

        const codeResult = await this.generateCode({
          sessionType,
          url,
          pageHtml,
          venueInfo,
          llmProvider,
          llmModel,
          userFeedback: previousFeedback ? undefined : userFeedback, // Only pass userFeedback on first attempt
          previousAttempt: attemptToUse,
          detailPageHtml,
        })

        if (!codeResult.success || !codeResult.code) {
          console.log('[Agent] Code generation failed:', codeResult.error)
          addThinking({
            type: 'code_generation',
            message: `Failed to generate code: ${codeResult.error}`,
          })
          continue
        }

        const generatedCode = codeResult.code
        console.log('[Agent] Code generated, length:', generatedCode.length)

        addThinking({
          type: 'code_generation',
          message: 'Code generated successfully',
          data: { codeLength: generatedCode.length },
        })

        // Validate code safety
        addThinking({
          type: 'evaluation',
          message: 'Validating code safety...',
        })

        const validation = validateScraperCode(
          generatedCode,
          sessionType === 'VENUE_INFO' ? 'venue' : 'event'
        )

        if (!validation.isValid) {
          console.log('[Agent] Validation failed:', validation.errors)
          lastError = validation.errors.join(', ')
          // Save the broken code so we can show it to the LLM for fixing
          if (!bestCode) {
            bestCode = generatedCode
          }
          addThinking({
            type: 'evaluation',
            message: `Code validation failed: ${lastError}`,
          })
          continue
        }

        // Clear last error if validation passed
        lastError = null

        if (validation.warnings.length > 0) {
          addThinking({
            type: 'evaluation',
            message: `Warnings: ${validation.warnings.join(', ')}`,
          })
        }

        // Execute code
        addThinking({
          type: 'execution',
          message: 'Executing scraper code...',
        })

        const timezone = venueInfo?.city && venueInfo?.state
          ? this.guessTimezone(venueInfo.state)
          : 'America/New_York'

        console.log('[Agent] Executing scraper code...')
        const execution = await executeScraperCode(generatedCode, url, timezone, 120000)
        console.log('[Agent] Execution result:', execution.success ? 'success' : 'failed', execution.error || '')

        // Save attempt to database
        const codeHash = crypto.createHash('md5').update(generatedCode).digest('hex')

        if (!execution.success) {
          console.log('[Agent] Execution failed:', execution.error)
          addThinking({
            type: 'execution',
            message: `Execution failed: ${execution.error}`,
          })

          await prisma.scraperAttempt.create({
            data: {
              sessionId: session.id,
              attemptNumber: attempt,
              generatedCode,
              codeHash,
              executionStatus: 'ERROR',
              executionError: execution.error,
              executionTime: execution.executionTime,
              fieldsFound: [],
              fieldsMissing: [],
              completenessScore: 0,
              htmlSnapshots: {
                listing: pageHtml.substring(0, 200000), // Truncate to ~200KB for storage
              },
            },
          })

          continue
        }

        addThinking({
          type: 'execution',
          message: `Execution succeeded in ${execution.executionTime}ms`,
          data: {
            preview: sessionType === 'VENUE_INFO' ? execution.data : { eventCount: execution.data?.length || 0 }
          },
        })

        // Evaluate results
        addThinking({
          type: 'evaluation',
          message: 'Evaluating extracted data...',
        })

        const evaluation = sessionType === 'VENUE_INFO'
          ? evaluateVenueData(execution.data)
          : evaluateEventData(execution.data)

        addThinking({
          type: 'evaluation',
          message: `Completeness: ${(evaluation.completenessScore * 100).toFixed(0)}%. ${evaluation.feedback}`,
          data: {
            fieldsFound: evaluation.fieldsFound,
            fieldsMissing: evaluation.fieldsMissing,
          },
        })

        // For event scrapers, try to fetch a sample detail page if we don't have one yet
        // This helps the LLM understand what additional data is available on detail pages
        if (sessionType === 'EVENT_SCRAPER' && !detailPageHtml && Array.isArray(execution.data)) {
          // Find an event with a sourceUrl that's different from the listing page
          // and on the same domain (to avoid external ticket sites)
          const listingDomain = new URL(url).hostname
          const eventWithDetailUrl = execution.data.find((event: Record<string, unknown>) => {
            if (!event.sourceUrl || event.sourceUrl === url) return false
            try {
              const eventDomain = new URL(event.sourceUrl).hostname
              return eventDomain === listingDomain
            } catch {
              return false
            }
          })

          if (eventWithDetailUrl?.sourceUrl) {
            addThinking({
              type: 'analysis',
              message: `Fetching sample event detail page: ${eventWithDetailUrl.sourceUrl}`,
            })

            try {
              const detailHtml = await fetchPageHtml(eventWithDetailUrl.sourceUrl)
              if (detailHtml) {
                detailPageHtml = {
                  url: eventWithDetailUrl.sourceUrl,
                  html: detailHtml,
                }
                addThinking({
                  type: 'analysis',
                  message: `Fetched detail page (${Math.round(detailHtml.length / 1024)}KB) - will include in next iteration`,
                })
              }
            } catch (error) {
              console.log('[Agent] Failed to fetch detail page:', error)
            }
          }
        }

        // Save attempt
        await prisma.scraperAttempt.create({
          data: {
            sessionId: session.id,
            attemptNumber: attempt,
            generatedCode,
            codeHash,
            executionStatus: 'SUCCESS',
            executionTime: execution.executionTime,
            scrapedData: execution.data,
            fieldsFound: evaluation.fieldsFound,
            fieldsMissing: evaluation.fieldsMissing,
            completenessScore: evaluation.completenessScore,
            htmlSnapshots: {
              listing: pageHtml.substring(0, 200000), // Truncate to ~200KB for storage
            },
          },
        })

        // Track best result
        if (evaluation.completenessScore > bestScore) {
          bestScore = evaluation.completenessScore
          bestCode = generatedCode
          bestData = execution.data
          bestEvaluation = evaluation

          // Update session with current best data for real-time preview
          await prisma.agentSession.update({
            where: { id: session.id },
            data: {
              venueData: sessionType === 'VENUE_INFO' ? (bestData ?? undefined) : undefined,
              eventData: sessionType === 'EVENT_SCRAPER' ? (bestData ?? undefined) : undefined,
              completenessScore: bestScore,
            },
          })
        }

        // Check if acceptable
        if (evaluation.isAcceptable) {
          addThinking({
            type: 'success',
            message: `✓ Successfully generated scraper! All required fields extracted.`,
          })

          // Update session as successful
          await prisma.agentSession.update({
            where: { id: session.id },
            data: {
              status: 'SUCCESS',
              currentIteration: attempt,
              generatedCode: bestCode,
              venueData: sessionType === 'VENUE_INFO' ? (bestData ?? undefined) : undefined,
              eventData: sessionType === 'EVENT_SCRAPER' ? (bestData ?? undefined) : undefined,
              completenessScore: bestScore,
              thinking: JSON.parse(JSON.stringify(thinking)),
              completedAt: new Date(),
            },
          })

          return {
            success: true,
            sessionId: session.id,
            generatedCode: bestCode,
            venueData: sessionType === 'VENUE_INFO' ? (bestData ?? undefined) : undefined,
            eventData: sessionType === 'EVENT_SCRAPER' ? (bestData ?? undefined) : undefined,
            completenessScore: bestScore,
            thinking,
          }
        }

        // Continue iterating
        addThinking({
          type: 'improvement',
          message: `Iteration ${attempt} complete. Attempting to improve...`,
        })
      }

      // Max iterations reached
      if (bestCode && bestScore > 0) {
        addThinking({
          type: 'success',
          message: `Reached max iterations. Best result: ${(bestScore * 100).toFixed(0)}% completeness`,
        })

        await prisma.agentSession.update({
          where: { id: session.id },
          data: {
            status: 'SUCCESS',
            currentIteration: maxIterations,
            generatedCode: bestCode,
            venueData: sessionType === 'VENUE_INFO' ? (bestData ?? undefined) : undefined,
            eventData: sessionType === 'EVENT_SCRAPER' ? (bestData ?? undefined) : undefined,
            completenessScore: bestScore,
            thinking: JSON.parse(JSON.stringify(thinking)),
            completedAt: new Date(),
          },
        })

        return {
          success: true,
          sessionId: session.id,
          generatedCode: bestCode,
          venueData: sessionType === 'VENUE_INFO' ? (bestData ?? undefined) : undefined,
          eventData: sessionType === 'EVENT_SCRAPER' ? (bestData ?? undefined) : undefined,
          completenessScore: bestScore,
          thinking,
        }
      }

      // Failed to generate working scraper
      addThinking({
        type: 'failure',
        message: 'Failed to generate a working scraper after all iterations',
      })

      await prisma.agentSession.update({
        where: { id: session.id },
        data: {
          status: 'FAILED',
          currentIteration: maxIterations,
          errorMessage: 'Failed to generate acceptable scraper',
          thinking: JSON.parse(JSON.stringify(thinking)),
          completedAt: new Date(),
        },
      })

      return {
        success: false,
        sessionId: session.id,
        thinking,
        errorMessage: 'Failed to generate acceptable scraper after all iterations',
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      addThinking({
        type: 'failure',
        message: `Fatal error: ${errorMessage}`,
      })

      await prisma.agentSession.update({
        where: { id: session.id },
        data: {
          status: 'FAILED',
          errorMessage,
          thinking: JSON.parse(JSON.stringify(thinking)),
          completedAt: new Date(),
        },
      })

      return {
        success: false,
        sessionId: session.id,
        thinking,
        errorMessage,
      }
    }
  }

  /**
   * Generate code using LLM
   */
  private async generateCode(params: {
    sessionType: 'VENUE_INFO' | 'EVENT_SCRAPER'
    url: string
    pageHtml: string
    venueInfo?: VenueInfo
    llmProvider: string
    llmModel: string
    previousAttempt?: { code: string; feedback: string }
    userFeedback?: string
    detailPageHtml?: { url: string; html: string }
  }): Promise<{ success: boolean; code?: string; error?: string }> {
    const { sessionType, url, pageHtml, venueInfo, llmProvider, llmModel, previousAttempt, userFeedback, detailPageHtml } = params

    try {
      const systemPrompt =
        sessionType === 'VENUE_INFO' ? VENUE_SCRAPER_SYSTEM_PROMPT : EVENT_SCRAPER_SYSTEM_PROMPT

      let userPrompt =
        sessionType === 'VENUE_INFO'
          ? createVenueScraperUserPrompt(url, pageHtml, previousAttempt)
          : createEventScraperUserPrompt(url, venueInfo!, 'America/New_York', pageHtml, previousAttempt, detailPageHtml)

      // Add user feedback if provided
      if (userFeedback) {
        userPrompt += `\n\n## IMPORTANT USER FEEDBACK\nThe user has provided the following feedback from a previous attempt. Please incorporate this guidance:\n\n${userFeedback}\n`
      }

      const response = await llmService.complete({
        provider: llmProvider as LLMProvider,
        model: llmModel,
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt,
        temperature: 0.3, // Lower temperature for more deterministic code generation
        maxTokens: 8000,
      })

      const code = extractCode(response.content)
      return { success: true, code }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Guess timezone based on US state
   */
  private guessTimezone(state: string): string {
    const stateUpper = state.toUpperCase()

    // Eastern
    if (['MA', 'NY', 'PA', 'VT', 'NH', 'ME', 'CT', 'RI', 'NJ', 'DE', 'MD', 'VA', 'WV', 'NC', 'SC', 'GA', 'FL', 'OH', 'MI', 'IN', 'KY', 'TN'].includes(stateUpper)) {
      return 'America/New_York'
    }

    // Central
    if (['IL', 'WI', 'MN', 'IA', 'MO', 'AR', 'LA', 'MS', 'AL', 'ND', 'SD', 'NE', 'KS', 'OK', 'TX'].includes(stateUpper)) {
      return 'America/Chicago'
    }

    // Mountain
    if (['MT', 'WY', 'CO', 'NM', 'ID', 'UT', 'AZ'].includes(stateUpper)) {
      return 'America/Denver'
    }

    // Pacific
    if (['CA', 'OR', 'WA', 'NV'].includes(stateUpper)) {
      return 'America/Los_Angeles'
    }

    // Alaska
    if (stateUpper === 'AK') {
      return 'America/Anchorage'
    }

    // Hawaii
    if (stateUpper === 'HI') {
      return 'Pacific/Honolulu'
    }

    // Default to Eastern
    return 'America/New_York'
  }
}

// Singleton instance
const globalForAgent = globalThis as unknown as {
  agentService: AgentService | undefined
}

export const agentService = globalForAgent.agentService ?? new AgentService()

if (process.env.NODE_ENV !== 'production') {
  globalForAgent.agentService = agentService
}

export default agentService
