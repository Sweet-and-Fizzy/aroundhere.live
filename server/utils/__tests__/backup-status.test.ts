import { describe, it, expect } from 'vitest'
import { assessBackups } from '../backup-status'

const HOUR = 60 * 60 * 1000
const now = new Date('2026-10-12T07:00:00Z')
const file = (name: string, hoursAgo: number, bytes = 60_000_000) => ({ name, mtime: new Date(now.getTime() - hoursAgo * HOUR), size: bytes })

describe('assessBackups', () => {
  it('is healthy when the newest dump is recent and large enough', () => {
    const result = assessBackups([file('local_music_20261012_020000.dump', 5), file('local_music_20261011_020000.dump', 29)], now)
    expect(result).toEqual({ ok: true, latest: 'local_music_20261012_020000.dump', ageHours: 5, sizeBytes: 60_000_000 })
  })

  it('flags a missing backup', () => {
    expect(assessBackups([], now)).toMatchObject({ ok: false, problem: 'No database backups found' })
  })

  it('ignores files that are not dumps', () => {
    expect(assessBackups([file('notes.txt', 1), file('local_music_x.sql.gz.tmp', 1)], now)).toMatchObject({ ok: false })
  })

  it('flags a stale backup', () => {
    const result = assessBackups([file('local_music_20261010_020000.dump', 53)], now)
    expect(result).toMatchObject({ ok: false, latest: 'local_music_20261010_020000.dump' })
    expect(!result.ok && result.problem).toContain('53h old')
  })

  it('flags a suspiciously small newest dump even if an older one was fine', () => {
    const result = assessBackups([file('local_music_20261012_020000.dump', 5, 20), file('local_music_20261011_020000.dump', 29)], now)
    expect(result).toMatchObject({ ok: false, latest: 'local_music_20261012_020000.dump' })
    expect(!result.ok && result.problem).toContain('20 bytes')
  })

  it('counts manual dumps too', () => {
    expect(assessBackups([file('local_music_manual_20261012_010000.dump', 6)], now)).toMatchObject({ ok: true })
  })
})
