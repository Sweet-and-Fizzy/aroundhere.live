# Testing Plan for aroundhere.live

## Current State
- No formal test suite
- 60+ ad-hoc test scripts in `/scripts` for manual testing/debugging
- No test framework configured

## Goals
Implement comprehensive testing to:
- Catch bugs before production (especially AI scraper bugs that affect live event data)
- Enable confident refactoring
- Document expected behavior
- Enable CI/CD automation

## Testing Stack

```json
{
  "devDependencies": {
    "vitest": "^2.0.0",           // Fast unit/integration tests
    "@vitest/ui": "^2.0.0",       // Test UI
    "playwright": "^1.48.0",      // E2E tests (already installed)
    "@testing-library/vue": "^8.1.0",  // Component testing
    "happy-dom": "^15.11.0"       // Lightweight DOM for Nuxt
  }
}
```

---

## Tier 1: High-Value Quick Wins (START HERE)

### 1. Unit Tests for Critical Business Logic

**Priority Files:**

#### `server/services/agent/evaluator.ts`
- Data quality scoring logic
- Field completeness evaluation
- Quality issue detection
- Event sample formatting

**Test Coverage:**
```typescript
describe('evaluateEventData', () => {
  it('should score complete event data highly')
  it('should identify missing required fields')
  it('should detect quality issues (incomplete dates, missing prices)')
  it('should handle empty/null data gracefully')
})
```

#### `server/services/agent/merger.ts`
- Venue data merging across attempts
- Conflict detection
- Value selection logic

**Test Coverage:**
```typescript
describe('mergeVenueData', () => {
  it('should merge data from multiple attempts')
  it('should detect conflicts between attempts')
  it('should prefer non-empty values')
  it('should handle nested objects')
})
```

#### `server/services/agent/validator.ts`
- TypeScript code validation
- Security checks
- Required export verification

**Test Coverage:**
```typescript
describe('validateScraperCode', () => {
  it('should accept valid scraper code')
  it('should reject code with syntax errors')
  it('should reject code missing required exports')
  it('should detect dangerous patterns (eval, process)')
})
```

#### `server/utils/scraper-analysis.ts`
- Field coverage analysis
- Data completeness scoring
- Sample extraction

**Test Coverage:**
```typescript
describe('analyzeScrapedData', () => {
  it('should calculate field coverage correctly')
  it('should identify missing required fields')
  it('should handle arrays of events')
  it('should extract representative samples')
})
```

#### `server/scrapers/save-events.ts` ⭐ HIGH PRIORITY
- Event deduplication (title+venue+date matching)
- Priority-based updates
- Source attribution
- Status management

**Test Coverage:**
```typescript
describe('saveScrapedEvents', () => {
  it('should save new events')
  it('should deduplicate by normalized title+venue+date')
  it('should update events when source has higher priority')
  it('should preserve manual edits')
  it('should mark events as updated when re-scraped')
  it('should filter out past events')
})
```

#### `server/utils/chat-validation.ts` ⭐ SECURITY CRITICAL
- Prompt injection detection
- Message sanitization
- Conversation validation

**Test Coverage:**
```typescript
describe('validateConversation', () => {
  it('should accept normal conversations')
  it('should reject prompt injection attempts')
  it('should reject excessively long messages')
  it('should sanitize control characters')
  it('should validate message structure')
})
```

### 2. Integration Tests for Scraper Execution

#### `server/services/agent/executor.ts`
- Sandbox execution
- Timeout handling
- Error capturing
- Result extraction

**Test Coverage:**
```typescript
describe('executeScraperCode', () => {
  it('should execute valid scraper code')
  it('should extract events from HTML')
  it('should timeout long-running code')
  it('should capture console output')
  it('should handle scraper errors gracefully')
  it('should prevent dangerous code execution')
})
```

**Example Test:**
```typescript
it('should extract events from mock HTML', async () => {
  const mockHTML = `
    <div class="event">
      <h3>Live Music Night</h3>
      <time>2025-01-15 20:00</time>
    </div>
  `
  const code = `
    module.exports.scrapeEvents = async (url) => {
      const $ = cheerio.load(await fetchHTML(url))
      return $('.event').map((_, el) => ({
        title: $(el).find('h3').text(),
        startsAt: $(el).find('time').text()
      })).get()
    }
  `
  const result = await executeScraperCode(code, mockHTML, 'America/New_York')
  expect(result.success).toBe(true)
  expect(result.data).toHaveLength(1)
  expect(result.data[0].title).toBe('Live Music Night')
})
```

---

## Tier 2: Medium Priority

### 3. API Endpoint Tests

**Critical Endpoints:**
- `POST /api/agent/generate-venue`
- `POST /api/agent/generate-events`
- `POST /api/agent/approve`
- `POST /api/chat`
- `POST /api/agent/run-scraper`

**Test Coverage:**
```typescript
describe('POST /api/agent/approve', () => {
  it('should approve venue info session and create venue')
  it('should approve event scraper session and create source')
  it('should geocode venue addresses')
  it('should handle duplicate venue slugs')
  it('should reject sessions that are not successful')
  it('should send Slack notifications')
})
```

### 4. Database Integration Tests

**Use test database or transactions**

#### Event Saving & Deduplication
```typescript
describe('Event deduplication', () => {
  beforeEach(async () => {
    // Setup: Create test venue and source
  })

  it('should not create duplicate events')
  it('should update event when re-scraped by same source')
  it('should update event when higher priority source scrapes it')
  it('should preserve lower priority source as alternate')
})
```

#### Spotify Playlist Sync
```typescript
describe('Spotify playlist sync', () => {
  it('should add tracks for upcoming events')
  it('should remove tracks for past events')
  it('should respect track count based on days until event')
  it('should maintain playlist order by event date')
})
```

---

## Tier 3: Nice to Have

### 5. E2E Tests for Critical User Flows (Playwright)

**User Flows:**
1. Creating a new venue scraper
2. Approving and running a scraper
3. Chat interface with tool calls
4. Event browsing/filtering on homepage
5. Venue detail page

### 6. Component Tests

**UI Components:**
- Event cards
- Venue pages
- Filter sidebar
- Map interface
- Chat interface

---

## High-Risk Areas Requiring Extra Testing

Based on code complexity analysis:

1. **Event Deduplication Logic** (`server/scrapers/save-events.ts:48-90`)
   - Complex matching: normalized titles, venue/date comparison
   - Priority-based updates
   - Risk: Duplicate events or data loss

2. **AI Scraper Code Execution** (`server/services/agent/executor.ts`)
   - Untrusted code in sandbox
   - Risk: Security vulnerabilities, timeouts

3. **LLM Cost Calculations** (`server/utils/llm-cost.ts`)
   - Multiple providers/models
   - Risk: Financial impact if wrong

4. **Chat Validation** (`server/utils/chat-validation.ts`)
   - Prompt injection prevention
   - Risk: Security vulnerabilities

5. **Spotify Playlist Sync** (`server/services/spotify/playlist-sync.ts`)
   - Complex business logic (track counts by event proximity)
   - Diff calculation
   - Risk: Incorrect playlist updates

---

## Implementation Timeline

### Week 1: Setup & Tier 1 Unit Tests
- [ ] Install testing dependencies
- [ ] Configure Vitest
- [ ] Write tests for `chat-validation.ts`
- [ ] Write tests for `scraper-analysis.ts`
- [ ] Write tests for `evaluator.ts`

### Week 2: Tier 1 Continued
- [ ] Write tests for `merger.ts`
- [ ] Write tests for `validator.ts`
- [ ] Write tests for `save-events.ts` (complex)
- [ ] Write tests for `executor.ts` (integration)

### Week 3: Tier 2 API & Database Tests
- [ ] Setup test database
- [ ] Write API endpoint tests
- [ ] Write database integration tests
- [ ] Write Spotify sync tests

### Week 4: Tier 3 & CI/CD
- [ ] Setup Playwright for E2E
- [ ] Write critical user flow tests
- [ ] Setup GitHub Actions CI
- [ ] Configure coverage reporting

---

## Testing Commands

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

---

## Success Metrics

**Target Coverage:**
- Unit tests: 80%+ for business logic
- Integration tests: Critical paths covered
- E2E tests: 5-10 critical user flows

**CI/CD:**
- All tests run on PR
- Require passing tests to merge
- Coverage reports on PR

---

## Notes

- Start with pure functions (no DB/API dependencies)
- Mock external dependencies (Anthropic, OpenAI, Spotify APIs)
- Use test database for integration tests
- Keep E2E tests minimal (expensive to maintain)
- Focus on high-value, high-risk areas first
