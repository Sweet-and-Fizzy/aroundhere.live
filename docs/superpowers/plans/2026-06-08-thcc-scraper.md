# The Heavy Culture Cooperative (THCC) Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hardcoded scraper that ingests upcoming events from The Heavy Culture Cooperative's Wix `/shows` page into our events pipeline.

**Architecture:** An `HttpScraper` subclass fetches `https://www.theheavyculture.coop/shows`, extracts the `<script id="wix-warmup-data">` JSON block from the HTML, walks it to collect every Wix Events `events.events` array, merges and dedupes the event objects by `id`, drops past events, and maps each to a `ScrapedEvent`. No browser is required because the event data is server-rendered into the warmup-data script.

**Tech Stack:** TypeScript, `cheerio` (already used by `HttpScraper`), `vitest` for tests. Dates arrive as full UTC ISO strings, so plain `new Date()` suffices — no `date-fns-tz` needed.

---

## Background: the data shape (verified against the live page 2026-06-08)

The page contains `<script id="wix-warmup-data">{...JSON...}</script>`. Inside that JSON, Wix Events
widgets store their events at paths like:

```
appsWarmupData["140603ad-af8d-84a5-2c80-a0f60cb47351"]["widgetcomp-lk7y78fx"].events.events
```

There are **multiple** such widget arrays on the page (observed lengths 4, 7, and 25). The app id and
widget keys are not stable, so we do **not** hardcode them — instead we recursively walk the parsed
JSON for any object shaped `{ events: { events: [...] } }` and merge all arrays, deduping by event `id`.

Each event object has (fields we use):

```jsonc
{
  "id": "e602a051-cfdc-49db-b8f1-b39413775573",
  "title": "Oxen / Problem With Dragons / Ash & Bone",
  "description": "",          // often empty
  "about": "",                // often empty
  "slug": "oxen-problem-with-dragons-ash-bone",
  "mainImage": { "url": "https://static.wixstatic.com/media/...png", "width": 1350, "height": 1350 },
  "scheduling": {
    "config": {
      "startDate": "2026-06-06T23:00:00.000Z",  // full UTC ISO
      "endDate":   "2026-06-07T03:00:00.000Z",  // may be present
      "timeZoneId": "America/New_York",
      "endDateHidden": true
    }
  }
}
```

Event detail URL pattern (verified): `https://www.theheavyculture.coop/event-details-registration/{slug}`.

The warmup-data JSON contains **no external ticket URL** (Eventbrite links live elsewhere in the page
HTML, not in this block). So we omit `ticketUrl` and rely on `sourceUrl` (the event-details page),
which handles both on-site RSVP and Eventbrite redirects.

---

## File Structure

- **Create** `server/scrapers/venues/the-heavy-culture-coop.ts` — config + scraper class. Single
  responsibility: fetch THCC's page, extract warmup-data events, map to `ScrapedEvent`.
- **Create** `server/scrapers/__tests__/the-heavy-culture-coop.test.ts` — vitest unit tests driving the
  parser against an inline fixture (and the saved HTML fixture).
- **Create** `server/scrapers/__tests__/fixtures/thcc-shows.html` — saved copy of the live `/shows` HTML
  for the test to parse offline.
- **Modify** `server/scrapers/runner.ts` — import and register the scraper.
- **Create** `scripts/test-thcc-scraper.ts` — manual live-run script mirroring existing test scripts.

---

## Task 1: Save the HTML fixture

**Files:**
- Create: `server/scrapers/__tests__/fixtures/thcc-shows.html`

- [ ] **Step 1: Download the live page into the fixtures directory**

Run:
```bash
mkdir -p server/scrapers/__tests__/fixtures
curl -s -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" \
  "https://www.theheavyculture.coop/shows" \
  -o server/scrapers/__tests__/fixtures/thcc-shows.html
```

- [ ] **Step 2: Verify the fixture contains the warmup-data block and event titles**

Run:
```bash
grep -c 'id="wix-warmup-data"' server/scrapers/__tests__/fixtures/thcc-shows.html
grep -c '"scheduling"' server/scrapers/__tests__/fixtures/thcc-shows.html
```
Expected: first command prints `1`; second prints a number ≥ 1 (currently ~36).

- [ ] **Step 3: Commit**

```bash
git add server/scrapers/__tests__/fixtures/thcc-shows.html
git commit -m "test: add THCC /shows HTML fixture for scraper tests"
```

---

## Task 2: Scaffold the scraper file with config and a pure parser helper

We split parsing into two pure, testable functions so the tests don't need network or the class:
`extractWarmupEvents(html)` (HTML → raw Wix event objects) and `mapToScrapedEvent(raw, now)` (raw → `ScrapedEvent | null`). The class wires them together.

**Files:**
- Create: `server/scrapers/venues/the-heavy-culture-coop.ts`

- [ ] **Step 1: Write the file with config, types, and the two pure functions**

```ts
import { HttpScraper } from '../base'
import type { ScrapedEvent, ScraperConfig } from '../types'

export const theHeavyCultureCoopConfig: ScraperConfig = {
  id: 'the-heavy-culture-coop',
  name: 'The Heavy Culture Cooperative',
  venueSlug: 'the-heavy-culture-coop',
  url: 'https://www.theheavyculture.coop/shows',
  enabled: true,
  schedule: '0 6,14 * * *', // 6 AM and 2 PM daily
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  // defaultAgeRestriction intentionally unset: THCC publishes no age policy.
  // Per-event classification handles age. One-line change if we set a default later.
}

const EVENT_DETAILS_BASE = 'https://www.theheavyculture.coop/event-details-registration'

// Shape of the Wix Events objects we read from the warmup-data JSON.
// Only the fields we consume are typed; everything else is ignored.
export interface WixWarmupEvent {
  id?: string
  title?: string
  description?: string
  about?: string
  slug?: string
  mainImage?: { url?: string }
  scheduling?: {
    config?: {
      startDate?: string
      endDate?: string
      endDateHidden?: boolean
    }
  }
}

/**
 * Extract the JSON inside <script id="wix-warmup-data">...</script> and recursively
 * collect every Wix Events array (objects shaped { events: { events: [...] } }).
 * Dedupes the merged events by `id`. Returns [] if the block is missing/unparseable.
 */
export function extractWarmupEvents(html: string): WixWarmupEvent[] {
  const idAnchor = html.indexOf('id="wix-warmup-data"')
  if (idAnchor === -1) return []

  const open = html.indexOf('>', idAnchor)
  const close = html.indexOf('</script>', open)
  if (open === -1 || close === -1) return []

  const blob = html.slice(open + 1, close).trim()

  let data: unknown
  try {
    data = JSON.parse(blob)
  } catch {
    return []
  }

  const collected: WixWarmupEvent[] = []
  const seen = new Set<string>()

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>
      const events = obj.events as Record<string, unknown> | undefined
      const inner = events?.events
      if (Array.isArray(inner)) {
        for (const ev of inner as WixWarmupEvent[]) {
          const key = ev?.id || ev?.slug
          if (key && !seen.has(key)) {
            seen.add(key)
            collected.push(ev)
          }
        }
      }
      for (const value of Object.values(obj)) walk(value)
    }
  }

  walk(data)
  return collected
}

/**
 * Map a raw Wix event to a ScrapedEvent. Returns null if it lacks a title or a
 * valid start date, or if the event is in the past relative to `now`.
 */
export function mapToScrapedEvent(raw: WixWarmupEvent, now: Date): ScrapedEvent | null {
  const title = (raw.title || '').trim()
  if (!title) return null

  const startRaw = raw.scheduling?.config?.startDate
  if (!startRaw) return null

  const startsAt = new Date(startRaw)
  if (isNaN(startsAt.getTime())) return null

  // Skip past events
  if (startsAt < now) return null

  const cfg = raw.scheduling?.config
  let endsAt: Date | undefined
  if (cfg?.endDate && !cfg.endDateHidden) {
    const parsed = new Date(cfg.endDate)
    if (!isNaN(parsed.getTime())) endsAt = parsed
  }

  const description = (raw.description || raw.about || '').trim() || undefined
  const imageUrl = raw.mainImage?.url || undefined

  // Prefer the stable Wix UUID for the source id; fall back to slug.
  const idPart = raw.id || raw.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const sourceEventId = `thcc-${idPart}`

  const sourceUrl = raw.slug ? `${EVENT_DETAILS_BASE}/${raw.slug}` : theHeavyCultureCoopConfig.url

  return {
    title,
    description,
    startsAt,
    endsAt,
    sourceUrl,
    sourceEventId,
    imageUrl,
  }
}

export class TheHeavyCultureCoopScraper extends HttpScraper {
  constructor() {
    super(theHeavyCultureCoopConfig)
  }

  protected async parseEvents(html: string): Promise<ScrapedEvent[]> {
    const raw = extractWarmupEvents(html)
    const now = new Date()
    const events = raw
      .map((r) => mapToScrapedEvent(r, now))
      .filter((e): e is ScrapedEvent => e !== null)

    // If the page loaded but we parsed zero events, the embed format likely changed.
    // Throw so the base HttpScraper marks the run failed and FailureDetectionService fires.
    if (events.length === 0) {
      throw new Error(
        `[${this.config.name}] Parsed 0 events from ${raw.length} warmup-data entries — embed format may have changed`
      )
    }

    console.log(`[${this.config.name}] Parsed ${events.length} events`)
    return events
  }
}
```

- [ ] **Step 2: Type-check the new file compiles**

Run: `npx tsc --noEmit -p server/scrapers/tsconfig.json`
Expected: no errors referencing `the-heavy-culture-coop.ts`.

- [ ] **Step 3: Commit**

```bash
git add server/scrapers/venues/the-heavy-culture-coop.ts
git commit -m "feat: add THCC scraper (config + warmup-data parser)"
```

---

## Task 3: Test `extractWarmupEvents` against the saved fixture

**Files:**
- Create: `server/scrapers/__tests__/the-heavy-culture-coop.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  extractWarmupEvents,
  mapToScrapedEvent,
} from '../venues/the-heavy-culture-coop'

const fixture = readFileSync(
  join(__dirname, 'fixtures', 'thcc-shows.html'),
  'utf-8'
)

describe('extractWarmupEvents', () => {
  it('extracts the Wix Events objects from the warmup-data block', () => {
    const events = extractWarmupEvents(fixture)
    // The live fixture has on the order of ~25 unique events.
    expect(events.length).toBeGreaterThanOrEqual(10)
  })

  it('dedupes events that appear in more than one widget array', () => {
    const events = extractWarmupEvents(fixture)
    const ids = events.map((e) => e.id).filter(Boolean)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every extracted event has a title, slug, and start date', () => {
    const events = extractWarmupEvents(fixture)
    for (const e of events) {
      expect(e.title, 'title').toBeTruthy()
      expect(e.slug, 'slug').toBeTruthy()
      expect(e.scheduling?.config?.startDate, 'startDate').toBeTruthy()
    }
  })

  it('returns [] when the warmup-data block is absent', () => {
    expect(extractWarmupEvents('<html><body>no data</body></html>')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails (before parser is correct) or passes**

Run: `npx vitest run server/scrapers/__tests__/the-heavy-culture-coop.test.ts`
Expected: PASS (the parser from Task 2 is already implemented). If any test FAILS, fix the
parser in `the-heavy-culture-coop.ts` until green — do not weaken the assertions.

- [ ] **Step 3: Commit**

```bash
git add server/scrapers/__tests__/the-heavy-culture-coop.test.ts
git commit -m "test: cover THCC warmup-data extraction"
```

---

## Task 4: Test `mapToScrapedEvent` mapping and past-event filtering

**Files:**
- Modify: `server/scrapers/__tests__/the-heavy-culture-coop.test.ts`

- [ ] **Step 1: Add mapping tests to the existing file**

Append this `describe` block to `the-heavy-culture-coop.test.ts`:

```ts
import type { WixWarmupEvent } from '../venues/the-heavy-culture-coop'

describe('mapToScrapedEvent', () => {
  const base: WixWarmupEvent = {
    id: 'abc-123',
    title: 'Oxen / Problem With Dragons / Ash & Bone',
    slug: 'oxen-problem-with-dragons-ash-bone',
    mainImage: { url: 'https://static.wixstatic.com/media/x.png' },
    scheduling: {
      config: {
        startDate: '2999-06-06T23:00:00.000Z',
        endDate: '2999-06-07T03:00:00.000Z',
        endDateHidden: false,
      },
    },
  }
  const now = new Date('2026-06-08T00:00:00.000Z')

  it('maps a future event to a ScrapedEvent with all fields', () => {
    const e = mapToScrapedEvent(base, now)
    expect(e).not.toBeNull()
    expect(e!.title).toBe('Oxen / Problem With Dragons / Ash & Bone')
    expect(e!.startsAt.toISOString()).toBe('2999-06-06T23:00:00.000Z')
    expect(e!.endsAt?.toISOString()).toBe('2999-06-07T03:00:00.000Z')
    expect(e!.sourceUrl).toBe(
      'https://www.theheavyculture.coop/event-details-registration/oxen-problem-with-dragons-ash-bone'
    )
    expect(e!.sourceEventId).toBe('thcc-abc-123')
    expect(e!.imageUrl).toBe('https://static.wixstatic.com/media/x.png')
  })

  it('returns null for past events', () => {
    const past: WixWarmupEvent = {
      ...base,
      scheduling: { config: { startDate: '2020-01-01T00:00:00.000Z' } },
    }
    expect(mapToScrapedEvent(past, now)).toBeNull()
  })

  it('returns null when title or start date is missing', () => {
    expect(mapToScrapedEvent({ ...base, title: '' }, now)).toBeNull()
    expect(
      mapToScrapedEvent({ ...base, scheduling: { config: {} } }, now)
    ).toBeNull()
  })

  it('omits endsAt when endDateHidden is true', () => {
    const hidden: WixWarmupEvent = {
      ...base,
      scheduling: {
        config: {
          startDate: '2999-06-06T23:00:00.000Z',
          endDate: '2999-06-07T03:00:00.000Z',
          endDateHidden: true,
        },
      },
    }
    expect(mapToScrapedEvent(hidden, now)!.endsAt).toBeUndefined()
  })

  it('falls back to slug when id is absent for sourceEventId', () => {
    const noId: WixWarmupEvent = { ...base, id: undefined }
    expect(mapToScrapedEvent(noId, now)!.sourceEventId).toBe(
      'thcc-oxen-problem-with-dragons-ash-bone'
    )
  })
})
```

- [ ] **Step 2: Run the full test file**

Run: `npx vitest run server/scrapers/__tests__/the-heavy-culture-coop.test.ts`
Expected: PASS — all `extractWarmupEvents` and `mapToScrapedEvent` tests green.

- [ ] **Step 3: Commit**

```bash
git add server/scrapers/__tests__/the-heavy-culture-coop.test.ts
git commit -m "test: cover THCC event mapping and past-event filtering"
```

---

## Task 5: Register the scraper in the runner

**Files:**
- Modify: `server/scrapers/runner.ts` (import block near line 25; `scrapers` array near line 53)

- [ ] **Step 1: Add the import**

After the existing import line:
```ts
import { DailyOperationScraper } from './venues/daily-operation'
```
add:
```ts
import { TheHeavyCultureCoopScraper } from './venues/the-heavy-culture-coop'
```

- [ ] **Step 2: Register the instance**

In the `const scrapers: BaseScraper[] = [ ... ]` array, after:
```ts
  new DailyOperationScraper(),
```
add:
```ts
  new TheHeavyCultureCoopScraper(),
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p server/scrapers/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/scrapers/runner.ts
git commit -m "feat: register THCC scraper in runner"
```

---

## Task 6: Manual live-run script

**Files:**
- Create: `scripts/test-thcc-scraper.ts`

- [ ] **Step 1: Write the script**

```ts
/**
 * Manually run the THCC scraper against the live site and print parsed events.
 * Usage: npx tsx scripts/test-thcc-scraper.ts
 */
import 'dotenv/config'
import { TheHeavyCultureCoopScraper } from '../server/scrapers/venues/the-heavy-culture-coop'

async function main() {
  const scraper = new TheHeavyCultureCoopScraper()
  const result = await scraper.scrape()

  console.log(`\nsuccess: ${result.success}  events: ${result.events.length}  errors: ${result.errors.length}`)
  if (result.errors.length) console.log('errors:', result.errors)

  for (const e of result.events) {
    console.log(`\n  ${e.title}`)
    console.log(`    starts: ${e.startsAt.toISOString()}`)
    console.log(`    ends:   ${e.endsAt ? e.endsAt.toISOString() : '(none)'}`)
    console.log(`    url:    ${e.sourceUrl}`)
    console.log(`    id:     ${e.sourceEventId}`)
    console.log(`    image:  ${e.imageUrl ? e.imageUrl.slice(0, 70) + '...' : '(none)'}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Run it against the live site**

Run: `npx tsx scripts/test-thcc-scraper.ts`
Expected: `success: true`, a non-zero event count, each event with a future `starts` date, a
`event-details-registration/...` URL, and (for most) an image. Eyeball that titles look like real
shows (e.g. band slashes like "A / B / C").

- [ ] **Step 3: Commit**

```bash
git add scripts/test-thcc-scraper.ts
git commit -m "test: add manual THCC live-run script"
```

---

## Task 7: Full verification pass

- [ ] **Step 1: Run the scraper test suite**

Run: `npx vitest run server/scrapers/__tests__/the-heavy-culture-coop.test.ts`
Expected: all tests PASS.

- [ ] **Step 2: Run the project's pre-commit checks (lint + types) on the changed files**

Run: `npx tsc --noEmit -p server/scrapers/tsconfig.json && npx eslint server/scrapers/venues/the-heavy-culture-coop.ts server/scrapers/__tests__/the-heavy-culture-coop.test.ts scripts/test-thcc-scraper.ts server/scrapers/runner.ts`
Expected: no type errors, no lint errors.

- [ ] **Step 3: Confirm registration**

Run: `grep -n "TheHeavyCultureCoop" server/scrapers/runner.ts`
Expected: two matches — the import and the `new TheHeavyCultureCoopScraper()` registration.

---

## Notes for the implementer

- **Do not** reuse `server/scrapers/platforms/wix-calendar.ts`. It targets a different Wix widget
  (BoomTech FullCalendar iframe) and does not apply to THCC's Wix Events app.
- Dates from THCC are already full UTC ISO strings; never apply a timezone conversion to them or you
  will double-shift. Just `new Date(startDate)`.
- The warmup-data block can exceed 200 KB; that is expected. `JSON.parse` on it is fine.
- If `npm run db:migrate` or DB access is suggested anywhere, ignore it — this scraper touches no
  schema and the runner handles persistence.
