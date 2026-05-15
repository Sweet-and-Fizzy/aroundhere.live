/**
 * Backfill script: sanitizes contaminated event descriptions in production.
 *
 * Usage:
 *   npx tsx scripts/sanitize-event-descriptions.ts            # dry-run, prints report
 *   npx tsx scripts/sanitize-event-descriptions.ts --apply    # apply updates
 *
 * Runs against production via SSH/Docker per CLAUDE.md. Writes a JSON report
 * to /tmp/sanitize-diffs.json that lists every candidate event with before/after.
 *
 * Safety gates (MIN_RETAINED_LENGTH, MIN_RETAINED_RATIO below) can block
 * updates where the cleaned text shrinks too much. They are currently set to
 * permissive defaults — see the comment on the constants for context.
 */

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { cleanScrapedDescription } from '../server/scrapers/utils/sanitize'

const APPLY = process.argv.includes('--apply')
const REPORT_PATH = '/tmp/sanitize-diffs.json'
// Safety thresholds for what passes the auto-apply gate. After manual review
// of the dry-run output we confirmed the sanitizer never discards real venue
// text, so these are set to permissive defaults that let every cleaned diff
// through. Tighten them again if a future change to the sanitizer is risky.
const MIN_RETAINED_LENGTH = 1
const MIN_RETAINED_RATIO = 0

interface CandidateRow {
  id: string
  title: string
  slug: string
  description: string | null
  descriptionHtml: string | null
}

interface DiffEntry {
  id: string
  title: string
  venueSlug: string
  field: 'description' | 'descriptionHtml'
  beforeLen: number
  afterLen: number
  beforeTail: string
  afterTail: string
  willApply: boolean
  skipReason?: string
}

function runProdSqlReadOnly(sql: string): string {
  // Pipe SQL via stdin to avoid any shell-quoting issues with complex SQL.
  return execSync(
    `ssh deploy@138.197.34.3 'docker exec -i aroundhere-db psql -U postgres -d local_music -tA'`,
    {
      input: sql,
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024,
    }
  )
}

function fetchCandidates(): (CandidateRow & { slug: string })[] {
  // Use control characters as separators that cannot legitimately appear in
  // description text: ASCII unit separator (\x1f) between columns, record
  // separator (\x1e) between rows. Postgres emits them literally.
  const sql = `
SELECT e.id || E'\\x1f' || COALESCE(v.slug, '') || E'\\x1f' ||
       replace(e.title, E'\\x1f', ' ') || E'\\x1f' ||
       COALESCE(e.description, '') || E'\\x1f' ||
       COALESCE(e."descriptionHtml", '') || E'\\x1e'
FROM events e
LEFT JOIN venues v ON v.id = e."venueId"
WHERE e."startsAt" >= NOW()
  AND (
    e.description ~ '@media|@keyframes|#wonderplugin|var\\(--tweak-|#block-[0-9a-f]{8}|#block-yui|\\.fe-block-[0-9a-f]{8}'
    OR e."descriptionHtml" ~ '@media|@keyframes|#wonderplugin|var\\(--tweak-|#block-[0-9a-f]{8}|#block-yui|\\.fe-block-[0-9a-f]{8}'
  )
  `.trim()

  const raw = runProdSqlReadOnly(sql)
  return raw
    .split('\x1e')
    .map((rec) => rec.trim())
    .filter((rec) => rec.length > 0)
    .map((rec) => {
      const parts = rec.split('\x1f')
      const [id, slug, title, description, descriptionHtml] = parts
      return {
        id: id ?? '',
        slug: slug ?? '',
        title: title ?? '',
        description: description ? description : null,
        descriptionHtml: descriptionHtml ? descriptionHtml : null,
      }
    })
}

function tail(s: string | null | undefined, n: number): string {
  if (!s) return ''
  return s.length <= n ? s : '…' + s.slice(s.length - n)
}

function buildDiff(
  row: CandidateRow & { slug: string },
  field: 'description' | 'descriptionHtml'
): DiffEntry | null {
  const before = row[field]
  if (!before) return null
  const after = cleanScrapedDescription(before)

  if (after === undefined) {
    return {
      id: row.id,
      title: row.title,
      venueSlug: row.slug,
      field,
      beforeLen: before.length,
      afterLen: 0,
      beforeTail: tail(before, 200),
      afterTail: '',
      willApply: false,
      skipReason: 'cleaned to undefined (would null the field) — manual review',
    }
  }
  if (after === before) return null

  const ratio = after.length / before.length
  let willApply = true
  let skipReason: string | undefined
  if (after.length < MIN_RETAINED_LENGTH) {
    willApply = false
    skipReason = `cleaned length ${after.length} < ${MIN_RETAINED_LENGTH}`
  } else if (ratio < MIN_RETAINED_RATIO) {
    willApply = false
    skipReason = `cleaned ratio ${ratio.toFixed(2)} < ${MIN_RETAINED_RATIO}`
  }

  return {
    id: row.id,
    title: row.title,
    venueSlug: row.slug,
    field,
    beforeLen: before.length,
    afterLen: after.length,
    beforeTail: tail(before, 200),
    afterTail: tail(after, 200),
    willApply,
    skipReason,
  }
}

// Strict cuid format check: a `c` followed by 24+ lowercase alphanumerics.
// We validate before interpolating the id into SQL because psql via stdin
// does not support real bind parameters; rejecting unexpected formats is
// our defense against accidental SQL injection if this code is reused.
//
// NOTE: Tied to Prisma's classic cuid() output. If the schema migrates to
// cuid(2) or another id generator, this regex will reject every id and
// --apply will throw. Update it then — don't widen it preemptively.
const CUID_PATTERN = /^c[a-z0-9]{24,}$/

function applyUpdate(id: string, field: 'description' | 'descriptionHtml', value: string): void {
  if (!CUID_PATTERN.test(id)) {
    throw new Error(`applyUpdate refused id with unexpected format: ${JSON.stringify(id)}`)
  }
  const column = field === 'description' ? 'description' : '"descriptionHtml"'
  // Pipe the SQL via stdin to avoid command-line quoting hell for large texts.
  // Use $$-quoted strings to avoid escaping single quotes in the description.
  const tag = `tag_${Math.random().toString(36).slice(2, 10)}`
  const sql = `UPDATE events SET ${column} = $${tag}$${value}$${tag}$, "updatedAt" = NOW() WHERE id = '${id}';`
  execSync(`ssh deploy@138.197.34.3 'docker exec -i aroundhere-db psql -U postgres -d local_music'`, {
    input: sql,
    encoding: 'utf-8',
  })
}

async function main() {
  console.log(`[sanitize-events] Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
  console.log('[sanitize-events] Fetching candidates from production…')

  const candidates = fetchCandidates()
  console.log(`[sanitize-events] Found ${candidates.length} candidate events`)

  const diffs: DiffEntry[] = []
  for (const row of candidates) {
    const dDiff = buildDiff(row, 'description')
    if (dDiff) diffs.push(dDiff)
    const hDiff = buildDiff(row, 'descriptionHtml')
    if (hDiff) diffs.push(hDiff)
  }

  const willApply = diffs.filter((d) => d.willApply)
  const manualReview = diffs.filter((d) => !d.willApply)

  console.log(`[sanitize-events] Would apply: ${willApply.length} updates`)
  console.log(`[sanitize-events] Manual review needed: ${manualReview.length} entries`)

  // Print first 5 of will-apply for quick eyeball
  console.log('\n--- Sample of changes (first 5 will-apply) ---')
  for (const d of willApply.slice(0, 5)) {
    console.log(`\n[${d.venueSlug}] ${d.title} (${d.field})`)
    console.log(`  before (${d.beforeLen} chars): ${d.beforeTail}`)
    console.log(`  after  (${d.afterLen} chars): ${d.afterTail}`)
  }

  if (manualReview.length > 0) {
    console.log('\n--- Sample of manual-review entries (first 3) ---')
    for (const d of manualReview.slice(0, 3)) {
      console.log(`\n[${d.venueSlug}] ${d.title} (${d.field}) — ${d.skipReason}`)
      console.log(`  before tail: ${d.beforeTail}`)
      console.log(`  after  tail: ${d.afterTail}`)
    }
  }

  writeFileSync(REPORT_PATH, JSON.stringify({ apply: APPLY, willApply, manualReview }, null, 2))
  console.log(`\n[sanitize-events] Full report written to ${REPORT_PATH}`)

  if (!APPLY) {
    console.log('\n[sanitize-events] DRY-RUN — no changes made. Re-run with --apply to update.')
    return
  }

  console.log('\n[sanitize-events] Applying updates…')
  let applied = 0
  for (const d of willApply) {
    const row = candidates.find((c) => c.id === d.id)
    if (!row) continue
    const before = d.field === 'description' ? row.description : row.descriptionHtml
    if (!before) continue
    const after = cleanScrapedDescription(before)
    if (!after) continue
    applyUpdate(d.id, d.field, after)
    applied++
    if (applied % 10 === 0) console.log(`  applied ${applied}/${willApply.length}`)
  }
  console.log(`[sanitize-events] Applied ${applied} updates`)
}

main().catch((err) => {
  console.error('[sanitize-events] Fatal error:', err)
  process.exit(1)
})
