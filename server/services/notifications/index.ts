/**
 * Notification service for alerting developers about parser failures
 * Supports multiple channels: email, webhook, console (for now)
 */

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
    const webhookUrl = process.env.PARSER_FAILURE_WEBHOOK_URL
    if (webhookUrl) {
      console.log('[Notifications] Webhook channel enabled')
      this.channels.push(new WebhookNotificationChannel(webhookUrl))
    } else {
      console.log('[Notifications] Webhook channel disabled (PARSER_FAILURE_WEBHOOK_URL not set)')
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

