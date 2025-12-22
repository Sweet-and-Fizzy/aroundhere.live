/**
 * Notification service for alerting developers about parser failures
 * Supports multiple channels: email, webhook, console (for now)
 */

// Slack Block Kit types for message formatting
interface SlackBlock {
  type: string
  text?: { type: string; text: string; emoji?: boolean }
  elements?: Array<{ type: string; text?: string; url?: string }>
  fields?: Array<{ type: string; text: string }>
}

interface SlackPayload {
  text: string
  blocks?: SlackBlock[]
}

export interface NotificationChannel {
  send(notification: ParserFailureNotification): Promise<void>
}

export interface ParserFailureNotification {
  sourceId: string
  sourceName: string
  sourceUrl: string
  failureType: FailureType
  severity: 'warning' | 'error' | 'critical'
  message: string
  details: {
    eventsFound: number
    eventsExpected?: number
    errors: string[]
    lastSuccessfulRun?: Date
    consecutiveFailures?: number
    htmlSnapshot?: string // First 10KB of HTML for debugging
  }
  timestamp: Date
}

export type FailureType =
  | 'zero_events' // No events found when normally there are many
  | 'parse_error' // Parser threw an error
  | 'structure_change' // HTML structure changed significantly
  | 'http_error' // HTTP request failed
  | 'timeout' // Scraper timed out
  | 'unexpected_format' // Events found but in unexpected format

/**
 * Console notification channel (for development/testing)
 */
export class ConsoleNotificationChannel implements NotificationChannel {
  async send(notification: ParserFailureNotification): Promise<void> {
    const emoji = notification.severity === 'critical' ? '🚨' : notification.severity === 'error' ? '⚠️' : 'ℹ️'
    
    console.error(`\n${emoji} PARSER FAILURE ALERT ${emoji}`)
    console.error(`Source: ${notification.sourceName} (${notification.sourceId})`)
    console.error(`Type: ${notification.failureType}`)
    console.error(`Severity: ${notification.severity.toUpperCase()}`)
    console.error(`Message: ${notification.message}`)
    console.error(`Events found: ${notification.details.eventsFound}`)
    if (notification.details.eventsExpected) {
      console.error(`Events expected: ${notification.details.eventsExpected}`)
    }
    if (notification.details.consecutiveFailures) {
      console.error(`Consecutive failures: ${notification.details.consecutiveFailures}`)
    }
    if (notification.details.errors.length > 0) {
      console.error(`Errors:`)
      notification.details.errors.forEach(err => console.error(`  - ${err}`))
    }
    console.error(`Timestamp: ${notification.timestamp.toISOString()}`)
    console.error(`${'='.repeat(60)}\n`)
  }
}

/**
 * Webhook notification channel
 */
export class WebhookNotificationChannel implements NotificationChannel {
  private webhookUrl: string

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl
  }

  async send(notification: ParserFailureNotification): Promise<void> {
    try {
      // Build a formatted message
      const message = [
        `🚨 *Parser Failure: ${notification.sourceName}*`,
        `*Type:* ${notification.failureType}`,
        `*Severity:* ${notification.severity}`,
        `*Events Found:* ${notification.details.eventsFound}`,
        notification.details.eventsExpected ? `*Events Expected:* ${notification.details.eventsExpected}` : null,
        notification.details.consecutiveFailures ? `*Consecutive Failures:* ${notification.details.consecutiveFailures}` : null,
        `*Message:* ${notification.message}`,
        `*Source URL:* <${notification.sourceUrl}|View Site>`,
        ...(notification.details.errors.length > 0 ? [`*Errors:*\n\`\`\`${notification.details.errors.join('\n')}\`\`\``] : []),
      ]
        .filter(Boolean)
        .join('\n')

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: `Parser Failure: ${notification.sourceName}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: message,
              },
            },
          ],
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response')
        console.error(`[Notifications] Webhook failed: ${response.status} ${response.statusText}`)
        console.error(`[Notifications] Webhook error details:`, errorText)
      } else {
        console.log('[Notifications] Webhook sent successfully')
      }
    } catch (error) {
      console.error('[Notifications] Webhook error:', error)
      if (error instanceof Error) {
        console.error('[Notifications] Webhook error message:', error.message)
      }
    }
  }
}

/**
 * Email notification channel (placeholder - requires email service)
 */
export class EmailNotificationChannel implements NotificationChannel {
  private recipients: string[]

  constructor(recipients: string[]) {
    this.recipients = recipients
  }

  async send(notification: ParserFailureNotification): Promise<void> {
    // TODO: Implement email sending (using SendGrid, AWS SES, etc.)
    console.warn('[Notifications] Email notifications not yet implemented')
    console.warn(`Would send email to: ${this.recipients.join(', ')}`)
    console.warn(`Subject: Parser Failure: ${notification.sourceName}`)
  }
}

/**
 * Notification service that routes to multiple channels
 */
export class NotificationService {
  private channels: NotificationChannel[] = []

  constructor() {
    // Always include console channel
    this.channels.push(new ConsoleNotificationChannel())

    // Add webhook if configured
    const webhookUrl = process.env.SLACK_WEBHOOK_URL
    if (webhookUrl) {
      console.log('[Notifications] Webhook channel enabled')
      this.channels.push(new WebhookNotificationChannel(webhookUrl))
    } else {
      console.log('[Notifications] Webhook channel disabled (SLACK_WEBHOOK_URL not set)')
    }

    // Add email if configured
    const emailRecipients = process.env.PARSER_FAILURE_EMAIL_RECIPIENTS
    if (emailRecipients) {
      const recipients = emailRecipients.split(',').map(r => r.trim())
      this.channels.push(new EmailNotificationChannel(recipients))
    }
  }

  async notify(notification: ParserFailureNotification): Promise<void> {
    console.log(`[Notifications] Sending notification to ${this.channels.length} channel(s)`)
    // Send to all channels in parallel
    const results = await Promise.allSettled(
      this.channels.map(channel => channel.send(notification))
    )
    
    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[Notifications] Channel ${index} failed:`, result.reason)
      }
    })
  }
}

// Singleton instance
export const notificationService = new NotificationService()

/**
 * Send a simple Slack notification (for general alerts like scraper approvals)
 */
export async function sendSlackNotification(message: string, blocks?: SlackBlock[]): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL

  if (!webhookUrl) {
    console.log('[Slack] Webhook not configured, skipping notification')
    return
  }

  try {
    const payload: SlackPayload = { text: message }
    if (blocks) {
      payload.blocks = blocks
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      console.error('[Slack] Failed to send notification:', response.status)
    }
  } catch (error) {
    console.error('[Slack] Error sending notification:', error)
  }
}

/**
 * Notify when a new venue is approved
 */
export async function notifyVenueApproved(params: {
  venueName: string
  venueUrl: string
  city?: string
  state?: string
  llmProvider: string
  llmModel: string
}): Promise<void> {
  const { venueName, venueUrl, city, state, llmProvider, llmModel } = params

  const location = [city, state].filter(Boolean).join(', ')
  const message = `🏢 New Venue: ${venueName}`

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🏢 *New Venue Added*\n\n*Venue:* ${venueName}${location ? `\n*Location:* ${location}` : ''}\n*URL:* <${venueUrl}|View Site>\n*Model:* ${llmProvider}/${llmModel}`,
      },
    },
  ]

  await sendSlackNotification(message, blocks)
}

/**
 * Notify when a new scraper is approved
 */
export async function notifyScraperApproved(params: {
  venueName: string
  venueUrl: string
  isUpdate: boolean
  llmProvider: string
  llmModel: string
}): Promise<void> {
  const { venueName, venueUrl, isUpdate, llmProvider, llmModel } = params

  const emoji = isUpdate ? '🔄' : '✅'
  const action = isUpdate ? 'Updated' : 'New'

  const message = `${emoji} ${action} Scraper: ${venueName}`

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${action} Scraper Approved*\n\n*Venue:* ${venueName}\n*URL:* <${venueUrl}|View Site>\n*Model:* ${llmProvider}/${llmModel}`,
      },
    },
  ]

  await sendSlackNotification(message, blocks)
}

/**
 * Notify about new reviews scraped and matched to artists
 */
export async function notifyNewReviews(params: {
  source: string
  newReviews: number
  artistMatches: number
}): Promise<void> {
  const { source, newReviews, artistMatches } = params

  // Only notify if there are new reviews with artist matches
  if (newReviews === 0 || artistMatches === 0) {
    return
  }

  const message = `📰 ${source}: ${newReviews} new reviews, ${artistMatches} artist matches`

  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `📰 *New Reviews from ${source}*\n\n*New Reviews:* ${newReviews}\n*Artist Matches:* ${artistMatches}`,
      },
    },
  ]

  await sendSlackNotification(message, blocks)
}

/**
 * Notify about artist matching results (when there are artists needing review)
 */
export async function notifyArtistMatchingResults(params: {
  processed: number
  autoMatched: number
  needsReview: number
  noMatch: number
  errors: number
  adminUrl?: string
}): Promise<void> {
  const { processed, autoMatched, needsReview, noMatch, errors, adminUrl } = params

  // Only notify if there are artists needing review or errors
  if (needsReview === 0 && errors === 0) {
    console.log('[Notifications] No artists need review, skipping Slack notification')
    return
  }

  const emoji = needsReview > 0 ? '🎵' : '⚠️'
  const message = `${emoji} Artist Matching: ${needsReview} need review`

  const statsText = [
    `*Processed:* ${processed} artists`,
    `*Auto-matched:* ${autoMatched}`,
    `*Needs Review:* ${needsReview}`,
    `*No Match:* ${noMatch}`,
    errors > 0 ? `*Errors:* ${errors}` : null,
  ].filter(Boolean).join('\n')

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *Spotify Artist Matching Complete*\n\n${statsText}`,
      },
    },
  ]

  // Add action button if adminUrl provided and there are items to review
  if (adminUrl && needsReview > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${adminUrl}|Review Artists in Admin>`,
      },
    })
  }

  await sendSlackNotification(message, blocks)
}

// ============================================================================
// Chat Observability Notifications
// ============================================================================

export interface ChatDailySummary {
  date: string
  totalChats: number
  uniqueSessions: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  avgLatencyMs: number
  validationFailures: number
  topQuestions: Array<{ question: string; count: number }>
  toolUsage: Record<string, number>
}

/**
 * Notify with daily chat cost and usage summary
 */
export async function notifyChatDailySummary(summary: ChatDailySummary): Promise<void> {
  const message = `📊 Chat Daily Summary: ${summary.date}`

  const costFormatted = summary.totalCostUsd.toFixed(4)
  const avgLatency = Math.round(summary.avgLatencyMs)

  // Format tool usage
  const toolUsageText = Object.entries(summary.toolUsage)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => `${tool}: ${count}`)
    .join(', ') || 'None'

  // Format top questions (truncate to 50 chars each)
  const topQuestionsText = summary.topQuestions.length > 0
    ? summary.topQuestions
        .slice(0, 5)
        .map((q, i) => `${i + 1}. "${q.question.substring(0, 50)}${q.question.length > 50 ? '...' : ''}" (${q.count}x)`)
        .join('\n')
    : 'No questions logged'

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `📊 *Chat Daily Summary - ${summary.date}*`,
          '',
          `*Usage:*`,
          `• Total chats: ${summary.totalChats}`,
          `• Unique sessions: ${summary.uniqueSessions}`,
          `• Avg latency: ${avgLatency}ms`,
          '',
          `*Tokens & Cost:*`,
          `• Input tokens: ${summary.totalInputTokens.toLocaleString()}`,
          `• Output tokens: ${summary.totalOutputTokens.toLocaleString()}`,
          `• Total cost: $${costFormatted}`,
          '',
          `*Tool Usage:* ${toolUsageText}`,
          summary.validationFailures > 0 ? `\n⚠️ *Validation failures:* ${summary.validationFailures}` : '',
        ].filter(Boolean).join('\n'),
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Top Questions:*\n${topQuestionsText}`,
      },
    },
  ]

  await sendSlackNotification(message, blocks)
}

export interface ChatThresholdAlert {
  type: 'cost' | 'abuse' | 'validation' | 'rate'
  severity: 'warning' | 'critical'
  message: string
  details: {
    threshold: number
    actual: number
    sessionId?: string
    userMessage?: string
    timestamp: Date
  }
}

/**
 * Alert when chat thresholds are exceeded (cost, abuse, etc.)
 */
export async function notifyChatThresholdAlert(alert: ChatThresholdAlert): Promise<void> {
  const emoji = alert.severity === 'critical' ? '🚨' : '⚠️'
  const message = `${emoji} Chat Alert: ${alert.type}`

  const typeLabels: Record<string, string> = {
    cost: 'Cost Threshold',
    abuse: 'Abuse Detection',
    validation: 'Validation Failure',
    rate: 'Rate Limit',
  }

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `${emoji} *${typeLabels[alert.type] || alert.type} - ${alert.severity.toUpperCase()}*`,
          '',
          `*Message:* ${alert.message}`,
          `*Threshold:* ${alert.details.threshold}`,
          `*Actual:* ${alert.details.actual}`,
          alert.details.sessionId ? `*Session:* \`${alert.details.sessionId}\`` : '',
          alert.details.userMessage ? `*User message:* "${alert.details.userMessage.substring(0, 100)}${alert.details.userMessage.length > 100 ? '...' : ''}"` : '',
          `*Time:* ${alert.details.timestamp.toISOString()}`,
        ].filter(Boolean).join('\n'),
      },
    },
  ]

  await sendSlackNotification(message, blocks)
}

/**
 * Send a sample of chat Q&A for quality monitoring
 */
export async function notifyChatQualitySample(params: {
  sessionId: string
  userMessage: string
  assistantResponse: string
  toolsUsed: string[]
  latencyMs: number
  cost: number
}): Promise<void> {
  const { sessionId, userMessage, assistantResponse, toolsUsed, latencyMs, cost } = params

  const message = `💬 Chat Sample: ${userMessage.substring(0, 30)}...`

  // Truncate response for readability
  const truncatedResponse = assistantResponse.length > 500
    ? assistantResponse.substring(0, 500) + '...'
    : assistantResponse

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `💬 *Chat Quality Sample*`,
          '',
          `*Session:* \`${sessionId}\``,
          `*Latency:* ${latencyMs}ms | *Cost:* $${cost.toFixed(4)}`,
          `*Tools:* ${toolsUsed.length > 0 ? toolsUsed.join(', ') : 'None'}`,
        ].join('\n'),
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Question:*\n>${userMessage.replace(/\n/g, '\n>')}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Answer:*\n${truncatedResponse}`,
      },
    },
  ]

  await sendSlackNotification(message, blocks)
}

/**
 * Alert when a scraper exhibits anomalous behavior (e.g., creating too many duplicates)
 */
export async function notifyScraperAnomaly(params: {
  sourceId: string
  sourceName: string
  venueName: string
  anomalyType: 'duplicate_spike' | 'event_spike' | 'zero_events'
  severity: 'warning' | 'critical'
  message: string
  details: {
    eventsCreated: number
    eventsUpdated: number
    eventsSkipped: number
    sampleTitles: string[]
    timestamp: Date
  }
}): Promise<void> {
  const { sourceName, venueName, anomalyType, severity, message: anomalyMessage, details } = params

  const severityEmoji = severity === 'critical' ? '🚨' : '⚠️'
  const typeLabel = {
    duplicate_spike: 'Duplicate Spike',
    event_spike: 'Event Spike',
    zero_events: 'Zero Events',
  }[anomalyType]

  const message = `${severityEmoji} Scraper Anomaly: ${sourceName}`

  const sampleText = details.sampleTitles.length > 0
    ? details.sampleTitles.map(t => `• ${t}`).join('\n')
    : 'None'

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `${severityEmoji} *Scraper Anomaly Detected*`,
          '',
          `*Source:* ${sourceName}`,
          `*Venue:* ${venueName}`,
          `*Type:* ${typeLabel}`,
          `*Severity:* ${severity}`,
          '',
          `*Message:* ${anomalyMessage}`,
          '',
          `*Sample events:*`,
          sampleText,
        ].join('\n'),
      },
    },
  ]

  await sendSlackNotification(message, blocks)
}

/**
 * Alert when there are unclassified events that won't be shown publicly
 */
export async function notifyUnclassifiedEvents(params: {
  count: number
  sampleTitles: string[]
}): Promise<void> {
  const { count, sampleTitles } = params

  // Only notify if there are unclassified events
  if (count === 0) {
    return
  }

  const message = `⚠️ ${count} unclassified events`

  const sampleText = sampleTitles.length > 0
    ? sampleTitles.slice(0, 5).map(t => `• ${t}`).join('\n')
    : 'None'

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `⚠️ *Unclassified Events Alert*`,
          '',
          `*${count} future events* are not being shown publicly because they haven't been classified yet.`,
          '',
          `*Sample titles:*`,
          sampleText,
          '',
          `_Run the classifier to make these events visible._`,
        ].join('\n'),
      },
    },
  ]

  await sendSlackNotification(message, blocks)
}

// ============================================================================
// Scraper Anomaly Detection
// ============================================================================

export interface ScraperAnomalyAlert {
  sourceId: string
  sourceName: string
  venueName: string
  anomalyType: 'high_creation_rate' | 'duplicate_spike' | 'missing_source_event_id'
  severity: 'warning' | 'critical'
  message: string
  details: {
    eventsCreated: number
    eventsUpdated: number
    eventsSkipped: number
    expectedRange?: { min: number; max: number }
    sampleTitles?: string[]
    timestamp: Date
  }
}

/**
 * Alert when a scraper creates an unusually high number of new events.
 * This could indicate a deduplication failure that will cause notification spam.
 */
export async function notifyScraperAnomaly(alert: ScraperAnomalyAlert): Promise<void> {
  const emoji = alert.severity === 'critical' ? '🚨' : '⚠️'
  const message = `${emoji} Scraper Anomaly: ${alert.sourceName}`

  const typeLabels: Record<string, string> = {
    high_creation_rate: 'Unusually High Event Creation',
    duplicate_spike: 'Potential Duplicate Events',
    missing_source_event_id: 'Missing Event Identifiers',
  }

  const sampleText = alert.details.sampleTitles?.length
    ? alert.details.sampleTitles.slice(0, 5).map(t => `• ${t}`).join('\n')
    : null

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `${emoji} *${typeLabels[alert.anomalyType] || alert.anomalyType}*`,
          '',
          `*Source:* ${alert.sourceName}`,
          `*Venue:* ${alert.venueName}`,
          '',
          `*Message:* ${alert.message}`,
          '',
          `*Stats:*`,
          `• Created: ${alert.details.eventsCreated}`,
          `• Updated: ${alert.details.eventsUpdated}`,
          `• Skipped: ${alert.details.eventsSkipped}`,
          alert.details.expectedRange
            ? `• Expected range: ${alert.details.expectedRange.min}-${alert.details.expectedRange.max}`
            : '',
          '',
          sampleText ? `*Sample titles:*\n${sampleText}` : '',
          '',
          `_This may cause notification spam if not addressed._`,
        ].filter(Boolean).join('\n'),
      },
    },
  ]

  await sendSlackNotification(message, blocks)
}

// ============================================================================
// Scraper Failure Notifications
// ============================================================================

export interface ScraperFailureAlert {
  sourceId: string
  sourceName: string
  venueName: string
  error: string
  consecutiveFailures: number
  lastSuccessAt?: Date
}

/**
 * Alert when a scraper fails to run successfully.
 */
export async function notifyScraperFailure(alert: ScraperFailureAlert): Promise<void> {
  const emoji = alert.consecutiveFailures >= 3 ? '🚨' : '⚠️'
  const message = `${emoji} Scraper Failed: ${alert.sourceName}`

  const lastSuccess = alert.lastSuccessAt
    ? `Last success: ${alert.lastSuccessAt.toISOString().split('T')[0]}`
    : 'No recent successful runs'

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `${emoji} *Scraper Failed*`,
          '',
          `*Source:* ${alert.sourceName}`,
          `*Venue:* ${alert.venueName}`,
          `*Consecutive failures:* ${alert.consecutiveFailures}`,
          `*${lastSuccess}*`,
          '',
          `*Error:*`,
          '```',
          alert.error.slice(0, 500),
          '```',
        ].join('\n'),
      },
    },
  ]

  await sendSlackNotification(message, blocks)
}

