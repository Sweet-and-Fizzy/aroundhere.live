import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { HOLDING_REGION_SLUG } from '../../../utils/geo'
import { findBusiestRegion, pickActivityRegion, resolveListingRegion } from '../listing-region'

const home = { id: 'r1', name: 'Home', timezone: 'America/New_York' }
const busiest = { id: 'r9', name: 'Busy', timezone: 'America/New_York' }
const elsewhere = { id: 'r2', name: 'Elsewhere', timezone: 'America/Chicago' }

const favorites = vi.fn()
const attendance = vi.fn()
const findRegion = vi.fn()
const groupBy = vi.fn()
const countEvents = vi.fn()
const week = { from: new Date('2026-11-11T13:00:00Z'), to: new Date('2026-11-18T23:59:59Z') }
const prisma = {
  userFavoriteVenue: { findMany: favorites },
  userEventAttendance: { findMany: attendance },
  region: { findUnique: findRegion },
  event: { groupBy, count: countEvents },
} as unknown as PrismaClient

beforeEach(() => {
  vi.resetAllMocks()
  favorites.mockResolvedValue([])
  attendance.mockResolvedValue([])
  findRegion.mockResolvedValue(elsewhere)
  countEvents.mockResolvedValue(5)
})

describe('pickActivityRegion', () => {
  it('picks the most common region', () => {
    expect(pickActivityRegion(['b', 'a', 'b'])).toBe('b')
  })

  it('breaks ties by lowest id', () => {
    expect(pickActivityRegion(['b', 'a'])).toBe('a')
  })

  it('returns null with no activity', () => {
    expect(pickActivityRegion([])).toBeNull()
  })
})

describe('resolveListingRegion', () => {
  it("keeps the user's own region even with activity elsewhere", async () => {
    favorites.mockResolvedValue([{ venue: { regionId: 'r2' } }])
    expect(await resolveListingRegion(prisma, { id: 'u', region: home }, busiest, week)).toEqual({ ...home, source: 'user' })
    expect(favorites).not.toHaveBeenCalled()
  })

  it('uses activity before the fallback', async () => {
    favorites.mockResolvedValue([{ venue: { regionId: 'r2' } }])
    attendance.mockResolvedValue([{ event: { regionId: 'r2' } }, { event: { regionId: 'r3' } }])
    expect(await resolveListingRegion(prisma, { id: 'u', region: null }, busiest, week)).toEqual({ ...elsewhere, source: 'activity' })
    expect(findRegion.mock.calls[0]?.[0].where).toEqual({ id: 'r2' })
  })

  it('falls back when the activity region has no events this week', async () => {
    favorites.mockResolvedValue([{ venue: { regionId: 'r2' } }])
    countEvents.mockResolvedValue(0)
    expect(await resolveListingRegion(prisma, { id: 'u', region: null }, busiest, week)).toEqual({ ...busiest, source: 'fallback' })
    expect(countEvents.mock.calls[0]?.[0].where).toMatchObject({ regionId: 'r2', startsAt: { gte: week.from, lte: week.to } })
  })

  it('ignores activity in the holding region and inactive regions', async () => {
    const eligible = { isActive: true, slug: { not: HOLDING_REGION_SLUG } }
    expect(await resolveListingRegion(prisma, { id: 'u', region: null }, busiest, week)).toEqual({ ...busiest, source: 'fallback' })
    expect(favorites.mock.calls[0]?.[0].where.venue.region).toEqual(eligible)
    expect(attendance.mock.calls[0]?.[0].where.event.region).toEqual(eligible)
  })

  it('returns null when there is no activity and no fallback', async () => {
    expect(await resolveListingRegion(prisma, { id: 'u', region: null }, null, week)).toBeNull()
  })
})

describe('findBusiestRegion', () => {
  const from = new Date('2026-11-11T13:00:00Z')
  const to = new Date('2026-11-18T23:59:59Z')

  it('returns the region with the most events, skipping holding', async () => {
    groupBy.mockResolvedValue([{ regionId: 'r9' }])
    findRegion.mockResolvedValue(busiest)
    expect(await findBusiestRegion(prisma, from, to)).toEqual(busiest)
    const args = groupBy.mock.calls[0]?.[0]
    expect(args.where.region).toEqual({ isActive: true, slug: { not: HOLDING_REGION_SLUG } })
    expect(args.where.startsAt).toEqual({ gte: from, lte: to })
    expect(args.orderBy).toEqual({ _count: { regionId: 'desc' } })
  })

  it('returns null when no region has events', async () => {
    groupBy.mockResolvedValue([])
    expect(await findBusiestRegion(prisma, from, to)).toBeNull()
  })
})
