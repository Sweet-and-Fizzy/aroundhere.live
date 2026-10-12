/**
 * Cron endpoint for daily scraper health digest
 * POST /api/cron/scraper-health
 *
 * Checks for scrapers that are:
 * - Stale (haven't run successfully in 3+ days)
 * - Failing (3+ consecutive failures)
 * - Disabled (isActive = false but should be running)
 * - Silent (runs succeed but return zero upcoming events)
 * - Gone quiet (still returning events, but no new ones for longer than usual)
 *
 * Add to crontab:
 *   0 7 * * * curl -sX POST "http://localhost:3000/api/cron/scraper-health?token=$CRON_SECRET"
 */

import prisma from '../../utils/prisma'
import { verifyCronAuth } from '../../utils/cron-auth'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { notifyScraperHealthDigest, sendSlackNotification, type StaleScraperInfo } from '../../services/notifications'
import anthropic from '../../utils/anthropic'
import { registeredModels } from '../../services/llm/models'
import { ANTHROPIC_MODELS } from '../../services/llm/types'
import { findUnavailableModels } from '../../services/llm/model-alerts'
import { assessBackups } from '../../utils/backup-status'
import { findGoneQuiet } from '../../utils/scraper-health'
import { assessCronRuns, stalePlaylists } from '../../utils/cron-runs'

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
  'fame',
  'daily-operation',
  'the-heavy-culture-coop',
  'double-edge-theatre',
]

export default defineEventHandler(async (event) => {
  verifyCronAuth(event)

  console.log('[Cron] Running scraper health check...')

  const now = new Date()
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const silentThresholdDays = 30

  // Get all active scrapers
  const sources = await prisma.source.findMany({
    where: {
      type: 'SCRAPER',
    },
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      lastRunAt: true,
      lastRunStatus: true,
      consecutiveFailures: true,
      lastEventCount: true,
    },
  })

  // Most recent scraped event per source, to catch scrapers that "succeed"
  // with zero events long after the venue's calendar moved on.
  const lastEventBySource = await prisma.eventSource.groupBy({
    by: ['sourceId'],
    _max: { scrapedAt: true },
  })
  const lastEventMap = new Map(
    lastEventBySource.map(row => [row.sourceId, row._max.scrapedAt])
  )

  // Creation dates of every event each source has found. Joined through
  // event_sources so events whose canonical source changed still count.
  const creationRows = await prisma.$queryRaw<{ sourceId: string; days: Date[] }[]>`
    SELECT es."sourceId", array_agg(DISTINCT date_trunc('day', e."createdAt")) AS days
    FROM event_sources es
    JOIN events e ON e.id = es."eventId"
    WHERE e."submittedById" IS NULL
    GROUP BY es."sourceId"
  `
  const creationDaysMap = new Map(creationRows.map(row => [row.sourceId, row.days]))

  const staleScrapers: StaleScraperInfo[] = []
  const failingScrapers: StaleScraperInfo[] = []
  const disabledScrapers: StaleScraperInfo[] = []
  const silentScrapers: StaleScraperInfo[] = []
  const quietScrapers: StaleScraperInfo[] = []

  for (const source of sources) {
    const isHardcoded = HARDCODED_SCRAPER_SLUGS.includes(source.slug)
    const daysSinceLastRun = source.lastRunAt
      ? Math.floor((now.getTime() - source.lastRunAt.getTime()) / (1000 * 60 * 60 * 24))
      : null

    const lastEventAt = lastEventMap.get(source.id) || null
    const daysSinceLastEvent = lastEventAt
      ? Math.floor((now.getTime() - lastEventAt.getTime()) / (1000 * 60 * 60 * 24))
      : null

    const info: StaleScraperInfo = {
      slug: source.slug,
      name: source.name,
      lastRunAt: source.lastRunAt,
      lastRunStatus: source.lastRunStatus,
      consecutiveFailures: source.consecutiveFailures || 0,
      daysSinceLastRun,
      isHardcoded,
      daysSinceLastEvent,
    }

    // Check if disabled
    if (!source.isActive) {
      disabledScrapers.push(info)
      continue // Don't also report as stale/failing
    }

    // Check if stale (active but hasn't run in 3+ days)
    if (!source.lastRunAt || source.lastRunAt < threeDaysAgo) {
      staleScrapers.push(info)
      continue
    }

    // Check if failing (3+ consecutive failures)
    if ((source.consecutiveFailures || 0) >= 3) {
      failingScrapers.push(info)
      continue
    }

    // Check if silently dead: runs report success but return zero events.
    // lastEventCount is the primary signal (a venue with a stable calendar
    // legitimately yields no NEW events for months — e.g. an amphitheater
    // season announced once — so "nothing new lately" alone is a false
    // positive). Fall back to first-seen staleness only when lastEventCount
    // has never been recorded (sources that predate that tracking).
    const silentByCount = source.lastEventCount === 0
    const silentByStaleness =
      source.lastEventCount === null
      && (daysSinceLastEvent === null || daysSinceLastEvent >= silentThresholdDays)
    if (source.lastRunStatus === 'success' && (silentByCount || silentByStaleness)) {
      silentScrapers.push(info)
      continue
    }

    // Check if gone quiet: still returning events, but hasn't found a new one
    // in much longer than its usual cadence (e.g. reading an abandoned widget)
    const quiet = findGoneQuiet(creationDaysMap.get(source.id) || [], now)
    if (source.lastRunStatus === 'success' && quiet) {
      quietScrapers.push({
        ...info,
        daysSinceLastEvent: quiet.quietDays,
        quietThresholdDays: quiet.thresholdDays,
      })
    }
  }

  // Sort by severity/age
  staleScrapers.sort((a, b) => (b.daysSinceLastRun || 999) - (a.daysSinceLastRun || 999))
  failingScrapers.sort((a, b) => b.consecutiveFailures - a.consecutiveFailures)
  silentScrapers.sort((a, b) => (b.daysSinceLastEvent ?? 9999) - (a.daysSinceLastEvent ?? 9999))
  quietScrapers.sort((a, b) => (b.daysSinceLastEvent ?? 0) - (a.daysSinceLastEvent ?? 0))

  console.log(`[Cron] Health check: ${staleScrapers.length} stale, ${failingScrapers.length} failing, ${silentScrapers.length} silent, ${quietScrapers.length} quiet, ${disabledScrapers.length} disabled`)

  // Send notification if there are issues
  await notifyScraperHealthDigest({
    staleScrapers,
    failingScrapers,
    disabledScrapers,
    silentScrapers,
    quietScrapers,
    adminUrl: process.env.NUXT_PUBLIC_SITE_URL
      ? `${process.env.NUXT_PUBLIC_SITE_URL}/admin/scrapers`
      : undefined,
  })

  // Catch model retirements before a user-facing call hits them
  let unavailableModels: string[] = []
  try {
    const { unavailable, uncheckable } = await findUnavailableModels(
      registeredModels([
        ...ANTHROPIC_MODELS.map(m => m.id),
        process.env.SCRAPER_LLM_MODEL,
        process.env.CLASSIFIER_MODEL,
      ]),
      id => anthropic.models.retrieve(id),
    )
    if (uncheckable.length > 0) {
      console.warn('[ScraperHealth] Could not check models:', uncheckable)
    }
    unavailableModels = unavailable.map(u => u.model)
    if (unavailable.length > 0) {
      await sendSlackNotification(
        `:rotating_light: ${unavailable.length} Claude model(s) are no longer available: ${unavailableModels.map(m => `\`${m}\``).join(', ')}. Update server/services/llm/models.ts.`,
      )
    }
  } catch (error) {
    console.error('[ScraperHealth] Model availability check failed:', error)
  }

  // Backups are written on the host by scripts/backup.sh and mounted read-only
  // at /backups. Skip quietly where the mount doesn't exist (local dev).
  let backup: ReturnType<typeof assessBackups> | null = null
  const backupDir = process.env.BACKUP_DIR || '/backups'
  try {
    const names = await readdir(backupDir)
    const files = await Promise.all(names.map(async name => {
      const s = await stat(join(backupDir, name))
      return { name, mtime: s.mtime, size: s.size }
    }))
    backup = assessBackups(files, now)
    if (!backup.ok) {
      await sendSlackNotification(`:floppy_disk: Database backup problem: ${backup.problem}. See docs/runbooks/database-backup-restore.md.`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[ScraperHealth] Backup check failed:', error)
    }
  }

  // Cron jobs that failed or quietly stopped (recorded by server/plugins/cron-monitor.ts)
  let cronProblems: string[] = []
  let cronJobs = 0
  try {
    const runs = await prisma.cronRun.findMany()
    cronJobs = runs.length
    cronProblems = assessCronRuns(runs, now)
    if (cronProblems.length > 0) {
      await sendSlackNotification(`:alarm_clock: Cron problems:\n• ${cronProblems.join('\n• ')}`)
    }
  } catch (error) {
    console.error('[ScraperHealth] Cron check failed:', error)
  }

  // Classification embeds every music event as it goes, so music events classified in the last day
  // without an embedding mean embedding or classification calls are failing now. Older gaps are never
  // backfilled, so counting them would repeat one blip every morning.
  let missingEmbeddings: number | null = null
  try {
    const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM events
      WHERE embedding IS NULL AND "isMusic" = true AND "isCancelled" = false AND "startsAt" >= now()
        AND "classifiedAt" >= now() - interval '26 hours'
    `
    missingEmbeddings = Number(row?.count ?? 0)
    if (missingEmbeddings > 0) {
      await sendSlackNotification(`:jigsaw: ${missingEmbeddings} music events classified in the last day have no embedding, so recommendations and chat search skip them. Check the scraper logs for embedding or classification errors.`)
    }
  } catch (error) {
    console.error('[ScraperHealth] Embedding check failed:', error)
  }

  // Spotify playlists that have not synced in a day and a half (a revoked token stops all of them)
  let brokenPlaylists: string[] = []
  try {
    brokenPlaylists = stalePlaylists(await prisma.spotifyPlaylist.findMany({ select: { name: true, syncEnabled: true, lastSyncedAt: true } }), now)
    if (brokenPlaylists.length > 0) {
      await sendSlackNotification(`:headphones: ${brokenPlaylists.length} Spotify playlist(s) have not synced in over 36h: ${brokenPlaylists.join(', ')}. See /admin/spotify; a revoked token needs a reconnect at /api/spotify/authorize.`)
    }
  } catch (error) {
    console.error('[ScraperHealth] Playlist check failed:', error)
  }

  // Daily check-in: a missing 7am message means the alerting itself is down
  const issueCount = staleScrapers.length + failingScrapers.length + silentScrapers.length + quietScrapers.length
    + unavailableModels.length + cronProblems.length + brokenPlaylists.length + (backup && !backup.ok ? 1 : 0) + (missingEmbeddings ? 1 : 0)
  await sendSlackNotification(issueCount === 0
    ? `:white_check_mark: Daily check: all clear. ${sources.length} scrapers, ${cronJobs} cron jobs and models healthy${backup?.ok ? `, newest backup ${backup.ageHours}h old` : ''}.`
    : `:clipboard: Daily check: ${issueCount} issue(s), details above.`)

  return {
    success: true,
    timestamp: now.toISOString(),
    unavailableModels,
    backup,
    cronProblems,
    missingEmbeddings,
    brokenPlaylists,
    summary: {
      total: sources.length,
      stale: staleScrapers.length,
      failing: failingScrapers.length,
      silent: silentScrapers.length,
      quiet: quietScrapers.length,
      disabled: disabledScrapers.length,
    },
    staleScrapers: staleScrapers.map(s => s.slug),
    failingScrapers: failingScrapers.map(s => s.slug),
    silentScrapers: silentScrapers.map(s => s.slug),
    quietScrapers: quietScrapers.map(s => s.slug),
    disabledScrapers: disabledScrapers.map(s => s.slug),
  }
})
