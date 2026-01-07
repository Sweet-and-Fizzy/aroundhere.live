import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { generateText, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { getRequestIP } from 'h3'
import prisma from '../utils/prisma'
import { calculateCost, CHAT_MODEL } from '../utils/llm-cost'
import { createChatTools } from '../mcp/tools'
import { validateConversation, sanitizeMessages } from '../utils/chat-validation'
import { getChatSystemPrompt } from '../utils/chat-system-prompt'
import {
  notifyChatThresholdAlert,
  notifyChatQualitySample,
} from '../services/notifications'
import { shouldSendAlert, buildAlertKey } from '../utils/alert-dedup'

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  sessionId?: string
  regionName?: string
  timezone?: string
}

// Chat thresholds for alerting
// Based on Claude Sonnet 4 pricing: $3/1M input, $15/1M output
// Typical chat with ~2K input + ~500 output tokens = ~$0.0135
const THRESHOLDS = {
  SINGLE_CHAT_COST_WARNING: 0.03, // $0.03 per chat (~2x typical)
  SINGLE_CHAT_COST_CRITICAL: 0.10, // $0.10 per chat (unusually expensive)
  DAILY_COST_WARNING: 1.0, // $1 per day (~75 typical chats)
  DAILY_COST_CRITICAL: 5.0, // $5 per day (~370 typical chats)
  SESSION_COUNT_WARNING: 15, // 15+ messages in one session (potential abuse)
  LATENCY_WARNING_MS: 15000, // 15 seconds
  QUALITY_SAMPLE_RATE: 0.1, // Sample 10% of chats for quality review
}

export default defineEventHandler(async (event) => {
  // Use parsedBody from middleware if available (to avoid reading body twice)
  const body = event.context.parsedBody || await readBody<ChatRequest>(event)
  const { messages, sessionId: providedSessionId, regionName, timezone } = body

  // Get IP address for rate limiting and logging
  const ipAddress = getRequestIP(event, { xForwardedFor: true }) || 'unknown'

  // Get user session for personalized tools (optional - chat works for anonymous users too)
  const session = await getUserSession(event)
  const userId = session?.user?.id as string | undefined
  const isLoggedIn = !!userId

  // Create tools with user context for personalized features
  const tools = createChatTools(userId)

  if (!messages || messages.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Messages are required',
    })
  }

  // Validate conversation for prompt injection and other abuse
  const validation = validateConversation(messages)
  if (!validation.valid) {
    // Log validation failure for observability (non-blocking)
    const userMessage = messages[messages.length - 1]?.content || ''
    logValidationFailure(providedSessionId || 'anonymous', userMessage, validation.error || 'Unknown', ipAddress).catch((err) => {
      console.error('Failed to log validation failure:', err)
    })

    throw createError({
      statusCode: 400,
      statusMessage: validation.error || 'Invalid message content',
    })
  }

  // Sanitize messages to remove control characters
  const cleanMessages = sanitizeMessages(messages)

  const sessionId = providedSessionId || randomUUID()
  const startTime = Date.now()

  try {
    // Use AI SDK's generateText with tools
    // AI SDK 5 uses stopWhen instead of maxSteps for multi-step tool calls
    const result = await generateText({
      model: anthropic(CHAT_MODEL),
      system: getChatSystemPrompt(regionName, isLoggedIn, timezone),
      messages: cleanMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      tools,
      stopWhen: stepCountIs(5), // Allow up to 5 steps for tool calls and follow-up
      toolChoice: 'auto', // Let the model decide when to use tools
    })

    // Debug: log step details (development only)
    if (process.env.NODE_ENV === 'development') {
      console.log('Chat result steps:', result.steps?.length ?? 0)
      result.steps?.forEach((step, i) => {
        console.log(`Step ${i}:`, {
          text: step.text?.substring(0, 100),
          toolCalls: step.toolCalls?.map(tc => tc.toolName),
          toolResultsCount: step.toolResults?.length ?? 0,
          finishReason: step.finishReason,
        })
      })
    }

    const responseText = result.text || 'Sorry, I could not generate a response.'
    const latencyMs = Date.now() - startTime

    // Extract token usage from result (AI SDK v4 uses different property names)
    const usage = result.usage as { promptTokens?: number; completionTokens?: number } | undefined
    const inputTokens = usage?.promptTokens || 0
    const outputTokens = usage?.completionTokens || 0
    const estimatedCost = calculateCost(CHAT_MODEL, inputTokens, outputTokens)

    // Extract tool usage info
    const toolsUsed = (result.steps ?? [])
      .flatMap((step) => (step.toolCalls ?? []).map((tc) => tc.toolName))
      .filter(Boolean)
    const toolInputs = (result.steps ?? [])
      .flatMap((step) => (step.toolCalls ?? []).map((tc) => ({ tool: tc.toolName, input: (tc as { input?: unknown }).input })))
      .filter((ti) => ti.tool)

    // Log to database (non-blocking)
    const userMessage = cleanMessages[cleanMessages.length - 1]?.content || ''
    prisma.chatLog
      .create({
        data: {
          sessionId,
          ipAddress,
          userMessage,
          conversationLength: messages.length,
          inputTokens,
          outputTokens,
          estimatedCostUsd: estimatedCost,
          llmCallsCount: result.steps?.length ?? 1,
          model: CHAT_MODEL,
          toolsUsed,
          toolInputs: toolInputs as unknown as Prisma.InputJsonValue,
          responseText,
          latencyMs,
        },
      })
      .catch((err) => {
        console.error('Failed to log chat interaction:', err)
      })

    // Check thresholds and send alerts (non-blocking)
    checkThresholdsAndAlert({
      sessionId,
      userMessage,
      responseText,
      estimatedCost,
      latencyMs,
      toolsUsed,
      conversationLength: messages.length,
    }).catch((err) => {
      console.error('Failed to check thresholds:', err)
    })

    const response: { response: string; sessionId: string; _debug?: unknown } = {
      response: responseText,
      sessionId,
    }

    // Only include debug info in development
    if (process.env.NODE_ENV === 'development') {
      response._debug = {
        tokens: { input: inputTokens, output: outputTokens },
        cost: `$${estimatedCost.toFixed(4)}`,
        latency: `${latencyMs}ms`,
        steps: result.steps?.length ?? 1,
        toolsUsed,
      }
    }

    return response
  } catch (err) {
    console.error('Chat API error:', err)
    throw createError({
      statusCode: 500,
      statusMessage: err instanceof Error ? err.message : 'Chat request failed',
    })
  }
})

// Alert cooldown periods
const ALERT_COOLDOWNS = {
  SINGLE_COST: 30 * 60 * 1000, // 30 minutes for per-chat cost alerts
  DAILY_COST: 60 * 60 * 1000, // 1 hour for daily cost alerts
  SESSION_ABUSE: 60 * 60 * 1000, // 1 hour per session for abuse alerts
  LATENCY: 15 * 60 * 1000, // 15 minutes for latency alerts
}

// Helper function to check thresholds and send alerts
async function checkThresholdsAndAlert(params: {
  sessionId: string
  userMessage: string
  responseText: string
  estimatedCost: number
  latencyMs: number
  toolsUsed: string[]
  conversationLength: number
}): Promise<void> {
  const { sessionId, userMessage, responseText, estimatedCost, latencyMs, toolsUsed, conversationLength } = params
  const now = new Date()

  // Check single chat cost threshold
  if (estimatedCost >= THRESHOLDS.SINGLE_CHAT_COST_CRITICAL) {
    const alertKey = buildAlertKey('single_cost', 'critical')
    if (shouldSendAlert(alertKey, ALERT_COOLDOWNS.SINGLE_COST)) {
      await notifyChatThresholdAlert({
        type: 'cost',
        severity: 'critical',
        message: 'Single chat exceeded critical cost threshold',
        details: {
          threshold: THRESHOLDS.SINGLE_CHAT_COST_CRITICAL,
          actual: estimatedCost,
          sessionId,
          userMessage,
          timestamp: now,
        },
      })
    }
  } else if (estimatedCost >= THRESHOLDS.SINGLE_CHAT_COST_WARNING) {
    const alertKey = buildAlertKey('single_cost', 'warning')
    if (shouldSendAlert(alertKey, ALERT_COOLDOWNS.SINGLE_COST)) {
      await notifyChatThresholdAlert({
        type: 'cost',
        severity: 'warning',
        message: 'Single chat exceeded warning cost threshold',
        details: {
          threshold: THRESHOLDS.SINGLE_CHAT_COST_WARNING,
          actual: estimatedCost,
          sessionId,
          userMessage,
          timestamp: now,
        },
      })
    }
  }

  // Check session length (potential abuse) - dedupe per session
  if (conversationLength >= THRESHOLDS.SESSION_COUNT_WARNING) {
    const alertKey = buildAlertKey('session_abuse', 'warning', sessionId)
    if (shouldSendAlert(alertKey, ALERT_COOLDOWNS.SESSION_ABUSE)) {
      await notifyChatThresholdAlert({
        type: 'abuse',
        severity: 'warning',
        message: 'Session has unusually many messages',
        details: {
          threshold: THRESHOLDS.SESSION_COUNT_WARNING,
          actual: conversationLength,
          sessionId,
          userMessage,
          timestamp: now,
        },
      })
    }
  }

  // Check latency
  if (latencyMs >= THRESHOLDS.LATENCY_WARNING_MS) {
    const alertKey = buildAlertKey('latency', 'warning')
    if (shouldSendAlert(alertKey, ALERT_COOLDOWNS.LATENCY)) {
      await notifyChatThresholdAlert({
        type: 'rate',
        severity: 'warning',
        message: 'Chat response latency exceeded threshold',
        details: {
          threshold: THRESHOLDS.LATENCY_WARNING_MS,
          actual: latencyMs,
          sessionId,
          userMessage,
          timestamp: now,
        },
      })
    }
  }

  // Check daily cost (sample check - not on every request)
  if (Math.random() < 0.05) { // 5% of requests check daily cost
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const dailyStats = await prisma.chatLog.aggregate({
      where: {
        timestamp: { gte: todayStart },
      },
      _sum: {
        estimatedCostUsd: true,
      },
    })

    const dailyCost = dailyStats._sum?.estimatedCostUsd || 0

    if (dailyCost >= THRESHOLDS.DAILY_COST_CRITICAL) {
      const alertKey = buildAlertKey('daily_cost', 'critical')
      if (shouldSendAlert(alertKey, ALERT_COOLDOWNS.DAILY_COST)) {
        await notifyChatThresholdAlert({
          type: 'cost',
          severity: 'critical',
          message: 'Daily chat cost exceeded critical threshold',
          details: {
            threshold: THRESHOLDS.DAILY_COST_CRITICAL,
            actual: dailyCost,
            timestamp: now,
          },
        })
      }
    } else if (dailyCost >= THRESHOLDS.DAILY_COST_WARNING) {
      const alertKey = buildAlertKey('daily_cost', 'warning')
      if (shouldSendAlert(alertKey, ALERT_COOLDOWNS.DAILY_COST)) {
        await notifyChatThresholdAlert({
          type: 'cost',
          severity: 'warning',
          message: 'Daily chat cost exceeded warning threshold',
          details: {
            threshold: THRESHOLDS.DAILY_COST_WARNING,
            actual: dailyCost,
            timestamp: now,
          },
        })
      }
    }
  }

  // Quality sampling - send random samples for review (no dedup needed)
  if (Math.random() < THRESHOLDS.QUALITY_SAMPLE_RATE) {
    await notifyChatQualitySample({
      sessionId,
      userMessage,
      assistantResponse: responseText,
      toolsUsed,
      latencyMs,
      cost: estimatedCost,
    })
  }
}

// Log validation failures to database for observability
async function logValidationFailure(
  sessionId: string,
  userMessage: string,
  error: string,
  ipAddress: string
): Promise<void> {
  // Log to ChatLog with special markers for validation failure
  await prisma.chatLog.create({
    data: {
      sessionId,
      ipAddress,
      userMessage,
      conversationLength: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      llmCallsCount: 0,
      model: 'validation_failure',
      toolsUsed: [],
      toolInputs: undefined,
      responseText: `VALIDATION_FAILED: ${error}`,
      latencyMs: 0,
    },
  })

  // Send alert for validation failures (with dedup)
  const alertKey = buildAlertKey('validation', 'warning')
  if (shouldSendAlert(alertKey, 15 * 60 * 1000)) { // 15 min cooldown
    await notifyChatThresholdAlert({
      type: 'validation',
      severity: 'warning',
      message: `Validation failure: ${error}`,
      details: {
        threshold: 0,
        actual: 1,
        sessionId,
        userMessage: userMessage.substring(0, 200),
        timestamp: new Date(),
      },
    })
  }
}
