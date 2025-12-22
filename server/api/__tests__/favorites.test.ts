import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Favorites API', () => {
  describe('GET /api/favorites', () => {
    it('requires authentication', () => {
      const favoritesGet = readFileSync(
        join(__dirname, '../favorites/index.get.ts'),
        'utf-8'
      )

      expect(favoritesGet).toContain('getUserSession')
      expect(favoritesGet).toMatch(/if\s*\(\s*!session/)
      expect(favoritesGet).toContain('Authentication required')
    })

    it('returns artists, venues, genres, and eventTypes', () => {
      const favoritesGet = readFileSync(
        join(__dirname, '../favorites/index.get.ts'),
        'utf-8'
      )

      expect(favoritesGet).toContain('userFavoriteArtist')
      expect(favoritesGet).toContain('userFavoriteVenue')
      expect(favoritesGet).toContain('userFavoriteGenre')
      expect(favoritesGet).toContain('userFavoriteEventType')
    })
  })

  describe('Event Types Favorites', () => {
    describe('POST /api/favorites/event-types', () => {
      it('requires authentication', () => {
        const eventTypesPost = readFileSync(
          join(__dirname, '../favorites/event-types/index.post.ts'),
          'utf-8'
        )

        expect(eventTypesPost).toContain('getUserSession')
        expect(eventTypesPost).toContain('Authentication required')
      })

      it('validates event type', () => {
        const eventTypesPost = readFileSync(
          join(__dirname, '../favorites/event-types/index.post.ts'),
          'utf-8'
        )

        expect(eventTypesPost).toContain('VALID_EVENT_TYPES')
        expect(eventTypesPost).toContain('Invalid event type')
      })

      it('uses upsert to handle duplicates', () => {
        const eventTypesPost = readFileSync(
          join(__dirname, '../favorites/event-types/index.post.ts'),
          'utf-8'
        )

        expect(eventTypesPost).toContain('upsert')
      })
    })

    describe('DELETE /api/favorites/event-types/[eventType]', () => {
      it('requires authentication', () => {
        const eventTypesDelete = readFileSync(
          join(__dirname, '../favorites/event-types/[eventType].delete.ts'),
          'utf-8'
        )

        expect(eventTypesDelete).toContain('getUserSession')
        expect(eventTypesDelete).toContain('Authentication required')
      })

      it('validates event type', () => {
        const eventTypesDelete = readFileSync(
          join(__dirname, '../favorites/event-types/[eventType].delete.ts'),
          'utf-8'
        )

        expect(eventTypesDelete).toContain('VALID_EVENT_TYPES')
        expect(eventTypesDelete).toContain('Invalid event type')
      })
    })
  })

  describe('Artists Favorites', () => {
    it('POST requires authentication', () => {
      const artistsPost = readFileSync(
        join(__dirname, '../favorites/artists/index.post.ts'),
        'utf-8'
      )

      expect(artistsPost).toContain('getUserSession')
      expect(artistsPost).toContain('Authentication required')
    })

    it('DELETE requires authentication', () => {
      const artistsDelete = readFileSync(
        join(__dirname, '../favorites/artists/[id].delete.ts'),
        'utf-8'
      )

      expect(artistsDelete).toContain('getUserSession')
      expect(artistsDelete).toContain('Authentication required')
    })
  })

  describe('Venues Favorites', () => {
    it('POST requires authentication', () => {
      const venuesPost = readFileSync(
        join(__dirname, '../favorites/venues/index.post.ts'),
        'utf-8'
      )

      expect(venuesPost).toContain('getUserSession')
      expect(venuesPost).toContain('Authentication required')
    })

    it('DELETE requires authentication', () => {
      const venuesDelete = readFileSync(
        join(__dirname, '../favorites/venues/[id].delete.ts'),
        'utf-8'
      )

      expect(venuesDelete).toContain('getUserSession')
      expect(venuesDelete).toContain('Authentication required')
    })
  })

  describe('Genres Favorites', () => {
    it('POST requires authentication', () => {
      const genresPost = readFileSync(
        join(__dirname, '../favorites/genres/index.post.ts'),
        'utf-8'
      )

      expect(genresPost).toContain('getUserSession')
      expect(genresPost).toContain('Authentication required')
    })

    it('DELETE requires authentication', () => {
      const genresDelete = readFileSync(
        join(__dirname, '../favorites/genres/[slug].delete.ts'),
        'utf-8'
      )

      expect(genresDelete).toContain('getUserSession')
      expect(genresDelete).toContain('Authentication required')
    })
  })
})
