import { cleanupRateLimitStore } from '../middleware/chat-rate-limit'

export default defineNitroPlugin((nitroApp) => {
  // Run cleanup every hour to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    cleanupRateLimitStore()
    if (process.env.NODE_ENV === 'development') {
      console.log('[Rate Limit] Cleaned up expired rate limit entries')
    }
  }, 60 * 60 * 1000) // Every hour

  // Clean up interval on shutdown
  nitroApp.hooks.hook('close', () => {
    clearInterval(cleanupInterval)
  })

  if (process.env.NODE_ENV === 'development') {
    console.log('[Rate Limit] Cleanup scheduler initialized')
  }
})
