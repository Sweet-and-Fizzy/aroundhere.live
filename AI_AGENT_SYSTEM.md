# AI-Powered Venue Scraper System

## Overview

This system uses AI agents to automatically generate web scrapers for new music venues. The agent analyzes a venue's website and iteratively generates scraper code that extracts venue information and event listings.

## Architecture

### Backend Components

#### 1. Database Schema (`prisma/schema.prisma`)

**AgentSession** - Tracks scraper generation sessions
- `sessionType`: VENUE_INFO or EVENT_SCRAPER
- `status`: IN_PROGRESS, SUCCESS, FAILED, APPROVED
- `llmProvider`, `llmModel`: AI model configuration
- `venueData`, `eventData`: Scraped results
- `generatedCode`: Final working scraper
- `thinking`: Array of agent reasoning steps

**ScraperAttempt** - Individual iteration attempts
- `attemptNumber`: 1 to maxIterations
- `generatedCode`: Code generated in this attempt
- `executionStatus`: SUCCESS, ERROR, TIMEOUT
- `scrapedData`: Results from execution
- `fieldsFound`, `fieldsMissing`: Evaluation metrics
- `completenessScore`: 0-1 quality score

**LLMConfig** - API keys and model configuration
- `provider`: anthropic, openai, google, deepseek
- `apiKey`: Encrypted API key
- `models`: Available models
- `defaultModel`: Default model selection

#### 2. LLM Service (`server/services/llm/`)

Unified interface for multiple AI providers:

- **Anthropic**: Claude Sonnet 4.5, Sonnet 3.5, Haiku 3.5
- **OpenAI**: GPT-4o, GPT-4 Turbo, o1-preview
- **Google**: Gemini 2.0 Flash, Gemini 1.5 Pro
- **DeepSeek**: DeepSeek V3

**Features:**
- Consistent API across providers
- Token usage tracking
- Temperature and max tokens control
- System prompt support

#### 3. AI Agent Service (`server/services/agent/`)

**Core Components:**

**Agent Service (`index.ts`)**
- Orchestrates iterative scraper generation
- Manages session state
- Tracks thinking steps for UI display
- Implements 2-phase approach:
  1. Venue info scraper (extracts venue details)
  2. Event scraper (extracts event listings)

**Prompts (`prompts.ts`)**
- System prompts with detailed instructions
- User prompts with HTML context and feedback
- Separate prompts for venue vs event scrapers

**Code Validator (`validator.ts`)**
- Security checks (no eval, fs access, etc.)
- Syntax validation
- Required imports verification
- Function signature validation

**Code Executor (`executor.ts`)**
- VM-based sandboxed execution
- 30-second timeout protection
- Safe module access (playwright, cheerio only)
- HTML prefetch for LLM analysis

**Field Evaluator (`evaluator.ts`)**
- Calculates completeness scores
- Identifies missing required fields
- Generates improvement feedback
- Determines if attempt is acceptable

#### 4. API Endpoints (`server/api/agent/`)

**POST /api/agent/start**
- Start a new agent session
- Body: `{ url, sessionType, llmProvider, llmModel, maxIterations, venueInfo? }`
- Returns: `{ success, sessionId, thinking, venueData/eventData, completenessScore }`

**GET /api/agent/session/:id**
- Get session details and attempts
- Returns full session with all attempts

**POST /api/agent/approve**
- Approve session and create venue/source records
- Body: `{ sessionId, regionId, venueSlug? }`
- Creates Venue and/or Source in database

**GET /api/agent/models**
- Get available AI models
- Returns providers, models, and defaults

### Frontend Components

#### 1. New Venue Page (`app/pages/admin/scrapers.vue`)

**Features:**
- URL input for venue website
- AI provider/model selector (dropdown with all available models)
- Max iterations slider
- Two-column layout:
  - **Left**: Real-time agent thinking stream
  - **Right**: Live preview of scraped data

**Workflow:**
1. User enters venue URL
2. Selects AI provider and model
3. Clicks "Start Venue Info Scraper"
4. Watches agent thinking in real-time
5. Reviews venue data preview
6. Clicks "Continue to Event Scraper"
7. Reviews event data preview
8. Clicks "Approve and Create Venue"

**Thinking Display:**
- Color-coded by step type:
  - 🔵 Analysis - blue
  - 🟣 Planning - purple
  - 🟡 Code Generation - yellow
  - 🟠 Execution - orange
  - ⚪ Evaluation - gray
  - 🟣 Improvement - indigo
  - 🟢 Success - green
  - 🔴 Failure - red
- Timestamps for each step
- Expandable data for details

**Preview Cards:**
- Venue card with all extracted fields
- Event cards (first 5 events shown)
- Completeness progress bar
- Color-coded by score (green/yellow/red)

## Required Fields

### Venue Information
**Required:**
- `name` - Venue name
- `website` - Website URL

**Optional:**
- `address`, `city`, `state`, `postalCode`
- `phone`, `description`, `venueType`
- `capacity`, `imageUrl`

### Event Information
**Required:**
- `title` - Event name
- `startsAt` - Start date/time (UTC Date)
- `sourceUrl` - Event page URL

**Optional:**
- `description`, `descriptionHtml`
- `imageUrl`, `doorsAt`, `endsAt`
- `coverCharge`, `ageRestriction`
- `ticketUrl`, `genres`, `artists`

## Iterative Improvement Algorithm

```
For attempt = 1 to maxIterations:
  1. Generate scraper code using LLM
     - Include page HTML for context
     - Include feedback from previous attempt

  2. Validate code safety
     - Check for dangerous patterns
     - Verify function signatures
     - Ensure browser cleanup

  3. Execute code in sandbox
     - 30-second timeout
     - VM isolation
     - Capture results

  4. Evaluate results
     - Calculate completeness score
     - Identify missing fields
     - Generate improvement feedback

  5. If acceptable (all required fields + 30% optional):
     - Mark as SUCCESS
     - Save code and data
     - Exit loop

  6. Else:
     - Save attempt for analysis
     - Generate feedback
     - Continue to next iteration

  7. Track best attempt by score

End loop:
  - If any acceptable attempt: Return SUCCESS
  - Else if best attempt exists: Return partial SUCCESS
  - Else: Return FAILED
```

## Configuration

### Environment Variables

Add to `.env`:

```bash
# AI Provider API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
DEEPSEEK_API_KEY=...
```

### Recommended Models

**For Production:**
- **Anthropic Claude Sonnet 3.5** - Best balance of quality/cost
- **Google Gemini 2.0 Flash** - Fastest, cheapest, good quality

**For Best Quality:**
- **Anthropic Claude Sonnet 4.5** - Most capable
- **OpenAI GPT-4o** - Strong reasoning

**For Cost Efficiency:**
- **DeepSeek V3** - Excellent coding, very cheap
- **Claude Haiku 3.5** - Fast and affordable

## Usage Example

### 1. Generate Venue Info Scraper

```typescript
const result = await agentService.generateVenueScraper({
  url: 'https://example-venue.com',
  llmProvider: 'anthropic',
  llmModel: 'claude-3-5-sonnet-20241022',
  maxIterations: 5,
  onThinking: (step) => {
    console.log(step.type, step.message)
  },
})

// result.venueData = { name, address, city, ... }
```

### 2. Generate Event Scraper

```typescript
const result = await agentService.generateEventScraper({
  url: 'https://example-venue.com/events',
  llmProvider: 'anthropic',
  llmModel: 'claude-3-5-sonnet-20241022',
  maxIterations: 5,
  venueInfo: {
    name: 'Example Venue',
    city: 'Springfield',
    state: 'MA',
  },
})

// result.eventData = [{ title, startsAt, ... }, ...]
```

### 3. Approve and Create Records

```typescript
await $fetch('/api/agent/approve', {
  method: 'POST',
  body: {
    sessionId: result.sessionId,
    regionId: 'region-id',
  },
})
```

## Security Features

### Code Validation
- ❌ No `eval()` or `Function()` constructor
- ❌ No filesystem access
- ❌ No process control
- ❌ No child processes
- ❌ No direct database access
- ✅ Only Playwright and Cheerio allowed
- ✅ Required browser cleanup
- ✅ Timeout protection

### Execution Sandbox
- VM-based isolation
- Limited module access
- 30-second timeout
- Error handling and recovery

## Future Enhancements

### Implemented ✅

1. **Real-Time Streaming (SSE)** ✅
   - Thinking steps stream via Server-Sent Events
   - SSE endpoint: `GET /api/agent/stream/:sessionId`
   - Agent saves thinking to DB, SSE polls every 500ms
   - Auto-reconnects on connection drop

### Potential Improvements

1. **Scraper Templates**
   - Detect common platforms (Squarespace, Bandsintown)
   - Pre-built templates for faster generation
   - Platform-specific strategies

3. **Testing & Validation**
   - Dry-run mode to test scrapers
   - Historical comparison (detect breaking changes)
   - Automated quality scoring

4. **Scraper Management**
   - Edit generated scrapers in UI
   - Version history
   - A/B test different approaches

5. **Multi-Region Support**
   - Timezone detection
   - Geographic relevance
   - Language detection

6. **Cost Tracking**
   - Token usage per session
   - Cost estimates before running
   - Budget limits

## Troubleshooting

### Common Issues

**"No content in LLM response"**
- Check API key is valid
- Verify model name is correct
- Check rate limits

**"Execution timeout"**
- Website may be slow or blocking
- Increase timeout in executor
- Try different selectors

**"Missing required fields"**
- Website structure may be unusual
- Try increasing maxIterations
- Use more capable model (Sonnet 4.5)

**"Code validation failed"**
- Generated code has security issues
- May need prompt refinement
- Check LLM temperature (lower = more consistent)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Vue/Nuxt)                  │
│  ┌────────────────────────────────────────────────┐    │
│  │  /admin/scrapers                              │    │
│  │  - URL input                                   │    │
│  │  - Model selector                              │    │
│  │  - Two-column view                             │    │
│  │    ├── Thinking display (left)                 │    │
│  │    └── Data preview (right)                    │    │
│  └────────────────────────────────────────────────┘    │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP API
┌─────────────────────▼───────────────────────────────────┐
│                  API Layer (Nuxt)                       │
│  POST /api/agent/start        - Start generation       │
│  GET  /api/agent/session/:id  - Get session            │
│  POST /api/agent/approve      - Create records         │
│  GET  /api/agent/models       - Get available models   │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────┐
│              Agent Service (Business Logic)             │
│  ┌─────────────────────────────────────────────┐       │
│  │ AgentService.generateScraper()              │       │
│  │  ├── Fetch HTML                             │       │
│  │  ├── FOR attempt in 1..maxIterations        │       │
│  │  │    ├── Generate code (LLM)               │       │
│  │  │    ├── Validate safety                   │       │
│  │  │    ├── Execute in sandbox                │       │
│  │  │    ├── Evaluate results                  │       │
│  │  │    └── If acceptable: SUCCESS, exit      │       │
│  │  └── END FOR                                 │       │
│  └─────────────────────────────────────────────┘       │
└──────┬────────────┬────────────┬─────────────┬──────────┘
       │            │            │             │
┌──────▼─────┐ ┌───▼──────┐ ┌──▼────────┐ ┌──▼─────────┐
│ LLM Service│ │Validator │ │ Executor  │ │ Evaluator  │
│            │ │          │ │           │ │            │
│ Multi-     │ │ Security │ │ VM        │ │ Field      │
│ Provider   │ │ Checks   │ │ Sandbox   │ │ Scoring    │
└────────────┘ └──────────┘ └───────────┘ └────────────┘
       │
┌──────▼────────────────────────────────────────────────┐
│           AI Providers (External APIs)                │
│  Anthropic | OpenAI | Google | DeepSeek              │
└───────────────────────────────────────────────────────┘
```

## Summary

This AI agent system dramatically reduces the manual effort of writing scrapers for new venues. Instead of hand-coding selectors and logic for each venue (typically 100-300 lines of code per scraper), the system:

1. ✅ Analyzes the venue website automatically
2. ✅ Generates scraper code iteratively
3. ✅ Tests and validates results
4. ✅ Improves based on feedback
5. ✅ Provides real-time visibility into the process
6. ✅ Supports multiple AI providers and models
7. ✅ Ensures code safety and security
8. ✅ Integrates seamlessly with existing infrastructure

The result: **Adding a new venue takes minutes instead of hours**, with the AI handling the complexity of parsing varied website structures.
