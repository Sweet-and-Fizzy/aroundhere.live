# Quick Start: AI Venue Scraper

## Setup (5 minutes)

### 1. Install Dependencies

```bash
npm install
```

Packages added:
- `openai` - OpenAI API client
- `@google/generative-ai` - Google Gemini API client
- `dotenv` - Environment variables
- (Anthropic SDK already installed)

### 2. Configure API Keys

Add at least one AI provider API key to `.env`:

```bash
# Choose one or more providers

# Anthropic (Recommended - best quality)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI (Alternative)
OPENAI_API_KEY=sk-...

# Google (Fast & cheap)
GOOGLE_AI_API_KEY=...

# DeepSeek (Most cost-effective)
DEEPSEEK_API_KEY=...
```

### 3. Set Up Database

The database schema has already been pushed with `prisma db push`.

If you need to reset or migrate:

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

### 4. Start Development Server

```bash
npm run dev
```

Visit: `http://localhost:3000/admin/scrapers`

## Usage

### Step 1: Enter Venue Information

1. Navigate to `/admin/scrapers`
2. Enter the venue's website URL (e.g., `https://example-venue.com/events`)
3. Select AI provider and model
4. Set max iterations (recommended: 5)

### Step 2: Generate Venue Info Scraper

1. Click **"Start Venue Info Scraper"**
2. Watch the agent thinking in the left column:
   - Analysis: Fetching and analyzing HTML
   - Code Generation: Creating scraper code
   - Execution: Running the scraper
   - Evaluation: Checking completeness
   - Improvement: Iterating if needed
3. Review venue data in the right column
4. Check completeness score

### Step 3: Generate Event Scraper

1. If venue info looks good, click **"Continue to Event Scraper"**
2. Agent will generate event scraper code
3. Review extracted events in the right column
4. Verify date/time parsing and field extraction

### Step 4: Approve and Create

1. If everything looks correct, click **"Approve and Create Venue"**
2. Venue and scraper records will be created in the database
3. The scraper can now be scheduled to run automatically

## How It Works

### Iterative Improvement Process

```
Iteration 1:
  ↓ Agent analyzes HTML structure
  ↓ Generates initial scraper code
  ↓ Executes and extracts data
  ↓ Evaluates: 60% complete (missing description)
  ↓
Iteration 2:
  ↓ Agent sees feedback: "missing description"
  ↓ Generates improved code with description selector
  ↓ Executes again
  ↓ Evaluates: 85% complete (missing capacity)
  ↓
Iteration 3:
  ↓ Agent tries different selectors
  ↓ Executes
  ↓ Evaluates: 100% complete ✓
  → SUCCESS!
```

### What The Agent Generates

**Venue Info Scraper:**
```typescript
export async function scrapeVenueInfo(url: string) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    const html = await page.content()
    const $ = cheerio.load(html)

    return {
      name: $('.venue-name').text().trim(),
      address: $('.venue-address').text().trim(),
      website: url,
      // ... more fields
    }
  } finally {
    await browser.close()
  }
}
```

**Event Scraper:**
```typescript
export async function scrapeEvents(url: string, timezone: string) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    const html = await page.content()
    const $ = cheerio.load(html)

    const events = []
    $('.event-item').each((_, el) => {
      const $el = $(el)
      const title = $el.find('.title').text().trim()
      const dateStr = $el.find('.date').text().trim()
      const startsAt = fromZonedTime(new Date(dateStr), timezone)

      events.push({
        title,
        startsAt,
        sourceUrl: url,
        // ... more fields
      })
    })

    return events
  } finally {
    await browser.close()
  }
}
```

## Tips for Success

### Choosing the Right Model

**For Best Results:**
- Anthropic Claude Sonnet 4.5 (most capable)
- OpenAI GPT-4o (strong reasoning)

**For Speed & Cost:**
- Anthropic Claude Sonnet 3.5 (balanced)
- Google Gemini 2.0 Flash (fast & cheap)
- DeepSeek V3 (excellent coding, very cheap)

### When Things Don't Work

**Low Completeness Score (<50%):**
- Increase max iterations to 7
- Try a more capable model (Sonnet 4.5)
- Check if website blocks automated access

**Execution Errors:**
- Website may require authentication
- Dynamic content may need longer wait time
- Try a different URL (events page vs homepage)

**Missing Required Fields:**
- Website may not display all information
- Try different pages on the site
- May need manual entry for some fields

### Understanding Completeness Scores

- **90-100%**: Excellent! All fields extracted
- **70-89%**: Good! Required fields + most optional fields
- **50-69%**: Acceptable! Required fields present
- **Below 50%**: Poor! Missing required fields

## Advanced: Using the API Directly

### Start a Session

```typescript
const response = await $fetch('/api/agent/start', {
  method: 'POST',
  body: {
    url: 'https://venue.com/events',
    sessionType: 'VENUE_INFO',
    llmProvider: 'anthropic',
    llmModel: 'claude-3-5-sonnet-20241022',
    maxIterations: 5,
  },
})

console.log(response.sessionId)
console.log(response.venueData)
console.log(response.thinking)
```

### Get Session Details

```typescript
const session = await $fetch(`/api/agent/session/${sessionId}`)
console.log(session.status)
console.log(session.attempts)
```

### Approve Session

```typescript
await $fetch('/api/agent/approve', {
  method: 'POST',
  body: {
    sessionId,
    regionId: 'your-region-id',
    venueSlug: 'custom-slug', // optional
  },
})
```

## Troubleshooting

### "No AI provider configured"

**Solution:** Add at least one API key to `.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Then restart the dev server.

### "Database error"

**Solution:** Ensure database is set up:
```bash
npx prisma db push
npx prisma generate
```

### "Execution timeout"

**Solution:** Website is slow or blocked. Try:
1. Different URL on the same site
2. Increase timeout in `executor.ts`
3. Add delay/retry logic

### "Generated code is invalid"

**Solution:** LLM made a mistake. Try:
1. Different model (Sonnet 4.5 is most reliable)
2. More iterations (agent will self-correct)
3. Lower temperature for more deterministic output

## Next Steps

### After Creating a Venue

1. **Test the Scraper:**
   - Run it manually to verify it works
   - Check that dates parse correctly (timezone!)
   - Ensure all events are captured

2. **Schedule Scraping:**
   - Add to scraper runner cron job
   - Set appropriate frequency (daily for most venues)

3. **Monitor Quality:**
   - Check for duplicate events
   - Verify event classification
   - Adjust dedup settings if needed

### Improving the System

1. **Add More Providers:**
   - Configure additional AI providers
   - Test different models for quality

2. **Customize Prompts:**
   - Edit `server/services/agent/prompts.ts`
   - Add venue-specific instructions
   - Improve field extraction guidance

3. **Tune Parameters:**
   - Adjust max iterations per venue type
   - Modify completeness thresholds
   - Add custom validation rules

## FAQ

**Q: How long does scraper generation take?**
A: Typically 30-90 seconds, depending on:
- Number of iterations needed
- Model speed (Haiku is fastest)
- Website complexity

**Q: Can I edit the generated code?**
A: Yes! The code is saved in the database. You can:
- Copy it and create a manual scraper
- Refine selectors
- Add custom logic

**Q: What if the website structure changes?**
A: Re-run the agent to generate a new scraper. The old one will be versioned.

**Q: Does this work for non-music venues?**
A: Yes! The system is generic. Adjust prompts and field definitions as needed.

**Q: How much does it cost per venue?**
A: Depends on model:
- Claude Sonnet 3.5: ~$0.05-0.15
- GPT-4o: ~$0.08-0.20
- Gemini Flash: ~$0.001-0.01
- DeepSeek: ~$0.001-0.005

**Q: Can I run multiple sessions in parallel?**
A: Yes! Each session is independent. Start multiple from the UI.

## Support

For issues or questions:
1. Check `AI_AGENT_SYSTEM.md` for detailed docs
2. Review generated code in database
3. Check agent thinking steps for insights
4. Try different models/parameters

## Success Metrics

After using the system, you should see:
- ✅ 80%+ venue info extraction success rate
- ✅ 70%+ event extraction success rate
- ✅ <2 minutes average time per venue
- ✅ 90%+ reduction in manual coding time

Good luck! 🚀
