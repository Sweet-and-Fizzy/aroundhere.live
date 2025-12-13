# Platform Scrapers

Reusable scrapers for common calendar/event platforms.

## WixCalendarScraper

A helper for scraping Wix/BoomTech FullCalendar widgets. Works with any venue using the `calendar.boomte.ch` calendar widget.

### Usage

```typescript
import { PlaywrightScraper } from '../base'
import { WixCalendarScraper } from '../platforms/wix-calendar'
import type { ScrapedEvent } from '../types'
import { fromZonedTime } from 'date-fns-tz'

export class MyVenueScraper extends PlaywrightScraper {
  constructor() {
    super({
      id: 'my-venue',
      name: 'My Venue',
      venueSlug: 'my-venue',
      url: 'https://myvenue.com/events', // Page containing the calendar
      enabled: true,
      category: 'VENUE',
      priority: 10,
      timezone: 'America/New_York',
    })
  }

  async parseEvents(): Promise<ScrapedEvent[]> {
    if (!this.page) {
      throw new Error('Page not initialized')
    }

    // Use the WixCalendarScraper helper
    const calendarEvents = await WixCalendarScraper.scrapeCalendar(this.page, {
      monthsToScrape: 3,      // How many months to scrape
      extractDetails: false,   // Whether to click events for details
      timeout: 15000,          // Timeout for finding the calendar
    })

    // Convert to ScrapedEvent format
    return calendarEvents.map(event => ({
      title: event.title,
      startsAt: fromZonedTime(
        new Date(event.date + 'T20:00:00'), // Default time
        this.config.timezone
      ),
      sourceUrl: this.config.url,
      sourceEventId: `${event.date}-${event.title}`,
    }))
  }
}
```

### How it Works

1. **Finds the Calendar**: Automatically locates the Wix/BoomTech calendar iframe
2. **Extracts Events**: Scrapes event titles and dates from the FullCalendar grid
3. **Handles Multi-Day Events**: Detects and merges multi-day events
4. **Navigates Months**: Can navigate through multiple months
5. **Optional Details**: Can click on events to extract additional information

### Detected Information

The scraper automatically extracts:
- **Event title** (always)
- **Event date** in YYYY-MM-DD format (always)
- **Multi-day flag** for events spanning multiple days
- **Time, description, price, URL** (if `extractDetails: true`)

### Calendar Identification

The scraper looks for iframes with:
- `title="Calendar"`
- URL containing `boomte.ch`

### Common Patterns

#### Basic Usage (Fastest)
```typescript
const events = await WixCalendarScraper.scrapeCalendar(page)
// Gets current month + next month, no details
```

#### Get More Months
```typescript
const events = await WixCalendarScraper.scrapeCalendar(page, {
  monthsToScrape: 6 // Current + next 5 months
})
```

#### Extract Full Details (Slower)
```typescript
const events = await WixCalendarScraper.scrapeCalendar(page, {
  extractDetails: true // Clicks each event for details
})
```

### Supported Venues

Any venue using a Wix site with the BoomTech calendar widget:
- Look for `<iframe src="https://calendar.boomte.ch/widget/...">` in the page source
- The calendar widget is a FullCalendar instance
- Events appear in `.fc-daygrid-event` elements

### Troubleshooting

**Calendar not found**
- Increase timeout: `{ timeout: 30000 }`
- Check if page requires interaction before iframe loads
- Override `waitForContent()` in your scraper

**Missing event details**
- Set `extractDetails: true`
- Details depend on the calendar's popup/modal implementation
- May need custom selectors for specific venues

**Wrong dates**
- Ensure correct timezone in scraper config
- Calendar uses local browser time, converted via `fromZonedTime()`

### Testing

Test any Wix calendar scraper with:

```bash
npx tsx scripts/test-VENUE-scraper.ts
```

See `scripts/test-fame-scraper.ts` for an example test script.
