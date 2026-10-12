/**
 * Cron job bookkeeping. server/plugins/cron-monitor.ts records every
 * /api/cron/* request in cron_runs; the daily digest uses assessCronRuns to
 * catch jobs that failed or quietly stopped running. Each job's expected gap
 * is learned from its own last two successes, so the check needs no list of
 * schedules and keeps working when docker/crontab changes.
 */

export type CronRunRow = {
  name: string
  lastSuccessAt: Date | null
  prevSuccessAt: Date | null
  lastStatus: number
  lastError: string | null
  lastFinishedAt: Date
}

const HOUR = 60 * 60 * 1000

/** "/api/cron/spotify?task=sync" -> "spotify:sync"; null for non-cron paths. */
export function cronRunName(url: string): string | null {
  const match = url.match(/^\/api\/cron\/([a-z0-9-]+)\/?(?:\?(.*))?$/i)
  if (!match) return null
  const task = new URLSearchParams(match[2] ?? '').get('task')
  return task ? `${match[1]}:${task}` : match[1]!
}

/** Error messages can echo the request URL, which carries CRON_SECRET as ?token=. */
export function redactCronSecret(message: string | null): string | null {
  return message?.replace(/token=[^&\s"']+/g, 'token=[redacted]') ?? null
}

export function assessCronRuns(rows: CronRunRow[], now: Date): string[] {
  const problems: string[] = []
  for (const row of rows) {
    if (row.lastStatus >= 400) {
      problems.push(`\`${row.name}\` failed on its last run (${row.lastStatus}${row.lastError ? `: ${row.lastError.slice(0, 200)}` : ''})`)
      continue
    }
    if (!row.lastSuccessAt || !row.prevSuccessAt) continue
    const gap = row.lastSuccessAt.getTime() - row.prevSuccessAt.getTime()
    const since = now.getTime() - row.lastSuccessAt.getTime()
    if (gap > 0 && since > 2 * gap + HOUR) {
      problems.push(`\`${row.name}\` has not run in ${Math.round(since / HOUR)}h (usually every ${Math.round(gap / HOUR)}h)`)
    }
  }
  return problems
}

/**
 * A run within an hour of the previous success (a manual trigger after a
 * deploy, say) does not move prevSuccessAt, so it cannot shrink the learned gap.
 */
export function nextSuccessTimes(prevLast: Date | null, prevPrev: Date | null, now: Date): { lastSuccessAt: Date; prevSuccessAt: Date | null } {
  if (prevLast && now.getTime() - prevLast.getTime() < HOUR) return { lastSuccessAt: now, prevSuccessAt: prevPrev }
  return { lastSuccessAt: now, prevSuccessAt: prevLast }
}

/** A daily playlist sync that has not succeeded for this long is broken. */
export const PLAYLIST_STALE_MS = 36 * HOUR

/**
 * Decide whether a cron sync of one playlist is news. Based on lastSyncedAt
 * (set only by a successful sync) rather than lastSyncError, because a
 * successful sync also records per-artist lookup hiccups there.
 */
export function playlistSyncChange(threw: boolean, lastSyncedAt: Date | null, now: Date): 'failing' | 'recovered' | null {
  const recentlyOk = lastSyncedAt !== null && now.getTime() - lastSyncedAt.getTime() < PLAYLIST_STALE_MS
  if (threw && recentlyOk) return 'failing'
  if (!threw && lastSyncedAt !== null && !recentlyOk) return 'recovered'
  return null
}

/** Enabled playlists with no successful sync recently; the digest repeats these daily, like stale scrapers. */
export function stalePlaylists(rows: { name: string; syncEnabled: boolean; lastSyncedAt: Date | null }[], now: Date): string[] {
  return rows
    .filter(r => r.syncEnabled && (r.lastSyncedAt === null || now.getTime() - r.lastSyncedAt.getTime() >= PLAYLIST_STALE_MS))
    .map(r => r.name)
}
