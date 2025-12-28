/**
 * Composable to provide event type label mapping and color coding
 * Maps event type slugs to friendly display names and badge colors
 */

// Human-readable labels for event types
const EVENT_TYPE_LABELS: Record<string, string> = {
  'ALL_MUSIC': 'All Music',
  'ALL_EVENTS': 'All Events',
  'MUSIC': 'Live Music',
  'DJ': 'DJ',
  'OPEN_MIC': 'Open Mic',
  'KARAOKE': 'Karaoke',
  'COMEDY': 'Comedy',
  'THEATER': 'Theater',
  'TRIVIA': 'Trivia',
  'GAMES': 'Games',
  'DANCE': 'Dance',
  'MARKET': 'Market',
  'WORKSHOP': 'Workshop',
  'PARTY': 'Party',
  'FITNESS': 'Fitness',
  'DRAG': 'Drag',
  'PRIVATE': 'Private Event',
  'FILM': 'Film',
  'SPOKEN_WORD': 'Spoken Word',
  'COMMUNITY': 'Community',
  'FOOD': 'Food',
  'SPORTS': 'Sports',
  'OTHER': 'Other',
}

// Color mapping for event types - uses BOLD, SATURATED colors to stand out from soft genre badges
// Strategy: Event types use darker/bolder shades while genres use lighter/softer tones
// This creates clear visual hierarchy where event type is the PRIMARY badge
const EVENT_TYPE_COLORS: Record<string, string> = {
  // Performance types - bold primary colors
  'MUSIC': 'indigo',       // Indigo - bold, musical
  'DJ': 'purple',          // Purple - vibrant, nightlife
  'THEATER': 'red',        // Red - dramatic, bold
  'COMEDY': 'yellow',      // Yellow - bright, cheerful
  'DANCE': 'fuchsia',      // Fuchsia - energetic, vibrant
  'DRAG': 'pink',          // Pink - fabulous, bold

  // Interactive types - bright engaging colors
  'OPEN_MIC': 'orange',    // Orange - welcoming, creative
  'KARAOKE': 'rose',       // Rose - fun, social
  'GAMES': 'lime',         // Lime - playful, fun

  // Activity types - active colors
  'FITNESS': 'green',      // Green - active, healthy
  'WORKSHOP': 'teal',      // Teal - educational, hands-on
  'PARTY': 'amber',        // Amber - celebration, festive

  // Cultural/media types
  'FILM': 'blue',          // Blue - cinematic
  'SPOKEN_WORD': 'sky',    // Sky - thoughtful, literary

  // Commercial/other types
  'MARKET': 'emerald',     // Emerald - commercial, vibrant
  'PRIVATE': 'slate',      // Slate - exclusive
  'OTHER': 'gray',         // Gray - neutral
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

  /**
   * Get Tailwind badge classes for an event type (for use with :ui prop in Nuxt UI v4)
   * Uses BOLDER backgrounds (100-200 shades) to stand out from genre badges (50 shades)
   * Creates clear visual hierarchy - event type is PRIMARY, genres are secondary
   */
  function getEventTypeBadgeClasses(typeSlug: string | null | undefined): string {
    const color = getEventTypeColor(typeSlug)
    const colorClasses: Record<string, string> = {
      'red': 'bg-red-100 text-red-900 font-semibold',
      'orange': 'bg-orange-100 text-orange-900 font-semibold',
      'amber': 'bg-amber-100 text-amber-900 font-semibold',
      'yellow': 'bg-yellow-100 text-yellow-900 font-semibold',
      'lime': 'bg-lime-100 text-lime-900 font-semibold',
      'green': 'bg-green-100 text-green-900 font-semibold',
      'emerald': 'bg-emerald-100 text-emerald-900 font-semibold',
      'teal': 'bg-teal-100 text-teal-900 font-semibold',
      'cyan': 'bg-cyan-100 text-cyan-900 font-semibold',
      'sky': 'bg-sky-100 text-sky-900 font-semibold',
      'blue': 'bg-blue-100 text-blue-900 font-semibold',
      'indigo': 'bg-indigo-100 text-indigo-900 font-semibold',
      'violet': 'bg-violet-100 text-violet-900 font-semibold',
      'purple': 'bg-purple-100 text-purple-900 font-semibold',
      'fuchsia': 'bg-fuchsia-100 text-fuchsia-900 font-semibold',
      'pink': 'bg-pink-100 text-pink-900 font-semibold',
      'rose': 'bg-rose-100 text-rose-900 font-semibold',
      'slate': 'bg-slate-100 text-slate-900 font-semibold',
      'gray': 'bg-gray-100 text-gray-900 font-semibold',
    }
    return colorClasses[color] || 'bg-gray-100 text-gray-900 font-semibold'
  }

  return {
    eventTypeLabels: EVENT_TYPE_LABELS,
    getEventTypeLabel,
    getEventTypeColor,
    getEventTypeBadgeClasses,
  }
}
