# Parser Failure Detection & Notification System

## Overview

This system automatically detects when website parsers fail due to structural changes or errors, and notifies developers. It's designed to be the foundation for future AI-powered parser auto-fixing.

## What's Implemented

### 1. Failure Detection Service (`server/services/failure-detection/`)
- Detects multiple failure types:
  - **Zero Events**: No events found when historical data suggests there should be
  - **Parse Errors**: Exceptions during parsing
  - **Structure Changes**: Significant drops in event count (50%+)
  - **HTTP Errors**: Failed requests
  - **Timeouts**: Scraper timeouts
  - **Unexpected Format**: Events missing critical fields

- **Smart Thresholds**: 
  - Only notifies on significant issues
  - Doesn't alert on first-time runs (no historical data)
  - Escalates severity after consecutive failures

### 2. Notification Service (`server/services/notifications/`)
- **Console Channel**: Always enabled for development
- **Webhook Channel**: Send to Slack, Discord, or custom endpoints
- **Email Channel**: Infrastructure ready (implementation pending)

### 3. Integration
- Automatically runs after each scraper execution
- Updates source status in database
- Tracks consecutive failures
- Captures HTML snapshots for debugging

## Configuration

Add to your `.env` file:

```bash
# Webhook URL (e.g., Slack webhook)
PARSER_FAILURE_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Email recipients (comma-separated, not yet implemented)
PARSER_FAILURE_EMAIL_RECIPIENTS=dev@example.com
```

## How It Works

1. **After Scraping**: Each scraper run is analyzed by the failure detection service
2. **Historical Comparison**: Current results compared to historical averages
3. **Failure Detection**: Identifies if failure is significant enough to notify
4. **Notification**: Sends alerts through configured channels
5. **Database Tracking**: Records failures for analytics

## Example Notification

When a parser fails, you'll see:

```
🚨 PARSER FAILURE ALERT 🚨
Source: Iron Horse Music Hall (iron-horse)
Type: zero_events
Severity: ERROR
Message: No events found. Expected ~15 events based on historical data. (3 consecutive failures)
Events found: 0
Events expected: 15
Consecutive failures: 3
Timestamp: 2025-01-15T10:30:00.000Z
```

## Database Schema (Optional)

An optional migration (`prisma/migrations/add_parser_failures/migration.sql`) adds:
- `parser_failures` table for detailed failure history
- `consecutive_failures` and `last_failure_at` fields on `sources` table

The code gracefully handles these fields whether they exist or not.

## Future Enhancements

### Phase 1: Current (✅ Complete)
- Basic failure detection
- Console notifications
- Webhook support

### Phase 2: Planned
- Email notifications (SendGrid/SES integration)
- Admin dashboard for viewing failures
- Failure analytics and trends

### Phase 3: AI Integration
- **AI Parser Auto-Fix**: Use failure notifications to trigger AI agents
- **Automatic Parser Updates**: AI analyzes HTML snapshots and fixes parsers
- **Parser Versioning**: Track and rollback parser versions

## Testing

To test the notification system:

1. Temporarily break a parser (e.g., change a selector)
2. Run the scraper: `npm run db:seed` or run scrapers manually
3. Check console for failure notifications
4. If webhook is configured, check your Slack/Discord channel

## Architecture Decisions

- **Non-blocking**: Failures don't stop the scraping process
- **Graceful Degradation**: Works even if database fields don't exist
- **Extensible**: Easy to add new notification channels
- **Future-Ready**: Designed to integrate with AI parser generation

