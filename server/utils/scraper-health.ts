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
 * signature of a moved page, soft-404, or broken selector. Returns an error
 * message, or null when the run looks fine.
 */
export function detectEventCollapse(
  previousCount: number | null,
  acceptedCount: number
): string | null {
  if (acceptedCount > 0 || previousCount === null || previousCount < COLLAPSE_MIN_PREVIOUS) {
    return null
  }
  return `Returned 0 upcoming events (previous run had ${previousCount})`
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
