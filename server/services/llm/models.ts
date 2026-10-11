/**
 * Every Claude model the app calls, in one place. The daily scraper-health
 * cron checks each of these against the Models API, so a retirement shows up
 * in Slack before a user hits it.
 */
export const MODELS = {
  chat: 'claude-haiku-4-5-20251001',
  scraperGeneration: 'claude-sonnet-5-5',
  classifier: 'claude-haiku-4-5-20251001',
  curator: 'claude-haiku-4-5-20251001',
  reviews: 'claude-haiku-4-5-20251001',
  clustering: 'claude-haiku-4-5-20251001',
} as const

export function registeredModels(extra: Array<string | undefined> = []): string[] {
  const all = [...Object.values(MODELS), ...extra.filter((m): m is string => !!m)]
  return [...new Set(all)].sort()
}

// Retired ids still stored on old agent sessions and queued jobs, mapped to
// their replacement so re-runs and approvals keep working.
const RETIRED: Record<string, string> = {
  'claude-sonnet-4-20250514': MODELS.scraperGeneration,
  'claude-3-5-sonnet-20241022': MODELS.scraperGeneration,
  'claude-3-haiku-20240307': MODELS.classifier,
}

export function currentModel(model: string): string {
  return RETIRED[model] ?? model
}

// Opus 4.7+, Sonnet 5+, and the Fable/Mythos tier reject non-default
// temperature/top_p/top_k with a 400.
const NO_SAMPLING_PARAMS = /^claude-(fable|mythos|opus-(4-[78]|5)|sonnet-5)/

export function acceptsSamplingParams(model: string): boolean {
  return !NO_SAMPLING_PARAMS.test(model)
}
