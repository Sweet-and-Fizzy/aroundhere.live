/**
 * Composable to provide event type label mapping
 * Maps event type slugs to friendly display names
 */

// Human-readable labels for event types
const EVENT_TYPE_LABELS: Record<string, string> = {
  'MUSIC': 'Live Music',
  'DJ': 'DJ',
  'OPEN_MIC': 'Open Mic',
  'KARAOKE': 'Karaoke',
  'COMEDY': 'Comedy',
  'THEATER': 'Theater',
  'GAMES': 'Games',
  'DANCE': 'Dance',
  'MARKET': 'Market',
  'WORKSHOP': 'Workshop',
  'PARTY': 'Party',
  'FITNESS': 'Fitness',
  'DRAG': 'Drag',
  'TRIVIA': 'Trivia',
}

export function useEventTypeLabels() {
  /**
   * Get the friendly display name for an event type slug
   * Falls back to capitalized slug if no mapping exists
   */
  function getEventTypeLabel(typeSlug: string | null | undefined): string | null {
    if (!typeSlug) return null
    return EVENT_TYPE_LABELS[typeSlug] || typeSlug.charAt(0) + typeSlug.slice(1).toLowerCase()
  }

  return {
    eventTypeLabels: EVENT_TYPE_LABELS,
    getEventTypeLabel,
  }
}
