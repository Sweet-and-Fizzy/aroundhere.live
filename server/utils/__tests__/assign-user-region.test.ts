import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { H3Event } from 'h3'
import type { PrismaClient } from '@prisma/client'
import { assignRegionFromRequest } from '../assign-user-region'
import { findNearestRegion } from '../find-nearest-region'
import { getLocationFromIp } from '../../services/ip-geolocation'

vi.mock('h3', async importOriginal => ({
  ...(await importOriginal<typeof import('h3')>()),
  getRequestIP: vi.fn(() => '8.8.8.8'),
}))
vi.mock('../find-nearest-region', () => ({ findNearestRegion: vi.fn() }))
vi.mock('../../services/ip-geolocation', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/ip-geolocation')>()
  return { ...actual, getLocationFromIp: vi.fn() }
})

const nearest = vi.mocked(findNearestRegion)
const locate = vi.mocked(getLocationFromIp)
const update = vi.fn()
const prisma = { user: { update } } as unknown as PrismaClient
const event = {} as H3Event

beforeEach(() => {
  vi.clearAllMocks()
  locate.mockResolvedValue({ lat: 42.3, lng: -72.6 })
})

describe('assignRegionFromRequest', () => {
  it('leaves a user with a region alone', async () => {
    expect(await assignRegionFromRequest(prisma, event, { id: 'u', regionId: 'r1' })).toBe('r1')
    expect(locate).not.toHaveBeenCalled()
  })

  it('assigns the nearest region within 100 miles', async () => {
    nearest.mockResolvedValue({ region: { id: 'r2' }, distance: 40 } as Awaited<ReturnType<typeof findNearestRegion>>)
    expect(await assignRegionFromRequest(prisma, event, { id: 'u', regionId: null })).toBe('r2')
    expect(update).toHaveBeenCalledWith({ where: { id: 'u' }, data: { regionId: 'r2' } })
  })

  it('does not assign a region over 100 miles away', async () => {
    nearest.mockResolvedValue({ region: { id: 'r2' }, distance: 150 } as Awaited<ReturnType<typeof findNearestRegion>>)
    expect(await assignRegionFromRequest(prisma, event, { id: 'u', regionId: null })).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('returns null instead of throwing when lookup fails', async () => {
    locate.mockRejectedValue(new Error('boom'))
    await expect(assignRegionFromRequest(prisma, event, { id: 'u', regionId: null })).resolves.toBeNull()
  })
})

describe('getLocationFromIp', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('gives the request a timeout', async () => {
    const { getLocationFromIp: real } = await vi.importActual<typeof import('../../services/ip-geolocation')>('../../services/ip-geolocation')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'fail' }) })
    vi.stubGlobal('fetch', fetchMock)
    await real('8.8.8.8')
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('resolves to null when the request fails', async () => {
    const { getLocationFromIp: real } = await vi.importActual<typeof import('../../services/ip-geolocation')>('../../services/ip-geolocation')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    await expect(real('8.8.8.8')).resolves.toBeNull()
  })
})
