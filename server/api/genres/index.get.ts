import prisma from '../../utils/prisma'

// Canonical genres from the classifier - these are the normalized genre labels
const CANONICAL_GENRES = [
  'rock',
  'indie',
  'punk',
  'metal',
  'jazz',
  'blues',
  'folk',
  'country',
  'bluegrass',
  'americana',
  'singer-songwriter',
  'hip-hop',
  'r-and-b',
  'electronic',
  'classical',
  'world',
  'funk',
  'reggae',
]

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
  'funk': 'Funk',
  'reggae': 'Reggae',
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

  // Return sorted list with display labels
  const genres = Array.from(genreSet)
    .sort((a, b) => CANONICAL_GENRES.indexOf(a) - CANONICAL_GENRES.indexOf(b))
    .map(g => GENRE_LABELS[g] || g)

  return { genres }
})
