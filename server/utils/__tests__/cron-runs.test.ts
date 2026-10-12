import { describe, it, expect } from 'vitest'
import { cronRunName, assessCronRuns, redactCronSecret, nextSuccessTimes, playlistSyncChange, stalePlaylists, type CronRunRow } from '../cron-runs'

const HOUR = 60 * 60 * 1000
const now = new Date('2026-10-12T11:00:00Z')
const ago = (h: number) => new Date(now.getTime() - h * HOUR)
const row = (over: Partial<CronRunRow>): CronRunRow => ({ name: 'job', lastSuccessAt: ago(1), prevSuccessAt: ago(25), lastStatus: 200, lastError: null, lastFinishedAt: ago(1), ...over })

describe('cronRunName', () => {
  it('names a job by its path, plus the task when there is one', () => {
    expect(cronRunName('/api/cron/scrapers?token=abc')).toBe('scrapers')
    expect(cronRunName('/api/cron/spotify?task=sync&token=abc')).toBe('spotify:sync')
    expect(cronRunName('/api/cron/scraper-health')).toBe('scraper-health')
  })

  it('ignores everything else', () => {
    expect(cronRunName('/api/events')).toBeNull()
    expect(cronRunName('/api/cron/')).toBeNull()
    expect(cronRunName('/api/cron/a/b')).toBeNull()
  })
})

describe('assessCronRuns', () => {
  it('is quiet when every job is on schedule', () => {
    expect(assessCronRuns([row({}), row({ name: 'twice-daily', lastSuccessAt: ago(9), prevSuccessAt: ago(19) })], now)).toEqual([])
  })

  it('flags a job whose last run failed', () => {
    const problems = assessCronRuns([row({ name: 'scrapers', lastStatus: 500, lastError: 'boom' })], now)
    expect(problems).toEqual(['`scrapers` failed on its last run (500: boom)'])
  })

  it('flags a daily job that stopped running', () => {
    const problems = assessCronRuns([row({ name: 'chat-summary', lastSuccessAt: ago(50), prevSuccessAt: ago(74) })], now)
    expect(problems).toEqual(['`chat-summary` has not run in 50h (usually every 24h)'])
  })

  it('gives a weekly job a week before flagging it', () => {
    expect(assessCronRuns([row({ name: 'weekly', lastSuccessAt: ago(160), prevSuccessAt: ago(328) })], now)).toEqual([])
  })

  it('cannot judge a job that has only succeeded once', () => {
    expect(assessCronRuns([row({ lastSuccessAt: ago(500), prevSuccessAt: null })], now)).toEqual([])
  })
})

describe('nextSuccessTimes', () => {
  it('shifts the previous success back on a normal run', () => {
    expect(nextSuccessTimes(ago(24), ago(48), now)).toEqual({ lastSuccessAt: now, prevSuccessAt: ago(24) })
  })

  it('keeps the learned gap when a manual run follows a scheduled one', () => {
    // scheduled at 7:00, manual check at 7:05
    expect(nextSuccessTimes(new Date(now.getTime() - 5 * 60 * 1000), ago(24), now)).toEqual({ lastSuccessAt: now, prevSuccessAt: ago(24) })
  })

  it('handles the first two runs', () => {
    expect(nextSuccessTimes(null, null, now)).toEqual({ lastSuccessAt: now, prevSuccessAt: null })
  })
})

describe('playlistSyncChange', () => {
  it('reports a playlist that just started failing', () => {
    expect(playlistSyncChange(true, ago(24), now)).toBe('failing')
  })

  it('stays quiet on later failures; the digest lists stale playlists instead', () => {
    expect(playlistSyncChange(true, ago(48), now)).toBeNull()
  })

  it('reports recovery after a long outage, including one that predates this check', () => {
    expect(playlistSyncChange(false, new Date('2026-03-19T10:00:00Z'), now)).toBe('recovered')
  })

  it('ignores routine successes and brand new playlists', () => {
    expect(playlistSyncChange(false, ago(24), now)).toBeNull()
    expect(playlistSyncChange(false, null, now)).toBeNull()
  })
})

describe('stalePlaylists', () => {
  it('lists enabled playlists without a recent successful sync', () => {
    const rows = [
      { name: 'fresh', syncEnabled: true, lastSyncedAt: ago(20) },
      { name: 'broken since March', syncEnabled: true, lastSyncedAt: new Date('2026-03-19T10:00:00Z') },
      { name: 'never synced', syncEnabled: true, lastSyncedAt: null },
      { name: 'paused', syncEnabled: false, lastSyncedAt: null },
    ]
    expect(stalePlaylists(rows, now)).toEqual(['broken since March', 'never synced'])
  })
})

describe('redactCronSecret', () => {
  it('removes the cron token from error messages', () => {
    expect(redactCronSecret('Page not found: /api/cron/scrapers?token=s3cret&x=1')).toBe('Page not found: /api/cron/scrapers?token=[redacted]&x=1')
    expect(redactCronSecret('plain error')).toBe('plain error')
    expect(redactCronSecret(null)).toBeNull()
  })
})
