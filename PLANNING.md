# Local Music Listings Service

A service to aggregate local music events from multiple sources, making it easy to discover shows happening nearby.

## Vision

- Aggregate events from venue websites, APIs, and manual submissions
- Provide faceted search and filtering (date, location, genre, artist)
- Start with a single region (Western Massachusetts), designed to scale to multiple regions
- Prioritize data quality through automated checks and human review

## MVP Phases

### Phase 1: Aggregator MVP
- 5-10 venue scrapers for key local venues
- Faceted search (date, location/radius, genre)
- Map + list views
- Simple admin dashboard (manage scrapers, review flagged events)
- Manual submission form (liaison-only)
- Basic deduplication (same venue + date + similar title)

### Phase 2: Scale Content
- AI-assisted parser generation for new venues
- Open manual submission with review queue
- Source trust scoring
- Improved deduplication and entity resolution

### Phase 3: Enhanced Discovery
- Natural language search
- MCP server for AI integrations
- Recommendations based on preferences
- Social features (going, interested, share)

## Tech Stack

- **Frontend**: Nuxt 3 (SSR for SEO)
- **Backend**: Nuxt server routes
- **Database**: PostgreSQL + PostGIS
- **Scrapers**: Node-based (Playwright for JS-heavy sites, Cheerio for static)
- **Search**: Postgres full-text search + PostGIS geo queries (Elasticsearch later if needed)
- **Hosting**: TBD (Railway, Render, Fly.io, or VPS)

## Data Model

```
regions
  id, name, timezone, bounds (polygon), default_radius

venues
  id, region_id, name, address, lat, lng, capacity, venue_type,
  website, verified, created_at

artists
  id, name, genres[], social_links{}, musicbrainz_id, spotify_id,
  is_local, created_at

events
  id, region_id, venue_id, title, starts_at, ends_at,
  description, cover_charge, age_restriction, ticket_url,
  source_id, source_url, confidence_score, review_status,
  created_at, updated_at

event_artists
  event_id, artist_id, billing_order (headliner, support, etc.)

sources
  id, name, type (scraper|api|manual), trust_score,
  parser_version, last_run, next_run, config{}

genres
  id, name, parent_id (hierarchical: rock → punk → hardcore)

users (for admin/liaisons initially)
  id, email, display_name, role, created_at

-- Future: user_events for social features
```

## Geo Strategy

Support both query types:
- **Radius from point**: "Events within 10 miles of me"
- **Named boundary**: "All events in Portland"

Store region boundaries as PostGIS polygons, venue locations as geography points.

## Scraper Architecture

```
Scraper Registry (DB)
    ↓
Scheduler (cron)
    ↓
Scraper Runner
    ↓
[Fetch] → [Parse] → [Normalize] → [Dedupe] → [Upsert]
    ↓
Flag anomalies for review
```

Each scraper:
- Registered in DB with config, schedule, last run status
- Outputs normalized event objects
- Handles rate limiting, retries, error logging
- Human-in-the-loop for new scraper deployment

## Human-in-the-Loop Touchpoints

| Area | Automated | Human Review |
|------|-----------|--------------|
| New scraper deployment | Generation, testing | Code review, approval |
| Events from trusted sources | Import, dedupe | Flagged anomalies only |
| Events from new sources | Parse, flag | All until trust established |
| Manual submissions | Spam detection | New submitters, flagged content |

## Search & Filtering (MVP)

Facets:
- **Date**: Today, This weekend, This week, Custom range
- **Location**: Radius from point OR within region boundary
- **Genre**: Multi-select from genre taxonomy
- **Venue**: Optional filter
- **Free text**: Artist/event name search

## Key Decisions

- **AI interface deferred**: Faceted search first; NLP/MCP in Phase 3
- **No ticket sales**: Link to original source only
- **Social features deferred**: Design for it, build later
- **Single region start**: But region_id in schema from day one

## Initial Venue list
- https://marigold.org/
- https://www.thedrakeamherst.org/events
- https://delaluz.org/
- https://ironhorse.org/
- https://progressionbrewing.com/taproom-events
- https://www.newcitybrewery.com/events-1
- https://hazenorthampton.org/index.php
- https://bromantics.band/#shows
- https://parlorroom.org/parlorroomshows

## Parser Failure Detection & Notifications

The system includes automatic failure detection and developer notifications:

- **Failure Detection**: Detects when parsers fail (zero events, errors, structure changes)
- **Smart Thresholds**: Only alerts on significant issues (not first runs or minor fluctuations)
- **Multiple Channels**: Console (always), webhook (Slack/Discord), email (planned)
- **HTML Snapshots**: Captures HTML for debugging when failures occur

**Configuration:**
- `PARSER_FAILURE_WEBHOOK_URL` - Webhook URL for notifications
- `PARSER_FAILURE_EMAIL_RECIPIENTS` - Comma-separated email addresses

**Future**: AI agents will use failure notifications to automatically fix parsers when website structures change.

## Open Questions

- [x] Initial venue list for scrapers
- [ ] Genre taxonomy (start with top 10-15?)
- [ ] Admin UI detail (what actions, what views?)
- [x] Deployment target and CI/CD setup
- [x] Monitoring and alerting approach

## Project Structure (Planned)

```
/local-music
  /app
    /pages          # Nuxt pages
    /components     # UI components
    /composables    # Shared logic
  /server
    /api            # REST endpoints
    /scrapers       # Scraper implementations
    /lib            # DB client, utilities
  /prisma           # Schema and migrations
  PLANNING.md
  README.md
```

## Team

- 1-2 developers
- Venue/artist liaisons (manual submissions, community outreach)
