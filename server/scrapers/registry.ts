/**
 * Scraper Registry
 *
 * Provides information about available hardcoded scrapers
 */

// List of source slugs that have hardcoded scrapers
// This should match the scrapers registered in runner.ts
const hardcodedScraperSlugs = new Set([
  'iron-horse',
  'the-drake',
  'new-city-brewery',
  'haze',
  'parlor-room',
  'de-la-luz',
  'marigold',
  'progression-brewing',
  'stone-church',
  'marigold-brattleboro',
  'fame',
  'luthiers',
  'daily-operation',
])

/**
 * Check if a source has a hardcoded scraper available
 */
export function hasHardcodedScraper(sourceSlug: string): boolean {
  return hardcodedScraperSlugs.has(sourceSlug)
}

/**
 * Get all source slugs that have hardcoded scrapers
 */
export function getHardcodedScraperSlugs(): string[] {
  return Array.from(hardcodedScraperSlugs)
}
