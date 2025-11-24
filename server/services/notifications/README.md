# Parser Failure Notification System

This system automatically detects when website parsers fail due to structural changes or errors, and notifies developers.

## Features

- **Automatic Failure Detection**: Detects when parsers fail to find events, encounter errors, or experience significant drops in event counts
- **Multiple Notification Channels**: Supports console, webhook, and email notifications
- **Smart Thresholds**: Only notifies on significant issues (not first-time runs or minor fluctuations)
- **HTML Snapshots**: Captures HTML for debugging when failures occur

## Failure Types Detected

1. **Zero Events** - No events found when historical data suggests there should be events
2. **Parse Error** - Parser threw an exception during execution
3. **Structure Change** - Significant drop in event count (suggests HTML structure changed)
4. **HTTP Error** - HTTP request failed (404, 500, etc.)
5. **Timeout** - Scraper timed out
6. **Unexpected Format** - Events found but missing critical fields

## Configuration

Add these environment variables to enable notifications:

```bash
# Webhook URL (e.g., Slack, Discord, custom endpoint)
PARSER_FAILURE_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Email recipients (comma-separated)
PARSER_FAILURE_EMAIL_RECIPIENTS=dev@example.com,admin@example.com
```

## Notification Channels

### Console (Always Enabled)
Notifications are always printed to the console. This is useful for development and local testing.

### Webhook
Send notifications to any webhook endpoint (Slack, Discord, custom API, etc.).

**Slack Example:**
1. Create a Slack webhook: https://api.slack.com/messaging/webhooks
2. Set `PARSER_FAILURE_WEBHOOK_URL` to your webhook URL
3. Notifications will appear in your Slack channel

### Email (Placeholder)
Email notifications are planned but not yet implemented. The infrastructure is in place for future integration with email services (SendGrid, AWS SES, etc.).

## How It Works

1. **After Each Scrape**: The failure detection service analyzes the scraper results
2. **Historical Comparison**: Compares current results with historical averages
3. **Failure Detection**: Identifies if the failure is significant enough to notify
4. **Notification**: Sends alerts through configured channels

## Future Enhancements

- **AI Parser Generation**: Use failure notifications to trigger AI agents that automatically fix parsers
- **Failure Analytics**: Track failure patterns over time
- **Auto-Recovery**: Attempt automatic fixes for common issues
- **Parser Versioning**: Track parser versions and rollback on failures

