import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getLocationFromIp } from '../ip-geolocation'

// Mock fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

describe('IP Geolocation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for localhost IP', async () => {
    const result = await getLocationFromIp('127.0.0.1')
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null for IPv6 localhost', async () => {
    const result = await getLocationFromIp('::1')
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null for private network IPs', async () => {
    expect(await getLocationFromIp('192.168.1.1')).toBeNull()
    expect(await getLocationFromIp('10.0.0.1')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null for unknown/empty IP', async () => {
    expect(await getLocationFromIp('unknown')).toBeNull()
    expect(await getLocationFromIp('')).toBeNull()
  })

  it('returns location data for valid public IP', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'success',
          lat: 42.32,
          lon: -72.63,
          city: 'Northampton',
          regionName: 'Massachusetts',
          country: 'United States',
        }),
    })

    const result = await getLocationFromIp('8.8.8.8')

    expect(result).toEqual({
      lat: 42.32,
      lng: -72.63,
      city: 'Northampton',
      region: 'Massachusetts',
      country: 'United States',
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://ip-api.com/json/8.8.8.8?fields=status,lat,lon,city,regionName,country'
    )
  })

  it('returns null when API returns failure status', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'fail',
          message: 'invalid query',
        }),
    })

    const result = await getLocationFromIp('invalid-ip')
    expect(result).toBeNull()
  })

  it('returns null when API request fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    })

    const result = await getLocationFromIp('8.8.8.8')
    expect(result).toBeNull()
  })

  it('returns null when fetch throws an error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const result = await getLocationFromIp('8.8.8.8')
    expect(result).toBeNull()
  })
})
