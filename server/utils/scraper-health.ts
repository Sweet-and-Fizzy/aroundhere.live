const DAY_MS = 24 * 60 * 60 * 1000

// A run is only treated as collapsed when the previous run had a real calendar.
// Venues that wind down to 1-2 events and then 0 are normal, not breakage.
const COLLAPSE_MIN_PREVIOUS = 3

const QUIET_FLOOR_DAYS = 30
const QUIET_CADENCE_MULTIPLIER = 4
const QUIET_HISTORY_DAYS = 180
const QUIET_MIN_HISTORY_DAYS = 5

/**
 * Detect a scraper whose results collapsed to zero after a healthy run, the
 * signature of a moved page, soft-404, or broken selector. A drop to zero only
 * counts while events already saved from the source are still in the future:
 * once they have all passed, the calendar simply ran out (a festival weekend,
 * a season's last shows) and the zero is left to silent tracking. This also
 * lets a collapse clear itself once the stranded events' dates go by.
 *
 * @param strandedCount saved, non-canceled future events linked to the source
 * @returns an error message, or null when the run looks fine
 */
export function detectEventCollapse(
  previousCount: number | null,
  acceptedCount: number,
  strandedCount: number
): string | null {
  if (acceptedCount > 0 || previousCount === null || previousCount < COLLAPSE_MIN_PREVIOUS || strandedCount === 0) {
    return null
  }
  return `Returned 0 upcoming events, but ${strandedCount} already saved from this source are still in the future (previous run had ${previousCount})`
}

/**
 * Detect a source that has stopped discovering new events relative to its own
 * cadence (e.g. a scraper reading an abandoned widget that still lists old
 * shows). History is measured back from the last new event rather than from
 * now, so a long-dead source doesn't age out of its own history.
 *
 * @param creationDates when each event linked to the source was first created
 */
export function findGoneQuiet(
  creationDates: Date[],
  now: Date
): { quietDays: number; thresholdDays: number } | null {
  const days = [...new Set(creationDates.map(d => Math.floor(d.getTime() / DAY_MS)))].sort(
    (a, b) => a - b
  )
  const last = days[days.length - 1]
  if (last === undefined) return null

  const history = days.filter(d => d > last - QUIET_HISTORY_DAYS)
  if (history.length < QUIET_MIN_HISTORY_DAYS) return null

  const gaps = history.slice(1).map((d, i) => d - history[i]!).sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  const medianGap = gaps.length % 2 ? gaps[mid]! : (gaps[mid - 1]! + gaps[mid]!) / 2

  const thresholdDays = Math.max(QUIET_FLOOR_DAYS, QUIET_CADENCE_MULTIPLIER * medianGap)
  const quietDays = Math.floor(now.getTime() / DAY_MS) - last
  return quietDays > thresholdDays ? { quietDays, thresholdDays } : null
}

// Silent scrapers are listed daily for this long, then only in the weekly reminder
const SILENT_RECENT_DAYS = 7
const WEEKLY_REMINDER_DAY = 'Monday'
const DIGEST_TIMEZONE = 'America/New_York'

/**
 * Track when a scraper's current run of zero upcoming events began. A zero
 * alone can't tell an empty calendar from a broken parser, so the digest
 * surfaces changes instead. The clock restarts when the scraper comes back
 * from failing, when it stops seeing anything on the page, or when new
 * entries appear and none are upcoming (unreadable new shows or a misread
 * page). Old events dropping off the page is normal and keeps the clock.
 *
 * @param upcoming events accepted after past events are dropped
 * @param found events the scraper returned, past ones included
 */
export function nextSilentSince(
  prev: { silentSince: Date | null; lastFoundCount: number | null; lastRunStatus: string | null },
  upcoming: number,
  found: number,
  now: Date
): Date | null {
  if (upcoming > 0) return null
  if (!prev.silentSince || prev.lastRunStatus === 'failed') return now
  if (prev.lastFoundCount === null) return prev.silentSince
  if (found === 0 && prev.lastFoundCount > 0) return now
  if (found > prev.lastFoundCount) return now
  return prev.silentSince
}

/**
 * Split silent scrapers into recent silences (listed every day) and long-quiet
 * ones (listed only in the weekly reminder). A missing start counts as recent.
 */
export function splitSilentScrapers<T extends { silentSince?: Date | null }>(
  rows: T[],
  now: Date
): { recent: T[]; longQuiet: T[] } {
  const cutoff = now.getTime() - SILENT_RECENT_DAYS * DAY_MS
  const recent = rows.filter(r => !r.silentSince || r.silentSince.getTime() >= cutoff)
  const longQuiet = rows.filter(r => r.silentSince && r.silentSince.getTime() < cutoff)
  return { recent, longQuiet }
}

export function isWeeklyReminderDay(now: Date): boolean {
  return now.toLocaleDateString('en-US', { weekday: 'long', timeZone: DIGEST_TIMEZONE }) === WEEKLY_REMINDER_DAY
}
