import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Recommendations Service', () => {
  const recommendationsService = readFileSync(
    join(__dirname, '../recommendations/index.ts'),
    'utf-8'
  )

  describe('Scoring weights', () => {
    it('includes embedding similarity weight', () => {
      expect(recommendationsService).toContain('embeddingSimilarity')
    })

    it('includes venue match weight', () => {
      expect(recommendationsService).toContain('venueMatch')
    })

    it('includes genre overlap weight', () => {
      expect(recommendationsService).toContain('genreOverlap')
    })

    it('includes event type match weight', () => {
      expect(recommendationsService).toContain('eventTypeMatch')
    })
  })

  describe('User profile', () => {
    it('fetches favorite venue IDs', () => {
      expect(recommendationsService).toContain('favoriteVenueIds')
      expect(recommendationsService).toContain('userFavoriteVenue')
    })

    it('fetches favorite genres', () => {
      expect(recommendationsService).toContain('favoriteGenres')
      expect(recommendationsService).toContain('userFavoriteGenre')
    })

    it('fetches favorite event types', () => {
      expect(recommendationsService).toContain('favoriteEventTypes')
      expect(recommendationsService).toContain('userFavoriteEventType')
    })

    it('fetches favorite artist IDs', () => {
      expect(recommendationsService).toContain('favoriteArtistIds')
      expect(recommendationsService).toContain('userFavoriteArtist')
    })
  })

  describe('Scoring logic', () => {
    it('scores venue matches', () => {
      expect(recommendationsService).toContain('favoriteVenueIds.includes')
      expect(recommendationsService).toContain('a favorite venue')
    })

    it('scores genre overlap', () => {
      expect(recommendationsService).toContain('overlappingGenres')
      expect(recommendationsService).toContain('favoriteGenres.includes')
    })

    it('scores event type matches', () => {
      expect(recommendationsService).toContain('eventTypeMatch')
      expect(recommendationsService).toContain('favoriteEventTypes.includes')
    })

    it('provides human-readable event type labels', () => {
      expect(recommendationsService).toContain("'MUSIC': 'Live Music'")
      expect(recommendationsService).toContain("'DJ': 'DJ'")
      expect(recommendationsService).toContain("'COMEDY': 'Comedy'")
    })
  })

  describe('Confidence threshold', () => {
    it('exports minimum confidence threshold', () => {
      expect(recommendationsService).toContain('MIN_CONFIDENCE_THRESHOLD')
      expect(recommendationsService).toContain('0.6')
    })
  })

  describe('Candidate events', () => {
    it('filters for music events', () => {
      expect(recommendationsService).toContain('isMusic')
    })

    it('excludes cancelled events', () => {
      expect(recommendationsService).toContain('isCancelled')
    })

    it('requires embeddings', () => {
      expect(recommendationsService).toContain('embedding IS NOT NULL')
    })
  })
})
