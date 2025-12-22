import prisma from '../../utils/prisma'

import { CANONICAL_GENRES } from '../../services/classifier/types'

// Human-readable labels for display
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
  'celtic': 'Celtic',
  'latin': 'Latin',
  'funk': 'Funk',
  'reggae': 'Reggae',
  'jam': 'Jam',
  'experimental': 'Experimental',
}

export default defineEventHandler(async () => {
  // Get canonical genres from classified events
  const events = await prisma.event.findMany({
    select: {
      canonicalGenres: true,
    },
    where: {
      startsAt: {
        gte: new Date(),
      },
      reviewStatus: { in: ['APPROVED', 'PENDING'] },
      isCancelled: false,
      isMusic: true, // Only music events have meaningful genres
    },
  })

  // Collect unique canonical genres that actually exist in events
  const genreSet = new Set<string>()
  for (const event of events) {
    for (const genre of event.canonicalGenres) {
      if (CANONICAL_GENRES.includes(genre)) {
        genreSet.add(genre)
      }
    }
  }

  // Return sorted list alphabetically by display label
  const genres = Array.from(genreSet)
    .sort((a, b) => (GENRE_LABELS[a] || a).localeCompare(GENRE_LABELS[b] || b))

  return {
    // Return slugs for filtering (used as values)
    genres,
    // Also return a map for display purposes if needed
    genreLabels: GENRE_LABELS,
  }
})
