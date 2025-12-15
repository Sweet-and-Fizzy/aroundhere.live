/**
 * Composable to provide genre label mapping and color coding
 * Maps canonical genre slugs to friendly display names and badge colors
 */

// Human-readable labels for display (sync with server/api/genres/index.get.ts)
const GENRE_LABELS: Record<string, string> = {
  'rock': 'Rock',
  'indie': 'Indie',
  'punk': 'Punk',
  'metal': 'Metal',
  'jazz': 'Jazz',
  'blues': 'Blues',
  'folk': 'Folk',
  'country': 'Country',
  'bluegrass': 'Bluegrass',
  'americana': 'Americana',
  'singer-songwriter': 'Singer-Songwriter',
  'hip-hop': 'Hip-Hop',
  'r-and-b': 'R&B',
  'electronic': 'Electronic',
  'classical': 'Classical',
  'world': 'World',
  'funk': 'Funk',
  'reggae': 'Reggae',
  'spoken-word': 'Spoken Word',
}

// Color mapping for genres - grouped by musical similarity
// Similar genres use similar color families for intuitive visual grouping
const GENRE_COLORS: Record<string, string> = {
  // Rock family - reds to pinks
  'rock': 'red',           // Red - strong, energetic
  'punk': 'rose',          // Rose - rebellious, raw
  'metal': 'pink',         // Pink - intense, bold

  // Folk/Americana family - earth tones (greens to ambers)
  'folk': 'emerald',       // Emerald - natural, earthy
  'country': 'lime',       // Lime - rustic, fresh
  'bluegrass': 'green',    // Green - upbeat, traditional
  'americana': 'amber',    // Amber - nostalgic, warm

  // Jazz/Blues/Classical family - cool blues to purples
  'jazz': 'indigo',        // Indigo - sophisticated, smooth
  'blues': 'blue',         // Blue - melancholy, soulful
  'classical': 'violet',   // Violet - refined, elegant

  // Hip-hop/R&B/Funk family - vibrant purples to magentas
  'hip-hop': 'purple',     // Purple - bold, creative
  'r-and-b': 'fuchsia',    // Fuchsia - smooth, vibrant
  'funk': 'yellow',        // Yellow - funky, groovy

  // Electronic/World family - teals to cyans
  'electronic': 'cyan',    // Cyan - modern, digital
  'world': 'teal',         // Teal - diverse, global

  // Singer-songwriter/Indie family - warm tones
  'indie': 'orange',       // Orange - creative, independent
  'singer-songwriter': 'sky', // Sky - artistic, intimate

  // Reggae - distinct green (island vibes)
  'reggae': 'emerald',     // Emerald - relaxed, island vibes

  // Spoken word - neutral
  'spoken-word': 'slate',  // Slate - thoughtful, literary
}

export function useGenreLabels() {
  /**
   * Get the friendly display name for a genre slug
   * Falls back to title-cased slug with proper spacing if no mapping exists
   */
  function getGenreLabel(genreSlug: string): string {
    if (GENRE_LABELS[genreSlug]) {
      return GENRE_LABELS[genreSlug]
    }
    // Fallback: convert slug to title case with spaces
    return genreSlug
      .replace(/[-_]/g, ' ')  // Replace hyphens and underscores with spaces
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  /**
   * Get the badge color for a genre
   * Falls back to 'primary' if no mapping exists
   */
  function getGenreColor(genreSlug: string): string {
    return GENRE_COLORS[genreSlug] || 'primary'
  }

  /**
   * Get Tailwind badge classes for a genre (for use with :ui prop in Nuxt UI v4)
   * Returns classes for background and text based on genre color
   * Text is always black (text-gray-900) for maximum contrast and readability
   * No border/ring for a clean look
   */
  function getGenreBadgeClasses(genreSlug: string): string {
    const color = getGenreColor(genreSlug)
    const colorClasses: Record<string, string> = {
      'red': 'bg-red-50 text-gray-900',
      'orange': 'bg-orange-50 text-gray-900',
      'amber': 'bg-amber-50 text-gray-900',
      'yellow': 'bg-yellow-50 text-gray-900',
      'lime': 'bg-lime-50 text-gray-900',
      'green': 'bg-green-50 text-gray-900',
      'emerald': 'bg-emerald-50 text-gray-900',
      'teal': 'bg-teal-50 text-gray-900',
      'cyan': 'bg-cyan-50 text-gray-900',
      'sky': 'bg-sky-50 text-gray-900',
      'blue': 'bg-blue-50 text-gray-900',
      'indigo': 'bg-indigo-50 text-gray-900',
      'violet': 'bg-violet-50 text-gray-900',
      'purple': 'bg-purple-50 text-gray-900',
      'fuchsia': 'bg-fuchsia-50 text-gray-900',
      'pink': 'bg-pink-50 text-gray-900',
      'rose': 'bg-rose-50 text-gray-900',
      'slate': 'bg-slate-50 text-gray-900',
      'gray': 'bg-gray-50 text-gray-900',
    }
    return colorClasses[color] || 'bg-blue-50 text-gray-900'
  }

  return {
    genreLabels: GENRE_LABELS,
    getGenreLabel,
    getGenreColor,
    getGenreBadgeClasses,
  }
}
