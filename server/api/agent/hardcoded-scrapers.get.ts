/**
 * Get list of venue slugs that have hardcoded scrapers
 * GET /api/agent/hardcoded-scrapers
 */

import { hardcodedScraperSlugs } from './run-hardcoded-scraper.post'

export default defineEventHandler(() => {
  return { slugs: hardcodedScraperSlugs }
})
