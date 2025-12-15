/**
 * Composable to provide event type label mapping and color coding
 * Maps event type slugs to friendly display names and badge colors
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

// Color mapping for event types using Nuxt UI badge colors
// Chose distinct colors for easy visual differentiation
const EVENT_TYPE_COLORS: Record<string, string> = {
  'MUSIC': 'indigo',       // Indigo - musical, sophisticated
  'DJ': 'violet',          // Violet - electronic, nightlife
  'OPEN_MIC': 'amber',     // Amber - warm, welcoming
  'KARAOKE': 'pink',       // Pink - fun, playful
  'COMEDY': 'yellow',      // Yellow - bright, cheerful
  'THEATER': 'red',        // Red - dramatic, bold
  'GAMES': 'emerald',      // Emerald - playful, competitive
  'DANCE': 'fuchsia',      // Fuchsia - energetic, vibrant
  'MARKET': 'teal',        // Teal - commercial, diverse
  'WORKSHOP': 'cyan',      // Cyan - educational, creative
  'PARTY': 'rose',         // Rose - celebration, festive
  'FITNESS': 'lime',       // Lime - active, healthy
  'DRAG': 'purple',        // Purple - fabulous, artistic
  'TRIVIA': 'orange',      // Orange - intellectual, fun
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

  /**
   * Get the badge color for an event type
   * Falls back to 'gray' if no mapping exists
   */
  function getEventTypeColor(typeSlug: string | null | undefined): string {
    if (!typeSlug) return 'gray'
    return EVENT_TYPE_COLORS[typeSlug] || 'gray'
  }

  return {
    eventTypeLabels: EVENT_TYPE_LABELS,
    getEventTypeLabel,
    getEventTypeColor,
  }
}
