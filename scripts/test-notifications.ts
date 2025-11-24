import 'dotenv/config'
import { notificationService } from '../server/services/notifications'
import type { ParserFailureNotification } from '../server/services/notifications'

async function testNotifications() {
  console.log('Testing notification system...\n')
  console.log('Webhook URL:', process.env.PARSER_FAILURE_WEBHOOK_URL ? 'SET' : 'NOT SET')
  console.log('')

  const testNotification: ParserFailureNotification = {
    sourceId: 'test-scraper',
    sourceName: 'Test Scraper',
    sourceUrl: 'https://example.com',
    failureType: 'zero_events',
    severity: 'error',
    message: 'Test notification - No events found. Expected ~10 events.',
    details: {
      eventsFound: 0,
      eventsExpected: 10,
      errors: [],
      consecutiveFailures: 3,
    },
    timestamp: new Date(),
  }

  console.log('Sending test notification...\n')
  await notificationService.notify(testNotification)
  console.log('\nTest complete!')
}

testNotifications().catch(console.error)

