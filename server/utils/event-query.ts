import type { Prisma } from '@prisma/client'
import { fromZonedTime } from 'date-fns-tz'

/**
 * Filters shared by the events list and the filter facet counts, so the counts
 * next to each filter option match what picking that option would show
 */
export interface EventListFilters {
  startDate: Date
  endDate?: Date
  // Region slugs as sent; resolve them to regionIds before building conditions
  regions?: string[]
  regionIds?: string[]
  regionId?: string
  venueId?: string
  venueIds?: string[]
  genres?: string[]
  state?: string
  city?: string
  cities?: string[]
  musicOnly: boolean
  nonMusicOnly: boolean
  eventType?: string
  eventTypes?: string[]
  favoriteArtistIds?: string[]
  favoriteVenueIds?: string[]
  favoriteGenres?: string[]
}

export type EventFacet = 'venue' | 'genre' | 'type' | 'city'

function list(value: unknown): string[] | undefined {
  return typeof value === 'string' && value ? value.split(',') : undefined
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/**
 * Parse list/facet query params. Dates are whole days in the given timezone,
 * and the start defaults to today there.
 */
export function parseEventListQuery(query: Record<string, unknown>, timezone: string): EventListFilters {
  const startDay = text(query.startDate) ?? new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  const endDay = text(query.endDate)

  return {
    startDate: fromZonedTime(`${startDay}T00:00:00`, timezone),
    endDate: endDay ? fromZonedTime(`${endDay}T23:59:59.999`, timezone) : undefined,
    regions: list(query.regions),
    regionId: text(query.regionId),
    venueId: text(query.venueId),
    venueIds: list(query.venueIds),
    genres: list(query.genres),
    state: text(query.state),
    city: text(query.city),
    cities: list(query.cities),
    // Music only unless musicOnly=false; nonMusicOnly=true wins over both
    musicOnly: query.musicOnly !== 'false',
    nonMusicOnly: query.nonMusicOnly === 'true',
    eventType: text(query.eventType),
    eventTypes: list(query.eventTypes),
    favoriteArtistIds: list(query.favoriteArtistIds),
    favoriteVenueIds: list(query.favoriteVenueIds),
    favoriteGenres: list(query.favoriteGenres),
  }
}

const NOT_PRIVATE: Prisma.EventWhereInput = {
  OR: [
    { eventType: { not: 'PRIVATE' } },
    { eventType: null },
  ],
}

/**
 * Conditions to AND together for the given filters. `omit` leaves out the filter
 * a facet counts, so each option's count is what selecting it would show.
 */
export function eventFilterConditions(filters: EventListFilters, omit?: EventFacet): Prisma.EventWhereInput[] {
  const conditions: Prisma.EventWhereInput[] = [
    {
      startsAt: {
        gte: filters.startDate,
        ...(filters.endDate && { lte: filters.endDate }),
      },
    },
    { reviewStatus: 'APPROVED' },
    { isCancelled: false },
  ]

  // Specific types replace the music/non-music filter; type counts cover every
  // classified event
  const eventTypes = filters.eventTypes?.length ? filters.eventTypes : undefined
  if (omit === 'type') {
    conditions.push({ isMusic: { not: null }, ...NOT_PRIVATE })
  } else if (eventTypes) {
    conditions.push({ eventType: { in: eventTypes as Prisma.EnumEventTypeNullableFilter['in'] } })
  } else if (filters.eventType) {
    conditions.push({ eventType: filters.eventType as Prisma.EnumEventTypeNullableFilter })
  } else if (filters.nonMusicOnly) {
    conditions.push({ isMusic: false, ...NOT_PRIVATE })
  } else if (filters.musicOnly) {
    conditions.push({ isMusic: true, ...NOT_PRIVATE })
  } else {
    conditions.push({ isMusic: { not: null }, ...NOT_PRIVATE })
  }

  // Regions and cities share the location picker, so city counts ignore both
  if (omit !== 'city') {
    if (filters.regionIds?.length) {
      conditions.push({ regionId: { in: filters.regionIds } })
    } else if (filters.regionId) {
      conditions.push({ regionId: filters.regionId })
    }
    if (filters.cities?.length) {
      conditions.push({ venue: { city: { in: filters.cities } } })
    } else if (filters.city) {
      conditions.push({ venue: { city: { contains: filters.city, mode: 'insensitive' } } })
    }
  }
  if (filters.state) {
    conditions.push({ venue: { state: { equals: filters.state, mode: 'insensitive' } } })
  }

  if (omit !== 'venue') {
    if (filters.venueIds?.length) {
      conditions.push({ venueId: { in: filters.venueIds } })
    } else if (filters.venueId) {
      conditions.push({ venueId: filters.venueId })
    }
  }

  if (omit !== 'genre' && filters.genres?.length) {
    conditions.push({ canonicalGenres: { hasSome: filters.genres.map(g => g.toLowerCase()) } })
  }

  // Favorites match any of the chosen kinds
  const favorites: Prisma.EventWhereInput[] = []
  if (filters.favoriteArtistIds?.length) {
    favorites.push({ eventArtists: { some: { artistId: { in: filters.favoriteArtistIds } } } })
  }
  if (filters.favoriteVenueIds?.length) {
    favorites.push({ venueId: { in: filters.favoriteVenueIds } })
  }
  if (filters.favoriteGenres?.length) {
    favorites.push({ canonicalGenres: { hasSome: filters.favoriteGenres.map(g => g.toLowerCase()) } })
  }
  if (favorites.length > 0) {
    conditions.push({ OR: favorites })
  }

  return conditions
}
