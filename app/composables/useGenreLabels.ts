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
}

// Color mapping for genres using Nuxt UI badge colors
// Chose colors far apart on the color wheel for maximum differentiation
const GENRE_COLORS: Record<string, string> = {
  'rock': 'red',           // Red for rock - strong, energetic
  'indie': 'orange',       // Orange for indie - warm, creative
  'punk': 'pink',          // Pink for punk - rebellious
  'metal': 'gray',         // Gray for metal - dark, heavy
  'jazz': 'indigo',        // Indigo for jazz - sophisticated
  'blues': 'blue',         // Blue for blues - melancholy
  'folk': 'emerald',       // Emerald for folk - natural, earthy
  'country': 'amber',      // Amber for country - rustic
  'bluegrass': 'lime',     // Lime for bluegrass - fresh, upbeat
  'americana': 'rose',     // Rose for americana - nostalgic
  'singer-songwriter': 'purple', // Purple for singer-songwriter - artistic
  'hip-hop': 'violet',     // Violet for hip-hop - bold
  'r-and-b': 'fuchsia',    // Fuchsia for R&B - smooth, vibrant
  'electronic': 'cyan',    // Cyan for electronic - modern, digital
  'classical': 'sky',      // Sky for classical - refined, airy
  'world': 'teal',         // Teal for world - diverse, global
  'funk': 'yellow',        // Yellow for funk - funky, groovy
  'reggae': 'green',       // Green for reggae - relaxed, island vibes
}

export function useGenreLabels() {
  /**
   * Get the friendly display name for a genre slug
   * Falls back to capitalized slug if no mapping exists
   */
  function getGenreLabel(genreSlug: string): string {
    return GENRE_LABELS[genreSlug] || genreSlug.charAt(0).toUpperCase() + genreSlug.slice(1)
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
