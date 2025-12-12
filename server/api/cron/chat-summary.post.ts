/**
 * Cron endpoint for daily chat observability summary
 * POST /api/cron/chat-summary
 *
 * Authentication: Requires CRON_SECRET token via query param or header
 *
 * Recommended crontab (run daily at 8am):
 *   0 8 * * * curl -sX POST "https://aroundhere.live/api/cron/chat-summary?token=$CRON_SECRET"
 */

import prisma from '../../utils/prisma'
import {
  notifyChatDailySummary,
  type ChatDailySummary,
} from '../../services/notifications'
import { verifyCronAuth } from '../../utils/cron-auth'

export default defineEventHandler(async (event) => {
  // Verify cron authentication
  verifyCronAuth(event)
  const startTime = Date.now()

  try {
    // Get yesterday's date range
    const now = new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)

    const endOfYesterday = new Date(yesterday)
    endOfYesterday.setHours(23, 59, 59, 999)

    const dateStr = yesterday.toISOString().split('T')[0] as string

    console.log(`[Chat Summary] Generating summary for ${dateStr}`)

    // Query chat logs for yesterday
    const chatLogs = await prisma.chatLog.findMany({
      where: {
        timestamp: {
          gte: yesterday,
          lte: endOfYesterday,
        },
      },
      select: {
        sessionId: true,
        userMessage: true,
        inputTokens: true,
        outputTokens: true,
        estimatedCostUsd: true,
        latencyMs: true,
        toolsUsed: true,
        model: true,
      },
    })

    if (chatLogs.length === 0) {
      console.log('[Chat Summary] No chats yesterday, skipping notification')
      return {
        success: true,
        message: 'No chats yesterday',
        duration: Date.now() - startTime,
      }
    }

    // Count tool usage (from all logs including failures)
    const toolUsage: Record<string, number> = {}
    for (const log of chatLogs) {
      const tools = log.toolsUsed as string[] | null
      if (tools && Array.isArray(tools)) {
        for (const tool of tools) {
          toolUsage[tool] = (toolUsage[tool] || 0) + 1
        }
      }
    }

    // Find top questions (group by similar questions)
    const questionCounts: Record<string, number> = {}
    for (const log of chatLogs) {
      if (log.userMessage) {
        // Normalize question (lowercase, trim whitespace)
        const normalized = log.userMessage.toLowerCase().trim()
        questionCounts[normalized] = (questionCounts[normalized] || 0) + 1
      }
    }

    const topQuestions = Object.entries(questionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([question, count]) => ({
        question: chatLogs.find(
          (l) => l.userMessage?.toLowerCase().trim() === question
        )?.userMessage || question,
        count,
      }))

    // Count validation failures (logged with model='validation_failure')
    const validationFailures = chatLogs.filter(
      (log) => log.model === 'validation_failure'
    ).length

    // Filter out validation failures from normal stats
    const successfulChats = chatLogs.filter((log) => log.model !== 'validation_failure')

    const summary: ChatDailySummary = {
      date: dateStr,
      totalChats: successfulChats.length,
      uniqueSessions: new Set(successfulChats.map((log) => log.sessionId)).size,
      totalInputTokens: successfulChats.reduce((sum, log) => sum + (log.inputTokens || 0), 0),
      totalOutputTokens: successfulChats.reduce((sum, log) => sum + (log.outputTokens || 0), 0),
      totalCostUsd: successfulChats.reduce((sum, log) => sum + (log.estimatedCostUsd || 0), 0),
      avgLatencyMs: successfulChats.length > 0
        ? successfulChats.reduce((sum, log) => sum + (log.latencyMs || 0), 0) / successfulChats.length
        : 0,
      validationFailures,
      topQuestions,
      toolUsage,
    }

    // Send Slack notification
    await notifyChatDailySummary(summary)

    console.log(`[Chat Summary] Summary sent for ${dateStr}:`, {
      chats: summary.totalChats,
      cost: `$${summary.totalCostUsd.toFixed(4)}`,
    })

    return {
      success: true,
      summary,
      duration: Date.now() - startTime,
    }
  } catch (error) {
    console.error('[Chat Summary] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    }
  }
})
