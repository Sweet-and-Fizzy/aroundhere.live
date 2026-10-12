import type { PrismaClient } from '@prisma/client'

/**
 * Record a successful scraper run: resets failure tracking so the
 * scraper-health digest stops flagging the source, and stores the event
 * count for zero-event staleness detection.
 */
export async function recordScraperSuccess(
  prisma: PrismaClient,
  sourceId: string,
  eventCount: number
): Promise<void> {
  await prisma.source.update({
    where: { id: sourceId },
    data: {
      lastRunAt: new Date(),
      lastRunStatus: 'success',
      lastEventCount: eventCount,
      consecutiveFailures: 0,
      lastFailureAt: null,
    },
  })
}

/**
 * Record a failed scraper run. Returns the new consecutive-failure count
 * so callers can include it in failure notifications.
 */
export async function recordScraperFailure(
  prisma: PrismaClient,
  sourceId: string
): Promise<number> {
  const updated = await prisma.source.update({
    where: { id: sourceId },
    data: {
      lastRunAt: new Date(),
      lastRunStatus: 'failed',
      consecutiveFailures: { increment: 1 },
      lastFailureAt: new Date(),
    },
  })
  return updated.consecutiveFailures || 1
}

/**
 * Slack a failing scraper on its first failure and when it reaches three in a
 * row; after that the daily health digest keeps listing it. Without this a
 * broken scraper posted twice a day until someone fixed it.
 */
export function shouldAlertScraperFailure(consecutiveFailures: number | undefined): boolean {
  return consecutiveFailures === undefined || consecutiveFailures === 1 || consecutiveFailures === 3
}
