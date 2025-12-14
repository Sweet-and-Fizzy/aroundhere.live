/**
 * Composable to provide genre label mapping
 * Maps canonical genre slugs to friendly display names
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

export function useGenreLabels() {
  /**
   * Get the friendly display name for a genre slug
   * Falls back to capitalized slug if no mapping exists
   */
  function getGenreLabel(genreSlug: string): string {
    return GENRE_LABELS[genreSlug] || genreSlug.charAt(0).toUpperCase() + genreSlug.slice(1)
  }

  return {
    genreLabels: GENRE_LABELS,
    getGenreLabel,
  }
}
