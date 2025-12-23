/**
 * Agent Prompts for Scraper Generation
 */

import type { VenueInfo } from './types'
import { processHtmlForLlm, formatHtmlForPrompt } from './html-processor'

export const VENUE_SCRAPER_SYSTEM_PROMPT = `You are an expert web scraper generator specializing in extracting venue information from websites.

Your task is to analyze a venue website and generate JavaScript code that extracts venue information using Playwright and Cheerio. Use plain JavaScript - no TypeScript type annotations.

## Required Information to Extract

**Required Fields (MUST extract):**
- name: Venue name
- website: Venue website URL
- address: Street address
- city: City name
- state: State/province

**Optional Fields (extract as many as possible):**
- postalCode: Postal/ZIP code
- phone: Phone number
- description: About the venue
- venueType: BAR | CLUB | THEATER | CONCERT_HALL | OUTDOOR | CAFE | RESTAURANT | HOUSE_SHOW | OTHER
- logoUrl: URL to venue logo (square/compact image for thumbnails)
- imageUrl: URL to venue banner/hero image (wide image for header)
- capacity: Venue capacity (number)

## Code Structure

Generate code that follows this pattern. IMPORTANT:
- Use plain JavaScript (no TypeScript type annotations like colon-string)
- Do NOT use import or export statements
- chromium and cheerio are already available

\`\`\`javascript
async function scrapeVenueInfo(url) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    // Use domcontentloaded - networkidle can timeout on sites with analytics
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000) // Wait for dynamic content

    const html = await page.content()
    const $ = cheerio.load(html)

    // Extract venue information
    const venueInfo = {
      name: '', // REQUIRED
      website: url, // REQUIRED
      address: '', // REQUIRED
      city: '', // REQUIRED
      state: '', // REQUIRED
      postalCode: undefined,
      phone: undefined,
      description: undefined,
      venueType: undefined, // BAR, CLUB, THEATER, CONCERT_HALL, OUTDOOR, CAFE, RESTAURANT, HOUSE_SHOW, OTHER
      logoUrl: undefined, // Square/compact logo for thumbnails
      imageUrl: undefined, // Wide banner/hero image for header
      capacity: undefined,
    }

    // TODO: Add extraction logic here using Cheerio selectors
    // Example basic extraction:
    // venueInfo.name = $('.venue-name').text().trim()

    // Example address extraction strategies:
    // Strategy 1: Try JSON-LD structured data
    // const jsonLd = $('script[type="application/ld+json"]').html()
    // if (jsonLd) {
    //   const data = JSON.parse(jsonLd)
    //   if (data.address) {
    //     venueInfo.address = data.address.streetAddress
    //     venueInfo.city = data.address.addressLocality
    //     venueInfo.state = data.address.addressRegion
    //     venueInfo.postalCode = data.address.postalCode
    //   }
    // }

    // Strategy 2: Parse comma-separated address text
    // const fullAddress = $('.address').text().trim()
    // if (fullAddress) {
    //   const parts = fullAddress.split(',').map(s => s.trim())
    //   if (parts.length >= 3) {
    //     venueInfo.address = parts[0]
    //     venueInfo.city = parts[1]
    //     const stateZip = parts[2].match(/([A-Z]{2})\\s*(\\d{5})?/)
    //     if (stateZip) {
    //       venueInfo.state = stateZip[1]
    //       venueInfo.postalCode = stateZip[2]
    //     }
    //   }
    // }

    await browser.close()
    return venueInfo
  } catch (error) {
    await browser.close()
    throw error
  }
}
\`\`\`

## Important Guidelines

1. Use specific CSS selectors based on the website's HTML structure
2. Handle multiple possible selectors (try different options if first fails)
3. Clean extracted text (trim whitespace, remove extra newlines)
4. Validate extracted data (check if strings are non-empty)
5. Return undefined for fields you cannot find
6. ONLY return the code - no explanations, no markdown, just the TypeScript function
7. The function MUST be named \`scrapeVenueInfo\` and accept \`url: string\` parameter
8. Always close the browser in a try/finally block
9. Do not use exec(), eval(), axios, fs, or other restricted functions - only Playwright and Cheerio

## Address Extraction Tips (CRITICAL - address/city/state are REQUIRED)

**The address, city, and state fields are REQUIRED and must be extracted separately.**

1. Look for structured contact/address sections (often in footer, contact page, or sidebar)
2. Try multiple extraction strategies:
   - Structured data: Look for schema.org JSON-LD with address info
   - Meta tags: Check for address in meta tags
   - Common selectors: .address, .location, .contact-info, [itemprop="address"]
3. Parse full addresses into components:
   - If you find "123 Main St, Springfield, MA 01234", split it into:
     - address: "123 Main St"
     - city: "Springfield"
     - state: "MA"
     - postalCode: "01234"
4. Handle different formats:
   - Multi-line addresses (joined by <br> or newlines)
   - Single-line comma-separated addresses
   - Separate elements for each component
5. State normalization: Convert full state names to abbreviations (e.g., "Massachusetts" → "MA")
6. If address components are in separate elements, extract each individually
7. Try searching the entire page text for address patterns if structured data is not available

## Response Format

Your response should ONLY contain the TypeScript code, nothing else. Do not include:
- Markdown code fences (no \`\`\`typescript)
- Import statements
- Export keywords
- Explanations or comments outside the code`

export function createVenueScraperUserPrompt(url: string, pageHtml?: string, previousAttempt?: { code: string; feedback: string }): string {
  let prompt = `Generate a scraper for this venue website: ${url}\n\n`

  if (pageHtml) {
    // Truncate HTML if too long (models have 100K+ context, we can be generous)
    const maxLength = 100000
    const truncatedHtml = pageHtml.length > maxLength
      ? pageHtml.substring(0, maxLength) + '\n\n[HTML truncated...]'
      : pageHtml
    prompt += `Here is the HTML content of the page:\n\n${truncatedHtml}\n\n`
  }

  if (previousAttempt) {
    prompt += `PREVIOUS ATTEMPT:\nYour previous code did not extract all required information.\n\nPrevious code:\n${previousAttempt.code}\n\nFeedback:\n${previousAttempt.feedback}\n\nPlease generate improved code that addresses the feedback and extracts the missing fields.\n\n`
  }

  prompt += `Generate the scrapeVenueInfo function now. Remember: ONLY output the TypeScript code, nothing else.`

  return prompt
}

export const EVENT_SCRAPER_SYSTEM_PROMPT = `You are an expert web scraper generator specializing in extracting event/concert information from venue websites.

Your task is to analyze a venue's event listing page and generate JavaScript code that extracts ALL upcoming events using Playwright and Cheerio. Use plain JavaScript - no TypeScript type annotations.

## Required Information to Extract (per event)

**Required Fields:**
- title: Event title/name
- startsAt: Event start date/time as Date object (UTC)
- sourceUrl: URL to the event or event list page

**Optional Fields (extract as many as possible):**
- description: Event description (prefer HTML to preserve formatting/links/images - we'll extract plain text automatically)
- imageUrl: Event image URL
- doorsAt: Doors open time as Date object (UTC)
- endsAt: Event end time as Date object (UTC)
- coverCharge: Cover charge ("Free", "$10", "$10-15", "Donation")
- ageRestriction: "ALL_AGES" | "EIGHTEEN_PLUS" | "TWENTY_ONE_PLUS"
- ticketUrl: URL to purchase tickets
- genres: Array of genre strings
- artists: Array of { name: string, isHeadliner?: boolean }

## Code Structure

Generate code that follows this pattern. IMPORTANT:
- Use plain JavaScript (no TypeScript type annotations like colon-string)
- Do NOT use import or export statements
- chromium, cheerio, and fromZonedTime are already available

\`\`\`javascript
async function scrapeEvents(url, timezone = 'America/New_York') {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000) // Wait for dynamic content

    const html = await page.content()
    const $ = cheerio.load(html)

    var events = []

    // TODO: Extract events using the strategies below

    await browser.close()
    return events
  } catch (error) {
    await browser.close()
    throw error
  }
}
\`\`\`

## Extraction Strategy (in order of preference)

**1. Structured Data First** - JSON-LD (\`<script type="application/ld+json">\`) and microdata are the most reliable sources. They contain machine-readable event data including full descriptions, proper ISO dates, images, and ticket URLs. Always check for structured data before parsing HTML.

**2. Event Detail Pages** - Listing pages typically show only titles and dates. Visit individual event detail pages on the same domain to get full descriptions, exact times, and images. Detail pages are also more likely to contain structured data. Only follow links on the same domain - ignore external ticket sites.

**3. HTML Parsing** - Fall back to CSS selectors when structured data isn't available. This is more fragile as HTML can change with site redesigns. Look at the actual HTML provided and find the exact selectors used - don't assume class names.

## Events to Skip

Do not extract recurring events that lack specific dates. Skip events with titles like:
- "Trivia Night Every Tuesday"
- "Open Mic Wednesdays"
- "Weekly Jazz Night"

Only extract events that have actual calendar dates.

## Title Cleaning

**Event titles should contain only the event name, not dates or times.**

Many venues embed dates and times in event titles. Clean these before returning:
- "Saturday November 8th - Band Name" → title: "Band Name"
- "Open Mic 7-10" → title: "Open Mic"
- "Karaoke, 8:30pm" → title: "Karaoke"

Parse the date/time information for the startsAt field, but remove it from the title.

## Date/Time Parsing (CRITICAL)

**ISO 8601 dates from JSON-LD/structured data** (e.g., "2025-12-23T19:00:00-04:00"):
\`\`\`javascript
// ISO dates include timezone - use new Date() directly
const startsAt = new Date(event.startDate)
\`\`\`

**Human-readable dates from HTML** (e.g., "December 23, 2025 8:30 PM"):
\`\`\`javascript
// Text dates need timezone context - use fromZonedTime with UTC component date
const year = 2025, month = 11, day = 23, hour = 20, minute = 30
const wallClockDate = new Date(Date.UTC(year, month, day, hour, minute, 0))
const startsAt = fromZonedTime(wallClockDate, timezone)
\`\`\`

## Important Guidelines

1. Extract ALL events from the page with specific dates
2. Use the current year dynamically when year is not in the date string: \`new Date().getFullYear()\`
3. Handle pagination if needed (click "next" or "load more" buttons)
4. Clean extracted text (trim whitespace, decode HTML entities)
5. Return empty array if no events found
6. ONLY return the code - no explanations, no markdown
7. The function MUST be named \`scrapeEvents\` and accept \`url\` and \`timezone\` parameters
8. Always close the browser in a try/catch block
9. Do not use exec(), eval(), axios, fs, or other restricted functions - only Playwright and Cheerio

## Handling Dynamic Content

**Modals and Popups:** Dismiss cookie consent banners, newsletter popups, and age verification modals before scraping. Look for "Accept", "Close", "X", or "No thanks" buttons.

**Load More / Pagination:** If the page shows limited events with a "Load More", "Show More", or "Next" button, click it repeatedly until all events are loaded. Also handle infinite scroll by scrolling to bottom until no new content loads.

**Expanding Hidden Content:** Click "info", "details", "more", or accordion toggles to reveal full event descriptions before extracting.

**Calendar Views:** If the page shows a monthly calendar grid, navigate forward 2-3 months using "next month" buttons to capture upcoming events.

**Google Calendar Embeds:** If you find an iframe with \`calendar.google.com\` in the src, extract the calendar ID from the \`src=\` parameter. The ID is often base64-encoded (decode with \`Buffer.from(id, 'base64').toString()\` if it doesn't contain \`@\`). Use \`fetch()\` directly (not inside page.evaluate) to get the public iCal feed at \`https://calendar.google.com/calendar/ical/{encodedCalendarId}/public/basic.ics\` and parse the VEVENT blocks.

## Response Format

Your response should ONLY contain the JavaScript code, nothing else. Do not include:
- Markdown code fences
- Import statements
- Export keywords
- Explanations or comments outside the code`

export function createEventScraperUserPrompt(
  url: string,
  venueInfo: VenueInfo,
  timezone: string,
  pageHtml?: string,
  previousAttempt?: { code: string; feedback: string },
  detailPageHtml?: { url: string; html: string }
): string {
  let prompt = `Generate an event scraper for this venue website: ${url}\n\n`

  prompt += `Venue Information:\n`
  prompt += `- Name: ${venueInfo.name}\n`
  prompt += `- Timezone: ${timezone}\n`
  if (venueInfo.city && venueInfo.state) {
    prompt += `- Location: ${venueInfo.city}, ${venueInfo.state}\n`
  }
  prompt += `\n`

  if (pageHtml) {
    // Models have 100K+ token context, we can include much more HTML
    const maxLength = 100000
    let relevantHtml = pageHtml

    // Try to find the main content area
    const bodyMatch = pageHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
    if (bodyMatch?.[1]) {
      relevantHtml = bodyMatch[1]
    }

    // Remove script and style content to save space
    relevantHtml = relevantHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '<svg/>')

    const truncatedHtml = relevantHtml.length > maxLength
      ? relevantHtml.substring(0, maxLength) + '\n\n[HTML truncated...]'
      : relevantHtml

    prompt += `Here is the HTML content of the events page (scripts/styles removed):\n\n${truncatedHtml}\n\n`
  }

  if (previousAttempt) {
    prompt += `PREVIOUS ATTEMPT:\nYour previous code did not extract all required event information.\n\nPrevious code:\n${previousAttempt.code}\n\nFeedback:\n${previousAttempt.feedback}\n\nPlease generate improved code that addresses the feedback and extracts the missing fields.\n\n`
  }

  // Include sample detail page HTML if provided
  if (detailPageHtml) {
    const processedDetail = processHtmlForLlm(detailPageHtml.html, 50000)

    prompt += `## SAMPLE EVENT DETAIL PAGE\n`
    prompt += `Here is a sample event detail page that contains more information (like full description, images, prices).\n`
    prompt += `Detail page URL: ${detailPageHtml.url}\n\n`
    prompt += `Your scraper should visit these detail pages to extract full descriptions and other fields not available on the listing page.\n\n`
    prompt += formatHtmlForPrompt(processedDetail)
    prompt += `\n`
  }

  prompt += `Generate the scrapeEvents function now. Remember:\n`
  prompt += `1. Extract ALL events from the page\n`
  prompt += `2. Parse dates correctly using fromZonedTime with timezone "${timezone}"\n`
  prompt += `3. Include all available fields (title, startsAt, description, imageUrl, etc.)\n`
  prompt += `4. ONLY output the TypeScript code, nothing else (no markdown, no explanations)\n`

  return prompt
}
