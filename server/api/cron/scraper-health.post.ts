/**
 * Cron endpoint for daily scraper health digest
 * POST /api/cron/scraper-health
 *
 * Checks for scrapers that are:
 * - Stale (haven't run successfully in 3+ days)
 * - Failing (3+ consecutive failures)
 * - Disabled (isActive = false but should be running)
 *
 * Add to crontab:
 *   0 7 * * * curl -sX POST "http://localhost:3000/api/cron/scraper-health?token=$CRON_SECRET"
 */

import prisma from '../../utils/prisma'
import { verifyCronAuth } from '../../utils/cron-auth'
import { notifyScraperHealthDigest, type StaleScraperInfo } from '../../services/notifications'

// List of hardcoded scraper slugs for reference
const HARDCODED_SCRAPER_SLUGS = [
  'iron-horse',
  'parlor-room',
  'the-drake',
  'new-city-brewery',
  'haze',
  'de-la-luz',
  'marigold',
  'progression-brewing',
  'stone-church',
  'marigold-brattleboro',
  'luthiers',
]

export default defineEventHandler(async (event) => {
  verifyCronAuth(event)

  console.log('[Cron] Running scraper health check...')

  const now = new Date()
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  // Get all active scrapers
  const sources = await prisma.source.findMany({
    where: {
      type: 'SCRAPER',
    },
    select: {
      slug: true,
      name: true,
      isActive: true,
      lastRunAt: true,
      lastRunStatus: true,
      consecutiveFailures: true,
    },
  })

  const staleScrapers: StaleScraperInfo[] = []
  const failingScrapers: StaleScraperInfo[] = []
  const disabledScrapers: StaleScraperInfo[] = []

  for (const source of sources) {
    const isHardcoded = HARDCODED_SCRAPER_SLUGS.includes(source.slug)
    const daysSinceLastRun = source.lastRunAt
      ? Math.floor((now.getTime() - source.lastRunAt.getTime()) / (1000 * 60 * 60 * 24))
      : null

    const info: StaleScraperInfo = {
      slug: source.slug,
      name: source.name,
      lastRunAt: source.lastRunAt,
      lastRunStatus: source.lastRunStatus,
      consecutiveFailures: source.consecutiveFailures || 0,
      daysSinceLastRun,
      isHardcoded,
    }

    // Check if disabled
    if (!source.isActive) {
      disabledScrapers.push(info)
      continue // Don't also report as stale/failing
    }

    // Check if stale (active but hasn't run in 3+ days)
    if (!source.lastRunAt || source.lastRunAt < threeDaysAgo) {
      staleScrapers.push(info)
    }

    // Check if failing (3+ consecutive failures)
    if ((source.consecutiveFailures || 0) >= 3) {
      failingScrapers.push(info)
    }
  }

  // Sort by severity/age
  staleScrapers.sort((a, b) => (b.daysSinceLastRun || 999) - (a.daysSinceLastRun || 999))
  failingScrapers.sort((a, b) => b.consecutiveFailures - a.consecutiveFailures)

  console.log(`[Cron] Health check: ${staleScrapers.length} stale, ${failingScrapers.length} failing, ${disabledScrapers.length} disabled`)

  // Send notification if there are issues
  await notifyScraperHealthDigest({
    staleScrapers,
    failingScrapers,
    disabledScrapers,
    adminUrl: process.env.NUXT_PUBLIC_SITE_URL
      ? `${process.env.NUXT_PUBLIC_SITE_URL}/admin/scrapers`
      : undefined,
  })

  return {
    success: true,
    timestamp: now.toISOString(),
    summary: {
      total: sources.length,
      stale: staleScrapers.length,
      failing: failingScrapers.length,
      disabled: disabledScrapers.length,
    },
    staleScrapers: staleScrapers.map(s => s.slug),
    failingScrapers: failingScrapers.map(s => s.slug),
    disabledScrapers: disabledScrapers.map(s => s.slug),
  }
})
