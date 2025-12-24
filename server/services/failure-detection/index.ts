/**
 * Failure detection service for identifying parser failures and structural changes
 */

import { PrismaClient } from '@prisma/client'
import type { ScraperResult, BaseScraper } from '../../scrapers/types'
import { notificationService, type ParserFailureNotification } from '../notifications'

export interface FailureDetectionResult {
  hasFailure: boolean
  failureType?: ParserFailureNotification['failureType']
  severity: 'warning' | 'error' | 'critical'
  message: string
  shouldNotify: boolean
}

export class FailureDetectionService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Detect failures in a scraper result
   */
  async detectFailure(
    scraper: BaseScraper,
    result: ScraperResult,
    previousRunStats?: {
      averageEvents: number
      lastSuccessfulRun: Date | null
      consecutiveFailures: number
    }
  ): Promise<FailureDetectionResult> {
    // Get historical stats if not provided
    if (!previousRunStats) {
      previousRunStats = await this.getHistoricalStats(scraper.config.id)
    }
    
    console.log(`[FailureDetection] ${scraper.config.name}: events=${result.events.length}, errors=${result.errors.length}, success=${result.success}`)
    console.log(`[FailureDetection] Historical: avgEvents=${previousRunStats.averageEvents}, consecutiveFailures=${previousRunStats.consecutiveFailures}`)

    // Check for explicit errors first
    if (!result.success || result.errors.length > 0) {
      return {
        hasFailure: true,
        failureType: result.errors.some(e => e.includes('timeout')) ? 'timeout' : 'parse_error',
        severity: 'error',
        message: `Parser encountered errors: ${result.errors.join('; ')}`,
        shouldNotify: true,
      }
    }

    // Check for zero events when we expect some
    if (result.events.length === 0) {
      const expectedEvents = previousRunStats.averageEvents || 5 // Default threshold
      
      if (expectedEvents > 0) {
        const consecutiveFailures = (previousRunStats.consecutiveFailures || 0) + 1
        
        // Critical if multiple consecutive failures
        const severity = consecutiveFailures >= 3 ? 'critical' : 'error'
        
        return {
          hasFailure: true,
          failureType: 'zero_events',
          severity,
          message: `No events found. Expected ~${expectedEvents} events based on historical data. ${consecutiveFailures > 1 ? `(${consecutiveFailures} consecutive failures)` : ''}`,
          shouldNotify: true,
        }
      } else {
        // First run or no historical data - just a warning
        return {
          hasFailure: true,
          failureType: 'zero_events',
          severity: 'warning',
          message: 'No events found (no historical data for comparison)',
          shouldNotify: false, // Don't notify on first run
        }
      }
    }

    // Check for significant drop in event count (structure change indicator)
    if (previousRunStats.averageEvents > 0) {
      const dropThreshold = previousRunStats.averageEvents * 0.5 // 50% drop
      if (result.events.length < dropThreshold) {
        const dropPercent = Math.round(
          ((previousRunStats.averageEvents - result.events.length) / previousRunStats.averageEvents) * 100
        )
        
        return {
          hasFailure: true,
          failureType: 'structure_change',
          severity: dropPercent > 80 ? 'error' : 'warning',
          message: `Event count dropped significantly: ${result.events.length} found vs ~${previousRunStats.averageEvents} expected (${dropPercent}% drop). Possible structure change.`,
          shouldNotify: dropPercent > 80, // Only notify on major drops
        }
      }
    }

    // Check for unexpected format (events found but missing critical fields)
    const invalidEvents = result.events.filter(
      e => !e.title || !e.startsAt || !e.sourceUrl
    )
    if (invalidEvents.length > 0) {
      return {
        hasFailure: true,
        failureType: 'unexpected_format',
        severity: 'warning',
        message: `${invalidEvents.length} events missing critical fields (title, date, or URL)`,
        shouldNotify: invalidEvents.length === result.events.length, // Only notify if all are invalid
      }
    }

    return {
      hasFailure: false,
      severity: 'warning',
      message: '',
      shouldNotify: false,
    }
  }

  /**
   * Get historical statistics for a source
   */
  async getHistoricalStats(sourceSlug: string): Promise<{
    averageEvents: number
    lastSuccessfulRun: Date | null
    consecutiveFailures: number
  }> {
    const source = await this.prisma.source.findUnique({
      where: { slug: sourceSlug },
    })

    if (!source) {
      return {
        averageEvents: 0,
        lastSuccessfulRun: null,
        consecutiveFailures: 0,
      }
    }

    // Use lastEventCount if available (set on successful runs)
    // Fall back to counting future events from this source as a rough estimate
    let averageEvents = source.lastEventCount || 0

    if (averageEvents === 0) {
      // Fallback: count events from this source that are in the future
      // This gives us a rough idea of how many events this venue typically has
      const futureEventsCount = await this.prisma.event.count({
        where: {
          sourceId: source.id,
          startsAt: { gte: new Date() },
        },
      })
      averageEvents = futureEventsCount
    }

    // Get consecutive failures
    const consecutiveFailures = source.consecutiveFailures || 0

    return {
      averageEvents,
      lastSuccessfulRun: source.lastRunStatus === 'success' ? source.lastRunAt : null,
      consecutiveFailures,
    }
  }

  /**
   * Get consecutive failure count from source table
   */
  private async getConsecutiveFailures(sourceSlug: string): Promise<number> {
    const source = await this.prisma.source.findUnique({
      where: { slug: sourceSlug },
      select: { consecutiveFailures: true },
    })
    return source?.consecutiveFailures || 0
  }

  /**
   * Create and send notification for a detected failure
   */
  async notifyFailure(
    scraper: BaseScraper,
    result: ScraperResult,
    detection: FailureDetectionResult,
    htmlSnapshot?: string
  ): Promise<void> {
    console.log(`[FailureDetection] notifyFailure called for ${scraper.config.name}`)

    const previousStats = await this.getHistoricalStats(scraper.config.id)

    // Calculate the NEW consecutive failure count (including this failure)
    const newConsecutiveFailures = (previousStats.consecutiveFailures || 0) + 1

    const notification: ParserFailureNotification = {
      sourceId: scraper.config.id,
      sourceName: scraper.config.name,
      sourceUrl: scraper.config.url,
      failureType: detection.failureType!,
      severity: detection.severity,
      message: detection.message,
      details: {
        eventsFound: result.events.length,
        eventsExpected: previousStats.averageEvents > 0 ? previousStats.averageEvents : undefined,
        errors: result.errors,
        lastSuccessfulRun: previousStats.lastSuccessfulRun || undefined,
        consecutiveFailures: newConsecutiveFailures,
        htmlSnapshot: htmlSnapshot ? htmlSnapshot.slice(0, 10000) : undefined, // First 10KB
      },
      timestamp: new Date(),
    }

    console.log(`[FailureDetection] Sending notification via notificationService...`)
    await notificationService.notify(notification)
    console.log(`[FailureDetection] Notification sent`)

    // Record failure in database (if we add a failures table)
    await this.recordFailure(scraper.config.id, detection, result)
  }

  /**
   * Record failure in database for tracking
   */
  private async recordFailure(
    sourceSlug: string,
    detection: FailureDetectionResult,
    result: ScraperResult
  ): Promise<void> {
    const source = await this.prisma.source.findUnique({
      where: { slug: sourceSlug },
    })

    if (!source) return

    // Update source with failure info
    const consecutiveFailures = (source.consecutiveFailures || 0) + 1
    
    await this.prisma.source.update({
      where: { slug: sourceSlug },
      data: {
        lastRunStatus: 'failed',
        consecutiveFailures,
        lastFailureAt: new Date(),
        updatedAt: new Date(),
      },
    })

    // Try to record in parser_failures table if it exists
    // (This table is optional - created via migration)
    try {
      await this.prisma.$executeRaw`
        INSERT INTO parser_failures (
          id, source_id, failure_type, severity, message,
          events_found, events_expected, errors, created_at
        ) VALUES (
          gen_random_uuid()::text,
          ${source.id},
          ${detection.failureType || 'unknown'},
          ${detection.severity},
          ${detection.message},
          ${result.events.length},
          NULL,
          ${result.errors},
          NOW()
        )
      `
    } catch {
      // Table doesn't exist or error - that's okay, it's optional
    }
  }

  /**
   * Reset consecutive failures when a scraper succeeds
   */
  async recordSuccess(sourceSlug: string): Promise<void> {
    await this.prisma.source.update({
      where: { slug: sourceSlug },
      data: {
        consecutiveFailures: 0,
        lastFailureAt: null,
      },
    })
  }
}

