/**
 * Scraper worker plugin
 * Starts the BullMQ worker when the server starts
 */

import { startScraperWorker, stopScraperWorker } from '../queues/scraper.worker'

export default defineNitroPlugin((nitroApp) => {
  // Start worker when server starts
  console.log('[ScraperWorker] Initializing scraper job queue worker...')
  startScraperWorker()

  // Stop worker on shutdown
  nitroApp.hooks.hook('close', async () => {
    console.log('[ScraperWorker] Shutting down worker...')
    await stopScraperWorker()
  })
})
