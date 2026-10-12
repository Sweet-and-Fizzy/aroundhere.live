/**
 * Health of the nightly database backups written by scripts/backup.sh.
 * The daily scraper-health digest reports anything that isn't ok, so a backup
 * job that silently stops running gets noticed within a day.
 */

export type BackupFile = { name: string; mtime: Date; size: number }

export type BackupAssessment =
  | { ok: true; latest: string; ageHours: number; sizeBytes: number }
  | { ok: false; problem: string; latest?: string }

const DUMP = /^local_music_.*\.dump$/
const MAX_AGE_HOURS = 26
// The 151 MB database dumps to ~65 MB; anything this small is a failed dump.
const MIN_BYTES = 10_000_000

export function assessBackups(files: BackupFile[], now: Date): BackupAssessment {
  const dumps = files.filter(f => DUMP.test(f.name)).sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
  const latest = dumps[0]
  if (!latest) return { ok: false, problem: 'No database backups found' }

  const ageHours = Math.round((now.getTime() - latest.mtime.getTime()) / (60 * 60 * 1000))
  if (ageHours > MAX_AGE_HOURS) {
    return { ok: false, latest: latest.name, problem: `Newest database backup is ${ageHours}h old (${latest.name})` }
  }
  if (latest.size < MIN_BYTES) {
    return { ok: false, latest: latest.name, problem: `Newest database backup is only ${latest.size} bytes (${latest.name})` }
  }
  return { ok: true, latest: latest.name, ageHours, sizeBytes: latest.size }
}
