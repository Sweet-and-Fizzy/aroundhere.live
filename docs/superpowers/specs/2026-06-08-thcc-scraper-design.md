# The Heavy Culture Cooperative (THCC) Scraper — Design

Date: 2026-06-08

## Venue

- **Name:** The Heavy Culture Cooperative ("THCC")
- **Location:** 1 Northampton St, Easthampton, MA 01027 (Hampshire County, Pioneer Valley)
- **Venue slug (in our DB):** `the-heavy-culture-coop`
- **Source URL:** `https://www.theheavyculture.coop/shows`
- **Timezone:** `America/New_York`
- **Character:** Worker/artist/fan-owned cooperative DIY heavy-music venue with a full-service
  bar. Opened to the public January 2026.

## Goal

A hardcoded TypeScript scraper that pulls upcoming events from THCC's `/shows` page into our
events pipeline, matching the patterns of the existing scrapers in `server/scrapers/venues/`.

## Approach: `HttpScraper` (no browser)

THCC's site is built on Wix and uses the **Wix Events** app. Although the page is JavaScript-heavy
in the browser, the full event data is **server-rendered as escaped JSON inside the initial HTML**.
A plain `curl` (no JS execution) returns all events with clean structured fields. Therefore we
extend `HttpScraper`, fetch the page once, and parse the embedded JSON. This is faster, cheaper,
and more reliable than Playwright.

Note: the existing `server/scrapers/platforms/wix-calendar.ts` helper is **not** used — it targets
a different Wix widget (BoomTech FullCalendar iframe, `.fc-daygrid-event`). THCC uses the Wix Events
app, whose data shape is different.

## Data available per event (from embedded JSON)

Each event object in the HTML exposes (field names confirmed against the live page):

- `id` — stable UUID (e.g. `e602a051-cfdc-49db-b8f1-b39413775573`)
- `slug` — URL slug (e.g. `oxen-problem-with-dragons-ash-bone`)
- `title` — e.g. `Oxen / Problem With Dragons / Ash & Bone`
- `description` / `about` — often empty for THCC, but populated when present
- `scheduling.config.startDate` — ISO 8601 UTC (e.g. `2026-06-06T23:00:00.000Z`)
- `scheduling.config.endDate` — ISO 8601 UTC; may be present with `endDateHidden: true`
- `scheduling.config.timeZoneId` — `America/New_York`
- `mainImage.url` — full Wix static image URL
- `registration.type` — `2` = on-site RSVP; other types are external (Eventbrite link present
  in the data when applicable; 3 events currently use Eventbrite)

### Derived fields

- `sourceEventId` = `thcc-{id}` (stable across title edits, e.g. adding an opener)
- `startsAt` = parse `startDate` directly (already UTC ISO — no fragile date-string parsing)
- `endsAt` = parse `endDate` when present and not hidden; otherwise omit
- `sourceUrl` = `https://www.theheavyculture.coop/event-details-registration/{slug}`
  (confirmed event-detail path pattern)
- `imageUrl` = `mainImage.url`
- `ticketUrl` = **omitted.** Verification of the `wix-warmup-data` block showed it carries no
  external/Eventbrite ticket URL (those links live elsewhere in the page HTML, not in the clean
  JSON). `sourceUrl` (the event-details-registration page) already handles both on-site RSVP and
  Eventbrite redirects, so we keep the warmup-data the single source of truth and skip `ticketUrl`.
- `description` = `description || about`, when non-empty

## Parsing strategy

The events JSON is embedded **more than once** in the HTML (server-render + Wix warmup hydration),
so the same event appears multiple times. The page also contains many nested non-event objects that
have an `id` but are not events.

Strategy:

1. Unescape the HTML's JSON-escaped sequences enough to read event objects.
2. Identify event objects by the **co-occurrence of a `slug` and a `scheduling.config.startDate`**
   within the object (not by `id` alone — `id` appears on many non-event nodes).
3. Parse each event's fields.
4. **Deduplicate by `slug`** (the stable per-event key; ~25 distinct events currently).
5. Filter out events whose `startsAt` is in the past.

Implementation note: rather than `JSON.parse` the entire ~1.5 MB blob (brittle against the
surrounding Wix wrapper), extract and parse individual event objects. The exact extraction
mechanism (regex-bounded object slices vs. locating the warmup data array) is an implementation
detail for the plan; the contract is "return the deduped, future-dated events with the fields
above."

## Config

```ts
{
  id: 'the-heavy-culture-coop',
  name: 'The Heavy Culture Cooperative',
  venueSlug: 'the-heavy-culture-coop',
  url: 'https://www.theheavyculture.coop/shows',
  enabled: true,
  schedule: '0 6,14 * * *', // 6 AM and 2 PM daily, matching peers
  category: 'VENUE',
  priority: 10,
  timezone: 'America/New_York',
  // defaultAgeRestriction: intentionally unset for now.
  // THCC publishes no explicit age policy (it is a DIY cooperative that also runs a
  // full-service bar; most events are free RSVP). Rely on per-event classification.
  // This is a one-line config change if we decide to set a venue default later.
}
```

## Files

- **New:** `server/scrapers/venues/the-heavy-culture-coop.ts`
  - exports `theHeavyCultureCoopConfig` and `class TheHeavyCultureCoopScraper extends HttpScraper`
- **Edit:** `server/scrapers/runner.ts`
  - import + register `new TheHeavyCultureCoopScraper()` in the `scrapers` array
- **New:** `scripts/test-thcc-scraper.ts`
  - standalone runner that scrapes and prints parsed events (mirrors existing test scripts), for
    manual verification before relying on the cron run

## Error handling

If zero events parse, **`parseEvents` throws**. The base `HttpScraper.scrape()` only sets
`success: false` when `parseEvents` throws or the HTTP fetch fails — returning an empty array would
register as a successful run of zero events. Throwing on zero parsed events makes the existing
`FailureDetectionService` fire a notification. Wix changing its embed format is the most likely
future break, and we want to be alerted rather than silently stop ingesting THCC events.

Note: the base class's default fetch sends a standard browser `User-Agent`, which is what our
verification `curl` used to successfully retrieve the embedded JSON, so no header override is needed.

## Testing

- Unit-style: a parser test that runs the extraction against a saved fixture of the `/shows` HTML
  and asserts it returns the expected number of future events with well-formed `startsAt`,
  `sourceUrl`, `sourceEventId`, and `imageUrl`. (Follow whatever convention exists in
  `server/scrapers/__tests__/`.)
- Manual: run `scripts/test-thcc-scraper.ts` against the live page and eyeball the output.

## Out of scope

- Per-event age-restriction detection (no published policy to parse).
- Scraping Eventbrite for richer ticket/price data — we link out to it via `ticketUrl`.
- Backfilling past events.
